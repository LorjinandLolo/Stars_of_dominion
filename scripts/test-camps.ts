// scripts/test-camps.ts
// Camp worlds (lib/camps/labour-camp.ts + CAMP_ORDER / POW 'camp' /
// startCampBreakout in scripts/game-loop.ts): designate, fill (POWs, purges,
// deportations, a beaten native people), what each mode gives, penal
// battalions, forged soldiers, and breakouts that are crushed or win.
// Run: npx tsx scripts/test-camps.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder, processSieges, startCampBreakout } from './game-loop';
import { tickCamps, musterForged, breakoutChance, campBuildSpeed, CAMP_BUILD_SPEED, MORTALITY } from '../lib/camps/labour-camp';
import { ensureLedger } from '../lib/combat/siege/prisoners';
import { colonizePlanet } from '../lib/exploration/colonize-service';
import { aiCommandGroundWars } from '../lib/ai/war-ai';

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
const [A, B] = empireIds(world);
const lastError = (f: string) => world.economy.factions.get(f).lastOrderError?.reason ?? '';
if (!world.movement.armies) world.movement.armies = new Map();
const r = world.economy.factions.get(A).reserves; for (const k of Object.keys(r)) r[k] = 1e6; r.CREDITS = 1e7;
const order = (payload: any) => silently(() => executeOrder(world, 'CAMP_ORDER', payload, A));

const owned: any[] = [...world.construction.planets.values()].filter((p: any) => p.ownerId === A);
const capital = owned.find(p => p.planetType === 'capital') ?? owned[0];
// A colony to turn into the camp, and one more of ours to purge.
const empties: any[] = [...world.construction.planets.values()].filter((p: any) => !p.ownerId && (p.tags ?? []).includes('colonizable') && !p.natives);
function colony(): any {
    const p = empties.shift();
    world.movement.factionVisibility.get(A)[p.systemId] = { revealStage: 'surveyed' };
    // A full colony: PLANET_CLAIM now lands an outpost, and an outpost cannot be a camp.
    silently(() => colonizePlanet(world, A, p.id));
    assert.strictEqual(p.ownerId, A, lastError(A));
    return p;
}
const campWorld = colony();
const homeWorld = colony();

test('any empire can make a colony a camp world; not its capital', () => {
    order({ action: 'designate', planetId: capital.id });
    assert.match(lastError(A), /capital/i);
    const before = r.CREDITS;
    order({ action: 'designate', planetId: campWorld.id });
    assert.ok(campWorld.camp, lastError(A));
    assert.ok(r.CREDITS < before && campWorld.tags.includes('labour_camp'));
    assert.strictEqual(campBuildSpeed(campWorld), CAMP_BUILD_SPEED, 'labour gangs build faster');
});

test('prisoners of war can be shipped to the camps', () => {
    const ledger = ensureLedger(world.combat ?? (world.combat = { recruitmentJobs: [] }));
    ledger.groups.push({ id: 'pow-camp-test', ownerEmpireId: B, captorEmpireId: A, planetId: campWorld.id, planetName: campWorld.name, unitType: 'INFANTRY', count: 800, capturedAtSeconds: world.nowSeconds } as any);
    silently(() => executeOrder(world, 'POW_DISPOSE', { groupId: 'pow-camp-test', disposition: 'camp' }, A));
    assert.strictEqual(campWorld.camp.byOrigin.pow, 800, lastError(A));
    assert.strictEqual(ledger.groups.find((g: any) => g.id === "pow-camp-test")?.resolved, 'camp');
});

test('a purge quiets a world and fills the camp; not twice in a day', () => {
    homeWorld.unrest = 60;
    order({ action: 'purge', planetId: campWorld.id, fromPlanetId: homeWorld.id });
    assert.ok(homeWorld.unrest < 60 && campWorld.camp.byOrigin.dissidents > 0, lastError(A));
    order({ action: 'purge', planetId: campWorld.id, fromPlanetId: homeWorld.id });
    assert.match(lastError(A), /too recently/);
});

test('deportation only from a conquered world', () => {
    order({ action: 'deport', planetId: campWorld.id, fromPlanetId: homeWorld.id });
    assert.match(lastError(A), /our own/);
    homeWorld.conqueredFrom = B;
    homeWorld.population = 40;
    world.nowSeconds += 90000; // past the purge cooldown
    order({ action: 'deport', planetId: campWorld.id, fromPlanetId: homeWorld.id });
    assert.ok(campWorld.camp.byOrigin.conquered > 0, lastError(A));
    assert.ok(homeWorld.population < 40);
});

test('labour: metals, materiel and ammo every tick, and the camps kill', () => {
    campWorld.camp.inmates = 5000;
    campWorld.garrison = { ...(campWorld.garrison ?? {}), garrisonTroops: 5000 };
    const before = { m: r.METALS, mat: r.MATERIEL ?? 0, ammo: r.AMMO ?? 0 };
    tickCamps(world);
    assert.ok(r.METALS > before.m && (r.MATERIEL ?? 0) > before.mat && (r.AMMO ?? 0) > before.ammo);
    assert.strictEqual(campWorld.camp.inmates, Math.floor(5000 * (1 - MORTALITY.labour)));
});

test('experiments: research, faster deaths', () => {
    order({ action: 'mode', planetId: campWorld.id, mode: 'experiments' });
    const tech = world.tech.get(A) ?? (world.tech.set(A, { activeSlots: [] }), world.tech.get(A));
    tech.activeSlots = [{ slotId: 's', techId: 'any', status: 'researching', progressHours: 0, ticksCompleted: 0, ticksRequired: 10, startTime: 0 }];
    const n = campWorld.camp.inmates;
    tickCamps(world);
    assert.ok(tech.activeSlots[0].progressHours > 0);
    assert.ok(campWorld.camp.inmates < n * (1 - MORTALITY.labour));
});

test('forge: survivors become elite soldiers on the camp world', () => {
    order({ action: 'mode', planetId: campWorld.id, mode: 'forge' });
    campWorld.camp.inmates = 10000;
    for (const ev of tickCamps(world)) if (ev.kind === 'forged') musterForged(world, campWorld, ev.men!);
    const forged = [...world.movement.armies.values()].find((a: any) => a.currentPlanetId === campWorld.id && a.name.startsWith('The Forged'));
    assert.ok(forged && forged.composition.SPECIAL_OPS >= 50, `forged ${forged?.composition?.SPECIAL_OPS}`);
});

test('penal battalions are drafted from the inmates', () => {
    const n = campWorld.camp.inmates;
    order({ action: 'draft', planetId: campWorld.id });
    const bn = [...world.movement.armies.values()].find((a: any) => a.currentPlanetId === campWorld.id && a.name.startsWith('Penal Battalion'));
    assert.ok(bn && bn.composition.MILITIA > 0, lastError(A));
    assert.ok(campWorld.camp.inmates < n);
});

test('a beaten native people can be shipped to the camp', () => {
    const p = empties.shift();
    p.natives = { speciesName: 'Kiwok', kind: 'arboreal', gift: 'scouts', techLevel: 'stone', disposition: 'curious', population: 100, warriors: 0, maxWarriors: 400, status: 'pacified', overlordId: A, contacted: true, relations: {}, observers: {} };
    world.movement.factionVisibility.get(A)[p.systemId] = { revealStage: 'surveyed' };
    const before = campWorld.camp.byOrigin.natives;
    silently(() => executeOrder(world, 'NATIVE_ACTION', { planetId: p.id, action: 'camp' }, A));
    assert.ok(campWorld.camp.byOrigin.natives > before, lastError(A));
    assert.strictEqual(p.ownerId, A);
});

test('too few guards: the risk of a breakout climbs', () => {
    assert.ok(breakoutChance(3000, 2000) < 0.01);
    assert.ok(breakoutChance(30000, 500) > 0.3);
});

const step = (p: any) => { world.nowSeconds += 15; silently(() => { aiCommandGroundWars(world); processSieges(world); }); };

test('a breakout is a siege on the camp world; a strong garrison crushes it and the camp goes on', () => {
    order({ action: 'mode', planetId: campWorld.id, mode: 'labour' });
    for (const a of [...world.movement.armies.values()] as any[]) if (a.currentPlanetId === campWorld.id) world.movement.armies.delete(a.id);
    campWorld.camp.inmates = 1000;
    campWorld.garrison = { ...(campWorld.garrison ?? {}), garrisonTroops: 6000, unitComposition: { INFANTRY: 5000, ARMOR: 1000 }, fortificationLevel: 2, ownerEmpireId: A };
    silently(() => startCampBreakout(world, campWorld));
    assert.ok(campWorld.siege?.campRevolt, 'a siege');
    assert.ok(campWorld.camp.revolt);
    campWorld.siege.cycleLengthTicks = 1;
    for (let i = 0; i < 300 && campWorld.siege; i++) step(campWorld);
    assert.ok(!campWorld.siege, 'over');
    assert.strictEqual(campWorld.ownerId, A, 'still ours');
    assert.ok(campWorld.camp && !campWorld.camp.revolt, 'the camp goes on');
    assert.strictEqual(campWorld.camp.breakouts, 1);
});

test('a breakout against a thin garrison takes the capital: the world breaks free to its freed convicts', () => {
    campWorld.camp.inmates = 20000;
    campWorld.garrison = { ...(campWorld.garrison ?? {}), garrisonTroops: 150, unitComposition: { MILITIA: 150 }, fortificationLevel: 0, ownerEmpireId: A };
    for (const a of [...world.movement.armies.values()] as any[]) if (a.currentPlanetId === campWorld.id) world.movement.armies.delete(a.id);
    const before = ensureLedger(world.combat).groups.length;
    silently(() => startCampBreakout(world, campWorld));
    campWorld.siege.cycleLengthTicks = 1;
    for (let i = 0; i < 300 && campWorld.siege; i++) step(campWorld);
    assert.ok(!campWorld.siege, 'over');
    assert.strictEqual(campWorld.ownerId, '', 'nobody owns it');
    assert.ok(!campWorld.camp && !world.economy.planets.has(campWorld.id));
    assert.strictEqual(campWorld.natives?.kind, 'convicts');
    assert.strictEqual(campWorld.natives.relations[A], 0, 'they remember');
    assert.ok(ensureLedger(world.combat).groups.slice(before).every((g: any) => !String(g.captorEmpireId).startsWith('inmates:')), 'inmates take no prisoners');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
