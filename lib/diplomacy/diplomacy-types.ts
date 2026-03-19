// lib/diplomacy/diplomacy-types.ts
// Stars of Dominion — Diplomacy System Types

import type { TreatyType } from '@/lib/politics/cold-war-types';

export type DiplomaticOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

export type DiplomaticOfferType =
    | 'treaty'
    | 'trade_pact'
    | 'tribute_demand'
    | 'peace_offer'
    | 'war_declaration'
    | 'alliance_proposal'
    | 'non_aggression';

export interface DiplomaticOffer {
    id: string;
    fromFactionId: string;
    toFactionId: string;
    type: DiplomaticOfferType;
    /** Sub-type for treaty offers */
    treatyType?: TreatyType;
    /** Human-readable message accompanying the offer */
    message?: string;
    /** Resource adjustments for trade pacts */
    resourceAdjustments?: Record<string, number>;
    tariffExemption?: boolean;
    /** Tribute demand fields */
    tributeResourceType?: string;
    tributeAmountPerTick?: number;
    createdAt: string;       // ISO
    expiresAt: string;       // ISO — 48h default for diplomacy
    status: DiplomaticOfferStatus;
    respondedAt?: string;    // ISO — set when accepted/rejected
}

export interface WarDeclaration {
    id: string;
    aggressorId: string;
    targetId: string;
    declaredAt: string;      // ISO
    casus_belli?: string;    // Optional reason
    warGoal?: string;
}

export interface PeaceProposal {
    id: string;
    proposerId: string;
    targetId: string;
    proposedAt: string;
    terms?: string;
    status: 'pending' | 'accepted' | 'rejected';
}
