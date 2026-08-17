// lib/factions/rhimetals.ts
//
// The Rhimetals of Aeiralux — "We do not conquer. We correct."
//
// Wofrrs, The Crowned Wing, governs a hive collective directly: every Rhimetal
// is a node on one mind. "If Wofrrs is blocked or suppressed, command efficiency
// collapses until a new node is established." That sentence is the faction, and
// the game already supports it exactly — which is why this module is small.
//
// Five authored traits needed no code. The civ pipeline delivers
// orbital_power_multiplier +0.30 (Perfect unit coordination under Wofrrs),
// legitimacy_drift +0.25 (hive unity), esp_op_success_add +0.20 (Limited
// Telepathy), research_speed +0.15, and combat_power_multiplier -0.20
// (physically lighter — ground combat is not their strength).
//
// What is left is the head that all of it hangs from:
//
//   HIVE MIND NETWORK   coherence, keyed to the sitting head of state.
//   GROUNDED INDOORS    flight troops bleed in cities, ruins and tunnels.
//   DOCTRINE OF DELAY   they do not refuse the first strike; they hesitate.
//   CORRECTION          arbitration that actually de-escalates a war.
//
// A leaf module: government/modifiers.ts composes its coherence, so it must not
// import an engine service. It reads gov.headOfStateId and world.leadership
// directly rather than calling succession-service's getHeadOfState — that
// service imports government-service, and government/modifiers.ts imports this,
// which would close a cycle. The read is five lines and documented below.

import type { GameWorldState } from '../game-world-state';
import type { DistrictTraitMultiplier, RhimetalTraitState } from './faction-traits-types';
import { NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import { CIV_RHIMETALS, isRhimetals, grievanceHolders } from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';

export const RHIMETALS_CIV_ID = CIV_RHIMETALS;

export const NODE_LOSS_METRIC = 'rhi.nodeCollapses';
export const MEDIATION_METRIC = 'rhi.correctionsOffered';

const TICK_SECONDS = 6 * 60 * 60;

// ─── Hive Mind Network ──────────────────────────────────────────────────────

/**
 * How long a freshly seated head of state takes to become the hive's node.
 *
 * "Command efficiency collapses UNTIL A NEW NODE IS ESTABLISHED" — so the
 * penalty is a re-establishment window, not a permanent state. Twelve strategic
 * ticks: long enough that decapitating them is a real strategic play, short
 * enough that it is a setback rather than a death sentence.
 */
export const NODE_REESTABLISH_SECONDS = 12 * TICK_SECONDS;

/** Coherence while the office stands empty — no node at all. */
export const COHERENCE_VACANT = 0.35;
/** Coherence while a successor is still becoming the node. */
export const COHERENCE_REESTABLISHING = 0.6;

/**
 * The sitting head of state, read inline.
 *
 * Deliberately NOT succession-service's getHeadOfState: that module imports
 * government-service, and government/modifiers.ts imports THIS module to compose
 * coherence, so the import would close a cycle. The semantics are copied
 * exactly, including the `status === 'active'` requirement — a deceased leader
 * whose id is still on the government record is not a head of state, and
 * treating one as such would silently mean assassination did nothing.
 */
function seatedHeadOfState(world: GameWorldState, factionId: string): { tookOfficeAtSeconds?: number } | undefined {
    const gov = (world as any).government?.get?.(factionId);
    if (!gov?.headOfStateId) return undefined;
    const leader = (world as any).leadership?.leaders?.get?.(gov.headOfStateId);
    return leader?.status === 'active' ? leader : undefined;
}

/**
 * Hive coherence, 0..1. Every Rhimetal bonus is scaled by it.
 *
 * 1.0 while Wofrrs — or whoever now holds the office — is seated and settled.
 * Falls to COHERENCE_REESTABLISHING for the window after ANY succession, and to
 * COHERENCE_VACANT while the office is empty outright.
 *
 * Derived, never stored. The trigger is already live: the espionage catalog's
 * `assassinate_head_of_state` op calls resolveSuccession(world, target, 'death'),
 * and a coup or a natural death runs the same path. So this reads correctly for
 * every cause without needing a single new writer anywhere.
 */
export function hiveCoherence(world: GameWorldState, factionId: string): number {
    if (!isRhimetals(world, factionId)) return 1;
    const head = seatedHeadOfState(world, factionId);
    if (!head) return COHERENCE_VACANT;
    const since = (world.nowSeconds ?? 0) - (head.tookOfficeAtSeconds ?? 0);
    if (since < NODE_REESTABLISH_SECONDS) return COHERENCE_REESTABLISHING;
    return 1;
}

/** True when the hive is not operating at full command efficiency. */
export function isHiveFrayed(world: GameWorldState, factionId: string): boolean {
    return isRhimetals(world, factionId) && hiveCoherence(world, factionId) < 1;
}

/** Peak swing the hive applies to imperial administration when it frays. */
export const COHERENCE_PRODUCTION_SWING = 0.35;
export const COHERENCE_APPROVAL_SWING = 0.25;

/**
 * Coherence as a government modifier source.
 *
 * A PENALTY-ONLY term: at full coherence it contributes exactly zero, so the
 * civ pipeline's authored bonuses stand alone and nothing is double-counted.
 * The hive being intact is the baseline the faction is balanced around; losing
 * the node is what moves the numbers.
 */
export function getHiveModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    if (!isRhimetals(world, factionId)) return {};
    const deficit = hiveCoherence(world, factionId) - 1;   // 0 or negative
    if (deficit === 0) return {};
    return {
        production: deficit * COHERENCE_PRODUCTION_SWING,
        approval: deficit * COHERENCE_APPROVAL_SWING,
    };
}

// ─── Doctrine of Delay ──────────────────────────────────────────────────────

/**
 * "Reluctant to strike first — bound by ethical doctrine, which might DELAY
 * aggressive action unless provoked."
 *
 * Note carefully what this is NOT. The Buthari are GATED — they cannot strike
 * first at all. The Leo-pantheri are PRICED — they may, and it costs honour.
 * A third refusal-flavoured mechanic would have been three factions wearing the
 * same coat. The source says *delay*, and delay is mechanically distinct: the
 * hive deliberates, and the order lands a tick late.
 *
 * Implemented on the machinery the Movanite command bottleneck already added —
 * the worker defers an order by leaving it `processed: false`, so the next poll
 * executes it in the same FIFO position. Nothing is dropped, and the player
 * watches the strike go in one tick behind schedule.
 */
export const DELIBERATION_TICKS = 1;

/** Aggressive verbs the hive insists on discussing first. */
export const DELIBERATED_ACTIONS = new Set([
    'DIP_DECLARE_WAR',
    'MIL_INVASION_PLANET',
    'MIL_BOMBARD_PLANET',
    'MIL_ATTACK_FLEET',
]);

/**
 * Should this order wait a tick?
 *
 * Provoked — a live grievance against that target, the SHARED store the Buthari
 * gate, the Movanite FAFO clause and the Leo-pantheri honour test all read — the
 * hive has already deliberated and the order goes through immediately.
 */
export function shouldDeliberate(
    world: GameWorldState,
    factionId: string,
    actionId: string,
    targetId?: string,
): boolean {
    if (!isRhimetals(world, factionId)) return false;
    if (!DELIBERATED_ACTIONS.has(actionId)) return false;
    const holders = grievanceHolders(world, factionId);
    if (!holders.length) return true;                  // wholly unprovoked
    if (!targetId) return false;                       // unresolvable target: allow
    return !holders.includes(targetId);                // provoked, but not by THEM
}

/** Record that the hive held an order back. */
export function recordDeliberation(world: GameWorldState, factionId: string): void {
    const st = world.factionTraits?.get(factionId)?.rhimetals;
    if (st) st.ordersDeliberated += 1;
}

// ─── Correction (arbitration) ───────────────────────────────────────────────

/**
 * Rivalry drained from a war the Rhimetals mediate.
 *
 * The intervention system already gives every mediator +3 honour and clears the
 * belligerents' peace-offer cooldown. For galactic custodians that is not
 * enough: "We do not conquer. We correct." Their mediation actually cools the
 * war, which is the one thing no other empire's does.
 */
export const CORRECTION_RIVALRY_RELIEF = 12;

/** A no-op for every other civilization. */
export function correctionReliefFor(world: GameWorldState, factionId: string): number {
    if (!isRhimetals(world, factionId)) return 0;
    // A frayed hive corrects nothing — the voice that carries authority is the
    // node's, and without it they are merely another interested party.
    return CORRECTION_RIVALRY_RELIEF * hiveCoherence(world, factionId);
}

export function recordCorrection(world: GameWorldState, factionId: string): void {
    const st = world.factionTraits?.get(factionId)?.rhimetals;
    if (st) st.correctionsOffered += 1;
    bumpMetric(world as any, factionId, MEDIATION_METRIC, 1);
}

// ─── Grounded Indoors ───────────────────────────────────────────────────────

/**
 * "Flight troops are vulnerable indoors or underground."
 *
 * Ground where wings are a liability: cities, rubble, and the tunnels under a
 * mountain. Expressed on `taken` rather than `dealt` — the source says
 * *vulnerable*, not *ineffective*, and the district layer keeps those separate
 * precisely so a civilization can bleed more without hitting softer.
 *
 * The third distinct use of the terrain seam and deliberately the first PENALTY:
 * the Sarrak gain on wet ground, the Infernoids on hot. A seam that only ever
 * produced bonuses would be a bonus dispenser rather than a terrain model.
 */
const ENCLOSED_TERRAIN = new Set(['urban', 'ruins', 'mountains']);

export const ENCLOSED_TAKEN_PENALTY = 0.25;

export function rhimetalDistrictTraits(
    world: GameWorldState,
    factionId: string,
    terrain: string,
): DistrictTraitMultiplier {
    if (!isRhimetals(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    const taken = ENCLOSED_TERRAIN.has(terrain) ? 1 + ENCLOSED_TAKEN_PENALTY : 1;
    // Coherence reaches the battlefield too: perfect synchronisation is their
    // whole military identity, so a hive without a node fights clumsily.
    return { dealt: hiveCoherence(world, factionId), taken, detonation: 0 };
}

// ─── Tick ───────────────────────────────────────────────────────────────────

/**
 * Thin: coherence is derived from the government record, which the succession
 * and espionage systems already maintain. This only latches the collapse for the
 * ledger, so the player can see that losing the node cost them something.
 */
export function tickRhimetals(
    world: GameWorldState,
    traits: { rhimetals?: RhimetalTraitState; factionId: string },
): void {
    const st = traits.rhimetals;
    if (!st) return;
    const now = world.nowSeconds ?? 0;
    const frayed = isHiveFrayed(world, traits.factionId);

    if (frayed && !st.frayed) {
        st.nodeCollapses += 1;
        bumpMetric(world as any, traits.factionId, NODE_LOSS_METRIC, 1);
        console.log(`[Rhimetals] The hive has lost its node — command efficiency collapses.`);
    }
    if (!frayed && st.frayed) {
        console.log(`[Rhimetals] A new node is established. The collective is whole.`);
    }
    st.frayed = frayed;
    st.coherenceAtLastTick = hiveCoherence(world, traits.factionId);
    st.lastEvaluatedSeconds = now;
}
