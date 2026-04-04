// lib/economy/economy-types.ts
// Pillar 3 — Flow-Based Economy data schemas.

import { Market, TradeRoute, TradeAgreement, Faction, PolicyState, WarState } from '../trade-system/types';

// ─── Resource identifiers ─────────────────────────────────────────────────────

export type ResourceId =
    | 'metals'
    | 'chemicals'
    | 'energy'
    | 'food'
    | 'military'
    | 'research'
    | 'luxury'
    | 'cultural'
    | 'rare'
    | 'ammo'
    | 'credits';

export type PlanetType =
    | 'industrial'
    | 'agricultural'
    | 'research'
    | 'fortress'
    | 'commercial'
    | 'frontier';

export type ResourceBundle = Partial<Record<ResourceId, number>>;

// ─── Planet Infrastructure & Services ───────────────────────────────────────────

// ─── Planet Services & Demographics ───────────────────────────────────────────

export type ServiceStatus = 'adequate' | 'strained' | 'failing' | 'collapsed';

export interface PlanetServiceState {
    serviceId: string;
    level: number;
    capacity: number;
    demand: number;
    efficiency: number;
    coverageRatio: number;
    status: ServiceStatus;
    unpaidUpkeepTicks: number;
    modifiers: string[];
}

export interface PlanetDemographics {
    population: number;
    growthRate: number;
    housingCapacity: number;
    serviceSatisfaction: number;
    unrestRisk: number;
    manpowerEfficiency: number;
}

// ─── Planet production ────────────────────────────────────────────────────────

export interface PlanetProduction {
    planetId: string;
    systemId: string;
    factionId: string;
    planetType: PlanetType;
    /** Assorted SWN tags assigned to the original world. Determines Biosphere Traits. */
    tags: string[];
    /** Essential Services map driven by JSON defs. */
    services: Record<string, PlanetServiceState>;
    /** Population and instability limits. */
    demographics: PlanetDemographics;
    /**
     * Per-second production rates (before any multipliers).
     * Pulled from config economy.production.baseRates × planetTypeMults.
     */
    /**
     * Per-second production rates (after Focus and Multipliers).
     */
    currentRates: ResourceBundle;
    /**
     * Current accumulated stockpile for this planet.
     */
    stockpile: ResourceBundle;
    /** Derived capacities (non-tradeable) */
    derived: {
        construction: number;
        military: number;
        research: number;
        cultural: number;
    };
    /** Current load demanded by the infrastructure and population. */
    energyLoad: number;
    /** Current energy output of the power grid. */
    energyProduced: number;
    /** Happiness 0–100. Increases with commodity access and basic services. */
    happiness: number;
    /** Instability 0–100. Increases with scarcity, decreases with happiness. */
    instability: number;
    /** True when commodities are below scarcity threshold. */
    commodityScarcity: boolean;
}

// ─── Trade flow ───────────────────────────────────────────────────────────────

export interface TradeHub {
    systemId: string;
    factionId: string;
    /** Number of active trade route segments passing through. */
    routeCount: number;
    /**
     * Compounding multiplier applied to goods passing through this hub.
     * Starts at 1.0; grows by config.economy.tradeFlow.hubBonusPercentPerRoute per route.
     * Capped at config.economy.tradeFlow.maxHubBonus.
     */
    hubMultiplier: number;
    /** Total goods throughput passing through per hour (ResourceBundle). */
    throughputPerHour: ResourceBundle;
}

export interface TradeFlowEdge {
    segmentId: string;
    fromSystemId: string;
    toSystemId: string;
    /**
     * Current effective efficiency multiplier (0–1).
     * Reduced by disruption, blockade, and collapse penalties.
     */
    efficiencyMultiplier: number;
    /** Goods flowing per hour along this edge. */
    flowPerHour: ResourceBundle;
}

// ─── Commodity distribution ───────────────────────────────────────────────────

export interface CommodityFlowResult {
    /** Per-planet commodity delivery amounts (ResourceBundle contains luxury/cultural/rare). */
    deliveries: Map<string, ResourceBundle>;
    /** Planets that received less than their expected minimum (scarcity). */
    scarcePlanetIds: string[];
    /** Overall commodity access ratio 0–1 (delivered ÷ demand). */
    commodityAccessRatio: number;
}

// ─── Economic regions & collapse ─────────────────────────────────────────────

export type CollapseStage = 'stable' | 'strained' | 'critical' | 'collapsing';

export interface EconomicRegion {
    id: string;
    name: string;
    /** System IDs that form this economic region. */
    systemIds: string[];
    factionId: string;
    /** Current trade efficiency 0–1 for this region. */
    tradeEfficiency: number;
    /** Cumulative collapse pressure 0–1. */
    collapsePressure: number;
    collapseStage: CollapseStage;
    /** Whether regional identity is drifting (cultural/political instability). */
    identityDrifting: boolean;
}

export interface CollapseState {
    regionId: string;
    stage: CollapseStage;
    /** Cause narrative. */
    cause: string;
    /** 0–1 pressure accumulation. Resets on recovery. */
    pressure: number;
}

// ─── Economy world state ──────────────────────────────────────────────────────

export interface EconomyWorldState {
    planets: Map<string, PlanetProduction>;
    tradeHubs: Map<string, TradeHub>;
    tradeFlowEdges: Map<string, TradeFlowEdge>;
    regions: Map<string, EconomicRegion>;
    collapseStates: Map<string, CollapseState>;

    // Phase 14: Galactic Trade Network (Global Market & Trade Routes)
    markets: Map<string, Market>;
    tradeRoutes: Map<string, TradeRoute>;
    tradeAgreements: Map<string, TradeAgreement>;
    factions: Map<string, Faction>;
    policies: Map<string, PolicyState>;
    warStates: Map<string, WarState>;

    /**
     * Last flow update unix-seconds.
     * Flow is recalculated lazily only when this is stale.
     */
    lastFlowUpdateAt: number;
}
