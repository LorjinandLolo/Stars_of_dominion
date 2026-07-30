// lib/logistics/distribution-service.ts
// Phase 2 — Planetary distribution.
//
// Warehouses are storage; depots are distribution. This pass works out how much
// haulage a planet has against how much it needs, turns the shortfall into a
// distribution efficiency, and splits that efficiency between the four things
// competing for it: manufacturing, construction, war materiel and consumer goods.

import type { GameWorldState } from '../game-world-state';
import type { PlanetProduction } from '../economy/economy-types';
import type { Planet as ConstructionPlanet } from '../construction/construction-types';
import { BUILDINGS } from '../../data/buildings';
import type { StorageProfile } from './storage-service';
import { computeStorageCapacity } from './storage-service';
import { computeOrbitalRatings } from '../orbital/orbital-service';
import { computeInfrastructureEffects } from '../infrastructure/infrastructure-service';
import {
    INFRA_LOGISTICS_PER_LEVEL,
    WAREHOUSE_THROUGHPUT_WEIGHT,
    DEMAND_PER_POP,
    DEMAND_PER_BUILDING,
    DEMAND_PER_BUILD_ORDER,
    EFFICIENCY_FLOOR,
    EFFICIENCY_BASELINE,
    EFFICIENCY_CEILING,
    CONGESTION_THRESHOLD,
    LOGISTICS_CAPACITY_EFFECT,
    PRIORITY_WEIGHTS,
    MILITARY_CHAIN_OUTPUTS,
} from './distribution-types';
import type {
    LogisticsPriority,
    LogisticsChannels,
    PlanetLogisticsState,
} from './distribution-types';

/**
 * Haulage supplied by depot buildings standing on the surface.
 * Buildings under construction or ruined move nothing.
 */
export function collectDepotCapacity(planet: ConstructionPlanet): { capacity: number; depotCount: number } {
    let capacity = 0;
    let depotCount = 0;

    for (const tile of planet.tiles) {
        if (tile.constructionState !== 'active' || !tile.buildingId) continue;
        const def = BUILDINGS.find(b => b.id === tile.buildingId);
        if (!def) continue;
        let contributed = false;
        for (const effect of def.effects) {
            if (effect.type === LOGISTICS_CAPACITY_EFFECT) {
                capacity += effect.value;
                contributed = true;
            }
        }
        if (contributed) depotCount++;
    }

    return { capacity, depotCount };
}

/** Haulage demanded by a planet's population, standing industry and build queue. */
export function computeLogisticsDemand(
    econPlanet: PlanetProduction,
    constructionPlanet: ConstructionPlanet | undefined
): number {
    const population = econPlanet.demographics?.population ?? 0;
    let activeBuildings = 0;
    let queuedOrders = 0;

    if (constructionPlanet) {
        for (const tile of constructionPlanet.tiles) {
            if (tile.constructionState === 'active' && tile.buildingId) activeBuildings++;
        }
        queuedOrders = constructionPlanet.buildQueue.length;
    }

    return population * DEMAND_PER_POP
        + activeBuildings * DEMAND_PER_BUILDING
        + queuedOrders * DEMAND_PER_BUILD_ORDER;
}

/**
 * Coverage → efficiency. Piecewise linear and deliberately forgiving below 1:
 * a neglected planet is slow, never dead. Above 1, spare haulage keeps paying
 * off up to double coverage, which is what makes depots worth their tile.
 */
export function coverageToEfficiency(coverageRatio: number): number {
    if (coverageRatio <= 0) return EFFICIENCY_FLOOR;
    if (coverageRatio < 1) {
        return EFFICIENCY_FLOOR + (EFFICIENCY_BASELINE - EFFICIENCY_FLOOR) * coverageRatio;
    }
    const surplus = Math.min(1, coverageRatio - 1);
    return EFFICIENCY_BASELINE + (EFFICIENCY_CEILING - EFFICIENCY_BASELINE) * surplus;
}

/** Split a planet's efficiency across the four consumers according to its priority. */
export function applyPriorityWeights(efficiency: number, priority: LogisticsPriority): LogisticsChannels {
    const weights = PRIORITY_WEIGHTS[priority] ?? PRIORITY_WEIGHTS.balanced;
    return {
        manufacturing: efficiency * weights.manufacturing,
        construction: efficiency * weights.construction,
        military: efficiency * weights.military,
        civilian: efficiency * weights.civilian,
    };
}

/**
 * Recompute one planet's logistics state. Writes it onto the economy planet, and
 * mirrors the construction multiplier onto the construction planet so the build
 * queue can read it without needing the whole world.
 */
export function updatePlanetLogistics(
    econPlanet: PlanetProduction,
    constructionPlanet: ConstructionPlanet | undefined,
    storageProfile: StorageProfile
): PlanetLogisticsState {
    const infraLevel = constructionPlanet?.infrastructureLevel ?? 1;
    const depots = constructionPlanet
        ? collectDepotCapacity(constructionPlanet)
        : { capacity: 0, depotCount: 0 };

    // Orbital logistics hubs and stations route goods down the well as well as
    // across it, so they count toward planetary haulage.
    const orbitalHaulage = computeOrbitalRatings(constructionPlanet).logisticsCapacity;

    // Transit and freight tracks are the roads and terminals the haulers use.
    const infraHaulage = computeInfrastructureEffects(constructionPlanet).haulageBonus;

    const capacity = infraLevel * INFRA_LOGISTICS_PER_LEVEL
        + storageProfile.throughput * WAREHOUSE_THROUGHPUT_WEIGHT
        + depots.capacity
        + orbitalHaulage
        + infraHaulage;

    const demand = computeLogisticsDemand(econPlanet, constructionPlanet);
    // A planet with nothing on it is trivially well served.
    const coverageRatio = demand > 0 ? capacity / demand : 2;
    const efficiency = coverageToEfficiency(coverageRatio);
    const priority = econPlanet.logisticsPriority ?? 'balanced';

    const state: PlanetLogisticsState = {
        capacity,
        demand,
        coverageRatio,
        efficiency,
        channels: applyPriorityWeights(efficiency, priority),
        priority,
        congested: coverageRatio < CONGESTION_THRESHOLD,
        depotCount: depots.depotCount,
    };

    econPlanet.logistics = state;
    if (constructionPlanet) {
        constructionPlanet.logistics = {
            efficiency: state.efficiency,
            constructionMultiplier: state.channels.construction,
        };
    }
    return state;
}

/**
 * Per-tick entry point. Must run BEFORE production, because the production chains
 * read the channel multipliers this computes.
 */
export function tickDistribution(
    world: GameWorldState,
    profiles?: Map<string, StorageProfile>
): void {
    for (const planet of world.economy.planets.values()) {
        const constructionPlanet = world.construction?.planets?.get(planet.planetId);
        const profile = profiles?.get(planet.planetId) ?? computeStorageCapacity(constructionPlanet);
        updatePlanetLogistics(planet, constructionPlanet, profile);
    }
}

/**
 * Multiplier a production chain gets, combining the manufacturing channel with
 * the military/civilian split. War materiel and consumer goods draw on the same
 * haulage, so prioritising one genuinely costs the other.
 */
export function chainThroughputMultiplier(planet: PlanetProduction, output: string): number {
    const logistics = planet.logistics;
    if (!logistics) return 1;
    const lane = MILITARY_CHAIN_OUTPUTS.has(output)
        ? logistics.channels.military
        : logistics.channels.civilian;
    // Manufacturing is the shared trunk; the lane is the branch off it.
    return logistics.channels.manufacturing * (lane / Math.max(0.0001, logistics.efficiency));
}

/** Construction-speed multiplier from logistics, for the build queue. */
export function constructionLogisticsMultiplier(planet: ConstructionPlanet | undefined): number {
    return planet?.logistics?.constructionMultiplier ?? 1;
}

/**
 * Efficiency of pooling essentials between planets in a system. Poor local
 * distribution means goods that arrive in orbit still do not reach the people
 * who need them.
 */
export function poolingEfficiency(planets: PlanetProduction[]): number {
    if (planets.length === 0) return 1;
    let total = 0;
    for (const p of planets) total += p.logistics?.efficiency ?? 1;
    return Math.min(1, total / planets.length);
}
