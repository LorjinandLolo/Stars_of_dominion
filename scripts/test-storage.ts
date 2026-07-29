// scripts/test-storage.ts
// Phase 1 verification — planetary storage capacity, overflow waste, and drain.
// Run: npx tsx scripts/test-storage.ts

import type { PlanetProduction } from '../lib/economy/economy-types';
import type { Planet as ConstructionPlanet, PlanetTile } from '../lib/construction/construction-types';
import {
    computeStorageCapacity,
    collectWarehouseContribution,
    applyStorageCaps,
    snapshotStorables,
    tickStorage,
    getEmpireStorageReport,
} from '../lib/logistics/storage-service';
import { BASE_COVER_HOURS, OVERFLOW_SPOILAGE_PER_HOUR } from '../lib/logistics/storage-types';
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
        maxTiles: 12,
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

function makeEconomyPlanet(id: string, stockpile: Record<string, number>): PlanetProduction {
    return {
        planetId: id,
        systemId: 'sys-1',
        factionId: 'faction-a',
        planetType: 'industrial',
        tags: [],
        services: {},
        demographics: {
            population: 1000,
            growthRate: 0,
            housingCapacity: 5000,
            serviceSatisfaction: 50,
            unrestRisk: 0,
            manpowerEfficiency: 1,
        },
        currentRates: {},
        stockpile: { ...stockpile },
        derived: { construction: 0, military: 0, research: 0, cultural: 0 },
        energyLoad: 0,
        energyProduced: 0,
        happiness: 60,
        instability: 0,
        commodityScarcity: false,
    };
}

// ─── 1. Catalog wiring ────────────────────────────────────────────────────────

console.log('\n1. Warehouse catalog');
{
    const storageBuildings = BUILDINGS.filter(b =>
        b.effects.some(e => e.type === 'storage_capacity')
    );
    check('storage buildings exist in the catalog', storageBuildings.length >= 4,
        `found ${storageBuildings.length}`);
    check('all storage buildings are category "logistics"',
        storageBuildings.every(b => b.category === 'logistics'),
        storageBuildings.filter(b => b.category !== 'logistics').map(b => b.id).join(', '));
    check('every storage_capacity effect names a valid target',
        storageBuildings.every(b => b.effects
            .filter(e => e.type === 'storage_capacity')
            .every(e => ['bulk', 'volatile', 'valuable', 'ordnance', 'all'].includes(e.target ?? ''))));
    check('every storage building declares throughput',
        storageBuildings.every(b => b.effects.some(e => e.type === 'storage_throughput')));
}

// ─── 2. Base capacity with no warehouses ──────────────────────────────────────

console.log('\n2. Native capacity (no warehouses)');
{
    const bare = makeConstructionPlanet('p-bare', [null, null]);
    const { capacity, throughput } = computeStorageCapacity(bare);
    // metals baseRate is 0.8/s in movement-config.json
    const expectedMetals = 0.8 * BASE_COVER_HOURS * 3600;
    check('metals capacity = base rate x cover hours', near(capacity.metals ?? 0, expectedMetals),
        `got ${capacity.metals}, expected ${expectedMetals}`);
    check('throughput is zero without warehouses', throughput === 0, `got ${throughput}`);
    check('credits are uncapped (not a storable)', capacity.credits === undefined);
    check('research is uncapped (not a storable)', capacity.research === undefined);
}

// ─── 3. Warehouses raise capacity ─────────────────────────────────────────────

console.log('\n3. Warehouse contribution');
{
    const bare = computeStorageCapacity(makeConstructionPlanet('p-bare', [null]));
    const withSilo = computeStorageCapacity(makeConstructionPlanet('p-silo', ['storage_silo']));
    const withTwo = computeStorageCapacity(makeConstructionPlanet('p-two', ['storage_silo', 'storage_silo']));

    check('a silo adds 30000 bulk capacity',
        near((withSilo.capacity.metals ?? 0) - (bare.capacity.metals ?? 0), 30000),
        `delta ${(withSilo.capacity.metals ?? 0) - (bare.capacity.metals ?? 0)}`);
    check('silos stack',
        near((withTwo.capacity.metals ?? 0) - (bare.capacity.metals ?? 0), 60000));
    check('a bulk silo does NOT add volatile capacity',
        near(withSilo.capacity.energy ?? 0, bare.capacity.energy ?? 0));
    check('silo throughput is reported', withSilo.throughput === 10, `got ${withSilo.throughput}`);

    const bunker = computeStorageCapacity(makeConstructionPlanet('p-bunker', ['munitions_bunker']));
    check('munitions bunker adds ordnance capacity',
        near((bunker.capacity.military ?? 0) - (bare.capacity.military ?? 0), 70000));
    check('munitions bunker adds volatile capacity to both members',
        near((bunker.capacity.energy ?? 0) - (bare.capacity.energy ?? 0), 45000) &&
        near((bunker.capacity.ammo ?? 0) - (bare.capacity.ammo ?? 0), 45000));

    // Under construction and ruined buildings must contribute nothing.
    const halfBuilt = makeConstructionPlanet('p-half', ['storage_silo']);
    halfBuilt.tiles[0].constructionState = 'under_construction';
    check('a silo under construction stores nothing',
        collectWarehouseContribution(halfBuilt).buildingCount === 0);
    const ruined = makeConstructionPlanet('p-ruined', ['storage_silo']);
    ruined.tiles[0].constructionState = 'ruined';
    check('a ruined silo stores nothing',
        collectWarehouseContribution(ruined).buildingCount === 0);
}

// ─── 4. Infrastructure multiplier ─────────────────────────────────────────────

console.log('\n4. Infrastructure multiplier');
{
    const lvl1 = computeStorageCapacity(makeConstructionPlanet('p1', ['storage_silo'], 1));
    const lvl5 = computeStorageCapacity(makeConstructionPlanet('p5', ['storage_silo'], 5));
    check('infrastructure 5 gives 1.6x capacity of infrastructure 1',
        near((lvl5.capacity.metals ?? 0) / (lvl1.capacity.metals ?? 1), 1.6),
        `ratio ${(lvl5.capacity.metals ?? 0) / (lvl1.capacity.metals ?? 1)}`);
}

// ─── 5. Overflow is wasted ────────────────────────────────────────────────────

console.log('\n5. Overflow waste');
{
    const con = makeConstructionPlanet('p-over', [null]);
    const { capacity, throughput } = computeStorageCapacity(con);
    const cap = capacity.metals ?? 0;

    // Planet starts comfortably under cap, then a tick dumps well past it.
    const eco = makeEconomyPlanet('p-over', { metals: cap * 0.5 });
    const before = snapshotStorables(eco);
    eco.stockpile.metals = cap * 1.4;

    const state = applyStorageCaps(eco, capacity, throughput, before, 60);
    check('stockpile is clamped to capacity', near(eco.stockpile.metals ?? 0, cap),
        `got ${eco.stockpile.metals}, cap ${cap}`);
    check('the excess is recorded as waste', near(state.wastedLastTick.metals ?? 0, cap * 0.4),
        `got ${state.wastedLastTick.metals}`);
    check('waste accumulates into the running total',
        near(state.wastedTotal.metals ?? 0, cap * 0.4));
    check('a full resource is flagged as pressured',
        state.pressuredResources.includes('metals'));
    check('peak utilization reaches 1', near(state.peakUtilization, 1));

    // Nothing under the cap should be touched.
    const calm = makeEconomyPlanet('p-calm', { metals: cap * 0.5 });
    const calmBefore = snapshotStorables(calm);
    calm.stockpile.metals = cap * 0.6;
    const calmState = applyStorageCaps(calm, capacity, throughput, calmBefore, 60);
    check('production under the cap is untouched', near(calm.stockpile.metals ?? 0, cap * 0.6));
    check('no waste when under the cap', (calmState.wastedLastTick.metals ?? 0) === 0);
    check('an under-filled resource is not flagged',
        !calmState.pressuredResources.includes('metals'));
}

// ─── 6. Pre-existing excess drains, it is not confiscated ─────────────────────

console.log('\n6. Legacy overflow drains gradually');
{
    const con = makeConstructionPlanet('p-legacy', [null]);
    const { capacity, throughput } = computeStorageCapacity(con);
    const cap = capacity.metals ?? 0;

    // A save written before storage existed: 5x the cap already on the ground.
    const eco = makeEconomyPlanet('p-legacy', { metals: cap * 5 });
    const before = snapshotStorables(eco);

    const oneHour = 3600;
    const state = applyStorageCaps(eco, capacity, throughput, before, oneHour);
    const expectedExcess = (cap * 5 - cap) * (1 - OVERFLOW_SPOILAGE_PER_HOUR);
    check('excess is NOT instantly confiscated', (eco.stockpile.metals ?? 0) > cap * 1.5,
        `got ${eco.stockpile.metals}, cap ${cap}`);
    check('excess drains at the spoilage rate',
        near(eco.stockpile.metals ?? 0, cap + expectedExcess),
        `got ${eco.stockpile.metals}, expected ${cap + expectedExcess}`);
    check('the drained amount is reported as waste',
        near(state.wastedLastTick.metals ?? 0, (cap * 5 - cap) * OVERFLOW_SPOILAGE_PER_HOUR));

    // Repeated hours converge toward the cap without ever dropping below it.
    let level = eco.stockpile.metals ?? 0;
    for (let i = 0; i < 200; i++) {
        const p = makeEconomyPlanet('p-conv', { metals: level });
        const snap = snapshotStorables(p);
        applyStorageCaps(p, capacity, throughput, snap, oneHour);
        level = p.stockpile.metals ?? 0;
    }
    check('drain converges to the cap', near(level, cap, 0.001), `settled at ${level}, cap ${cap}`);
    check('drain never falls below the cap', level >= cap - 1e-6);
}

// ─── 7. World tick + empire rollup ────────────────────────────────────────────

console.log('\n7. World tick and empire rollup');
{
    const conA = makeConstructionPlanet('pa', ['storage_silo', 'warehouse_complex'], 2);
    const conB = makeConstructionPlanet('pb', [null]);
    const ecoA = makeEconomyPlanet('pa', { metals: 10_000_000 });
    const ecoB = makeEconomyPlanet('pb', { metals: 1000 });

    const world = {
        economy: { planets: new Map([['pa', ecoA], ['pb', ecoB]]) },
        construction: { planets: new Map([['pa', conA], ['pb', conB]]) },
    } as any;

    const snapshots = new Map([
        ['pa', snapshotStorables(ecoA)],
        ['pb', snapshotStorables(ecoB)],
    ]);
    tickStorage(world, snapshots, 60);

    check('tickStorage attaches storage state to every planet',
        ecoA.storage !== undefined && ecoB.storage !== undefined);
    check('the warehoused planet has a larger cap than the bare one',
        (ecoA.storage!.capacity.metals ?? 0) > (ecoB.storage!.capacity.metals ?? 0));
    check('a wildly overstocked planet is drained, not emptied',
        (ecoA.stockpile.metals ?? 0) < 10_000_000 &&
        (ecoA.stockpile.metals ?? 0) > (ecoA.storage!.capacity.metals ?? 0));

    const report = getEmpireStorageReport(world, 'faction-a');
    check('empire report sums capacity across planets',
        near(report.totalCapacity.metals ?? 0,
            (ecoA.storage!.capacity.metals ?? 0) + (ecoB.storage!.capacity.metals ?? 0)));
    check('empire report sums stored goods',
        near(report.totalStored.metals ?? 0,
            (ecoA.stockpile.metals ?? 0) + (ecoB.stockpile.metals ?? 0)));
    check('empire report lists the overflowing planet as pressured',
        report.pressuredPlanetIds.includes('pa'));
    check('empire report excludes the calm planet',
        !report.pressuredPlanetIds.includes('pb'));

    // An economy planet with no construction record must still get a baseline.
    const orphanWorld = {
        economy: { planets: new Map([['px', makeEconomyPlanet('px', { metals: 500 })]]) },
        construction: { planets: new Map() },
    } as any;
    tickStorage(orphanWorld, new Map(), 60);
    const orphan = orphanWorld.economy.planets.get('px') as PlanetProduction;
    check('a planet with no construction record still gets base capacity',
        (orphan.storage?.capacity.metals ?? 0) > 0);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
