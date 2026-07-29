// scripts/test-distribution.ts
// Phase 2 verification — planetary distribution: haulage supply vs demand,
// efficiency curve, priority split, and the hooks into production and building.
// Run: npx tsx scripts/test-distribution.ts

import type { PlanetProduction } from '../lib/economy/economy-types';
import type { Planet as ConstructionPlanet, PlanetTile } from '../lib/construction/construction-types';
import {
    collectDepotCapacity,
    computeLogisticsDemand,
    coverageToEfficiency,
    applyPriorityWeights,
    updatePlanetLogistics,
    tickDistribution,
    chainThroughputMultiplier,
    constructionLogisticsMultiplier,
    poolingEfficiency,
} from '../lib/logistics/distribution-service';
import {
    EFFICIENCY_FLOOR,
    EFFICIENCY_BASELINE,
    EFFICIENCY_CEILING,
    DEMAND_PER_BUILDING,
    DEMAND_PER_BUILD_ORDER,
    LOGISTICS_PRIORITIES,
} from '../lib/logistics/distribution-types';
import { computeStorageCapacity } from '../lib/logistics/storage-service';
import { startConstruction } from '../lib/construction/construction-service';
import { BUILDINGS } from '../data/buildings';

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

function makeConstructionPlanet(
    id: string,
    buildingIds: (string | null)[],
    infrastructureLevel = 1
): ConstructionPlanet {
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
            population,
            growthRate: 0,
            housingCapacity: 50000,
            serviceSatisfaction: 50,
            unrestRisk: 0,
            manpowerEfficiency: 1,
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

/** Run the full logistics update for a paired planet and return the state. */
function logisticsFor(con: ConstructionPlanet, eco: PlanetProduction) {
    return updatePlanetLogistics(eco, con, computeStorageCapacity(con));
}

// ─── 1. Depot catalog ─────────────────────────────────────────────────────────

console.log('\n1. Depot catalog');
{
    const depots = BUILDINGS.filter(b => b.effects.some(e => e.type === 'logistics_capacity'));
    check('depot buildings exist', depots.length >= 2, `found ${depots.length}`);
    check('depots are category "logistics"', depots.every(b => b.category === 'logistics'));
    check('the distribution hub outranks the depot',
        (depots.find(b => b.id === 'distribution_hub')?.effects
            .find(e => e.type === 'logistics_capacity')?.value ?? 0) >
        (depots.find(b => b.id === 'logistics_depot')?.effects
            .find(e => e.type === 'logistics_capacity')?.value ?? 0));

    const con = makeConstructionPlanet('p', ['logistics_depot', 'distribution_hub']);
    const collected = collectDepotCapacity(con);
    check('depot capacity sums across tiles', near(collected.capacity, 45 + 130),
        `got ${collected.capacity}`);
    check('depot count is reported', collected.depotCount === 2);

    const ruined = makeConstructionPlanet('p-ruined', ['logistics_depot']);
    ruined.tiles[0].constructionState = 'ruined';
    check('a ruined depot moves nothing', collectDepotCapacity(ruined).capacity === 0);
}

// ─── 2. Demand ────────────────────────────────────────────────────────────────

console.log('\n2. Haulage demand');
{
    const eco = makeEconomyPlanet('p', 0);
    const empty = makeConstructionPlanet('p', []);
    check('an empty planet demands nothing', computeLogisticsDemand(eco, empty) === 0);

    const built = makeConstructionPlanet('p', ['metal_mine', 'chemical_plant', null]);
    check('each active building adds demand',
        near(computeLogisticsDemand(eco, built), 2 * DEMAND_PER_BUILDING),
        `got ${computeLogisticsDemand(eco, built)}`);

    built.buildQueue.push({
        orderId: 'o1', buildingId: 'metal_mine', tileId: 'p-t2',
        planetId: 'p', startedAtSeconds: 0, completesAtSeconds: 100,
    });
    check('a queued build adds demand',
        near(computeLogisticsDemand(eco, built), 2 * DEMAND_PER_BUILDING + DEMAND_PER_BUILD_ORDER));

    const populous = makeEconomyPlanet('p', 10_000);
    check('population adds demand',
        computeLogisticsDemand(populous, built) > computeLogisticsDemand(eco, built));

    check('a planet with no construction record demands only for its people',
        computeLogisticsDemand(populous, undefined) > 0);
}

// ─── 3. Efficiency curve ──────────────────────────────────────────────────────

console.log('\n3. Coverage to efficiency');
{
    check('zero coverage sits on the floor, not at zero',
        near(coverageToEfficiency(0), EFFICIENCY_FLOOR));
    check('negative coverage is clamped to the floor',
        near(coverageToEfficiency(-5), EFFICIENCY_FLOOR));
    check('half coverage is halfway to baseline',
        near(coverageToEfficiency(0.5), EFFICIENCY_FLOOR + (EFFICIENCY_BASELINE - EFFICIENCY_FLOOR) * 0.5));
    check('exact coverage gives baseline', near(coverageToEfficiency(1), EFFICIENCY_BASELINE));
    check('double coverage reaches the ceiling', near(coverageToEfficiency(2), EFFICIENCY_CEILING));
    check('excess coverage does not exceed the ceiling',
        near(coverageToEfficiency(50), EFFICIENCY_CEILING));
    check('the curve is monotonic',
        [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3].every((c, i, arr) =>
            i === 0 || coverageToEfficiency(c) >= coverageToEfficiency(arr[i - 1])));
}

// ─── 4. Depots actually help ──────────────────────────────────────────────────

console.log('\n4. Depots relieve congestion');
{
    // A crowded industrial world with nothing to move goods around it.
    const heavy = ['metal_mine', 'chemical_plant', 'planetary_factory', 'hydroponic_farm',
        'research_lab', 'barracks', 'habitat_block', 'security_bureau'];
    const bare = makeConstructionPlanet('p-bare', heavy, 1);
    const bareEco = makeEconomyPlanet('p-bare', 8000);
    const bareState = logisticsFor(bare, bareEco);

    check('an over-built world with no logistics is congested', bareState.congested,
        `coverage ${bareState.coverageRatio.toFixed(2)}`);
    check('congestion drags efficiency below baseline', bareState.efficiency < EFFICIENCY_BASELINE);

    const served = makeConstructionPlanet('p-served', [...heavy, 'logistics_depot', 'distribution_hub'], 3);
    const servedEco = makeEconomyPlanet('p-served', 8000);
    const servedState = logisticsFor(served, servedEco);

    check('depots raise haulage capacity', servedState.capacity > bareState.capacity);
    check('depots clear the congestion flag', !servedState.congested,
        `coverage ${servedState.coverageRatio.toFixed(2)}`);
    check('depots raise efficiency above baseline', servedState.efficiency > EFFICIENCY_BASELINE);
    check('depot count is reported', servedState.depotCount === 2);

    // Warehouses contribute handling, so Phase 1 storage feeds Phase 2 haulage.
    const warehoused = makeConstructionPlanet('p-wh', [...heavy, 'warehouse_complex'], 1);
    const whState = logisticsFor(warehoused, makeEconomyPlanet('p-wh', 8000));
    check('warehouse handling counts toward haulage', whState.capacity > bareState.capacity);
}

// ─── 5. Priority split ────────────────────────────────────────────────────────

console.log('\n5. Priority split');
{
    const balanced = applyPriorityWeights(1.0, 'balanced');
    check('balanced treats every channel alike',
        balanced.manufacturing === balanced.construction &&
        balanced.military === balanced.civilian &&
        balanced.manufacturing === balanced.military);

    const military = applyPriorityWeights(1.0, 'military');
    check('military priority favours war materiel', military.military > balanced.military);
    check('military priority costs consumer goods', military.civilian < balanced.civilian);

    const construction = applyPriorityWeights(1.0, 'construction');
    check('construction priority favours the build queue',
        construction.construction > balanced.construction);
    check('construction priority costs manufacturing',
        construction.manufacturing < balanced.manufacturing);

    const civilian = applyPriorityWeights(1.0, 'civilian');
    check('civilian priority favours consumer goods', civilian.civilian > balanced.civilian);
    check('civilian priority costs war materiel', civilian.military < balanced.military);

    check('every declared priority has weights',
        LOGISTICS_PRIORITIES.every(p => applyPriorityWeights(1, p).manufacturing > 0));
}

// ─── 6. Production chain multipliers ──────────────────────────────────────────

console.log('\n6. Chain throughput');
{
    const con = makeConstructionPlanet('p', ['metal_mine', 'planetary_factory'], 2);
    const eco = makeEconomyPlanet('p', 2000);

    check('a planet with no logistics state is unmodified',
        chainThroughputMultiplier(makeEconomyPlanet('none'), 'ammo') === 1);

    eco.logisticsPriority = 'balanced';
    const balancedState = logisticsFor(con, eco);
    check('balanced: war and consumer chains get the same throughput',
        near(chainThroughputMultiplier(eco, 'ammo'), chainThroughputMultiplier(eco, 'luxury')));
    check('balanced throughput equals the planet efficiency',
        near(chainThroughputMultiplier(eco, 'ammo'), balancedState.efficiency));

    eco.logisticsPriority = 'military';
    logisticsFor(con, eco);
    const milAmmo = chainThroughputMultiplier(eco, 'ammo');
    const milLuxury = chainThroughputMultiplier(eco, 'luxury');
    check('military priority speeds the ammo chain', milAmmo > balancedState.efficiency);
    check('military priority slows the luxury chain', milLuxury < balancedState.efficiency);
    check('"military" output counts as a war chain',
        near(chainThroughputMultiplier(eco, 'military'), milAmmo));
    check('research counts as a civilian chain',
        near(chainThroughputMultiplier(eco, 'research'), milLuxury));

    eco.logisticsPriority = 'civilian';
    logisticsFor(con, eco);
    check('civilian priority reverses the split',
        chainThroughputMultiplier(eco, 'luxury') > chainThroughputMultiplier(eco, 'ammo'));
}

// ─── 7. Build queue reads logistics ───────────────────────────────────────────

console.log('\n7. Construction speed');
{
    check('a planet with no logistics mirror builds at normal speed',
        constructionLogisticsMultiplier(makeConstructionPlanet('p', [])) === 1);
    check('an absent planet is treated as normal speed',
        constructionLogisticsMultiplier(undefined) === 1);

    // Congested world: many buildings, no depots, minimum infrastructure.
    const heavy = ['metal_mine', 'chemical_plant', 'planetary_factory', 'hydroponic_farm',
        'research_lab', 'barracks', 'habitat_block', 'security_bureau', null];
    const congested = makeConstructionPlanet('p-slow', heavy, 1);
    logisticsFor(congested, makeEconomyPlanet('p-slow', 9000));

    const served = makeConstructionPlanet('p-fast', [...heavy, 'logistics_depot', 'distribution_hub'], 3);
    logisticsFor(served, makeEconomyPlanet('p-fast', 9000));

    check('the logistics mirror lands on the construction planet',
        congested.logistics !== undefined && served.logistics !== undefined);
    check('congestion lowers the construction multiplier',
        congested.logistics!.constructionMultiplier < served.logistics!.constructionMultiplier);

    const emptyTileSlow = congested.tiles.find(t => t.constructionState === 'empty')!;
    const emptyTileFast = served.tiles.find(t => t.constructionState === 'empty')!;
    startConstruction(congested, emptyTileSlow.tileId, 'metal_mine', 0);
    startConstruction(served, emptyTileFast.tileId, 'metal_mine', 0);

    const slowTime = congested.buildQueue[0].completesAtSeconds;
    const fastTime = served.buildQueue[0].completesAtSeconds;
    check('a congested world takes longer to build', slowTime > fastTime,
        `slow ${slowTime.toFixed(0)}s vs fast ${fastTime.toFixed(0)}s`);
    check('build time stays finite and positive',
        Number.isFinite(slowTime) && slowTime > 0 && Number.isFinite(fastTime) && fastTime > 0);
}

// ─── 8. Pooling efficiency ────────────────────────────────────────────────────

console.log('\n8. In-system pooling');
{
    check('no planets pool perfectly by convention', poolingEfficiency([]) === 1);

    const good = makeEconomyPlanet('g');
    logisticsFor(makeConstructionPlanet('g', ['logistics_depot'], 3), good);
    const bad = makeEconomyPlanet('b', 20_000);
    logisticsFor(makeConstructionPlanet('b',
        ['metal_mine', 'chemical_plant', 'planetary_factory', 'barracks'], 1), bad);

    check('pooling is capped at 1', poolingEfficiency([good]) <= 1);
    check('a congested member drags pooling down',
        poolingEfficiency([good, bad]) < 1);

    // The blend used by tickInternalDistribution must conserve the group total.
    const pooling = poolingEfficiency([good, bad]);
    const stocks = [800, 200];
    const shares = [0.25, 0.75];
    const total = stocks[0] + stocks[1];
    const after = stocks.map((own, i) => own * (1 - pooling) + total * shares[i] * pooling);
    check('the pooling blend conserves the group total',
        near(after[0] + after[1], total));
    check('the pooling blend moves stock toward the needier planet',
        after[1] > stocks[1]);
}

// ─── 9. World tick ────────────────────────────────────────────────────────────

console.log('\n9. World tick');
{
    const conA = makeConstructionPlanet('pa', ['metal_mine', 'logistics_depot'], 2);
    const conB = makeConstructionPlanet('pb', ['metal_mine']);
    const ecoA = makeEconomyPlanet('pa', 3000);
    const ecoB = makeEconomyPlanet('pb', 3000);
    ecoA.logisticsPriority = 'military';

    const world = {
        economy: { planets: new Map([['pa', ecoA], ['pb', ecoB]]) },
        construction: { planets: new Map([['pa', conA], ['pb', conB]]) },
    } as any;

    tickDistribution(world);

    check('tickDistribution attaches state to every planet',
        ecoA.logistics !== undefined && ecoB.logistics !== undefined);
    check('the stored priority is honoured', ecoA.logistics!.priority === 'military');
    check('an unset priority defaults to balanced', ecoB.logistics!.priority === 'balanced');
    check('the depot world has more haulage',
        ecoA.logistics!.capacity > ecoB.logistics!.capacity);

    // An economy planet with no construction record must not crash or zero out.
    const orphanWorld = {
        economy: { planets: new Map([['px', makeEconomyPlanet('px', 500)]]) },
        construction: { planets: new Map() },
    } as any;
    tickDistribution(orphanWorld);
    const orphan = orphanWorld.economy.planets.get('px') as PlanetProduction;
    check('a planet with no construction record still gets logistics',
        (orphan.logistics?.efficiency ?? 0) >= EFFICIENCY_FLOOR);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
