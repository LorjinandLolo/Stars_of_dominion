// lib/specialization/specialization-types.ts
// Phase 5 — Planet specialization becomes a decision instead of a side effect.
//
// It used to be inferred: build four industrial buildings and the game decided
// you had an Industrial World. Now the player declares what a world is for, has
// to qualify for it, pays to change their mind, and eats a real downside for the
// upside. That is what makes specialized worlds trade with each other.

export type SpecializationId =
    | 'mining_world'
    | 'forge_world'
    | 'agricultural_world'
    | 'research_world'
    | 'trade_world'
    | 'fortress_world'
    | 'shipyard_world'
    | 'capital_world';

/**
 * Multipliers and flat adjustments a specialization applies. Multipliers default
 * to 1 and flats to 0 when a specialization does not mention them.
 */
export interface SpecializationEffects {
    // ── Output multipliers ────────────────────────────────────────────────────
    metalsOutput?: number;
    chemicalsOutput?: number;
    foodOutput?: number;
    energyOutput?: number;
    manpowerOutput?: number;
    researchOutput?: number;

    // ── Capability multipliers ────────────────────────────────────────────────
    constructionSpeed?: number;
    shipProduction?: number;
    troopRecruitment?: number;
    defenseStrength?: number;

    // ── Cross-system multipliers ──────────────────────────────────────────────
    /** Scales warehouse capacity on this world. */
    storageCapacity?: number;
    /** Scales planetary haulage. */
    haulage?: number;
    /** Scales trade throughput for routes touching this world. */
    tradeThroughput?: number;
    /** Scales the orbital layer's defense rating. */
    orbitalDefense?: number;

    // ── Flat adjustments ──────────────────────────────────────────────────────
    stability?: number;
    happiness?: number;
    espionageResistance?: number;
}

export interface SpecializationRequirements {
    /** Minimum derived infrastructure level. */
    infrastructureLevel?: number;
    /** Minimum count of active buildings, by building category. */
    buildingsByCategory?: Partial<Record<string, number>>;
    /** Minimum count of active buildings carrying a given tag. */
    buildingsByTag?: Partial<Record<string, number>>;
    /** Minimum count of active buildings of any kind. */
    totalBuildings?: number;
    /** Minimum orbital shipyard tier. */
    orbitalShipyardTier?: number;
    /** Requires any operational station in orbit. */
    requiresOrbitalStation?: boolean;
}

export interface SpecializationDefinition {
    id: SpecializationId;
    name: string;
    description: string;
    /** One-line summary of what the world gives up. Shown next to the bonuses. */
    tradeoff: string;
    requirements: SpecializationRequirements;
    effects: SpecializationEffects;
    /** Credits charged to declare or switch to this specialization. */
    declareCost: number;
    /** Only one world per empire may hold this. */
    uniquePerEmpire?: boolean;
}

/** Live specialization state on a planet. */
export interface SpecializationState {
    id: SpecializationId;
    /** Sim-clock seconds the specialization was declared. */
    declaredAtSeconds: number;
    /**
     * While set and in the future, the world is still retooling: effects apply at
     * TRANSITION_EFFECT_SCALE and stability takes a hit.
     */
    transitionEndsAtSeconds: number | null;
    /** Sim-clock seconds before which the specialization cannot be changed again. */
    lockedUntilSeconds: number;
}

// ─── Tuning constants ─────────────────────────────────────────────────────────

/** Fraction of a specialization's effects that apply during retooling. */
export const TRANSITION_EFFECT_SCALE = 0.5;

/** How long a world takes to retool after declaring a specialization. */
export const TRANSITION_SECONDS = 6 * 3600;

/** How long before a world may change specialization again. */
export const SWITCH_LOCKOUT_SECONDS = 24 * 3600;

/** Stability penalty applied for the duration of a retooling. */
export const TRANSITION_STABILITY_PENALTY = 12;

/** Multiplier on declareCost when replacing an existing specialization. */
export const SWITCH_COST_MULTIPLIER = 2;
