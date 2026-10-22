// scripts/test-natives.ts
// Native peoples (lib/natives/natives.ts + scripts/game-loop.ts startNativeWar):
// generation, observe, contact, gifts and trade, settling with consent,
// uplift, the guerrilla war (won and lost) and the victor's choices.
// Run: npx tsx scripts/test-natives.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder, processSieges } from './game-loop';
import { planSystemBodies } from '../lib/exploration/body-generator';
import { tickNatives, rollNatives, NATIVE_CHANCE, UPLIFT_ATTITUDE, isNativesId, type NativeCivilization } from '../lib/natives/natives';
import { ensureLedger } from '../lib/combat/siege/prisoners';
import { colonizePlanet } from '../lib/exploration/colonize-service';
import { GUERRILLA_TERRAIN } from '../lib/combat/siege/district-battle';
import { aiCommandGroundWars } from '../lib/ai/war-ai';
import { generateSurface } from '../lib/planet-surface/generator';

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
const rich = (f: string) => { const r = world.economy.factions.get(f).reserves; for (const k of Object.keys(r)) r[k] = 1e7; r.CREDITS = 1e7; };
rich(A); rich(B);

const planets: any[] = [...world.construction.planets.values()].filter((p: any) => !p.ownerId && (p.tags ?? []).includes('colonizable'));
let pi = 0;
/** A fresh unowned world in a surveyed system with a native people on it. */
function nativeWorld(over: Partial<NativeCivilization> = {}): any {
    const p = planets[pi++];
    assert.ok(p, 'ran out of empty worlds');
    p.tags = [...(p.tags ?? []).filter((t: string) => t !== 'natives'), 'natives'];
    p.natives = {
        speciesName: 'Kiwok', kind: 'arboreal', gift: 'scouts', techLevel: 'stone', disposition: 'curious',
        population: 100, warriors: 400, maxWarriors: 400, status: 'free', contacted: false, relations: {}, observers: {}, ...over,
    } as NativeCivilization;
    for (const f of [A, B]) world.movement.factionVisibility.get(f)[p.systemId] = { revealStage: 'surveyed' };
    return p;
}
let fi = 0;
function ship(factionId: string, p: any, armyMen = 0): any {
    fi++;
    const fleet: any = { id: `nat-fleet-${fi}`, factionId, name: `Ship ${fi}`, currentSystemId: p.systemId, destinationSystemId: null, orbitingPlanetId: p.id, composition: { destroyer: 2 }, basePower: 60, strength: 1, transportedArmyIds: [] };
    world.movement.fleets.set(fleet.id, fleet);
    if (armyMen) {
        const army: any = { id: `nat-army-${fi}`, factionId, name: `Army ${fi}`, currentPlanetId: null, currentSystemId: p.systemId, transportFleetId: fleet.id, composition: { INFANTRY: armyMen }, stance: 'fortified', strength: 1, basePower: armyMen, supplyLevel: 1, morale: 80 };
        world.movement.armies.set(army.id, army);
        fleet.transportedArmyIds.push(army.id);
    }
    return fleet;
}
const act = (f: string, p: any, action: string) => silently(() => executeOrder(world, 'NATIVE_ACTION', { planetId: p.id, action }, f));

test('natives are rare, only on living worlds, and the same every time', () => {
    const bodies = [...world.movement.systems.values()].flatMap((s: any) => planSystemBodies(s));
    const eligible = bodies.filter(b => b.colonizable && /archetype:(continental|gaia|jungle|swamp|oceanic)/.test(b.tags.join(' ')) && b.habitability >= 40);
    const withNatives = bodies.filter(b => b.natives);
    assert.ok(withNatives.length > 3, `${withNatives.length} native worlds`);
    assert.ok(withNatives.length < eligible.length * NATIVE_CHANCE * 2.5, `${withNatives.length} of ${eligible.length} eligible`);
    assert.ok(withNatives.every(b => b.tags.includes('natives') && !b.tags.includes('archetype:frozen')));
    assert.deepStrictEqual(rollNatives('planet-x-body-1', 'continental', 80), rollNatives('planet-x-body-1', 'continental', 80));
    assert.strictEqual(rollNatives('anything', 'frozen', 90), null);
});

test('observe: a ship watching unseen earns research; contact ends it for everyone', () => {
    const p = nativeWorld();
    ship(A, p); ship(B, p);
    act(A, p, 'observe');
    assert.ok(p.natives.observers[A] !== undefined, lastError(A));
    const tech = world.tech.get(A) ?? (world.tech.set(A, { activeSlots: [] }), world.tech.get(A));
    tech.activeSlots = [{ slotId: 's', techId: 'any-tech', status: 'researching', progressHours: 0, ticksCompleted: 0, ticksRequired: 10, startTime: 0 }];
    tickNatives(world);
    assert.ok(tech.activeSlots[0].progressHours > 0, 'research gained');
    act(B, p, 'contact');
    assert.ok(p.natives.contacted && !Object.keys(p.natives.observers).length, 'observation is over');
    act(A, p, 'observe');
    assert.match(lastError(A), /already know/);
});

test('contact, gifts and trade', () => {
    const p = nativeWorld({ disposition: 'wary' });
    ship(A, p);
    act(A, p, 'contact');
    const start = p.natives.relations[A];
    assert.ok(start > 0 && start < 50, `${start}`);
    for (let i = 0; i < 6; i++) act(A, p, 'gift');
    assert.ok(p.natives.relations[A] >= 50, `${p.natives.relations[A]}`);
    const before = world.economy.factions.get(A).reserves.CREDITS;
    tickNatives(world);
    assert.ok(world.economy.factions.get(A).reserves.CREDITS > before, 'they trade');
});

test('settling beside them takes their consent; a colony there wears their patience down until they rise', () => {
    const p = nativeWorld({ disposition: 'proud' });
    ship(B, p);
    assert.match(colonizePlanet(world, B, p.id).reason ?? '', /make contact/);
    act(B, p, 'contact');
    assert.match(colonizePlanet(world, B, p.id).reason ?? '', /will not have us/);
    for (let i = 0; i < 8; i++) act(B, p, 'gift');
    const r = colonizePlanet(world, B, p.id);
    assert.ok(r.ok, r.reason);
    assert.strictEqual(p.natives.status, 'neighbours');
    p.natives.relations[B] = 15; // one more tick of a colony beside them and they rise
    const unrest = p.unrest ?? 0;
    const sent = tickNatives(world);
    assert.ok((p.unrest ?? 0) > unrest && sent.some(([f, t]) => f === B && /rise/.test(t)), 'they rose');
});

test('uplift: a trusting people learns the stars and joins the empire with its gift', () => {
    const p = nativeWorld({ gift: 'warriors', kind: 'giant' });
    ship(A, p);
    act(A, p, 'contact');
    act(A, p, 'uplift');
    assert.match(lastError(A), /trust/);
    p.natives.relations[A] = UPLIFT_ATTITUDE + 5;
    act(A, p, 'uplift');
    assert.ok(p.natives.uplift, lastError(A));
    for (let i = 0; i < 25 && p.natives.status === 'free'; i++) tickNatives(world);
    assert.strictEqual(p.natives.status, 'uplifted');
    assert.strictEqual(p.ownerId, A);
    assert.ok(p.tags.includes('native_warriors'));
});

const step = () => { world.nowSeconds += 15; silently(() => { aiCommandGroundWars(world); processSieges(world); }); };

test('troops landed uninvited start a guerrilla war on the board, natives as guerrillas', () => {
    const p = nativeWorld({ warriors: 300, maxWarriors: 300 });
    const fleet = ship(B, p, 3000);
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: p.id, systemId: p.systemId }, B));
    const siege = p.siege;
    assert.ok(siege?.nativeWar, lastError(B) || 'a native war');
    assert.ok(isNativesId(siege.defenderEmpireId));
    assert.strictEqual(p.natives.status, 'at_war');
    const def = siege.districts.formations.filter((f: any) => f.side === 'defender');
    assert.ok(def.length && def.every((f: any) => f.guerrilla), 'guerrillas on the board');
    assert.ok(GUERRILLA_TERRAIN.jungle! > GUERRILLA_TERRAIN.plains!);

    const before = ensureLedger(world.combat).groups.length;
    siege.cycleLengthTicks = 1;
    for (let i = 0; i < 200 && p.siege; i++) step();
    { const fs = (p.siege?.districts?.formations ?? []); const sum = (s: string) => fs.filter((f: any) => f.side === s).reduce((n: number, f: any) => n + f.strength, 0); assert.ok(!p.siege, `the war ended (cycle ${siege.cycleCount}; attacker ${sum("attacker")}, natives ${sum("defender")} in ${[...new Set(fs.filter((f: any) => f.side === "defender").map((f: any) => f.sectorIndex))].join(",")}; attackers in ${[...new Set(fs.filter((f: any) => f.side === "attacker").map((f: any) => f.sectorIndex))].join(",")}; lz ${p.siege?.districts?.landingZones}; t0 ${generateSurface(p.id, p.planetType, p.tags).sectors[0].terrain} nb ${generateSurface(p.id, p.planetType, p.tags).sectors[0].neighbors.map((i: number) => generateSurface(p.id, p.planetType, p.tags).sectors[i].terrain).join("/")}; log ${(p.siege?.battleLog ?? []).slice(-2).map((l: any) => l.message).join(" | ").slice(0, 400)})`); }
    assert.strictEqual(p.natives.status, 'pacified', `status ${p.natives.status}`);
    assert.strictEqual(p.natives.overlordId, B);
    assert.ok(ensureLedger(world.combat).groups.slice(before).every((g: any) => !isNativesId(g.ownerEmpireId) && !isNativesId(g.captorEmpireId)), 'no prisoners in a native war');

    // The victor's choice: forced labour only for the harshest civilizations.
    world.economy.factions.get(B).civilizationId = 'civ-elyndra';
    act(B, p, 'enslave');
    assert.match(lastError(B), /would not stand/);
    world.economy.factions.get(B).civilizationId = 'civ-sarrak';
    act(B, p, 'enslave');
    assert.strictEqual(p.natives.status, 'enslaved', lastError(B));
    assert.strictEqual(p.ownerId, B);
    assert.ok(p.tags.includes('enslaved_natives'));
});

test('integrate and displace are open to anyone', () => {
    const p = nativeWorld();
    p.natives.status = 'pacified'; p.natives.overlordId = A; p.natives.warriors = 0;
    act(A, p, 'integrate');
    assert.strictEqual(p.natives.status, 'integrated', lastError(A));
    assert.strictEqual(p.ownerId, A);
    const q = nativeWorld();
    q.natives.status = 'pacified'; q.natives.overlordId = A; q.natives.warriors = 0;
    act(A, q, 'displace');
    assert.strictEqual(q.natives.status, 'displaced', lastError(A));
});

test('a landing they beat is thrown back: no prisoners, they go home and remember', () => {
    const p = nativeWorld({ kind: 'giant', warriors: 4000, maxWarriors: 4000 });
    const fleet = ship(A, p, 150);
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: p.id, systemId: p.systemId }, A));
    assert.ok(p.siege?.nativeWar, lastError(A));
    p.siege.cycleLengthTicks = 1;
    const before = ensureLedger(world.combat).groups.length;
    for (let i = 0; i < 200 && p.siege; i++) step();
    assert.ok(!p.siege, 'over');
    assert.strictEqual(p.natives.status, 'free');
    assert.strictEqual(p.natives.relations[A], 0);
    assert.ok(p.natives.warriors > 0);
    assert.strictEqual(ensureLedger(world.combat).groups.length, before, 'nobody taken');
    assert.ok(![...world.movement.armies.values()].some((a: any) => isNativesId(a.factionId)), 'natives never become an army');
});

test('a people that likes you lets your troops land in peace', () => {
    const p = nativeWorld();
    const fleet = ship(A, p, 500);
    act(A, p, 'contact');
    p.natives.relations[A] = 80;
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: p.id, systemId: p.systemId }, A));
    assert.ok(!p.siege, 'no war');
    assert.strictEqual(p.natives.status, 'free');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
