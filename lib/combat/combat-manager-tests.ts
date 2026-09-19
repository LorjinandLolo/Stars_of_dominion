// lib/combat/combat-manager-tests.ts
// npx tsx lib/combat/combat-manager-tests.ts
//
// Drives the real sector-combat manager over the in-memory world (the same
// scaffold scripts/kaerruun-probe.ts uses): roles by arrival, rout at the
// doctrine threshold, a side wiped out, a side that left, and the post-battle
// directive landing on the fleets.

import { getGameWorldState } from '../game-world-state-singleton';
import { ensureFactionTraits } from '../factions/traits-service';
import { processSectorCombats } from './combat-manager';
import type { CombatState } from './combat-types';
import { pendingCount, resetChronicleBuffer } from '../narrative/chronicle';
import { drainNotifications } from '../time/notification-hooks';
import { dockRepairPerCycle } from './fleet-repair';

const A = 'faction-sarrak';
const B = 'faction-buthari';

// The engine rolls Math.random for its intel-prediction bonus (+5% on a hit)
// and for annihilation. Pinned high so neither fires and every number below
// is exact.
Math.random = () => 0.99;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const world = getGameWorldState();
ensureFactionTraits(world);
const systemIds = [...world.movement.systems.keys()];
const SYS = systemIds[40];
const HOME_A = systemIds[41];
const HOME_B = systemIds[42];

const mkFleet = (id: string, factionId: string, power: number, over: Record<string, any> = {}): any => ({
    id, factionId, name: id,
    currentSystemId: SYS, destinationSystemId: null,
    originSystemId: factionId === A ? HOME_A : HOME_B,
    basePower: power, strength: 1, composition: { cruiser: 5 },
    doctrine: { type: 'Balanced', deviationFromPosture: 0, preferredLayers: ['hyperlane'], retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1 },
    plannedPath: [], activeLayer: null, transitProgress: 0, etaSeconds: 0,
    hyperdriveProfile: { hyperlane: 1, gate: 1, deepspace: 2, wormhole: 1 },
    orders: [], isDetectable: true,
    ...over,
});

function reset() {
    world.movement.fleets.clear();
    world.activeCombats.clear();
    world.rivalries.set(`rivalry-${A}-${B}`, {
        id: `rivalry-${A}-${B}`, aFactionId: A, bFactionId: B, escalationLevel: 7, recentEvents: [],
    } as any);
    world.nowSeconds = 10_000_000;
}

/** One fast cycle: the clock moves, then combat resolves. */
function cycle(): CombatState | undefined {
    world.nowSeconds += 75;
    processSectorCombats(world);
    return [...world.activeCombats.values()][0];
}

/** Run cycles until a state with an outcome shows up, or the budget runs out. */
function untilOutcome(max = 20): CombatState | undefined {
    for (let i = 0; i < max; i++) {
        const s = cycle();
        if (s?.outcome) return s;
    }
    return undefined;
}

console.log('\n1. The later arrival attacks');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 500, { arrivedAtSeconds: 100 }));
    world.movement.fleets.set('b', mkFleet('b', B, 500, { arrivedAtSeconds: 900 }));
    const s = cycle();
    check('an engagement opened', !!s);
    check('the fleet that arrived last is the attacker', s?.attacker.factionId === B, s?.attacker.factionId);
    check('the fleet that was there defends', s?.defender.factionId === A);
}

console.log('\n2. Rout at the doctrine threshold');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 2000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 200, { composition: { corvette: 2 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0.5, supplyLevel: 1 } }));
    const s = untilOutcome();
    check('the battle ends', !!s?.outcome, JSON.stringify(s?.outcome));
    check('it ends in a rout', s?.outcome?.reason === 'rout', s?.outcome?.reason);
    check('the side that held the field wins', s?.outcome?.winnerId === A, s?.outcome?.winnerId ?? 'null');
    const b: any = world.movement.fleets.get('b');
    check('the routed fleet still exists', !!b);
    check('it is physically leaving', !!b?.destinationSystemId, String(b?.destinationSystemId));
    check('it broke at or under its threshold', (b?.strength ?? 1) <= 0.5 && (b?.strength ?? 0) > 0, String(b?.strength));
    const a: any = world.movement.fleets.get('a');
    check('the winner learned more than the runner', Math.abs((a?.experience ?? 0) - 0.04) < 1e-9 && Math.abs((b?.experience ?? 0) - 0.02) < 1e-9, `${a?.experience} / ${b?.experience}`);
    const after = cycle();
    check('the finished battle is dropped on the next pass', !after || !after.outcome, after ? after.outcome?.reason : 'none');
}

console.log('\n3. A side wiped out');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 5000, { composition: { cruiser: 50 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 20, { composition: { corvette: 1 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 } }));
    const s = untilOutcome();
    check('the battle ends', !!s?.outcome);
    check('the reason is destroyed', s?.outcome?.reason === 'destroyed', s?.outcome?.reason);
    check('the destroyed fleet is gone', !world.movement.fleets.has('b'));
    check('the winner is the survivor', s?.outcome?.winnerId === A);
}

console.log('\n4. A side that left');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 500, { arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 500, { arrivedAtSeconds: 100 }));
    const opened = cycle();
    check('an engagement opened', !!opened && !opened.outcome);
    // B is ordered out: departing fleets stop fighting the same cycle.
    const b: any = world.movement.fleets.get('b');
    b.destinationSystemId = HOME_B;
    const s = cycle();
    check('the battle closes once a side has left', s?.outcome?.reason === 'withdrawal', s?.outcome?.reason ?? 'no outcome');
    check('the side still there wins', s?.outcome?.winnerId === A);
    check('no combat leaks after the next pass', (cycle(), world.activeCombats.size === 0), String(world.activeCombats.size));
}

console.log('\n5. Directives land on the fleets');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 2000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, doctrine: { moraleDrift: 0, retreatThreshold: 0.3, supplyLevel: 0.5 } }));
    // Sturdy enough to last a few rounds (a 200-power fleet breaks in the first).
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { corvette: 2 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0.5, supplyLevel: 1 } }));
    const opened = cycle();
    check('an engagement opened', !!opened && !opened.outcome);
    opened!.attacker.selectedDirective = 'consolidate';
    opened!.defender.selectedDirective = 'pursue';
    const s = untilOutcome();
    check('the battle ends', !!s?.outcome, s?.outcome?.reason);
    const a: any = world.movement.fleets.get('a');
    check('consolidate raised the winner\'s supply by 0.15', Math.abs((a?.doctrine?.supplyLevel ?? 0) - 0.65) < 1e-9, String(a?.doctrine?.supplyLevel));
    check('consolidate raised its morale drift by 20', Math.abs((a?.doctrine?.moraleDrift ?? 0) - 20) < 1e-9, String(a?.doctrine?.moraleDrift));
    // The defender's pursue could not bite: it was the side that ran.
    const b: any = world.movement.fleets.get('b');
    check('the routed side kept its own supply', Math.abs((b?.doctrine?.supplyLevel ?? 0) - 1) < 1e-9, String(b?.doctrine?.supplyLevel));
}

console.log('\n6. Pursuit costs the runner');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 2000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { corvette: 2 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0.5, supplyLevel: 1 } }));
    const opened = cycle();
    check('an engagement opened', !!opened && !opened.outcome);
    opened!.attacker.selectedDirective = 'pursue';
    // Freeze the runner's strength just above its threshold so the pursuit
    // loss is the only thing that moves it below.
    let strengthBeforeBreak = 0;
    let s: CombatState | undefined;
    for (let i = 0; i < 20; i++) {
        const b: any = world.movement.fleets.get('b');
        if (b && !b.destinationSystemId) strengthBeforeBreak = b.strength;
        s = cycle();
        if (s?.outcome) break;
    }
    const b: any = world.movement.fleets.get('b');
    check('the runner got away', s?.outcome?.reason === 'rout' && !!b?.destinationSystemId, s?.outcome?.reason);
    check('but paid the pursuit toll on top of the round\'s damage', (b?.strength ?? 1) < strengthBeforeBreak - 0.05 + 1e-9, `${strengthBeforeBreak} -> ${b?.strength}`);
}

console.log('\n7. Orbital defenses fight, and the battle is reported');
{
    reset();
    resetChronicleBuffer();
    drainNotifications();
    const fort: any = {
        id: 'planet-fort-test', name: 'Bastion', ownerId: B, systemId: SYS,
        infrastructureLevel: 2, specialization: null, stability: 90, tiles: [],
        orbital: {
            slots: [
                { slotId: 'planet-fort-test-orb0', structureId: 'space_station', state: 'active', integrity: 100 },
                { slotId: 'planet-fort-test-orb1', structureId: 'orbital_defense_network', state: 'active', integrity: 100 },
            ],
            buildQueue: [],
        },
    };
    world.construction.planets.set(fort.id, fort);
    // A pushes into B's fortified system with a modest force; B's picket alone would lose.
    world.movement.fleets.set('a', mkFleet('a', A, 600, { composition: { cruiser: 3 }, arrivedAtSeconds: 900, doctrine: { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 } }));
    world.movement.fleets.set('b', mkFleet('b', B, 300, { composition: { corvette: 3 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 } }));
    const opened = cycle();
    // Station 25 + Defense Network 160 = 185 power committed; by the time we look
    // the first volley has already landed on the structures.
    check('the defender fights with its orbital defenses', opened?.defender.fortCommitted === 1850, String(opened?.defender.fortCommitted));
    check('and they were shot at in the first round', (opened?.defender.fortification?.defensePower ?? 185) < 185, String(opened?.defender.fortification?.defensePower));
    check('the defenses add their mass to the defender', Math.abs((opened?.defender.maxHp ?? 0) - (300 * 10 + 185 * 10)) < 1e-6, String(opened?.defender.maxHp));
    check('the attacker brings no fortification', opened?.attacker.fortification === undefined);
    const network = () => fort.orbital.slots.find((sl: any) => sl.structureId === 'orbital_defense_network');
    const s = untilOutcome();
    check('the battle ends', !!s?.outcome, s?.outcome?.reason);
    check('the structures took fire', network().integrity < 100, String(network().integrity));
    check('the tally counted no phantom structure loss', (s?.tally?.[B]?.structuresLost ?? 0) === fort.orbital.slots.filter((sl: any) => sl.state === 'destroyed').length);
    check('one chronicle event was filed for the battle', pendingCount() === 1, String(pendingCount()));
    const mine = drainNotifications(A);
    const theirs = drainNotifications(B);
    check('each side got one notification', mine.length === 1 && theirs.length === 1, `${mine.length}/${theirs.length}`);
    check('the notification names the system and the outcome', /VICTORY|DEFEAT|STANDOFF/.test(mine[0]?.title ?? '') && (mine[0]?.title ?? '').includes(String(world.movement.systems.get(SYS)?.name ?? SYS).toUpperCase()), mine[0]?.title);
    check('a defeat is urgent, the rest normal', mine.concat(theirs).every(n => (n.title.startsWith('DEFEAT')) === (n.priority === 'urgent')));
    world.construction.planets.delete(fort.id);
    resetChronicleBuffer();
}

console.log('\n8. An admiral commands');
{
    reset();
    if (!(world.leadership?.leaders instanceof Map)) (world as any).leadership = { ...(world as any).leadership, leaders: new Map() };
    const admiral: any = { id: 'adm-test', factionId: A, name: 'Test Admiral', role: 'Admiral', level: 3, xp: 0, loyalty: 60, status: 'active', traits: ['aggressive_tactician'], history: [], assignmentId: 'a' };
    world.leadership.leaders.set('adm-test', admiral);
    // Baseline: the same fleets with nobody in command (the faction's own tech
    // modifiers are whatever the world says they are).
    world.movement.fleets.set('a', mkFleet('a', A, 2000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 200, { composition: { corvette: 2 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0.5, supplyLevel: 1 } }));
    const plain = cycle();
    const base = plain?.attacker.techModifiers?.['combat_power_multiplier'] ?? 0;
    check('without an admiral the side has none', plain?.attacker.admiralId === undefined);
    reset();
    world.leadership.leaders.set('adm-test', admiral);
    world.movement.fleets.set('a', mkFleet('a', A, 2000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, leaderId: 'adm-test' }));
    world.movement.fleets.set('b', mkFleet('b', B, 200, { composition: { corvette: 2 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0.5, supplyLevel: 1 } }));
    const opened = cycle();
    check('the side knows its admiral', opened?.attacker.admiralId === 'adm-test', String(opened?.attacker.admiralId));
    // Level 3: +6% raw; the aggressive tactician's +15% offensiveDamage carries
    // the leadership module's own level bonus (1 + 2% per level above 1).
    const expected = 0.06 + 0.15 * (1 + (3 - 1) * 0.02);
    check('level 3 is +6% power, the aggressive tactician +15.6% more on the attack', Math.abs(((opened?.attacker.techModifiers?.['combat_power_multiplier'] ?? 0) - base) - expected) < 1e-9, `${opened?.attacker.techModifiers?.['combat_power_multiplier']} vs base ${base}`);
    // The round already rolled intel predictions, so the admiral's point is a floor.
    check('the admiral opens with a prediction point', (opened?.attacker.predictionPoints ?? 0) >= 1);
    const s = opened?.outcome ? opened : untilOutcome();
    check('the battle ends', !!s?.outcome);
    check('the admiral earned battle XP for the win', admiral.xp === 300, String(admiral.xp));
    world.leadership.leaders.delete('adm-test');
}

console.log('\n9. One scale: the pool is the fleets');
{
    reset();
    const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
    world.movement.fleets.set('a', mkFleet('a', A, 800, { composition: { cruiser: 8 }, arrivedAtSeconds: 900, doctrine: noRout, experience: 0.25 }));
    world.movement.fleets.set('a2', mkFleet('a2', A, 400, { composition: { destroyer: 10 }, arrivedAtSeconds: 900, doctrine: noRout, strength: 0.5 }));
    world.movement.fleets.set('b', mkFleet('b', B, 1200, { composition: { cruiser: 12 }, arrivedAtSeconds: 100, doctrine: noRout }));
    const expectedPool = (ids: string[]) => ids.reduce((sum, id) => {
        const f: any = world.movement.fleets.get(id);
        return f ? sum + f.basePower * f.strength * (1 + (f.experience ?? 0)) * 10 : sum;
    }, 0);
    let ok = true;
    let detail = '';
    let s: CombatState | undefined;
    for (let i = 0; i < 4; i++) {
        s = cycle();
        if (!s || s.outcome) break;
        const a = expectedPool(['a', 'a2']);
        const b = expectedPool(['b']);
        if (Math.abs(s.attacker.hp - a) > 1e-6 || Math.abs(s.defender.hp - b) > 1e-6) { ok = false; detail = `round ${i + 1}: ${s.attacker.hp} vs ${a}, ${s.defender.hp} vs ${b}`; break; }
    }
    check('after every round hp equals sum(basePower × strength × veterancy) × 10', ok, detail);
    check('maxHp is what each fleet brought in (a half-strength fleet commits half)', Math.abs((s?.attacker.maxHp ?? 0) - (800 * 1.25 * 10 + 400 * 0.5 * 10)) < 1e-6, String(s?.attacker.maxHp));
    const lostA = (s?.tally?.[A]?.powerLost ?? 0);
    const a: any = world.movement.fleets.get('a');
    const a2: any = world.movement.fleets.get('a2');
    check('the tally counts power actually removed', Math.abs(lostA - ((1 - a.strength) * 800 + (0.5 - a2.strength) * 400)) < 1e-6, String(lostA));
}

console.log('\n10. Power is firepower');
{
    // Same hulls, same count; one side is rated higher (better fits). It used
    // to deal identical damage, because the old table counted ships.
    const run = (powerA: number) => {
        reset();
        const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
        world.movement.fleets.set('a', mkFleet('a', A, powerA, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, doctrine: noRout }));
        world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 100, doctrine: noRout }));
        cycle();
        return 1 - (world.movement.fleets.get('b') as any).strength;
    };
    const plain = run(1000);
    const fitted = run(1500);
    check('a better-rated fleet of the same hulls hits harder', fitted > plain * 1.4, `${plain.toFixed(4)} -> ${fitted.toFixed(4)}`);

    // Veterancy: real for the first time (it used to cancel in power / maxHp).
    const vet = (xp: number) => {
        reset();
        const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
        world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, doctrine: noRout, experience: xp }));
        world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 100, doctrine: noRout }));
        cycle();
        return { dealt: 1 - (world.movement.fleets.get('b') as any).strength, taken: 1 - (world.movement.fleets.get('a') as any).strength };
    };
    const green = vet(0);
    const elite = vet(0.25);
    check('an elite crew deals 1.25× the damage', Math.abs(elite.dealt / green.dealt - 1.25) < 1e-6, `${green.dealt} -> ${elite.dealt}`);
    check('and loses strength 1.25× slower', Math.abs(green.taken / elite.taken - 1.25) < 1e-6, `${green.taken} -> ${elite.taken}`);
}

console.log('\n11. Overkill cap and the destroyed floor');
{
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 5000, { composition: { cruiser: 50 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 100, { composition: { corvette: 8 }, arrivedAtSeconds: 100, doctrine: { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 } }));
    const first = cycle();
    const b: any = world.movement.fleets.get('b');
    check('a 50:1 stomp still leaves the victim 0.40 after one round', !!b && Math.abs(b.strength - 0.4) < 1e-9 && !first?.outcome, String(b?.strength));
    const s = untilOutcome();
    check('and finishes it in the second', s?.outcome?.reason === 'destroyed' && !world.movement.fleets.has('b'), s?.outcome?.reason);

    reset();
    const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, doctrine: noRout, originSystemId: null }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 100, doctrine: noRout, originSystemId: null }));
    let rounds = 0;
    while (rounds < 80 && world.movement.fleets.has('a') && world.movement.fleets.has('b')) { cycle(); rounds++; }
    check('two fleets that cannot rout do not fight forever', rounds < 80, `${rounds} passes`);
}

console.log('\n12. Reinforcements join the pool and cannot fake a win');
{
    reset();
    const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, doctrine: noRout }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 100, doctrine: noRout }));
    const opened = cycle();
    const maxBefore = opened!.defender.maxHp;
    world.movement.fleets.set('b2', mkFleet('b2', B, 500, { composition: { destroyer: 12 }, arrivedAtSeconds: 950, doctrine: noRout }));
    const next = cycle();
    check('a reinforcement raises the side\'s committed mass by its own', Math.abs(next!.defender.maxHp - (maxBefore + 5000)) < 1e-6, `${maxBefore} -> ${next!.defender.maxHp}`);
    check('so its fraction kept stays a real fraction', next!.defender.hp <= next!.defender.maxHp + 1e-6 && next!.defender.hp / next!.defender.maxHp < 1);
}

console.log('\n13. Fort parity and quiet yards');
{
    reset();
    const fort: any = {
        id: 'planet-parity-test', name: 'Parity', ownerId: B, systemId: SYS,
        infrastructureLevel: 2, specialization: null, stability: 90, tiles: [],
        orbital: { slots: [{ slotId: 'pp-orb0', structureId: 'orbital_defense_network', state: 'active', integrity: 100 }], buildQueue: [] },
    };
    world.construction.planets.set(fort.id, fort);
    const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
    world.movement.fleets.set('a', mkFleet('a', A, 600, { composition: { cruiser: 6 }, arrivedAtSeconds: 900, doctrine: noRout }));
    world.movement.fleets.set('b', mkFleet('b', B, 160, { composition: { corvette: 12 }, arrivedAtSeconds: 100, doctrine: noRout }));
    cycle();
    const b: any = world.movement.fleets.get('b');
    const integrityLost = (100 - fort.orbital.slots[0].integrity) / 100;
    const strengthLost = 1 - b.strength;
    // Equal mass (160 power each): the volley splits evenly, so both lose the same fraction.
    check('a fort and a fleet of equal mass lose the same share of themselves', Math.abs(integrityLost - strengthLost) < 1e-6 && integrityLost > 0, `${integrityLost} vs ${strengthLost}`);
    world.construction.planets.delete(fort.id);

    // Repair: shut while an enemy holds the system, open once it leaves.
    const sys: any = world.movement.systems.get(SYS);
    const ownerBefore = sys.ownerFactionId;
    sys.ownerFactionId = B;
    reset();
    world.movement.fleets.set('b', mkFleet('b', B, 500, { strength: 0.5 }));
    const quiet = dockRepairPerCycle(world, world.movement.fleets.get('b') as any);
    world.movement.fleets.set('a', mkFleet('a', A, 500, {}));
    const underFire = dockRepairPerCycle(world, world.movement.fleets.get('b') as any);
    check('a docked fleet repairs in a quiet system', quiet > 0, String(quiet));
    check('and not at all while an enemy fleet holds it', underFire === 0, String(underFire));
    sys.ownerFactionId = ownerBefore;
}

console.log('\n14. Review 2026-09-19: fort cap, rout window, small fleets, mid-battle growth');
{
    // A station beside a picket, with civilian structures in the same orbit.
    reset();
    const home: any = {
        id: 'planet-orbit-test', name: 'Orbit', ownerId: B, systemId: SYS,
        infrastructureLevel: 2, specialization: null, stability: 90, tiles: [],
        orbital: { slots: [
            { slotId: 'o0', structureId: 'space_station', state: 'active', integrity: 100 },
            { slotId: 'o1', structureId: 'capital_spaceyard', state: 'active', integrity: 100 },
            { slotId: 'o2', structureId: 'orbital_warehouse', state: 'active', integrity: 100 },
            { slotId: 'o3', structureId: 'orbital_research_complex', state: 'active', integrity: 100 },
        ], buildQueue: [] },
    };
    world.construction.planets.set(home.id, home);
    const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
    world.movement.fleets.set('a', mkFleet('a', A, 2000, { composition: { cruiser: 20 }, arrivedAtSeconds: 900, doctrine: noRout }));
    world.movement.fleets.set('b', mkFleet('b', B, 50, { composition: { corvette: 4 }, arrivedAtSeconds: 100, doctrine: noRout }));
    cycle();
    const slot = (id: string) => home.orbital.slots.find((s: any) => s.slotId === id);
    check('a 40:1 volley takes no more from the station than from a fleet (60 points)', slot('o0').integrity >= 40 - 1e-6 && slot('o0').integrity < 100, String(slot('o0').integrity));
    check('yards, warehouses and labs are not combatants: a fleet action leaves them whole', slot('o1').integrity === 100 && slot('o2').integrity === 100 && slot('o3').integrity === 100, home.orbital.slots.map((s: any) => s.integrity).join());
    world.construction.planets.delete(home.id);

    // The rout window: default doctrine (0.3) against a stomp.
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 5000, { composition: { cruiser: 50 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 200, { composition: { corvette: 16 }, arrivedAtSeconds: 100 }));
    cycle();
    check('round one leaves it at 0.40, above its 0.3 threshold', Math.abs(((world.movement.fleets.get('b') as any)?.strength ?? 0) - 0.4) < 1e-9);
    const s = untilOutcome();
    const b: any = world.movement.fleets.get('b');
    check('round two breaks it instead of killing it', !!b && b.strength > 0 && s?.outcome?.reason === 'rout' && !!b.destinationSystemId, `${s?.outcome?.reason} ${b?.strength}`);

    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 5000, { composition: { cruiser: 50 }, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 200, { composition: { corvette: 16 }, arrivedAtSeconds: 100, originSystemId: null }));
    // Nowhere to run: no origin, no owned system, no capital on file.
    const owners = new Map<string, any>();
    for (const [id, planet] of world.construction.planets as Map<string, any>) { if (planet.ownerId === B) { owners.set(id, planet.ownerId); planet.ownerId = null; } }
    const econB: any = world.economy?.factions?.get?.(B);
    const capitalBefore = econB?.capitalSystemId;
    if (econB) econB.capitalSystemId = undefined;
    const dead = untilOutcome();
    if (econB) econB.capitalSystemId = capitalBefore;
    check('a fleet with nowhere to run gets the window once, then dies', !world.movement.fleets.has('b') && dead?.outcome?.reason === 'destroyed', dead?.outcome?.reason);
    for (const [id, ownerId] of owners) (world.construction.planets.get(id) as any).ownerId = ownerId;

    // Two young task forces: under the old skirmish line (50 power).
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 22, { composition: { corvette: 1 }, arrivedAtSeconds: 900, doctrine: noRout }));
    world.movement.fleets.set('b', mkFleet('b', B, 22, { composition: { corvette: 1 }, arrivedAtSeconds: 100, doctrine: noRout }));
    const small1 = cycle();
    const small2 = cycle();
    check('a small fleet action is one battle, not one battle per round', !!small1 && !small1.outcome && !!small2 && small2.id === small1.id && !small2.outcome, `${small1?.outcome?.reason} / ${small2?.outcome?.reason}`);
    const closed = untilOutcome();
    check('and closes on rounds like any other', closed?.outcome?.reason === 'rounds', closed?.outcome?.reason);

    // Ships land in a fleet mid-battle (a recruit job completing).
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 900, doctrine: noRout }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, arrivedAtSeconds: 100, doctrine: noRout }));
    cycle(); cycle();
    // The state object is mutated in place: keep numbers, not the reference.
    const open = [...world.activeCombats.values()][0]!;
    const maxBefore = open.defender.maxHp;
    const fracBefore = open.defender.hp / open.defender.maxHp;
    const grown: any = world.movement.fleets.get('b');
    const strengthThen = grown.strength;
    grown.basePower += 250;
    const after = cycle()!;
    check('ships landing mid-battle are committed at the mass they add', Math.abs(after.defender.maxHp - (maxBefore + 2500 * strengthThen)) < 1e-6, `${maxBefore} -> ${after.defender.maxHp}`);
    // Frozen, the commitment stayed 10000 and the fraction jumped to 1.25 × strength.
    check('so another lost round cannot read as having kept more', after.defender.hp / after.defender.maxHp < fracBefore, `${fracBefore} -> ${after.defender.hp / after.defender.maxHp}`);
}

console.log('\n15. Battle-flow review 2026-09-19');
{
    const C = 'faction-aurelian';
    const noRout = { moraleDrift: 0, retreatThreshold: 0, supplyLevel: 1 };
    const war = (x: string, y: string) => world.rivalries.set(`rivalry-${x}-${y}`, { id: `rivalry-${x}-${y}`, aFactionId: x, bFactionId: y, escalationLevel: 7, recentEvents: [] } as any);
    const peace = (x: string, y: string) => world.rivalries.delete(`rivalry-${x}-${y}`);

    // Three-way war: the first pair kills a fleet, the second must not fight its ghost.
    reset(); war(A, C); war(B, C);
    resetChronicleBuffer();
    world.movement.fleets.set('a', mkFleet('a', A, 30, { strength: 0.3, composition: { corvette: 2 }, doctrine: noRout, arrivedAtSeconds: 100 }));
    world.movement.fleets.set('b', mkFleet('b', B, 5000, { composition: { cruiser: 50 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('c', mkFleet('c', C, 40, { composition: { corvette: 3 }, doctrine: noRout, arrivedAtSeconds: 500, originSystemId: null }));
    drainNotifications(C);
    for (let i = 0; i < 4 && world.movement.fleets.has('a'); i++) cycle();
    const phantom = [...world.activeCombats.values()].some(s => [s.attacker.factionId, s.defender.factionId].includes(A) && [s.attacker.factionId, s.defender.factionId].includes(C) && s.outcome?.reason === 'destroyed');
    check('a fleet killed by one enemy does not lose a phantom battle to another the same pass', !world.movement.fleets.has('a') && !phantom && !drainNotifications(C).some(n => /VICTORY/.test(n.title)));
    peace(A, C); peace(B, C);

    // The owner of the forts defends, however late its reinforcements arrived.
    reset();
    const keep: any = {
        id: 'planet-roles-test', name: 'Keep', ownerId: B, systemId: SYS,
        infrastructureLevel: 2, specialization: null, stability: 90, tiles: [],
        orbital: { slots: [{ slotId: 'k0', structureId: 'orbital_defense_network', state: 'active', integrity: 100 }], buildQueue: [] },
    };
    world.construction.planets.set(keep.id, keep);
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 100 }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    const sided = cycle();
    check('the side with armed planets here defends even as the later arrival', sided?.defender.factionId === B && (sided?.defender.fortification?.defensePower ?? 0) > 0, `${sided?.attacker.factionId} attacks`);
    keep.ownerId = A;
    cycle();
    const afterCapture = [...world.activeCombats.values()][0];
    check('a planet captured mid-battle stops fighting for its old owner', (afterCapture?.defender.fortification?.defensePower ?? 0) === 0 && (afterCapture?.defender.fortification?.planetIds.length ?? 0) === 0);
    world.construction.planets.delete(keep.id);

    // Peace mid-battle closes the battle instead of leaking it.
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 100 }));
    cycle(); cycle();
    (world.rivalries.get(`rivalry-${A}-${B}`) as any).escalationLevel = 3;
    const truce = cycle();
    check('a ceasefire closes the open battle with no winner', truce?.outcome?.reason === 'ceasefire' && truce.outcome.winnerId === null, truce?.outcome?.reason);
    cycle();
    check('and the state is gone the pass after', world.activeCombats.size === 0);

    // A fleet action stays in orbit for all six rounds.
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 100 }));
    let sawGround = false; let passes = 0; let last: CombatState | undefined;
    while (passes < 12) { last = cycle(); passes++; if (last?.phase === 'ground' || last?.orbitalWinnerId) sawGround = true; if (last?.outcome) break; }
    check('a fleet action never flips to the ground phase', !sawGround && last?.outcome?.reason === 'rounds' && passes === 6, `${passes} passes, ${last?.outcome?.reason}`);

    // A withdrawal that goes nowhere is not a withdrawal.
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 5000, { composition: { cruiser: 50 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 200, { composition: { corvette: 16 }, arrivedAtSeconds: 100, originSystemId: 'ghost-system' }));
    const stuck = untilOutcome();
    check('a fleet whose way home is not on the map fights on instead of "routing" in place', stuck?.outcome?.reason === 'destroyed' && !world.movement.fleets.has('b'), stuck?.outcome?.reason);

    // One runner on the WINNING side does not turn a wipe-out into a rout.
    reset();
    world.movement.fleets.set('a', mkFleet('a', A, 300, { composition: { cruiser: 3 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('a2', mkFleet('a2', A, 100, { strength: 0.551, composition: { corvette: 8 }, arrivedAtSeconds: 900, doctrine: { moraleDrift: 0, retreatThreshold: 0.55, supplyLevel: 1 } }));
    world.movement.fleets.set('b', mkFleet('b', B, 60, { strength: 0.3, composition: { corvette: 4 }, doctrine: noRout, arrivedAtSeconds: 100 }));
    const wiped = untilOutcome();
    check('the reason follows the side that lost the field', wiped?.outcome?.winnerId === A && wiped.outcome.reason === 'destroyed', wiped?.outcome?.reason);

    // An Infernoid killed in PURSUIT detonates after the normal sweep has run.
    reset();
    const econB: any = world.economy.factions.get(B);
    const civBefore = econB?.civilizationId;
    if (econB) econB.civilizationId = 'civ-infernoid';
    world.movement.fleets.set('a', mkFleet('a', A, 300, { strength: 0.43, composition: { cruiser: 3 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 2000, { strength: 0.35, composition: { cruiser: 20 }, arrivedAtSeconds: 100 }));
    const opened = cycle();                       // round one: b holds (0.34 > 0.3)
    if (opened) { opened.attacker.selectedDirective = 'pursue' as any; opened.attacker.currentDirective = 'pursue' as any; }
    (world.movement.fleets.get('b') as any).strength = 0.10;   // next volley breaks it; pursuit then kills it
    cycle();
    const zombie: any = world.movement.fleets.get('a');
    check('the pursuit kill detonated', !world.movement.fleets.has('b') && (opened?.tally?.[B]?.fleetsLost ?? 0) === 1, JSON.stringify(opened?.tally));
    check('a fleet burned to nothing by that detonation is removed and counted, not left at strength 0', !zombie && (opened?.tally?.[A]?.fleetsLost ?? 0) === 1, `a.strength=${zombie?.strength} ${JSON.stringify(opened?.tally?.[A])}`);
    if (econB) econB.civilizationId = civBefore;

    // Reinforcements raise the base the report divides by.
    reset();
    drainNotifications(B);
    world.movement.fleets.set('a', mkFleet('a', A, 1000, { composition: { cruiser: 10 }, doctrine: noRout, arrivedAtSeconds: 900 }));
    world.movement.fleets.set('b', mkFleet('b', B, 20, { composition: { corvette: 2 }, doctrine: noRout, arrivedAtSeconds: 100 }));
    cycle();
    world.movement.fleets.set('b2', mkFleet('b2', B, 1500, { composition: { cruiser: 15 }, doctrine: noRout, arrivedAtSeconds: 950 }));
    const reinforced = untilOutcome();
    const tallyB = reinforced?.tally?.[B];
    check('the loss share counts everything the side brought', !!tallyB && (tallyB.powerAtStart ?? 0) >= 1500 && tallyB.powerLost / (tallyB.powerAtStart as number) < 0.6, JSON.stringify(tallyB));
    check('so a reinforced side is not told it lost 100%', !drainNotifications(B).some(n => /Lost 100%/.test(n.body)));
}

world.rivalries.delete(`rivalry-${A}-${B}`);
world.movement.fleets.clear();
world.activeCombats.clear();

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
