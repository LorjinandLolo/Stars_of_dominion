// lib/tactical/tactical-tests.ts
// Test suite for the tactical combat sim (lib/tactical).
// Run with: npx tsx lib/tactical/tactical-tests.ts
//
// Conventions under test (see lib/tactical/sim.ts):
//   - player enters/retreats on the LEFT edge (x <= state.edgeZone), enemy RIGHT
//   - headings in radians, 0 = +x
//   - all order functions mutate BattleState in place
//   - state.outcome is non-null once the battle is over
//
// Tests deliberately reach into BattleState internals (teleporting ships,
// zeroing speed, applying raw damage) to keep every scenario deterministic.

import {
    createBattle,
    update,
    issueMove,
    setTarget,
    orderRetreat,
    fleetWithdraw,
    deployReinforcement,
    useAbility,
    activeDeploymentPoints,
    computeResult,
    inArcAndRange,
    applyDamage,
    normalizeAngle,
    angleDiff,
    type BattleConfig,
} from './sim';
import { SHIP_CLASSES, classForCompositionKey } from './ship-defs';
import {
    fleetsToReserves,
    fleetsStrength,
    defaultEnemyPlan,
    buildResultPayload,
} from './fleet-adapter';
import type {
    BattleResult,
    BattleState,
    ReserveEntry,
    ShipClassId,
    TacticalShip,
    TacticalSide,
    WeaponDef,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const deg = (d: number): number => (d * Math.PI) / 180;

/** Shorthand reserve entry; sourceKey defaults to the class id. */
function R(classId: ShipClassId, count: number, sourceKey?: string): ReserveEntry {
    return { classId, sourceKey: sourceKey ?? classId, count };
}

/** Fresh battle; the enemy defaults to a single corvette we can pin out of the way. */
function freshBattle(
    playerReserves: ReserveEntry[],
    enemyReserves?: ReserveEntry[],
    extra?: Partial<BattleConfig>
): BattleState {
    return createBattle({
        playerReserves,
        enemyReserves: enemyReserves ?? [R('corvette', 1)],
        ...(extra ?? {}),
    });
}

/**
 * Teleport every live enemy ship to the far corner with zero speed and no
 * orders. Called before each update() so the enemy AI can never interfere with
 * player-side movement/shield/reinforcement scenarios (max drift per 0.1s
 * update is well under a unit, and every weapon stays far out of range).
 */
function pinEnemy(state: BattleState): void {
    for (const sh of state.ships) {
        if (sh.side !== 'enemy' || sh.status === 'destroyed' || sh.status === 'withdrawn') continue;
        sh.x = state.width - 30;
        sh.y = 40;
        sh.speed = 0;
        sh.moveOrder = null;
        sh.targetId = null;
    }
}

/** Advance the sim in 0.1s slices with the enemy pinned in the far corner. */
function runPinned(state: BattleState, seconds: number): void {
    const iters = Math.round(seconds / 0.1);
    for (let i = 0; i < iters; i++) {
        pinEnemy(state);
        update(state, 0.1);
    }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Live (not destroyed/withdrawn) ships of a side, optionally filtered by class. */
function fielded(state: BattleState, sideId: TacticalSide, classId?: ShipClassId): TacticalShip[] {
    return state.ships.filter(sh =>
        sh.side === sideId &&
        sh.status !== 'destroyed' && sh.status !== 'withdrawn' &&
        (classId === undefined || sh.classId === classId));
}

function reserveCount(state: BattleState, sideId: TacticalSide, classId: ShipClassId): number {
    const st = sideId === 'player' ? state.player : state.enemy;
    return st.reserves.filter(r => r.classId === classId).reduce((sum, r) => sum + r.count, 0);
}

/** Hand-built ship for pure-math weapon arc tests (never inserted into a state). */
function mkShip(sideId: TacticalSide, classId: ShipClassId, x: number, y: number, heading: number): TacticalShip {
    const def = SHIP_CLASSES[classId];
    return {
        id: `test-${sideId}-${classId}-${x}-${y}`,
        side: sideId,
        classId,
        sourceKey: classId,
        x,
        y,
        heading,
        speed: 0,
        hull: def.maxHull,
        shield: def.maxShield,
        lastHitAt: -999,
        weaponCooldowns: def.weapons.map(() => 0),
        abilityCooldown: 0,
        abilityActiveUntil: 0,
        moveOrder: null,
        targetId: null,
        status: 'active',
        arrivalAt: 0,
    };
}

function weaponOf(classId: ShipClassId, weaponId: string): WeaponDef {
    const w = SHIP_CLASSES[classId].weapons.find(wd => wd.id === weaponId);
    if (!w) throw new Error(`FAIL: weapon ${weaponId} not found on ${classId}`);
    return w;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`  ✓ ${message}`);
}

function suite(name: string, fn: () => void): void {
    console.log(`\n── ${name} ──`);
    try { fn(); console.log(`  PASS`); }
    catch (e) { console.error(`  ${(e as Error).message}`); process.exitCode = 1; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

suite('Angle helpers — normalizeAngle / angleDiff', () => {
    assert(Math.abs(normalizeAngle(3 * Math.PI) - Math.PI) < 1e-9, 'normalizeAngle(3π) wraps to π');
    assert(Math.abs(normalizeAngle(-Math.PI) - Math.PI) < 1e-9, 'normalizeAngle(-π) wraps to π (range is (-π, π])');
    assert(normalizeAngle(0.5) === 0.5, 'in-range angle unchanged');
    assert(Math.abs(angleDiff(0.75 * Math.PI, -0.75 * Math.PI) - Math.PI / 2) < 1e-9, 'angleDiff takes the short way across the seam (+π/2)');
    assert(Math.abs(angleDiff(-0.75 * Math.PI, 0.75 * Math.PI) + Math.PI / 2) < 1e-9, 'angleDiff signed the other way (-π/2)');
    assert(angleDiff(1.234, 1.234) === 0, 'angleDiff of identical angles is 0');
});

suite('Deployment — capacity cap, biggest-first, leftovers in reserve', () => {
    const big = (): ReserveEntry[] => [R('battleship', 3), R('cruiser', 3), R('destroyer', 3), R('corvette', 10)];
    const state = freshBattle(big(), big());

    for (const s of ['player', 'enemy'] as const) {
        const pts = activeDeploymentPoints(state, s);
        assert(pts <= 12, `${s}: active deployment points (${pts}) <= capacity 12`);
        assert(pts === 12, `${s}: capacity filled exactly (7+4+1)`);
        assert(fielded(state, s, 'battleship').length === 1, `${s}: 1 battleship fielded first (biggest class)`);
        assert(fielded(state, s, 'cruiser').length === 1, `${s}: 1 cruiser fielded next`);
        assert(fielded(state, s, 'destroyer').length === 0, `${s}: no destroyer fielded (3 pts would exceed capacity)`);
        assert(fielded(state, s, 'corvette').length === 1, `${s}: 1 corvette tops off the last point`);
        assert(reserveCount(state, s, 'battleship') === 2, `${s}: 2 battleships left in reserve`);
        assert(reserveCount(state, s, 'cruiser') === 2, `${s}: 2 cruisers left in reserve`);
        assert(reserveCount(state, s, 'destroyer') === 3, `${s}: all 3 destroyers left in reserve`);
        assert(reserveCount(state, s, 'corvette') === 9, `${s}: 9 corvettes left in reserve`);
        assert(fielded(state, s).every(sh => sh.status === 'active'), `${s}: initial deployment spawns active (no warp-in delay)`);
    }
});

suite('Movement & inertia — corvette out-accelerates a battleship; both arrive', () => {
    const state = freshBattle([R('corvette', 1), R('battleship', 1)]);
    const cor = fielded(state, 'player', 'corvette')[0];
    const bs = fielded(state, 'player', 'battleship')[0];
    assert(!!cor && !!bs, 'corvette and battleship fielded on the player side');

    const corStart = { x: cor.x, y: cor.y };
    const bsStart = { x: bs.x, y: bs.y };
    const corDest = { x: cor.x + 400, y: cor.y };
    const bsDest = { x: bs.x + 400, y: bs.y };
    issueMove(state, [cor.id], corDest.x, corDest.y);
    issueMove(state, [bs.id], bsDest.x, bsDest.y);
    assert(cor.moveOrder !== null && bs.moveOrder !== null, 'move orders accepted');

    runPinned(state, 3);
    const corTravelled = dist(cor, corStart);
    const bsTravelled = dist(bs, bsStart);
    assert(corTravelled > bsTravelled + 50,
        `after 3s the corvette has travelled further (${corTravelled.toFixed(0)} vs ${bsTravelled.toFixed(0)} units)`);

    let iters = 0;
    while (iters < 1500 && (cor.moveOrder !== null || bs.moveOrder !== null)) {
        pinEnemy(state);
        update(state, 0.1);
        iters++;
    }
    assert(iters < 1500, `both move orders completed within a bounded number of updates (${iters})`);
    assert(dist(cor, corDest) < 20, `corvette arrived (${dist(cor, corDest).toFixed(1)} < 20 units from destination)`);
    assert(dist(bs, bsDest) < 20, `battleship arrived (${dist(bs, bsDest).toFixed(1)} < 20 units from destination)`);
});

suite('Facing orders — heading converges to the requested face after arrival', () => {
    const state = freshBattle([R('corvette', 1)]);
    const cor = fielded(state, 'player', 'corvette')[0];
    const dest = { x: cor.x + 250, y: cor.y };
    issueMove(state, [cor.id], dest.x, dest.y, Math.PI / 2);

    let iters = 0;
    while (iters < 600 && cor.moveOrder !== null) {
        pinEnemy(state);
        update(state, 0.1);
        iters++;
    }
    assert(cor.moveOrder === null, `move+face order completed within ${iters} updates`);
    assert(dist(cor, dest) < 20, 'ship arrived at the destination');
    const off = Math.abs(angleDiff(cor.heading, Math.PI / 2));
    assert(off < 0.1, `heading converged to π/2 (off by ${off.toFixed(3)} rad)`);
});

suite('Arc gating — inArcAndRange pure math', () => {
    const port = weaponOf('cruiser', 'port-battery');
    const starboard = weaponOf('cruiser', 'starboard-battery');
    const lance = weaponOf('battleship', 'spinal-lance');
    const turret = weaponOf('corvette', 'light-turret');

    const cruiser = mkShip('player', 'cruiser', 0, 0, 0);
    assert(!inArcAndRange(cruiser, port, mkShip('enemy', 'corvette', 250, 0, 0)),
        'port battery (mount -π/2, arc 100°) does NOT bear on a target dead ahead at 250');
    assert(inArcAndRange(cruiser, port, mkShip('enemy', 'corvette', 0, -250, 0)),
        'port battery DOES bear on a target 250 units to port');
    assert(!inArcAndRange(cruiser, port, mkShip('enemy', 'corvette', 0, 250, 0)),
        'port battery does not bear to starboard');
    assert(inArcAndRange(cruiser, starboard, mkShip('enemy', 'corvette', 0, 250, 0)),
        'starboard battery bears on the starboard target');
    assert(!inArcAndRange(cruiser, port, mkShip('enemy', 'corvette', 0, -350, 0)),
        'port battery out of range at 350 (range 300) even in arc');

    const turned = mkShip('player', 'cruiser', 0, 0, Math.PI / 2);
    assert(inArcAndRange(turned, port, mkShip('enemy', 'corvette', 250, 0, 0)),
        'mount rotates with heading: heading +π/2 swings the port battery onto +x');

    const bs = mkShip('player', 'battleship', 0, 0, 0);
    const at = (bearingDeg: number, d: number): TacticalShip =>
        mkShip('enemy', 'corvette', Math.cos(deg(bearingDeg)) * d, Math.sin(deg(bearingDeg)) * d, 0);
    assert(inArcAndRange(bs, lance, at(0, 400)), 'spinal lance (arc 14°) bears dead ahead at 400');
    assert(inArcAndRange(bs, lance, at(5, 400)), 'spinal lance bears at +5° (inside ±7°)');
    assert(inArcAndRange(bs, lance, at(-5, 400)), 'spinal lance bears at -5°');
    assert(!inArcAndRange(bs, lance, at(10, 400)), 'spinal lance blocked at +10° (outside ±7°)');
    assert(!inArcAndRange(bs, lance, at(-10, 400)), 'spinal lance blocked at -10°');
    assert(!inArcAndRange(bs, lance, at(0, 520)), 'spinal lance out of range at 520 (range 500)');

    const cv = mkShip('player', 'corvette', 0, 0, 0);
    assert(inArcAndRange(cv, turret, mkShip('enemy', 'corvette', -150, 0, 0)), '360° turret bears dead astern within range');
    assert(inArcAndRange(cv, turret, mkShip('enemy', 'corvette', 0, 170, 0)), '360° turret bears abeam within range');
    assert(!inArcAndRange(cv, turret, mkShip('enemy', 'corvette', -200, 0, 0)), '360° turret still range-gated (200 > 180)');
});

suite('Shields before hull + regen after delay', () => {
    const state = freshBattle([R('corvette', 1)]);
    const cor = fielded(state, 'player', 'corvette')[0];
    assert(cor.shield === 40 && cor.hull === 60, 'corvette starts at full shield (40) and hull (60)');

    applyDamage(state, cor, 10);
    assert(cor.shield === 30, 'light hit absorbed entirely by shield (40 → 30)');
    assert(cor.hull === 60, 'hull untouched while the shield holds');

    applyDamage(state, cor, 50);
    assert(cor.shield === 0, 'heavy hit strips the remaining shield');
    assert(cor.hull === 40, 'overflow bleeds into hull (60 → 40)');

    runPinned(state, 3.5);
    assert(cor.shield === 0, 'no regen before shieldRegenDelay elapses (t=3.5s < 4s)');

    runPinned(state, 1);
    const s1 = cor.shield;
    assert(s1 > 0, `regen kicks in after the delay (shield ${s1.toFixed(1)})`);

    runPinned(state, 1);
    const s2 = cor.shield;
    assert(s2 > s1, `shield strictly increasing while unhit (${s1.toFixed(1)} → ${s2.toFixed(1)})`);

    runPinned(state, 1);
    assert(cor.shield > s2, 'still climbing a second later');

    runPinned(state, 6);
    assert(cor.shield === 40, 'shield caps at maxShield');
    assert(cor.hull === 40, 'regen never touches hull');
});

suite('Torpedoes — spawn, pursue, hit', () => {
    const state = freshBattle([R('destroyer', 1)], [R('cruiser', 1)]);
    const pd = fielded(state, 'player', 'destroyer')[0];
    const ec = fielded(state, 'enemy', 'cruiser')[0];

    // Park the enemy cruiser 300 units dead ahead of the destroyer: inside the
    // torpedo launcher's 420 range and 40° forward arc.
    ec.x = pd.x + 300;
    ec.y = pd.y;
    ec.speed = 0;
    const total0 = ec.hull + ec.shield;
    setTarget(state, [pd.id], ec.id);

    update(state, 0.1);
    assert(state.torpedoes.length >= 1, 'torpedo spawned once a target sits in arc+range');
    const torp = state.torpedoes[0];
    assert(torp.side === 'player' && torp.targetId === ec.id, 'torpedo belongs to the player and tracks the cruiser');

    const d0 = dist(torp, ec);
    for (let i = 0; i < 5; i++) update(state, 0.1);
    const inFlight = state.torpedoes.find(t => t.id === torp.id);
    assert(inFlight !== undefined, 'torpedo still in flight after 0.5s');
    const d1 = dist(inFlight!, ec);
    assert(d1 < d0, `torpedo closes on its target (${d0.toFixed(0)} → ${d1.toFixed(0)} units)`);

    let iters = 0;
    while (iters < 300 && state.torpedoes.some(t => t.id === torp.id)) {
        update(state, 0.1);
        iters++;
    }
    assert(!state.torpedoes.some(t => t.id === torp.id), `torpedo resolved (hit) within ${iters} updates`);
    const totalNow = ec.hull + ec.shield;
    assert(totalNow < total0 - 40,
        `cruiser hull+shield dropped by ~torpedo (45) + gunfire (${total0.toFixed(0)} → ${totalNow.toFixed(0)})`);
});

suite('Ability — destroyer torpedo salvo + cooldown gating', () => {
    const state = freshBattle([R('destroyer', 1)], [R('cruiser', 1)]);
    const pd = fielded(state, 'player', 'destroyer')[0];
    const ec = fielded(state, 'enemy', 'cruiser')[0];
    ec.x = pd.x + 300;
    ec.y = pd.y;

    assert(state.torpedoes.length === 0, 'no torpedoes before the ability fires');
    assert(useAbility(state, pd.id) === true, 'torpedo salvo activates with a target in range');
    assert(state.torpedoes.length === 3, 'salvo spawns exactly 3 torpedoes');
    assert(state.torpedoes.every(t => t.targetId === ec.id), 'all salvo torpedoes track the target');
    assert(pd.abilityCooldown > 0, 'ability goes on cooldown');
    assert(useAbility(state, pd.id) === false, 'ability rejected while on cooldown');
    assert(useAbility(state, 'no-such-ship') === false, 'unknown ship id rejected');
});

suite('Reinforcements — capacity gate, freed slots, warp-in delay', () => {
    const state = freshBattle([R('battleship', 2), R('corvette', 10)]);
    assert(activeDeploymentPoints(state, 'player') === 12, 'initial deployment fills capacity (7 + 5×1)');
    assert(fielded(state, 'player', 'battleship').length === 1, '1 battleship fielded');
    assert(fielded(state, 'player', 'corvette').length === 5, '5 corvettes fielded');
    assert(reserveCount(state, 'player', 'battleship') === 1 && reserveCount(state, 'player', 'corvette') === 5,
        'leftovers kept in reserve (1 battleship, 5 corvettes)');

    assert(deployReinforcement(state, 'player', 'corvette') === null, 'corvette deploy rejected at full capacity');
    assert(deployReinforcement(state, 'player', 'battleship') === null, 'battleship deploy rejected at full capacity');

    const victim = fielded(state, 'player', 'corvette')[0];
    applyDamage(state, victim, 10_000);
    assert(victim.status === 'destroyed' && victim.hull === 0, 'fielded corvette destroyed via applyDamage');
    assert(activeDeploymentPoints(state, 'player') === 11, 'kill frees its deployment point (11/12)');
    assert(deployReinforcement(state, 'player', 'battleship') === null, 'battleship still does not fit (11+7 > 12)');

    const reinf = deployReinforcement(state, 'player', 'corvette');
    assert(reinf !== null, 'corvette reinforcement deploys into the freed point');
    assert(reinf!.status === 'arriving', 'reinforcement enters as arriving (warp-in)');
    assert(reserveCount(state, 'player', 'corvette') === 4, 'reserve count decremented');
    assert(activeDeploymentPoints(state, 'player') === 12, 'arriving ship already counts against capacity');

    runPinned(state, 3.5);
    assert(reinf!.status === 'arriving', 'still warping in before ~4s');
    runPinned(state, 1);
    assert(reinf!.status === 'active', 'reinforcement active after ~4s of updates');
});

suite('Retreat & fleet withdrawal', () => {
    const state = freshBattle([R('corvette', 2)]);
    const corvettes = fielded(state, 'player', 'corvette');
    assert(corvettes.length === 2, 'two player corvettes fielded');
    const [c1, c2] = corvettes;

    orderRetreat(state, [c1.id]);
    assert(c1.status === 'retreating', 'retreat order flips status to retreating');
    let iters = 0;
    while (iters < 150 && c1.status !== 'withdrawn') {
        pinEnemy(state);
        update(state, 0.1);
        iters++;
    }
    assert(c1.status === 'withdrawn', `ship near its own (left) edge withdraws quickly (${iters} updates)`);
    assert(c2.status === 'active', 'the other ship keeps fighting');

    fleetWithdraw(state, 'player');
    assert(state.player.withdrawing === true, 'fleet withdrawal flagged on the side state');
    assert(c2.status === 'retreating', 'remaining ship ordered to the retreat zone');

    iters = 0;
    while (iters < 300 && !state.outcome) {
        pinEnemy(state);
        update(state, 0.1);
        iters++;
    }
    assert(state.outcome !== null, 'battle resolves once the whole fleet is off the field');
    assert(state.outcome!.winner === 'enemy', 'enemy wins when the player withdraws with enemies still fielded');
    assert(state.outcome!.reason.toLowerCase().includes('withdraw'), `reason mentions withdrawal ("${state.outcome!.reason}")`);

    const r = computeResult(state);
    assert(r.player.composition['corvette'] === 2, 'both withdrawn ships counted as survivors');
    assert(r.player.destroyed === false, 'player fleet not marked destroyed');
    assert(r.player.strength > 0.99, 'unhit survivors report full strength');
    assert(r.enemy.composition['corvette'] === 1, 'enemy survivor mapped back too');
});

suite('Outcome & result mapping — sourceKeys survive the round trip', () => {
    const reserves = fleetsToReserves([
        { id: 'sf-1', factionId: 'me', composition: { interceptor: 2, carrier: 1 } },
    ]);
    // retreatBelowFleetStrength 0: otherwise the enemy AI flags its already-dead
    // fleet as "withdrawing" before checkOutcome runs, changing the reason text.
    const state = createBattle({
        playerReserves: reserves,
        enemyReserves: [R('corvette', 1)],
        enemyPlan: { posture: 'balanced', retreatBelowFleetStrength: 0 },
    });

    const carrierShip = state.ships.find(sh => sh.sourceKey === 'carrier');
    assert(carrierShip !== undefined && carrierShip!.classId === 'cruiser', 'carrier fielded as the cruiser tactical class');
    assert(state.ships.filter(sh => sh.sourceKey === 'interceptor' && sh.classId === 'corvette').length === 2,
        'interceptors fielded as corvettes, sourceKey preserved');

    const foe = fielded(state, 'enemy', 'corvette')[0];
    applyDamage(state, foe, 99_999);
    assert(foe.status === 'destroyed', 'last enemy ship destroyed (enemy reserves already empty)');

    update(state, 0.1);
    assert(state.outcome !== null && state.outcome!.winner === 'player', 'outcome: player wins once the enemy is wiped');
    assert(state.outcome!.reason.toLowerCase().includes('destroyed'), 'reason reports destruction, not withdrawal');

    const r = computeResult(state);
    assert(r.winner === 'player', 'computeResult mirrors the outcome winner');
    assert(r.player.composition['interceptor'] === 2, 'survivors map back to ORIGINAL key "interceptor"');
    assert(r.player.composition['carrier'] === 1, 'survivors map back to ORIGINAL key "carrier"');
    assert(r.player.strength > 0 && r.player.strength <= 1, 'player strength in (0, 1]');
    assert(Math.abs(r.player.strength - 1) < 1e-9, 'undamaged survivors → strength 1');
    assert(r.player.destroyed === false, 'player destroyed flag false');
    assert(r.enemy.destroyed === true, 'enemy destroyed flag true');
    assert(Object.keys(r.enemy.composition).length === 0, 'no enemy survivors in the composition');
    assert(r.enemy.strength === 0, 'enemy strength 0 with no survivors');
    assert(r.durationSeconds > 0, 'duration recorded');
});

suite('fleetsToReserves — edge cases', () => {
    const noComp = fleetsToReserves([{ id: 'f1', factionId: 'x', basePower: 100 }]);
    assert(noComp.length === 1 && noComp[0].classId === 'corvette' && noComp[0].sourceKey === 'interceptor',
        'missing composition synthesizes interceptor-keyed corvettes');
    assert(noComp[0].count === 4, 'basePower 100 → 4 corvettes (power/25)');

    const nullComp = fleetsToReserves([{ id: 'f2', factionId: 'x', composition: null, basePower: 25, strength: 1 }]);
    assert(nullComp.length === 1 && nullComp[0].count === 1, 'null composition synthesizes from basePower × strength');

    const weak = fleetsToReserves([{ id: 'f2b', factionId: 'x', composition: null, basePower: 100, strength: 0.5 }]);
    assert(weak[0].count === 2, 'fleet strength scales the synthesized count (100 × 0.5 → 2)');

    const powerless = fleetsToReserves([{ id: 'f2c', factionId: 'x' }]);
    assert(powerless.length === 1 && powerless[0].count === 1, 'zero basePower still fields at least 1 corvette');

    const zeroed = fleetsToReserves([{ id: 'f3', factionId: 'x', composition: { interceptor: 0, destroyer: -3, cruiser: 2 } }]);
    assert(zeroed.length === 1 && zeroed[0].classId === 'cruiser' && zeroed[0].count === 2,
        'zero and negative counts skipped; only the cruiser entry remains');

    const allZero = fleetsToReserves([{ id: 'f4', factionId: 'x', composition: { interceptor: 0 }, basePower: 50 }]);
    assert(allZero.length === 1 && allZero[0].sourceKey === 'interceptor' && allZero[0].count === 2,
        'all-zero composition falls back to basePower synthesis');

    const frac = fleetsToReserves([{ id: 'f5', factionId: 'x', composition: { interceptor: 2.9 } }]);
    assert(frac[0].count === 2, 'fractional counts floored');

    const merged = fleetsToReserves([
        { id: 'f6', factionId: 'x', composition: { interceptor: 2 } },
        { id: 'f7', factionId: 'x', composition: { interceptor: 3, destroyer: 1 } },
    ]);
    const ic = merged.find(r => r.sourceKey === 'interceptor');
    const dc = merged.find(r => r.sourceKey === 'destroyer');
    assert(merged.length === 2 && ic !== undefined && ic!.count === 5, 'interceptor counts summed across fleets (2+3)');
    assert(dc !== undefined && dc!.count === 1 && dc!.classId === 'destroyer', 'destroyer entry carried through the merge');

    assert(classForCompositionKey('carrier') === 'cruiser', 'carrier key → cruiser class');
    assert(classForCompositionKey('dreadnought') === 'battleship', 'dreadnought key → battleship class');
    assert(classForCompositionKey('totally-unknown') === 'corvette', 'unknown key falls back to corvette');
});

suite('Fleet adapter — strength clamps, default plan, result payload', () => {
    assert(fleetsStrength([]) === 1, 'no fleets → strength 1');
    assert(fleetsStrength([{ id: 'a', factionId: 'x', strength: 0.1 }]) === 0.3, 'strength clamped up to 0.3');
    assert(fleetsStrength([{ id: 'a', factionId: 'x', strength: 2 }]) === 1, 'strength clamped down to 1');
    assert(Math.abs(fleetsStrength([
        { id: 'a', factionId: 'x', strength: 0.4 },
        { id: 'b', factionId: 'x', strength: 0.8 },
    ]) - 0.6) < 1e-9, 'strength averaged across fleets');

    const plan = defaultEnemyPlan();
    assert(plan.posture === 'balanced' && plan.retreatBelowFleetStrength === 0.15, 'default enemy plan: balanced, retreat below 0.15');

    const br: BattleResult = {
        winner: 'player',
        reason: 'test battle',
        player: { composition: { interceptor: 2 }, strength: 0.8, destroyed: false },
        enemy: { composition: {}, strength: 0, destroyed: true },
        durationSeconds: 12.6,
    };
    const payload = buildResultPayload('sys-9', ['pf-1'], ['ef-1'], 'fac-npc', br);
    assert(payload.systemId === 'sys-9' && payload.enemyFactionId === 'fac-npc', 'payload carries system + faction ids');
    assert(payload.playerFleetIds[0] === 'pf-1' && payload.enemyFleetIds[0] === 'ef-1', 'payload carries fleet ids');
    assert(payload.winner === 'player' && payload.playerResult.strength === 0.8 && payload.enemyResult.destroyed === true,
        'payload mirrors the battle result');
    assert(payload.durationSeconds === 13, 'duration rounded to whole seconds');
});

suite('Balance smoke — enemy AI vs an idle player fleet resolves', () => {
    const enemyRes = fleetsToReserves([
        { id: 'raiders', factionId: 'npc', composition: { interceptor: 6, destroyer: 4, cruiser: 2 } },
    ]);
    const playerRes = fleetsToReserves([
        { id: 'defence', factionId: 'me', composition: { interceptor: 4, destroyer: 2, cruiser: 1 } },
    ]);
    const state = createBattle({
        playerReserves: playerRes,
        enemyReserves: enemyRes,
        enemyPlan: defaultEnemyPlan(),
    });

    // Player ships get NO orders — auto-fire only. Enemy AI plays.
    let guard = 0;
    while (!state.outcome && guard < 5000) {
        update(state, 0.1);
        guard++;
    }
    assert(state.outcome !== null,
        `outcome reached, no infinite stalemate (winner: ${state.outcome?.winner}, t=${state.time.toFixed(0)}s, ${guard} updates)`);
    assert(state.time <= state.timeLimit + 1, 'resolved at or before the engagement time limit');

    const r = computeResult(state);
    assert(r.player.strength >= 0 && r.player.strength <= 1, 'player result strength within [0,1]');
    assert(r.enemy.strength >= 0 && r.enemy.strength <= 1, 'enemy result strength within [0,1]');
    assert(r.durationSeconds > 0, 'duration recorded');
});

// ─── Regression suites (adversarial-review fixes) ─────────────────────────────

suite('Withdrawal preserves undeployed reserves as survivors', () => {
    // 20 corvettes: capacity 12 fields 12, 8 stay in reserve.
    const state = freshBattle([R('corvette', 20, 'interceptor')]);
    assert(reserveCount(state, 'player', 'corvette') === 8, '8 corvettes held in reserve');

    fleetWithdraw(state, 'player');
    assert(reserveCount(state, 'player', 'corvette') === 8, 'reserves NOT erased by fleet withdrawal');

    // Run until every fielded ship has left; the battle must still conclude
    // even though the withdrawing side keeps its reserve list.
    let guard = 0;
    while (!state.outcome && guard < 4000) { pinEnemy(state); update(state, 0.1); guard++; }
    assert(state.outcome !== null, 'battle concluded despite withdrawing side holding reserves');
    assert(state.outcome!.winner === 'enemy', 'withdrawing side loses the field');

    const r = computeResult(state);
    assert((r.player.composition['interceptor'] ?? 0) === 20,
        'all 20 ships survive strategically (12 withdrawn + 8 reserve)');
    assert(!r.player.destroyed, 'withdrawing side is not marked destroyed');
});

suite('Arriving reinforcements cannot be pulled out of warp early', () => {
    const state = freshBattle([R('corvette', 14)]);
    // Free a slot, then deploy a reinforcement (status 'arriving' for ~4s).
    const victim = fielded(state, 'player', 'corvette')[0];
    applyDamage(state, victim, 10_000);
    const ship = deployReinforcement(state, 'player', 'corvette');
    assert(!!ship && ship!.status === 'arriving', 'reinforcement enters warp');

    orderRetreat(state, [ship!.id]);
    assert(ship!.status === 'arriving', 'retreat order ignored while in warp');

    // Fleet withdrawal during warp-in: ship completes the jump straight into
    // the retreat run, never becoming an active combatant.
    fleetWithdraw(state, 'player');
    runPinned(state, 5);
    assert(ship!.status === 'retreating' || ship!.status === 'withdrawn',
        `warp-in during withdrawal drops into retreat (got ${ship!.status})`);
});

suite('Reinforcements and reserves inherit the strategic strength multiplier', () => {
    const state = freshBattle([R('corvette', 14)], undefined, { playerStrength: 0.5 });
    const initial = fielded(state, 'player', 'corvette')[0];
    assert(Math.abs(initial.hull - SHIP_CLASSES.corvette.maxHull * 0.5) < 1e-6,
        'initial wave spawns at 50% hull');

    const victim = fielded(state, 'player', 'corvette')[0];
    applyDamage(state, victim, 10_000);
    const reinforcement = deployReinforcement(state, 'player', 'corvette');
    assert(!!reinforcement, 'reinforcement deployed');
    assert(Math.abs(reinforcement!.hull - SHIP_CLASSES.corvette.maxHull * 0.5) < 1e-6,
        'reinforcement also spawns at 50% hull (no free repair)');

    const r = computeResult(state);
    assert(r.player.strength <= 0.51, `result strength stays ≤ entry strength (${r.player.strength.toFixed(2)})`);
});

suite('deployReinforcement disambiguates same-class reserves by sourceKey', () => {
    // interceptor + bomber both map to the corvette class.
    const state = freshBattle([R('corvette', 13, 'interceptor'), R('corvette', 3, 'bomber')]);
    const victim = fielded(state, 'player', 'corvette')[0];
    applyDamage(state, victim, 10_000);

    const before = state.player.reserves.find(r => r.sourceKey === 'bomber')!.count;
    const ship = deployReinforcement(state, 'player', 'corvette', 'bomber');
    assert(!!ship && ship!.sourceKey === 'bomber', 'bomber-sourced corvette fielded on request');
    const after = state.player.reserves.find(r => r.sourceKey === 'bomber')?.count ?? 0;
    assert(after === before - 1, 'the BOMBER reserve row was decremented, not the interceptor row');
});

console.log('\n✅ All tests completed.\n');
