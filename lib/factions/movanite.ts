// lib/factions/movanite.ts
//
// The Movanites of Graviton Vale — "Peace is our policy. But so is trampling."
//
// Cedeti the Third presides over a civilisation that resolves nearly everything
// by subcommittee, and has a constitutional clause permitting total retaliation
// when it does not. Four of their seven authored traits needed no code: the
// civilization pipeline already delivers manpower_generation +0.40 (pop_growth),
// metals_output +0.30 (eco_production_mult), construction_speed +0.20 and
// combat_strength -0.25, so Mass Mobilization, Industrial Powerhouse and Low
// Individual Power are live today. Building a second copy of any of those would
// be arithmetically invisible and is asserted against in the probe.
//
// What is left is the shape of the faction rather than its numbers:
//
//   COMMAND BOTTLENECKS  a per-tick ceiling on orders actually executed.
//   FAFO PROTOCOL        a grievance suspends that ceiling and sharpens them.
//   OVERPOPULATION       their masses may exceed a world's capacity, and bite.
//   SPEED & SWARMING     dense muscle under heavy gravity: cheaper ground.
//
// A leaf module: it imports only types, civ-ids and the ledger, so the worker's
// order loop and population-service can both read it without closing a cycle.

import type { GameWorldState } from '../game-world-state';
import type { DistrictTraitMultiplier, MovaniteTraitState } from './faction-traits-types';
import { NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import { CIV_MOVANITE, isMovanite, grievanceHolders } from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';

export const DEFERRED_METRIC = 'mov.ordersDeferred';
export const FAFO_METRIC = 'mov.fafoTicks';

// ─── Command Bottlenecks ────────────────────────────────────────────────────

/**
 * Orders a Movanite faction may execute in one strategic tick.
 *
 * "Too many Movanites means bureaucratic gridlock — limits on simultaneous
 * expansion or production unless tech is researched."
 *
 * Deliberately generous. The worker drains at most 100 orders per poll across
 * ALL factions, and a human rarely queues more than a handful per tick, so a
 * tight cap would punish nobody but a Movanite player mid-campaign and read as
 * a bug rather than a mechanic. It bites where the fiction says it should: on a
 * sprawling empire issuing dozens of simultaneous instructions.
 */
export const MOVANITE_ORDER_BUDGET = 6;

/**
 * Orders scale with the size of the bureaucracy, not against it — one extra
 * slot per this many owned worlds, because a bigger state does process more.
 * The ceiling still grows slower than the empire does, which is the trap.
 */
export const ORDER_BUDGET_PER_WORLDS = 8;

/** The unblocking tech. Authored on the civ as a starting tech they do NOT have yet. */
export const GRIDLOCK_TECH = 'standing_committee';

export function movaniteState(world: GameWorldState, factionId: string): MovaniteTraitState | undefined {
    return world.factionTraits?.get(factionId)?.movanite;
}

/**
 * How many orders this faction may execute this tick. Infinity = uncapped.
 *
 * Returns Infinity for every other civilization, so the worker's loop is
 * unchanged for them by construction rather than by a branch it might forget.
 */
export function orderBudget(world: GameWorldState, factionId: string): number {
    if (!isMovanite(world, factionId)) return Infinity;
    // The constitutional clause. Provoked, the subcommittees adjourn.
    if (isUnderFafo(world, factionId)) return Infinity;
    // Researching the standing committee retires the mechanic, as authored.
    if (hasGridlockTech(world, factionId)) return Infinity;

    let worlds = 0;
    const planets = (world as any).economy?.planets;
    if (planets?.values) {
        for (const p of planets.values()) if ((p as any).factionId === factionId) worlds++;
    }
    return MOVANITE_ORDER_BUDGET + Math.floor(worlds / ORDER_BUDGET_PER_WORLDS);
}

function hasGridlockTech(world: GameWorldState, factionId: string): boolean {
    const tech = (world as any).tech?.get?.(factionId);
    const researched = tech?.researched ?? tech?.unlockedTechs;
    if (!researched) return false;
    if (Array.isArray(researched)) return researched.includes(GRIDLOCK_TECH);
    if (researched instanceof Set) return researched.has(GRIDLOCK_TECH);
    return !!researched[GRIDLOCK_TECH];
}

/**
 * Record that `count` orders were held over to the next tick.
 *
 * Held over, NOT dropped. The worker leaves them `processed: false` so the very
 * next poll picks them up, still in createdAt order. A dropped order is a silent
 * failure, which is the failure shape this codebase is riddled with; a delayed
 * one is a mechanic the player can see and plan around.
 */
export function recordDeferred(world: GameWorldState, factionId: string, count: number): void {
    if (count <= 0) return;
    const st = movaniteState(world, factionId);
    if (!st) return;
    st.deferredLastTick = count;
    st.deferredTotal += count;
    bumpMetric(world as any, factionId, DEFERRED_METRIC, count);
}

// ─── FAFO Protocol ──────────────────────────────────────────────────────────

/** Extra district damage while the clause is invoked. */
export const FAFO_DEALT_BONUS = 0.35;

/**
 * True while somebody is still owed an answer.
 *
 * Reads the SHARED grievance store, the same record the Buthari retaliation gate
 * uses — written by registerActOfWar and by the invasion and bombardment
 * handlers, which bypass it. That reuse is the point: two civilizations key off
 * being wronged, and one record with three writers beats two records with six.
 *
 * The Buthari need a grievance for PERMISSION; the Movanites need one for
 * PERMISSION TO HURRY. Same trigger, opposite meaning.
 */
export function isUnderFafo(world: GameWorldState, factionId: string): boolean {
    if (!isMovanite(world, factionId)) return false;
    return grievanceHolders(world, factionId).length > 0;
}

/**
 * Per-tick bookkeeping. Kept deliberately thin — the clause is DERIVED from the
 * grievance store rather than counted into a field, so it is correct after a
 * restart, a snapshot reload, or a tick the worker missed. `fafoUntilSeconds`
 * exists only for the UI to show when the current session lapses.
 */
export function tickMovanite(world: GameWorldState, traits: { movanite?: MovaniteTraitState; factionId: string }): void {
    const st = traits.movanite;
    if (!st) return;
    const now = world.nowSeconds ?? 0;
    st.lastEvaluatedSeconds = now;

    if (isUnderFafo(world, traits.factionId)) {
        st.fafoTicks += 1;
        bumpMetric(world as any, traits.factionId, FAFO_METRIC, 1);
        // The window the UI reads. Recomputed every tick from the live store, so
        // a lapsed grievance closes it without a second countdown to keep honest.
        st.fafoUntilSeconds = now + 6 * 60 * 60;
    } else {
        st.fafoUntilSeconds = 0;
        st.deferredLastTick = 0;
    }
}

// ─── Speed & Swarming ───────────────────────────────────────────────────────

/**
 * "Ground units are incredibly fast for their size."
 *
 * Evolved under crushing gravity, so ordinary ground costs them less. Expressed
 * through the terrain-cost override that heat immunity introduced rather than a
 * second movement seam — legalMoves is server-authoritative AND draws the
 * client's reach overlay, so there is exactly one place this may be applied.
 *
 * A flat discount rather than a terrain set: their advantage is physiological,
 * not local knowledge, so it should not care what they are walking over.
 */
export const SWARM_COST_MULTIPLIER = 0.75;

export function swarmTerrainCost(
    civilizationId: string | undefined,
): ((terrain: string, base: number) => number) | undefined {
    if (civilizationId !== CIV_MOVANITE) return undefined;
    return (_terrain: string, base: number) => base * SWARM_COST_MULTIPLIER;
}

// ─── District combat ────────────────────────────────────────────────────────

/**
 * "Retaliatory wars give combat bonuses."
 *
 * Applied in the district layer rather than through the civ modifier map, for
 * the reason Ritual Brutality established: combat_power_multiplier is clamped to
 * ±40% and their authored -0.25 already spends most of the band, so a dynamic
 * bonus routed there would be swallowed. The district layer has no clamp.
 */
export function movaniteDistrictTraits(
    world: GameWorldState,
    factionId: string,
    _terrain: string,
): DistrictTraitMultiplier {
    if (!isMovanite(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    const dealt = isUnderFafo(world, factionId) ? 1 + FAFO_DEALT_BONUS : 1;
    return { dealt, taken: 1, detonation: 0 };
}

// ─── Overpopulation ─────────────────────────────────────────────────────────

/**
 * How far past a world's capacity Movanite numbers may pile up.
 *
 * PopulationService hard-caps every world at popCapacity with a Math.min, so
 * hitting the ceiling today does nothing at all — growth simply stops, silently.
 * That silence is what makes this expressible: the Movanites are the one people
 * whose numbers keep arriving, and the overflow is the cost of the +0.40
 * pop_growth they already enjoy. Their strength and their problem are the same
 * number, which is what the source describes.
 */
export const OVERPOP_CAPACITY_MULTIPLIER = 1.35;

/** Unrest per tick per 10% of capacity exceeded. */
export const OVERPOP_UNREST_PER_DECILE = 1.6;

/**
 * The population ceiling for one world, and the unrest the overflow generates.
 *
 * Returns null for every other civilization so the caller keeps its original
 * Math.min path untouched.
 */
export function overpopulationFor(
    world: GameWorldState,
    factionId: string | undefined,
    popCapacity: number,
    population: number,
): { ceiling: number; unrest: number } | null {
    if (!factionId || !isMovanite(world, factionId)) return null;
    const ceiling = popCapacity * OVERPOP_CAPACITY_MULTIPLIER;
    const over = Math.max(0, population - popCapacity);
    const deciles = popCapacity > 0 ? (over / popCapacity) * 10 : 0;
    return { ceiling, unrest: deciles * OVERPOP_UNREST_PER_DECILE };
}
