// scripts/test-surface-guns.ts
// Ground-to-space guns (lib/combat/surface-guns.ts) and the contested sky
// (lib/combat/siege/orbit-state.ts canCrossOrbit, formations.ts half supply):
// guns join space battles and shoot fighters down first, fire on the ships
// their owner picked, blunt bombardment and fire back, put flak on landings,
// and shoot at air strikes. Under a contested sky both sides land (at a
// price) and both get half supply.
// Run: npx tsx scripts/test-surface-guns.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder } from './game-loop';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { advanceSorties } from '../lib/combat/air-mission-service';
import {
    surfaceGuns, pickGunTargets, antiAirVolley, flakLoss, bombardmentScreen, returnFire, takeLandingLosses,
    PLATFORM_GUN_POWER, PLATFORM_FLAK, CONTESTED_LANDING_LOSS,
} from '../lib/combat/surface-guns';
import { canCrossOrbit } from '../lib/combat/siege/orbit-state';
import { updateSupply, HALF_SUPPLY_LEVEL } from '../lib/combat/siege/formations';

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
const key = world.rivalries.has(`rivalry-${A}-${B}`) ? `rivalry-${A}-${B}` : `rivalry-${B}-${A}`;
world.rivalries.set(key, { ...(world.rivalries.get(key) ?? {}), empireAId: A, empireBId: B, escalationLevel: 9 });
for (const f of [A, B]) { const r = world.economy.factions.get(f).reserves; for (const k of Object.keys(r)) r[k] = 1e6; r.AMMO = 1e6; r.MANPOWER = 1e6; }

const target: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === B);
const sys = target.systemId;
// Only this world of B's fires in the system, so the numbers are its own.
for (const p of world.construction.planets.values() as Iterable<any>) {
    if (p.systemId === sys && p !== target) p.tiles = (p.tiles ?? []).filter((t: any) => t.buildingId !== 'orbital_defense_platform');
}
const armGuns = (on: boolean) => {
    target.tiles = (target.tiles ?? []).filter((t: any) => t.buildingId !== 'orbital_defense_platform');
    if (on) target.tiles.push({ tileId: 'test-guns', buildingId: 'orbital_defense_platform', constructionState: 'active', sectorIndex: 41 });
};

test('a standing platform is a gun; a ruined one, or one the invader holds, is not', () => {
    armGuns(true);
    assert.strictEqual(surfaceGuns(target).power, PLATFORM_GUN_POWER);
    target.tiles.find((t: any) => t.tileId === 'test-guns').constructionState = 'ruined';
    assert.strictEqual(surfaceGuns(target).power, 0);
    armGuns(true);
    const held = [{ kind: 'orbital_defense', sectorIndex: 41, tileId: 'test-guns', holder: 'attacker', active: true }] as any;
    assert.strictEqual(surfaceGuns(target, held).power, 0);
});

test('targeting: capital takes the biggest fleet, escorts the smallest, transports the troopships', () => {
    const big = { basePower: 400, strength: 1 }, small = { basePower: 30, strength: 1 }, troop = { basePower: 60, strength: 1, transportedArmyIds: ['x'] };
    const all = [big, small, troop];
    assert.deepStrictEqual(pickGunTargets(all, 'capital'), [big]);
    assert.deepStrictEqual(pickGunTargets(all, 'escorts'), [small]);
    assert.deepStrictEqual(pickGunTargets(all, 'transports'), [troop]);
    assert.strictEqual(pickGunTargets(all, 'spread').length, 3);
});

test('anti-air takes bombers first, then interceptors', () => {
    const f = { composition: { bomber: 4, interceptor: 10 } };
    assert.strictEqual(antiAirVolley([f], 6), 6);
    assert.deepStrictEqual(f.composition, { bomber: 0, interceptor: 8 });
});

/** One round of a space battle over the target: A attacks B's picket, returns A's strength after. */
function battleRound(withGuns: boolean, gunTarget: string): { lineStrength: number; screenStrength: number; wings: number } {
    armGuns(withGuns);
    target.gunTarget = gunTarget;
    world.activeCombats.clear();
    for (const id of ['g-a-line', 'g-a-screen', 'g-b-picket']) world.movement.fleets.delete(id);
    const mk = (id: string, factionId: string, composition: any, basePower: number) => {
        const f: any = { id, factionId, name: id, currentSystemId: sys, destinationSystemId: null, composition, basePower, strength: 1, transportedArmyIds: [], doctrine: { retreatThreshold: 0 }, arrivedAt: id.startsWith('g-a') ? world.nowSeconds : world.nowSeconds - 1000 };
        world.movement.fleets.set(id, f);
        return f;
    };
    const line = mk('g-a-line', A, { battleship: 2, bomber: 8 }, 300);
    const screen = mk('g-a-screen', A, { corvette: 3 }, 40);
    mk('g-b-picket', B, { destroyer: 2 }, 60);
    silently(() => processSectorCombats(world));
    return { lineStrength: line.strength, screenStrength: screen.strength, wings: line.composition.bomber ?? 0 };
}

test('in a space battle the guns fire with the defender: AA first, then the ships they were told to take', () => {
    const none = battleRound(false, 'capital');
    const capital = battleRound(true, 'capital');
    assert.ok(capital.lineStrength < none.lineStrength, `the battle line takes the guns: ${capital.lineStrength} < ${none.lineStrength}`);
    assert.ok(capital.wings < none.wings, `bombers shot down: ${capital.wings} < ${none.wings}`);
    const escorts = battleRound(true, 'escorts');
    assert.ok(escorts.screenStrength < none.screenStrength, `the screen takes the guns: ${escorts.screenStrength} < ${none.screenStrength}`);
    assert.ok(escorts.lineStrength >= capital.lineStrength, 'and the line is spared');
});

test('the owner sets the guns\' target by order; nobody else can', () => {
    armGuns(true);
    silently(() => executeOrder(world, 'PLANET_SET_GUN_TARGET', { planetId: target.id, target: 'transports' }, B));
    assert.strictEqual(target.gunTarget, 'transports');
    silently(() => executeOrder(world, 'PLANET_SET_GUN_TARGET', { planetId: target.id, target: 'capital' }, A));
    assert.strictEqual(target.gunTarget, 'transports');
    assert.match(lastError(A), /not yours/);
});

test('bombardment under the guns: less reaches the ground, and the bombarding fleet is hit', () => {
    armGuns(true);
    assert.ok(bombardmentScreen(surfaceGuns(target)) < 1);
    const fleet: any = { id: 'g-a-bomb', factionId: A, name: 'Bombers', currentSystemId: sys, destinationSystemId: null, composition: { cruiser: 4 }, basePower: 180, strength: 1, transportedArmyIds: [] };
    world.movement.fleets.set(fleet.id, fleet);
    target.orbital = { slots: [], buildQueue: [] };
    if (!world.tech.get(A)) world.tech.set(A, { unlockedTechIds: [] });
    const techA = world.tech.get(A);
    techA.unlockedTechIds = techA.unlockedTechIds ?? [];
    if (!techA.unlockedTechIds.includes('mil_t1_7')) techA.unlockedTechIds.push('mil_t1_7'); // Orbital Bombardment I
    const run = (guns: boolean) => {
        armGuns(guns);
        target.stability = 80; fleet.strength = 1;
        silently(() => executeOrder(world, 'MIL_BOMBARD_PLANET', { fleetId: fleet.id, targetId: target.id }, A));
        return { drop: 80 - target.stability, strength: fleet.strength };
    };
    const open = run(false), gunned = run(true);
    assert.ok(gunned.drop < open.drop, `stability drop ${gunned.drop} < ${open.drop} ${lastError(A)}`);
    assert.strictEqual(open.strength, 1);
    assert.ok(gunned.strength < 1, 'return fire');
    world.movement.fleets.delete(fleet.id);
});

test('return fire wears a fleet down but never finishes it', () => {
    const f: any = { basePower: 20, strength: 0.1 };
    for (let i = 0; i < 20; i++) returnFire([f], surfaceGuns(target), 'spread');
    assert.ok(f.strength > 0);
});

test('flak: an invasion landing under the guns loses men on the way down', () => {
    armGuns(true);
    assert.strictEqual(flakLoss(surfaceGuns(target)), PLATFORM_FLAK);
    delete target.siege;
    target.orbital = { slots: [], buildQueue: [] }; // orbit suppressed: the landing goes in
    const fleet: any = { id: 'g-a-tr', factionId: A, name: 'Transports', currentSystemId: sys, destinationSystemId: null, orbitingPlanetId: target.id, composition: { destroyer: 2 }, basePower: 60, strength: 1, transportedArmyIds: ['g-army'] };
    world.movement.fleets.set(fleet.id, fleet);
    world.movement.armies.set('g-army', { id: 'g-army', factionId: A, name: 'Wave', currentPlanetId: null, currentSystemId: sys, transportFleetId: fleet.id, composition: { INFANTRY: 1000 }, strength: 1, morale: 80 });
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: fleet.id, planetId: target.id, systemId: sys }, A));
    assert.ok(target.siege, lastError(A) || 'a siege began');
    const landed = target.siege.attackerState.unitComposition.INFANTRY ?? 0;
    assert.strictEqual(landed, 1000 - Math.round(1000 * PLATFORM_FLAK), `landed ${landed}`);
    delete target.siege;
    world.movement.fleets.delete(fleet.id);
});

test('a contested sky: both sides can land, and both lose men to the other\'s ships', () => {
    const orbit: any = { holder: 'contested', attackerPower: 100, defenderPower: 100, suppressed: true, shieldUp: false };
    assert.ok(canCrossOrbit(orbit, 'attacker'));
    assert.ok(canCrossOrbit(orbit, 'defender'));
    assert.ok(!canCrossOrbit({ ...orbit, holder: 'defender' }, 'attacker'), 'the enemy\'s orbit still bars the way');
    const comp = { INFANTRY: 500 };
    takeLandingLosses(comp, CONTESTED_LANDING_LOSS);
    assert.strictEqual(comp.INFANTRY, 450);
});

test('a contested sky: half supply for both, settling at half, no starving', () => {
    const surface: any = { sectors: [{ index: 0, terrain: 'plains', ring: 0, neighbors: [1] }, { index: 1, terrain: 'plains', ring: 1, neighbors: [0] }] };
    const war: any = { control: { 1: 'attacker' }, landingZones: [1] };
    const fs: any[] = [
        { id: 'a', side: 'attacker', unitType: 'INFANTRY', strength: 100, maxStrength: 100, sectorIndex: 1, supply: 100 },
        { id: 'd', side: 'defender', unitType: 'INFANTRY', strength: 100, maxStrength: 100, sectorIndex: 0, supply: 10 },
    ];
    for (let i = 0; i < 12; i++) updateSupply(surface, war, fs, { half: { attacker: true, defender: true } });
    assert.strictEqual(fs[0].supply, HALF_SUPPLY_LEVEL);
    assert.strictEqual(fs[1].supply, HALF_SUPPLY_LEVEL);
    assert.ok(fs.every(f => f.strength === 100 && !f.encircled));
});

test('an air strike on a gunned world loses bombers before it hits', () => {
    armGuns(true);
    world.movement.sorties = world.movement.sorties ?? new Map();
    const sortie: any = { id: 'g-sortie', factionId: A, parentBaseId: 'none', missionType: 'strike_planet', composition: { bomber: 5 }, originSystemId: sys, targetId: target.id, status: 'outbound', maxRadius: 3, currentSystemId: sys, launchedAt: world.nowSeconds };
    world.movement.sorties.set(sortie.id, sortie);
    silently(() => advanceSorties(world));
    assert.strictEqual(sortie.composition.bomber, 0, 'all five shot down by one platform');
    world.movement.sorties.delete(sortie.id);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
