// lib/tech/diffusion-service.ts
// Stars of Dominion — acquiring, merging and assimilating stolen technology.
//
// The diffusion gradient is the point of this file: commodity technology that
// half the galaxy already runs is nearly free to copy, while the bleeding edge
// stays expensive. That is what lets a backward faction survive by stealing,
// buying and copying — without letting copies reach parity, because assimilated
// technology carries adaptation debt and runs at half strength until the
// workforce learns it.

import { registry, applyUnlock } from './engine';
import { TechEffectType, type PlayerTechState, type Tech } from './types';
import {
    ADAPTATION_DEBT_DECAY,
    ASSIMILATION_COST_FACTOR,
    FULL_FIDELITY,
    INITIAL_ADAPTATION_DEBT,
    LICENSED_COST_FACTOR,
    MIN_ASSIMILATION_FIDELITY,
    type DiffusionChannel,
    type TechBlueprint,
} from './diffusion-types';
import { TICK_INTERVAL_HOURS } from '../time/time-config';

interface TechBearingWorld {
    tech?: Map<string, PlayerTechState>;
}

export interface BlueprintGrant {
    techId: string;
    sourceFactionId: string | null;
    channel: DiffusionChannel;
    fidelity: number;
    tick: number;
    licensed?: boolean;
}

// ─── Acquisition ─────────────────────────────────────────────────────────────

/**
 * Record a fragment, merging with anything already held for the same tech.
 *
 * Merge is 1 - Π(1 - fᵢ) so repeated thefts show diminishing returns: five
 * 0.3-fidelity fragments reach 0.83, not certainty. Returns the merged
 * blueprint, or null if the faction already researched the tech.
 */
export function addBlueprint(state: PlayerTechState, grant: BlueprintGrant): TechBlueprint | null {
    if (!state) return null;
    if (state.unlockedTechIds?.includes(grant.techId)) return null; // nothing to learn
    if (!state.blueprints) state.blueprints = [];

    const fidelity = Math.max(0, Math.min(1, grant.fidelity));
    const existing = state.blueprints.find(b => b.techId === grant.techId);

    if (existing) {
        existing.fidelity = 1 - (1 - existing.fidelity) * (1 - fidelity);
        existing.channel = grant.channel;
        existing.acquiredAtTick = grant.tick;
        if (grant.licensed) existing.licensed = true;
        return existing;
    }

    const blueprint: TechBlueprint = {
        id: `bp-${state.factionId}-${grant.techId}-${grant.tick}`,
        techId: grant.techId,
        sourceFactionId: grant.sourceFactionId,
        channel: grant.channel,
        fidelity,
        acquiredAtTick: grant.tick,
        ...(grant.licensed ? { licensed: true } : {}),
    };
    state.blueprints.push(blueprint);
    return blueprint;
}

export function getBlueprint(state: PlayerTechState, techId: string): TechBlueprint | undefined {
    return state?.blueprints?.find(b => b.techId === techId);
}

export function findBlueprintById(state: PlayerTechState, blueprintId: string): TechBlueprint | undefined {
    return state?.blueprints?.find(b => b.id === blueprintId);
}

/** How many factions have actually researched a tech — drives the gradient. */
export function holdersOfTech(world: TechBearingWorld, techId: string): number {
    let n = 0;
    for (const state of world.tech?.values() ?? []) {
        if (state?.unlockedTechIds?.includes(techId)) n++;
    }
    return n;
}

// ─── Assimilation ────────────────────────────────────────────────────────────

/**
 * Cost multiplier against the tech's original research cost.
 *
 * Three factors: the base copy discount, a penalty for working from an
 * incomplete blueprint, and the diffusion gradient — every faction already
 * running the tech makes it 5% cheaper to copy, to a floor of 25%.
 */
export function assimilationCostMultiplier(
    world: TechBearingWorld,
    blueprint: TechBlueprint,
): number {
    const base = blueprint.licensed ? LICENSED_COST_FACTOR : ASSIMILATION_COST_FACTOR;
    const fidelityPenalty = blueprint.fidelity >= FULL_FIDELITY
        ? 1
        : FULL_FIDELITY / Math.max(blueprint.fidelity, 0.01);
    const holders = holdersOfTech(world, blueprint.techId);
    const gradient = Math.max(0.25, 1 - 0.05 * Math.max(0, holders - 1));
    return base * fidelityPenalty * gradient;
}

export function assimilationTicks(world: TechBearingWorld, blueprint: TechBlueprint, tech: Tech): number {
    const cost = tech.researchCost * assimilationCostMultiplier(world, blueprint);
    return Math.max(1, Math.ceil(cost / TICK_INTERVAL_HOURS));
}

export function canAssimilate(blueprint: TechBlueprint | undefined): { ok: boolean; reason?: string } {
    if (!blueprint) return { ok: false, reason: 'No such blueprint.' };
    if (blueprint.fidelity < MIN_ASSIMILATION_FIDELITY) {
        return {
            ok: false,
            reason: `Blueprint is too fragmentary (${Math.round(blueprint.fidelity * 100)}% — needs ${Math.round(MIN_ASSIMILATION_FIDELITY * 100)}%).`,
        };
    }
    return { ok: true };
}

// ─── Adaptation debt ─────────────────────────────────────────────────────────
//
// Copied technology runs below its rated strength until the institutions catch
// up. Rather than model coverage (which does not exist in the engine yet), debt
// is applied directly against the tech's own numeric contribution: unlock at
// full strength, immediately withhold the debted fraction, then hand it back a
// little each tick. The arithmetic is symmetric, so a tech that finishes paying
// its debt ends up exactly where a researched copy would have been.

function scaleTechModifiers(state: PlayerTechState, tech: Tech, fraction: number): void {
    if (!state.globalModifiers) state.globalModifiers = {};
    for (const effect of tech.effects ?? []) {
        if (!effect.modifierKey) continue;
        const isNumeric = effect.type === TechEffectType.MODIFIER_PERCENT
            || effect.type === TechEffectType.MODIFIER_FLAT;
        if (!isNumeric) continue;
        const base = effect.type === TechEffectType.MODIFIER_PERCENT ? 1.0 : 0;
        const current = state.globalModifiers[effect.modifierKey] ?? base;
        state.globalModifiers[effect.modifierKey] = current + (effect.value ?? 0) * fraction;
    }
}

/**
 * Unlock a tech acquired by copying. Applies the unlock normally, then withholds
 * the debted fraction of its numeric effects and consumes the blueprint.
 */
export function assimilateBlueprint(state: PlayerTechState, techId: string): void {
    const tech = registry.get(techId);
    if (!tech) return;

    applyUnlock(state, techId);

    if (!state.adaptationDebt) state.adaptationDebt = {};
    state.adaptationDebt[techId] = INITIAL_ADAPTATION_DEBT;
    scaleTechModifiers(state, tech, -INITIAL_ADAPTATION_DEBT);

    state.blueprints = (state.blueprints ?? []).filter(b => b.techId !== techId);
}

/**
 * Repay adaptation debt for one faction. Called once per tick from step4b.
 * Returns the tech ids that finished paying this tick.
 */
export function tickAdaptationDebt(state: PlayerTechState): string[] {
    const cleared: string[] = [];
    if (!state?.adaptationDebt) return cleared;

    for (const [techId, debt] of Object.entries(state.adaptationDebt)) {
        if (!(debt > 0)) { delete state.adaptationDebt[techId]; continue; }
        const tech = registry.get(techId);
        if (!tech) { delete state.adaptationDebt[techId]; continue; }

        const repaid = Math.min(ADAPTATION_DEBT_DECAY, debt);
        scaleTechModifiers(state, tech, repaid);

        const remaining = debt - repaid;
        if (remaining <= 1e-9) {
            delete state.adaptationDebt[techId];
            cleared.push(techId);
        } else {
            state.adaptationDebt[techId] = remaining;
        }
    }
    return cleared;
}

/** Current debt on a tech, 0 when fully domesticated or natively researched. */
export function getAdaptationDebt(state: PlayerTechState, techId: string): number {
    return state?.adaptationDebt?.[techId] ?? 0;
}

// ─── Channel: conquest absorption ────────────────────────────────────────────

/**
 * Taking a world takes its archives. Call with the planet's owner still set to
 * the loser — the previous owner is what makes this work.
 *
 * Yield is deliberately blunt: knowledge is a spoil of conquest, not something
 * that can be seized surgically. A wrecked planet yields less, because the
 * bombardment that softened it also burned the records.
 */
export function absorbConqueredTechnology(
    world: TechBearingWorld,
    conquerorId: string,
    previousOwnerId: string | undefined,
    planet: { stability?: number } | undefined,
    tick: number,
): string[] {
    if (!conquerorId || !previousOwnerId || conquerorId === previousOwnerId) return [];

    const conqueror = world.tech?.get(conquerorId);
    const loser = world.tech?.get(previousOwnerId);
    if (!conqueror || !loser) return [];

    const held = new Set(conqueror.unlockedTechIds ?? []);
    const spoils = (loser.unlockedTechIds ?? []).filter(id => !held.has(id));
    if (spoils.length === 0) return [];

    // A planet taken in ruins keeps fewer of its people and records.
    const stability = planet?.stability ?? 60;
    const fidelity = stability < 30 ? 0.15 : 0.3;

    for (const techId of spoils) {
        addBlueprint(conqueror, {
            techId,
            sourceFactionId: previousOwnerId,
            channel: 'conquest',
            fidelity,
            tick,
        });
    }
    return spoils;
}

// ─── Channel: deployment observation ─────────────────────────────────────────

/**
 * Passive accrual for every faction we have any intelligence presence against:
 * watching a technology work teaches a little about it, slowly, forever.
 *
 * Deliberately feeble — this is the floor that stops a backward faction from
 * being permanently frozen out, not a route to parity.
 */
export function accrueObservationFragments(
    world: TechBearingWorld & { espionage?: any },
    tick: number,
    perTick = 0.01,
): void {
    for (const [observerId, observer] of world.tech ?? []) {
        const intel = world.espionage?.factionIntel?.get?.(observerId);
        const levels: Record<string, number> = intel?.infiltrationLevels ?? {};
        const held = new Set(observer.unlockedTechIds ?? []);

        for (const [targetId, infiltration] of Object.entries(levels)) {
            if (!(infiltration > 0) || targetId === observerId) continue;
            const target = world.tech?.get(targetId);
            if (!target) continue;

            for (const techId of target.unlockedTechIds ?? []) {
                if (held.has(techId)) continue;
                addBlueprint(observer, {
                    techId,
                    sourceFactionId: targetId,
                    channel: 'observation',
                    fidelity: perTick * (infiltration / 100),
                    tick,
                });
            }
        }
    }
}
