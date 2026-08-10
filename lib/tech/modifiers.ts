// lib/tech/modifiers.ts
// Stars of Dominion — the numeric half of technology.
//
// A tech's MODIFIER_PERCENT / MODIFIER_FLAT effects accumulate into
// PlayerTechState.globalModifiers. Until now exactly four keys were ever read
// (the eco_* family, in economy-service), so every other authored modifier was
// inert. This module is the generic accessor plus the registry of keys that
// actually have a consumer.
//
// ── Semantics ────────────────────────────────────────────────────────────────
// TechEngine.applyEffect seeds a MODIFIER_PERCENT key at 1.0 and adds to it, and
// a MODIFIER_FLAT key at 0 and adds to it. A key must therefore be authored with
// one effect type consistently, which is what `kind` below records:
//
//   'mult' — baseline 1.0, author with MODIFIER_PERCENT, consumer multiplies by it
//   'add'  — baseline 0,   author with MODIFIER_FLAT,    consumer adds it in
//
// Getting this backwards is silent and nasty: a 'mult' key authored as FLAT
// starts at 0 and zeroes whatever it scales. validateTechModifierKeys() catches
// exactly that, along with keys nothing consumes.

import type { PlayerTechState } from './types';
import { TechEffectType } from './types';
import { registry } from './engine';
import './techData'; // ensure the trees are registered before any validation walk

interface TechBearingWorld {
    tech?: Map<string, PlayerTechState> | { get?: (id: string) => PlayerTechState | undefined };
}

export type ModifierKind = 'mult' | 'add';

export interface ModifierSpec {
    kind: ModifierKind;
    /** Where the value is read. Kept honest — a key with no consumer is a bug. */
    consumer: string;
    description: string;
}

/**
 * Every modifier key with a live consumer.
 *
 * Combat keys deliberately reuse the names combat-engine already reads
 * (`combat-engine.ts:93-97`) rather than introducing a parallel vocabulary and a
 * translation layer between them.
 */
export const MODIFIER_REGISTRY: Record<string, ModifierSpec> = {
    // ── Economy (pre-existing, economy-service.ts:117) ──────────────────────
    eco_production_mult: { kind: 'mult', consumer: 'economy-service getFactionEconomyMods', description: 'Raw resource extraction.' },
    eco_manufacturing_mult: { kind: 'mult', consumer: 'economy-service getFactionEconomyMods', description: 'Manufactured goods output.' },
    eco_tax_mult: { kind: 'mult', consumer: 'economy-service getFactionEconomyMods', description: 'Tax revenue.' },
    eco_upkeep_mult: { kind: 'mult', consumer: 'economy-service getFactionEconomyMods', description: 'Service upkeep cost (author negatives to reduce).' },

    // ── Combat (combat-engine reads these off CombatantState.techModifiers) ──
    combat_power_multiplier: { kind: 'add', consumer: 'combat-engine calculatePower', description: 'Added to the power multiplier in every layer. 0.15 = +15% combat power.' },
    orbital_power_multiplier: { kind: 'add', consumer: 'combat-engine calculatePower (orbital layer)', description: 'Added to the power multiplier in orbital combat only.' },
    ground_power_multiplier: { kind: 'add', consumer: 'combat-engine calculatePower (ground layer)', description: 'Added to the power multiplier in ground combat only.' },
    prediction_bonus_add: { kind: 'add', consumer: 'combat-manager createCombatant', description: 'Added to the 0.15 base stance-prediction bonus before it reaches the engine.' },
    mil_repair_rate_mult: { kind: 'mult', consumer: 'tick-processor step14_empireFleetRepair', description: 'Fleet repair per tick at a friendly system.' },

    // ── Espionage ───────────────────────────────────────────────────────────
    esp_op_success_add: { kind: 'add', consumer: 'espionage-service computeCatalogSuccessChance', description: 'Added to operation success chance (0.05 = +5 points).' },
    esp_exposure_mult: { kind: 'mult', consumer: 'espionage-service computeCatalogExposureChance', description: "Scales the actor's own exposure chance. Author negatives to run quieter." },
    esp_counter_exposure_add: { kind: 'add', consumer: 'espionage-service computeCatalogExposureChance', description: 'Added to the exposure chance of ops run against this faction.' },

    // ── Logistics / construction ────────────────────────────────────────────
    construction_speed: { kind: 'mult', consumer: 'construction-service getFactionBuildSpeed', description: 'Building construction and repair speed. Seeded at 1.0 by initPlayerState.' },
    research_speed: { kind: 'mult', consumer: 'TechEngine.tickResearch', description: 'Research throughput. Seeded at 1.0 by initPlayerState.' },
};

/** Baseline for a key, from its kind. */
function baselineFor(key: string, fallback?: number): number {
    if (fallback !== undefined) return fallback;
    const spec = MODIFIER_REGISTRY[key];
    if (!spec) return 1;
    return spec.kind === 'mult' ? 1 : 0;
}

/** The whole modifier record for a faction (empty when it has no tech state). */
export function getTechModifiers(world: TechBearingWorld | undefined | null, factionId: string): Record<string, number> {
    return (world?.tech?.get?.(factionId)?.globalModifiers ?? {}) as Record<string, number>;
}

/**
 * Read one modifier. Unset keys return the registry baseline — 1 for a 'mult'
 * key, 0 for an 'add' key — so a consumer can use the result unconditionally.
 */
export function getTechModifier(
    world: TechBearingWorld | undefined | null,
    factionId: string,
    key: string,
    fallback?: number,
): number {
    const value = getTechModifiers(world, factionId)[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : baselineFor(key, fallback);
}

export interface ModifierAudit {
    /** Keys authored on techs that no system reads. */
    unconsumed: { techId: string; key: string }[];
    /** Keys authored with an effect type that contradicts their registered kind. */
    wrongKind: { techId: string; key: string; expected: ModifierKind; authoredAs: TechEffectType }[];
}

/**
 * Walk every registered tech and report modifier keys that are unconsumed or
 * authored with the wrong effect type. Call from tests and dev boot — this is
 * what stops the 165-dead-effects problem from growing back.
 */
export function validateTechModifierKeys(): ModifierAudit {
    const audit: ModifierAudit = { unconsumed: [], wrongKind: [] };

    for (const tech of registry.getAll()) {
        for (const effect of tech.effects ?? []) {
            const isPercent = effect.type === TechEffectType.MODIFIER_PERCENT;
            const isFlat = effect.type === TechEffectType.MODIFIER_FLAT;
            if (!isPercent && !isFlat) continue; // unlock effects carry no numeric key
            if (!effect.modifierKey) continue;

            const spec = MODIFIER_REGISTRY[effect.modifierKey];
            if (!spec) {
                audit.unconsumed.push({ techId: tech.id, key: effect.modifierKey });
                continue;
            }
            const authoredKind: ModifierKind = isPercent ? 'mult' : 'add';
            if (authoredKind !== spec.kind) {
                audit.wrongKind.push({
                    techId: tech.id,
                    key: effect.modifierKey,
                    expected: spec.kind,
                    authoredAs: effect.type as TechEffectType,
                });
            }
        }
    }

    return audit;
}
