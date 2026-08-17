// lib/factions/kaerruun.ts
// Kaer'Ruun of Rrriiaa — the Bloodmoon Ceasefire and Ritual Brutality.
//
// From the player design: "Once every century, the entire species enters a
// ten-year sacred hiatus — a holiday in which no wars are fought, no hunts are
// allowed", and "Ritual Brutality: kills increase damage dealt in future battles
// (stacking buff)".
//
// ── The fiction/mechanics gap, stated rather than fudged ─────────────────────
// A strategic tick is 6 sim-hours (TICK_DELTA_SECONDS in tick-processor). Taken
// literally, "once a century" is ~146,000 ticks — a cycle no player would ever
// witness. So the century is compressed to one Bloodmoon per season-length arc,
// and "ten years" to ten strategic ticks, which is what the design's "10-turn
// ceasefire" actually asks for. Both are constants below; change them here.

import type { GameWorldState } from '../game-world-state';
import type { FactionTraitState, KaerruunTraitState } from './faction-traits-types';
import { emptyKaerruunTraitState } from './faction-traits-types';
import { isAtWar } from '../diplomacy/offer-service';
import { bumpMetric, getMetric } from '../tech/history-ledger';

/** The civilization this module belongs to. Factions are matched on this. */
export const KAERRUUN_CIV_ID = 'civ-kaerruun';

/** One strategic tick, in sim-seconds. Mirrors tick-processor's own constant. */
const TICK_SECONDS = 6 * 60 * 60;

/**
 * Bloodmoon period. 120 ticks = 30 sim-days, matching the season length — so the
 * ceasefire lands about once a season rather than once a civilization.
 */
export const BLOODMOON_CYCLE_SECONDS = 120 * TICK_SECONDS;

/** The hiatus itself: the design's ten turns, i.e. ten strategic ticks. */
export const BLOODMOON_CEASEFIRE_SECONDS = 10 * TICK_SECONDS;

/** Stability removed from every Kaer'Ruun world when the rite opens on a war. */
export const BLOODMOON_UNREST = 25;

/** Ritual Brutality: the ceiling a fully-blooded host can reach. */
export const BRUTALITY_MAX = 0.30;
/** Kills at which roughly 63% of BRUTALITY_MAX is reached. */
export const BRUTALITY_SCALE = 40;

export const TROPHY_METRIC = 'kaer.trophyKills';
export const VIOLATION_METRIC = 'kaer.bloodmoonViolations';

/** True when this faction is one of the Kaer'Ruun. */
export function isKaerruun(world: GameWorldState, factionId: string): boolean {
    const faction = world?.economy?.factions?.get?.(factionId) as { civilizationId?: string } | undefined;
    return faction?.civilizationId === KAERRUUN_CIV_ID;
}

/** Which Bloodmoon cycle `nowSeconds` falls in. */
export function bloodmoonCycleIndex(nowSeconds: number): number {
    return Math.floor(nowSeconds / BLOODMOON_CYCLE_SECONDS);
}

/**
 * Is the hiatus open right now?
 *
 * Derived from the clock by modulo rather than stored, so it is correct after a
 * worker restart, after a snapshot reload, and for any faction the caller asks
 * about — there is no counter to drift.
 */
export function isInBloodmoonCeasefire(world: GameWorldState, factionId: string): boolean {
    if (!isKaerruun(world, factionId)) return false;
    const phase = (world.nowSeconds ?? 0) % BLOODMOON_CYCLE_SECONDS;
    return phase < BLOODMOON_CEASEFIRE_SECONDS;
}

/** Sim-seconds until the current hiatus lifts; 0 when none is open. */
export function bloodmoonSecondsRemaining(world: GameWorldState, factionId: string): number {
    if (!isInBloodmoonCeasefire(world, factionId)) return 0;
    return BLOODMOON_CEASEFIRE_SECONDS - ((world.nowSeconds ?? 0) % BLOODMOON_CYCLE_SECONDS);
}

/**
 * Acts of war the rite forbids.
 *
 * An explicit opt-in list, because ACTION_DEFINITIONS[id].category cannot serve:
 * 'military' covers MIL_MOVE_FLEET as happily as MIL_ATTACK_FLEET, and a
 * ceasefire that grounds a faction's transports is a bug, not a rite.
 */
export const BLOODMOON_FORBIDDEN_ACTIONS: Record<string, string> = {
    // Kinetic
    MIL_ATTACK_FLEET: 'open fire',
    MIL_TACTICAL_ENGAGE: 'force an engagement',
    MIL_INVASION_PLANET: 'launch an invasion',
    MIL_BOMBARD_PLANET: 'bombard a world',
    AIR_LAUNCH_SORTIE: 'fly a sortie',
    POW_DISPOSE: 'dispose of prisoners',
    // Espionage-offensive
    ESP_LAUNCH_OP: 'run an operation',
    ESP_INFILTRATE_NETWORK: 'infiltrate a network',
    ESP_SABOTAGE_FACILITY: 'sabotage a facility',
    ESP_STEAL_TECHNOLOGY: 'steal technology',
    ESP_INCITE_UNREST: 'incite unrest',
    // Diplomatic coercion
    DIP_DECLARE_WAR: 'declare war',
    DIP_LAUNCH_GAMBIT: 'launch a gambit',
    DIP_IMPOSE_SANCTIONS: 'impose sanctions',
    DIP_DEMAND_TRIBUTE: 'demand tribute',
    // Proxy war
    PIR_SPONSOR_ORG: 'sponsor a band',
    PIR_ISSUE_MARQUE: 'issue letters of marque',
    PIR_ASSIGN_RAID: 'order a raid',
};

export interface GateResult {
    allowed: boolean;
    reason?: string;
}

/**
 * The order gate. Mirrors checkOrderTechGate's shape so it can sit beside it in
 * executeOrder's chain.
 */
export function checkCeasefireGate(world: GameWorldState, factionId: string, actionId: string): GateResult {
    const verb = BLOODMOON_FORBIDDEN_ACTIONS[actionId];
    if (!verb) return { allowed: true };
    if (!isInBloodmoonCeasefire(world, factionId)) return { allowed: true };

    const ticks = Math.ceil(bloodmoonSecondsRemaining(world, factionId) / TICK_SECONDS);
    return {
        allowed: false,
        reason: `The Bloodmoon is observed — no Kaer'Ruun may ${verb} for another ${ticks} turn(s).`,
    };
}

/**
 * Ritual Brutality, as a multiplier to apply POST-clamp.
 *
 * Deliberately NOT a techModifiers key. calculateEffectivePower clamps its whole
 * result to ±40% (combat-engine.ts), and civ-kaerruun's authored
 * combat_strength of 0.25 already spends most of that — routing trophies there
 * too would make the first few stacks work and every later one silently vanish.
 * The post-clamp band (stance, momentum, prediction) is the only place a bonus
 * of this kind can actually accumulate, and it is genuinely unbounded, so the
 * curve saturates instead of running away.
 */
export function getBrutalityBonus(world: GameWorldState, factionId: string): number {
    if (!isKaerruun(world, factionId)) return 0;
    const kills = getMetric(world as any, factionId, TROPHY_METRIC);
    if (!kills || kills <= 0) return 0;
    return BRUTALITY_MAX * (1 - Math.exp(-kills / BRUTALITY_SCALE));
}

/** Record a kill for the trophy count. Called from the one site that knows. */
export function recordTrophyKill(world: GameWorldState, killerFactionId: string): void {
    if (!isKaerruun(world, killerFactionId)) return;
    bumpMetric(world as any, killerFactionId, TROPHY_METRIC, 1);
}

// ─── Fear Aura ──────────────────────────────────────────────────────────────
//
// "Civilians and lesser troops may flee before battle if Kaer'Ruun forces are
// detected nearby."
//
// A POWER check, not a morale check, and that is a conscious fidelity loss. The
// engine has a morale field, a morale curve, a retreat threshold and an
// annihilation-on-broken-morale rule, and all four are dead: moraleDrift's only
// writer is called from tests, so CombatantState.morale is a hardcoded 0.5 and
// the morale multiplier is permanently 1.0. There is nothing to depress. Reviving
// that machinery would change the power calculation of every battle in the game,
// so this reads as "the strong scare off the weak" instead of "morale breaks".

/** A fleet routs only if it is this fraction of the Kaer'Ruun force, or less. */
export const FEAR_ROUT_RATIO = 0.5;
/** Base odds a qualifying fleet actually breaks. */
export const FEAR_ROUT_BASE_CHANCE = 0.35;
/** Trophies make them more frightening; this caps the added odds. */
export const FEAR_ROUT_TROPHY_BONUS = 0.35;
/** A routed fleet is left alone this long so it can actually leave. */
export const FEAR_ROUT_GRACE_SECONDS = 4 * 60 * 60;

/**
 * Would this enemy break rather than fight?
 *
 * `detected nearby` is co-location: processSectorCombats has already grouped
 * fleets by system, so being in the pairing at all IS the detection test.
 *
 * Deterministic: seeded from the pairing and a quantized clock, because this is
 * evaluated on every fast cycle (~288 per strategic tick) and an unseeded roll
 * would break replay and re-decide every five seconds.
 */
export function shouldRoutFromFear(
    world: GameWorldState,
    kaerruunFactionId: string,
    kaerruunPower: number,
    enemyFactionId: string,
    enemyPower: number,
    combatId: string,
    rng: { next(): number },
): boolean {
    if (!isKaerruun(world, kaerruunFactionId)) return false;
    if (isKaerruun(world, enemyFactionId)) return false;      // predators do not flee predators
    if (kaerruunPower <= 0 || enemyPower <= 0) return false;
    if (enemyPower > kaerruunPower * FEAR_ROUT_RATIO) return false;

    // A blooded host is more frightening than a fresh one.
    const trophyScale = getBrutalityBonus(world, kaerruunFactionId) / Math.max(BRUTALITY_MAX, 1e-9);
    const chance = FEAR_ROUT_BASE_CHANCE + FEAR_ROUT_TROPHY_BONUS * trophyScale;
    return rng.next() < chance;
}

// ─── Mercenary Contracts ────────────────────────────────────────────────────

/**
 * Settle every standing retainer for one strategic tick.
 *
 * Deliberately NOT done in step6_trade, which is where vassal tribute is
 * settled — because that loop is broken and copying it would inherit the bug:
 * `tribute.resourceType` is written lowercase 'credits' while every faction
 * reserve is keyed by the Resource enum ('CREDITS'), so `reserves['credits']`
 * is undefined on both sides, the payer is set to Math.max(0, undefined - n) = 0
 * on a phantom key, and the payee accrues a key nothing reads. world.tributes
 * has never moved a single credit.
 *
 * Contract keys are normalised to uppercase when the offer is created, and the
 * probe asserts the lowercase key stays absent.
 *
 * Failure semantics: an employer who cannot pay DEFAULTS. No debt accrues —
 * an unpayable retainer that silently compounds is how you get a mechanic
 * nobody can reason about.
 */
export function tickMercenaryContracts(world: GameWorldState, traits: FactionTraitState): void {
    const contracts = traits.kaerruun?.contracts;
    if (!contracts) return;

    const now = world.nowSeconds ?? 0;
    for (const contract of Object.values(contracts)) {
        if (contract.status !== 'active') continue;

        if (now >= contract.expiresAtSeconds) {
            contract.status = 'expired';
            console.log(`[Kaer'Ruun] Contract ${contract.id} has run its term.`);
            continue;
        }

        const employer = world.economy?.factions?.get(contract.employerFactionId);
        const contractor = world.economy?.factions?.get(contract.contractorFactionId);
        if (!employer || !contractor) {
            contract.status = 'voided';
            continue;
        }

        const key = contract.resourceKey;
        const held = (employer.reserves as Record<string, number>)[key] ?? 0;
        if (held < contract.retainerPerTick) {
            contract.status = 'defaulted';
            console.warn(
                `[Kaer'Ruun] ${contract.employerFactionId} cannot meet the retainer on ${contract.id} ` +
                `(${held} < ${contract.retainerPerTick}). The contract lapses.`
            );
            continue;
        }

        (employer.reserves as Record<string, number>)[key] = held - contract.retainerPerTick;
        const paid = (contractor.reserves as Record<string, number>)[key] ?? 0;
        (contractor.reserves as Record<string, number>)[key] = paid + contract.retainerPerTick;
        contract.paidToDate += contract.retainerPerTick;
    }
}

/** Active retainers held by this faction. */
export function activeContracts(world: GameWorldState, factionId: string) {
    const contracts = world.factionTraits?.get(factionId)?.kaerruun?.contracts ?? {};
    return Object.values(contracts).filter(c => c.status === 'active');
}

/**
 * One strategic tick of Kaer'Ruun business.
 *
 * Runs after diplomacy and war-fatigue have settled (so "at war" is accurate)
 * and before cohesion, defiance and secession read planet stability (so the
 * consequences of a violated rite land in the same tick rather than 24 real
 * minutes later).
 */
export function tickKaerruun(world: GameWorldState, traits: FactionTraitState): void {
    const factionId = traits.factionId;
    if (!isKaerruun(world, factionId)) return;

    const state: KaerruunTraitState = traits.kaerruun ?? (traits.kaerruun = emptyKaerruunTraitState());
    if (!state.contracts) state.contracts = {};   // back-fill for pre-contract snapshots

    // Retainers settle every tick regardless of the rite — being paid to stand
    // ready is not an act of war.
    tickMercenaryContracts(world, traits);

    const now = world.nowSeconds ?? 0;
    const cycle = bloodmoonCycleIndex(now);

    // Clock-jump guard. The worker round-trips nowSeconds so the delta is one
    // tick, but /api/tick can drive runStrategicTick with real wall-clock time
    // against a world whose clock is elsewhere. Resynchronise silently rather
    // than firing an onset — or skipping one — on a jump we did not simulate.
    const delta = now - state.lastEvaluatedSeconds;
    if (state.lastEvaluatedSeconds > 0 && (delta < 0 || delta > 10 * TICK_SECONDS)) {
        state.lastEvaluatedSeconds = now;
        state.lastResolvedCycle = cycle;
        return;
    }
    state.lastEvaluatedSeconds = now;

    const inCeasefire = isInBloodmoonCeasefire(world, factionId);

    // The rite lifts.
    if (!inCeasefire) {
        state.inViolation = false;
        return;
    }

    // Onset fires once per cycle, not on each of the ~40 ticks inside the window.
    if (cycle === state.lastResolvedCycle) return;
    state.lastResolvedCycle = cycle;

    const atWar = [...world.economy.factions.keys()].some(
        other => other !== factionId && isAtWar(world, factionId, other)
    );

    if (!atWar) {
        state.inViolation = false;
        state.observed += 1;
        console.log(`[Kaer'Ruun] Bloodmoon ${cycle} opens on a clean hunt — the rite is observed.`);
        return;
    }

    // Caught mid-war when the rite opened. The design's "massive unrest or divine
    // punishment": every Kaer'Ruun world loses stability.
    //
    // The write goes to planet.stability, NOT government.stability — cohesion-service
    // recomputes gov.stability wholesale from the population-weighted planet mean
    // every tick, so a write there would be erased inside the same tick it was made.
    state.inViolation = true;
    state.violations += 1;
    bumpMetric(world as any, factionId, VIOLATION_METRIC, 1);

    let worlds = 0;
    for (const planet of world.construction?.planets?.values() ?? []) {
        if ((planet as any).ownerId !== factionId) continue;
        const p = planet as any;
        p.stability = Math.max(0, (p.stability ?? 60) - BLOODMOON_UNREST);
        worlds += 1;
    }

    console.warn(
        `[Kaer'Ruun] Bloodmoon ${cycle} opened while at war — Rraal-Tan is not appeased. ` +
        `${worlds} world(s) lose ${BLOODMOON_UNREST} stability.`
    );
}
