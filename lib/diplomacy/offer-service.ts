// lib/diplomacy/offer-service.ts
// Stars of Dominion — Diplomacy Phase 1: bilateral consent engine.
//
// WORKER-SIDE ONLY. Every function mutates GameWorldState in place and is
// called from the game-loop order handlers (DIP_*) or the strategic tick.
// The client never mutates diplomacy state — it reads it via the world sync.

import type { GameWorldState } from '@/lib/game-world-state';
import type { RivalryState, Treaty, TreatyType } from '@/lib/politics/cold-war-types';
import { calculateEscalationLevel } from '@/lib/politics/cold-war-service';
import { ReputationService } from '@/lib/reputation/reputation-service';
import {
    DiplomaticOffer,
    DiplomaticOfferKind,
    DiplomacyWorldState,
    RelationEvent,
    OFFER_TTL_SECONDS,
    OFFER_COOLDOWN_SECONDS,
    MAX_RELATION_EVENTS,
} from './diplomacy-types';

export interface DiplomacyResult {
    success: boolean;
    message: string;
}

const ok = (message: string): DiplomacyResult => ({ success: true, message });
const fail = (message: string): DiplomacyResult => ({ success: false, message });

const TREATY_TYPES: TreatyType[] = ['non_aggression', 'mutual_defense', 'research_share', 'intelligence_pact', 'open_borders'];

// ─── State bootstrap ─────────────────────────────────────────────────────────

/** Ensure world.diplomacy exists (older snapshots lack it). */
export function ensureDiplomacyState(world: GameWorldState): DiplomacyWorldState {
    const w = world as any;
    if (!w.diplomacy) w.diplomacy = {};
    if (!(w.diplomacy.offers instanceof Map)) w.diplomacy.offers = new Map();
    if (!(w.diplomacy.cooldowns instanceof Map)) w.diplomacy.cooldowns = new Map();
    if (!(w.diplomacy.gambits instanceof Map)) w.diplomacy.gambits = new Map();
    if (!(w.diplomacy.leverage instanceof Map)) w.diplomacy.leverage = new Map();
    return w.diplomacy as DiplomacyWorldState;
}

// ─── Relation helpers ────────────────────────────────────────────────────────

/**
 * Rivalries are stored in BOTH directions (rivalry-A-B and rivalry-B-A) by the
 * existing handlers; this helper keeps that invariant so nothing downstream
 * breaks while giving callers a single entry point.
 */
export function getOrCreateRivalry(world: GameWorldState, aId: string, bId: string, initialScore = 20): RivalryState {
    const idAB = `rivalry-${aId}-${bId}`;
    const idBA = `rivalry-${bId}-${aId}`;
    let rivalry = world.rivalries.get(idAB);
    if (!rivalry) {
        const mirror = world.rivalries.get(idBA);
        rivalry = {
            id: idAB,
            empireAId: aId,
            empireBId: bId,
            rivalryScore: mirror?.rivalryScore ?? initialScore,
            escalationLevel: mirror?.escalationLevel ?? calculateEscalationLevel(mirror?.rivalryScore ?? initialScore),
            activeSanctionIds: [],
            proxyConflictsInvolved: [],
            detenteActive: mirror?.detenteActive ?? false,
        };
        world.rivalries.set(idAB, rivalry);
    }
    if (!world.rivalries.has(idBA)) {
        world.rivalries.set(idBA, { ...rivalry, id: idBA, empireAId: bId, empireBId: aId });
    }
    return rivalry;
}

/** Apply a score delta to both stored directions and log it to relation memory. */
export function shiftRivalry(world: GameWorldState, aId: string, bId: string, delta: number, eventKind: string, note?: string): void {
    getOrCreateRivalry(world, aId, bId);
    const event: RelationEvent = { atSeconds: world.nowSeconds, kind: eventKind, scoreDelta: delta, note };
    for (const id of [`rivalry-${aId}-${bId}`, `rivalry-${bId}-${aId}`]) {
        const r = world.rivalries.get(id) as (RivalryState & { recentEvents?: RelationEvent[] }) | undefined;
        if (!r) continue;
        r.rivalryScore = Math.max(0, Math.min(100, r.rivalryScore + delta));
        r.escalationLevel = calculateEscalationLevel(r.rivalryScore);
        if (delta > 0) r.detenteActive = false;
        if (!Array.isArray(r.recentEvents)) r.recentEvents = [];
        r.recentEvents.push(event);
        if (r.recentEvents.length > MAX_RELATION_EVENTS) r.recentEvents.splice(0, r.recentEvents.length - MAX_RELATION_EVENTS);
    }
}

/** Force both directions to an absolute score (war = 100, peace settle = 30...). */
function setRivalryScore(world: GameWorldState, aId: string, bId: string, score: number, detente: boolean, eventKind: string): void {
    getOrCreateRivalry(world, aId, bId);
    for (const id of [`rivalry-${aId}-${bId}`, `rivalry-${bId}-${aId}`]) {
        const r = world.rivalries.get(id) as (RivalryState & { recentEvents?: RelationEvent[] }) | undefined;
        if (!r) continue;
        const delta = score - r.rivalryScore;
        r.rivalryScore = score;
        r.escalationLevel = calculateEscalationLevel(score);
        r.detenteActive = detente;
        if (!Array.isArray(r.recentEvents)) r.recentEvents = [];
        r.recentEvents.push({ atSeconds: world.nowSeconds, kind: eventKind, scoreDelta: delta });
        if (r.recentEvents.length > MAX_RELATION_EVENTS) r.recentEvents.splice(0, r.recentEvents.length - MAX_RELATION_EVENTS);
    }
}

export function isAtWar(world: GameWorldState, aId: string, bId: string): boolean {
    const r = world.rivalries.get(`rivalry-${aId}-${bId}`) ?? world.rivalries.get(`rivalry-${bId}-${aId}`);
    return (r?.escalationLevel ?? 0) >= 7;
}

// ─── Treaty helpers ──────────────────────────────────────────────────────────

export function findActiveTreaty(world: GameWorldState, aId: string, bId: string, type: TreatyType): Treaty | undefined {
    for (const t of world.treaties.values()) {
        if (t.status === 'active' && t.type === type && t.signatories.includes(aId) && t.signatories.includes(bId)) {
            return t;
        }
    }
    return undefined;
}

function factionExists(world: GameWorldState, factionId: string): boolean {
    return world.economy?.factions?.has?.(factionId) ?? false;
}

// ─── Offer lifecycle ─────────────────────────────────────────────────────────

export interface CreateOfferParams {
    kind: DiplomaticOfferKind;
    toFactionId: string;
    treatyType?: TreatyType;
    resource?: string;
    volumePerHour?: number;
    tributeResourceType?: string;
    tributeAmountPerTick?: number;
}

export function createOffer(world: GameWorldState, fromFactionId: string, params: CreateOfferParams): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const { kind, toFactionId } = params;

    if (!toFactionId || toFactionId === fromFactionId) return fail('Invalid diplomatic target.');
    if (!factionExists(world, toFactionId)) return fail('Target faction has no functioning government to negotiate with.');

    if (kind === 'treaty') {
        if (!params.treatyType || !TREATY_TYPES.includes(params.treatyType)) return fail('Unknown treaty type.');
        if (findActiveTreaty(world, fromFactionId, toFactionId, params.treatyType)) {
            return fail('That treaty is already in force between your empires.');
        }
    }
    if (kind === 'tribute_demand') {
        const amt = Number(params.tributeAmountPerTick);
        if (!Number.isFinite(amt) || amt <= 0) return fail('Tribute demand must be a positive amount.');
        params.tributeAmountPerTick = Math.min(10_000, Math.floor(amt));
    }
    if (kind === 'trade_pact') {
        if (!params.resource || !Number.isFinite(Number(params.volumePerHour)) || Number(params.volumePerHour) <= 0) {
            return fail('Trade pact needs a resource and a positive volume.');
        }
    }

    // At war, only surrender terms or peace talks make sense.
    if (isAtWar(world, fromFactionId, toFactionId) && kind !== 'peace_offer' && kind !== 'tribute_demand') {
        return fail('Your empires are at war — sue for peace before proposing accords.');
    }
    if (kind === 'peace_offer' && !isAtWar(world, fromFactionId, toFactionId)) {
        return fail('There is no war to make peace in.');
    }

    // One pending initiative of a kind per target.
    for (const o of dip.offers.values()) {
        if (o.status === 'pending' && o.fromFactionId === fromFactionId && o.toFactionId === toFactionId
            && o.kind === kind && (kind !== 'treaty' || o.treatyType === params.treatyType)) {
            return fail('An identical proposal is already awaiting their answer.');
        }
    }

    // Quick-action limit (§32): repeated initiatives cool down after resolution.
    const cooldownKey = `${fromFactionId}|${toFactionId}|${kind}${kind === 'treaty' ? `:${params.treatyType}` : ''}`;
    const lockedUntil = dip.cooldowns.get(cooldownKey) ?? 0;
    if (world.nowSeconds < lockedUntil) {
        const hours = Math.ceil((lockedUntil - world.nowSeconds) / 3600);
        return fail(`Their court refuses to reopen this matter yet (~${hours}h).`);
    }

    const offer: DiplomaticOffer = {
        id: `offer-${fromFactionId}-${toFactionId}-${kind}-${world.nowSeconds}`,
        kind,
        fromFactionId,
        toFactionId,
        treatyType: params.treatyType,
        resource: params.resource,
        volumePerHour: params.volumePerHour,
        tributeResourceType: params.tributeResourceType ?? 'credits',
        tributeAmountPerTick: params.tributeAmountPerTick,
        createdAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + OFFER_TTL_SECONDS,
        status: 'pending',
    };
    dip.offers.set(offer.id, offer);
    return ok(`Proposal delivered to ${toFactionId}.`);
}

export function withdrawOffer(world: GameWorldState, factionId: string, offerId: string): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const offer = dip.offers.get(offerId);
    if (!offer) return fail('Offer not found.');
    if (offer.fromFactionId !== factionId) return fail('Only the initiator can withdraw a proposal.');
    if (offer.status !== 'pending') return fail('That proposal is no longer open.');
    offer.status = 'withdrawn';
    offer.respondedAtSeconds = world.nowSeconds;
    startCooldown(dip, offer, world.nowSeconds);
    return ok('Proposal withdrawn.');
}

export function respondToOffer(world: GameWorldState, responderId: string, offerId: string, response: 'accept' | 'reject'): DiplomacyResult {
    const dip = ensureDiplomacyState(world);
    const offer = dip.offers.get(offerId);
    if (!offer) return fail('Offer not found.');
    if (offer.toFactionId !== responderId) return fail('This proposal was not addressed to you.');
    if (offer.status !== 'pending') return fail('That proposal is no longer open.');
    if (world.nowSeconds >= offer.expiresAtSeconds) {
        offer.status = 'expired';
        return fail('The proposal lapsed before an answer arrived.');
    }

    offer.respondedAtSeconds = world.nowSeconds;
    startCooldown(dip, offer, world.nowSeconds);

    if (response === 'reject') {
        offer.status = 'rejected';
        // Rejections raise pressure; spurned ultimatums raise it sharply.
        const delta = offer.kind === 'tribute_demand' ? 15 : 5;
        shiftRivalry(world, offer.fromFactionId, offer.toFactionId, delta, 'offer_rejected', offer.kind);
        return ok('Proposal rejected.');
    }

    offer.status = 'accepted';
    applyAcceptedOffer(world, offer);
    return ok('Proposal accepted.');
}

function startCooldown(dip: DiplomacyWorldState, offer: DiplomaticOffer, nowSeconds: number): void {
    const key = `${offer.fromFactionId}|${offer.toFactionId}|${offer.kind}${offer.kind === 'treaty' ? `:${offer.treatyType}` : ''}`;
    dip.cooldowns.set(key, nowSeconds + OFFER_COOLDOWN_SECONDS);
}

function applyAcceptedOffer(world: GameWorldState, offer: DiplomaticOffer): void {
    const { fromFactionId: from, toFactionId: to } = offer;

    switch (offer.kind) {
        case 'treaty': {
            const treaty: Treaty = {
                id: `treaty-${from}-${to}-${offer.treatyType}-${world.nowSeconds}`,
                type: offer.treatyType!,
                signatories: [from, to],
                signedAtTick: world.nowSeconds,
                status: 'active',
            };
            world.treaties.set(treaty.id, treaty);
            shiftRivalry(world, from, to, -10, 'treaty_signed', offer.treatyType);
            ReputationService.updateScore(world, from, { honor: 2 }, `signed_${offer.treatyType}`);
            ReputationService.updateScore(world, to, { honor: 2 }, `signed_${offer.treatyType}`);
            break;
        }
        case 'trade_pact': {
            const pactId = `pact-${from}-${to}-${world.nowSeconds}`;
            world.tradePacts.set(pactId, {
                id: pactId,
                empireAId: from,
                empireBId: to,
                resourceAdjustments: {},
                tariffExemption: true,
                signedAtTick: world.nowSeconds,
            });
            // The pact's cargo terms become a live TradeAgreement — the trade
            // tick pathfinds a route for it and settles goods + credits.
            world.economy.tradeAgreements.set(pactId, {
                id: pactId,
                aFactionId: from,
                bFactionId: to,
                resource: offer.resource!,
                volumePerHour: offer.volumePerHour!,
                startTick: world.nowSeconds,
                endTick: Number.MAX_SAFE_INTEGER,
                priceFormula: 'market',
            } as any);
            shiftRivalry(world, from, to, -8, 'trade_pact_signed', offer.resource);
            ReputationService.updateScore(world, from, { tradeInfluence: 4 }, 'trade_pact');
            ReputationService.updateScore(world, to, { tradeInfluence: 4 }, 'trade_pact');
            break;
        }
        case 'tribute_demand': {
            const tributeId = `tribute-${from}-${to}-${world.nowSeconds}`;
            world.tributes.set(tributeId, {
                id: tributeId,
                vassalId: to,
                overlordId: from,
                resourceType: offer.tributeResourceType ?? 'credits',
                amountPerTick: offer.tributeAmountPerTick ?? 0,
                status: 'active',
            });
            // Submitting defuses the standoff a little, but coercion is remembered.
            shiftRivalry(world, from, to, -5, 'tribute_accepted');
            ReputationService.updateScore(world, from, { oppression: 6 }, 'extracted_tribute');
            break;
        }
        case 'peace_offer': {
            setRivalryScore(world, from, to, 30, true, 'peace_settled');
            // Ending the tribute of a defeated peace partner is a Phase 2 concern;
            // wars end, standing agreements persist.
            ReputationService.updateScore(world, from, { honor: 3, aggression: -5 }, 'peace_settled');
            ReputationService.updateScore(world, to, { honor: 3, aggression: -5 }, 'peace_settled');
            break;
        }
    }
}

// ─── Treaty break / war ──────────────────────────────────────────────────────

export function breakTreaty(world: GameWorldState, factionId: string, treatyId: string): DiplomacyResult {
    const treaty = world.treaties.get(treatyId);
    if (!treaty) return fail('Treaty not found.');
    if (!treaty.signatories.includes(factionId)) return fail('You are not a signatory of that treaty.');
    if (treaty.status !== 'active') return fail('That treaty is not in force.');

    treaty.status = 'broken';
    const other = treaty.signatories.find(s => s !== factionId);
    if (other) shiftRivalry(world, factionId, other, 25, 'treaty_broken', treaty.type);
    ReputationService.updateScore(world, factionId, { reliability: -20, honor: -10 }, `broke_${treaty.type}`);
    return ok(`${treaty.type.replace(/_/g, ' ')} treaty repudiated.`);
}

/**
 * Central war-outbreak path. Called by DIP_DECLARE_WAR and by combat handlers
 * when shots are fired without a declaration (sneak attack).
 *
 * - A live non-aggression pact is auto-broken with a heavy credibility penalty
 *   (surprise attacks stay possible; they just brand you an oathbreaker).
 * - All other treaties and trade pacts between the pair collapse.
 * - Empires holding a mutual-defense treaty with the defender join the war.
 */
export function registerActOfWar(world: GameWorldState, aggressorId: string, defenderId: string): void {
    if (aggressorId === defenderId) return;
    const alreadyAtWar = isAtWar(world, aggressorId, defenderId);

    // Oathbreaker clause: attacking through a live NAP.
    const nap = findActiveTreaty(world, aggressorId, defenderId, 'non_aggression');
    if (nap) {
        nap.status = 'broken';
        ReputationService.updateScore(world, aggressorId, { reliability: -30, deception: 20, honor: -15 }, 'violated_non_aggression');
        console.log(`[Diplomacy] ${aggressorId} VIOLATED a non-aggression pact attacking ${defenderId}`);
    }

    setRivalryScore(world, aggressorId, defenderId, 100, false, 'war_declared');

    if (alreadyAtWar) return; // consequences below fire once per war

    ReputationService.updateScore(world, aggressorId, { aggression: 15 }, 'declared_war');

    // Wartime collapse of standing agreements between the belligerents.
    for (const t of world.treaties.values()) {
        if (t.status === 'active' && t.signatories.includes(aggressorId) && t.signatories.includes(defenderId)) {
            t.status = 'broken';
        }
    }
    for (const [id, pact] of [...world.tradePacts.entries()]) {
        const pair = [pact.empireAId, pact.empireBId];
        if (pair.includes(aggressorId) && pair.includes(defenderId)) {
            world.tradePacts.delete(id);
            world.economy.tradeAgreements?.delete?.(id);
        }
    }
    for (const tribute of world.tributes.values()) {
        const pair = [tribute.vassalId, tribute.overlordId];
        if (tribute.status === 'active' && pair.includes(aggressorId) && pair.includes(defenderId)) {
            tribute.status = 'cancelled';
        }
    }
    // Pending offers between belligerents die with the peace.
    const dip = ensureDiplomacyState(world);
    for (const o of dip.offers.values()) {
        const pair = [o.fromFactionId, o.toFactionId];
        if (o.status === 'pending' && pair.includes(aggressorId) && pair.includes(defenderId)) {
            o.status = 'expired';
            o.respondedAtSeconds = world.nowSeconds;
        }
    }

    // Mutual defense: the defender's allies enter the war against the aggressor.
    for (const t of world.treaties.values()) {
        if (t.status !== 'active' || t.type !== 'mutual_defense' || !t.signatories.includes(defenderId)) continue;
        for (const ally of t.signatories) {
            if (ally === defenderId || ally === aggressorId) continue;
            setRivalryScore(world, ally, aggressorId, 100, false, 'mutual_defense_honored');
            ReputationService.updateScore(world, ally, { reliability: 10, honor: 5 }, 'honored_mutual_defense');
            console.log(`[Diplomacy] ${ally} honors mutual defense with ${defenderId} — at war with ${aggressorId}`);
        }
    }
}

// ─── Strategic tick ──────────────────────────────────────────────────────────

/** Expire lapsed offers/treaties and prune stale cooldowns. Cheap; every tick. */
export function tickDiplomacy(world: GameWorldState): void {
    const dip = ensureDiplomacyState(world);
    for (const offer of dip.offers.values()) {
        if (offer.status === 'pending' && world.nowSeconds >= offer.expiresAtSeconds) {
            offer.status = 'expired';
            startCooldown(dip, offer, world.nowSeconds);
        }
    }
    // Resolved offers linger 7 sim-days as a record, then drop from the blob.
    const RETENTION = 7 * 24 * 3600;
    for (const [id, offer] of [...dip.offers.entries()]) {
        const closedAt = offer.respondedAtSeconds ?? offer.expiresAtSeconds;
        if (offer.status !== 'pending' && world.nowSeconds - closedAt > RETENTION) dip.offers.delete(id);
    }
    for (const [key, until] of [...dip.cooldowns.entries()]) {
        if (world.nowSeconds >= until) dip.cooldowns.delete(key);
    }
    for (const t of world.treaties.values()) {
        if (t.status === 'active' && t.expiresAtTick && world.nowSeconds >= t.expiresAtTick) {
            t.status = 'suspended';
        }
    }
}
