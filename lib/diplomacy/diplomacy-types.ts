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

export interface DiplomacyWorldState {
    offers: Map<string, DiplomaticOffer>;
    /**
     * Quick-action spam limits: key `${from}|${to}|${kind}` → sim-clock second
     * before which the same initiative cannot be repeated.
     */
    cooldowns: Map<string, number>;
}

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Pending offers auto-expire after 48 sim-hours (~3.2h real at 15x). */
export const OFFER_TTL_SECONDS = 48 * 3600;

/** After an offer resolves, same (from, to, kind) is locked for 12 sim-hours. */
export const OFFER_COOLDOWN_SECONDS = 12 * 3600;

/** Cap on per-pair relation memory. */
export const MAX_RELATION_EVENTS = 20;
