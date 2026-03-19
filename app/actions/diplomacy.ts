'use server';
// app/actions/diplomacy.ts
// Stars of Dominion — Diplomacy Server Actions
// Replaces/extends the stub calls in app/actions/politics.ts with real offer lifecycle.

import { revalidatePath } from 'next/cache';
import {
    sendDiplomaticOffer,
    respondToOffer,
    getIncomingOffers,
    getOutgoingOffers,
} from '@/lib/diplomacy/diplomacy-service';
import type { DiplomaticOfferType } from '@/lib/diplomacy/diplomacy-types';
import type { TreatyType } from '@/lib/politics/cold-war-types';
import type { ActionResult } from '@/lib/actions/types';

// ─── Send Offer ───────────────────────────────────────────────────────────────

export async function sendDiplomaticOfferAction(
    fromFactionId: string,
    toFactionId: string,
    type: DiplomaticOfferType,
    options?: {
        treatyType?: TreatyType;
        message?: string;
        resourceAdjustments?: Record<string, number>;
        tariffExemption?: boolean;
        tributeResourceType?: string;
        tributeAmountPerTick?: number;
    }
): Promise<ActionResult & { offerId?: string }> {
    try {
        const offer = sendDiplomaticOffer({
            fromFactionId,
            toFactionId,
            type,
            ...options,
        });
        revalidatePath('/');
        return { success: true, offerId: offer.id };
    } catch (e: any) {
        return { success: false, error: e.message || 'Failed to send offer.' };
    }
}

// ─── Respond to Offer ─────────────────────────────────────────────────────────

export async function respondToOfferAction(
    offerId: string,
    accept: boolean,
    respondingFactionId: string
): Promise<ActionResult> {
    const result = respondToOffer(offerId, accept, respondingFactionId);
    if (!result.success) return { success: false, error: result.error };
    revalidatePath('/');
    return { success: true };
}

// ─── Get Incoming Offers ──────────────────────────────────────────────────────

export async function getIncomingOffersAction(factionId: string) {
    return getIncomingOffers(factionId);
}

export async function getOutgoingOffersAction(factionId: string) {
    return getOutgoingOffers(factionId);
}
