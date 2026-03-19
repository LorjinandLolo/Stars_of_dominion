// lib/diplomacy/diplomacy-service.ts
// Stars of Dominion — Diplomacy Service
// Real business logic for diplomatic offers with offer/accept/reject lifecycle.

import type { DiplomaticOffer, DiplomaticOfferType, DiplomaticOfferStatus } from './diplomacy-types';
import type { TreatyType } from '@/lib/politics/cold-war-types';
import { fireNotification } from '@/lib/time/notification-hooks';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { v4 as uuidv4 } from 'uuid';

// ─── In-Memory Offer Store ────────────────────────────────────────────────────

const _offers = new Map<string, DiplomaticOffer>();
const OFFER_TTL_HOURS = 48;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function expiresAt(fromNow: Date = new Date()): string {
    return new Date(fromNow.getTime() + OFFER_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

// ─── Create Offer ─────────────────────────────────────────────────────────────

export interface SendOfferParams {
    fromFactionId: string;
    toFactionId: string;
    type: DiplomaticOfferType;
    treatyType?: TreatyType;
    message?: string;
    resourceAdjustments?: Record<string, number>;
    tariffExemption?: boolean;
    tributeResourceType?: string;
    tributeAmountPerTick?: number;
}

export function sendDiplomaticOffer(params: SendOfferParams): DiplomaticOffer {
    // Reject duplicates of the same type between same factions
    const existingDuplicate = [..._offers.values()].find(
        o => o.fromFactionId === params.fromFactionId &&
             o.toFactionId === params.toFactionId &&
             o.type === params.type &&
             (params.treatyType ? o.treatyType === params.treatyType : true) &&
             o.status === 'pending'
    );
    if (existingDuplicate) return existingDuplicate;

    const offer: DiplomaticOffer = {
        id: `offer-${uuidv4()}`,
        fromFactionId: params.fromFactionId,
        toFactionId: params.toFactionId,
        type: params.type,
        treatyType: params.treatyType,
        message: params.message,
        resourceAdjustments: params.resourceAdjustments,
        tariffExemption: params.tariffExemption,
        tributeResourceType: params.tributeResourceType,
        tributeAmountPerTick: params.tributeAmountPerTick,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt(),
        status: 'pending',
    };

    _offers.set(offer.id, offer);

    // Notify recipient
    fireNotification({
        id: `offer-${offer.id}`,
        factionId: params.toFactionId,
        category: 'diplomacy',
        priority: 'normal',
        title: 'Diplomatic Offer Received',
        body: `${params.fromFactionId} has sent you a ${offer.type.replace(/_/g, ' ')} offer.`,
        createdAt: new Date().toISOString(),
        read: false,
        linkToTab: 'diplomacy',
        payload: { offerId: offer.id },
    });

    return offer;
}

// ─── Respond to Offer ─────────────────────────────────────────────────────────

export function respondToOffer(
    offerId: string,
    accept: boolean,
    respondingFactionId: string
): { success: boolean; offer?: DiplomaticOffer; error?: string } {
    const offer = _offers.get(offerId);
    if (!offer) return { success: false, error: 'Offer not found.' };
    if (offer.toFactionId !== respondingFactionId) {
        return { success: false, error: 'Only the recipient can respond to this offer.' };
    }
    if (offer.status !== 'pending') {
        return { success: false, error: `Offer is already ${offer.status}.` };
    }
    if (new Date(offer.expiresAt) < new Date()) {
        offer.status = 'expired';
        _offers.set(offerId, offer);
        return { success: false, error: 'Offer has expired.' };
    }

    offer.status = accept ? 'accepted' : 'rejected';
    offer.respondedAt = new Date().toISOString();
    _offers.set(offerId, offer);

    if (accept) {
        _applyAcceptedOffer(offer);
    }

    // Notify sender
    fireNotification({
        id: `offer-response-${offerId}-${Date.now()}`,
        factionId: offer.fromFactionId,
        category: 'diplomacy',
        priority: 'normal',
        title: accept ? 'Offer Accepted' : 'Offer Rejected',
        body: `${respondingFactionId} has ${accept ? 'accepted' : 'rejected'} your ${offer.type.replace(/_/g, ' ')} offer.`,
        createdAt: new Date().toISOString(),
        read: false,
        linkToTab: 'diplomacy',
        payload: { offerId },
    });

    return { success: true, offer };
}

// ─── Apply Accepted Offer ─────────────────────────────────────────────────────

function _applyAcceptedOffer(offer: DiplomaticOffer): void {
    const world = getGameWorldState();

    switch (offer.type) {
        case 'treaty':
        case 'alliance_proposal':
        case 'non_aggression': {
            if (!offer.treatyType) break;
            const treatyId = `treaty-${[offer.fromFactionId, offer.toFactionId].sort().join('-')}-${offer.treatyType}`;
            world.treaties.set(treatyId, {
                id: treatyId,
                type: offer.treatyType,
                signatories: [offer.fromFactionId, offer.toFactionId],
                signedAtTick: world.nowSeconds,
                status: 'active',
            });
            break;
        }

        case 'trade_pact': {
            const pactId = `pact-${[offer.fromFactionId, offer.toFactionId].sort().join('-')}`;
            world.tradePacts.set(pactId, {
                id: pactId,
                empireAId: offer.fromFactionId,
                empireBId: offer.toFactionId,
                resourceAdjustments: offer.resourceAdjustments ?? {},
                tariffExemption: offer.tariffExemption ?? false,
                signedAtTick: world.nowSeconds,
            });
            break;
        }

        case 'tribute_demand': {
            if (!offer.tributeResourceType || !offer.tributeAmountPerTick) break;
            const tributeId = `tribute-${offer.fromFactionId}-${offer.toFactionId}`;
            world.tributes.set(tributeId, {
                id: tributeId,
                vassalId: offer.toFactionId,
                overlordId: offer.fromFactionId,
                resourceType: offer.tributeResourceType,
                amountPerTick: offer.tributeAmountPerTick,
                status: 'active',
            });
            break;
        }

        case 'peace_offer': {
            const rivalryId = `rivalry-${offer.fromFactionId}-${offer.toFactionId}`;
            const rivalry = world.rivalries.get(rivalryId);
            if (rivalry) {
                rivalry.rivalryScore = Math.max(0, rivalry.rivalryScore - 40);
                rivalry.escalationLevel = Math.max(0, rivalry.escalationLevel - 3);
                rivalry.detenteActive = true;
            }
            break;
        }
    }
}

// ─── Expire Stale Offers ──────────────────────────────────────────────────────

export function expireStaleOffers(): void {
    const now = new Date();
    for (const offer of _offers.values()) {
        if (offer.status === 'pending' && new Date(offer.expiresAt) < now) {
            offer.status = 'expired';
            _offers.set(offer.id, offer);

            fireNotification({
                id: `offer-expired-${offer.id}`,
                factionId: offer.fromFactionId,
                category: 'diplomacy',
                priority: 'low',
                title: 'Diplomatic Offer Expired',
                body: `Your ${offer.type.replace(/_/g, ' ')} offer to ${offer.toFactionId} was not answered in time.`,
                createdAt: now.toISOString(),
                read: false,
                linkToTab: 'diplomacy',
                payload: { offerId: offer.id },
            });
        }
    }
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getOffersForFaction(factionId: string): DiplomaticOffer[] {
    return [..._offers.values()].filter(
        o => (o.toFactionId === factionId || o.fromFactionId === factionId) &&
             o.status === 'pending'
    );
}

export function getIncomingOffers(factionId: string): DiplomaticOffer[] {
    return [..._offers.values()].filter(
        o => o.toFactionId === factionId && o.status === 'pending'
    );
}

export function getOutgoingOffers(factionId: string): DiplomaticOffer[] {
    return [..._offers.values()].filter(
        o => o.fromFactionId === factionId && o.status === 'pending'
    );
}

export function getAllOffers(): DiplomaticOffer[] {
    return [..._offers.values()];
}
