// scripts/test-capital-fall.ts
// Every world can be taken by force:
//  1. district 0 (CAPITAL_SECTOR) is never a mountain wall or open sea; an
//     outpost or a colony on dead rock has its dome there (generator.ts);
//  2. a supply source ringed by the invader for ENCIRCLE_STARVE_CYCLES stops
//     feeding anyone (formations.ts openDefenderSources);
//  3. Airborne and Special Ops can be dropped onto any district of a siege,
//     the shield generator included (MIL_AIR_DROP, lib/combat/siege/air-drop.ts).
// Run: npx tsx scripts/test-capital-fall.ts

import assert from 'assert';
import { bootSoakWorld, empireIds, quietConsole } from './soak-harness';
import { executeOrder } from './game-loop';
import { generateSurface } from '../lib/planet-surface/generator';
import { canEverEnter, updateSupply, ENCIRCLE_STARVE_CYCLES } from '../lib/combat/siege/formations';
import { CAPITAL_SECTOR } from '../lib/combat/siege/district-front';
import { airDropTargets } from '../lib/combat/siege/air-drop';

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
for (const f of [A, B]) { const r = world.economy.factions.get(f).reserves; for (const k of Object.keys(r)) r[k] = 1e6; }

const planets: any[] = [...world.construction.planets.values()];

test('no world\'s capital district is a wall infantry can never enter', () => {
    const bad = planets.filter(p => !canEverEnter('INFANTRY', generateSurface(p.id, p.planetType, p.tags).sectors[CAPITAL_SECTOR].terrain));
    assert.strictEqual(bad.length, 0, bad.map(p => `${p.name}: ${generateSurface(p.id, p.planetType, p.tags).sectors[CAPITAL_SECTOR].terrain}`).join(', '));
});

test('an outpost on dead rock has its dome in the capital district', () => {
    const rock = planets.find(p => (p.tags ?? []).includes('colonizable')) ?? planets[0];
    const tags = [...(rock.tags ?? []).filter((t: string) => t !== 'colonizable'), 'dead_matter', 'outpost'];
    assert.strictEqual(generateSurface(rock.id, rock.planetType, tags).sectors[CAPITAL_SECTOR].terrain, 'urban');
    const empty = generateSurface(rock.id, rock.planetType, ['dead_matter']);
    assert.ok(!empty.sectors.some(s => s.terrain === 'urban'), 'an empty dead world still has no city');
});

test(`a surrounded capital is fed for ${ENCIRCLE_STARVE_CYCLES - 1} cycles, then starves`, () => {
    const surface: any = { sectors: [
        { index: 0, terrain: 'mountains', ring: 0, neighbors: [1, 2] },
        { index: 1, terrain: 'plains', ring: 1, neighbors: [0, 2] },
        { index: 2, terrain: 'plains', ring: 1, neighbors: [0, 1] },
    ] };
    const war: any = { control: { 1: 'attacker', 2: 'attacker' }, landingZones: [1] };
    const garrison: any[] = [{ id: 'g', side: 'defender', unitType: 'INFANTRY', strength: 100, maxStrength: 100, sectorIndex: 0, supply: 100 }];
    for (let c = 1; c < ENCIRCLE_STARVE_CYCLES; c++) {
        updateSupply(surface, war, garrison, {});
        assert.ok(!garrison[0].encircled, `still fed in cycle ${c}`);
    }
    const res = updateSupply(surface, war, garrison, {});
    assert.ok(garrison[0].encircled, 'cut off');
    assert.ok(res.log.some(l => /Surrounded/.test(l)), res.log.join(' | '));
    delete war.control[2];
    updateSupply(surface, war, garrison, {});
    assert.ok(!garrison[0].encircled, 'a corridor reopened feeds it again');
});

// ── Air drop ────────────────────────────────────────────────────────────────
const target: any = planets.find(p => p.ownerId === B);
const sys = target.systemId;
target.tiles = (target.tiles ?? []).filter((t: any) => !['orbital_defense_platform', 'shield_generator'].includes(t.buildingId));
target.orbital = { slots: [], buildQueue: [] }; // the orbit is already beaten down

function transport(id: string, composition: Record<string, number>) {
    const fleet: any = { id, factionId: A, name: id, currentSystemId: sys, destinationSystemId: null, orbitingPlanetId: target.id, composition: { destroyer: 2 }, basePower: 60, strength: 1, transportedArmyIds: [`${id}-army`] };
    world.movement.fleets.set(id, fleet);
    world.movement.armies.set(`${id}-army`, { id: `${id}-army`, factionId: A, name: id, currentPlanetId: null, currentSystemId: sys, transportFleetId: id, composition: { ...composition }, strength: 1, morale: 80 });
    return fleet;
}

test('an air drop needs a siege of ours to drop into', () => {
    delete target.siege;
    const f = transport('drop-early', { AIRBORNE: 200 });
    silently(() => executeOrder(world, 'MIL_AIR_DROP', { fleetId: f.id, planetId: target.id, sectorIndex: 0 }, A));
    assert.match(lastError(A), /beachhead/);
});

test('paratroopers drop onto the shield district behind the line; the infantry stay aboard', () => {
    target.tiles.push({ tileId: 'drop-shield', buildingId: 'shield_generator', constructionState: 'active', sectorIndex: 30 });
    const wave = transport('drop-wave', { INFANTRY: 1500 });
    silently(() => executeOrder(world, 'MIL_INVASION_PLANET', { fleetId: wave.id, planetId: target.id, systemId: sys }, A));
    const war = target.siege?.districts;
    assert.ok(war?.formations?.length, lastError(A) || 'the beachhead is down');
    const surface = generateSurface(target.id, target.planetType, target.tags);
    const shield = airDropTargets(surface, war).find(p => p.kind === 'shield');
    assert.ok(shield, `the shield is a drop target: ${airDropTargets(surface, war).map(p => p.kind).join(', ')}`);
    assert.ok(!war.landingZones.includes(shield!.sectorIndex), 'behind the line, not at the beachhead');

    const f = transport('drop-para', { AIRBORNE: 200, SPECIAL_OPS: 50, INFANTRY: 400 });
    target.siege.orbit = { holder: 'attacker', attackerPower: 60, defenderPower: 0, suppressed: true, shieldUp: true };
    silently(() => executeOrder(world, 'MIL_AIR_DROP', { fleetId: f.id, planetId: target.id, sectorIndex: shield!.sectorIndex }, A));
    const dropped = war.formations.filter((x: any) => x.side === 'attacker' && x.sectorIndex === shield!.sectorIndex);
    assert.strictEqual(dropped.reduce((s: number, x: any) => s + x.strength, 0), 250, lastError(A));
    assert.ok(dropped.every((x: any) => ['AIRBORNE', 'SPECIAL_OPS'].includes(x.unitType)));
    const left = world.movement.armies.get('drop-para-army');
    assert.deepStrictEqual(left.composition, { INFANTRY: 400 });
});

test('no drop while the enemy holds the sky', () => {
    const f = transport('drop-blocked', { AIRBORNE: 100 });
    target.siege.orbit = { holder: 'defender', attackerPower: 0, defenderPower: 300, suppressed: true, shieldUp: false };
    silently(() => executeOrder(world, 'MIL_AIR_DROP', { fleetId: f.id, planetId: target.id, sectorIndex: 0 }, A));
    assert.match(lastError(A), /holds the orbit/);
    assert.strictEqual(world.movement.armies.get('drop-blocked-army').composition.AIRBORNE, 100);
});

test('flak takes its share of a drop under the guns', () => {
    target.tiles.push({ tileId: 'drop-guns', buildingId: 'orbital_defense_platform', constructionState: 'active', sectorIndex: 31 });
    target.siege.districts.strongpoints = [];
    target.siege.orbit = { holder: 'attacker', attackerPower: 60, defenderPower: 0, suppressed: true, shieldUp: false };
    const f = transport('drop-flak', { AIRBORNE: 200 });
    const before = target.siege.districts.formations.length;
    silently(() => executeOrder(world, 'MIL_AIR_DROP', { fleetId: f.id, planetId: target.id, sectorIndex: 0 }, A));
    const added = target.siege.districts.formations.slice(before).reduce((s: number, x: any) => s + x.strength, 0);
    assert.strictEqual(added, 170, `${added} of 200 got down`);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
