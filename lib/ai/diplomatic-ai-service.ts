// lib/ai/diplomatic-ai-service.ts
// Stars of Dominion — Diplomacy Phase 6: the galaxy answers.
//
// WORKER-SIDE ONLY. Until now, offers sent to AI factions sat until expiry,
// gambits only resolved at their deadline, and intervention windows closed in
// silence. This service gives every unclaimed faction a diplomatic voice each
// strategic tick:
//   - answers pending offers by ideology, tension, power balance, and fatigue
//   - answers gambits early using the same doctrine logic as the deadline
//   - takes positions in intervention windows
//   - initiates its own diplomacy: sues for peace when exhausted, proposes
//     NAPs to friends, trades when mercantile, sanctions hated rivals
//
// Claimed (human) factions are skipped — their deadlines still auto-resolve
// via the existing doctrine paths.

import type { GameWorldState } from '@/lib/game-world-state';
import { ensureDiplomacyState, respondToOffer, createOffer, isAtWar, findActiveTreaty } from '@/lib/diplomacy/offer-service';
import { respondToGambit, pickAutoResponse, factionFleetPower } from '@/lib/diplomacy/gambit-service';
import { intervene } from '@/lib/diplomacy/intervention-service';
import { imposeSanctions, getSanction } from '@/lib/diplomacy/sanctions-service';
import type { DiplomaticOffer } from '@/lib/diplomacy/diplomacy-types';

/** AI acts on a pending item once it is this old (6 sim-hours = one tick). */
const DELIBERATION_SECONDS = 6 * 3600;

const EXCLUDED = new Set(['faction-pirates', 'faction-neutral']);

function rivalryScore(world: GameWorldState, aId: string, bId: string): number {
    const r = world.rivalries.get(`rivalry-${aId}-${bId}`) ?? world.rivalries.get(`rivalry-${bId}-${aId}`);
    return r?.rivalryScore ?? 20;
}

function postureOf(world: GameWorldState, factionId: string): string {
    return String((world.movement.empirePostures.get(factionId) as any)?.current ?? '');
}

export function isAIFaction(world: GameWorldState, factionId: string): boolean {
    if (EXCLUDED.has(factionId)) return false;
    if (!world.economy.factions.has(factionId)) return false;
    // No claim list at all → the worker couldn't tell us who is human, so
    // NOBODY is treated as AI. Better a silent galaxy than an AI speaking
    // on a player's behalf.
    const claimed = (world as any).claimedFactionIds;
    if (!Array.isArray(claimed)) return false;
    return !claimed.includes(factionId);
}

// ─── Offer evaluation ────────────────────────────────────────────────────────

/** Would this AI faction accept the offer? Exported for tests. */
export function wouldAccept(world: GameWorldState, offer: DiplomaticOffer): boolean {
    const me = offer.toFactionId;
    const them = offer.fromFactionId;
    const tension = rivalryScore(world, me, them);

    switch (offer.kind) {
        case 'treaty': {
            const threshold = offer.treatyType === 'non_aggression' ? 60
                : offer.treatyType === 'mutual_defense' ? 30
                : 45;
            return tension < threshold;
        }
        case 'trade_pact': {
            const threshold = postureOf(world, me) === 'Mercantile' ? 65 : 50;
            return tension < threshold;
        }
        case 'peace_offer': {
            if (world.shared.warFatigue >= 40) return true;
            return factionFleetPower(world, me) < factionFleetPower(world, them);
        }
        case 'tribute_demand': {
            const treasury = Number(world.economy.factions.get(me)?.reserves?.CREDITS ?? 0);
            const cowed = factionFleetPower(world, them) > factionFleetPower(world, me) * 1.5;
            const affordable = (offer.tributeAmountPerTick ?? 0) <= treasury * 0.01;
            return cowed && affordable;
        }
        default:
            return false;
    }
}

// ─── Main tick ───────────────────────────────────────────────────────────────

export interface DiplomaticAIOptions {
    /** Probability an AI faction attempts one initiative this tick. */
    initiativeChance?: number;
}

export function runDiplomaticAI(world: GameWorldState, opts: DiplomaticAIOptions = {}): void {
    const dip = ensureDiplomacyState(world);
    const initiativeChance = opts.initiativeChance ?? 0.3;

    // 1. Answer pending offers once they've "sat with the court" a tick.
    for (const offer of dip.offers.values()) {
        if (offer.status !== 'pending') continue;
        if (!isAIFaction(world, offer.toFactionId)) continue;
        if (world.nowSeconds < offer.createdAtSeconds + DELIBERATION_SECONDS) continue;
        respondToOffer(world, offer.toFactionId, offer.id, wouldAccept(world, offer) ? 'accept' : 'reject');
    }

    // 2. Answer gambits early with the same doctrine logic the deadline uses.
    for (const gambit of dip.gambits.values()) {
        if (gambit.status !== 'pending') continue;
        if (!isAIFaction(world, gambit.targetId)) continue;
        if (world.nowSeconds < gambit.createdAtSeconds + DELIBERATION_SECONDS) continue;
        respondToGambit(world, gambit.targetId, gambit.id, pickAutoResponse(world, gambit));
    }

    // 3. Take positions in open intervention windows.
    for (const window of dip.interventions.values()) {
        if (window.status !== 'open') continue;
        if (world.nowSeconds < window.openedAtSeconds + DELIBERATION_SECONDS) continue;
        for (const factionId of world.economy.factions.keys()) {
            if (!isAIFaction(world, factionId)) continue;
            if (factionId === window.aggressorId || factionId === window.defenderId) continue;
            if (window.responses[factionId]) continue;
            if (rivalryScore(world, factionId, window.aggressorId) >= 60) {
                intervene(world, factionId, window.id, 'condemn');
            } else if (rivalryScore(world, factionId, window.defenderId) >= 60) {
                intervene(world, factionId, window.id, 'endorse');
            } else if (postureOf(world, factionId) === 'Pacifist') {
                intervene(world, factionId, window.id, 'mediate');
            }
            // Everyone else stays neutral — silence is also a position.
        }
    }

    // 4. Initiatives: at most one per AI faction per tick, chance-gated so the
    //    galaxy feels alive without drowning players in paperwork.
    for (const factionId of world.economy.factions.keys()) {
        if (!isAIFaction(world, factionId)) continue;
        if (Math.random() >= initiativeChance) continue;
        attemptInitiative(world, factionId);
    }
}

function pickRandom<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(Math.random() * items.length)];
}

function attemptInitiative(world: GameWorldState, factionId: string): void {
    const partners = [...world.economy.factions.keys()]
        .filter(id => id !== factionId && !EXCLUDED.has(id));

    // Exhausted and at war → sue for peace with the first enemy found.
    if (world.shared.warFatigue >= 50) {
        const enemy = partners.find(id => isAtWar(world, factionId, id));
        if (enemy) {
            createOffer(world, factionId, { kind: 'peace_offer', toFactionId: enemy });
            return;
        }
    }

    // Hated rival at high tension → join the economic pressure.
    // pickRandom keeps the herd from all courting/sanctioning the same
    // faction in the same tick.
    const hated = pickRandom(partners.filter(id => rivalryScore(world, factionId, id) >= 60
        && !isAtWar(world, factionId, id) && !getSanction(world, factionId, id)));
    if (hated && Math.random() < 0.5) {
        imposeSanctions(world, factionId, hated);
        return;
    }

    // A friend without a NAP → formalize the friendship.
    const friend = pickRandom(partners.filter(id => rivalryScore(world, factionId, id) < 25
        && !findActiveTreaty(world, factionId, id, 'non_aggression')));
    if (friend && Math.random() < 0.6) {
        createOffer(world, factionId, { kind: 'treaty', toFactionId: friend, treatyType: 'non_aggression' });
        return;
    }

    // Mercantile posture → seek trade with anyone tolerable.
    if (postureOf(world, factionId) === 'Mercantile') {
        const customer = pickRandom(partners.filter(id => rivalryScore(world, factionId, id) < 40));
        if (customer) {
            createOffer(world, factionId, {
                kind: 'trade_pact',
                toFactionId: customer,
                resource: 'metals',
                volumePerHour: 20,
            });
        }
    }
}
