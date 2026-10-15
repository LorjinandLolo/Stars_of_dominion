// scripts/test-forces-view.ts
// The Forces panel's roster: fleets and armies with where they are and what
// they are doing, foreign fleets in your space, and production.
// Run: npx tsx scripts/test-forces-view.ts

import assert from 'assert';
import { buildForcesView, veterancyOf } from '../lib/military/forces-view';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const ME = 'faction-me';
const base = {
    playerFactionId: ME,
    systems: [{ id: 's1', name: 'Aglate', q: 0, r: 0 }, { id: 's2', name: 'Kepler', q: 1, r: 0 }],
    planets: [
        { id: 'p1', name: 'Aglate', systemId: 's1', ownerId: ME },
        { id: 'p2', name: 'Kepler IV', systemId: 's2', ownerId: 'faction-them', siege: { phase: 'LANDING' } },
    ],
    factions: { 'faction-them': { name: 'The Others' } },
    recruitmentJobs: [] as any[],
    activeCombats: [] as any[],
};

const view = buildForcesView({
    ...base,
    fleets: [
        { id: 'f1', factionId: ME, name: 'Home Guard', currentSystemId: 's1', destinationSystemId: null, composition: { corvette: 4 }, basePower: 148, orbitingPlanetId: 'p1' },
        { id: 'f2', factionId: ME, name: 'Raiders', currentSystemId: null, destinationSystemId: 's2', plannedPath: ['s1', 's2'], originSystemId: 's1', etaSeconds: 900, composition: { destroyer: 2, CORVETTE: 1 }, basePower: 300, experience: 0.1, transportedArmyIds: ['a2'] },
        { id: 'f3', factionId: 'faction-them', name: 'Their Fleet', currentSystemId: 's1', composition: { cruiser: 2 }, basePower: 500 },
        { id: 'f4', factionId: 'faction-them', name: 'Far Away', currentSystemId: 's9', composition: { cruiser: 9 }, basePower: 900 },
    ],
    armies: [
        { id: 'a1', factionId: ME, name: '1st Legion', currentPlanetId: 'p2', currentSystemId: 's2', transportFleetId: null, composition: { INFANTRY: 3000, ARMOR: 200 }, basePower: 900, morale: 0.8, supplyLevel: 0.5 },
        { id: 'a2', factionId: ME, name: '2nd Legion', currentPlanetId: null, currentSystemId: 's1', transportFleetId: 'f2', composition: { INFANTRY: 500 }, basePower: 100, morale: 70, supplyLevel: 1 },
    ],
    recruitmentJobs: [
        { id: 'j1', factionId: ME, planetId: 'p1', unitType: 'CORVETTE', classKey: 'corvette', count: 2, completesAt: 2000 },
        { id: 'j2', factionId: 'faction-them', planetId: 'p2', unitType: 'INFANTRY', count: 9, completesAt: 1000 },
    ],
});

test('only my fleets, strongest first, with status and locator system', () => {
    assert.deepStrictEqual(view.fleets.map(f => f.name), ['Raiders', 'Home Guard']);
    const raiders = view.fleets[0];
    assert.strictEqual(raiders.status.kind, 'moving');
    assert.strictEqual(raiders.status.text, 'En route to Kepler');
    assert.strictEqual(raiders.systemId, 's2', 'a fleet in transit is located at its next hop');
    assert.strictEqual(raiders.originSystemId, 's1', 'can turn back');
    assert.strictEqual(raiders.armiesAboard, 1);
    assert.strictEqual(raiders.veterancy.label, 'Seasoned');
    assert.strictEqual(view.fleets[1].status.text, 'In orbit of Aglate');
});

test('ship classes are folded to lowercase and counted', () => {
    const raiders = view.fleets[0];
    assert.deepStrictEqual(raiders.ships, [{ cls: 'destroyer', count: 2 }, { cls: 'corvette', count: 1 }]);
    assert.strictEqual(raiders.shipCount, 3);
});

test('armies say where they stand: fighting on a world, or aboard a fleet', () => {
    const [first, second] = view.armies;
    assert.strictEqual(first.status.text, 'Fighting on Kepler IV');
    assert.strictEqual(first.morale, 80);
    assert.strictEqual(first.supply, 50);
    assert.strictEqual(second.status.text, 'Aboard Raiders');
    assert.strictEqual(second.planetId, null);
});

test('contacts are foreign fleets inside my space only', () => {
    assert.deepStrictEqual(view.contacts.map(c => c.ownerName), ['The Others']);
    assert.strictEqual(view.contacts[0].systemName, 'Aglate');
});

test('production lists my jobs only, soonest first', () => {
    assert.deepStrictEqual(view.production.map(p => p.label), ['2× Corvette']);
});

test('totals add up', () => {
    assert.deepStrictEqual(view.totals, { fleets: 2, ships: 7, armies: 2, troops: 3700, power: 1448 });
});

test('a battle in the system outranks every other status', () => {
    const v = buildForcesView({
        ...base,
        fleets: [{ id: 'f1', factionId: ME, name: 'X', currentSystemId: 's1', composition: { corvette: 1 }, basePower: 1 }],
        armies: [],
        activeCombats: [{ id: 'c', resolved: false, target: { systemId: 's1' } }],
    });
    assert.strictEqual(v.fleets[0].status.kind, 'combat');
});

test('veterancy bands', () => {
    assert.deepStrictEqual([0, 0.02, 0.06, 0.12, 0.25].map(x => veterancyOf(x).label), ['Green', 'Regular', 'Seasoned', 'Veteran', 'Elite']);
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
