// scripts/test-empire-size.ts
// What size costs (lib/government/admin-capacity.ts, empire-upkeep.ts):
// administrative capacity, colony upkeep, the overextension cohesion driver,
// and Enlightenment counting star systems instead of planets.
// The behavioural check is scripts/empire-size-probe.ts.
// Run: npx tsx scripts/test-empire-size.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import {
    adminStatus, colonyUpkeep, overextensionCohesion, heldSystemCount,
    ADMIN_BASE_SYSTEMS, ADMIN_PER_CENTER, COLONY_UPKEEP_CREDITS, OVEREXTENSION_COHESION_MAX, UNPAID_UPKEEP_STABILITY,
} from '../lib/government/admin-capacity';
import { tickEmpireUpkeep } from '../lib/government/empire-upkeep';
import { computeCohesionDrivers } from '../lib/government/cohesion-service';
import { readEnlightenmentConditions } from '../lib/victory/victory-service';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const P = (id: string, systemId: string, extra: any = {}) => ({ id, ownerId: 'f', systemId, ...extra });

test('capacity: six systems, three more per working Administrative Center', () => {
    const planets = [P('a', 's1', { tiles: [{ buildingId: 'administrative_center', constructionState: 'active' }] }), P('b', 's1'), P('c', 's2')];
    const st = adminStatus(planets, 'f');
    assert.strictEqual(st.systems, 2, 'two worlds in one system count once');
    assert.strictEqual(st.capacity, ADMIN_BASE_SYSTEMS + ADMIN_PER_CENTER);
    assert.strictEqual(st.over, 0);
    planets[0].tiles![0].constructionState = 'under_construction';
    assert.strictEqual(adminStatus(planets, 'f').capacity, ADMIN_BASE_SYSTEMS, 'only working centers count');
});

test('outposts still growing count for nothing; a graduated one is a colony', () => {
    const planets = [P('a', 's1'), P('b', 's2', { outpost: { graduated: false } }), P('c', 's3', { outpost: { graduated: true } })];
    assert.strictEqual(adminStatus(planets, 'f').systems, 2);
    assert.strictEqual(heldSystemCount(planets, 'f'), 2);
});

test('overextension costs cohesion in proportion, to a floor', () => {
    const at = (systems: number) => overextensionCohesion({ systems, capacity: 6, centers: 0, over: Math.max(0, systems - 6) });
    assert.strictEqual(at(6), -0);
    assert.ok(at(9) < 0 && at(9) > at(18), 'more systems over, more cost');
    assert.strictEqual(at(100), -OVEREXTENSION_COHESION_MAX);
});

test('upkeep grows with distance and with overextension, to a cap', () => {
    const fine = { systems: 4, capacity: 6, centers: 0, over: 0 };
    const sprawl = { systems: 60, capacity: 6, centers: 0, over: 54 };
    assert.strictEqual(colonyUpkeep(0, fine), COLONY_UPKEEP_CREDITS);
    assert.ok(colonyUpkeep(5, fine) > colonyUpkeep(1, fine));
    assert.strictEqual(colonyUpkeep(0, sprawl), COLONY_UPKEEP_CREDITS * 3, 'strain capped at x3');
});

const quiet = quietConsole();
const world: any = bootSoakWorld();
quiet.restore();
const [A] = empireIds(world);
const faction = world.economy.factions.get(A);
const home: string = faction.capitalSystemId;
const free = [...world.construction.planets.values()].filter((p: any) => !p.ownerId && p.systemId !== home);
const bySystem = new Map<string, any>();
for (const p of free) if (!bySystem.has(p.systemId)) bySystem.set(p.systemId, p);
const colonies = [...bySystem.values()].slice(0, 12);
for (const p of colonies) p.ownerId = A;

test('upkeep is charged each cycle and taken out of the income the top bar shows', () => {
    faction.reserves.CREDITS = 1_000_000;
    faction.lastIncome = { total: { CREDITS: 10_000 }, creditsByPlanet: {} };
    tickEmpireUpkeep(world);
    const rec = faction.lastUpkeep;
    assert.ok(rec && rec.credits > 0, 'a bill');
    assert.strictEqual(rec.colonies, colonies.length);
    assert.strictEqual(faction.reserves.CREDITS, 1_000_000 - rec.paid);
    assert.strictEqual(faction.lastIncome.total.CREDITS, 10_000 - rec.paid);
});

test('an unpaid bill is neglect: every colony loses stability', () => {
    faction.reserves.CREDITS = 0;
    for (const p of colonies) p.stability = 60;
    tickEmpireUpkeep(world);
    assert.ok(colonies.every((p: any) => p.stability === 60 - UNPAID_UPKEEP_STABILITY));
});

test('an overextended empire’s worlds carry the overextension driver', () => {
    const { drivers } = computeCohesionDrivers(world, colonies[0].id);
    const d = drivers.find(x => x.id === 'overextension');
    assert.ok(d && d.delta < 0, JSON.stringify(drivers.map(x => x.id)));
});

test('Enlightenment counts star systems, not planets', () => {
    const row = readEnlightenmentConditions(A, world).find(r => r.id === 'worlds')!;
    assert.strictEqual(row.value, heldSystemCount(world.construction.planets.values(), A));
    assert.match(row.label, /systems/i);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
