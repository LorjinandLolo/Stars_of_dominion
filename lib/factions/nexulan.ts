// lib/factions/nexulan.ts
//
// The Nexulan Convergence — Prime Logic V-8 and the Universal Refinement
// Protocol. A post-biological species of programmable matter that regards
// entropy, aging and war as bugs to be patched.
//
// Six authored traits needed no code. The civ pipeline delivers research_speed
// +0.45 ("they do not discover things, they calculate them"), construction_speed
// +0.35 (Molecular Assembly — nanites raise a factory in hours),
// orbital_power_multiplier +0.20, eco_production_mult -0.35, pop_growth -0.25 and
// approval -0.20. Molecular Assembly is therefore already finished.
//
// What is left:
//
//   CORE STARVATION   a machine species that still starves without biomass.
//   PRE-COGNITION     they read a stance before it is taken.
//   ADAPTIVE SHIELDS  defences that learn the longer a battle runs.
//   CONDESCENSION     every negotiation is capped by their contempt.
//
// A leaf module: government/modifiers.ts composes starvation and the diplomatic
// AI reads condescension, so it imports only types, civ-ids and the ledger.

import type { GameWorldState } from '../game-world-state';
import type { NexulanTraitState } from './faction-traits-types';
import { CIV_NEXULAN, isNexulan } from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';

export const NEXULAN_CIV_ID = CIV_NEXULAN;
export const STARVATION_METRIC = 'nex.starvationTicks';

/** The reserve key. UPPERCASE — world.tributes is broken for storing 'credits'. */
export const BIOMASS_KEY = 'FOOD';

// ─── Core Starvation ────────────────────────────────────────────────────────

/**
 * Biomass below which the organic-quantum cores begin to fail.
 *
 * "To maintain the biological-quantum cores at the centre of their nanite
 * clouds they require constant Biomass." Their authored eco_production_mult of
 * -0.35 is a FOOD-output penalty, so the pressure is real and self-inflicted:
 * the one resource they cannot synthesise is the one they are worst at making.
 */
export const CORE_BIOMASS_FLOOR = 500;

/** Peak penalties when the cores are running dry. */
export const STARVATION_PRODUCTION_PENALTY = 0.4;
export const STARVATION_APPROVAL_PENALTY = 0.3;
export const STARVATION_RESEARCH_PENALTY = 0.35;

export function nexulanState(world: GameWorldState, factionId: string): NexulanTraitState | undefined {
    return world.factionTraits?.get(factionId)?.nexulan;
}

/** Biomass in hand. */
export function biomassOf(world: GameWorldState, factionId: string): number {
    const faction: any = (world as any).economy?.factions?.get(factionId);
    return faction?.reserves?.[BIOMASS_KEY] ?? 0;
}

/**
 * How starved the cores are, 0 (fed) to 1 (empty).
 *
 * Derived from the live reserve, never stored — the treasury moves every tick
 * from trade, production and upkeep, and a cached copy would report last tick's
 * pantry. Graded rather than binary so the player watches it coming.
 */
export function starvation(world: GameWorldState, factionId: string): number {
    if (!isNexulan(world, factionId)) return 0;
    const biomass = biomassOf(world, factionId);
    if (biomass >= CORE_BIOMASS_FLOOR) return 0;
    return Math.min(1, (CORE_BIOMASS_FLOOR - biomass) / CORE_BIOMASS_FLOOR);
}

export function isStarving(world: GameWorldState, factionId: string): boolean {
    return starvation(world, factionId) > 0;
}

/**
 * Starvation as a government modifier source.
 *
 * PENALTY-ONLY: a fed Convergence contributes exactly zero, so the civ
 * pipeline's authored bonuses stand alone and nothing is counted twice. Composed
 * alongside policy, cabinet, legacy, cohesion, identity, honour and hive
 * coherence — the same additive contract as its siblings.
 *
 * Research is included deliberately. The cores ARE the laboratory; a Convergence
 * that cannot feed them loses the one thing it is best at, which is what makes
 * the weakness bite rather than merely annoy.
 */
export function getStarvationModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    const s = starvation(world, factionId);
    if (!s) return {};
    return {
        production: -s * STARVATION_PRODUCTION_PENALTY,
        approval: -s * STARVATION_APPROVAL_PENALTY,
        research_speed: -s * STARVATION_RESEARCH_PENALTY,
    };
}

// ─── Pre-Cognitive Algorithms ───────────────────────────────────────────────

/**
 * Extra tactical advantage on a correct stance read.
 *
 * The engine already runs the whole mechanic: resolveEngagementRound compares
 * `attackerPredictedStance` against the defender's actual stance and multiplies
 * power by `1 + prediction_bonus_multiplier`, defaulting to 0.15. The Nexulans
 * do not need a new system — they need that multiplier to be much larger,
 * because predicting is the thing they claim to do.
 *
 * Returned as an ADDITIVE delta because combat-manager composes the final
 * multiplier as BASE_PREDICTION_BONUS + prediction_bonus_add, and stacking a
 * second multiplicative term there would silently double-count the base.
 */
export const PRECOGNITION_BONUS_ADD = 0.30;

export function precognitionBonus(world: GameWorldState, factionId: string): number {
    return isNexulan(world, factionId) ? PRECOGNITION_BONUS_ADD : 0;
}

// ─── Adaptive Phase-Shields ─────────────────────────────────────────────────

/**
 * "Defence systems learn the frequency of incoming fire, becoming more
 * resistant the longer a battle lasts."
 *
 * Rides `elapsedRounds`, the same field as the Kaer'Ruun engagement ramp, and
 * that shared seam is worth stating plainly: the Kaer'Ruun grow more LETHAL over
 * a long fight, the Nexulans grow more DURABLE. Same clock, opposite face. The
 * two can meet in one battle and both effects apply, which is the correct
 * outcome rather than a conflict.
 *
 * Defender-only. A shield that learns incoming fire cannot help a fleet that
 * chose the engagement, and making it symmetrical would turn a defensive
 * identity into a flat combat bonus.
 */
export const PHASE_SHIELD_PER_ROUND = 0.06;
export const PHASE_SHIELD_MAX = 0.24;

export function phaseShieldBonus(
    world: GameWorldState,
    factionId: string,
    elapsedRounds: number,
    isDefender: boolean,
): number {
    if (!isNexulan(world, factionId) || !isDefender) return 0;
    return Math.min(PHASE_SHIELD_MAX, Math.max(0, elapsedRounds) * PHASE_SHIELD_PER_ROUND);
}

// ─── Condescension ──────────────────────────────────────────────────────────

/**
 * How much harder it is to say yes to a Nexulan.
 *
 * "Talking to a Nexulan is like a human trying to explain math to an ant."
 * Applied to the AI's acceptance threshold when THEY are the proposer, so their
 * contempt costs them diplomacy rather than costing everyone else. A faction
 * that finds you quaint has to offer more to get the same answer.
 *
 * Note this is a threshold shift and not a refusal: the Convergence can still
 * make a deal, it simply has to be a better one. A hard block would make them a
 * fourth faction that cannot do diplomacy, which the galaxy does not need.
 */
export const CONDESCENSION_THRESHOLD_SHIFT = 20;

export function condescensionPenalty(world: GameWorldState, proposerFactionId: string): number {
    return isNexulan(world, proposerFactionId) ? CONDESCENSION_THRESHOLD_SHIFT : 0;
}

// ─── Tick ───────────────────────────────────────────────────────────────────

/**
 * Thin: starvation is derived from the live reserve, so there is no counter to
 * keep honest. This latches the onset for the ledger and warns once, rather than
 * every tick, so a long famine does not drown the log.
 */
export function tickNexulan(
    world: GameWorldState,
    traits: { nexulan?: NexulanTraitState; factionId: string },
): void {
    const st = traits.nexulan;
    if (!st) return;
    const starving = isStarving(world, traits.factionId);

    if (starving && !st.starving) {
        console.log(`[Nexulan] Biomass below the core floor — the organic processors are failing.`);
    }
    if (!starving && st.starving) {
        console.log(`[Nexulan] Cores fed. The Protocol resumes.`);
    }
    if (starving) {
        st.starvationTicks += 1;
        bumpMetric(world as any, traits.factionId, STARVATION_METRIC, 1);
    }
    st.starving = starving;
    st.biomassAtLastTick = biomassOf(world, traits.factionId);
    st.lastEvaluatedSeconds = world.nowSeconds ?? 0;
}
