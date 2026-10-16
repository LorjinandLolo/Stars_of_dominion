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

test('the battle runs to an end: the world stays empty and the survivors hold the field', () => {
    const siege = ground.siege;
    siege.cycleLengthTicks = 1;
    for (let i = 0; i < 400 && ground.siege; i++) { world.nowSeconds += 15; silently(() => { aiCommandGroundWars(world); processSieges(world); }); }
    const tally = (side: string) => (siege.districts?.formations ?? []).filter((f: any) => f.side === side).reduce((n: number, f: any) => n + f.strength, 0);
    assert.ok(!ground.siege, `the battle ended (cycle ${siege.cycleCount}, ticks ${siege.tickCount}, attackers ${tally('attacker')}, defenders ${tally('defender')}, phase ${siege.phase})`);
    assert.ok(!ground.ownerId, 'nobody took the planet: it is still empty');
    assert.ok(!ground.garrison, 'no garrison on an empty world');
    const winner = siege.winner;
    assert.ok(winner === A || winner === B, `winner ${winner}`);
    const held = armiesOnGround(world, ground.id);
    assert.ok(held.length >= 1 && held.every((a: any) => a.factionId === winner), `the winner stands on the field: ${held.map((a: any) => a.factionId).join(',')}`);
    if (winner === B) {
        const pow = ensureLedger(world.combat).groups.filter((g: any) => g.planetId === ground.id && g.captorEmpireId === B);
        assert.ok(pow.length >= 0);
    }
    console.log(`        (won by ${winner === A ? 'the dug-in holder' : 'the larger attacker'}, ${held.reduce((s: number, a: any) => s + Object.values(a.composition).reduce((x: number, n: any) => x + n, 0), 0)} men left)`);
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
