// scripts/test-contested-ground.ts
// Empty worlds as battlefields and staging grounds
// (lib/combat/siege/contested-ground.ts + scripts/game-loop.ts startContest):
// landing on open ground, digging in, supply, a field battle between two
// empires at war, and what the winner holds afterwards.
// Run: npx tsx scripts/test-contested-ground.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder, processSieges } from './game-loop';
import { tickStagingArmies, armiesOnGround, DIG_IN_PER_CYCLE, DIG_IN_MAX_FORTIFICATION, STAGING_SUPPLY_DECAY } from '../lib/combat/siege/contested-ground';
import { colonizePlanet } from '../lib/exploration/colonize-service';
import { ensureLedger } from '../lib/combat/siege/prisoners';
import { aiCommandGroundWars } from '../lib/ai/war-ai';
import { blockadeRunGetsThrough } from '../lib/combat/siege/blockade-runners';
import { updateSupply, TRICKLE_SUPPLY_LOSS } from '../lib/combat/siege/formations';

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

const ground: any = [...world.construction.planets.values()].find((p: any) => !p.ownerId);
const sys = ground.systemId;
for (const f of [A, B]) world.movement.factionVisibility.get(f)[sys] = { revealStage: 'surveyed' };

/** A transport over `ground` carrying one army of `men` infantry. */
function transport(factionId: string, tag: string, men: number): { fleet: any; army: any } {
    const fleet: any = {
        id: `fleet-${tag}`, factionId, name: `Transport ${tag}`, currentSystemId: sys, destinationSystemId: null,
        orbitingPlanetId: ground.id, composition: { destroyer: 2 }, basePower: 60, strength: 1, transportedArmyIds: [],
        doctrine: { supplyLevel: 1 },
    };
    const army: any = {
        id: `army-${tag}`, factionId, name: `Army ${tag}`, currentPlanetId: null, currentSystemId: sys, transportFleetId: fleet.id,
        composition: { INFANTRY: men }, stance: 'fortified', strength: 1, basePower: men, supplyLevel: 1, morale: 70,
    };
    fleet.transportedArmyIds.push(army.id);
    world.movement.fleets.set(fleet.id, fleet);
    world.movement.armies.set(army.id, army);
    return { fleet, army };
}

const setWar = (on: boolean) => {
    const key = world.rivalries.has(`rivalry-${A}-${B}`) ? `rivalry-${A}-${B}` : `rivalry-${B}-${A}`;
    world.rivalries.set(key, { ...(world.rivalries.get(key) ?? {}), empireAId: A, empireBId: B, escalationLevel: on ? 9 : 0 });
};

test('invading an empty world lands the troops on open ground: no phantom siege', () => {
    const { fleet, army } = transport(A, 'a1', 1200);
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: ground.id, systemId: sys }, A));
    assert.ok(!ground.siege, 'nobody to besiege');
    assert.ok(!ground.ownerId, 'the world stays empty');
    assert.strictEqual(army.currentPlanetId, ground.id, lastError(A));
    assert.strictEqual(army.transportFleetId, null);
    assert.ok(!fleet.transportedArmyIds.includes(army.id));
    assert.ok(!ground.garrison, 'no 500 made-up defenders');
});

test('a fleet with nobody aboard has nothing to land', () => {
    const { fleet, army } = transport(A, 'empty', 100);
    world.movement.armies.delete(army.id); fleet.transportedArmyIds = [];
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: ground.id, systemId: sys }, A));
    assert.match(lastError(A), /no troops/);
    world.movement.fleets.delete(fleet.id);
});

test('staging: an army on open ground digs in; without a fleet overhead its supply runs down', () => {
    const army = world.movement.armies.get('army-a1');
    world.movement.fleets.delete('fleet-a1');
    for (const f of world.movement.fleets.values()) if (f.factionId === A && f.currentSystemId === sys) f.currentSystemId = 'elsewhere';
    silently(() => tickStagingArmies(world));
    assert.ok(Math.abs(army.dugIn - DIG_IN_PER_CYCLE) < 1e-9);
    assert.ok(Math.abs(army.supplyLevel - (1 - STAGING_SUPPLY_DECAY)) < 1e-9);
    for (let i = 0; i < 12; i++) silently(() => tickStagingArmies(world));
    assert.strictEqual(army.dugIn, 1, 'fully dug in');
    army.supplyLevel = 0;
    const s0 = army.strength;
    silently(() => tickStagingArmies(world));
    assert.ok(army.strength < s0, 'an army with no supply wastes away');
    army.supplyLevel = 0.5; army.strength = 1;
});

test('nobody settles ground foreign troops stand on', () => {
    const r = colonizePlanet(world, B, ground.id);
    assert.ok(!r.ok && /Foreign troops/.test(r.reason ?? ''), r.reason);
});

test('not at war: landing beside them is no battle', () => {
    setWar(false);
    const { fleet } = transport(B, 'b0', 300);
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: ground.id, systemId: sys }, B));
    assert.ok(!ground.siege);
    assert.strictEqual(armiesOnGround(world, ground.id).filter((a: any) => a.factionId === B).length, 1);
    world.movement.armies.delete('army-b0'); world.movement.fleets.delete(fleet.id);
});

test('at war: the ground is contested, and the first army there defends, dug in', () => {
    setWar(true);
    const { fleet } = transport(B, 'b1', 2500);
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: ground.id, systemId: sys }, B));
    const siege = ground.siege;
    assert.ok(siege?.contested, 'a field battle');
    assert.strictEqual(siege.defenderEmpireId, A, 'the holder defends');
    assert.strictEqual(siege.attackerEmpireId, B);
    assert.strictEqual(siege.defenderState.fortificationLevel, DIG_IN_MAX_FORTIFICATION, 'dug in from long standing');
    const sides = new Set(siege.districts.formations.map((f: any) => f.side));
    assert.ok(sides.has('attacker') && sides.has('defender'), 'both armies are on the board');
    assert.strictEqual(armiesOnGround(world, ground.id).length, 0, 'both armies were absorbed into the battle');
    const r = colonizePlanet(world, A, ground.id);
    assert.ok(!r.ok && /battlefield/.test(r.reason ?? ''));
});

const step = () => { world.nowSeconds += 15; silently(() => { aiCommandGroundWars(world); processSieges(world); }); };
const rich = (f: string) => { const r = world.economy.factions.get(f).reserves; r.CREDITS = 1e7; r.MATERIEL = 1e6; };

test('no clock: while both sides pay their upkeep, the battle grinds on', () => {
    const siege = ground.siege;
    siege.cycleLengthTicks = 1;
    rich(A); rich(B);
    // The holder has warships overhead too: the sky is contested, nobody is blockaded.
    world.movement.fleets.set('fleet-a-cover', { id: 'fleet-a-cover', factionId: A, name: 'Cover', currentSystemId: sys, destinationSystemId: null, composition: { cruiser: 4 }, basePower: 200, strength: 1, transportedArmyIds: [] });
    const before = world.economy.factions.get(B).reserves.CREDITS;
    for (let i = 0; i < 60 && ground.siege; i++) step();
    assert.ok(ground.siege, `still fighting after ${siege.cycleCount} cycles (winner ${siege.winner === A ? 'holder' : 'attacker'}, fed A ${siege.defenderState.contestFed} B ${siege.attackerState.contestFed}, log: ${siege.battleLog.slice(-4).map((l: any) => l.message).join(' / ').slice(0, 500)})`);
    assert.ok(world.economy.factions.get(B).reserves.CREDITS < before, 'upkeep was paid');
    assert.ok(siege.attackerState.contestFed !== false && siege.defenderState.contestFed !== false, 'both sides fed');
});

test('a side that cannot pay is cut off, starves, and loses the field', () => {
    const siege = ground.siege;
    rich(A);
    const rb = world.economy.factions.get(B).reserves; rb.CREDITS = 0; rb.MATERIEL = 0;
    for (let i = 0; i < 300 && ground.siege; i++) { rb.CREDITS = 0; step(); }
    assert.ok(siege.attackerState.contestFed === false, 'the broke side was cut off');
    assert.ok(!ground.siege, `the battle ended (cycle ${siege.cycleCount})`);
    assert.strictEqual(siege.winner, A, 'the side that kept paying holds the field');
    assert.ok(!ground.ownerId, 'nobody took the planet: it is still empty');
    assert.ok(!ground.garrison, 'no garrison on an empty world');
    const held = armiesOnGround(world, ground.id);
    assert.ok(held.length >= 1 && held.every((a: any) => a.factionId === A), 'the holder stands on the field');
});

test('blockade runners: a lone ship nearby sometimes gets through; a big fleet or none does not', () => {
    const p = { id: 'runner-world', systemId: sys };
    const tries = (n: number) => Array.from({ length: n }, (_, c) => blockadeRunGetsThrough(world, 'runner-empire', p, c)).filter(Boolean).length;
    assert.strictEqual(tries(40), 0, 'no ship, no run');
    world.movement.fleets.set('runner-1', { id: 'runner-1', factionId: 'runner-empire', currentSystemId: sys, destinationSystemId: null, composition: { corvette: 1 } });
    const lone = tries(40);
    assert.ok(lone > 4 && lone < 28, `a corvette gets through sometimes: ${lone}/40`);
    world.movement.fleets.get('runner-1').composition = { freighter: 1 };
    assert.ok(tries(40) > lone, 'a freighter does better');
    world.movement.fleets.get('runner-1').composition = { battleship: 6 };
    assert.strictEqual(tries(40), 0, 'a battle fleet cannot slip through');
    world.movement.fleets.delete('runner-1');
});

test('a run that gets through only slows the hunger', () => {
    const surface: any = { sectors: [{ index: 0, terrain: 'plains', ring: 0, neighbors: [1] }, { index: 1, terrain: 'plains', ring: 1, neighbors: [0] }] };
    const war: any = { control: { 1: 'attacker' }, landingZones: [] };
    const mk = () => [{ id: 'x', side: 'defender', unitType: 'INFANTRY', strength: 100, maxStrength: 100, sectorIndex: 0, supply: 100 }] as any;
    const starved = mk(), fed = mk();
    updateSupply(surface, war, starved, { defenderSources: [] });
    updateSupply(surface, war, fed, { defenderSources: [], trickle: { defender: true } });
    assert.strictEqual(starved[0].supply, 75);
    assert.strictEqual(fed[0].supply, 100 - TRICKLE_SUPPLY_LOSS);
});

test('the winner can settle the ground it holds', () => {
    const winner = armiesOnGround(world, ground.id)[0]?.factionId;
    const reserves = world.economy.factions.get(winner).reserves;
    reserves.CREDITS = 1e6; reserves.METALS = 1e6; reserves.FOOD = 1e6;
    ground.tags = ground.tags ?? [];
    const r = colonizePlanet(world, winner, ground.id);
    assert.ok(r.ok, r.reason);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
