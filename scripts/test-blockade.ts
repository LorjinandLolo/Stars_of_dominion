// scripts/test-blockade.ts
// Phase 6 verification — blockade starvation: detection, severity, import and
// orbital cuts, garrison supply drawn from planetary stores, and the empire
// rollups the UI reads.
// Run: npx tsx scripts/test-blockade.ts

import type { Planet as ConstructionPlanet, PlanetTile } from '../lib/construction/construction-types';
import type { PlanetProduction } from '../lib/economy/economy-types';
import {
    computeBlockadeSeverity,
    hoursOfEssentialCover,
    updateBlockade,
    tickBlockades,
    importsBlocked,
    tradeThroughputUnderBlockade,
    orbitalStoresUnreachable,
    drawGarrisonSupply,
    tickGarrisonSupply,
    getBlockadeReport,
    getEmpireHoldings,
    IMPORT_CUT_SEVERITY,
    ORBITAL_CUT_SEVERITY,
    STARVATION_COVER_HOURS,
    FULL_BLOCKADE_POWER,
} from '../lib/logistics/blockade-service';
import { computeStorageCapacity } from '../lib/logistics/storage-service';
import { tickInternalDistribution } from '../lib/economy/economy-service';
import { startOrbitalConstruction, processOrbitalQueue } from '../lib/orbital/orbital-service';

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
        districtType: 'any',
        buildingId,
        constructionState: buildingId ? 'active' : 'empty',
        constructionCompleteAt: null,
    };
}

function makePlanet(id: string, buildingIds: (string | null)[] = [null], ownerId = 'faction-a'): ConstructionPlanet {
    return {
        id,
        name: id,
        ownerId,
        systemId: 'sys-1',
        planetType: 'standard',
        infrastructureLevel: 4,
        stability: 60,
        happiness: 60,
        specialization: null,
        maxTiles: 20,
        tiles: buildingIds.map((b, i) => makeTile(`${id}-t${i}`, b)),
        buildQueue: [],
        activeModifiers: [],
        tags: [],
        population: 2000,
        popCapacity: 10000,
        popGrowth: 0,
        unrest: 0,
        isOccupied: false,
        demographics: [],
    };
}

function makeEconomyPlanet(
    id: string,
    stockpile: Record<string, number> = {},
    consumptionRates: Record<string, number> = {},
    factionId = 'faction-a'
): PlanetProduction {
    return {
        planetId: id,
        systemId: 'sys-1',
        factionId,
        planetType: 'industrial',
        tags: [],
        services: {},
        demographics: {
            population: 2000, growthRate: 0, housingCapacity: 50000,
            serviceSatisfaction: 50, unrestRisk: 0, manpowerEfficiency: 1,
        },
        currentRates: {},
        stockpile: { ...stockpile },
        consumptionRates: { ...consumptionRates },
        derived: { construction: 0, military: 0, research: 0, cultural: 0 },
        energyLoad: 0,
        energyProduced: 0,
        happiness: 60,
        instability: 0,
        commodityScarcity: false,
    };
}

/** A world at war with faction-b, with `power` worth of hostile fleets in orbit. */
function makeWorld(
    planets: Array<[ConstructionPlanet, PlanetProduction]>,
    hostilePower: number,
    atWar = true
) {
    const fleets = new Map<string, any>();
    if (hostilePower > 0) {
        fleets.set('enemy-1', {
            id: 'enemy-1',
            factionId: 'faction-b',
            currentSystemId: 'sys-1',
            basePower: hostilePower,
            strength: 1,
        });
    }
    const rivalries = new Map<string, any>();
    if (atWar) {
        rivalries.set('rivalry-faction-b-faction-a', { escalationLevel: 9 });
    }
    return {
        nowSeconds: 100_000,
        movement: { fleets },
        rivalries,
        construction: { planets: new Map(planets.map(([c]) => [c.id, c])) },
        economy: { planets: new Map(planets.map(([c, e]) => [c.id, e])) },
    } as any;
}

function placeOrbital(planet: ConstructionPlanet, structureId: string) {
    startOrbitalConstruction(planet, structureId, 0);
    processOrbitalQueue(planet, 10_000_000);
}

// ─── 1. Severity ──────────────────────────────────────────────────────────────

console.log('\n1. Severity');
{
    const undefended = makePlanet('undefended');
    check('no hostiles means no blockade', computeBlockadeSeverity(0, undefended) === 0);
    check('a token raider barely registers',
        computeBlockadeSeverity(10, undefended) < 0.1,
        `got ${computeBlockadeSeverity(10, undefended)}`);
    check('a full battle fleet nearly severs an undefended world',
        computeBlockadeSeverity(FULL_BLOCKADE_POWER, undefended) > 0.9,
        `got ${computeBlockadeSeverity(FULL_BLOCKADE_POWER, undefended)}`);
    check('severity is capped at 1',
        computeBlockadeSeverity(FULL_BLOCKADE_POWER * 100, undefended) <= 1);
    check('severity rises monotonically with hostile power',
        [0, 50, 100, 200, 400, 800].every((p, i, arr) =>
            i === 0 || computeBlockadeSeverity(p, undefended) >= computeBlockadeSeverity(arr[i - 1], undefended)));

    const defended = makePlanet('defended');
    placeOrbital(defended, 'space_station');
    placeOrbital(defended, 'orbital_defense_network');
    check('orbital defenses reduce severity',
        computeBlockadeSeverity(FULL_BLOCKADE_POWER, defended) <
        computeBlockadeSeverity(FULL_BLOCKADE_POWER, undefended),
        `defended ${computeBlockadeSeverity(FULL_BLOCKADE_POWER, defended).toFixed(2)} vs ` +
        `undefended ${computeBlockadeSeverity(FULL_BLOCKADE_POWER, undefended).toFixed(2)}`);
}

// ─── 2. Hours of cover ────────────────────────────────────────────────────────

console.log('\n2. Hours of cover');
{
    check('a world with no consumption never runs out',
        hoursOfEssentialCover(makeEconomyPlanet('p', { food: 100 })) === Infinity);

    // 3600 food, eating 1/second → one hour of cover.
    const oneHour = makeEconomyPlanet('p', { food: 3600, energy: 1e9 }, { food: 1, energy: 0.000001 });
    check('cover is stock divided by draw', near(hoursOfEssentialCover(oneHour), 1),
        `got ${hoursOfEssentialCover(oneHour)}`);

    const dry = makeEconomyPlanet('p', { food: 0, energy: 0 }, { food: 1, energy: 1 });
    check('an empty world has no cover', hoursOfEssentialCover(dry) === 0);

    const lopsided = makeEconomyPlanet('p', { food: 1e9, energy: 3600 }, { food: 1, energy: 1 });
    check('cover reports the scarcest essential, not the average',
        near(hoursOfEssentialCover(lopsided), 1));
}

// ─── 3. Detection ─────────────────────────────────────────────────────────────

console.log('\n3. Detection');
{
    const planet = makePlanet('p');
    const eco = makeEconomyPlanet('p', { food: 1e6, energy: 1e6 }, { food: 1, energy: 1 });

    // Peace: no blockade even with a fleet parked in the system.
    const peace = makeWorld([[planet, eco]], 500, false);
    const peaceState = updateBlockade(peace, eco, planet);
    check('a fleet you are not at war with does not blockade', !peaceState.active,
        `severity ${peaceState.severity}`);

    // War: blockade.
    const war = makeWorld([[planet, eco]], 500, true);
    const warState = updateBlockade(war, eco, planet);
    check('a hostile fleet blockades', warState.active);
    check('the blockading faction is named',
        warState.blockadingFactionIds.includes('faction-b'));
    check('the state is written onto the economy planet', eco.blockade?.active === true);
    check('the state is mirrored onto the construction planet', planet.blockade?.active === true);

    // Own fleets never blockade.
    const ownFleet = makeWorld([[planet, eco]], 0, true);
    ownFleet.movement.fleets.set('mine', {
        id: 'mine', factionId: 'faction-a', currentSystemId: 'sys-1', basePower: 900, strength: 1,
    });
    check('your own fleet does not blockade you', !updateBlockade(ownFleet, eco, planet).active);

    // A fleet in a different system does not blockade.
    const elsewhere = makeWorld([[planet, eco]], 500, true);
    elsewhere.movement.fleets.get('enemy-1').currentSystemId = 'sys-9';
    check('a fleet in another system does not blockade',
        !updateBlockade(elsewhere, eco, planet).active);

    // A siege is a blockade whatever the fleet situation.
    const besieged = makePlanet('besieged');
    besieged.siege = { siegeId: 's', defenderState: { garrisonTroops: 1000, supply: 500, maxSupply: 1000 } } as any;
    const siegeWorld = makeWorld([[besieged, eco]], 0, true);
    const siegeState = updateBlockade(siegeWorld, eco, besieged);
    check('an active siege blockades on its own', siegeState.active);
    check('a siege is a near-total cordon', siegeState.severity >= 0.85);
    check('a siege cuts imports', siegeState.importsCut);
    check('a siege cuts orbital stores', siegeState.orbitalStoresCut);

    // A planet with no construction record must not crash.
    const orphan = makeEconomyPlanet('orphan');
    check('a planet with no construction record is never blockaded',
        !updateBlockade(makeWorld([], 0), orphan, undefined).active);

    // Regression: `isOrbitSuppressed` is trivially true for a world that never
    // built orbital guns. Without guarding on there having BEEN guns to silence,
    // a lone scout imposed the same cordon on a colony as a fleet on a fortress.
    const colony = makePlanet('colony');
    const colonyEco = makeEconomyPlanet('colony', { food: 1e6, energy: 1e6 }, { food: 1, energy: 1 });
    const scoutSeverity = updateBlockade(makeWorld([[colony, colonyEco]], 20), colonyEco, colony).severity;
    check('a lone scout does not near-sever an undeveloped colony',
        scoutSeverity < 0.2, `severity ${scoutSeverity.toFixed(2)}`);

    // But a world whose defenses HAVE been silenced is near-severed.
    const silenced = makePlanet('silenced');
    placeOrbital(silenced, 'space_station');
    placeOrbital(silenced, 'orbital_defense_network');
    for (const slot of silenced.orbital!.slots) {
        if (slot.structureId) { slot.state = 'destroyed'; slot.integrity = 0; }
    }
    const silencedEco = makeEconomyPlanet('silenced', { food: 1e6, energy: 1e6 }, { food: 1, energy: 1 });
    const silencedSeverity = updateBlockade(
        makeWorld([[silenced, silencedEco]], 20), silencedEco, silenced).severity;
    check('a world whose orbital guns were silenced is near-severed',
        silencedSeverity >= 0.7, `severity ${silencedSeverity.toFixed(2)}`);
}

// ─── 4. Thresholds ────────────────────────────────────────────────────────────

console.log('\n4. Cut thresholds');
{
    const planet = makePlanet('p');
    const eco = makeEconomyPlanet('p', { food: 1e6, energy: 1e6 }, { food: 1, energy: 1 });

    // Light cordon: throttled but not severed.
    const light = makeWorld([[planet, eco]], 40);
    const lightState = updateBlockade(light, eco, planet);
    check('a light cordon is active but does not cut imports',
        lightState.active && !lightState.importsCut,
        `severity ${lightState.severity.toFixed(2)}`);
    check('a light cordon still throttles trade',
        tradeThroughputUnderBlockade(eco) < 1 && tradeThroughputUnderBlockade(eco) > 0);

    // Heavy cordon: imports and orbital stores both gone.
    const heavy = makeWorld([[planet, eco]], FULL_BLOCKADE_POWER);
    const heavyState = updateBlockade(heavy, eco, planet);
    check('a heavy cordon cuts imports', heavyState.importsCut,
        `severity ${heavyState.severity.toFixed(2)}`);
    check('a heavy cordon cuts orbital stores', heavyState.orbitalStoresCut);
    check('the thresholds are ordered as declared', IMPORT_CUT_SEVERITY < ORBITAL_CUT_SEVERITY);
    check('importsBlocked reflects the cut', importsBlocked(eco));
    check('orbitalStoresUnreachable reflects the cut', orbitalStoresUnreachable(planet));

    // A world with no blockade is unaffected.
    const free = makeEconomyPlanet('free');
    check('an unblockaded world has full trade throughput',
        tradeThroughputUnderBlockade(free) === 1);
    check('an unblockaded world has imports', !importsBlocked(free));
    check('an unblockaded world can reach its orbital stores',
        !orbitalStoresUnreachable(makePlanet('free')));

    // Starvation flag.
    const lean = makeEconomyPlanet('lean', { food: 60, energy: 1e9 }, { food: 1, energy: 0.000001 });
    const leanPlanet = makePlanet('lean');
    const leanState = updateBlockade(makeWorld([[leanPlanet, lean]], FULL_BLOCKADE_POWER), lean, leanPlanet);
    check('a blockaded world with thin stores is starving', leanState.starving,
        `cover ${leanState.hoursOfCover.toFixed(2)}h, threshold ${STARVATION_COVER_HOURS}h`);
    const stocked = makeEconomyPlanet('stocked', { food: 1e9, energy: 1e9 }, { food: 1, energy: 1 });
    const stockedPlanet = makePlanet('stocked');
    check('a blockaded world with deep stores is not starving',
        !updateBlockade(makeWorld([[stockedPlanet, stocked]], FULL_BLOCKADE_POWER), stocked, stockedPlanet).starving);
    check('an unblockaded world with thin stores is not "starving"',
        !updateBlockade(makeWorld([[leanPlanet, lean]], 0), lean, leanPlanet).starving);
}

// ─── 5. Orbital stores are lost under blockade ────────────────────────────────

console.log('\n5. Orbital stores cut off');
{
    const planet = makePlanet('p');
    placeOrbital(planet, 'space_station');
    placeOrbital(planet, 'orbital_warehouse');

    const reachable = computeStorageCapacity(planet);
    check('orbital warehouses count while reachable',
        (reachable.capacity.metals ?? 0) > 0 && reachable.throughput > 0);

    planet.blockade = { active: true, severity: 0.9, orbitalStoresCut: true };
    const cutOff = computeStorageCapacity(planet);
    check('a blockade removes the orbital capacity',
        (cutOff.capacity.metals ?? 0) < (reachable.capacity.metals ?? 0),
        `${reachable.capacity.metals} -> ${cutOff.capacity.metals}`);
    check('a blockade removes the orbital handling',
        cutOff.throughput < reachable.throughput);

    planet.blockade = { active: true, severity: 0.3, orbitalStoresCut: false };
    check('a light blockade leaves orbital stores reachable',
        near(computeStorageCapacity(planet).capacity.metals ?? 0, reachable.capacity.metals ?? 0));
}

// ─── 6. Pooling excludes blockaded worlds ─────────────────────────────────────

console.log('\n6. Pooling exclusion');
{
    // Two worlds in one system: one starving, one with a food mountain.
    const rich = makeEconomyPlanet('rich', { food: 100_000 }, { food: 1 });
    const poor = makeEconomyPlanet('poor', { food: 0 }, { food: 10 });
    rich.logistics = { efficiency: 1 } as any;
    poor.logistics = { efficiency: 1 } as any;

    const eco = { planets: new Map([['rich', rich], ['poor', poor]]) } as any;
    tickInternalDistribution(eco);
    check('an unblockaded neighbour shares its food',
        (poor.stockpile.food ?? 0) > 0, `got ${poor.stockpile.food}`);

    // Now blockade the poor world: the pool must not reach it.
    const rich2 = makeEconomyPlanet('rich2', { food: 100_000 }, { food: 1 });
    const poor2 = makeEconomyPlanet('poor2', { food: 0 }, { food: 10 });
    rich2.logistics = { efficiency: 1 } as any;
    poor2.logistics = { efficiency: 1 } as any;
    poor2.blockade = {
        active: true, sinceSeconds: 0, blockadingFactionIds: ['faction-b'], severity: 0.9,
        importsCut: true, orbitalStoresCut: true, hoursOfCover: 0, starving: true,
    };

    const eco2 = { planets: new Map([['rich2', rich2], ['poor2', poor2]]) } as any;
    tickInternalDistribution(eco2);
    check('a blockaded world receives nothing from the pool',
        (poor2.stockpile.food ?? 0) === 0, `got ${poor2.stockpile.food}`);
    check('the blockaded world\'s neighbour keeps its own stock',
        near(rich2.stockpile.food ?? 0, 100_000));
}

// ─── 7. Garrison supply ───────────────────────────────────────────────────────

console.log('\n7. Garrison supply');
{
    const unbesieged = makePlanet('calm');
    const calmEco = makeEconomyPlanet('calm', { food: 1000, ammo: 1000 });
    const calmResult = drawGarrisonSupply(calmEco, unbesieged, 3600);
    check('an unbesieged world feeds no garrison',
        calmResult.satisfaction === 1 && (calmEco.stockpile.food ?? 0) === 1000);

    // A well-stocked siege: supply holds.
    const stocked = makePlanet('stocked');
    stocked.siege = {
        siegeId: 's',
        defenderState: { garrisonTroops: 2000, supply: 500, maxSupply: 1000 },
    } as any;
    const stockedEco = makeEconomyPlanet('stocked', { food: 100_000, ammo: 100_000 });
    const stockedResult = drawGarrisonSupply(stockedEco, stocked, 3600);
    check('a stocked garrison is fully supplied', stockedResult.satisfaction === 1);
    check('the garrison eats the planet\'s food',
        (stockedEco.stockpile.food ?? 0) < 100_000);
    check('the garrison eats the planet\'s ammunition',
        (stockedEco.stockpile.ammo ?? 0) < 100_000);
    check('a supplied garrison\'s supply pool rises',
        (stocked.siege!.defenderState.supply ?? 0) > 500,
        `got ${stocked.siege!.defenderState.supply}`);
    check('draw scales with garrison size', (() => {
        const small = makePlanet('small');
        small.siege = { siegeId: 's', defenderState: { garrisonTroops: 1000, supply: 500, maxSupply: 1000 } } as any;
        const smallEco = makeEconomyPlanet('small', { food: 100_000, ammo: 100_000 });
        drawGarrisonSupply(smallEco, small, 3600);
        const bigDraw = 100_000 - (stockedEco.stockpile.food ?? 0);
        const smallDraw = 100_000 - (smallEco.stockpile.food ?? 0);
        return near(bigDraw, smallDraw * 2);
    })());

    // A starved siege: supply collapses.
    const starved = makePlanet('starved');
    starved.siege = {
        siegeId: 's',
        defenderState: { garrisonTroops: 5000, supply: 500, maxSupply: 1000 },
    } as any;
    const emptyEco = makeEconomyPlanet('starved', { food: 0, ammo: 0 });
    const starvedResult = drawGarrisonSupply(emptyEco, starved, 3600);
    check('an unsupplied garrison reports zero satisfaction', starvedResult.satisfaction === 0);
    check('the shortfalls are named', starvedResult.shortfalls.length > 0,
        starvedResult.shortfalls.join(', '));
    check('an unsupplied garrison\'s supply pool falls',
        (starved.siege!.defenderState.supply ?? 0) < 500,
        `got ${starved.siege!.defenderState.supply}`);
    check('supply never goes negative', (() => {
        for (let i = 0; i < 200; i++) drawGarrisonSupply(emptyEco, starved, 3600 * 24);
        return (starved.siege!.defenderState.supply ?? 0) >= 0;
    })());
    check('stockpiles are never driven negative',
        (emptyEco.stockpile.food ?? 0) >= 0 && (emptyEco.stockpile.ammo ?? 0) >= 0);

    // A world with a reserve vault outlasts a lean one — the doc's siege reserve.
    const vaulted = makePlanet('vaulted', ['strategic_reserve_vault']);
    const leanWorld = makePlanet('lean');
    check('a reserve vault raises the food a besieged world can hold',
        (computeStorageCapacity(vaulted).capacity.food ?? 0) >
        (computeStorageCapacity(leanWorld).capacity.food ?? 0));

    // Global pass.
    const globalWorld = makeWorld([[stocked, stockedEco]], 0);
    const foodBefore = stockedEco.stockpile.food ?? 0;
    tickGarrisonSupply(globalWorld, 3600);
    check('the global pass draws supply for besieged worlds',
        (stockedEco.stockpile.food ?? 0) < foodBefore);
}

// ─── 8. Empire rollups ────────────────────────────────────────────────────────

console.log('\n8. Empire rollups');
{
    const freePlanet = makePlanet('free');
    const freeEco = makeEconomyPlanet('free', { food: 5000, metals: 2000 }, { food: 1, energy: 1 });
    const cutPlanet = makePlanet('cut');
    const cutEco = makeEconomyPlanet('cut', { food: 60, metals: 500 }, { food: 1, energy: 0.000001 });
    const rivalPlanet = makePlanet('rival', [null], 'faction-b');
    const rivalEco = makeEconomyPlanet('rival', { food: 9999 }, {}, 'faction-b');

    const world = makeWorld([
        [freePlanet, freeEco],
        [cutPlanet, cutEco],
        [rivalPlanet, rivalEco],
    ], FULL_BLOCKADE_POWER);
    // The hostile fleet sits in sys-1 with everything, so make the free world safe.
    freePlanet.systemId = 'sys-2';
    freeEco.systemId = 'sys-2';

    tickBlockades(world);

    const report = getBlockadeReport(world, 'faction-a');
    check('the report names blockaded planets', report.blockadedPlanetIds.includes('cut'));
    check('the report excludes safe planets', !report.blockadedPlanetIds.includes('free'));
    check('the report excludes other empires\' planets',
        !report.blockadedPlanetIds.includes('rival'));
    check('the report names starving planets', report.starvingPlanetIds.includes('cut'),
        `cover ${cutEco.blockade?.hoursOfCover}`);
    check('the report carries the worst severity', report.worstSeverity > 0);

    const holdings = getEmpireHoldings(world, 'faction-a');
    check('holdings sum across the empire',
        near(holdings.metals ?? 0, 2500), `got ${holdings.metals}`);
    check('holdings exclude other empires',
        near(holdings.food ?? 0, (freeEco.stockpile.food ?? 0) + (cutEco.stockpile.food ?? 0)));

    const emptyReport = getBlockadeReport(world, 'faction-nobody');
    check('an empire with no planets reports nothing',
        emptyReport.blockadedPlanetIds.length === 0 && emptyReport.worstSeverity === 0);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
