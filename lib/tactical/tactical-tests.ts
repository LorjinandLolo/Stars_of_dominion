// lib/tactical/tactical-tests.ts
// Test suite for the tactical combat sim V2 (lib/tactical).
// Run with: npx tsx lib/tactical/tactical-tests.ts
//
// Conventions under test (see lib/tactical/sim.ts):
//   - player enters/retreats on the LEFT edge (x <= state.edgeZone), enemy RIGHT
//   - headings in radians, 0 = +x; +y is STARBOARD of a ship heading 0
//   - shields are per-facing tuples [fore, starboard, aft, port], each capped
//     at maxShield/4; armour is directional (fore/side/aft)
//   - all order functions mutate BattleState in place
//   - state.outcome is non-null once the battle is over
//
// Tests deliberately reach into BattleState internals (teleporting ships,
// zeroing speed/shields, applying raw damage, injecting squadrons) to keep
// every scenario deterministic. The only Math.random call site in the sim is
// the called-shot miss roll inside tickWeapons; suites exercising subsystem
// damage go through applyDamage directly to stay deterministic.

import {
    createBattle,
    update,
    issueMove,
    issueFormationMove,
    setTarget,
    setTargetSubsystem,
    orderRetreat,
    fleetWithdraw,
    deployReinforcement,
    useAbility,
    setSquadronOrder,
    useCommandAbility,
    activeDeploymentPoints,
    computeResult,
    inArcAndRange,
    applyDamage,
    totalShield,
    facingIndexForImpact,
    hasLineOfSight,
    insideHazard,
    normalizeAngle,
    angleDiff,
    type BattleConfig,
} from './sim';
import { SHIP_CLASSES, SQUADRON_DEFS, freshSubsystems, classForCompositionKey } from './ship-defs';
import {
    fleetsToReserves,
    fleetsStrength,
    defaultEnemyPlan,
    buildResultPayload,
} from './fleet-adapter';
import {
    FACING_FORE,
    FACING_STARBOARD,
    FACING_AFT,
    FACING_PORT,
} from './types';
import type {
    BattleResult,
    BattleState,
    ReserveEntry,
    ShipClassId,
    Squadron,
    SquadronType,
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

/**
 * Advance the sim while holding specific ships at fixed spots with orders
 * cleared (enemy AI re-issues orders every 0.5s; the re-park each 0.1s bounds
 * drift below a unit). Used to park hostiles at exact ranges near hazards.
 */
function runHolding(
    state: BattleState,
    seconds: number,
    holds: Array<{ ship: TacticalShip; x: number; y: number }>
): void {
    const iters = Math.round(seconds / 0.1);
    for (let i = 0; i < iters; i++) {
        for (const h of holds) {
            if (h.ship.status === 'destroyed' || h.ship.status === 'withdrawn') continue;
            h.ship.x = h.x;
            h.ship.y = h.y;
            h.ship.speed = 0;
            h.ship.moveOrder = null;
            h.ship.targetId = null;
        }
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

/** Hand-built V2 ship for pure-math weapon arc tests (never inserted into a state). */
function mkShip(sideId: TacticalSide, classId: ShipClassId, x: number, y: number, heading: number): TacticalShip {
    const def = SHIP_CLASSES[classId];
    const facing = def.maxShield / 4;
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
        shields: [facing, facing, facing, facing],
        lastHitAt: -999,
        weaponCooldowns: def.weapons.map(() => 0),
        abilityCooldown: 0,
        abilityActiveUntil: 0,
        moveOrder: null,
        targetId: null,
        targetSubsystem: null,
        subsystems: def.hasSubsystems ? freshSubsystems() : undefined,
        hangarCooldowns: def.hangar ? def.hangar.squadrons.map(() => 0) : undefined,
        status: 'active',
        arrivalAt: 0,
    };
}

function weaponOf(classId: ShipClassId, weaponId: string): WeaponDef {
    const w = SHIP_CLASSES[classId].weapons.find(wd => wd.id === weaponId);
    if (!w) throw new Error(`FAIL: weapon ${weaponId} not found on ${classId}`);
    return w;
}

/** First live squadron of a side/type (craft > 0). */
function liveSquadron(state: BattleState, sideId: TacticalSide, type: SquadronType): Squadron | undefined {
    return state.squadrons.find(q => q.side === sideId && q.type === type && q.craft > 0);
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

suite('Shields before hull + per-facing regen', () => {
    const state = freshBattle([R('corvette', 1)]);
    const cor = fielded(state, 'player', 'corvette')[0];
    const cap = SHIP_CLASSES.corvette.maxShield / 4; // 10 per facing
    assert(totalShield(cor) === 40 && cor.hull === 60, 'corvette starts at full shield (40 total) and hull (60)');
    assert(cor.shields.every(f => f === cap), 'shields split evenly across the 4 facings at spawn (10 each)');

    applyDamage(state, cor, 6); // no source → bow hit
    assert(cor.shields[FACING_FORE] === cap - 6, 'light bow hit absorbed entirely by the FORE facing (10 → 4)');
    assert(totalShield(cor) === 34 && cor.hull === 60, 'hull untouched while the facing holds');

    applyDamage(state, cor, 6, { sourceX: cor.x - 200, sourceY: cor.y }); // from astern
    assert(cor.shields[FACING_AFT] === cap - 6, 'hit from astern drains the AFT facing (10 → 4)');
    assert(cor.shields[FACING_STARBOARD] === cap && cor.shields[FACING_PORT] === cap,
        'unhit facings untouched (starboard/port still 10)');
    assert(totalShield(cor) === 28 && cor.hull === 60, 'hull still untouched');

    applyDamage(state, cor, 14); // fore has 4 left → 10 overflow through fore armour 0.1
    assert(cor.shields[FACING_FORE] === 0, 'heavy hit strips the remaining FORE facing');
    assert(Math.abs(cor.hull - 51) < 1e-9, 'overflow bleeds into hull through fore armour (60 → 51)');

    runPinned(state, 3.5);
    assert(totalShield(cor) === 24, 'no regen before shieldRegenDelay elapses (t=3.5s < 4s)');
    assert(cor.shields[FACING_FORE] === 0 && cor.shields[FACING_AFT] === 4, 'damaged facings unchanged before the delay');

    runPinned(state, 1);
    const foreGain = cor.shields[FACING_FORE] - 0;
    const aftGain = cor.shields[FACING_AFT] - 4;
    assert(foreGain > 0.5, `regen kicks in after the delay (fore +${foreGain.toFixed(1)})`);
    assert(Math.abs(foreGain - aftGain) < 1e-6,
        `regen spread evenly across the damaged facings (fore +${foreGain.toFixed(2)}, aft +${aftGain.toFixed(2)})`);
    assert(cor.shields[FACING_STARBOARD] === cap && cor.shields[FACING_PORT] === cap,
        'full facings receive no regen (already at the maxShield/4 cap)');
    const s1 = totalShield(cor);

    runPinned(state, 1);
    const s2 = totalShield(cor);
    assert(s2 > s1, `total shield strictly increasing while unhit (${s1.toFixed(1)} → ${s2.toFixed(1)})`);
    assert(cor.shields.every(f => f <= cap + 1e-9), 'no facing ever exceeds the per-facing cap maxShield/4');

    runPinned(state, 3);
    assert(cor.shields.every(f => f === cap), 'every facing regenerates exactly to the per-facing cap (10)');
    assert(totalShield(cor) === 40, 'total shield caps at maxShield');
    assert(Math.abs(cor.hull - 51) < 1e-9, 'regen never touches hull');
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
    const total0 = ec.hull + totalShield(ec);
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
    const totalNow = ec.hull + totalShield(ec);
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
    assert(carrierShip !== undefined && carrierShip!.classId === 'carrier',
        'carrier fielded as the CARRIER tactical class (V2 mapping)');
    assert(carrierShip!.hangarCooldowns !== undefined && carrierShip!.subsystems !== undefined,
        'fielded carrier carries hangar cooldowns and subsystems');
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

    assert(classForCompositionKey('carrier') === 'carrier', 'carrier key → carrier class (V2 mapping)');
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

// ─── V2 suites ────────────────────────────────────────────────────────────────

suite('Directional shields — impact bearing selects the facing', () => {
    const state = freshBattle([R('cruiser', 1)]);
    const cr = fielded(state, 'player', 'cruiser')[0]; // heading 0 (+x)
    const cap = SHIP_CLASSES.cruiser.maxShield / 4;    // 37.5 per facing

    assert(facingIndexForImpact(cr, cr.x + 100, cr.y) === FACING_FORE, 'impact from ahead maps to FORE');
    assert(facingIndexForImpact(cr, cr.x - 100, cr.y) === FACING_AFT, 'impact from astern maps to AFT');
    assert(facingIndexForImpact(cr, cr.x, cr.y + 100) === FACING_STARBOARD, 'impact from +y maps to STARBOARD');
    assert(facingIndexForImpact(cr, cr.x, cr.y - 100) === FACING_PORT, 'impact from -y maps to PORT');

    applyDamage(state, cr, 20, { sourceX: cr.x - 300, sourceY: cr.y });
    assert(cr.shields[FACING_AFT] === cap - 20, 'shot from behind drains ONLY the AFT facing (37.5 → 17.5)');
    assert(cr.shields[FACING_FORE] === cap && cr.shields[FACING_STARBOARD] === cap && cr.shields[FACING_PORT] === cap,
        'fore/starboard/port untouched by the stern hit');
    assert(totalShield(cr) === SHIP_CLASSES.cruiser.maxShield - 20, 'total shield conserved: exactly 20 lost');

    applyDamage(state, cr, 15, { sourceX: cr.x + 300, sourceY: cr.y });
    assert(cr.shields[FACING_FORE] === cap - 15, 'shot from the bow drains ONLY the FORE facing (37.5 → 22.5)');
    assert(cr.shields[FACING_AFT] === cap - 20, 'aft facing keeps its earlier damage');
    assert(totalShield(cr) === SHIP_CLASSES.cruiser.maxShield - 35, 'total shield conserved across both hits');

    applyDamage(state, cr, 10, { sourceX: cr.x, sourceY: cr.y + 300 });
    assert(cr.shields[FACING_STARBOARD] === cap - 10, 'beam from +y drains the STARBOARD facing');

    applyDamage(state, cr, 5); // omitted source defaults to a bow hit
    assert(cr.shields[FACING_FORE] === cap - 20, 'sourceless damage defaults to the FORE facing');
    assert(cr.shields[FACING_PORT] === cap, 'port facing never touched');
    assert(cr.hull === SHIP_CLASSES.cruiser.maxHull, 'hull untouched — every hit fully absorbed by its facing');
});

suite('Directional armour — battleship bow shrugs, stern bleeds', () => {
    const state = freshBattle([R('battleship', 2)], undefined, { playerCapacity: 14 });
    const ships = fielded(state, 'player', 'battleship');
    assert(ships.length === 2, 'two identical battleships fielded (capacity raised to 14)');
    const [bow, stern] = ships;
    const maxHull = SHIP_CLASSES.battleship.maxHull;

    // Strip shields first so the same 100 damage lands on hull from each aspect.
    for (let i = 0; i < 4; i++) { bow.shields[i] = 0; stern.shields[i] = 0; }

    applyDamage(state, bow, 100, { sourceX: bow.x + 300, sourceY: bow.y });     // into the bow
    applyDamage(state, stern, 100, { sourceX: stern.x - 300, sourceY: stern.y }); // into the stern
    const bowLoss = maxHull - bow.hull;
    const sternLoss = maxHull - stern.hull;

    assert(Math.abs(bowLoss - 55) < 1e-6, `bow hit filtered by fore armour 0.45 (hull -${bowLoss.toFixed(1)})`);
    assert(Math.abs(sternLoss - 90) < 1e-6, `stern hit filtered by aft armour 0.1 (hull -${sternLoss.toFixed(1)})`);
    assert(sternLoss > bowLoss, 'same damage costs more hull from the stern than the bow');
});

suite('Shield pierce — bombing runs bypass full shields', () => {
    const state = freshBattle([R('cruiser', 2)]);
    const [a, b] = fielded(state, 'player', 'cruiser');
    const cap = SHIP_CLASSES.cruiser.maxShield / 4;
    const maxHull = SHIP_CLASSES.cruiser.maxHull;

    applyDamage(state, a, 30, { shieldPierce: 0.4 }); // fore facing holds 37.5 ≥ 30
    const pierced = 30 * 0.4 * (1 - SHIP_CLASSES.cruiser.armor.fore);
    assert(a.hull < maxHull, 'part of the damage lands on hull even with a full shield facing');
    assert(Math.abs((maxHull - a.hull) - pierced) < 1e-6,
        `hull loss is the pierce share through armour (${(maxHull - a.hull).toFixed(2)} = 30×0.4×(1-0.22))`);
    assert(Math.abs(a.shields[FACING_FORE] - (cap - 18)) < 1e-9, 'the other 60% still drains the facing (37.5 → 19.5)');

    applyDamage(state, b, 30); // control: no pierce, same hit
    assert(b.hull === maxHull, 'without pierce the full shield facing absorbs everything');
    assert(b.shields[FACING_FORE] === cap - 30, 'control facing drained by the full 30');
});

suite('Subsystems — engines, weapons, shields; called-shot bookkeeping', () => {
    // Engines: called shots degrade the subsystem toward 0; at 0 speed collapses.
    const state = freshBattle([R('cruiser', 2)]);
    const [a, healthy] = fielded(state, 'player', 'cruiser');
    assert(a.subsystems !== undefined && healthy.subsystems !== undefined, 'capital hulls expose subsystems');
    assert(a.subsystems!.engines === 1, 'subsystems start at full integrity');
    for (let i = 0; i < 4; i++) a.shields[i] = 0;

    applyDamage(state, a, 50, { sourceX: a.x - 200, sourceY: a.y, subsystem: 'engines' });
    const e1 = a.subsystems!.engines;
    assert(e1 > 0 && e1 < 1, `called shot degrades engines toward 0 (now ${e1.toFixed(2)})`);
    applyDamage(state, a, 50, { sourceX: a.x - 200, sourceY: a.y, subsystem: 'engines' });
    assert(a.subsystems!.engines === 0, 'second called shot disables the engines (clamped at 0)');
    assert(a.hull > SHIP_CLASSES.cruiser.maxHull * 0.5, 'ship still well above the low-hull slowdown threshold');

    const aStart = { x: a.x, y: a.y };
    const hStart = { x: healthy.x, y: healthy.y };
    issueMove(state, [a.id], a.x + 400, a.y);
    issueMove(state, [healthy.id], healthy.x + 400, healthy.y);
    runPinned(state, 3);
    const aTravelled = dist(a, aStart);
    const hTravelled = dist(healthy, hStart);
    assert(a.speed <= SHIP_CLASSES.cruiser.maxSpeed * 0.25 + 1e-6,
        `disabled engines cap speed at 25% (${a.speed.toFixed(1)} ≤ 17.5)`);
    assert(hTravelled > aTravelled * 2,
        `healthy twin outruns the crippled ship (${hTravelled.toFixed(0)} vs ${aTravelled.toFixed(0)} units)`);

    // Weapons: at 0 the ship stops firing even with an enemy in easy range.
    const st2 = freshBattle([R('cruiser', 1)]);
    const cr = fielded(st2, 'player', 'cruiser')[0]; // heading 0 → port battery bears on -y
    const foe = fielded(st2, 'enemy', 'corvette')[0];
    cr.subsystems!.weapons = 0;
    const foeSpot = { x: cr.x, y: cr.y - 200 }; // port side: in battery range 300, outside foe turret 180
    const foeTotal0 = foe.hull + totalShield(foe);
    runHolding(st2, 2, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    assert(foe.hull + totalShield(foe) === foeTotal0,
        'weapons at 0 → no beams: enemy in easy range takes zero damage over 2s');

    cr.subsystems!.weapons = 1;
    runHolding(st2, 1, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    assert(foe.hull + totalShield(foe) < foeTotal0, 'restored weapons resume fire (control)');

    // Shields: at 0 the generator never regenerates, even past the delay.
    const st3 = freshBattle([R('cruiser', 1)]);
    const cr3 = fielded(st3, 'player', 'cruiser')[0];
    cr3.subsystems!.shields = 0;
    applyDamage(st3, cr3, 20);
    const drained = cr3.shields[FACING_FORE];
    runPinned(st3, 8); // regen delay is 5s — well past it
    assert(cr3.shields[FACING_FORE] === drained && totalShield(cr3) === SHIP_CLASSES.cruiser.maxShield - 20,
        'shields subsystem at 0 → no regen after the delay');
    cr3.subsystems!.shields = 1;
    runPinned(st3, 1);
    assert(cr3.shields[FACING_FORE] > drained, 'restored generator resumes regen (control)');

    // setTargetSubsystem bookkeeping (no updates → no miss-chance randomness).
    const st4 = freshBattle([R('destroyer', 1)], [R('cruiser', 1)]);
    const dd = fielded(st4, 'player', 'destroyer')[0];
    const ecr = fielded(st4, 'enemy', 'cruiser')[0];
    setTargetSubsystem(st4, [dd.id], 'engines');
    assert(dd.targetSubsystem === null, 'called shot refused without a locked target');
    setTarget(st4, [dd.id], ecr.id);
    setTargetSubsystem(st4, [dd.id], 'engines');
    assert(dd.targetSubsystem === 'engines', 'called shot accepted against a capital target');
    setTarget(st4, [dd.id], null);
    assert(dd.targetSubsystem === null, 'clearing the lock resets the called shot');
});

suite('Line of sight — asteroid fields block beams', () => {
    const hazards = [
        { kind: 'asteroid' as const, x: 800, y: 500, r: 120 },
        { kind: 'nebula' as const, x: 400, y: 800, r: 100 },
    ];
    const state = freshBattle([R('cruiser', 1)], [R('corvette', 1)], { hazards });

    assert(!hasLineOfSight(state, 600, 500, 1000, 500), 'segment through the asteroid core is blocked');
    assert(hasLineOfSight(state, 600, 200, 1000, 200), 'parallel segment 300 units clear of the rock passes');
    assert(hasLineOfSight(state, 300, 800, 500, 800), 'nebulae do NOT block line of sight (only asteroids do)');
    assert(insideHazard(state, 'asteroid', 800, 500) && !insideHazard(state, 'asteroid', 800, 700),
        'insideHazard: centre inside, 200 units out is not');
    assert(insideHazard(state, 'nebula', 400, 800) && !insideHazard(state, 'nebula', 800, 500),
        'insideHazard distinguishes hazard kinds');

    // Cruiser and corvette on opposite sides of the rock, 290 apart (battery
    // range 300). Heading π/2 swings the port battery onto +x — in arc, but
    // the asteroid sits square on the firing line.
    const cr = fielded(state, 'player', 'cruiser')[0];
    cr.x = 660; cr.y = 500; cr.heading = Math.PI / 2; cr.speed = 0; cr.moveOrder = null;
    const foe = fielded(state, 'enemy', 'corvette')[0];
    const foeTotal0 = foe.hull + totalShield(foe);
    runHolding(state, 2, [{ ship: foe, x: 950, y: 500 }]);
    assert(foe.hull + totalShield(foe) === foeTotal0, 'no beam damage flows through the asteroid over 2s');

    // Same geometry shifted to y=200 — clear of the rock — damage flows.
    const state2 = freshBattle([R('cruiser', 1)], [R('corvette', 1)], { hazards });
    const cr2 = fielded(state2, 'player', 'cruiser')[0];
    cr2.x = 660; cr2.y = 200; cr2.heading = Math.PI / 2; cr2.speed = 0; cr2.moveOrder = null;
    const foe2 = fielded(state2, 'enemy', 'corvette')[0];
    const foe2Total0 = foe2.hull + totalShield(foe2);
    runHolding(state2, 2, [{ ship: foe2, x: 950, y: 200 }]);
    assert(foe2.hull + totalShield(foe2) < foe2Total0 - 10,
        `same setup clear of the rock: battery fire lands (total ${foe2Total0.toFixed(0)} → ${(foe2.hull + totalShield(foe2)).toFixed(0)})`);
});

suite('Nebulae — sensor veil and torpedo lock scrambling', () => {
    // Sensor veil: a target parked inside a nebula is invisible beyond 180.
    const veil = [{ kind: 'nebula' as const, x: 700, y: 500, r: 150 }];
    const state = freshBattle([R('cruiser', 1)], [R('corvette', 1)], { hazards: veil });
    const cr = fielded(state, 'player', 'cruiser')[0];
    cr.x = 400; cr.y = 500; cr.heading = Math.PI / 2; cr.speed = 0; cr.moveOrder = null;
    const foe = fielded(state, 'enemy', 'corvette')[0];
    assert(insideHazard(state, 'nebula', 660, 500), 'target parking spot sits inside the nebula');

    const foeTotal0 = foe.hull + totalShield(foe);
    runHolding(state, 2, [{ ship: foe, x: 660, y: 500 }]);
    assert(foe.hull + totalShield(foe) === foeTotal0,
        'target inside the nebula is NOT auto-engaged from 260 units (beyond the 180 veil)');

    cr.x = 520; // now 140 from the target — inside the 180-unit detection range
    runHolding(state, 2, [{ ship: foe, x: 660, y: 500 }]);
    assert(foe.hull + totalShield(foe) < foeTotal0, 'closing inside 180 restores the engagement (control)');

    // Torpedo fizzle: a pursued ship diving into a nebula shakes the lock.
    const st2 = freshBattle([R('destroyer', 1)], [R('cruiser', 1)],
        { hazards: [{ kind: 'nebula' as const, x: 1200, y: 800, r: 150 }] });
    const pd = fielded(st2, 'player', 'destroyer')[0];
    const ec = fielded(st2, 'enemy', 'cruiser')[0];
    ec.x = pd.x + 300; ec.y = pd.y; ec.speed = 0;
    setTarget(st2, [pd.id], ec.id);
    update(st2, 0.1);
    const torp = st2.torpedoes[0];
    assert(torp !== undefined && torp.targetId === ec.id, 'torpedo launched and locked before the target hides');
    assert(torp.expiresAt > st2.time + 10, 'fresh torpedo carries its full ~12s lifetime');
    const ecTotal0 = ec.hull + totalShield(ec);

    runHolding(st2, 0.1, [{ ship: ec, x: 1200, y: 800 }]); // target dives into the nebula
    assert(torp.expiresAt <= st2.time + 1.5 + 1e-6, 'lock scrambled: lifetime clamped to ~1.5s');
    runHolding(st2, 1.0, [{ ship: ec, x: 1200, y: 800 }]);
    assert(st2.torpedoes.some(t => t.id === torp.id), 'torpedo still chasing inside the fizzle window');
    runHolding(st2, 1.0, [{ ship: ec, x: 1200, y: 800 }]);
    assert(!st2.torpedoes.some(t => t.id === torp.id), 'torpedo expired early (~1.5s) instead of tracking to impact');
    assert(ec.hull + totalShield(ec) === ecTotal0, 'hidden cruiser never took the torpedo hit');
});

suite('Squadrons — launch, strikes, interception, relaunch, recovery', () => {
    const state = freshBattle([R('carrier', 1)], [R('cruiser', 1)]);
    const car = fielded(state, 'player', 'carrier')[0];
    const foe = fielded(state, 'enemy', 'cruiser')[0];
    assert(car.hangarCooldowns !== undefined, 'carrier spawns with hangar cooldown slots');
    // Hold the enemy cruiser 400 units east: outside its 300 batteries and the
    // carrier PD, but reachable by strike craft.
    const foeSpot = { x: car.x + 400, y: car.y };

    runHolding(state, 0.3, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    const ic = liveSquadron(state, 'player', 'interceptor');
    const bomber = liveSquadron(state, 'player', 'bomber');
    assert(ic !== undefined && bomber !== undefined, 'carrier auto-launches interceptor + bomber squadrons');
    assert(ic!.carrierId === car.id && bomber!.carrierId === car.id, 'squadrons belong to their carrier');
    assert(ic!.craft === SQUADRON_DEFS.interceptor.craft && bomber!.craft === SQUADRON_DEFS.bomber.craft,
        'squadrons launch at full craft strength');
    assert(state.squadrons.every(q => q.side === 'player'), 'hangarless enemy cruiser fields no squadrons');

    // Bomber strike on the held cruiser; interceptor sent to a patrol point
    // where an injected enemy squadron loiters (away from all ship guns).
    setSquadronOrder(state, [bomber!.id], 'attack', foe.id);
    setSquadronOrder(state, [ic!.id], 'patrol', null, 610, 800);
    state.squadrons.push({
        id: 'sq-injected-1',
        side: 'enemy',
        type: 'bomber',
        carrierId: foe.id,
        x: 610,
        y: 800,
        craft: 6,
        craftDamage: 0,
        order: 'patrol',
        targetShipId: null,
        patrolX: 610,
        patrolY: 800,
    });

    const foeHull0 = foe.hull;
    const foeShield0 = totalShield(foe);
    runHolding(state, 6, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    assert(foe.hull < foeHull0,
        `bombing runs pierce partially through FULL shields into hull (${foeHull0.toFixed(0)} → ${foe.hull.toFixed(0)})`);
    assert(totalShield(foe) < foeShield0, 'the non-pierced share of the strike drains the shields');
    const injected = state.squadrons.find(q => q.id === 'sq-injected-1');
    assert(injected === undefined || injected.craft < 6,
        `interceptors thin the enemy squadron (${injected ? injected.craft : 0}/6 craft left)`);
    assert(liveSquadron(state, 'player', 'interceptor') !== undefined, 'interceptor squadron survives the dogfight');

    // Death → the hangar waits out its ~25s rebuild unless rushed.
    const b1 = liveSquadron(state, 'player', 'bomber');
    assert(b1 !== undefined, 'bomber squadron still flying before being wiped');
    b1!.craft = 0;
    runHolding(state, 2, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    assert(liveSquadron(state, 'player', 'bomber') === undefined,
        'dead squadron NOT rebuilt after 2s (relaunch timer is ~25s)');

    assert(useAbility(state, car.id) === true, 'rapid_relaunch ability accepted');
    runHolding(state, 0.2, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    const b2 = liveSquadron(state, 'player', 'bomber');
    assert(b2 !== undefined && b2!.craft === SQUADRON_DEFS.bomber.craft,
        'rapid_relaunch rebuilds the squadron instantly at full strength');

    // Recovery: 'return' flies the squadron home and despawns it at the carrier.
    setSquadronOrder(state, [b2!.id], 'return');
    runHolding(state, 1, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    assert(liveSquadron(state, 'player', 'bomber') === undefined,
        'returned squadron recovered aboard (despawns at the carrier)');

    // Natural relaunch: the hangar rebuilds the recovered squadron after ~25s.
    runHolding(state, 26, [{ ship: foe, x: foeSpot.x, y: foeSpot.y }]);
    assert(liveSquadron(state, 'player', 'bomber') !== undefined,
        'carrier rebuilds and relaunches the squadron after ~25s');
});

suite('Formations — line spreads abreast, column strings along the axis', () => {
    const state = freshBattle([R('corvette', 5)]);
    const ships = fielded(state, 'player', 'corvette');
    assert(ships.length === 5, 'five corvettes fielded');
    const ids = ships.map(s => s.id);

    issueFormationMove(state, ids, 800, 500, 0, 'line');
    const line = ships.map(s => s.moveOrder);
    assert(line.every(d => d !== null), 'every selected ship received its own move order');
    let minPair = Infinity;
    for (let i = 0; i < line.length; i++) {
        for (let j = i + 1; j < line.length; j++) {
            minPair = Math.min(minPair, Math.hypot(line[i]!.x - line[j]!.x, line[i]!.y - line[j]!.y));
        }
    }
    assert(minPair >= 30, `line slots pairwise ≥ 30 units apart (min ${minPair.toFixed(0)})`);
    assert(line.every(d => Math.abs(d!.x - 800) < 1e-6),
        'line abreast: slots spread perpendicular to the facing axis (all x = 800)');
    assert(new Set(line.map(d => Math.round(d!.y))).size === 5, 'five distinct line slots');
    assert(line.every(d => d!.face === 0), 'requested facing carried into every slot');

    issueFormationMove(state, ids, 800, 500, 0, 'column');
    const col = ships.map(s => s.moveOrder!);
    assert(col.every(d => Math.abs(d.y - 500) < 1e-6), 'column: every slot lies ON the facing axis (y = 500)');
    const xs = col.map(d => d.x).sort((a, b) => b - a);
    assert(Math.abs(xs[0] - 800) < 1e-6, 'column lead holds the ordered point');
    assert(xs.every((x, i) => i === 0 || Math.abs((xs[i - 1] - x) - 46) < 1e-6),
        'followers strung astern at uniform 46-unit spacing, ordered along the axis');
    assert(new Set(xs.map(x => Math.round(x))).size === 5, 'five distinct column slots (≥ 30 apart)');
});

suite('Command abilities — admiral gating, volley, shield pulse', () => {
    const s0 = freshBattle([R('corvette', 2)]);
    assert(s0.player.commandAbilities.length === 0, 'no admiral → commandAbilities empty');
    assert(useCommandAbility(s0, 'player', 'coordinated_volley') === false, 'volley refused without an admiral');
    assert(useCommandAbility(s0, 'player', 'shield_pulse') === false, 'pulse refused without an admiral');

    const s1 = freshBattle([R('cruiser', 2)], undefined, { playerHasAdmiral: true });
    assert(s1.player.commandAbilities.length === 2, 'admiral unlocks both command abilities');
    assert(s1.enemy.commandAbilities.length === 0, 'enemy side (no admiral) has none');
    assert(useCommandAbility(s1, 'enemy', 'coordinated_volley') === false, 'enemy cannot borrow the player admiral');

    const ships = fielded(s1, 'player', 'cruiser');
    for (const sh of ships) sh.weaponCooldowns = sh.weaponCooldowns.map(() => 5);
    assert(useCommandAbility(s1, 'player', 'coordinated_volley') === true, 'volley fires with an admiral');
    assert(ships.every(sh => sh.weaponCooldowns.every(cd => cd === 0)),
        'coordinated volley zeroes every active ship weapon cooldown');
    assert(useCommandAbility(s1, 'player', 'coordinated_volley') === false, 'second volley refused while cooling down');

    const cap = SHIP_CLASSES.cruiser.maxShield / 4; // 37.5
    const a = ships[0];
    a.shields[0] = 0; a.shields[1] = 30; a.shields[2] = cap; a.shields[3] = 20;
    assert(useCommandAbility(s1, 'player', 'shield_pulse') === true, 'shield pulse fires with an admiral');
    assert(Math.abs(a.shields[0] - 11.25) < 1e-9, 'pulse adds maxShield×0.3/4 = 11.25 to a drained facing');
    assert(a.shields[1] === cap && a.shields[2] === cap,
        'boosted facings clamp at the maxShield/4 cap — never above it');
    assert(Math.abs(a.shields[3] - 31.25) < 1e-9, 'partially drained facing gains the full pulse');
    assert(ships[1].shields.every(f => f === cap), 'undamaged fleetmate stays exactly at cap');
    assert(useCommandAbility(s1, 'player', 'shield_pulse') === false, 'second pulse refused while cooling down');
});

suite('Carrier mapping — strategic carriers field the carrier class', () => {
    const reserves = fleetsToReserves([{ id: 'cf', factionId: 'me', composition: { carrier: 2 } }]);
    assert(reserves.length === 1 && reserves[0].classId === 'carrier'
        && reserves[0].sourceKey === 'carrier' && reserves[0].count === 2,
        'fleetsToReserves maps composition key "carrier" to the carrier class (V2)');

    const state = createBattle({
        playerReserves: reserves,
        enemyReserves: [R('corvette', 1)],
        enemyPlan: { posture: 'balanced', retreatBelowFleetStrength: 0 },
    });
    const carriers = fielded(state, 'player', 'carrier');
    assert(carriers.length === 2, 'both carriers fielded (2×6 pts within capacity 12)');
    assert(carriers.every(c => c.hangarCooldowns !== undefined && c.subsystems !== undefined),
        'fielded carriers carry hangars and subsystems');

    const foe = fielded(state, 'enemy', 'corvette')[0];
    applyDamage(state, foe, 99_999);
    update(state, 0.1);
    assert(state.outcome !== null && state.outcome!.winner === 'player', 'battle resolves for the player');
    const r = computeResult(state);
    assert(r.player.composition['carrier'] === 2, 'computeResult maps survivors back to sourceKey "carrier"');
    assert(r.player.destroyed === false && r.player.strength > 0.99, 'carriers survive at full strength');
});

// ─── Regression suites (V2 adversarial-review fixes) ──────────────────────────

suite('Nebula veil is symmetric — no outbound sniping from cover', () => {
    // Player battleship INSIDE a nebula, enemy corvette parked 300 away
    // (inside battery/spinal range, outside the 180 detect range).
    const state = freshBattle([R('battleship', 1)], [R('corvette', 1)], {
        hazards: [{ kind: 'nebula', x: 400, y: 500, r: 150 }],
    });
    const bs = fielded(state, 'player', 'battleship')[0];
    const target = fielded(state, 'enemy', 'corvette')[0];
    bs.x = 400; bs.y = 500; bs.heading = 0; bs.moveOrder = null;
    setTarget(state, [bs.id], target.id);

    const before = target.hull + totalShield(target);
    runHolding(state, 4, [{ ship: target, x: 700, y: 500 }]);
    const after = target.hull + totalShield(target);
    assert(insideHazard(state, 'nebula', bs.x, bs.y), 'battleship sits inside the nebula');
    assert(Math.abs(after - before) < 1e-6, 'veiled battleship cannot engage beyond detect range');

    // Same geometry with the target INSIDE detect range → fire flows.
    runHolding(state, 4, [{ ship: target, x: 550, y: 500 }]);
    assert(target.hull + totalShield(target) < before, 'target inside 180 units gets engaged');
});

suite('Torpedo called shots deliver subsystem damage (no launch-miss)', () => {
    const state = freshBattle([R('destroyer', 1)], [R('cruiser', 1)]);
    const dd = fielded(state, 'player', 'destroyer')[0];
    const cr = fielded(state, 'enemy', 'cruiser')[0];
    dd.x = 500; dd.y = 500; dd.heading = 0; dd.moveOrder = null;
    setTarget(state, [dd.id], cr.id);
    setTargetSubsystem(state, [dd.id], 'engines');

    // Park the cruiser dead ahead inside torpedo arc/range; strip shields so
    // hull (and thus subsystem) damage lands on the first impact.
    cr.shields = [0, 0, 0, 0];
    let seconds = 0;
    while (seconds < 20 && cr.subsystems!.engines >= 1) {
        runHolding(state, 0.5, [{ ship: cr, x: 800, y: 500 }]);
        cr.shields = [0, 0, 0, 0];
        seconds += 0.5;
    }
    assert(cr.subsystems!.engines < 1, 'torpedo impacts degrade the called engines subsystem');
});

suite('Command abilities refund when they would do nothing', () => {
    const state = freshBattle([R('corvette', 2)], undefined, { playerHasAdmiral: true });
    // Kill every player ship so none is 'active'.
    for (const sh of fielded(state, 'player')) applyDamage(state, sh, 100000);
    const ok = useCommandAbility(state, 'player', 'coordinated_volley');
    assert(ok === false, 'volley with zero active ships is rejected');
    const ability = state.player.commandAbilities.find(a => a.id === 'coordinated_volley')!;
    assert(ability.cooldownRemaining === 0, 'cooldown NOT consumed on the dead click');
});

suite('Rapid Relaunch refunds when no squadron is missing', () => {
    const state = freshBattle([R('carrier', 1)], undefined);
    const cv = fielded(state, 'player', 'carrier')[0];
    runPinned(state, 0.5); // hangar fields both squadrons
    const mine = state.squadrons.filter(sq => sq.side === 'player');
    assert(mine.length === 2, 'carrier fields interceptors + bombers');

    const ok = useAbility(state, cv.id);
    assert(ok === false, 'rapid relaunch with full decks is refused');
    assert(cv.abilityCooldown === 0, 'ability cooldown refunded');

    // Lose a squadron → the ability now works instantly.
    const bombers = mine.find(sq => sq.type === 'bomber')!;
    bombers.craft = 0;
    runPinned(state, 0.2); // prune the dead squadron
    const ok2 = useAbility(state, cv.id);
    assert(ok2 === true, 'rapid relaunch fires once a squadron is lost');
    assert(state.squadrons.filter(sq => sq.side === 'player' && sq.type === 'bomber' && sq.craft > 0).length === 1,
        'lost bomber squadron relaunched immediately');
});

suite('Stale squadron attack orders self-heal to carrier defence', () => {
    const state = freshBattle([R('carrier', 1)], [R('corvette', 2)]);
    runPinned(state, 0.5);
    const bombers = state.squadrons.find(sq => sq.side === 'player' && sq.type === 'bomber')!;
    const victim = fielded(state, 'enemy', 'corvette')[0];
    setSquadronOrder(state, [bombers.id], 'attack', victim.id);
    applyDamage(state, victim, 100000); // target dies
    runPinned(state, 0.5);
    assert(bombers.order === 'defend', 'attack order on a dead target resets to defend');
    assert(bombers.targetShipId === bombers.carrierId, 'squadron falls back to guarding its carrier');
});

console.log('\n✅ All tests completed.\n');
