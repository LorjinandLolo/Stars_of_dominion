// scripts/test-body-generator.ts
// What a survey finds (lib/exploration/body-generator.ts): the star sets the
// count and the habitable band, the orbit sets what forms, size and
// habitability set a colony's population, deposits and moons are real, and
// the surface board matches the body.
// Run: npx tsx scripts/test-body-generator.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { planSystemBodies, materializeSystemBodies, colonyCapacity, systemHasBodies } from '../lib/exploration/body-generator';
import { classifyStar } from '../lib/galaxy/star-class';
import { inferArchetype } from '../lib/planet-surface/generator';
import { PLANET_ARCHETYPES } from '../lib/planet-surface/types';
import { colonizePlanet, canSeeSystem } from '../lib/exploration/colonize-service';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = quietConsole();
const world: any = bootSoakWorld();
quiet.restore();
const [A] = empireIds(world);
const systems: any[] = [...world.movement.systems.values()];
const all = systems.map(s => ({ s, star: classifyStar(s).key, bodies: planSystemBodies(s) }));
const bodies = all.flatMap(x => x.bodies);

test('same system, same bodies', () => {
    for (const { s, bodies: b } of all.slice(0, 50)) assert.deepStrictEqual(planSystemBodies(s), b);
});

test('the star decides the system: blue giants crowded, dead stars bare', () => {
    const avg = (k: string) => { const xs = all.filter(x => x.star === k); return xs.reduce((n, x) => n + x.bodies.filter(b => !b.parentId).length, 0) / Math.max(1, xs.length); };
    assert.ok(avg('blueGiant') > avg('redDwarf'), `${avg('blueGiant')} > ${avg('redDwarf')}`);
    const dead = all.filter(x => x.star === 'blackHole').flatMap(x => x.bodies);
    assert.ok(dead.every(b => !b.colonizable), 'nothing lives around a black hole');
    const hot = all.filter(x => x.star === 'neutron' || x.star === 'pulsar').flatMap(x => x.bodies).filter(b => b.colonizable);
    assert.ok(hot.every(b => b.tags.includes('irradiated')), 'neutron stars and pulsars irradiate their worlds');
});

test('the orbit decides the world: gas giants out cold, gardens in the band', () => {
    const giants = bodies.filter(b => b.type === 'gas_giant');
    assert.ok(giants.length > 20 && giants.every(b => b.zone === 'cold'), `${giants.length} gas giants, all cold`);
    const gardens = bodies.filter(b => /archetype:(continental|gaia|oceanic|jungle|swamp)/.test(b.tags.join(' ')));
    assert.ok(gardens.length > 50 && gardens.every(b => b.zone === 'temperate'));
    const ice = bodies.filter(b => b.type === 'arctic');
    assert.ok(ice.every(b => b.zone === 'cold'));
});

test('worlds differ: size, habitability and population vary; gaia beats a frozen rock', () => {
    const col = bodies.filter(b => b.colonizable);
    const caps = new Set(col.map(b => b.popCapacity));
    assert.ok(caps.size > 30, `${caps.size} distinct capacities`);
    assert.ok(new Set(col.map(b => b.size)).size === 3);
    const mean = (xs: any[]) => xs.reduce((n, b) => n + b.habitability, 0) / Math.max(1, xs.length);
    assert.ok(mean(col.filter(b => b.tags.includes('archetype:gaia'))) > mean(col.filter(b => b.tags.includes('archetype:frozen'))) + 30);
    assert.ok(col.every(b => b.maxTiles >= 4 && b.maxTiles <= 12));
});

test('every archetype tag is a real archetype, and the surface reads it', () => {
    for (const b of bodies) {
        const tag = b.tags.find(t => t.startsWith('archetype:'));
        if (!tag) continue;
        const name = tag.slice('archetype:'.length);
        assert.ok(PLANET_ARCHETYPES.includes(name as any), tag);
        assert.strictEqual(inferArchetype(b.id, b.type, b.tags), name);
    }
});

test('deposits and moons are there to find', () => {
    for (const t of ['rare_minerals', 'geothermal', 'ice', 'helium3', 'fertile']) {
        assert.ok(bodies.some(b => b.tags.includes(t)), t);
    }
    const moons = bodies.filter(b => b.parentId);
    assert.ok(moons.length > 20);
    for (const m of moons) {
        const parent = bodies.find(b => b.id === m.parentId)!;
        assert.ok(parent && (parent.type === 'gas_giant' || parent.size === 'large'));
        assert.strictEqual(m.orbitIndex, parent.orbitIndex);
        assert.ok(m.name.startsWith(parent.name));
    }
});

test('roughly two bodies a system, some systems empty', () => {
    const per = bodies.length / systems.length;
    assert.ok(per > 1.6 && per < 2.8, `${per.toFixed(2)} per system`);
    assert.ok(all.some(x => !x.bodies.length));
});

test('a colony holds what its world can: the body\'s capacity, not a flat 50', () => {
    const sys = all.find(x => x.bodies.some(b => b.colonizable && b.popCapacity !== 50) && !systemHasBodies(world, x.s.id))!;
    materializeSystemBodies(world, sys.s.id);
    const spec = sys.bodies.find(b => b.colonizable && b.popCapacity !== 50)!;
    const planet = world.construction.planets.get(spec.id);
    assert.strictEqual(planet.habitability, spec.habitability);
    world.movement.factionVisibility.get(A)[sys.s.id] = { revealStage: 'surveyed' };
    if (!canSeeSystem(world, A, sys.s.id)) return;
    const r = world.economy.factions.get(A).reserves; for (const k of Object.keys(r)) r[k] = 1e6;
    const res = colonizePlanet(world, A, spec.id);
    assert.ok(res.ok, res.reason);
    assert.strictEqual(planet.popCapacity, spec.popCapacity);
    assert.strictEqual(world.economy.planets.get(spec.id).demographics.housingCapacity, spec.popCapacity);
    assert.strictEqual(colonyCapacity({ habitability: 80, size: 'large' }), 112);
    assert.strictEqual(colonyCapacity({ habitability: 80, size: 'large' }, true), 50, 'domes hold 50');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
