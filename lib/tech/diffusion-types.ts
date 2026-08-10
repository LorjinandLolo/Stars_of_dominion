// lib/tech/diffusion-types.ts
// Stars of Dominion — technology acquired by means other than research.
//
// Nine channels (docs/tech-web/systems.md §2) all produce the same object, so
// they share one persistence shape, one assimilation pipeline, and one UI
// surface. A blueprint is knowledge without institutions: having it is not the
// same as being able to build it, which is what adaptation debt models.

export type DiffusionChannel =
    | 'espionage'
    | 'purchase'
    | 'alliance'
    | 'salvage'
    | 'conquest'
    | 'corporate'
    | 'migration'
    | 'archaeology'
    | 'observation';

export interface TechBlueprint {
    id: string;
    techId: string;
    /** Who it came from. Null for archaeology, which has no living source. */
    sourceFactionId: string | null;
    /** The channel that most recently contributed to this blueprint. */
    channel: DiffusionChannel;
    /** 0–1 confidence. Fragments of one tech merge as 1 - Π(1 - fᵢ). */
    fidelity: number;
    /** Purchase channel: vendor support included, so assimilation is cheaper. */
    licensed?: boolean;
    acquiredAtTick: number;
}

/** Fidelity at or above which a blueprint is a complete working copy. */
export const FULL_FIDELITY = 0.95;
/** Below this a blueprint is too fragmentary to assimilate at all. */
export const MIN_ASSIMILATION_FIDELITY = 0.5;

/** Base share of original research cost paid to assimilate a full copy. */
export const ASSIMILATION_COST_FACTOR = 0.4;
/** Licensed copies come with documentation. */
export const LICENSED_COST_FACTOR = 0.25;

/** Effect strength withheld from a tech that was copied rather than derived. */
export const INITIAL_ADAPTATION_DEBT = 0.5;
/** Debt repaid per tick by using the thing — learning by doing. */
export const ADAPTATION_DEBT_DECAY = 0.02;
