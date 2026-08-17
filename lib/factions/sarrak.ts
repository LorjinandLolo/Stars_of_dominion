// lib/factions/sarrak.ts
// Sarrak of Gor'Zhul — Swamp Juice, Religious Cohesion, Biome Affinity,
// and the Slave Economy.
//
// From the player design: "Warriors are blessed with Divine Serum ... it
// increases size, aggression and pain immunity during battle — but causes
// hallucinations if overused"; "Morale never drops due to war weariness";
// "Unmatched in jungle/swamp biomes"; "Conquered populations are used as cheap
// labour ... Slave-heavy colonies are prone to uprising, especially far from
// the homeworld".
//
// ── Two engine facts that shape everything below ─────────────────────────────
//
// 1. Sarrak combat power is ALREADY PINNED at the engine ceiling. civ-sarrak
//    authors combat_strength 0.30 and military_offensive_strength 0.25, which
//    CIV_MODIFIER_MAP routes to combat_power_multiplier and
//    ground_power_multiplier; calculateEffectivePower sums both to x1.55 and
//    then clamps to 1.40. Roughly 0.15 of their authored bonus is already
//    discarded, and anything further routed through techModifiers for this
//    faction is not merely diminished — it is completely inert. The serum
//    therefore has to ride the post-clamp trait band, like Ritual Brutality.
//
//    (Migrating that discarded 0.15 into traitBonuses would be a stealth global
//    buff to every Sarrak battle dressed up as a bug fix. Deliberately not done.)
//
// 2. There is no ground-unit healing anywhere in this engine. Formation strength
//    never regrows; only organization recovers. So "regeneration" is expressed
//    as taking fewer casualties rather than as healing — the same honest
//    compromise the Kaer'Ruun Fear Aura had to make when fleet morale turned
//    out to be dead.

import type { GameWorldState } from '../game-world-state';
import type { FactionTraitState, SarrakTraitState } from './faction-traits-types';
import { emptySarrakTraitState, NEUTRAL_DISTRICT_TRAITS } from './faction-traits-types';
import type { DistrictTraitMultiplier } from './faction-traits-types';
import { bumpMetric } from '../tech/history-ledger';
// From the LEAF, not cohesion-service: saga.ts puts this module in the client
// bundle, and cohesion-service's import graph reaches politics/registry → fs.
import { distancesFromCapital, getPlanetCohesion } from '../government/capital-distance';
import { CIV_SARRAK, isCivilization } from './civ-ids';

export const SARRAK_CIV_ID = CIV_SARRAK;

/** One strategic tick, in sim-seconds. Mirrors tick-processor's constant. */
const TICK_SECONDS = 6 * 60 * 60;

/** How long one dose of Divine Serum lasts. */
export const SERUM_DURATION_SECONDS = 4 * TICK_SECONDS;
/** The crash afterwards, during which they cannot re-dose. */
export const WITHDRAWAL_DURATION_SECONDS = 3 * TICK_SECONDS;

/** Post-clamp combat multiplier while dosed. */
export const SERUM_COMBAT_BONUS = 0.25;
/** Post-clamp combat penalty while withdrawing. Signed negative on use. */
export const SERUM_WITHDRAWAL_PENALTY = 0.15;
/** Stability every Sarrak world loses when a crash begins. */
export const WITHDRAWAL_UNREST = 8;

/** Melee bonus on wet ground, and the matching penalty on dry. */
export const BIOME_WET_BONUS = 0.25;
export const BIOME_DRY_PENALTY = 0.10;

/**
 * Terrain the Sarrak call home. There is no 'swamp' TerrainType and one must
 * NOT be added: TerrainType is a closed union feeding four non-Partial Record
 * tables, and touching the archetype terrain pools would change the seeded
 * PRNG draw inside generateSurface — every planet in the galaxy would
 * regenerate a different 64-district board.
 */
import { isSurging, isCrashing, doseWindows } from './stimulant';

const WET_TERRAIN = new Set(['jungle', 'forest', 'toxic']);
const DRY_TERRAIN = new Set(['plains', 'desert', 'frozen', 'urban']);

export const DOSES_METRIC = 'sar.dosesAdministered';
export const CONQUEST_METRIC = 'sar.worldsEnslaved';

export function isSarrak(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, SARRAK_CIV_ID);
}

function stateOf(world: GameWorldState, factionId: string): SarrakTraitState | undefined {
    return world.factionTraits?.get(factionId)?.sarrak;
}

// ─── Religious Cohesion ─────────────────────────────────────────────────────
//
// Implemented as warFatigueResistance in lib/factions/civ-ids.ts, not here.
// Its only consumer is updateEmpireCohesion, and cohesion-service cannot import
// this module — sarrak.ts already imports distancesFromCapital FROM
// cohesion-service, so a reverse import would close a cycle. The leaf module
// exists to break exactly that.
//
// updateEmpireCohesion is the ONLY writer of gov.warFatigue on the tick path and
// treats it as an accumulator, which is why this works at all: gov.stability and
// gov.cohesion beside it are recomputed WHOLESALE every tick and a write to
// either would be erased in the same tick it was made.

// ─── Swamp Juice ────────────────────────────────────────────────────────────

// The cycle comparisons moved to lib/factions/stimulant.ts once the Gabagoonian
// Capacola Surge needed the same active-then-crash shape. The STATE stays here
// under its own field names — migrating persisted timestamps would be churn with
// real regression risk across a live snapshot, for no behavioural gain.

export function isDosed(world: GameWorldState, factionId: string): boolean {
    const st = stateOf(world, factionId);
    return !!st && isSurging(world.nowSeconds ?? 0, st.serumEndsAtSeconds, st.withdrawalEndsAtSeconds);
}

export function isWithdrawing(world: GameWorldState, factionId: string): boolean {
    const st = stateOf(world, factionId);
    if (!st) return false;
    return isCrashing(world.nowSeconds ?? 0, st.serumEndsAtSeconds, st.withdrawalEndsAtSeconds);
}

/**
 * Signed post-clamp combat modifier: positive while dosed, negative during the
 * crash, zero otherwise. Applied by traitMultiplier in combat-engine — NOT via
 * techModifiers, which for this faction is entirely inert (see the header).
 */
export function getSerumBonus(world: GameWorldState, factionId: string): number {
    if (!isSarrak(world, factionId)) return 0;
    if (isDosed(world, factionId)) return SERUM_COMBAT_BONUS;
    if (isWithdrawing(world, factionId)) return -SERUM_WITHDRAWAL_PENALTY;
    return 0;
}

export interface GateResult {
    allowed: boolean;
    reason?: string;
}

/** Refuse a dose to anyone but the Sarrak, and to a host still coming down. */
export function checkSerumGate(world: GameWorldState, factionId: string, actionId: string): GateResult {
    if (actionId !== 'SAR_ADMINISTER_SERUM') return { allowed: true };
    if (!isSarrak(world, factionId)) {
        return { allowed: false, reason: 'Only the blessed of Vorr’Thul may take the Divine Serum.' };
    }
    if (isDosed(world, factionId)) {
        return { allowed: false, reason: 'The serum already runs hot in them.' };
    }
    if (isWithdrawing(world, factionId)) {
        const st = stateOf(world, factionId)!;
        const ticks = Math.ceil((st.withdrawalEndsAtSeconds - (world.nowSeconds ?? 0)) / TICK_SECONDS);
        return {
            allowed: false,
            reason: `The legions are still coming down — ${ticks} turn(s) until they can be blessed again.`,
        };
    }
    return { allowed: true };
}

/** Administer a dose. Returns false when the gate would refuse it. */
export function administerSerum(world: GameWorldState, factionId: string): boolean {
    if (!checkSerumGate(world, factionId, 'SAR_ADMINISTER_SERUM').allowed) return false;
    const traits = world.factionTraits?.get(factionId);
    if (!traits) return false;
    const st = traits.sarrak ?? (traits.sarrak = emptySarrakTraitState());

    const now = world.nowSeconds ?? 0;
    const windows = doseWindows(now, SERUM_DURATION_SECONDS, WITHDRAWAL_DURATION_SECONDS);
    st.serumEndsAtSeconds = windows.activeUntilSeconds;
    st.withdrawalEndsAtSeconds = windows.crashUntilSeconds;
    st.dosesTaken += 1;
    bumpMetric(world as any, factionId, DOSES_METRIC, 1);
    return true;
}

// ─── Biome Affinity (and the serum's melee half) ────────────────────────────

// DistrictTraitMultiplier and NEUTRAL_DISTRICT_TRAITS moved to
// faction-traits-types.ts once a second civilization needed them: the siege
// layer's dispatcher has to name the type without importing any one faction.

/**
 * What a side's civilization does to one district battle.
 *
 * The district layer has NO clamp — unlike the fleet engine — so the values are
 * bounded here by construction rather than by the callee.
 *
 * `taken < 1` is where "regeneration" ended up: a side's losses scale with the
 * ENEMY's strength, so raising your own strength does nothing for your own
 * casualties. Reducing what you take is the only honest expression available.
 */
export function districtTraitMultiplier(
    world: GameWorldState,
    factionId: string | undefined,
    terrain: string,
): DistrictTraitMultiplier {
    if (!factionId || !isSarrak(world, factionId)) return NEUTRAL_DISTRICT_TRAITS;

    let dealt = 1;
    let taken = 1;

    // Biome affinity — and its drawback. "Outside swamp environments, many
    // buffs are lost": the penalty is the same function, not a second system.
    if (WET_TERRAIN.has(terrain)) dealt += BIOME_WET_BONUS;
    else if (DRY_TERRAIN.has(terrain)) dealt -= BIOME_DRY_PENALTY;

    // The serum's melee half, where crocodilian melee actually happens.
    const serum = getSerumBonus(world, factionId);
    dealt += serum;
    if (serum > 0) taken -= 0.15;        // pain immunity: they bleed less
    else if (serum < 0) taken += 0.10;   // hallucinating: they bleed more

    return {
        dealt: Math.max(0.5, dealt),
        detonation: 0,
        taken: Math.max(0.5, taken),
    };
}

// ─── Slave Economy ──────────────────────────────────────────────────────────

/** Build-speed multiplier for infrastructure on a world worked by slaves. */
export const SLAVE_BUILD_SPEED = 1.5;

/**
 * Record a conquest. Called from the capture site on the FAST loop, not the
 * strategic tick — the worker holds one live world object, so writing straight
 * into factionTraits from there is correct and needs no latch.
 * A no-op for every faction but the Sarrak.
 */
export function recordConquest(
    world: GameWorldState,
    conquerorId: string,
    planetId: string,
    previousOwnerId: string,
): void {
    if (!isSarrak(world, conquerorId)) return;
    const traits = world.factionTraits?.get(conquerorId);
    if (!traits) return;
    const st = traits.sarrak ?? (traits.sarrak = emptySarrakTraitState());
    if (!st.slaveWorlds) st.slaveWorlds = {};
    if (st.slaveWorlds[planetId]) return;

    st.slaveWorlds[planetId] = {
        conqueredAtSeconds: world.nowSeconds ?? 0,
        previousOwnerId,
    };
    bumpMetric(world as any, conquerorId, CONQUEST_METRIC, 1);
}

/** Is this world worked as a slave colony by its current owner? */
export function isSlaveWorld(world: GameWorldState, factionId: string, planetId: string): boolean {
    if (!isSarrak(world, factionId)) return false;
    return !!stateOf(world, factionId)?.slaveWorlds?.[planetId];
}

/** Infrastructure build-speed multiplier for one planet. 1 for everyone else. */
export function infrastructureSpeedFor(world: GameWorldState, factionId: string, planetId: string): number {
    return isSlaveWorld(world, factionId, planetId) ? SLAVE_BUILD_SPEED : 1;
}

/** Unrest added per tick per lane-hop of distance from the homeworld. */
export const SLAVE_UNREST_PER_HOP = 0.35;
/** Ceiling on the per-tick unrest a single slave world accrues. */
export const SLAVE_UNREST_MAX = 6;
/** Defiance pressure added alongside it. */
export const SLAVE_DEFIANCE_PER_HOP = 0.20;

// ─── The tick ───────────────────────────────────────────────────────────────

/**
 * One strategic tick of Sarrak business.
 *
 * Runs at step 9e2 — upstream of tickCohesion, tickDefiance, tickSecession and
 * tickCivilWar, so unrest written here is aggregated and acted on in the same
 * tick rather than 24 real minutes later.
 */
export function tickSarrak(world: GameWorldState, traits: FactionTraitState): void {
    const factionId = traits.factionId;
    if (!isSarrak(world, factionId)) return;

    const st: SarrakTraitState = traits.sarrak ?? (traits.sarrak = emptySarrakTraitState());
    if (!st.slaveWorlds) st.slaveWorlds = {};
    const now = world.nowSeconds ?? 0;

    // Clock-jump guard. The worker round-trips nowSeconds, but /api/tick can
    // drive runStrategicTick with wall-clock time against a world whose clock is
    // elsewhere. Resynchronise silently rather than firing a crash we did not
    // simulate.
    const delta = now - st.lastEvaluatedSeconds;
    if (st.lastEvaluatedSeconds > 0 && (delta < 0 || delta > 10 * TICK_SECONDS)) {
        st.lastEvaluatedSeconds = now;
        st.lastResolvedEpisode = st.dosesTaken;
        return;
    }
    st.lastEvaluatedSeconds = now;

    // ── Withdrawal onset: one shot per dose ─────────────────────────────────
    // "Serum withdrawal destabilises veterans." The write goes to
    // planet.stability, never government.stability — updateEmpireCohesion
    // recomputes that wholesale from the planet mean in this same tick.
    if (isWithdrawing(world, factionId) && st.lastResolvedEpisode !== st.dosesTaken) {
        st.lastResolvedEpisode = st.dosesTaken;
        let worlds = 0;
        for (const planet of world.construction?.planets?.values() ?? []) {
            if ((planet as any).ownerId !== factionId) continue;
            const p = planet as any;
            p.stability = Math.max(0, (p.stability ?? 60) - WITHDRAWAL_UNREST);
            worlds += 1;
        }
        console.warn(`[Sarrak] The serum ebbs — ${worlds} world(s) shake off ${WITHDRAWAL_UNREST} stability.`);
    }

    // ── Slave colonies: unrest scaled by distance from Gor'Zhul ─────────────
    const slaveIds = Object.keys(st.slaveWorlds);
    if (!slaveIds.length) return;

    // Computed once per tick, not per world.
    const { distances } = distancesFromCapital(world, factionId);

    for (const planetId of slaveIds) {
        const planet: any = world.construction?.planets?.get(planetId);
        // Lost worlds stop being our problem.
        if (!planet || planet.ownerId !== factionId) { delete st.slaveWorlds[planetId]; continue; }

        // RAW hops, deliberately uncapped. The built-in cohesion distance driver
        // saturates at 10 jumps, and the Sarrak capital sits deep enough in the
        // lane graph that reusing it would flatten this mechanic past the tenth
        // hop — the far colonies are the whole point.
        const hops = distances.get(planet.systemId) ?? 0;
        if (hops <= 0) continue;   // the homeworld's own system, or unreachable

        const unrest = Math.min(SLAVE_UNREST_MAX, hops * SLAVE_UNREST_PER_HOP);
        planet.unrest = Math.max(0, Math.min(100, (planet.unrest ?? 0) + unrest));

        // Unrest alone is absorbed: PopulationService decays it by up to 3.6 a
        // tick on a happy world, and runs AFTER this step. Defiance pressure is
        // never touched there, so the countdown keeps advancing on a colony the
        // player is propping up. That is what makes distance actually bite.
        const record: any = getPlanetCohesion(world, planetId);
        if (record) {
            record.defiancePressure = (record.defiancePressure ?? 0) + hops * SLAVE_DEFIANCE_PER_HOP;
        }
    }
}
