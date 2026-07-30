// scripts/test-infrastructure.ts
// Phase 4 verification — infrastructure as five engineering tracks: backfill,
// derived level, effects, upgrades, upkeep, decay, and the hooks into
// construction, production, haulage and storage.
// Run: npx tsx scripts/test-infrastructure.ts

import type { Planet as ConstructionPlanet, PlanetTile } from '../lib/construction/construction-types';
import type { PlanetProduction } from '../lib/economy/economy-types';
import {
    ensureInfrastructureNetwork,
    recomputeInfrastructureLevel,
    effectiveTrackLevel,
    computeInfrastructureEffects,
    upgradeCost,
    upgradeDuration,
    canUpgradeTrack,
    startTrackUpgrade,
    cancelTrackUpgrade,
    processTrackUpgrades,
    networkUpkeepPerHour,
    tickInfrastructureUpkeep,
    damageInfrastructure,
    networkIntegrity,
    tickInfrastructure,
} from '../lib/infrastructure/infrastructure-service';
import {
    INFRASTRUCTURE_TRACK_IDS,
    MAX_TRACK_LEVEL,
    MIN_DERIVED_INFRA_LEVEL,
    INTEGRITY_RECOVERY_PER_HOUR,
    INTEGRITY_DECAY_PER_HOUR,
    UNPAID_GRACE_TICKS,
    TRACK_EFFECTS,
    MULTIPLICATIVE_EFFECTS,
} from '../lib/infrastructure/infrastructure-types';
import type { InfrastructureTrackId } from '../lib/infrastructure/infrastructure-types';
import { INFRASTRUCTURE_TRACKS, INFRASTRUCTURE_TRACK_BY_ID } from '../data/infrastructure-tracks';
import { startConstruction } from '../lib/construction/construction-service';
import { computeStorageCapacity } from '../lib/logistics/storage-service';
import { updatePlanetLogistics } from '../lib/logistics/distribution-service';
import { recalculatePlanetStats } from '../lib/construction/recalculation';

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

function makePlanet(id: string, infrastructureLevel = 1, buildingIds: (string | null)[] = [null]): ConstructionPlanet {
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

function makeEconomyPlanet(id: string, stockpile: Record<string, number> = {}): PlanetProduction {
    return {
        planetId: id,
        systemId: 'sys-1',
        factionId: 'faction-a',
        planetType: 'industrial',
        tags: [],
        services: {},
        demographics: {
            population: 1000, growthRate: 0, housingCapacity: 50000,
            serviceSatisfaction: 50, unrestRisk: 0, manpowerEfficiency: 1,
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

/** Set a track straight to a level, bypassing the build queue. */
function setTrack(planet: ConstructionPlanet, trackId: InfrastructureTrackId, level: number) {
    const network = ensureInfrastructureNetwork(planet);
    network.tracks[trackId].level = level;
    recomputeInfrastructureLevel(planet);
}

// ─── 1. Track catalog ─────────────────────────────────────────────────────────

console.log('\n1. Track catalog');
{
    check('all five tracks are defined', INFRASTRUCTURE_TRACKS.length === 5);
    check('the catalog covers every declared track id',
        INFRASTRUCTURE_TRACK_IDS.every(id => Boolean(INFRASTRUCTURE_TRACK_BY_ID[id])));
    check('the doc\'s systems are all represented',
        ['transit', 'power_grid', 'comms', 'water', 'freight']
            .every(id => Boolean(INFRASTRUCTURE_TRACK_BY_ID[id])));
    check('every track costs something', INFRASTRUCTURE_TRACKS.every(t =>
        (t.costPerLevel.credits ?? 0) + (t.costPerLevel.metals ?? 0) > 0));
    check('every track takes time', INFRASTRUCTURE_TRACKS.every(t => t.buildTimeSeconds > 0));
    check('every track costs upkeep', INFRASTRUCTURE_TRACKS.every(t =>
        Object.values(t.upkeepPerLevel).some(v => (v ?? 0) > 0)));
    check('every track grants at least one effect',
        INFRASTRUCTURE_TRACK_IDS.every(id => Object.keys(TRACK_EFFECTS[id]).length > 0));
    check('cost grows with level', INFRASTRUCTURE_TRACKS.every(t => t.costGrowth > 1));
}

// ─── 2. Backfill and derived level ────────────────────────────────────────────

console.log('\n2. Backfill and derived level');
{
    // A pre-Phase-4 world must wake up exactly as developed as it went to sleep.
    const legacy = makePlanet('legacy', 3);
    const network = ensureInfrastructureNetwork(legacy);
    check('every track is seeded from the legacy scalar',
        INFRASTRUCTURE_TRACK_IDS.every(id => network.tracks[id].level === 3));
    check('seeded tracks start at full integrity',
        INFRASTRUCTURE_TRACK_IDS.every(id => network.tracks[id].integrity === 100));
    check('backfill preserves the derived level',
        recomputeInfrastructureLevel(legacy) === 3);

    // A snapshot missing one track gains it without wiping the rest.
    delete (network.tracks as any).freight;
    const repaired = ensureInfrastructureNetwork(legacy);
    check('a missing track is repaired in place', repaired.tracks.freight !== undefined);
    check('repairing a track does not reset the others', repaired.tracks.transit.level === 3);
    check('a repaired track starts at zero, not at the seed', repaired.tracks.freight.level === 0);

    // Derived level is the mean, floored at the minimum.
    const bare = makePlanet('bare', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(bare).tracks[id].level = 0;
    check('an undeveloped world still reports the minimum level',
        recomputeInfrastructureLevel(bare) === MIN_DERIVED_INFRA_LEVEL);

    const lopsided = makePlanet('lopsided', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(lopsided).tracks[id].level = 0;
    setTrack(lopsided, 'transit', 5);
    setTrack(lopsided, 'freight', 5);
    check('the derived level is the mean, not the minimum',
        recomputeInfrastructureLevel(lopsided) === 2,
        `got ${lopsided.infrastructureLevel}`);

    const maxed = makePlanet('maxed', 5);
    check('a fully built world derives the maximum level',
        recomputeInfrastructureLevel(maxed) === MAX_TRACK_LEVEL);
}

// ─── 3. Effects ───────────────────────────────────────────────────────────────

console.log('\n3. Effects');
{
    const bare = makePlanet('bare', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(bare).tracks[id].level = 0;
    const none = computeInfrastructureEffects(bare);
    check('an undeveloped network is neutral',
        none.constructionSpeed === 1 && none.productionEfficiency === 1 &&
        none.haulageBonus === 0 && none.stability === 0);
    check('an absent planet is neutral', computeInfrastructureEffects(undefined).constructionSpeed === 1);

    const transit = makePlanet('transit', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(transit).tracks[id].level = 0;
    setTrack(transit, 'transit', 5);
    const tEffects = computeInfrastructureEffects(transit);
    check('transit raises construction speed',
        near(tEffects.constructionSpeed, 1 + TRACK_EFFECTS.transit.constructionSpeed! * 5),
        `got ${tEffects.constructionSpeed}`);
    check('transit raises haulage',
        near(tEffects.haulageBonus, TRACK_EFFECTS.transit.haulageBonus! * 5));
    check('transit does not raise food output', tEffects.foodOutput === 1);

    const water = makePlanet('water', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(water).tracks[id].level = 0;
    setTrack(water, 'water', 5);
    const wEffects = computeInfrastructureEffects(water);
    check('water raises food output', wEffects.foodOutput > 1);
    check('water raises population growth', wEffects.populationGrowth > 1);
    check('water does not raise construction speed', wEffects.constructionSpeed === 1);

    const comms = makePlanet('comms', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(comms).tracks[id].level = 0;
    setTrack(comms, 'comms', 5);
    check('comms raises unrest recovery', computeInfrastructureEffects(comms).unrestRecovery > 1);
    check('comms raises stability', computeInfrastructureEffects(comms).stability > 0);

    const freight = makePlanet('freight', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(freight).tracks[id].level = 0;
    setTrack(freight, 'freight', 5);
    check('freight raises storage throughput',
        computeInfrastructureEffects(freight).storageThroughputBonus > 0);

    const grid = makePlanet('grid', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(grid).tracks[id].level = 0;
    setTrack(grid, 'power_grid', 5);
    check('power grid raises production efficiency',
        computeInfrastructureEffects(grid).productionEfficiency > 1);

    // Integrity scales contribution linearly.
    const damaged = makePlanet('damaged', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(damaged).tracks[id].level = 0;
    setTrack(damaged, 'transit', 4);
    const full = computeInfrastructureEffects(damaged).haulageBonus;
    ensureInfrastructureNetwork(damaged).tracks.transit.integrity = 50;
    const half = computeInfrastructureEffects(damaged).haulageBonus;
    check('effective level scales with integrity',
        near(effectiveTrackLevel(ensureInfrastructureNetwork(damaged).tracks.transit), 2));
    check('a half-wrecked track gives half its effect', near(half, full / 2),
        `${full} -> ${half}`);
    ensureInfrastructureNetwork(damaged).tracks.transit.integrity = 0;
    check('a destroyed track gives nothing',
        computeInfrastructureEffects(damaged).haulageBonus === 0);

    // Multiplicative effects must never zero out a system.
    check('multiplicative effects have a positive floor',
        MULTIPLICATIVE_EFFECTS.every(k => computeInfrastructureEffects(bare)[k] >= 0.1));
}

// ─── 4. Upgrades ──────────────────────────────────────────────────────────────

console.log('\n4. Upgrades');
{
    check('cost grows with the level already held',
        (upgradeCost('transit', 3)!.metals ?? 0) > (upgradeCost('transit', 0)!.metals ?? 0));
    check('duration grows with the level already held',
        upgradeDuration('transit', 3) > upgradeDuration('transit', 0));
    check('an unknown track has no cost', upgradeCost('nonsense' as any, 0) === undefined);

    const planet = makePlanet('p', 1);
    const check1 = canUpgradeTrack(planet, 'transit');
    check('an upgrade is allowed below maximum', check1.allowed);
    check('the check reports a cost and a duration',
        Boolean(check1.cost) && (check1.durationSeconds ?? 0) > 0);

    const started = startTrackUpgrade(planet, 'transit', 1000);
    check('the upgrade starts', started.success);
    const track = ensureInfrastructureNetwork(planet).tracks.transit;
    check('the target level is recorded', track.upgrade?.targetLevel === 2);
    check('a second upgrade on the same track is rejected',
        !canUpgradeTrack(planet, 'transit').allowed,
        canUpgradeTrack(planet, 'transit').reason);
    check('a different track can still be upgraded', canUpgradeTrack(planet, 'water').allowed);

    processTrackUpgrades(planet, 1000 + (started.completesAtSeconds! - 1001));
    check('the upgrade does not complete early', track.level === 1);

    processTrackUpgrades(planet, started.completesAtSeconds!);
    check('the upgrade completes on time', track.level === 2);
    check('the upgrade slot is cleared', track.upgrade === null);

    // Cancel, no refund.
    startTrackUpgrade(planet, 'water', 5000);
    check('an upgrade can be cancelled', cancelTrackUpgrade(planet, 'water'));
    check('cancelling leaves the level untouched',
        ensureInfrastructureNetwork(planet).tracks.water.level === 1);
    check('cancelling nothing is a no-op', !cancelTrackUpgrade(planet, 'water'));

    // Cannot exceed the ceiling.
    setTrack(planet, 'transit', MAX_TRACK_LEVEL);
    check('a maxed track cannot be upgraded',
        !canUpgradeTrack(planet, 'transit').allowed,
        canUpgradeTrack(planet, 'transit').reason);

    // Completing an upgrade republishes the derived scalar.
    const derived = makePlanet('derived', 0);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(derived).tracks[id].level = 0;
    recomputeInfrastructureLevel(derived);
    for (const id of INFRASTRUCTURE_TRACK_IDS) {
        ensureInfrastructureNetwork(derived).tracks[id].level = 2;
    }
    const before = derived.infrastructureLevel;
    const up = startTrackUpgrade(derived, 'comms', 0);
    processTrackUpgrades(derived, up.completesAtSeconds!);
    check('completing an upgrade recomputes the derived level',
        derived.infrastructureLevel >= before);
}

// ─── 5. Upkeep and decay ──────────────────────────────────────────────────────

console.log('\n5. Upkeep and decay');
{
    const planet = makePlanet('p', 3);
    const upkeep = networkUpkeepPerHour(planet);
    check('upkeep scales with levels held', upkeep.credits > 0 && upkeep.energy > 0);
    check('a bare network costs nothing', (() => {
        const bare = makePlanet('bare', 0);
        for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(bare).tracks[id].level = 0;
        const u = networkUpkeepPerHour(bare);
        return u.credits === 0 && u.energy === 0 && u.metals === 0;
    })());

    // Paid in full: integrity recovers.
    const paidPlanet = makePlanet('paid', 3);
    ensureInfrastructureNetwork(paidPlanet).tracks.transit.integrity = 50;
    const richReserves: Record<string, number> = { CREDITS: 1_000_000 };
    const stockedEco = makeEconomyPlanet('paid', { energy: 1_000_000, metals: 1_000_000 });
    const paidResult = tickInfrastructureUpkeep(paidPlanet, stockedEco, richReserves, 3600);
    check('a solvent world pays its upkeep', paidResult.paid);
    check('upkeep is deducted from the treasury', richReserves.CREDITS < 1_000_000);
    check('upkeep is deducted from the planet stockpile',
        (stockedEco.stockpile.energy ?? 0) < 1_000_000);
    check('paid upkeep restores integrity',
        near(ensureInfrastructureNetwork(paidPlanet).tracks.transit.integrity,
            50 + INTEGRITY_RECOVERY_PER_HOUR),
        `got ${ensureInfrastructureNetwork(paidPlanet).tracks.transit.integrity}`);
    check('integrity does not exceed 100', (() => {
        tickInfrastructureUpkeep(paidPlanet, stockedEco, richReserves, 3600 * 500);
        return ensureInfrastructureNetwork(paidPlanet).tracks.transit.integrity === 100;
    })());

    // Broke: grace period, then decay.
    const brokePlanet = makePlanet('broke', 4);
    const brokeReserves: Record<string, number> = { CREDITS: 0 };
    const emptyEco = makeEconomyPlanet('broke', {});
    const startIntegrity = ensureInfrastructureNetwork(brokePlanet).tracks.transit.integrity;

    for (let i = 0; i < UNPAID_GRACE_TICKS; i++) {
        tickInfrastructureUpkeep(brokePlanet, emptyEco, brokeReserves, 3600);
    }
    check('a short shortfall is absorbed by the grace period',
        ensureInfrastructureNetwork(brokePlanet).tracks.transit.integrity === startIntegrity,
        `got ${ensureInfrastructureNetwork(brokePlanet).tracks.transit.integrity}`);
    check('unpaid ticks are counted',
        ensureInfrastructureNetwork(brokePlanet).unpaidTicks === UNPAID_GRACE_TICKS);

    tickInfrastructureUpkeep(brokePlanet, emptyEco, brokeReserves, 3600);
    check('a sustained shortfall starts eating the network',
        near(ensureInfrastructureNetwork(brokePlanet).tracks.transit.integrity,
            startIntegrity - INTEGRITY_DECAY_PER_HOUR),
        `got ${ensureInfrastructureNetwork(brokePlanet).tracks.transit.integrity}`);

    // Paying again resets the counter.
    tickInfrastructureUpkeep(brokePlanet, stockedEco, richReserves, 3600);
    check('paying again clears the unpaid counter',
        ensureInfrastructureNetwork(brokePlanet).unpaidTicks === 0);

    check('integrity never falls below zero', (() => {
        const doomed = makePlanet('doomed', 5);
        const noMoney: Record<string, number> = { CREDITS: 0 };
        for (let i = 0; i < 200; i++) {
            tickInfrastructureUpkeep(doomed, makeEconomyPlanet('doomed', {}), noMoney, 3600 * 24);
        }
        return INFRASTRUCTURE_TRACK_IDS.every(id =>
            ensureInfrastructureNetwork(doomed).tracks[id].integrity >= 0);
    })());
}

// ─── 6. Bomb damage ───────────────────────────────────────────────────────────

console.log('\n6. Bomb damage');
{
    const planet = makePlanet('p', 4);
    check('an intact network reports full integrity', networkIntegrity(planet) === 100);
    check('an absent planet reports full integrity', networkIntegrity(undefined) === 100);

    damageInfrastructure(planet, 30);
    check('damage lowers integrity across every track',
        INFRASTRUCTURE_TRACK_IDS.every(id =>
            ensureInfrastructureNetwork(planet).tracks[id].integrity === 70));
    check('average integrity tracks the damage', near(networkIntegrity(planet), 70));
    check('damage lowers the effects the network provides',
        computeInfrastructureEffects(planet).haulageBonus <
        computeInfrastructureEffects(makePlanet('fresh', 4)).haulageBonus);

    damageInfrastructure(planet, 0);
    check('zero damage is a no-op', networkIntegrity(planet) === 70);
    damageInfrastructure(planet, 500);
    check('overwhelming damage floors integrity at zero', networkIntegrity(planet) === 0);
    check('a flattened network still derives a legal level',
        recomputeInfrastructureLevel(planet) >= MIN_DERIVED_INFRA_LEVEL);
}

// ─── 7. Cross-system hooks ────────────────────────────────────────────────────

console.log('\n7. Cross-system hooks');
{
    // Construction speed.
    const slow = makePlanet('slow', 0, [null]);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(slow).tracks[id].level = 0;
    recomputeInfrastructureLevel(slow);
    const fast = makePlanet('fast', 0, [null]);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(fast).tracks[id].level = 0;
    setTrack(fast, 'transit', 5);

    startConstruction(slow, 'slow-t0', 'metal_mine', 0);
    startConstruction(fast, 'fast-t0', 'metal_mine', 0);
    check('a transit network speeds up construction',
        fast.buildQueue[0].completesAtSeconds < slow.buildQueue[0].completesAtSeconds,
        `fast ${fast.buildQueue[0].completesAtSeconds.toFixed(0)}s vs slow ${slow.buildQueue[0].completesAtSeconds.toFixed(0)}s`);

    // Haulage.
    const noFreight = makePlanet('nf', 0, [null]);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(noFreight).tracks[id].level = 0;
    recomputeInfrastructureLevel(noFreight);
    const freighted = makePlanet('fr', 0, [null]);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(freighted).tracks[id].level = 0;
    setTrack(freighted, 'freight', 5);

    const plainLogi = updatePlanetLogistics(
        makeEconomyPlanet('nf'), noFreight, computeStorageCapacity(noFreight));
    const freightLogi = updatePlanetLogistics(
        makeEconomyPlanet('fr'), freighted, computeStorageCapacity(freighted));
    check('freight terminals raise planetary haulage',
        freightLogi.capacity > plainLogi.capacity,
        `${plainLogi.capacity} -> ${freightLogi.capacity}`);

    // Storage handling.
    check('freight terminals raise warehouse handling',
        computeStorageCapacity(freighted).throughput > computeStorageCapacity(noFreight).throughput);

    // Stability.
    const wired = makePlanet('wired', 0, [null]);
    for (const id of INFRASTRUCTURE_TRACK_IDS) ensureInfrastructureNetwork(wired).tracks[id].level = 0;
    setTrack(wired, 'comms', 5);
    check('a wired world is more stable',
        recalculatePlanetStats(wired).stability > recalculatePlanetStats(noFreight).stability,
        `${recalculatePlanetStats(noFreight).stability} -> ${recalculatePlanetStats(wired).stability}`);
}

// ─── 8. World tick ────────────────────────────────────────────────────────────

console.log('\n8. World tick');
{
    const upgrading = makePlanet('upgrading', 2);
    const started = startTrackUpgrade(upgrading, 'transit', 0);
    const damaged = makePlanet('damaged', 3);
    damageInfrastructure(damaged, 40);

    const world = {
        nowSeconds: started.completesAtSeconds! + 10,
        construction: { planets: new Map([['upgrading', upgrading], ['damaged', damaged]]) },
        economy: {
            planets: new Map([
                ['upgrading', makeEconomyPlanet('upgrading', { energy: 1e6, metals: 1e6 })],
                ['damaged', makeEconomyPlanet('damaged', { energy: 1e6, metals: 1e6 })],
            ]),
            factions: new Map([['faction-a', { reserves: { CREDITS: 1e6 } }]]),
        },
    } as any;

    tickInfrastructure(world, 3600);
    check('the global tick completes due upgrades',
        ensureInfrastructureNetwork(upgrading).tracks.transit.level === 3);
    check('the global tick repairs a paid-for network',
        networkIntegrity(damaged) > 60, `got ${networkIntegrity(damaged)}`);
    check('the global tick republishes the derived level',
        upgrading.infrastructureLevel === recomputeInfrastructureLevel(upgrading));

    // A world with no network and no development must not be allocated one.
    const untouched = makePlanet('untouched', 0);
    untouched.infrastructure = undefined;
    untouched.infrastructureLevel = 0;
    const world2 = {
        nowSeconds: 1,
        construction: { planets: new Map([['untouched', untouched]]) },
        economy: { planets: new Map(), factions: new Map() },
    } as any;
    tickInfrastructure(world2, 60);
    check('the tick skips worlds with nothing to track', untouched.infrastructure === undefined);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
