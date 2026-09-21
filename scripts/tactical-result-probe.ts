// scripts/tactical-result-probe.ts
// npx tsx scripts/tactical-result-probe.ts
//
// MIL_TACTICAL_ENGAGE and MIL_TACTICAL_RESULT, driven through the worker's own
// executeOrder against the real seeded world. The handler cannot be reached
// from a browser in a dev world — a tactical battle needs two hostile fleets in
// one system, and the two dev factions start 39 jumps apart — so this is where
// it is verified.
//
// What is being checked is the 2026-09-19 rewrite: the survivor absorbs the
// other fleets the way MIL_MERGE_FLEETS does (design books, crews, lane speed,
// carried armies, open yard jobs) and the losses come off the books by what the
// dead ships were rated. Before it, the absorbed ships turned into
// "unregistered hulls" that refit would then sell their own modules to.

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureFactionTraits } from '../lib/factions/traits-service';
import { executeOrder } from './game-loop';
import { rosterByHull } from '../lib/combat/fleet-roster';
import { DEFAULT_DESIGNS, resolveDesign, summarizeDesign } from '../lib/combat/ship-registry';

const A = 'faction-sarrak';      // the player submitting the result
const B = 'faction-buthari';     // the enemy

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const world: any = getGameWorldState();
ensureFactionTraits(world);
const SYS = [...world.movement.systems.keys()][40] as string;
const HOME = [...world.movement.systems.keys()][41] as string;

const battleship = DEFAULT_DESIGNS.find(d => d.hullId === 'battleship')!;
const shipPower = summarizeDesign(battleship, null).power;
const lookup = (id: string) => resolveDesign(id, A, []);

const mkFleet = (id: string, factionId: string, ships: number, over: Record<string, any> = {}): any => ({
    id, factionId, name: id,
    currentSystemId: SYS, destinationSystemId: null, originSystemId: HOME,
    basePower: ships * shipPower, strength: 1,
    composition: { battleship: ships },
    designCounts: { [battleship.id]: ships },
    designProfile: { energy: ships, kinetic: 0, explosive: 0, shield: ships, armor: 0, evasion: 0 },
    designSpeedBonus: 0, experience: 0,
    doctrine: { type: 'Balanced', deviationFromPosture: 0, preferredLayers: ['hyperlane'], retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1 },
    plannedPath: [], activeLayer: null, transitProgress: 0, etaSeconds: 0,
    hyperdriveProfile: { hyperlane: 1, gate: 1, deepspace: 2, wormhole: 1 },
    orders: [], isDetectable: true, transportedArmyIds: [],
    ...over,
});

function reset() {
    world.movement.fleets.clear();
    world.activeCombats.clear();
    world.tacticalLocks = {};
    if (!world.combat) world.combat = {};
    world.combat.recruitmentJobs = [];
    world.nowSeconds = 10_000_000;
    world.rivalries.set(`rivalry-${A}-${B}`, {
        id: `rivalry-${A}-${B}`, aFactionId: A, bFactionId: B, escalationLevel: 7, recentEvents: [],
    } as any);
}

/** Open the tactical lock the result order needs as its credential. */
function engage() {
    executeOrder(world, 'MIL_TACTICAL_ENGAGE', { systemId: SYS, enemyFactionId: B }, A);
}

console.log('\n1. The lock');
{
    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    engage();
    check('engaging a system with no enemy in it is refused', !world.tacticalLocks?.[SYS]);

    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    engage();
    check('with an enemy present the system is locked', !!world.tacticalLocks?.[SYS] && world.tacticalLocks[SYS].factionId === A);
    check('and the lock names the faction engaged', world.tacticalLocks[SYS].enemyFactionId === B);
    check('it carries the pre-battle snapshot the result is clamped against', (world.tacticalLocks[SYS].preBattle?.player?.shipCount ?? 0) === 5);

    const before = JSON.stringify(world.tacticalLocks[SYS]);
    engage();
    check('a second engage cannot renew or steal the lock', JSON.stringify(world.tacticalLocks[SYS]) === before);
}

console.log('\n2. Two of my fleets survive intact: the survivor absorbs the other');
{
    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5, { experience: 0.20, designSpeedBonus: 0.10 }));
    world.movement.fleets.set('a2', mkFleet('a2', A, 5, { experience: 0, designSpeedBonus: 0, transportedArmyIds: ['army-x'] }));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    // A yard job aimed at the fleet that is about to be absorbed.
    world.combat.recruitmentJobs.push({ id: 'job-1', factionId: A, targetFormationId: 'a2', kind: 'refit', count: 2, classKey: 'battleship', designId: battleship.id, refitFrom: { designId: battleship.id } } as any);
    engage();
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1', 'a2'], enemyFleetIds: ['b1'],
        playerResult: { destroyed: false, composition: { battleship: 10 }, strength: 0.9 },
        enemyResult: { destroyed: true, composition: {}, strength: 0 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);

    const survivor: any = world.movement.fleets.get('a1');
    check('the absorbed fleet is gone', !world.movement.fleets.has('a2'));
    check('the survivor holds every ship', survivor?.composition?.battleship === 10, JSON.stringify(survivor?.composition));
    // The bug: composition and power were pooled, designCounts was not, so five
    // fitted ships read as "unregistered hulls" a refit would re-sell modules to.
    check('and the design books came with them', survivor?.designCounts?.[battleship.id] === 10, JSON.stringify(survivor?.designCounts));
    const roster = rosterByHull(survivor, lookup);
    check('so nothing aboard is unregistered', roster.hulls.battleship.unregistered === 0 && !roster.hulls.battleship.inconsistent);
    check('the design signature was pooled too', (survivor?.designProfile?.energy ?? 0) === 10, JSON.stringify(survivor?.designProfile));
    check('power is the two fleets together', survivor?.basePower === 10 * shipPower, String(survivor?.basePower));
    check('crews blend by power, they do not vanish', Math.abs((survivor?.experience ?? 0) - 0.10) < 1e-9, String(survivor?.experience));
    check('the lane-speed bonus blends by ship count', Math.abs((survivor?.designSpeedBonus ?? 0) - 0.05) < 1e-9, String(survivor?.designSpeedBonus));
    check('carried armies transfer', (survivor?.transportedArmyIds ?? []).includes('army-x'));
    // Before the rewrite this job pointed at a deleted fleet: completeRefit
    // dropped it and the faction was charged for nothing.
    check('a paid yard job follows the ships to the survivor', (world.combat.recruitmentJobs[0] as any).targetFormationId === 'a1');
    check('the enemy fleet died', !world.movement.fleets.has('b1'));
    check('and the lock was released', !world.tacticalLocks?.[SYS]);
}

console.log('\n3. Losses come off the books by what the dead ships were rated');
{
    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    world.movement.fleets.set('a2', mkFleet('a2', A, 5));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    engage();
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1', 'a2'], enemyFleetIds: ['b1'],
        playerResult: { destroyed: false, composition: { battleship: 3 }, strength: 0.5 },
        enemyResult: { destroyed: false, composition: { battleship: 1 }, strength: 0.2 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);

    const survivor: any = world.movement.fleets.get('a1');
    check('only the survivors are left aboard', survivor?.composition?.battleship === 3, JSON.stringify(survivor?.composition));
    check('the books shrink with them', survivor?.designCounts?.[battleship.id] === 3, JSON.stringify(survivor?.designCounts));
    check('power follows what the dead ships were rated', survivor?.basePower === 3 * shipPower, String(survivor?.basePower));
    const roster = rosterByHull(survivor, lookup);
    check('the books still balance', !roster.hulls.battleship.inconsistent && roster.hulls.battleship.unregistered === 0);
    const enemy: any = world.movement.fleets.get('b1');
    check('the enemy side is written down the same way', enemy?.composition?.battleship === 1 && enemy?.designCounts?.[battleship.id] === 1, JSON.stringify(enemy?.designCounts));
}

console.log('\n4. A client-authored result cannot invent ships or fleets');
{
    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    world.movement.fleets.set('c1', mkFleet('c1', 'faction-vektori', 5));
    engage();
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1'], enemyFleetIds: ['b1'],
        playerResult: { destroyed: false, composition: { battleship: 50, corvette: 99 }, strength: 1 },
        enemyResult: { destroyed: true, composition: {}, strength: 0 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);
    const survivor: any = world.movement.fleets.get('a1');
    check('survivors are clamped to what entered the battle', survivor?.composition?.battleship === 5 && !survivor?.composition?.corvette, JSON.stringify(survivor?.composition));
    check('and the books are not inflated', survivor?.designCounts?.[battleship.id] === 5, JSON.stringify(survivor?.designCounts));

    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    world.movement.fleets.set('c1', mkFleet('c1', 'faction-vektori', 5));
    engage();
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1'], enemyFleetIds: ['b1', 'c1'],
        playerResult: { destroyed: false, composition: { battleship: 5 }, strength: 1 },
        enemyResult: { destroyed: true, composition: {}, strength: 0 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);
    check("a third faction's fleet cannot be listed as the enemy's and killed", world.movement.fleets.has('c1'));
    check('and the whole result is refused, so the enemy lives too', world.movement.fleets.has('b1'));

    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1'], enemyFleetIds: ['b1'],
        playerResult: { destroyed: false, composition: { battleship: 5 }, strength: 1 },
        enemyResult: { destroyed: true, composition: {}, strength: 0 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);
    check('a result with no lock is refused', world.movement.fleets.has('b1'));

    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    engage();
    world.nowSeconds = world.tacticalLocks[SYS].until + 1;
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1'], enemyFleetIds: ['b1'],
        playerResult: { destroyed: false, composition: { battleship: 5 }, strength: 1 },
        enemyResult: { destroyed: true, composition: {}, strength: 0 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);
    check('an expired lock is refused, and cleared', world.movement.fleets.has('b1') && !world.tacticalLocks?.[SYS]);
}

console.log('\n5. A fleet that jumped out mid-battle is not in the result');
{
    reset();
    world.movement.fleets.set('a1', mkFleet('a1', A, 5));
    world.movement.fleets.set('a2', mkFleet('a2', A, 5));
    world.movement.fleets.set('b1', mkFleet('b1', B, 5));
    engage();
    // a1 leaves after the battle opened; a2 is the only fleet still holding.
    (world.movement.fleets.get('a1') as any).destinationSystemId = HOME;
    executeOrder(world, 'MIL_TACTICAL_RESULT', {
        systemId: SYS, enemyFactionId: B,
        playerFleetIds: ['a1', 'a2'], enemyFleetIds: ['b1'],
        playerResult: { destroyed: false, composition: { battleship: 10 }, strength: 1 },
        enemyResult: { destroyed: true, composition: {}, strength: 0 },
        winner: A, reason: 'test', durationSeconds: 60,
    }, A);
    const gone: any = world.movement.fleets.get('a1');
    const stayed: any = world.movement.fleets.get('a2');
    check('the fleet that left keeps its own ships', gone?.composition?.battleship === 5 && gone?.designCounts?.[battleship.id] === 5);
    check('the one that stayed cannot claim them', stayed?.composition?.battleship === 5, JSON.stringify(stayed?.composition));
    check('and its books match its hulls', stayed?.designCounts?.[battleship.id] === 5 && !rosterByHull(stayed, lookup).hulls.battleship.inconsistent);
}

world.rivalries.delete(`rivalry-${A}-${B}`);
world.movement.fleets.clear();
world.activeCombats.clear();
world.tacticalLocks = {};

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
