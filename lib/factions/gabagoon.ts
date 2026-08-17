// lib/factions/gabagoon.ts
//
// The Gabagoonians of Meatballia Prima — "You come to me, on the day of my
// dinner? ... Sit down. Eat something."
//
// Eileen Ulick, The Soprano-Savant, rules a civilisation of food courts,
// worship-canteens and holovision temples re-airing The Sopranos forever. They
// waddle, until they eat enough capacola.
//
// Five authored traits needed no code. The civ pipeline delivers
// eco_production_mult +0.35 (protein-rich moon), approval +0.25 (high morale
// when binge-watching), combat_power_multiplier +0.20, orbital_power_multiplier
// -0.25 (their fleets are an afterthought) and research_speed -0.20.
//
// What is left is the loop the faction is actually built on:
//
//   CAPACOLA SURGE   spend the stockpile, become terrifying, then crash.
//   SLOW BASELINE    short legs. They are slow when they are not surging.
//   GALACTIC VENDETTA insult the broadcast and they will remember it.
//
// The surge shares its CYCLE with the Sarrak Divine Serum via
// lib/factions/stimulant.ts — active window, then crash window, both derived
// from absolute timestamps. What it does NOT share is magnitude: the serum is a
// binary dose, while capacola "scales with how much is eaten", so the size of
// the effect is computed here from the quantity actually consumed.
//
// A leaf module: the worker's order handler and the terrain dispatcher both read
// it, so it imports only types, civ-ids, the stimulant helper and the ledger.

import type { GameWorldState } from '../game-world-state';
import type { DistrictTraitMultiplier, GabagoonTraitState } from './faction-traits-types';
import { NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import { CIV_GABAGOON, isGabagoon } from './civ-ids';
import { stimulantPhase, doseWindows } from './stimulant';
import { bumpMetric } from '../tech/history-ledger';

export const GABAGOON_CIV_ID = CIV_GABAGOON;

export const SURGE_METRIC = 'gab.capacolaConsumed';
export const VENDETTA_METRIC = 'gab.vendettas';

const TICK_SECONDS = 6 * 60 * 60;

/** The reserve key. UPPERCASE, because world.tributes is broken for storing 'credits'. */
export const CAPACOLA_KEY = 'CAPACOLA';

// ─── Capacola Surge ─────────────────────────────────────────────────────────

export const SURGE_DURATION_SECONDS = 3 * TICK_SECONDS;
/** "Post-capacola crash renders units nearly useless for 1-2 turns." */
export const CRASH_DURATION_SECONDS = 2 * TICK_SECONDS;

/** Smallest helping worth the name. */
export const SURGE_MIN_SERVING = 100;
/** Serving beyond which more capacola buys nothing — the saturation point. */
export const SURGE_FULL_SERVING = 800;

/** Combat swing at a full serving, applied post-clamp. */
export const SURGE_COMBAT_BONUS = 0.55;
/** What the crash takes back. */
export const CRASH_COMBAT_PENALTY = 0.30;

export function gabagoonState(world: GameWorldState, factionId: string): GabagoonTraitState | undefined {
    return world.factionTraits?.get(factionId)?.gabagoon;
}

function phaseOf(world: GameWorldState, factionId: string) {
    const st = gabagoonState(world, factionId);
    if (!st) return 'clear' as const;
    return stimulantPhase(world.nowSeconds ?? 0, st.surgeEndsAtSeconds, st.crashEndsAtSeconds);
}

export function isSurgingNow(world: GameWorldState, factionId: string): boolean {
    return isGabagoon(world, factionId) && phaseOf(world, factionId) === 'surging';
}

export function isCrashed(world: GameWorldState, factionId: string): boolean {
    return isGabagoon(world, factionId) && phaseOf(world, factionId) === 'crashing';
}

/**
 * How hard the current surge hits, 0..1.
 *
 * "The effect scales with how much is eaten" — this is the whole reason the
 * cycle could be shared with the Sarrak but the magnitude could not. Stored,
 * because it is a property of a serving already swallowed: recomputing it from
 * the reserve later would read whatever is in the pantry now, not what went in.
 */
export function surgeIntensity(world: GameWorldState, factionId: string): number {
    if (!isSurgingNow(world, factionId)) return 0;
    return gabagoonState(world, factionId)?.surgeIntensity ?? 0;
}

/**
 * Signed post-clamp combat modifier: positive while surging and scaled by the
 * serving, negative through the crash, zero otherwise.
 *
 * Post-clamp for the reason Ritual Brutality established — calculateEffectivePower
 * clamps to ±40% and the authored combat_strength +0.20 already spends half the
 * band, so routing a surge through techModifiers would make small helpings work
 * and large ones silently vanish.
 */
export function getSurgeBonus(world: GameWorldState, factionId: string): number {
    if (!isGabagoon(world, factionId)) return 0;
    if (isSurgingNow(world, factionId)) return SURGE_COMBAT_BONUS * surgeIntensity(world, factionId);
    if (isCrashed(world, factionId)) return -CRASH_COMBAT_PENALTY;
    return 0;
}

export interface SurgeResult {
    ok: boolean;
    reason?: string;
    consumed?: number;
    intensity?: number;
}

/**
 * Eat. Returns why not, when not.
 *
 * Spends real CAPACOLA out of the faction reserve — the resource exists, is in
 * the ResourceType union, and is genuinely seeded into their opening stockpile,
 * so "falls apart without a capacola supply line" is a supply problem rather
 * than flavour text. A faction that has run dry simply cannot surge.
 */
export function capacolaSurge(world: GameWorldState, factionId: string, requested: number): SurgeResult {
    if (!isGabagoon(world, factionId)) {
        return { ok: false, reason: 'Only the Gabagoonians can stomach that much capacola.' };
    }
    const phase = phaseOf(world, factionId);
    if (phase === 'surging') return { ok: false, reason: 'They are already shimmering with oily power.' };
    if (phase === 'crashing') {
        const st = gabagoonState(world, factionId)!;
        const ticks = Math.ceil((st.crashEndsAtSeconds - (world.nowSeconds ?? 0)) / TICK_SECONDS);
        return { ok: false, reason: `Still coming down — ${ticks} turn(s) of grumpiness left.` };
    }

    const faction: any = (world as any).economy?.factions?.get(factionId);
    const reserves = faction?.reserves;
    if (!reserves) return { ok: false, reason: 'No stockpile to eat from.' };

    const available = reserves[CAPACOLA_KEY] ?? 0;
    const want = Math.max(SURGE_MIN_SERVING, Math.min(requested || SURGE_FULL_SERVING, SURGE_FULL_SERVING));
    if (available < SURGE_MIN_SERVING) {
        return { ok: false, reason: 'The pantry is bare. Nobody is surging on an empty stomach.' };
    }
    const consumed = Math.min(want, available);
    reserves[CAPACOLA_KEY] = available - consumed;

    // Saturating: past a full serving there is nowhere left to put it.
    const intensity = Math.min(1, consumed / SURGE_FULL_SERVING);

    const st = gabagoonState(world, factionId);
    if (!st) return { ok: false, reason: 'No trait state.' };
    const windows = doseWindows(world.nowSeconds ?? 0, SURGE_DURATION_SECONDS, CRASH_DURATION_SECONDS);
    st.surgeEndsAtSeconds = windows.activeUntilSeconds;
    st.crashEndsAtSeconds = windows.crashUntilSeconds;
    st.surgeIntensity = intensity;
    st.surgesTaken += 1;
    st.capacolaConsumed += consumed;
    bumpMetric(world as any, factionId, SURGE_METRIC, consumed);
    console.log(`[Gabagoonians] ${consumed} capacola consumed — intensity ${(intensity * 100).toFixed(0)}%.`);
    return { ok: true, consumed, intensity };
}

// ─── Slow baseline, and the crash ───────────────────────────────────────────

/**
 * "Short range and slow baseline movement."
 *
 * A PERMANENT terrain-cost penalty, worsened during the crash. The fourth use of
 * the terrain seam and its second penalty: the Sarrak and Infernoids gain on
 * their own ground, the Rhimetals bleed indoors, and these ones simply waddle.
 *
 * Applied through lib/factions/terrain-affinity.ts, the single place a
 * per-civilization ground cost may be resolved — legalMoves is authoritative in
 * the worker AND draws the client's reach overlay.
 */
export const WADDLE_COST_MULTIPLIER = 1.25;

/**
 * FLAT, and deliberately not phase-dependent.
 *
 * A crash-worsened movement cost was the obvious design and is the wrong one
 * here. `legalMoves` is the authoritative check in the worker AND draws the
 * client's reach overlay, and `world.factionTraits` is not synced to the client
 * at all — the UI store has no idea whether they are surging. So a phase-aware
 * cost would leave the overlay showing moves during a crash that the worker then
 * refuses, which is the precise failure the terrain dispatcher exists to prevent.
 *
 * Their slowness is authored as a BASELINE weakness ("short range and slow
 * baseline movement"), so a constant is also the more faithful reading. The
 * crash still bites, in the district layer, where the client never computes
 * anything and the two cannot disagree.
 */
export function waddleCost(): number {
    return WADDLE_COST_MULTIPLIER;
}

/** District traits: the crash lowers their defence, exactly as the source says. */
export const CRASH_TAKEN_PENALTY = 0.3;

export function gabagoonDistrictTraits(
    world: GameWorldState,
    factionId: string,
    _terrain: string,
): DistrictTraitMultiplier {
    if (!isGabagoon(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    if (isSurgingNow(world, factionId)) {
        return { dealt: 1 + SURGE_COMBAT_BONUS * surgeIntensity(world, factionId), taken: 1, detonation: 0 };
    }
    if (isCrashed(world, factionId)) {
        return { dealt: 1 - CRASH_COMBAT_PENALTY, taken: 1 + CRASH_TAKEN_PENALTY, detonation: 0 };
    }
    return NEUTRAL_DISTRICT_TRAITS;
}

// ─── Galactic Vendetta ──────────────────────────────────────────────────────

/**
 * "If The Sopranos are insulted or deleted from a planet's network — instant
 * Galactic Vendetta."
 *
 * Seeding a press story into a system the Gabagoonians own IS that insult: it is
 * the one live order by which a rival plants a narrative inside somebody else's
 * audience. PRESS_TOGGLE_JAM cannot serve — it is restricted to systems the
 * caller already controls, so nobody can ever jam a Gabagoonian broadcast.
 *
 * Records a grievance in the SHARED store, which makes this its fourth consumer
 * and the first to create one from a NON-KINETIC act. Everything else that
 * writes there is an act of war; the Gabagoonians start wars over sitcom
 * rankings, and the store models that without a single new field.
 *
 * Returns true when the vendetta was newly declared.
 */
export function declareVendetta(
    world: GameWorldState,
    victimFactionId: string,
    offenderFactionId: string,
): boolean {
    if (!isGabagoon(world, victimFactionId)) return false;
    if (!offenderFactionId || offenderFactionId === victimFactionId) return false;

    const st = gabagoonState(world, victimFactionId);
    if (st) st.vendettas += 1;
    bumpMetric(world as any, victimFactionId, VENDETTA_METRIC, 1);
    console.log(`[Gabagoonians] ${offenderFactionId} touched the broadcast. Vendetta declared.`);
    return true;
}

// ─── Tick ───────────────────────────────────────────────────────────────────

/**
 * Thin: the cycle is derived from timestamps, so there is no countdown to keep
 * honest. This only clears the stored intensity once a surge has fully lapsed,
 * so a stale magnitude cannot be read back by a later bug.
 */
export function tickGabagoon(
    world: GameWorldState,
    traits: { gabagoon?: GabagoonTraitState; factionId: string },
): void {
    const st = traits.gabagoon;
    if (!st) return;
    const now = world.nowSeconds ?? 0;
    if (now >= st.crashEndsAtSeconds && st.surgeIntensity !== 0) st.surgeIntensity = 0;
    st.lastEvaluatedSeconds = now;
}
