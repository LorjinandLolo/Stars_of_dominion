// lib/logistics/distribution-types.ts
// Phase 2 — Planetary distribution. Warehouses hold goods; depots move them.
// A world can own full silos and idle factories at the same time if nothing
// connects the two.

/**
 * Where a planet's limited haulage goes when it cannot serve everyone at once.
 * Set per planet by the PLANET_SET_LOGISTICS_PRIORITY order.
 */
export type LogisticsPriority = 'balanced' | 'military' | 'construction' | 'civilian';

export const LOGISTICS_PRIORITIES: LogisticsPriority[] = [
    'balanced', 'military', 'construction', 'civilian',
];

/** The four things planetary haulage actually feeds. */
export interface LogisticsChannels {
    /** Throughput of the production chains (recipes drawing from stores). */
    manufacturing: number;
    /** Build-queue speed. */
    construction: number;
    /** War materiel chains: ammo and military. */
    military: number;
    /** Consumer chains: luxury, cultural, research. */
    civilian: number;
}

export interface PlanetLogisticsState {
    /** Haulage available: infrastructure baseline + warehouse handling + depots. */
    capacity: number;
    /** Haulage required by population, standing buildings and the build queue. */
    demand: number;
    /** capacity ÷ demand, uncapped. Above 1 means spare haulage. */
    coverageRatio: number;
    /** Blended distribution efficiency, EFFICIENCY_FLOOR–EFFICIENCY_CEILING. */
    efficiency: number;
    /** Efficiency after the priority split, per consumer channel. */
    channels: LogisticsChannels;
    priority: LogisticsPriority;
    /** True when coverage is short enough that the planet is visibly bottlenecked. */
    congested: boolean;
    /** Active depot buildings feeding the network. */
    depotCount: number;
}

// ─── Tuning constants ─────────────────────────────────────────────────────────

/** Haulage granted per infrastructure level. Level 1 covers a modest colony. */
export const INFRA_LOGISTICS_PER_LEVEL = 30;

/** Warehouse `storage_throughput` counts toward haulage at this weight. */
export const WAREHOUSE_THROUGHPUT_WEIGHT = 1.5;

/** Haulage demanded per unit of population. */
export const DEMAND_PER_POP = 0.008;

/** Haulage demanded per active building on the surface. */
export const DEMAND_PER_BUILDING = 6;

/** Haulage demanded per in-progress construction order. */
export const DEMAND_PER_BUILD_ORDER = 10;

/**
 * Efficiency at zero coverage. Deliberately not zero: a planet with no logistics
 * at all still moves goods by truck and barge, just badly.
 */
export const EFFICIENCY_FLOOR = 0.6;

/** Efficiency at exactly enough haulage (coverage 1.0). */
export const EFFICIENCY_BASELINE = 1.0;

/** Efficiency with double the haulage needed. Spare capacity is worth building for. */
export const EFFICIENCY_CEILING = 1.25;

/** Coverage below this is reported as congestion. */
export const CONGESTION_THRESHOLD = 0.8;

/** Effect type emitted by logistics depot buildings. */
export const LOGISTICS_CAPACITY_EFFECT = 'logistics_capacity';

/** Per-channel weights applied on top of base efficiency, by priority. */
export const PRIORITY_WEIGHTS: Record<LogisticsPriority, LogisticsChannels> = {
    balanced: { manufacturing: 1.0, construction: 1.0, military: 1.0, civilian: 1.0 },
    military: { manufacturing: 1.0, construction: 0.9, military: 1.2, civilian: 0.85 },
    construction: { manufacturing: 0.9, construction: 1.3, military: 0.95, civilian: 0.9 },
    civilian: { manufacturing: 1.0, construction: 0.9, military: 0.8, civilian: 1.2 },
};

/** Production-chain outputs fed by the military channel. Everything else is civilian. */
export const MILITARY_CHAIN_OUTPUTS = new Set(['ammo', 'military']);
