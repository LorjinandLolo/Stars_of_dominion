// lib/infrastructure/infrastructure-types.ts
// Phase 4 — Infrastructure as a network, not a number.
//
// Buildings are what a colony has. Infrastructure is how well it works. A world
// can be covered in factories and still throttle itself if the roads, the grid,
// the relays, the water and the freight terminals were never built out.
//
// The old scalar `infrastructureLevel` survives as a DERIVED average of these
// tracks, so every existing consumer (building requirements, orbital slots,
// storage multipliers) keeps working while the tracks add the real depth.

import type { BuildingCost } from '../construction/construction-types';

export type InfrastructureTrackId =
    /** Roads, high-speed transit, planetary rail and maglev. */
    | 'transit'
    /** Generation distribution, substations, load balancing. */
    | 'power_grid'
    /** Relays, data networks, emergency coordination. */
    | 'comms'
    /** Reservoirs, treatment, irrigation. */
    | 'water'
    /** Logistics hubs, cargo terminals, freight interchanges. */
    | 'freight';

export const INFRASTRUCTURE_TRACK_IDS: InfrastructureTrackId[] = [
    'transit', 'power_grid', 'comms', 'water', 'freight',
];

export interface InfrastructureTrack {
    level: number;
    /** 0–100. Scales the track's contribution; falls when upkeep goes unpaid or bombs fall. */
    integrity: number;
    /** In-progress upgrade, if any. */
    upgrade?: {
        targetLevel: number;
        startedAtSeconds: number;
        completesAtSeconds: number;
    } | null;
}

export interface InfrastructureNetwork {
    tracks: Record<InfrastructureTrackId, InfrastructureTrack>;
    /** Consecutive ticks the planet could not pay infrastructure upkeep. */
    unpaidTicks: number;
}

/** Everything the rest of the game reads off a planet's infrastructure network. */
export interface InfrastructureEffects {
    /** Multiplier on planetary construction speed. */
    constructionSpeed: number;
    /** Multiplier on raw production output. */
    productionEfficiency: number;
    /** Flat haulage added to the planetary distribution network. */
    haulageBonus: number;
    /** Flat warehouse handling added to storage throughput. */
    storageThroughputBonus: number;
    /** Multiplier on food output. */
    foodOutput: number;
    /** Multiplier on population growth. */
    populationGrowth: number;
    /** Flat stability added to the planet. */
    stability: number;
    /** Multiplier on how fast unrest decays — emergency response reach. */
    unrestRecovery: number;
    /** Multiplier on ground force redeployment speed on this world. */
    militaryMovement: number;
    /** Multiplier on trade throughput for routes touching this planet. */
    tradeThroughput: number;
}

export interface InfrastructureTrackDefinition {
    id: InfrastructureTrackId;
    name: string;
    description: string;
    /** Cost of raising the track from `level` to `level + 1`. */
    costPerLevel: BuildingCost;
    /** Cost multiplier compounded per level already held. */
    costGrowth: number;
    /** Seconds to raise one level, before growth. */
    buildTimeSeconds: number;
    /** Upkeep per level per hour. */
    upkeepPerLevel: { credits?: number; energy?: number; metals?: number };
}

// ─── Tuning constants ─────────────────────────────────────────────────────────

export const MIN_TRACK_LEVEL = 0;
export const MAX_TRACK_LEVEL = 5;

/** The derived `infrastructureLevel` never drops below this, so old call sites stay sane. */
export const MIN_DERIVED_INFRA_LEVEL = 1;

/** Integrity regained per hour while upkeep is being paid in full. */
export const INTEGRITY_RECOVERY_PER_HOUR = 3;

/** Integrity lost per hour while upkeep goes unpaid. */
export const INTEGRITY_DECAY_PER_HOUR = 2;

/** Unpaid ticks tolerated before integrity starts falling. */
export const UNPAID_GRACE_TICKS = 3;

/**
 * Per-level effect magnitudes. A track at level 0 contributes nothing; at level
 * 5 with full integrity it contributes five times these numbers.
 */
export const TRACK_EFFECTS: Record<InfrastructureTrackId, Partial<Record<keyof InfrastructureEffects, number>>> = {
    transit: {
        constructionSpeed: 0.06,
        haulageBonus: 8,
        militaryMovement: 0.08,
    },
    power_grid: {
        productionEfficiency: 0.05,
        stability: 1,
    },
    comms: {
        stability: 2,
        unrestRecovery: 0.12,
        tradeThroughput: 0.03,
    },
    water: {
        foodOutput: 0.06,
        populationGrowth: 0.05,
        stability: 0.5,
    },
    freight: {
        haulageBonus: 14,
        storageThroughputBonus: 6,
        tradeThroughput: 0.05,
    },
};

/** Effects that start at 1.0 and accumulate additively; everything else starts at 0. */
export const MULTIPLICATIVE_EFFECTS: Array<keyof InfrastructureEffects> = [
    'constructionSpeed', 'productionEfficiency', 'foodOutput',
    'populationGrowth', 'unrestRecovery', 'militaryMovement', 'tradeThroughput',
];
