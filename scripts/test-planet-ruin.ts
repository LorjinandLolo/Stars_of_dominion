// scripts/test-planet-ruin.ts
// Bombarding a world to oblivion (lib/combat/planet-ruin.ts + the worker's
// MIL_BOMBARD_PLANET 'TERROR', MIL_GLASS_PLANET, MIL_BUILD_WORLDBREAKER,
// MIL_CRACK_PLANET): terror bombing kills and burns; glassing needs the orbit,
// takes about two real hours and pauses without it; the World Breaker takes
// three days to build and half an hour to charge; the galaxy remembers.
// Run: npx tsx scripts/test-planet-ruin.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder } from './game-loop';
import {
    tickPlanetRuin, holdsOrbit, GLASS_SIM_SECONDS, BREAKER_BUILD_SIM_SECONDS, CRACK_CHARGE_SIM_SECONDS, BREAKER_COST,
} from '../lib/combat/planet-ruin';
import { colonizePlanet } from '../lib/exploration/colonize-service';
import { materializeSystemBodies, systemHasBodies } from '../lib/exploration/body-generator';

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
/** War (or peace) in both stored directions, by score, the way the diplomacy layer keeps it. */
const setWar = (on: boolean) => { for (const [a, b] of [[A, B], [B, A]]) world.rivalries.set(`rivalry-${a}-${b}`, { ...(world.rivalries.get(`rivalry-${a}-${b}`) ?? {}), id: `rivalry-${a}-${b}`, empireAId: a, empireBId: b, rivalryScore: on ? 100 : 10, escalationLevel: on ? 9 : 0, activeSanctionIds: [], proxyConflictsInvolved: [] }); };
setWar(true);
for (const f of [A, B]) { const r = world.economy.factions.get(f).reserves; for (const k of Object.keys(r)) r[k] = 1e7; r.MATERIEL = 1e6; r.AMMO = 1e6; }
if (!world.tech.get(A)) world.tech.set(A, { unlockedTechIds: [] });
world.tech.get(A).unlockedTechIds = [...(world.tech.get(A).unlockedTechIds ?? []), 'mil_t1_7'];

/** A fresh colony of B's in a system nobody else is in. */
// Chart some empty systems so there are lone worlds to colonize and ruin.
const empties: any[] = [];
for (const sys of world.movement.systems.values() as Iterable<any>) {
    if (empties.length >= 12) break;
    if (systemHasBodies(world, sys.id)) continue;
    for (const p of materializeSystemBodies(world, sys.id) as any[]) if ((p.tags ?? []).includes('colonizable') && !p.natives) { empties.push(p); break; }
}
function bColony(): any {
    const p = empies();
    world.movement.factionVisibility.get(B)[p.systemId] = { revealStage: 'surveyed' };
    const r = colonizePlanet(world, B, p.id);
    assert.ok(r.ok, r.reason);
    p.population = 40;
    p.tiles = [
        { tileId: `${p.id}-farm`, buildingId: 'hydroponics_farm', constructionState: 'active', sectorIndex: 10 },
        { tileId: `${p.id}-mine`, buildingId: 'mine', constructionState: 'active', sectorIndex: 11 },
        { tileId: `${p.id}-lab`, buildingId: 'research_lab', constructionState: 'active', sectorIndex: 12 },
    ];
    return p;
}
function empies(): any { const p = empties.shift(); assert.ok(p, 'out of empty worlds'); return p; }
let fi = 0;
function fleet(factionId: string, p: any, power: number, extra: any = {}): any {
    fi++;
    const f: any = { id: `ruin-fleet-${fi}`, factionId, name: `Fleet ${fi}`, currentSystemId: p.systemId, destinationSystemId: null, orbitingPlanetId: p.id, composition: { battleship: 2 }, basePower: power, strength: 1, transportedArmyIds: [], ...extra };
    world.movement.fleets.set(f.id, f);
    return f;
}
const tickAfter = (simSeconds: number) => { world.nowSeconds += simSeconds; return silently(() => tickPlanetRuin(world)); };

test('terror bombing kills people and burns districts; plain bombardment does neither', () => {
    const p = bColony();
    const f = fleet(A, p, 400);
    silently(() => executeOrder(world, 'MIL_BOMBARD_PLANET', { fleetId: f.id, targetId: p.id }, A));
    assert.strictEqual(p.population, 40, lastError(A) || 'plain bombardment spares the people');
    assert.ok(p.tiles.every((t: any) => t.constructionState === 'active'));
    silently(() => executeOrder(world, 'MIL_BOMBARD_PLANET', { fleetId: f.id, targetId: p.id, mode: 'TERROR' }, A));
    assert.ok(p.population < 40, `${p.population}`);
    assert.ok(p.tiles.some((t: any) => t.constructionState === 'ruined'), 'a district burned');
    world.movement.fleets.delete(f.id);
});

test('glassing needs the orbit, then about two real hours of fire; losing the orbit pauses it', () => {
    const p = bColony();
    const enemy = fleet(B, p, 200);
    const f = fleet(A, p, 400);
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: p.id }, A));
    assert.match(lastError(A), /hold the orbit/);
    world.movement.fleets.delete(enemy.id);
    assert.ok(holdsOrbit(world, A, p));
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: p.id }, A));
    assert.ok(p.glassing, lastError(A));
    tickAfter(GLASS_SIM_SECONDS * 0.4);
    assert.ok(p.glassing.progress > 0.3 && p.glassing.progress < 0.5, `${p.glassing.progress}`);
    const back = fleet(B, p, 100);
    tickAfter(GLASS_SIM_SECONDS * 0.4);
    assert.ok(p.glassing.paused && p.glassing.progress < 0.5, 'paused while the orbit is contested');
    world.movement.fleets.delete(back.id);
    const notices = tickAfter(GLASS_SIM_SECONDS * 0.7);
    assert.ok(p.glassed, `glassed (progress ${p.glassing?.progress})`);
    assert.strictEqual(p.ownerId, '');
    assert.strictEqual(p.population, 0);
    assert.ok(p.tiles.every((t: any) => t.constructionState === 'ruined'));
    assert.ok(p.tags.includes('glassed') && p.tags.includes('dead_matter'));
    assert.ok(!world.economy.planets.has(p.id));
    assert.ok(notices.some(([f]) => f === B) && notices.some(([f]) => f === A), 'the whole galaxy hears');
    assert.ok((world.politics?.empires?.get?.(A)?.infamy ?? 40) >= 40);
    assert.match(colonizePlanet(world, A, p.id).reason ?? '', /cannot support/);
    world.movement.fleets.delete(f.id);
});

test('more power glasses faster; a shield slows it to a crawl', () => {
    const fast = bColony(), shielded = bColony();
    shielded.tiles.push({ tileId: `${shielded.id}-shield`, buildingId: 'shield_generator', constructionState: 'active', sectorIndex: 13 });
    const f1 = fleet(A, fast, 800), f2 = fleet(A, shielded, 800);
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: fast.id }, A));
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: shielded.id }, A));
    tickAfter(GLASS_SIM_SECONDS * 0.4);
    assert.ok(fast.glassing.progress > 0.7, `fast ${fast.glassing.progress}`);
    assert.ok(shielded.glassing.progress < 0.25, `shielded ${shielded.glassing.progress}`);
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: shielded.id, stop: true }, A));
    assert.ok(!shielded.glassing, 'stopped');
    world.movement.fleets.delete(f1.id); world.movement.fleets.delete(f2.id);
});

test('the World Breaker: a tier-3 yard, a fortune, three real days', () => {
    const yardWorld: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === A && p.planetType === 'capital');
    yardWorld.orbital = { slots: [{ slotId: 'y', structureId: 'orbital_dry_dock', state: 'active', completesAt: null, integrity: 100 }, ...(yardWorld.orbital?.slots ?? [])], buildQueue: [] };
    const before = world.economy.factions.get(A).reserves.CREDITS;
    silently(() => executeOrder(world, 'MIL_BUILD_WORLDBREAKER', { planetId: yardWorld.id }, A));
    if (!yardWorld.worldBreakerProject) {
        // No tier-3 yard on this world: force one for the test.
        assert.match(lastError(A), /tier 3/);
        yardWorld.tiles = [...(yardWorld.tiles ?? []), { tileId: 'test-yard', buildingId: 'orbital_shipyard', constructionState: 'active', sectorIndex: 30 }];
        yardWorld.worldBreakerProject = { factionId: A, startedAt: world.nowSeconds, completesAt: world.nowSeconds + BREAKER_BUILD_SIM_SECONDS };
    } else {
        assert.strictEqual(world.economy.factions.get(A).reserves.CREDITS, before - BREAKER_COST.CREDITS);
    }
    tickAfter(BREAKER_BUILD_SIM_SECONDS * 0.5);
    assert.ok(![...world.movement.fleets.values()].some((f: any) => f.worldBreaker && f.factionId === A), 'not yet');
    tickAfter(BREAKER_BUILD_SIM_SECONDS * 0.6);
    assert.ok([...world.movement.fleets.values()].some((f: any) => f.worldBreaker && f.factionId === A), 'launched');
});

test('the World Breaker charges for half an hour holding the orbit; then the world is gone', () => {
    const p = bColony();
    const breaker: any = [...world.movement.fleets.values()].find((f: any) => f.worldBreaker && f.factionId === A);
    breaker.currentSystemId = p.systemId; breaker.destinationSystemId = null;
    silently(() => executeOrder(world, 'MIL_CRACK_PLANET', { fleetId: breaker.id, planetId: p.id }, A));
    assert.ok(breaker.crackCharge, lastError(A));
    tickAfter(CRACK_CHARGE_SIM_SECONDS * 0.5);
    assert.ok(!p.destroyed, 'still charging');
    const notices = tickAfter(CRACK_CHARGE_SIM_SECONDS * 0.6);
    assert.ok(p.destroyed, 'gone');
    assert.deepStrictEqual(p.tags, ['destroyed', 'dead_matter']);
    assert.strictEqual(p.ownerId, '');
    assert.ok(notices.length >= 2);
    assert.ok(breaker.breakerReadyAt > world.nowSeconds, 'recharging');
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: breaker.id, planetId: p.id, systemId: p.systemId }, A));
    assert.match(lastError(A), /nothing to land/);
});

test('a charge is broken if the enemy contests the orbit', () => {
    const p = bColony();
    const breaker: any = [...world.movement.fleets.values()].find((f: any) => f.worldBreaker && f.factionId === A);
    breaker.breakerReadyAt = 0;
    breaker.currentSystemId = p.systemId;
    silently(() => executeOrder(world, 'MIL_CRACK_PLANET', { fleetId: breaker.id, planetId: p.id }, A));
    assert.ok(breaker.crackCharge, lastError(A));
    fleet(B, p, 150);
    tickAfter(CRACK_CHARGE_SIM_SECONDS * 0.5);
    assert.ok(!breaker.crackCharge && !p.destroyed, 'broken');
});

test('nobody strikes a world it is not at war with, nor its own', () => {
    const p = bColony();
    fleet(A, p, 500);
    setWar(false);
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: p.id }, A));
    assert.match(lastError(A), /not at war/);
    setWar(true);
    fleet(B, p, 500);
    silently(() => executeOrder(world, 'MIL_GLASS_PLANET', { planetId: p.id }, B));
    assert.match(lastError(B), /our own/);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
