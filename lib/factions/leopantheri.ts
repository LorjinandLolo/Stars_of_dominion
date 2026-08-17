// lib/factions/leopantheri.ts
//
// The Leo-pantheri of Savarr'Tel — "Be not the sheep. Be the lion. But always
// remember to breathe first." Philosopher-duelists whose bonuses come from
// keeping their word.
//
// THE CENTRAL FINDING, because it shapes everything below: the game already
// tracks keeping your word, in detail, and does nothing whatsoever with it.
//
// `world.reputation` carries a 0-100 `honor` axis with more than twenty writers
// across the diplomacy layer — signing a treaty (+2), settling a peace (+3),
// honouring a mutual-defence pledge (+5), keeping a promise (+4), breaking a
// treaty (-10), violating a non-aggression pact (-15), being caught spying and
// denying it (-4) — plus a mean-reverting decay toward 50 on every strategic
// tick. It is a rich, correct, *write-only* ledger: nothing outside
// reputation-service itself has ever read `scores` or `derivedTags`.
//
// So the Leo-pantheri do not get an honour system. They get to be the first
// thing in the game that READS the one already there. Building a second honour
// score beside it would have been the exact duplication this codebase keeps
// producing — and would have missed that every event their fiction cares about
// is already wired.
//
// Four of their authored traits also needed no code at all: the civ pipeline
// delivers research_speed +0.30 (Unified Theology & Science), approval +0.40 and
// legitimacy_drift +0.20 (Cultural Influence), eco_manufacturing_mult -0.30
// (Expensive Units) and esp_op_success_add -0.35 (half of Honor Lock).
//
// A leaf module: imports only types, civ-ids, the reputation service and the
// ledger, so government/modifiers.ts and the worker can both read it.

import type { GameWorldState } from '../game-world-state';
import type { DistrictTraitMultiplier, LeopantheriTraitState } from './faction-traits-types';
import { NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import { CIV_LEOPANTHERI, isLeopantheri, grievanceHolders } from './civ-ids';
import { ReputationService } from '../reputation/reputation-service';
import { bumpMetric } from '../tech/history-ledger';

export const LEOPANTHERI_CIV_ID = CIV_LEOPANTHERI;

export const UNJUSTIFIED_WAR_METRIC = 'leo.unjustifiedWars';
export const HONOR_LOCK_METRIC = 'leo.honorLockBreaches';

/** Honour sits at 50 by default and decays back toward it. That is the pivot. */
export const HONOR_BASELINE = 50;

// ─── The honour standing ────────────────────────────────────────────────────

/**
 * Their standing, normalised to -1..+1 around the baseline.
 *
 * Deliberately NOT stored anywhere. Honour lives in world.reputation, which is
 * already persisted, already written by twenty call sites and already decayed on
 * the tick. A cached copy in trait state would be a second source of truth that
 * drifts the moment a treaty is signed while this faction is not being ticked.
 */
export function honorStanding(world: GameWorldState, factionId: string): number {
    if (!isLeopantheri(world, factionId)) return 0;
    const honor = ReputationService.getReputation(world, factionId).scores.honor ?? HONOR_BASELINE;
    return (honor - HONOR_BASELINE) / HONOR_BASELINE;
}

/** Peak approval/legitimacy swing at perfect or ruined honour. */
export const HONOR_APPROVAL_SWING = 0.30;
export const HONOR_LEGITIMACY_SWING = 0.20;
/** "Equations are sung in temples" — devotion and enquiry are the same act. */
export const HONOR_RESEARCH_SWING = 0.25;

/**
 * Honour as a government modifier source.
 *
 * Composed into getGovernmentModifiers alongside policy, cabinet, legacy,
 * cohesion and civilization identity — additive deltas, exactly like its five
 * siblings, so every existing consumer of approval, legitimacy_drift and
 * research_speed picks it up untouched.
 *
 * Returns zeroes for everyone else, so the sixth source is inert for the other
 * thirteen empires by construction rather than by a branch upstream.
 */
export function getHonorModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    if (!isLeopantheri(world, factionId)) return {};
    const standing = honorStanding(world, factionId);
    if (!standing) return {};
    return {
        approval: standing * HONOR_APPROVAL_SWING,
        legitimacy_drift: standing * HONOR_LEGITIMACY_SWING,
        research_speed: standing * HONOR_RESEARCH_SWING,
    };
}

// ─── Refuse First Strike ────────────────────────────────────────────────────

/** Honour and standing burned for opening a war nobody owed them. */
export const UNJUSTIFIED_HONOR_LOSS = 18;
export const UNJUSTIFIED_RELIABILITY_LOSS = 10;

/**
 * Was this act of war owed?
 *
 * Justified means they hold a live grievance against that specific target — the
 * SHARED grievance store, the same record the Buthari retaliation gate and the
 * Movanite FAFO clause read. Third consumer, one record, three writers.
 *
 * Note the deliberate contrast with the Buthari, who are GATED: they cannot
 * strike first at all. The Leo-pantheri can. War is their last resort, not an
 * impossibility — "used only when all reason has been exhausted". So this is an
 * honour price, not a refusal, and a player who decides the price is worth
 * paying is playing the faction correctly rather than breaking it.
 */
export function isJustifiedAgainst(world: GameWorldState, factionId: string, targetId?: string): boolean {
    const holders = grievanceHolders(world, factionId);
    if (!holders.length) return false;
    // An unresolvable target is treated as justified, matching the Buthari gate:
    // most payloads name a planet or a fleet, and punishing a faction because the
    // payload shape lacked an owner would be arbitrary.
    if (!targetId) return true;
    return holders.includes(targetId);
}

/**
 * Acts that open hostilities.
 *
 * Invasion and bombardment are here alongside the formal declaration because
 * NEITHER calls registerActOfWar — a faction can besiege and glass a foreign
 * world at escalation 0. Gating on the declaration alone would let a
 * Leo-pantheri player conquer a neighbour without ever spending a point of
 * honour, which is precisely the fiction inverted.
 */
export const WAR_DECLARATION_ACTIONS = new Set([
    'DIP_DECLARE_WAR',
    'MIL_INVASION_PLANET',
    'MIL_BOMBARD_PLANET',
]);

export function isWarDeclaration(actionId: string): boolean {
    return WAR_DECLARATION_ACTIONS.has(actionId);
}

/**
 * Charge the price for an unprovoked war. A no-op for every other civilization,
 * and for a strike that was owed.
 */
export function chargeUnjustifiedWar(world: GameWorldState, factionId: string, targetId?: string): boolean {
    if (!isLeopantheri(world, factionId)) return false;
    if (isJustifiedAgainst(world, factionId, targetId)) return false;

    ReputationService.updateScore(
        world,
        factionId,
        { honor: -UNJUSTIFIED_HONOR_LOSS, reliability: -UNJUSTIFIED_RELIABILITY_LOSS },
        'unjustified_war',
    );
    const st = world.factionTraits?.get(factionId)?.leopantheri;
    if (st) st.unjustifiedWars += 1;
    bumpMetric(world as any, factionId, UNJUSTIFIED_WAR_METRIC, 1);
    console.log(`[Leo-pantheri] ${factionId} opened an unjustified war on ${targetId ?? 'a neighbour'} — the rite is broken.`);
    return true;
}

// ─── Honor Lock ─────────────────────────────────────────────────────────────

/** Honour burned per underhanded act. */
export const HONOR_LOCK_LOSS = 6;

/**
 * Orders the Leo-pantheri consider beneath them.
 *
 * A PRICE, not a gate — "may be unable to use certain underhanded strategies
 * WITHOUT LOSING faction-wide bonuses" is explicitly conditional in the source.
 * Gating these would also have made them a second Buthari; the whole point of
 * the honour economy is that every dishonourable option stays available and
 * quietly costs them the bonuses that make them strong.
 *
 * Sabotage and assassination, not intelligence-gathering: a philosopher-duelist
 * may watch you. Listed explicitly rather than by ACTION_DEFINITIONS.category,
 * for the reason the Bloodmoon list documents — 'espionage' covers passive
 * observation as happily as murder.
 */
export const DISHONOURABLE_ACTIONS: Record<string, string> = {
    ESP_SABOTAGE_FACILITY: 'sabotage',
    ESP_INCITE_UNREST: 'incitement',
    ESP_ASSASSINATE: 'assassination',
    ESP_STEAL_TECH: 'theft',
    PIR_SPONSOR_ORG: 'sponsoring pirates',
    DIP_BREAK_TREATY: 'breaking a sworn treaty',
};

/**
 * Charge honour for an underhanded order. Returns the verb when it bit, so the
 * caller can tell the player why their standing moved.
 */
export function chargeHonorLock(world: GameWorldState, factionId: string, actionId: string): string | null {
    if (!isLeopantheri(world, factionId)) return null;
    const verb = DISHONOURABLE_ACTIONS[actionId];
    if (!verb) return null;

    ReputationService.updateScore(world, factionId, { honor: -HONOR_LOCK_LOSS, deception: 4 }, `dishonour_${actionId}`);
    const st = world.factionTraits?.get(factionId)?.leopantheri;
    if (st) st.honorBreaches += 1;
    bumpMetric(world as any, factionId, HONOR_LOCK_METRIC, 1);
    console.log(`[Leo-pantheri] ${factionId} stooped to ${verb} — honour spent.`);
    return verb;
}

// ─── District combat ────────────────────────────────────────────────────────

/** Peak defensive bonus at perfect honour. */
export const HONOR_DEFENCE_SWING = 0.30;

/**
 * "Bonuses when winning DEFENSIVE wars" — so this is defence only.
 *
 * Applied in the district layer rather than through combat_power_multiplier
 * because that key is clamped to ±40% and, more importantly, because the bonus
 * has to know whether they are the ones being invaded. The worker passes the
 * planet, so ownership answers it: standing on your own ground is defending.
 *
 * A dishonoured Leo-pantheri fights WORSE than baseline here. That is the point
 * of an economy rather than a bonus — the mechanic has to be able to hurt.
 */
export function leopantheriDistrictTraits(
    world: GameWorldState,
    factionId: string,
    _terrain: string,
    planet?: unknown,
): DistrictTraitMultiplier {
    if (!isLeopantheri(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    const ownerId = (planet as { ownerId?: string } | undefined)?.ownerId;
    if (!ownerId || ownerId !== factionId) return NEUTRAL_DISTRICT_TRAITS;
    const standing = honorStanding(world, factionId);
    return { dealt: 1 + standing * HONOR_DEFENCE_SWING, taken: 1, detonation: 0 };
}

// ─── Tick ───────────────────────────────────────────────────────────────────

/**
 * Thin by design. Honour is derived from world.reputation, which the tick
 * already decays, so there is no counter here to keep honest — only the ledger
 * the UI reads.
 */
export function tickLeopantheri(
    world: GameWorldState,
    traits: { leopantheri?: LeopantheriTraitState; factionId: string },
): void {
    const st = traits.leopantheri;
    if (!st) return;
    st.lastEvaluatedSeconds = world.nowSeconds ?? 0;
    st.honorAtLastTick = ReputationService.getReputation(world, traits.factionId).scores.honor ?? HONOR_BASELINE;
}
