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

const A = 'faction-sarrak';
const B = 'faction-buthari';

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
    check('the defender fights with its orbital defenses', (opened?.defender.fortification?.defensePower ?? 0) === 185, String(opened?.defender.fortification?.defensePower));
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

world.rivalries.delete(`rivalry-${A}-${B}`);
world.movement.fleets.clear();
world.activeCombats.clear();

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
