// scripts/test-defence-sabotage.ts
// Agents soften a world before the fleet comes, and counter-intelligence
// brings the defences back (lib/espionage/defence-sabotage.ts): orbital
// defences offline, shields dark, guns spiked; restored early or when the
// time runs out.
// Run: npx tsx scripts/test-defence-sabotage.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { sabotageDefences, restoreSabotage, tickSabotageRecovery, sabotagedIn } from '../lib/espionage/defence-sabotage';
import { OPERATION_CATALOG_BY_ID } from '../lib/espionage/operation-catalog';
import { computeOrbitalRatings, isOrbitSuppressed } from '../lib/orbital/orbital-service';
import { fortificationLevelFor } from '../lib/combat/siege/strongpoints';
import { createOutpostState } from '../lib/outposts/outpost-map';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = quietConsole();
const world: any = bootSoakWorld();
quiet.restore();
const [, B] = empireIds(world);
const target: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B);
const sys = target.systemId;
const DAY2 = 172800;

function fortify() {
    target.tiles = (target.tiles ?? []).filter((t: any) => !String(t.tileId).startsWith('test-'));
    target.tiles.push(
        { tileId: 'test-shield', buildingId: 'shield_generator', constructionState: 'active', sectorIndex: 40 },
        { tileId: 'test-guns', buildingId: 'orbital_defense_platform', constructionState: 'active', sectorIndex: 41 },
    );
    target.orbital = {
        slots: [
            { slotId: 's1', structureId: 'orbital_defense_network', state: 'active', completesAt: null, integrity: 100 },
            { slotId: 's2', structureId: 'shield_projector_array', state: 'active', completesAt: null, integrity: 100 },
            { slotId: 's3', structureId: 'trade_station', state: 'active', completesAt: null, integrity: 100 },
        ],
        buildQueue: [],
    };
}
fortify();

test('the operations are in the catalog: three sabotage, one counter-intelligence', () => {
    for (const id of ['sabotage_orbital_defences', 'sabotage_shield', 'sabotage_guns']) assert.strictEqual(OPERATION_CATALOG_BY_ID.get(id)?.category, 'sabotage', id);
    assert.strictEqual(OPERATION_CATALOG_BY_ID.get('restore_defences')?.category, 'counter_intelligence');
});

test('orbital defences go offline: the orbit falls, a trade station is left alone', () => {
    const before = computeOrbitalRatings(target, world.nowSeconds).defensePower;
    const hit = sabotageDefences(world, B, sys, 'orbital', DAY2);
    assert.deepStrictEqual(hit.flatMap(h => h.hit).length, 1);
    assert.strictEqual(target.orbital.slots[0].state, 'offline');
    assert.strictEqual(target.orbital.slots[2].state, 'active', 'not the trade station');
    assert.ok(computeOrbitalRatings(target, world.nowSeconds).defensePower < before);
});

test('the shield goes dark, on the surface and in orbit', () => {
    sabotageDefences(world, B, sys, 'shield', DAY2);
    const tile = target.tiles.find((t: any) => t.tileId === 'test-shield');
    assert.strictEqual(tile.constructionState, 'ruined');
    assert.ok(tile.sabotage?.restoreAt > world.nowSeconds);
    assert.strictEqual(target.orbital.slots[1].state, 'offline');
});

test('the guns are spiked: the surface platform and an outpost battery, and they dig nobody in', () => {
    const out = createOutpostState({ id: target.id }, world.nowSeconds);
    out.cells[7].module = 'battery'; out.cells[7].terrain = 'flat';
    target.outpost = out;
    const fortBefore = fortificationLevelFor(target);
    sabotageDefences(world, B, sys, 'guns', DAY2);
    assert.strictEqual(target.tiles.find((t: any) => t.tileId === 'test-guns').constructionState, 'ruined');
    assert.ok((out.cells[7].downUntilShift ?? 0) > out.shift);
    assert.ok(fortificationLevelFor(target) < fortBefore, `${fortificationLevelFor(target)} < ${fortBefore}`);
    assert.ok(sabotagedIn(world, B, sys).length >= 4, sabotagedIn(world, B, sys).join(', '));
});

test('counter-intelligence restores it all at once', () => {
    const n = restoreSabotage(world, B, sys);
    assert.ok(n >= 4, `${n}`);
    assert.strictEqual(target.orbital.slots[0].state, 'active');
    assert.strictEqual(target.tiles.find((t: any) => t.tileId === 'test-shield').constructionState, 'active');
    assert.ok(!(target.outpost.cells[7].downUntilShift > target.outpost.shift));
    assert.strictEqual(sabotagedIn(world, B, sys).length, 0);
});

test('left alone, it wears off when the time is up, not before', () => {
    sabotageDefences(world, B, sys, 'orbital', DAY2);
    world.nowSeconds += DAY2 / 2;
    tickSabotageRecovery(world);
    assert.strictEqual(target.orbital.slots[0].state, 'offline');
    world.nowSeconds += DAY2;
    tickSabotageRecovery(world);
    assert.strictEqual(target.orbital.slots[0].state, 'active');
});

test('a building ruined in battle is not "restored" by counter-intelligence', () => {
    const tile = target.tiles.find((t: any) => t.tileId === 'test-guns');
    tile.constructionState = 'ruined'; delete tile.sabotage;
    restoreSabotage(world, B, sys);
    assert.strictEqual(tile.constructionState, 'ruined');
});

test('with nothing defending the orbit, it reads as suppressed', () => {
    fortify();
    target.orbital.slots = target.orbital.slots.filter((s: any) => s.structureId === 'orbital_defense_network');
    assert.ok(!isOrbitSuppressed(target));
    sabotageDefences(world, B, sys, 'orbital', DAY2);
    assert.ok(isOrbitSuppressed(target), 'the fleet can land');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
