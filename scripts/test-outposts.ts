// scripts/test-outposts.ts
// Outposts (docs/outposts/README.md): founding, the grid, shifts, crises and
// the steward, charters, functions (warehouse output, prison, lab, sensor
// mast, depot), growth to a settlement and to a colony.
// Run: npx tsx scripts/test-outposts.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder } from './game-loop';
import { createOutpostState, generateOutpostGround } from '../lib/outposts/outpost-map';
import { computeBalance, runShift } from '../lib/outposts/outpost-sim';
import { CELL_COUNT, CENTER_CELL, cellOpen, MODULES, terrainOk } from '../lib/outposts/outpost-catalog';
import { tickOutposts, shipOutpostWarehouses, outpostSightSystems, prisonersHeld, outpostBombarded, outpostCaptured } from '../lib/outposts/outpost-service';
import { fortificationLevelFor } from '../lib/combat/siege/strongpoints';
import { extractFactionShard, cleanWorldForSave, injectOutposts } from '../lib/persistence/save-service';
import { projectShardForCaller } from '../lib/persistence/shard-privacy';
import { expireCrises, rollCrisis, CRISIS_KINDS } from '../lib/outposts/crises';
import { ensureLedger } from '../lib/combat/siege/prisoners';
import { RNG } from '../lib/trade-system/rng';
import { registry as techRegistry } from '../lib/tech/engine';

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
const rich = () => { reserves().CREDITS = 1_000_000; reserves().METALS = 1_000_000; reserves().ENERGY = 100_000; };

// A free world near A to plant on.
const capital: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === A);
const site: any = [...world.construction.planets.values()].find((p: any) => !p.ownerId && p.systemId === capital.systemId)
    ?? [...world.construction.planets.values()].find((p: any) => !p.ownerId);
world.movement.factionVisibility.get(A)[site.systemId] = { revealStage: 'surveyed' };

const order = (op: any) => silently(() => executeOrder(world, 'OUTPOST_ORDER', { planetId: site.id, ...op }, A));
const out = () => site.outpost;
/** Advance n shifts with crises answered by nobody unless `keepCrises`. */
function shifts(n: number, opts: { clearCrises?: boolean } = { clearCrises: true }) {
    for (let i = 0; i < n; i++) {
        world.nowSeconds = out().nextShiftAt;
        silently(() => tickOutposts(world));
        if (opts.clearCrises) out().crises = [];
    }
}

test('the ground is the same every time for the same world', () => {
    const a = generateOutpostGround('planet-x', 'desert', []);
    const b = generateOutpostGround('planet-x', 'desert', []);
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.length, CELL_COUNT);
    assert.strictEqual(a[CENTER_CELL], 'flat');
    const dead = generateOutpostGround('planet-y', 'standard', ['dead_matter']);
    assert.ok([6, 7, 8, 11, 13, 16, 17, 18].some(i => ['ore', 'ice', 'vent'].includes(dead[i])), 'something to dig in the first ring');
});

test('a builder ship founds the outpost with its grid and charter', () => {
    rich();
    // Hand A a builder parked at the site.
    const fleetId = 'fleet-test-builder';
    world.movement.fleets.set(fleetId, { id: fleetId, factionId: A, name: 'Builder 1', currentSystemId: site.systemId, destinationSystemId: null, composition: { builder: 1 }, basePower: 0, strength: 1 });
    silently(() => executeOrder(world, 'CIV_FOUND_OUTPOST', { fleetId, planetId: site.id, charter: 'mining' }, A));
    assert.strictEqual(site.ownerId, A, lastError());
    assert.ok(out(), 'outpost state');
    assert.strictEqual(out().charter, 'mining');
    assert.strictEqual(out().cells[CENTER_CELL].module, 'hub');
    assert.strictEqual(out().colonists, 3);
});

test('the surface is closed to districts until it is a colony', () => {
    silently(() => executeOrder(world, 'PLANET_CONSTRUCT_BUILDING', { planetId: site.id, systemId: site.systemId, buildingType: 'metal_mine' }, A));
    assert.match(lastError(), /still an outpost/);
});

test('with only the hub, food runs out and someone starves', () => {
    const s = createOutpostState({ id: 'p-starve' }, 0);
    let deaths = 0;
    for (let i = 0; i < 16; i++) deaths += runShift(s).deaths;
    assert.ok(deaths >= 1, 'a hub alone cannot feed them');
});

const flatCell = (exclude: number[] = []) => out().cells.findIndex((c: any, i: number) => cellOpen(i, out().tier) && c.terrain === 'flat' && !c.module && !exclude.includes(i));
/** An open, empty cell this module can stand on; the test makes room (flattens) when the grid has none left. */
function spot(module: string): number {
    const s = out();
    const ok = (i: number) => cellOpen(i, s.tier) && !s.cells[i].module && terrainOk(module as any, s.cells[i].terrain);
    let i = s.cells.findIndex((_: any, j: number) => ok(j));
    if (i < 0) { i = s.cells.findIndex((c: any, j: number) => cellOpen(j, s.tier) && !c.module); if (i >= 0) s.cells[i].terrain = 'flat'; }
    return i;
}
const build = (module: string) => order({ op: 'build', cell: spot(module), module });

test('building costs reserves, takes shifts, and fails on the wrong ground', () => {
    rich();
    const before = reserves().CREDITS;
    const cell = flatCell();
    order({ op: 'build', cell, module: 'hydroponics' });
    assert.strictEqual(out().cells[cell].module, 'hydroponics', lastError());
    assert.strictEqual(reserves().CREDITS, before - MODULES.hydroponics.cost.CREDITS);
    assert.ok(!computeBalance(out()).running.includes(cell), 'not running until built');
    shifts(1);
    assert.ok(computeBalance(out()).running.includes(cell), 'running after a shift');
    order({ op: 'build', cell: flatCell(), module: 'mine' });
    assert.match(lastError(), /cannot stand on flat/);
    order({ op: 'build', cell: 0, module: 'habitat' });
    assert.match(lastError(), /opens when the outpost grows/);
});

test('modules need workers and power, in priority order', () => {
    const s = createOutpostState({ id: 'p-power' }, 0);
    const free = s.cells.map((c, i) => i).filter(i => cellOpen(i, 1) && i !== CENTER_CELL);
    // Hub makes 2 power; three 1-power consumers: the last one idles.
    s.cells[free[0]] = { terrain: 'flat', module: 'life_support' };
    s.cells[free[1]] = { terrain: 'flat', module: 'hydroponics' };
    s.cells[free[2]] = { terrain: 'flat', module: 'commons' };
    s.colonists = 10;
    const b = computeBalance(s);
    assert.deepStrictEqual(b.idle.map(x => x.reason), ['power']);
    assert.strictEqual(s.cells[b.idle[0].cell].module, 'commons', 'lowest priority idles first');
    s.colonists = 1;
    const b2 = computeBalance(s);
    assert.ok(b2.idle.some(x => x.reason === 'workers'));
});

test('a working outpost grows: power, air, food, housing', () => {
    rich();
    build('solar');
    build('life_support');
    build('habitat');
    shifts(1);
    const before = out().colonists;
    shifts(4);
    assert.ok(out().colonists > before, `grew from ${before} to ${out().colonists}`);
    const b = computeBalance(out());
    assert.ok(b.airMade >= b.airUsed && b.foodMade >= b.foodUsed - 1, JSON.stringify(b));
});

test('extractors fill the warehouse only when there is one, and it ships each cycle', () => {
    rich();
    const s = out();
    const dig = s.cells.findIndex((c: any, i: number) => cellOpen(i, s.tier) && ['ore', 'ice', 'vent'].includes(c.terrain) && !c.module);
    assert.ok(dig >= 0, 'something to dig');
    order({ op: 'build', cell: dig, module: 'mine' });
    build('solar');
    shifts(1);
    s.colonists = Math.max(s.colonists, 8);
    assert.deepStrictEqual(computeBalance(s).output, {}, 'no warehouse, nowhere to put it');
    build('warehouse');
    shifts(1);
    s.colonists = Math.max(s.colonists, 8);
    const output = computeBalance(s).output;
    assert.ok(Object.keys(output).length > 0, lastError());
    shifts(1);
    const held = { ...s.warehouse };
    assert.ok(Object.values(held).some((v: any) => v > 0));
    const key = Object.keys(held)[0];
    const r0 = reserves()[key] ?? 0;
    silently(() => shipOutpostWarehouses(world));
    assert.strictEqual(reserves()[key], r0 + held[key]);
    assert.deepStrictEqual(s.warehouse, {});
});

test('crises open with options, and the steward answers at the deadline', () => {
    const s = createOutpostState({ id: 'p-crisis' }, 0);
    s.shift = 5;
    s.colonists = 8;
    const ctx: any = { rng: new RNG(7), hasGovernor: false, charge: () => true, prisoners: 0, losePrisoners: () => 0, researchBoost: () => null, experimentHours: () => 1, raidersNear: false };
    let crisis = null;
    for (let i = 0; i < 50 && !crisis; i++) { ctx.rng = new RNG(i); crisis = rollCrisis(s, ctx); }
    assert.ok(crisis, 'something went wrong eventually');
    assert.ok(crisis!.options.length >= 2);
    s.shift = crisis!.deadlineShift;
    expireCrises(s, ctx);
    assert.strictEqual(s.crises.length, 0, 'answered by the steward');
    assert.ok(s.log.some(l => /chose for you/.test(l.text)));
    assert.ok(CRISIS_KINDS.length >= 12);
});

test('the player answers a crisis through the order', () => {
    rich();
    out().crises = [];
    out().cells.forEach((c: any, i: number) => { if (c.module === 'solar') out().cells[i].off = undefined; });
    out().crises.push({ id: 'supply_delay-99', kind: 'supply_delay', title: 'Supply run delayed', text: '', options: [{ id: 'ration', label: '', detail: '' }, { id: 'premium', label: '', detail: '' }], openedShift: out().shift, deadlineShift: out().shift + 2, fallback: 'ration', steward: 'premium' });
    const c0 = reserves().CREDITS;
    order({ op: 'resolve', crisisId: 'supply_delay-99', option: 'premium' });
    assert.strictEqual(out().crises.length, 0, lastError());
    assert.strictEqual(reserves().CREDITS, c0 - 500);
});

test('a settlement needs its people, morale and modules; then the whole grid opens', () => {
    rich();
    order({ op: 'advance' });
    assert.match(lastError(), /Still needs/);
    const s = out();
    s.colonists = 12; s.morale = 70; s.crises = [];
    order({ op: 'advance' });
    assert.strictEqual(s.tier, 2, lastError());
    assert.ok(cellOpen(0, s.tier));
});

test('prisoners move to a cell block by dock, and stay ransomable', () => {
    rich();
    const s = out();
    build('dock');
    build('cell_block');
    build('reactor');
    shifts(2);
    s.colonists = Math.max(s.colonists, 24);
    const ledger = ensureLedger(world.combat);
    ledger.groups.push({ id: 'pow-test', ownerEmpireId: B, captorEmpireId: A, planetId: capital.id, planetName: capital.name, unitType: 'INFANTRY', count: 20, capturedAtSeconds: 0 });
    order({ op: 'transfer_prisoners', groupId: 'pow-test' });
    assert.strictEqual(prisonersHeld(world, s), 20, lastError());
    assert.strictEqual(ledger.groups.find((g: any) => g.id === 'pow-test')!.planetId, site.id);
    assert.ok(!ledger.groups.find((g: any) => g.id === 'pow-test')!.resolved);
});

test('a test lab pushes the current research', () => {
    rich();
    const s = out();
    // Soak worlds start without tech state; give A one project under way.
    const techId = [...techRegistry.getAll()][0].id;
    const slot: any = { slotId: 's1', techId, startTime: 0, progressHours: 0, ticksCompleted: 0, ticksRequired: 1, status: 'researching' };
    if (!world.tech.get(A)) world.tech.set(A, { factionId: A, unlockedTechIds: [], activeEffects: [], activeSlots: [], maxSlots: 1, globalModifiers: {}, researchPoints: 0, lockedTechIds: [] });
    world.tech.get(A).activeSlots = [slot];
    build('test_lab');
    build('solar');
    shifts(2);
    s.colonists = Math.max(s.colonists, 30);
    const h0 = slot.progressHours;
    order({ op: 'experiment', subjects: 'volunteers' });
    assert.ok(slot.progressHours > h0, lastError());
    order({ op: 'experiment', subjects: 'volunteers' });
    assert.match(lastError(), /still writing up/);
});

test('a sensor mast sees the system and next door', () => {
    rich();
    build('sensor_mast');
    shifts(1);
    out().colonists = Math.max(out().colonists, 30);
    const sight = outpostSightSystems(world, A);
    assert.ok(sight.has(site.systemId));
    for (const n of world.movement.systems.get(site.systemId).hyperlaneNeighbors) assert.ok(sight.has(n));
});

test('a colony: the outpost graduates, the surface opens, the functions keep running', () => {
    rich();
    const s = out();
    if (!s.cells.some((c: any) => c.module === 'warehouse')) build('warehouse');
    shifts(1);
    s.colonists = 32; s.morale = 75; s.crises = [];
    order({ op: 'advance' });
    assert.ok(s.graduated, lastError());
    assert.ok(!site.tags.includes('outpost'));
    assert.ok(site.population >= 10);
    const carried = (site.tiles ?? []).filter((t: any) => t.constructionState === 'active' && ['habitat_block', 'hydroponic_farm', 'warehouse_complex', 'logistics_depot'].includes(t.buildingId));
    assert.ok(carried.length >= 3, `the domes became districts: ${carried.map((t: any) => t.buildingId).join(', ')}`);
    assert.strictEqual(new Set(carried.map((t: any) => t.sectorIndex)).size, carried.length, 'one building per sector');
    build('habitat');
    assert.match(lastError(), /colony now/);
    const before = { ...s.warehouse };
    shifts(1, { clearCrises: false });
    assert.strictEqual(s.crises.length, 0, 'no crises after graduation');
    assert.ok(JSON.stringify(s.warehouse) !== JSON.stringify(before) || Object.keys(computeBalance(s).output).length === 0);
});

test('an outpost that loses everyone stays yours and can be resettled', () => {
    const p: any = { ...site, id: 'p-ghost', ownerId: A, name: 'Ghost', tags: ['outpost'], outpost: createOutpostState({ id: 'p-ghost' }, world.nowSeconds) };
    world.construction.planets.set(p.id, p);
    p.outpost.colonists = 1; p.outpost.air = 0; p.outpost.food = 0;
    p.outpost.cells[CENTER_CELL].off = true; // hub cannot be switched off by order, but a wreck can stop it
    p.outpost.cells[CENTER_CELL].downUntilShift = 99;
    world.nowSeconds = p.outpost.nextShiftAt;
    silently(() => tickOutposts(world));
    assert.strictEqual(p.outpost.colonists, 0);
    rich();
    silently(() => executeOrder(world, 'OUTPOST_ORDER', { planetId: p.id, op: 'resettle' }, A));
    assert.strictEqual(p.outpost.colonists, 3, lastError());
    world.construction.planets.delete(p.id);
});

// ─── War ─────────────────────────────────────────────────────────────────────

/** A fresh outpost world owned by A, for the war tests. */
function warWorld(id: string, modules: Array<[number, string]> = []): any {
    const p: any = { ...site, id, name: id, ownerId: A, tags: ['outpost'], siege: null, outpost: createOutpostState({ id }, world.nowSeconds) };
    for (const [cell, m] of modules) { p.outpost.cells[cell].module = m; p.outpost.cells[cell].terrain = 'flat'; }
    p.outpost.colonists = 20;
    world.construction.planets.set(p.id, p);
    return p;
}

test('bombardment wrecks domes and kills colonists; a bunker shelters them', () => {
    const open = warWorld('war-open', [[7, 'habitat'], [11, 'hydroponics'], [13, 'life_support']]);
    silently(() => outpostBombarded(world, open, B));
    assert.ok(open.outpost.colonists < 20, 'people died');
    assert.ok(open.outpost.cells.filter((c: any) => c.module && c.module !== 'hub' && !(c.downUntilShift > open.outpost.shift)).length < 3, 'modules hit');
    const safe = warWorld('war-safe', [[7, 'habitat'], [11, 'hydroponics'], [13, 'bunker']]);
    silently(() => outpostBombarded(world, safe, B));
    assert.strictEqual(safe.outpost.colonists, 20, 'nobody dies in the bunker');
    assert.strictEqual(safe.outpost.cells.filter((c: any) => c.module).length, 4, 'nothing flattened');
    world.construction.planets.delete(open.id); world.construction.planets.delete(safe.id);
});

test('a bunker digs the defenders in: fortification, not men', () => {
    const p = warWorld('war-fort');
    const before = fortificationLevelFor(p);
    p.outpost.cells[7].module = 'bunker';
    assert.strictEqual(fortificationLevelFor(p), before + 2);
    world.construction.planets.delete(p.id);
});

test('under siege nobody arrives, no supply ship lands, morale sinks, and it cannot grow', () => {
    rich();
    const p = warWorld('war-siege', [[7, 'habitat'], [11, 'hydroponics'], [13, 'life_support'], [17, 'solar']]);
    p.outpost.colonists = 4;
    const free = computeBalance(p.outpost, {}).moraleTarget;
    p.siege = { attackerEmpireId: B };
    assert.ok(computeBalance(p.outpost, { besieged: true }).moraleTarget < free);
    world.nowSeconds = p.outpost.nextShiftAt;
    silently(() => tickOutposts(world));
    assert.strictEqual(p.outpost.colonists, 4, 'no arrivals');
    silently(() => executeOrder(world, 'OUTPOST_ORDER', { planetId: p.id, op: 'supply' }, A));
    assert.match(lastError(), /no supply ship/);
    silently(() => executeOrder(world, 'OUTPOST_ORDER', { planetId: p.id, op: 'advance' }, A));
    assert.match(lastError(), /siege lifted/);
    world.construction.planets.delete(p.id);
});

test('captured: crises end, the conqueror’s own people go free, others change keepers', () => {
    const p = warWorld('war-capture', [[7, 'cell_block']]);
    const ledger = ensureLedger(world.combat);
    ledger.groups.push({ id: 'pow-mine', ownerEmpireId: B, captorEmpireId: A, planetId: p.id, planetName: p.name, unitType: 'INFANTRY', count: 10, capturedAtSeconds: 0 });
    ledger.groups.push({ id: 'pow-third', ownerEmpireId: 'faction-third', captorEmpireId: A, planetId: p.id, planetName: p.name, unitType: 'INFANTRY', count: 5, capturedAtSeconds: 0 });
    p.outpost.prisonerGroupIds = ['pow-mine', 'pow-third'];
    p.outpost.crises = [{ id: 'x', kind: 'sickness' }];
    p.outpost.charter = 'prison';
    p.ownerId = B;
    silently(() => outpostCaptured(world, p, A, B));
    assert.strictEqual(ledger.groups.find((g: any) => g.id === 'pow-mine')!.resolved, 'freed');
    assert.strictEqual(ledger.groups.find((g: any) => g.id === 'pow-third')!.captorEmpireId, B);
    assert.deepStrictEqual(p.outpost.prisonerGroupIds, ['pow-third']);
    assert.strictEqual(p.outpost.crises.length, 0);
    assert.strictEqual(p.outpost.charter, 'settlement');
    assert.ok(p.outpost.colonists < 20, 'some fled');
    world.construction.planets.delete(p.id);
});

// ─── Privacy ─────────────────────────────────────────────────────────────────

test('an outpost rides in its owner’s shard, not the shared snapshot, and never in a rival’s view', () => {
    const p = warWorld('privacy-outpost', [[7, 'cell_block']]);
    const shard = JSON.parse(extractFactionShard(world, A));
    assert.ok(shard.outposts.some((o: any) => o.planetId === p.id), 'in the owner’s shard');
    const cleaned: any = cleanWorldForSave(world);
    assert.ok(!cleaned.construction.planets.get(p.id).outpost, 'stripped from the shared snapshot');
    const rival = JSON.parse(projectShardForCaller(extractFactionShard(world, A), false));
    assert.strictEqual(rival.outposts, undefined, 'not in the public projection');
    // Restored on load, but only onto a world the shard's faction still owns.
    const state = p.outpost;
    delete p.outpost;
    injectOutposts(world, { factionId: A, outposts: [{ planetId: p.id, state }] });
    assert.strictEqual(p.outpost, state);
    delete p.outpost;
    p.ownerId = B;
    injectOutposts(world, { factionId: A, outposts: [{ planetId: p.id, state }] });
    assert.strictEqual(p.outpost, undefined, 'a pre-capture shard does not hand it back');
    world.construction.planets.delete(p.id);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
