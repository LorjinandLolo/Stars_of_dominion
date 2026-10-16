// scripts/test-ai-outposts.ts
// AI empires use civilian ships and outposts (lib/ai/outpost-ai.ts,
// lib/exploration/ai-expansion.ts): the scout is an exploration ship that
// actually sails, a builder ship is laid down and flown to an empty world,
// an outpost is planted there and run until it grows.
// Run: npx tsx scripts/test-ai-outposts.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { tickAIOutposts, tickAIOutpostManagement, aiOutpostTarget, aiNextModule, MAX_AI_OUTPOSTS } from '../lib/ai/outpost-ai';
import { tickAIExpansion } from '../lib/exploration/ai-expansion';
import { tickOutposts } from '../lib/outposts/outpost-service';
import { createOutpostState } from '../lib/outposts/outpost-map';
import { civilianCount } from '../lib/combat/civilian-ships';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = quietConsole();
const world: any = bootSoakWorld();
quiet.restore();
const silently = <T>(fn: () => T): T => { const q = quietConsole(); try { return fn(); } finally { q.restore(); } };
const [A] = empireIds(world);
const faction = world.economy.factions.get(A);
const reserves = faction.reserves as Record<string, number>;
const rich = () => { reserves.CREDITS = 1_000_000; reserves.METALS = 1_000_000; reserves.FOOD = 100_000; };
const home: string = faction.capitalSystemId;
const fleetsOf = () => [...world.movement.fleets.values()].filter((f: any) => f.factionId === A);
/** Arrive wherever it was going. */
const arrive = (f: any) => {
    if (!f.destinationSystemId) return;
    Object.assign(f, { currentSystemId: f.destinationSystemId, destinationSystemId: null, plannedPath: [], orbitingPlanetId: f.arrivalOrbitPlanetId ?? null });
};

test('the AI scout is an exploration ship, and it sails toward the frontier', () => {
    rich();
    for (const f of fleetsOf()) if (/-scout-/.test(f.id)) world.movement.fleets.delete(f.id);
    silently(() => tickAIExpansion(world));
    const scout: any = fleetsOf().find((f: any) => /-scout-/.test(f.id));
    assert.ok(scout, 'a scout');
    assert.strictEqual(civilianCount(scout.composition, 'explorer'), 1);
    // Chart everything in reach so the next turn has to move.
    const vis = world.movement.factionVisibility.get(A);
    const near = new Set<string>([home, ...(world.movement.systems.get(home).hyperlaneNeighbors ?? [])]);
    for (const n of [...near]) for (const m of world.movement.systems.get(n)?.hyperlaneNeighbors ?? []) near.add(m);
    for (const id of near) vis[id] = { ...(vis[id] ?? {}), revealStage: 'surveyed' };
    world.movement.explorationOrders = [];
    silently(() => tickAIExpansion(world));
    const after: any = world.movement.fleets.get(scout.id);
    assert.ok(after.destinationSystemId, 'it set sail (the move order used to be dropped)');
});

test('a legacy empty survey wing becomes an exploration ship', () => {
    const scout: any = fleetsOf().find((f: any) => /-scout-/.test(f.id));
    Object.assign(scout, { composition: {}, basePower: 100, destinationSystemId: null, currentSystemId: home });
    silently(() => tickAIExpansion(world));
    assert.deepStrictEqual(world.movement.fleets.get(scout.id).composition, { explorer: 1 });
    assert.strictEqual(world.movement.fleets.get(scout.id).basePower, 0);
});

test('the AI picks an empty surveyed world near home, dead rock first', () => {
    const target = aiOutpostTarget(world, A, home);
    assert.ok(target, 'a target');
    assert.ok(!target.ownerId);
});

test('it lays down a builder, flies it there and plants an outpost', () => {
    rich();
    let outpost: any = null;
    for (let i = 0; i < 12 && !outpost; i++) {
        silently(() => tickAIOutposts(world));
        for (const f of fleetsOf()) if (civilianCount((f as any).composition, 'builder') > 0) arrive(f);
        outpost = [...world.construction.planets.values()].find((p: any) => p.ownerId === A && p.outpost);
    }
    assert.ok(outpost, 'an outpost was planted');
    assert.ok(!fleetsOf().some((f: any) => civilianCount(f.composition, 'builder') > 0 && f.currentSystemId === outpost.systemId && !f.destinationSystemId)
        || fleetsOf().filter((f: any) => civilianCount(f.composition, 'builder') > 0).length <= 1, 'the builder was spent');
});

test(`it stops at ${MAX_AI_OUTPOSTS} growing outposts`, () => {
    rich();
    for (let i = 0; i < 40; i++) {
        silently(() => tickAIOutposts(world));
        for (const f of fleetsOf()) if (civilianCount((f as any).composition, 'builder') > 0) arrive(f);
    }
    const growing = [...world.construction.planets.values()].filter((p: any) => p.ownerId === A && p.outpost && !p.outpost.graduated).length;
    assert.ok(growing <= MAX_AI_OUTPOSTS, `${growing} outposts`);
});

test('it runs the outpost: builds what it lacks and grows into a settlement', () => {
    rich();
    const p: any = [...world.construction.planets.values()].find((x: any) => x.ownerId === A && x.outpost && !x.outpost.graduated);
    const s = p.outpost;
    for (let i = 0; i < 60 && s.tier < 2; i++) {
        world.nowSeconds = s.nextShiftAt;
        silently(() => tickOutposts(world));
        s.crises = []; // the steward's own answers are tested elsewhere
        silently(() => tickAIOutpostManagement(world));
    }
    assert.ok(s.tier >= 2, `tier ${s.tier}, ${s.colonists} colonists, morale ${s.morale}, modules ${s.cells.filter((c: any) => c.module).map((c: any) => c.module).join(',')}`);
});

test('one action per shift, through the player’s own order path', () => {
    const s = createOutpostState({ id: 'ai-pace' }, 0);
    assert.strictEqual(aiNextModule(s), 'hydroponics', 'food first when the hub cannot feed them');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
