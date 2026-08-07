// lib/government/cohesion-types.ts
// Stars of Dominion — Government & Leadership, Phase 6.1 (Empire Cohesion).
//
// Approval asks "do people like this government?". Cohesion asks a different
// question: "do people still believe this empire should exist?" A government can
// sit at 25% approval over a civilization nobody wants to leave, and a
// prosperous-looking empire can have outer worlds quietly preparing to go.
//
// Cohesion is therefore measured PER PLANET, and the empire number is the
// population-weighted aggregate. Anything else cannot answer the question the
// collapse ladder actually asks — *which* worlds leave.

/** One named contribution to a planet's cohesion, in cohesion points. */
export interface CohesionDriver {
    /** Stable id for the UI, e.g. 'unrest'. */
    id: string;
    /** Human-readable cause, e.g. "Unrest at 62". */
    label: string;
    /** Signed contribution to the cohesion target. */
    delta: number;
}

/**
 * How far a world has travelled from the political order. Phase 6.1 only
 * labels the stage; the escalation behaviour attached to each one lands in 6.2.
 */
export type CohesionStage = 'integrated' | 'strained' | 'defiant' | 'separatist';

export const COHESION_STAGE_THRESHOLDS: Array<{ stage: CohesionStage; min: number }> = [
    { stage: 'integrated', min: 60 },
    { stage: 'strained', min: 40 },
    { stage: 'defiant', min: 20 },
    { stage: 'separatist', min: 0 },
];

export interface PlanetCohesion {
    planetId: string;
    /** Owner at last evaluation. Conquest and secession move this. */
    factionId: string;
    systemId: string;
    /** 0–100. A slow stock, not a per-tick calculation — see tickCohesion. */
    cohesion: number;
    /**
     * The value cohesion is currently drifting toward. The gap between this and
     * `cohesion` is the early warning: a world can read 70 and be falling.
     */
    target: number;
    /** Cohesion points per sim day, signed. */
    trend: number;
    stage: CohesionStage;
    /** Why, largest absolute contribution first. */
    drivers: CohesionDriver[];
    /** Hyperlane hops from the owner's capital; -1 when unreachable. */
    distanceFromCapital: number;
    /**
     * 0–100. How close this world is to openly refusing the centre (Phase 6.2).
     * Accumulates while cohesion sits below the defiance threshold, faster the
     * further it has fallen, and bleeds away when the world recovers. Crossing
     * 100 raises a defiance crisis — deliberately a visible countdown rather
     * than a dice roll, so collapse stays something the player can watch coming.
     */
    defiancePressure?: number;
    /**
     * 0–100. Self-rule conceded to this world to end a crisis (Phase 6.2).
     * Raises local cohesion permanently and costs the empire revenue for good —
     * buying peace is not the same as fixing the problem.
     */
    autonomy?: number;
    lastEvaluatedSeconds: number;
}

export function stageFor(cohesion: number): CohesionStage {
    for (const { stage, min } of COHESION_STAGE_THRESHOLDS) {
        if (cohesion >= min) return stage;
    }
    return 'separatist';
}

export const COHESION_STAGE_LABELS: Record<CohesionStage, string> = {
    integrated: 'Integrated',
    strained: 'Strained',
    defiant: 'Defiant',
    separatist: 'Separatist',
};
