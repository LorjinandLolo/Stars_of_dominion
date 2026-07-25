// lib/diplomacy/diplomacy-types.ts
// Stars of Dominion — Diplomacy System Types (Phase 1: bilateral consent)
//
// Offers live in world.diplomacy.offers and are mutated ONLY by the game-loop
// worker via DIP_* orders (same pattern as espionage). All timestamps are
// sim-clock seconds (world.nowSeconds), never wall-clock.

import type { TreatyType } from '@/lib/politics/cold-war-types';

export type DiplomaticOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

/**
 * What is being proposed. War declaration is intentionally NOT an offer —
 * it stays a unilateral order. Alliances are the 'mutual_defense' treaty type.
 */
export type DiplomaticOfferKind =
    | 'treaty'          // requires treatyType
    | 'trade_pact'
    | 'tribute_demand'  // ultimatum-flavored: rejection raises pressure sharply
    | 'peace_offer';

export interface DiplomaticOffer {
    id: string;
    kind: DiplomaticOfferKind;
    fromFactionId: string;
    toFactionId: string;
    /** Sub-type for kind === 'treaty' */
    treatyType?: TreatyType;
    /** Trade pact terms (kind === 'trade_pact') */
    resource?: string;
    volumePerHour?: number;
    /** Tribute terms (kind === 'tribute_demand') */
    tributeResourceType?: string;
    tributeAmountPerTick?: number;
    createdAtSeconds: number;
    /** Sim-clock deadline; pending offers past this flip to 'expired'. */
    expiresAtSeconds: number;
    status: DiplomaticOfferStatus;
    respondedAtSeconds?: number;
}

/**
 * One line of per-pair diplomatic memory, stored on RivalryState.recentEvents.
 */
export interface RelationEvent {
    atSeconds: number;
    kind: string;        // e.g. 'offer_accepted', 'treaty_broken', 'war_declared'
    scoreDelta: number;  // applied rivalryScore change
    note?: string;
}

// ─── Gambits (Phase 2: prediction duels) ─────────────────────────────────────

/**
 * A Diplomatic Gambit is a quick pressure action with a prediction layer:
 * the initiator predicts how the target will respond before the response is
 * revealed. Correct predictions amplify the initiator's gains; wrong ones
 * hand the defender the initiative (same 1.35/0.80 philosophy as combat
 * crises in lib/time/auto-resolve.ts).
 */
export type GambitKind = 'ultimatum' | 'espionage_accusation' | 'show_of_force';

export type GambitResponse =
    | 'concede'   // give in to the demand
    | 'reject'    // refuse outright
    | 'stall'     // play for time (softens the immediate outcome)
    | 'admit'     // accusation only: own up publicly
    | 'deny'      // accusation only: deny everything
    | 'submit'    // show of force only: back down
    | 'defy';     // show of force only: stand ground

export type GambitStatus = 'pending' | 'resolved' | 'expired';

export interface DiplomaticGambit {
    id: string;
    kind: GambitKind;
    initiatorId: string;
    targetId: string;
    /** Initiator's secret prediction of the target's response. */
    prediction?: GambitResponse;
    /** Ultimatum: credits demanded. */
    demandCredits?: number;
    createdAtSeconds: number;
    /** Sim-clock deadline; unanswered gambits auto-resolve by target doctrine. */
    respondBySeconds: number;
    status: GambitStatus;
    response?: GambitResponse;
    predictionMatched?: boolean;
    /** True when the deadline picked the response instead of the player. */
    autoResolved?: boolean;
    /** Accusation only: whether evidence actually supported the claim. */
    accusationTrue?: boolean;
    /** Show of force only: whether the initiator actually had the stronger fleet. */
    initiatorStronger?: boolean;
    /** Human-readable resolution line. */
    outcome?: string;
    resolvedAtSeconds?: number;
}

export interface DiplomacyWorldState {
    offers: Map<string, DiplomaticOffer>;
    /**
     * Quick-action spam limits: key `${from}|${to}|${kind}` → sim-clock second
     * before which the same initiative cannot be repeated.
     */
    cooldowns: Map<string, number>;
    /** Active + recently resolved gambits. */
    gambits: Map<string, DiplomaticGambit>;
    /**
     * Situational leverage: key `${holderId}|${overId}` → points. Earned from
     * won gambits, exposed spies, honored guarantees; spent in later phases.
     */
    leverage: Map<string, number>;
}

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Pending offers auto-expire after 48 sim-hours (~3.2h real at 15x). */
export const OFFER_TTL_SECONDS = 48 * 3600;

/** After an offer resolves, same (from, to, kind) is locked for 12 sim-hours. */
export const OFFER_COOLDOWN_SECONDS = 12 * 3600;

/** Cap on per-pair relation memory. */
export const MAX_RELATION_EVENTS = 20;

/** Gambit response window: 24 sim-hours, then doctrine auto-resolve. */
export const GAMBIT_TTL_SECONDS = 24 * 3600;

/** After a gambit resolves, same (initiator, target) locked for 24 sim-hours. */
export const GAMBIT_COOLDOWN_SECONDS = 24 * 3600;

/** Resolved gambits kept 7 sim-days as a record, then pruned. */
export const GAMBIT_RETENTION_SECONDS = 7 * 24 * 3600;

/** Prediction multipliers — mirrors lib/time/auto-resolve.ts crisis logic. */
export const PREDICTION_MATCH_BONUS = 1.35;
export const PREDICTION_MISS_PENALTY = 0.80;

/** Minimum escalation level required to launch each gambit kind (§3 stage gates). */
export const GAMBIT_STAGE_GATES: Record<GambitKind, number> = {
    espionage_accusation: 0, // accusations CREATE pressure, so no gate
    show_of_force: 1,
    ultimatum: 2,
};

/** Valid responses per gambit kind. */
export const GAMBIT_RESPONSES: Record<GambitKind, GambitResponse[]> = {
    ultimatum: ['concede', 'reject', 'stall'],
    espionage_accusation: ['admit', 'deny'],
    show_of_force: ['submit', 'defy'],
};
