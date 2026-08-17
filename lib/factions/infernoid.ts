// lib/factions/infernoid.ts
// The Infernoids of Pyrothar — their dead explode, their wounded hit harder,
// and nobody will treat with them.
//
// A LEAF module by construction: it imports only the world type, the trait
// types, the civ-id predicates and the history ledger. No engine services. That
// is what lets combat-manager import it directly, the same way it already
// imports kaerruun and sarrak. The rule was never "engines may not import
// faction modules" — it is "no cycles", and the Buthari/Sarrak predicates were
// exiled to civ-ids only because THOSE modules import engine services.
//
// ── What is already live, and must not be rebuilt ────────────────────────────
// civ-infernoid's authored baseModifiers reach the game through
// CIV_MODIFIER_MAP. Measured: eco_upkeep_mult 1.25 (Resource Gluttons),
// research_speed 0.70 and esp_op_success_add -0.30 (Tech Limitations),
// eco_production_mult 1.20 (thermal energy). Three of their four authored
// weaknesses already work. Do not add a second copy of any of them.
//
// Their combat bonus, by contrast, is entirely inert: combat_power_multiplier
// 0.55 + ground_power_multiplier 0.30 multiplies to x1.85 against a 1.40 clamp
// in calculateEffectivePower. Roughly 0.45 of authored bonus is discarded before
// anything below runs. Everything here therefore lives OUTSIDE that clamp.
//
// ── What was dropped, and why ────────────────────────────────────────────────
// MORALE INVERSION cannot be built: resolveDistrictBattle's `morale` parameter
// is inert (it is echoed into the result and never read), ground morale has
// three writers that are all decrements and no recovery site anywhere, and
// there is no rout, surrender or retreat to be immune to — `retreatRequested`
// is written once as false and never read; `endReason` has zero writers AND
// zero readers. Its one surviving consequence is prisoner capture, so that is
// where the trait went, under a name that is true: they are not taken alive.
//
// HEAT IMMUNITY is LIVE. Its blocker — Pyrothar generating as `continental`
// with zero volcanic districts, as every capital did — was fixed by authoring
// archetypes in lib/galaxy/faction-capitals.ts. Pyrothar is now volcanic 16 /
// toxic 12 of 64, so there is finally hot ground to be immune on.
//
// What it is immune TO matters, because two candidates were dead ends:
//   - `SurfaceSector.habitability` is DECORATIVE. Its only reader in the entire
//     repo is SectorInspector.tsx, which prints it. A "thrives where others
//     cannot live" bonus keyed on it would move nothing.
//   - There is no system-temperature axis, so the civ's authored "ravenous
//     upkeep in cold or poor systems" has no economic hook. The cold half is
//     expressed in the district layer instead, where terrain actually exists.
// The live penalty it IS immune to is terrain movement cost — see below.
//
// ELDER INFERNOIDS are LIVE. Their blocker — an invading force's composition
// being fabricated from fleet.basePower at the order site — was fixed rather
// than worked around, so what you load onto a transport is now what comes
// ashore, for all fourteen factions. See ELDER_* below.

import type { GameWorldState } from '../game-world-state';
import type { DistrictTraitMultiplier } from './faction-traits-types';
import { NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import { CIV_INFERNOID, isInfernoid } from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';

export const INFERNOID_CIV_ID = CIV_INFERNOID;

/**
 * Fraction of an Infernoid side's just-suffered casualties dealt straight back
 * into whoever killed them. 1.0 would mean "our dead take an exactly equal
 * weight of the enemy with them"; a quarter is a real threat without making
 * losing profitable.
 */
export const FIREBLOOD_GROUND_COEFF = 0.25;

/** Same idea in the fleet layer: a share of the dying fleet's power. */
export const FIREBLOOD_FLEET_COEFF = 0.30;

/** Ceiling on the Pain-is-Honor bonus, at a fully-shredded stack. */
export const PAIN_MAX = 0.30;

/**
 * How much of the prisoner-capture roll the Infernoids refuse.
 *
 * capturedFromLosses scales captures by `1.6 - moralePercent/100`, and because
 * ground morale saturates near zero on the first resolved cycle, EVERY faction
 * currently sits at the maximum 1.6 permanently. This is the first thing in the
 * game that moves that number.
 */
export const NOT_TAKEN_ALIVE = 0.85;

/** Extra friction every other empire feels toward them, in rivalry points. */
export const PARIAH_BIAS = 68;

export const DETONATION_METRIC = 'inf.firebloodDetonations';

// ── HEAT IMMUNITY ───────────────────────────────────────────────────────────

/**
 * Ground the Infernoids were forged on. Deliberately NOT `desert`: desert is
 * already TERRAIN_COST 1.0, the cheapest tier, so including it would advertise
 * a bonus worth exactly zero.
 */
const HOT_TERRAIN = new Set(['volcanic', 'toxic']);

/**
 * Ground their metabolism hates, from the civ's own authored weakness
 * ("Ravenous upkeep in cold or poor systems"). There is no system-temperature
 * axis to charge upkeep against, so the cost lands where cold actually exists.
 */
const COLD_TERRAIN = new Set(['frozen']);

/** Melee bonus on hot ground, and the matching penalty on ice. */
export const HEAT_BONUS = 0.20;
export const COLD_PENALTY = 0.10;

/**
 * What one district costs an Infernoid formation to enter.
 *
 * This is the actual immunity, and it is immunity to a real, live penalty:
 * TERRAIN_COST charges volcanic 2.0 and toxic 1.8 against a movement budget of
 * 1.4–3.2, and `legalMoves` is SERVER-AUTHORITATIVE — the worker rejects an
 * over-budget order at game-loop.ts, it is not a client hint. So on their own
 * ground the Infernoids manoeuvre while an invader crawls.
 *
 * Flattened to the open-ground rate rather than merely discounted: "hot ground
 * costs them what a field costs anyone else" is a rule a player can hold in
 * their head, where "×0.55 on volcanic" is a number they have to look up.
 */
export const HOT_GROUND_COST = 1.0;

/**
 * Terrain-cost override for a faction, or undefined when they are ordinary.
 *
 * Returning undefined rather than an identity function is deliberate: callers
 * pass it straight through to `legalMoves`, and undefined means that function
 * takes its original code path byte for byte for the other thirteen empires.
 */
export function heatTerrainCost(
    world: GameWorldState,
    factionId: string | undefined,
): ((terrain: string, base: number) => number) | undefined {
    if (!factionId || !isInfernoid(world, factionId)) return undefined;
    return heatTerrainCostForCiv(CIV_INFERNOID);
}

/**
 * The same rule, resolved from a civilization id alone.
 *
 * The client has a `factions` record and no GameWorldState, so without this it
 * could not apply the override — and a reach preview that disagrees with the
 * authoritative check is worse than no preview. One rule, two entry points.
 */
export function heatTerrainCostForCiv(
    civilizationId: string | undefined,
): ((terrain: string, base: number) => number) | undefined {
    if (civilizationId !== CIV_INFERNOID) return undefined;
    return (terrain: string, base: number) => (HOT_TERRAIN.has(terrain) ? Math.min(base, HOT_GROUND_COST) : base);
}

/** District-layer traits. Fireblood rides `detonation`; woundedness is folded in by the caller. */
export function infernoidDistrictTraits(
    world: GameWorldState,
    factionId: string,
    terrain: string,
): DistrictTraitMultiplier {
    if (!isInfernoid(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;
    // Heat immunity's combat half. Same seam and same shape as Sarrak biome
    // affinity — one civilization per district side, so these never stack.
    let dealt = 1;
    if (HOT_TERRAIN.has(terrain)) dealt += HEAT_BONUS;
    else if (COLD_TERRAIN.has(terrain)) dealt -= COLD_PENALTY;
    return { dealt, taken: 1, detonation: FIREBLOOD_GROUND_COEFF };
}

/**
 * How badly mauled this side's formations in one district are, 0..1.
 *
 * Derived from Formation.maxStrength, which is stamped at creation and on
 * reinforcement. Formations that predate the field are back-filled at the top of
 * processSieges — without that back-fill this reads 0 forever and the whole
 * mechanic is wired, runs every cycle, and does nothing.
 *
 * Deliberately NOT `organization`: its only writers are movement and recovery,
 * so a dug-in stack that has been shredded but never marched still reads full.
 * It means "tired", not "wounded".
 */
export function woundedness(
    formations: Array<{ side: string; sectorIndex: number; strength: number; maxStrength?: number }>,
    side: 'attacker' | 'defender',
    sectorIndex: number,
): number {
    let cur = 0;
    let max = 0;
    for (const f of formations) {
        if (f.side !== side || f.sectorIndex !== sectorIndex) continue;
        cur += Math.max(0, f.strength);
        max += Math.max(0, f.maxStrength ?? f.strength);
    }
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - cur / max));
}

/** The Pain-is-Honor multiplier for a side in one district. */
export function painMultiplier(
    world: GameWorldState,
    factionId: string | undefined,
    formations: Array<{ side: string; sectorIndex: number; strength: number; maxStrength?: number }>,
    side: 'attacker' | 'defender',
    sectorIndex: number,
): number {
    if (!factionId || !isInfernoid(world, factionId)) return 1;
    return 1 + PAIN_MAX * woundedness(formations, side, sectorIndex);
}

/**
 * Capture-resistance for one faction, 0..1. Multiplied into the prisoner roll,
 * so 0.85 means 85% of the would-be prisoners are simply not taken.
 */
export function captureResistance(world: GameWorldState, factionId: string | undefined): number {
    if (!factionId || !isInfernoid(world, factionId)) return 0;
    return NOT_TAKEN_ALIVE;
}

/**
 * Extra rivalry friction toward a pariah, in points.
 *
 * Applied symmetrically: it does not matter which side of the pair they are on.
 * Returns 0 for everyone else, so the drift baseline is unchanged for the rest
 * of the galaxy.
 */
export function pariahBiasFor(world: GameWorldState, aId: string, bId: string): number {
    return (isInfernoid(world, aId) || isInfernoid(world, bId)) ? PARIAH_BIAS : 0;
}

// ── ELDER INFERNOIDS ─────────────────────────────────────────────────────────
//
// A walking war-titan. The fantasy is Wells' tripod: it strides through massed
// infantry untouched, ignores chip damage entirely, and falls only to a blow as
// heavy as the one it lands. The two gates that produce that live in
// district-battle.ts applyLosses — only ELDER_KILLERS damage counts against
// them, and it is floored, so a partial blow does nothing at all rather than
// accumulating. Elders also sit LAST in the casualty order, so while any escort
// is still standing the fire is not landing on the titan.
//
// Everything here is the ECONOMIC half: how many exist, and what one costs.

/** The unit type, as it appears in every UnitComposition in the game. */
export const ELDER_UNIT_TYPE = 'ELDER_INFERNOID' as const;

/**
 * Living Elders one empire may field at once, across every garrison, army and
 * siege on the map.
 *
 * A cap has to be a census, not a counter. `bumpMetric` is a LIFETIME total and
 * Elders die — keying the cap on it would let three losses permanently retire
 * the mechanic. countLivingElders walks the world every time it is asked.
 */
export const ELDER_MAX_LIVING = 3;

/**
 * Price of one Elder, in reserve keys.
 *
 * Hand-charged inside the PLANET_RECRUIT_UNITS handler: `chargeOrderCost` reads
 * the action's static cost and cannot see the payload, so it has no way to know
 * that this recruitment is different from raising militia. Keys are UPPERCASE
 * because faction reserves are — `world.tributes` moves nothing to this day
 * because it wrote 'credits' against a reserve keyed 'CREDITS'.
 */
export const ELDER_COST: Readonly<Record<string, number>> = { CREDITS: 40_000, METALS: 1_500 };

/** Elders are raised one at a time; a recruit order for more is clamped to this. */
export const ELDER_BATCH_MAX = 1;

export const ELDER_RAISED_METRIC = 'inf.eldersRaised';

/**
 * Every living Elder belonging to one faction.
 *
 * Three homes, and the split matters — counting the wrong pair double-counts:
 *   1. planet garrisons on worlds the faction owns,
 *   2. armies it has raised (whether on the ground or aboard a transport),
 *   3. ATTACKER-side siege formations in sieges it is prosecuting.
 *
 * Defender-side formations are deliberately NOT counted: seedFormations copies
 * the garrison's unitComposition without clearing it, so a besieged world holds
 * the same titans in both places and counting both would halve the real cap.
 * The attacker's landed force has no such twin — landing consumes the armies
 * aboard — so it is counted here and nowhere else.
 */
export function countLivingElders(world: GameWorldState, factionId: string): number {
    let n = 0;
    const w = world as any;

    for (const planet of (w.construction?.planets?.values?.() ?? [])) {
        if (planet?.ownerId === factionId) {
            n += Math.max(0, planet?.garrison?.unitComposition?.[ELDER_UNIT_TYPE] ?? 0);
        }
        const siege = planet?.siege;
        if (siege?.attackerEmpireId === factionId) {
            for (const f of (siege?.districts?.formations ?? [])) {
                if (f?.side === 'attacker' && f?.unitType === ELDER_UNIT_TYPE) {
                    n += Math.max(0, f.strength ?? 0);
                }
            }
        }
    }

    for (const army of (w.movement?.armies?.values?.() ?? [])) {
        if (army?.factionId !== factionId) continue;
        n += Math.max(0, army?.composition?.[ELDER_UNIT_TYPE] ?? 0);
    }

    return n;
}

export interface ElderRaiseVerdict {
    ok: boolean;
    /** Human-readable refusal, surfaced through recordOrderFailure. */
    reason?: string;
    living: number;
    /** How many may actually be raised by this order, after the cap. */
    granted: number;
}

/**
 * Whether this faction may raise Elders right now, and how many.
 *
 * Fails CLOSED on every axis: wrong civilization, cap reached, or reserves
 * short. The PLANET_RECRUIT_UNITS handler today has no gate at all beyond a
 * console.warn, so this is the whole check.
 */
export function canRaiseElder(
    world: GameWorldState,
    factionId: string,
    requested = 1,
): ElderRaiseVerdict {
    const living = countLivingElders(world, factionId);
    if (!isInfernoid(world, factionId)) {
        return { ok: false, reason: 'Only the Infernoids can raise an Elder.', living, granted: 0 };
    }
    const room = Math.max(0, ELDER_MAX_LIVING - living);
    if (room <= 0) {
        return {
            ok: false,
            reason: `The Crusade already walks with ${living} Elders; ${ELDER_MAX_LIVING} is all the flame will bear.`,
            living,
            granted: 0,
        };
    }
    const granted = Math.max(1, Math.min(ELDER_BATCH_MAX, Math.min(room, Math.floor(requested) || 1)));

    const reserves = (world as any).economy?.factions?.get?.(factionId)?.reserves;
    if (!reserves) {
        return { ok: false, reason: 'No treasury to draw on.', living, granted: 0 };
    }
    for (const [key, per] of Object.entries(ELDER_COST)) {
        if ((reserves[key] ?? 0) < per * granted) {
            return {
                ok: false,
                reason: `Raising an Elder costs ${per * granted} ${key}; the reserve is short.`,
                living,
                granted: 0,
            };
        }
    }
    return { ok: true, living, granted };
}

/**
 * Debits the price. Separate from the verdict so the caller cannot accidentally
 * charge twice, and so the check can be probed without moving money.
 */
export function chargeElder(world: GameWorldState, factionId: string, count: number): void {
    const reserves = (world as any).economy?.factions?.get?.(factionId)?.reserves;
    if (!reserves) return;
    for (const [key, per] of Object.entries(ELDER_COST)) {
        reserves[key] = Math.max(0, (reserves[key] ?? 0) - per * count);
    }
    bumpMetric(world as any, factionId, ELDER_RAISED_METRIC, count);
}

/** Record a detonation, for the ledger. */
export function recordDetonation(world: GameWorldState, factionId: string, n = 1): void {
    if (!isInfernoid(world, factionId)) return;
    bumpMetric(world as any, factionId, DETONATION_METRIC, n);
}

export { isInfernoid };
