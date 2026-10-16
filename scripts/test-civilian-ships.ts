// scripts/test-civilian-ships.ts
// The four unarmed ships (lib/combat/civilian-ships.ts): the explorer is the
// cheap two-minute first ship, freighters add taxes and run routes, spy ships
// see and cover operations, builders add build sites and plant outposts. None
// of them fight; an armed enemy at war that finds one alone takes it.
// Run: npx tsx scripts/test-civilian-ships.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder } from './game-loop';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { CIVILIAN_SHIPS, isCivilianFleet, scanReachFrom } from '../lib/combat/civilian-ships';
import { refreshDockedCivilians, tickCivilianShips } from '../lib/combat/civilian-service';
import { hullSpeedFactor } from '../lib/combat/fleet-speed';
import { buildSlotsFor } from '../lib/construction/construction-service';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { viewerContextFromOwnShard } from '../lib/persistence/shard-privacy';
import { extractFactionShard } from '../lib/persistence/save-service';
import { getMetric } from '../lib/tech/history-ledger';
import { DEED_SHIPS_COMMISSIONED } from '../lib/tech/deed-metrics';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = quietConsole();
const world: any = bootSoakWorld();
quiet.restore();
const [A, B] = empireIds(world);
const silently = <T>(fn: () => T): T => { const q = quietConsole(); try { return fn(); } finally { q.restore(); } };
const reserves = () => world.economy.factions.get(A).reserves as Record<string, number>;
const lastError = () => world.economy.factions.get(A).lastOrderError?.reason ?? '';
const ownPlanets = () => [...world.construction.planets.values()].filter((p: any) => p.ownerId === A);

// The capital has the starting yard.
const capital: any = ownPlanets().find((p: any) => p.id === world.economy.factions.get(A).capitalPlanetId) ?? ownPlanets()[0];

function build(shipType: string): any {
    reserves().CREDITS = 100_000; reserves().METALS = 100_000;
    const before = new Set(world.movement.fleets.keys());
    silently(() => executeOrder(world, 'MIL_BUILD_CIVILIAN', { planetId: capital.id, shipType }, A));
    const id = [...world.movement.fleets.keys()].find(k => !before.has(k));
    assert.ok(id, `no fleet created: ${lastError()}`);
    // Finish the job.
    const job = world.combat.recruitmentJobs.find((j: any) => j.targetFormationId === id);
    assert.ok(job, 'no recruitment job');
    const now = world.nowSeconds;
    world.nowSeconds = job.completesAt + 1;
    silently(() => RecruitmentService.tick(world));
    world.nowSeconds = now;
    return world.movement.fleets.get(id);
}

let explorer: any;
test('an exploration ship costs 300 Cr / 100 Met and takes two real minutes', () => {
    reserves().CREDITS = 10_000; reserves().METALS = 10_000;
    const before = new Set(world.movement.fleets.keys());
    silently(() => executeOrder(world, 'MIL_BUILD_CIVILIAN', { planetId: capital.id, shipType: 'explorer' }, A));
    assert.strictEqual(reserves().CREDITS, 10_000 - 300, lastError());
    assert.strictEqual(reserves().METALS, 10_000 - 100);
    const id = [...world.movement.fleets.keys()].find(k => !before.has(k))!;
    const job = world.combat.recruitmentJobs.find((j: any) => j.targetFormationId === id);
    assert.strictEqual(job.completesAt - job.startedAt, 120 * 15);
    world.nowSeconds = job.completesAt + 1;
    silently(() => RecruitmentService.tick(world));
    explorer = world.movement.fleets.get(id);
    assert.deepStrictEqual(explorer.composition, { explorer: 1 });
    assert.strictEqual(explorer.basePower, 0);
    assert.ok(isCivilianFleet(explorer));
    assert.match(explorer.name, /^Exploration 1$/);
});

test('it counts for the first goal (ships commissioned)', () => {
    assert.ok(getMetric(world, A, DEED_SHIPS_COMMISSIONED) >= 1);
});

test('explorers are fast, and an unknown civilian type is refused', () => {
    assert.strictEqual(hullSpeedFactor({ explorer: 1 }), 1.5);
    assert.strictEqual(hullSpeedFactor({ explorer: 1, builder: 1 }), 0.8);
    silently(() => executeOrder(world, 'MIL_BUILD_CIVILIAN', { planetId: capital.id, shipType: 'yacht' }, A));
    assert.match(lastError(), /not a civilian ship/);
});

test('an explorer scans and surveys two jumps out, in half the time', () => {
    const neighborsOf = (id: string) => world.movement.systems.get(id)?.hyperlaneNeighbors;
    const reach = scanReachFrom(explorer.currentSystemId, explorer.composition, neighborsOf);
    const oneHop = new Set<string>([explorer.currentSystemId, ...(neighborsOf(explorer.currentSystemId) ?? [])]);
    const far = [...reach].find(id => !oneHop.has(id));
    assert.ok(far, 'there is a system two jumps out');
    world.movement.explorationOrders = world.movement.explorationOrders.filter((o: any) => o.targetSystemId !== far);
    reserves().CREDITS = 100_000;
    silently(() => executeOrder(world, 'EXPLORE_ISSUE_ORDER', { fleetId: explorer.id, targetSystemId: far, mode: 'scan' }, A));
    const order = world.movement.explorationOrders.find((o: any) => o.targetSystemId === far && o.fleetId === explorer.id);
    assert.ok(order, `refused: ${lastError()}`);
    const secs = (Date.parse(order.completesAt) - Date.parse(order.issuedAt)) / 1000;
    assert.strictEqual(secs, 60, 'scan is 120 sim seconds, halved');
});

test('civilian ships never join a battle, and an armed enemy at war takes them alone', () => {
    // Away from the capital, where A's home fleet would be its escort.
    const sys = world.movement.systems.get(explorer.currentSystemId).hyperlaneNeighbors
        .find((id: string) => ![...world.movement.fleets.values()].some((f: any) => f.currentSystemId === id));
    explorer.currentSystemId = sys;
    const raider: any = { ...structuredClone([...world.movement.fleets.values()].find((f: any) => f.factionId === B)), id: 'raider-1', factionId: B, name: 'Raiders', currentSystemId: sys, destinationSystemId: null, composition: { destroyer: 3 }, basePower: 90 };
    world.movement.fleets.set(raider.id, raider);
    world.rivalries.set(`rivalry-${A}-${B}`, { ...(world.rivalries.get(`rivalry-${A}-${B}`) ?? {}), empireAId: A, empireBId: B, escalationLevel: 9 });
    silently(() => processSectorCombats(world));
    const inCombat = [...(world.combat?.activeCombats?.values?.() ?? [])].some((c: any) => JSON.stringify(c).includes(explorer.id));
    assert.ok(!inCombat, 'the explorer is not in a battle');
    silently(() => tickCivilianShips(world));
    const e = world.movement.fleets.get(explorer.id), r = world.movement.fleets.get(raider.id);
    assert.ok(!e, `caught alone, it is lost (explorer at ${e?.currentSystemId}->${e?.destinationSystemId}, raider ${r ? r.currentSystemId + '->' + r.destinationSystemId + ' ' + r.basePower : 'gone'})`);
    world.movement.fleets.delete(raider.id);
    world.rivalries.get(`rivalry-${A}-${B}`).escalationLevel = 0;
});

test('a docked freighter adds to its world’s taxes; three count, a fourth does not', () => {
    const f = build('freighter');
    f.composition.freighter = 5;
    silently(() => refreshDockedCivilians(world));
    assert.deepStrictEqual(capital.dockedCivilians, { freighters: 3, builders: 0 });
    assert.strictEqual(world.economy.planets.get(capital.id).dockedFreighters, 3);
    world.movement.fleets.delete(f.id);
    silently(() => refreshDockedCivilians(world));
    assert.strictEqual(capital.dockedCivilians, undefined);
});

test('a docked builder adds a build site', () => {
    const before = buildSlotsFor(capital);
    const b = build('builder');
    silently(() => refreshDockedCivilians(world));
    assert.strictEqual(buildSlotsFor(capital), before + 1);
    world.movement.fleets.delete(b.id);
    silently(() => refreshDockedCivilians(world));
});

test('a builder spent on an empty surveyed world plants an outpost there, even a dead one', () => {
    const b = build('builder');
    const target: any = [...world.construction.planets.values()].find((p: any) => p.systemId === capital.systemId && !p.ownerId);
    if (!target) { console.log('        (no free world in the capital system; skipped)'); return; }
    const wasDead = target.tags.includes('dead_matter');
    reserves().CREDITS = 5_000;
    silently(() => executeOrder(world, 'CIV_FOUND_OUTPOST', { fleetId: b.id, planetId: target.id }, A));
    assert.strictEqual(target.ownerId, A, lastError());
    assert.ok(target.tags.includes('outpost'));
    assert.strictEqual(target.tags.includes('dead_matter'), wasDead);
    assert.strictEqual(world.economy.planets.get(target.id).tags, target.tags, 'tag array still shared');
    assert.strictEqual(reserves().CREDITS, 3_000);
    assert.ok(!world.movement.fleets.has(b.id), 'the builder was spent');
});

test('a freighter route hauls goods between two own worlds and pays per unit', () => {
    const worlds = ownPlanets();
    if (worlds.length < 2) { console.log('        (one world only; skipped)'); return; }
    const [from, to] = [capital, worlds.find((p: any) => p.id !== capital.id)];
    const f = build('freighter');
    silently(() => executeOrder(world, 'CIV_SET_TRADE_ROUTE', { fleetId: f.id, fromPlanetId: from.id, toPlanetId: to.id }, A));
    const live = world.movement.fleets.get(f.id);
    assert.ok(live.tradeRoute, lastError());
    const src = world.economy.planets.get(from.id).stockpile;
    src.metals = 5000;
    world.economy.planets.get(to.id).stockpile.metals = 0;
    silently(() => tickCivilianShips(world));
    const after = world.movement.fleets.get(f.id);
    if (from.systemId === to.systemId) {
        // One system: loaded and delivered in the same cycle.
        assert.strictEqual(after.tradeRoute.delivered, 400);
        assert.strictEqual(world.economy.planets.get(to.id).stockpile.metals, 400);
    } else {
        assert.strictEqual(after.tradeRoute.cargo?.resource, 'metals');
        assert.strictEqual(after.tradeRoute.cargo.amount, 400);
        assert.strictEqual(after.destinationSystemId, to.systemId, 'sailing to the other end');
        // Arrive and unload.
        Object.assign(after, { currentSystemId: to.systemId, destinationSystemId: null, plannedPath: [] });
        const credits = reserves().CREDITS;
        silently(() => tickCivilianShips(world));
        assert.strictEqual(world.movement.fleets.get(f.id).tradeRoute.delivered, 400);
        assert.strictEqual(reserves().CREDITS, credits + 200);
    }
    world.movement.fleets.delete(f.id);
});

test('a freighter parked at a trade partner’s world earns credits for both, only with a pact', () => {
    const host: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B);
    const f = build('freighter');
    Object.assign(f, { currentSystemId: host.systemId, orbitingPlanetId: host.id, destinationSystemId: null });
    const theirs = world.economy.factions.get(B).reserves as Record<string, number>;
    const mine0 = reserves().CREDITS, theirs0 = theirs.CREDITS;
    silently(() => tickCivilianShips(world));
    assert.strictEqual(reserves().CREDITS, mine0, 'no pact, no trade');
    world.tradePacts.set('pact-test', { id: 'pact-test', empireAId: A, empireBId: B });
    silently(() => tickCivilianShips(world));
    assert.strictEqual(reserves().CREDITS, mine0 + 250);
    assert.strictEqual(theirs.CREDITS, theirs0 + 125);
    world.tradePacts.delete('pact-test');
    world.movement.fleets.delete(f.id);
});

test('warships and civilian ships fly in separate fleets', () => {
    const civ = build('spy');
    const war: any = [...world.movement.fleets.values()].find((f: any) => f.factionId === A && !isCivilianFleet(f) && Object.values(f.composition ?? {}).some((n: any) => n > 0));
    if (!war) { console.log('        (no warship fleet; skipped)'); world.movement.fleets.delete(civ.id); return; }
    Object.assign(war, { currentSystemId: civ.currentSystemId, destinationSystemId: null });
    silently(() => executeOrder(world, 'MIL_MERGE_FLEETS', { sourceFleetId: civ.id, targetFleetId: war.id }, A));
    assert.match(lastError(), /separate fleets/);
    assert.ok(world.movement.fleets.has(civ.id));
    world.movement.fleets.delete(civ.id);
});

test('a spy ship sees its system and one jump around, through the shard', () => {
    const spy = build('spy');
    silently(() => refreshDockedCivilians(world));
    const ctx = viewerContextFromOwnShard(extractFactionShard(world, A))!;
    for (const n of world.movement.systems.get(spy.currentSystemId).hyperlaneNeighbors) {
        assert.ok(ctx.presenceSystems.has(n), `sees ${n}`);
    }
    world.movement.fleets.delete(spy.id);
});

test('every civilian type has a build card price and time', () => {
    for (const def of Object.values(CIVILIAN_SHIPS)) {
        assert.ok(def.cost.CREDITS > 0 && def.buildSeconds > 0 && def.role.length > 0, def.id);
    }
    assert.ok(CIVILIAN_SHIPS.explorer.buildSeconds / 15 <= 120, 'the first ship is two minutes or less');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
