// lib/logistics/storage-service.ts
// Phase 1 — Planetary storage capacity and overflow.
//
// Capacity comes from three places: a native baseline every colony has, the
// warehouse buildings standing on its tiles, and its infrastructure level.
// Anything a planet produces beyond what it can hold is wasted, which is what
// makes warehouses worth their tile.

import type { GameWorldState } from '../game-world-state';
import type { PlanetProduction, ResourceBundle } from '../economy/economy-types';
import type { Planet as ConstructionPlanet } from '../construction/construction-types';
import { BUILDINGS } from '../../data/buildings';
import { computeOrbitalRatings } from '../orbital/orbital-service';
import { computeInfrastructureEffects } from '../infrastructure/infrastructure-service';
import config from '../movement/movement-config.json';
import {
    STORABLE_RESOURCES,
    STORAGE_CLASS_MEMBERS,
    BASE_COVER_HOURS,
    INFRA_CAPACITY_BONUS_PER_LEVEL,
    OVERFLOW_SPOILAGE_PER_HOUR,
    STORAGE_PRESSURE_THRESHOLD,
    STORAGE_CAPACITY_EFFECT,
    STORAGE_THROUGHPUT_EFFECT,
} from './storage-types';
import type {
    StorableResource,
    StorageClass,
    StorageTarget,
    PlanetStorageState,
} from './storage-types';

const baseRates = config.economy.production.baseRates as Record<string, number>;

/**
 * Native storage every colony has without building anything: BASE_COVER_HOURS
 * of that resource's galaxy-baseline production rate.
 */
function baseCapacityFor(res: StorableResource): number {
    return (baseRates[res] ?? 0.2) * BASE_COVER_HOURS * 3600;
}

/** Expand a `storage_capacity` effect target into the resources it covers. */
function resourcesForTarget(target: StorageTarget): StorableResource[] {
    if (target === 'all') return STORABLE_RESOURCES;
    return STORAGE_CLASS_MEMBERS[target as StorageClass] ?? [];
}

export interface WarehouseContribution {
    /** Extra capacity per resource, before the infrastructure multiplier. */
    capacity: Partial<Record<StorableResource, number>>;
    /** Summed loading/unloading rating. */
    throughput: number;
    /** How many active warehouse buildings contributed. */
    buildingCount: number;
}

/**
 * Sum the storage effects of every *active* building on a planet. Buildings under
 * construction or ruined contribute nothing — a bombed-out silo does not hold grain.
 */
export function collectWarehouseContribution(planet: ConstructionPlanet): WarehouseContribution {
    const capacity: Partial<Record<StorableResource, number>> = {};
    let throughput = 0;
    let buildingCount = 0;

    for (const tile of planet.tiles) {
        if (tile.constructionState !== 'active' || !tile.buildingId) continue;
        const def = BUILDINGS.find(b => b.id === tile.buildingId);
        if (!def) continue;

        let contributed = false;
        for (const effect of def.effects) {
            if (effect.type === STORAGE_CAPACITY_EFFECT) {
                const targets = resourcesForTarget((effect.target ?? 'bulk') as StorageTarget);
                for (const res of targets) {
                    capacity[res] = (capacity[res] ?? 0) + effect.value;
                }
                contributed = true;
            } else if (effect.type === STORAGE_THROUGHPUT_EFFECT) {
                throughput += effect.value;
                contributed = true;
            }
        }
        if (contributed) buildingCount++;
    }

    return { capacity, throughput, buildingCount };
}

/**
 * Full per-resource capacity for a planet. `constructionPlanet` may be absent —
 * economy planets exist on worlds that never got a construction record, and those
 * still get their native baseline rather than a capacity of zero.
 */
export function computeStorageCapacity(
    constructionPlanet: ConstructionPlanet | undefined
): { capacity: ResourceBundle; throughput: number } {
    const contribution = constructionPlanet
        ? collectWarehouseContribution(constructionPlanet)
        : { capacity: {}, throughput: 0, buildingCount: 0 };

    // Orbital warehouses hold stock a ground invasion cannot reach. Their
    // capacity is declared by storage class, so expand it the same way.
    const orbital = computeOrbitalRatings(constructionPlanet);
    for (const [target, value] of Object.entries(orbital.storageCapacity)) {
        for (const res of resourcesForTarget(target as StorageTarget)) {
            contribution.capacity[res] = (contribution.capacity[res] ?? 0) + (value ?? 0);
        }
    }

    const infraLevel = constructionPlanet?.infrastructureLevel ?? 1;
    const infraMult = 1 + INFRA_CAPACITY_BONUS_PER_LEVEL * Math.max(0, infraLevel - 1);

    const capacity: ResourceBundle = {};
    for (const res of STORABLE_RESOURCES) {
        capacity[res] = (baseCapacityFor(res) + (contribution.capacity[res] ?? 0)) * infraMult;
    }

    // Freight terminals are where the warehouse network plugs into everything else.
    const infraThroughput = computeInfrastructureEffects(constructionPlanet).storageThroughputBonus;

    return {
        capacity,
        throughput: contribution.throughput + orbital.storageThroughput + infraThroughput,
    };
}

/** Snapshot of the storable part of a stockpile, taken before the tick mutates it. */
export type StockpileSnapshot = Partial<Record<StorableResource, number>>;

export function snapshotStorables(planet: PlanetProduction): StockpileSnapshot {
    const snap: StockpileSnapshot = {};
    for (const res of STORABLE_RESOURCES) {
        snap[res] = planet.stockpile[res] ?? 0;
    }
    return snap;
}

/**
 * Clamp one planet's stockpile to its storage capacity.
 *
 * Two rules, and the difference between them matters:
 *  - Goods arriving this tick that do not fit are wasted outright.
 *  - Goods that were *already* over capacity at the start of the tick drain
 *    toward the cap at OVERFLOW_SPOILAGE_PER_HOUR instead of being confiscated,
 *    so a destroyed warehouse (or a pre-storage save) degrades over hours.
 */
export function applyStorageCaps(
    planet: PlanetProduction,
    capacity: ResourceBundle,
    throughput: number,
    before: StockpileSnapshot,
    deltaSeconds: number
): PlanetStorageState {
    const hours = deltaSeconds / 3600;
    const previous = planet.storage;
    const wastedLastTick: ResourceBundle = {};
    const wastedTotal: ResourceBundle = { ...(previous?.wastedTotal ?? {}) };
    const pressuredResources: StorableResource[] = [];
    let peakUtilization = 0;

    for (const res of STORABLE_RESOURCES) {
        const cap = capacity[res] ?? 0;
        const current = planet.stockpile[res] ?? 0;

        // Highest permitted level this tick: the cap, or — if the planet started
        // the tick already over it — the previous level minus this tick's spoilage.
        const startLevel = before[res] ?? 0;
        const drained = startLevel > cap
            ? Math.max(cap, startLevel - (startLevel - cap) * OVERFLOW_SPOILAGE_PER_HOUR * hours)
            : cap;
        const allowed = Math.max(cap, drained);

        if (current > allowed) {
            const lost = current - allowed;
            planet.stockpile[res] = allowed;
            wastedLastTick[res] = lost;
            wastedTotal[res] = (wastedTotal[res] ?? 0) + lost;
        }

        const level = planet.stockpile[res] ?? 0;
        const utilization = cap > 0 ? level / cap : 0;
        if (utilization > peakUtilization) peakUtilization = utilization;
        if (utilization >= STORAGE_PRESSURE_THRESHOLD) pressuredResources.push(res);
    }

    const state: PlanetStorageState = {
        capacity,
        wastedLastTick,
        wastedTotal,
        peakUtilization,
        pressuredResources,
        throughput,
    };
    planet.storage = state;
    return state;
}

/** Capacity and handling rating for one planet, computed once per tick. */
export interface StorageProfile {
    capacity: ResourceBundle;
    throughput: number;
}

/**
 * Compute every planet's storage profile once per tick. Both the distribution
 * pass (which needs warehouse handling speed up front) and the end-of-tick clamp
 * read from this, so tile scanning happens once rather than twice.
 */
export function buildStorageProfiles(world: GameWorldState): Map<string, StorageProfile> {
    const profiles = new Map<string, StorageProfile>();
    for (const planet of world.economy.planets.values()) {
        const constructionPlanet = world.construction?.planets?.get(planet.planetId);
        profiles.set(planet.planetId, computeStorageCapacity(constructionPlanet));
    }
    return profiles;
}

/**
 * Per-tick entry point: clamp every economy planet's stockpile to its capacity.
 * Called from tickEconomy after all resource movement has landed.
 */
export function tickStorage(
    world: GameWorldState,
    snapshots: Map<string, StockpileSnapshot>,
    deltaSeconds: number,
    profiles?: Map<string, StorageProfile>
): void {
    for (const planet of world.economy.planets.values()) {
        const profile = profiles?.get(planet.planetId)
            ?? computeStorageCapacity(world.construction?.planets?.get(planet.planetId));
        const before = snapshots.get(planet.planetId) ?? snapshotStorables(planet);
        applyStorageCaps(planet, profile.capacity, profile.throughput, before, deltaSeconds);
    }
}

/**
 * Empire-wide storage rollup for one faction. The UI and the AI both need to know
 * whether an empire is drowning in goods it cannot hold.
 */
export interface EmpireStorageReport {
    factionId: string;
    totalCapacity: ResourceBundle;
    totalStored: ResourceBundle;
    wastedLastTick: ResourceBundle;
    /** Planets with at least one resource at or above the pressure threshold. */
    pressuredPlanetIds: string[];
}

export function getEmpireStorageReport(world: GameWorldState, factionId: string): EmpireStorageReport {
    const totalCapacity: ResourceBundle = {};
    const totalStored: ResourceBundle = {};
    const wastedLastTick: ResourceBundle = {};
    const pressuredPlanetIds: string[] = [];

    for (const planet of world.economy.planets.values()) {
        if (planet.factionId !== factionId) continue;
        const storage = planet.storage;
        for (const res of STORABLE_RESOURCES) {
            totalStored[res] = (totalStored[res] ?? 0) + (planet.stockpile[res] ?? 0);
            if (!storage) continue;
            totalCapacity[res] = (totalCapacity[res] ?? 0) + (storage.capacity[res] ?? 0);
            const lost = storage.wastedLastTick[res] ?? 0;
            if (lost > 0) wastedLastTick[res] = (wastedLastTick[res] ?? 0) + lost;
        }
        if (storage && storage.pressuredResources.length > 0) pressuredPlanetIds.push(planet.planetId);
    }

    return { factionId, totalCapacity, totalStored, wastedLastTick, pressuredPlanetIds };
}
