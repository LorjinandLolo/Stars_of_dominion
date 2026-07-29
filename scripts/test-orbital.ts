// scripts/test-orbital.ts
// Phase 3 verification — orbital infrastructure: slots, construction, ratings,
// battle damage, repair, and the hooks into storage, haulage and shipbuilding.
// Run: npx tsx scripts/test-orbital.ts

import type { Planet as ConstructionPlanet, PlanetTile } from '../lib/construction/construction-types';
import type { PlanetProduction } from '../lib/economy/economy-types';
import {
    orbitalSlotCount,
    ensureOrbitalState,
    computeOrbitalRatings,
    buildableHullClasses,
    maxOrbitalDefensePower,
    isOrbitSuppressed,
    canBuildOrbital,
    startOrbitalConstruction,
    cancelOrbitalConstruction,
    processOrbitalQueue,
    applyOrbitalDamage,
    repairOrbital,
    tickOrbitalGlobal,
} from '../lib/orbital/orbital-service';
import {
    BASE_ORBITAL_SLOTS,
    DAMAGED_INTEGRITY_THRESHOLD,
    REPAIR_INTEGRITY_PER_HOUR,
} from '../lib/orbital/orbital-types';
import { ORBITAL_STRUCTURES, ORBITAL_STRUCTURE_BY_ID } from '../data/orbital-structures';
import { computeStorageCapacity } from '../lib/logistics/storage-service';
import { updatePlanetLogistics } from '../lib/logistics/distribution-service';
import { startSpaceConstruction } from '../lib/construction/ship-production-service';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

function near(actual: number, expected: number, tolerance = 0.01): boolean {
    return Math.abs(actual - expected) <= Math.abs(expected) * tolerance + 1e-6;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTile(tileId: string, buildingId: string | null): PlanetTile {
    return {
        tileId,
        districtType: 'industrial',
        buildingId,
        constructionState: buildingId ? 'active' : 'empty',
        constructionCompleteAt: null,
    };
}

function makePlanet(id: string, infrastructureLevel = 4, buildingIds: (string | null)[] = []): ConstructionPlanet {
    return {
        id,
        name: id,
        ownerId: 'faction-a',
        systemId: 'sys-1',
        planetType: 'industrial',
        infrastructureLevel,
        stability: 60,
        happiness: 60,
        specialization: null,
        maxTiles: 20,
        tiles: buildingIds.map((b, i) => makeTile(`${id}-t${i}`, b)),
        buildQueue: [],
        activeModifiers: [],
        tags: [],
        population: 1000,
        popCapacity: 5000,
        popGrowth: 0,
        unrest: 0,
        isOccupied: false,
        demographics: [],
    };
}

function makeEconomyPlanet(id: string, population = 1000): PlanetProduction {
    return {
        planetId: id,
        systemId: 'sys-1',
        factionId: 'faction-a',
        planetType: 'industrial',
        tags: [],
        services: {},
        demographics: {
            population, growthRate: 0, housingCapacity: 50000,
            serviceSatisfaction: 50, unrestRisk: 0, manpowerEfficiency: 1,
        },
        currentRates: {},
        stockpile: {},
        derived: { construction: 0, military: 0, research: 0, cultural: 0 },
        energyLoad: 0,
        energyProduced: 0,
        happiness: 60,
        instability: 0,
        commodityScarcity: false,
    };
}

/** Build a structure and immediately finish it. */
function place(planet: ConstructionPlanet, structureId: string): boolean {
    const result = startOrbitalConstruction(planet, structureId, 0);
    if (!result.success) return false;
    processOrbitalQueue(planet, 10_000_000);
    return true;
}

// ─── 1. Catalog integrity ─────────────────────────────────────────────────────

console.log('\n1. Orbital catalog');
{
    const ids = ORBITAL_STRUCTURES.map(s => s.id);
    check('structure ids are unique', new Set(ids).size === ids.length);
    check('every upgradesFrom points at a real structure',
        ORBITAL_STRUCTURES.every(s => !s.upgradesFrom || ORBITAL_STRUCTURE_BY_ID[s.upgradesFrom]),
        ORBITAL_STRUCTURES.filter(s => s.upgradesFrom && !ORBITAL_STRUCTURE_BY_ID[s.upgradesFrom]).map(s => s.id).join(', '));
    check('every structure has hull strength', ORBITAL_STRUCTURES.every(s => s.hullStrength > 0));
    check('every structure has a build time', ORBITAL_STRUCTURES.every(s => s.buildTimeSeconds > 0));
    check('stations do not require a station', ORBITAL_STRUCTURES
        .filter(s => s.category === 'station').every(s => !s.requiresStation));
    check('non-stations require a station', ORBITAL_STRUCTURES
        .filter(s => s.category !== 'station').every(s => s.requiresStation));
    check('the doc\'s named structures are all present',
        ['space_station', 'spaceyard', 'orbital_defense_network', 'orbital_logistics_hub',
            'orbital_warehouse', 'ship_depot', 'orbital_research_complex',
            'trade_station', 'military_station', 'research_station', 'fortress_station']
            .every(id => Boolean(ORBITAL_STRUCTURE_BY_ID[id])));
    check('the lookup map matches the array', Object.keys(ORBITAL_STRUCTURE_BY_ID).length === ORBITAL_STRUCTURES.length);
}

// ─── 2. Slots ─────────────────────────────────────────────────────────────────

console.log('\n2. Orbital slots');
{
    check('a low-infrastructure world gets the base slots',
        orbitalSlotCount(makePlanet('p', 1)) === BASE_ORBITAL_SLOTS);
    check('infrastructure 3 unlocks a slot',
        orbitalSlotCount(makePlanet('p', 3)) === BASE_ORBITAL_SLOTS + 1);
    check('infrastructure 5 unlocks another',
        orbitalSlotCount(makePlanet('p', 5)) === BASE_ORBITAL_SLOTS + 2);

    const planet = makePlanet('p', 1);
    const orbital = ensureOrbitalState(planet);
    check('ensureOrbitalState creates the layer', orbital.slots.length === BASE_ORBITAL_SLOTS);
    check('slots start empty', orbital.slots.every(s => s.state === 'empty' && s.structureId === null));

    planet.infrastructureLevel = 5;
    ensureOrbitalState(planet);
    check('raising infrastructure grows the layer', planet.orbital!.slots.length === BASE_ORBITAL_SLOTS + 2);

    // Occupied slots must survive an infrastructure loss.
    place(planet, 'space_station');
    const occupiedIndex = planet.orbital!.slots.findIndex(s => s.structureId === 'space_station');
    planet.orbital!.slots = [
        ...planet.orbital!.slots.filter(s => s.structureId === null),
        planet.orbital!.slots[occupiedIndex],
    ];
    planet.infrastructureLevel = 1;
    ensureOrbitalState(planet);
    check('an occupied trailing slot is not trimmed away',
        planet.orbital!.slots.some(s => s.structureId === 'space_station'));
}

// ─── 3. Build validation ──────────────────────────────────────────────────────

console.log('\n3. Build validation');
{
    check('an unknown structure is rejected',
        !canBuildOrbital(makePlanet('p'), 'not_a_thing').canBuild);

    const lowInfra = makePlanet('p-low', 1);
    check('infrastructure gates orbital construction',
        !canBuildOrbital(lowInfra, 'space_station').canBuild,
        canBuildOrbital(lowInfra, 'space_station').reason);

    const planet = makePlanet('p', 4);
    check('a station needs no prerequisite', canBuildOrbital(planet, 'space_station').canBuild);
    check('a spaceyard without a station is rejected',
        !canBuildOrbital(planet, 'spaceyard').canBuild,
        canBuildOrbital(planet, 'spaceyard').reason);

    place(planet, 'space_station');
    check('a spaceyard is allowed once a station stands',
        canBuildOrbital(planet, 'spaceyard').canBuild);
    check('a second station is rejected as unique',
        !canBuildOrbital(planet, 'space_station').canBuild);

    // Fill every remaining slot, then confirm the layer is full.
    while (canBuildOrbital(planet, 'orbital_defense_network').canBuild) {
        place(planet, 'orbital_defense_network');
    }
    check('a full orbit rejects further construction',
        (canBuildOrbital(planet, 'orbital_defense_network').reason ?? '').includes('No free orbital slot'),
        canBuildOrbital(planet, 'orbital_defense_network').reason);

    // Upgrades take the slot they replace, so they work on a full orbit.
    check('an upgrade is allowed on a full orbit',
        canBuildOrbital(planet, 'trade_station').canBuild);
    check('an upgrade without its source is rejected',
        !canBuildOrbital(makePlanet('p2', 4), 'fortress_station').canBuild);
}

// ─── 4. Construction lifecycle ────────────────────────────────────────────────

console.log('\n4. Construction lifecycle');
{
    const planet = makePlanet('p', 4);
    const started = startOrbitalConstruction(planet, 'space_station', 1000);
    check('construction starts', started.success && Boolean(started.order));
    const slot = planet.orbital!.slots.find(s => s.slotId === started.order!.slotId)!;
    check('the slot is marked under construction', slot.state === 'under_construction');
    check('the order lands in the queue', planet.orbital!.buildQueue.length === 1);
    check('an unfinished station provides nothing',
        computeOrbitalRatings(planet).defensePower === 0);

    const def = ORBITAL_STRUCTURE_BY_ID['space_station']!;
    processOrbitalQueue(planet, 1000 + def.buildTimeSeconds - 1);
    check('the queue does not finish early', slot.state === 'under_construction');

    const completed = processOrbitalQueue(planet, 1000 + def.buildTimeSeconds);
    check('the queue completes on time', completed.length === 1);
    check('the slot goes active at full integrity',
        slot.state === 'active' && slot.integrity === 100);
    check('the queue is drained', planet.orbital!.buildQueue.length === 0);
    check('a finished station provides its effects',
        computeOrbitalRatings(planet).defensePower > 0);

    // Upgrade in place, then cancel it.
    const upgrade = startOrbitalConstruction(planet, 'military_station', 5000);
    check('an upgrade is accepted', upgrade.success);
    check('the upgrade takes the station slot', upgrade.order!.slotId === slot.slotId);
    check('the upgrade records what it replaces', upgrade.order!.replacedStructureId === 'space_station');
    cancelOrbitalConstruction(planet, slot.slotId);
    check('cancelling an upgrade restores the original',
        slot.structureId === 'space_station' && slot.state === 'active');

    // Cancel a fresh build.
    const fresh = startOrbitalConstruction(planet, 'orbital_warehouse', 6000);
    cancelOrbitalConstruction(planet, fresh.order!.slotId);
    const freshSlot = planet.orbital!.slots.find(s => s.slotId === fresh.order!.slotId)!;
    check('cancelling a fresh build empties the slot',
        freshSlot.structureId === null && freshSlot.state === 'empty');
}

// ─── 5. Derived ratings ───────────────────────────────────────────────────────

console.log('\n5. Derived ratings');
{
    check('a world with no orbit rates zero',
        computeOrbitalRatings(makePlanet('p', 4)).activeStructures === 0);
    check('an absent planet rates zero', computeOrbitalRatings(undefined).defensePower === 0);

    const planet = makePlanet('p', 5);
    place(planet, 'space_station');
    place(planet, 'spaceyard');
    place(planet, 'orbital_defense_network');
    place(planet, 'orbital_warehouse');

    const ratings = computeOrbitalRatings(planet);
    check('a station is detected', ratings.hasStation);
    check('active structures are counted', ratings.activeStructures === 4);
    check('defense power sums across structures',
        near(ratings.defensePower, 25 + 160), `got ${ratings.defensePower}`);
    check('shipyard tier is reported', ratings.shipyardTier === 1);
    check('ship production bonus is reported', near(ratings.shipProductionBonus, 20));
    check('orbital storage capacity is reported by class',
        near(ratings.storageCapacity['bulk'] ?? 0, 120000));
    check('orbital handling is reported', near(ratings.storageThroughput, 30));
    check('logistics capacity is reported', near(ratings.logisticsCapacity, 30));

    check('tier 1 unlocks frigates but not capitals',
        buildableHullClasses(planet).includes('frigate') &&
        !buildableHullClasses(planet).includes('capital'));

    // Integrity scales effects linearly.
    const defenseSlot = planet.orbital!.slots.find(s => s.structureId === 'orbital_defense_network')!;
    defenseSlot.integrity = 50;
    defenseSlot.state = 'damaged';
    check('a half-wrecked structure gives half its effect',
        near(computeOrbitalRatings(planet).defensePower, 25 + 80),
        `got ${computeOrbitalRatings(planet).defensePower}`);

    // A badly damaged yard cannot lay a keel it could when intact.
    const yardSlot = planet.orbital!.slots.find(s => s.structureId === 'spaceyard')!;
    yardSlot.integrity = DAMAGED_INTEGRITY_THRESHOLD - 1;
    yardSlot.state = 'damaged';
    check('a wrecked yard loses its tier', computeOrbitalRatings(planet).shipyardTier === 0);
    yardSlot.integrity = 100;
    yardSlot.state = 'active';

    // Tier takes the best yard, not the sum.
    place(planet, 'advanced_spaceyard');
    check('upgrading the yard raises the tier', computeOrbitalRatings(planet).shipyardTier === 2);
    check('tier 2 unlocks destroyers but still not capitals',
        buildableHullClasses(planet).includes('destroyer') &&
        !buildableHullClasses(planet).includes('capital'));
}

// ─── 6. Battle damage ─────────────────────────────────────────────────────────

console.log('\n6. Battle damage');
{
    const planet = makePlanet('p', 5);
    place(planet, 'space_station');
    place(planet, 'orbital_defense_network');

    const maxPower = maxOrbitalDefensePower(planet);
    check('peak defense power is reported', near(maxPower, 25 + 160));
    check('an intact orbit is not suppressed', !isOrbitSuppressed(planet));
    check('an empty orbit is trivially suppressed', isOrbitSuppressed(makePlanet('empty', 4)));

    const light = applyOrbitalDamage(planet, 200);
    check('light damage does not destroy anything', light.destroyedSlotIds.length === 0);
    check('damage lowers integrity',
        planet.orbital!.slots.filter(s => s.structureId).every(s => s.integrity < 100));
    check('damage is spread proportionally to hull', (() => {
        const station = planet.orbital!.slots.find(s => s.structureId === 'space_station')!;
        const network = planet.orbital!.slots.find(s => s.structureId === 'orbital_defense_network')!;
        // Equal integrity loss: damage share tracks hull, so percentage loss matches.
        return near(100 - station.integrity, 100 - network.integrity, 0.05);
    })());
    check('an orbit still shooting back holds control', !light.orbitControlLost);

    const heavy = applyOrbitalDamage(planet, 100000);
    check('overwhelming damage destroys structures', heavy.destroyedSlotIds.length > 0);
    check('a broken layer loses orbit control', heavy.orbitControlLost);
    check('the loss is recorded on the layer', planet.orbital!.orbitControlLost === true);
    check('a destroyed structure contributes nothing',
        computeOrbitalRatings(planet).defensePower === 0);
    check('bombarding an already dead orbit is safe',
        applyOrbitalDamage(planet, 5000).destroyedSlotIds.length === 0);
    check('zero damage is a no-op', applyOrbitalDamage(planet, 0).hullDamageApplied === 0);

    // Shields soak part of the volley.
    const unshielded = makePlanet('unshielded', 5);
    place(unshielded, 'space_station');
    place(unshielded, 'orbital_defense_network');
    const shielded = makePlanet('shielded', 5);
    place(shielded, 'space_station');
    place(shielded, 'orbital_defense_network');
    place(shielded, 'shield_projector_array');

    const bare = applyOrbitalDamage(unshielded, 1000);
    const shieldedResult = applyOrbitalDamage(shielded, 1000);
    check('shields absorb nothing when absent', bare.shieldAbsorbed === 0);
    check('shields absorb part of the volley', shieldedResult.shieldAbsorbed > 0);
    check('shields reduce hull damage taken',
        shieldedResult.hullDamageApplied < bare.hullDamageApplied);
}

// ─── 7. Repair ────────────────────────────────────────────────────────────────

console.log('\n7. Repair');
{
    const planet = makePlanet('p', 5);
    place(planet, 'space_station');
    place(planet, 'orbital_defense_network');
    applyOrbitalDamage(planet, 900);

    const damaged = planet.orbital!.slots.filter(s => s.state === 'damaged');
    check('bombardment leaves damaged structures', damaged.length > 0,
        planet.orbital!.slots.map(s => `${s.structureId}:${s.state}:${s.integrity.toFixed(0)}`).join(' '));

    const before = damaged[0].integrity;
    repairOrbital(planet, 3600);
    check('an hour of repair restores integrity',
        near(damaged[0].integrity, Math.min(100, before + REPAIR_INTEGRITY_PER_HOUR)),
        `${before.toFixed(1)} -> ${damaged[0].integrity.toFixed(1)}`);

    // Repair to full and confirm the state flips back.
    repairOrbital(planet, 3600 * 100);
    check('full repair returns structures to active',
        planet.orbital!.slots.filter(s => s.structureId && s.state !== 'destroyed')
            .every(s => s.state === 'active' && s.integrity === 100));
    check('a repaired orbit regains control', planet.orbital!.orbitControlLost === false);

    // Destroyed structures are not repaired, and a siege stops all repair.
    const wrecked = makePlanet('wrecked', 5);
    place(wrecked, 'space_station');
    place(wrecked, 'orbital_defense_network');
    applyOrbitalDamage(wrecked, 100000);
    repairOrbital(wrecked, 3600 * 100);
    check('destroyed structures are not repaired',
        wrecked.orbital!.slots.filter(s => s.structureId).every(s => s.state === 'destroyed'));

    const besieged = makePlanet('besieged', 5);
    place(besieged, 'space_station');
    applyOrbitalDamage(besieged, 600);
    besieged.siege = { siegeId: 's' } as any;
    check('a besieged planet repairs nothing', repairOrbital(besieged, 3600) === 0);
}

// ─── 8. Integration with storage, haulage and shipbuilding ────────────────────

console.log('\n8. Cross-system integration');
{
    // Orbital warehouses raise planetary storage capacity.
    const bare = makePlanet('bare', 4);
    const orbited = makePlanet('orbited', 4);
    place(orbited, 'space_station');
    place(orbited, 'orbital_warehouse');

    const bareCap = computeStorageCapacity(bare);
    const orbitedCap = computeStorageCapacity(orbited);
    check('an orbital warehouse raises bulk capacity',
        (orbitedCap.capacity.metals ?? 0) > (bareCap.capacity.metals ?? 0),
        `${bareCap.capacity.metals} -> ${orbitedCap.capacity.metals}`);
    check('an orbital warehouse raises volatile capacity',
        (orbitedCap.capacity.energy ?? 0) > (bareCap.capacity.energy ?? 0));
    check('an orbital warehouse raises handling throughput',
        orbitedCap.throughput > bareCap.throughput);
    check('a destroyed orbital warehouse stops contributing', (() => {
        const slot = orbited.orbital!.slots.find(s => s.structureId === 'orbital_warehouse')!;
        slot.state = 'destroyed';
        slot.integrity = 0;
        const after = computeStorageCapacity(orbited);
        slot.state = 'active';
        slot.integrity = 100;
        return near(after.capacity.metals ?? 0, bareCap.capacity.metals ?? 0);
    })());

    // Orbital logistics hubs raise planetary haulage.
    const hubbed = makePlanet('hubbed', 4);
    place(hubbed, 'space_station');
    place(hubbed, 'orbital_logistics_hub');
    const plainState = updatePlanetLogistics(makeEconomyPlanet('bare'), bare, bareCap);
    const hubState = updatePlanetLogistics(makeEconomyPlanet('hubbed'), hubbed, computeStorageCapacity(hubbed));
    check('an orbital logistics hub raises haulage capacity',
        hubState.capacity > plainState.capacity,
        `${plainState.capacity} -> ${hubState.capacity}`);

    // Shipbuilding is gated by yard tier.
    const yardPlanet = makePlanet('yard', 4);
    place(yardPlanet, 'space_station');
    const world = {
        nowSeconds: 0,
        construction: { planets: new Map([['yard', yardPlanet]]), spaceBuildQueue: [] },
    } as any;
    const cost = { metals: 0, chemicals: 0, food: 0, manpower: 0, credits: 0 };

    const noYard = startSpaceConstruction(world, 'yard', 'corvette', cost, 600);
    check('no shipyard means no ships', !noYard.success, noYard.error);

    place(yardPlanet, 'spaceyard');
    const tier1 = startSpaceConstruction(world, 'yard', 'corvette', cost, 600);
    check('a tier 1 yard builds corvettes', tier1.success, tier1.error);
    const tier1Destroyer = startSpaceConstruction(world, 'yard', 'destroyer', cost, 600);
    check('a tier 1 yard cannot build destroyers', !tier1Destroyer.success, tier1Destroyer.error);

    place(yardPlanet, 'advanced_spaceyard');
    const tier2Destroyer = startSpaceConstruction(world, 'yard', 'destroyer', cost, 600);
    check('a tier 2 yard builds destroyers', tier2Destroyer.success, tier2Destroyer.error);
    check('a better yard builds faster', (() => {
        const t2 = tier2Destroyer.order!.completesAtSeconds;
        return t2 < 600; // 600s nominal, sped up by the yard bonus
    })(), `completes at ${tier2Destroyer.order?.completesAtSeconds}`);
}

// ─── 9. World tick ────────────────────────────────────────────────────────────

console.log('\n9. World tick');
{
    const building = makePlanet('building', 4);
    startOrbitalConstruction(building, 'space_station', 0);
    const damaged = makePlanet('damaged', 4);
    place(damaged, 'space_station');
    applyOrbitalDamage(damaged, 700);
    const damagedIntegrity = damaged.orbital!.slots.find(s => s.structureId)!.integrity;

    const world = {
        nowSeconds: 999_999,
        construction: { planets: new Map([['building', building], ['damaged', damaged]]) },
    } as any;

    tickOrbitalGlobal(world, 3600);
    check('the global tick completes finished construction',
        building.orbital!.slots.find(s => s.structureId === 'space_station')?.state === 'active');
    check('the global tick repairs damage',
        damaged.orbital!.slots.find(s => s.structureId)!.integrity > damagedIntegrity);

    // A world with no orbit and low infrastructure must not be given one.
    const untouched = makePlanet('untouched', 1);
    const world2 = { nowSeconds: 1, construction: { planets: new Map([['untouched', untouched]]) } } as any;
    tickOrbitalGlobal(world2, 60);
    check('the tick does not allocate a layer for undeveloped worlds',
        untouched.orbital === undefined);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
