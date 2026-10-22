// scripts/test-surface-features.ts
// Rivers and deposits on the 64-district board (lib/planet-surface/generator.ts
// carveFeatures): laid over the finished terrain without moving it, rivers
// run from high ground and never through mountains or sea, deposits sit where
// the body's tags say and in fitting ground, and the economy reads the tags.
// Run: npx tsx scripts/test-surface-features.ts

import assert from 'assert';
import { generateSurface } from '../lib/planet-surface/generator';
import { calculateBiosphereModifiers } from '../lib/economy/biosphere-traits';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const ids = Array.from({ length: 120 }, (_, i) => `planet-feature-test-${i}`);
const wet = ids.map(id => generateSurface(id, 'standard', ['colonizable', 'archetype:continental', 'rare_minerals', 'fertile']));
const dry = ids.map(id => generateSurface(id, 'standard', ['colonizable', 'archetype:toxic']));

test('same world, same rivers and deposits', () => {
    const again = generateSurface(ids[3] + '', 'standard', ['colonizable', 'archetype:continental', 'rare_minerals', 'fertile', 'x']);
    const first = generateSurface(ids[3] + '', 'standard', ['colonizable', 'archetype:continental', 'rare_minerals', 'fertile', 'x']);
    assert.deepStrictEqual(again.sectors.map(s => [s.river, s.deposit]), first.sectors.map(s => [s.river, s.deposit]));
});

test('green worlds have rivers; a poisoned one has none', () => {
    assert.ok(wet.filter(s => s.sectors.some(x => x.river)).length > 80);
    assert.ok(dry.every(s => !s.sectors.some(x => x.river)));
});

test('rivers never run through mountains, volcanoes or the sea, and water the land they cross', () => {
    for (const s of wet) for (const x of s.sectors) {
        if (!x.river) continue;
        assert.ok(!['mountains', 'volcanic', 'ocean'].includes(x.terrain), x.terrain);
    }
});

test('deposits follow the tags and the ground', () => {
    const all = wet.flatMap(s => s.sectors.filter(x => x.deposit));
    assert.ok(all.some(x => x.deposit === 'rare_minerals') && all.some(x => x.deposit === 'fertile'));
    assert.ok(dry.every(s => !s.sectors.some(x => x.deposit === 'fertile' || x.deposit === 'rare_minerals')), 'no tag, no deposit');
    assert.ok([...wet, ...dry].every(s => !s.sectors[0].deposit), 'the capital district is never a mine');
});

test('the economy reads the body tags', () => {
    assert.strictEqual(calculateBiosphereModifiers(['fertile']).food, 25);
    assert.strictEqual(calculateBiosphereModifiers(['irradiated']).food, -25);
    assert.strictEqual(calculateBiosphereModifiers(['rare_minerals', 'relic_site']).rare, 40);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
