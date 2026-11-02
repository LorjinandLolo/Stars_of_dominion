// scripts/test-build-gates.ts
// lib/construction/build-gates.ts must say no exactly when the worker does: the
// Planet Screen shows these reasons instead of letting an order bounce.
// Run: npx tsx scripts/test-build-gates.ts

import assert from 'assert';
import { buildBlockReason } from '../lib/construction/build-gates';
import { BUILDINGS, buildingOpenTo } from '../data/buildings';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const ctx = { unlockedTech: new Set<string>(), techName: (id: string) => `Tech ${id}`, buildingName: (id: string) => `Building ${id}` };
const world = { infrastructureLevel: 5, tags: [], tiles: [], buildQueue: [] };

test('a plain building is open', () => {
    assert.strictEqual(buildBlockReason({ id: 'a', name: 'A' }, world, ctx), null);
});
test('missing research is named', () => {
    assert.strictEqual(buildBlockReason({ id: 'a', name: 'A', techRequired: 't1' }, world, ctx), 'Needs research: Tech t1');
    assert.strictEqual(buildBlockReason({ id: 'a', name: 'A', techRequired: 't1' }, world, { ...ctx, unlockedTech: new Set(['t1']) }), null);
});
test('infrastructure says what the world has', () => {
    assert.match(buildBlockReason({ id: 'a', name: 'A', infrastructureRequired: 3 }, { ...world, infrastructureLevel: 1 }, ctx) ?? '', /level 3 \(this world: 1\)/);
});
test('a missing trait is named', () => {
    assert.match(buildBlockReason({ id: 'a', name: 'A', tagRequirements: ['coastal_land'] }, world, ctx) ?? '', /coastal land/);
});
test('an upgrade needs a working original, not a ruin', () => {
    const def = { id: 'b', name: 'B', upgradesFrom: 'a' };
    assert.match(buildBlockReason(def, world, ctx) ?? '', /Building a/);
    assert.match(buildBlockReason(def, { ...world, tiles: [{ buildingId: 'a', constructionState: 'ruined' }] }, ctx) ?? '', /Building a/);
    assert.strictEqual(buildBlockReason(def, { ...world, tiles: [{ buildingId: 'a', constructionState: 'active' }] }, ctx), null);
});
test('unique per planet counts the queue; a ruin can be rebuilt', () => {
    const def = { id: 'a', name: 'A', uniquePerPlanet: true };
    assert.ok(buildBlockReason(def, { ...world, buildQueue: [{ buildingId: 'a' }] }, ctx));
    assert.strictEqual(buildBlockReason(def, { ...world, tiles: [{ buildingId: 'a', constructionState: 'ruined' }] }, ctx), null);
});
test('unique per empire', () => {
    assert.match(buildBlockReason({ id: 'a', name: 'A', uniquePerEmpire: true }, world, { ...ctx, empireHas: () => true }) ?? '', /already has/);
});
test('every real building gets a readable answer on a fresh world', () => {
    for (const def of BUILDINGS.filter(d => buildingOpenTo(d, undefined))) {
        const r = buildBlockReason(def as any, { infrastructureLevel: 1, tags: [], tiles: [], buildQueue: [] }, ctx);
        assert.ok(r === null || r.length > 5, def.id);
    }
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
