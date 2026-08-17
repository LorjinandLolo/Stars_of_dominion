// lib/civilization/modifiers.ts
// Stars of Dominion — the numeric half of civilizational identity.
//
// CivilizationDefinition.baseModifiers and IdeologyDefinition.modifiers were
// authored in full and read by NOTHING. The only machinery typed to consume a
// ModifierBundle is lib/modifiers/modifier-engine.ts, which has zero call sites,
// so every faction played identically no matter who they were.
//
// This module is the missing consumer. It deliberately does NOT introduce a
// third modifier pipeline: it translates the authored vocabulary into the two
// that already have live consumers, and composes into their existing accessors.
//
//   lib/tech/modifiers.ts        getTechModifier()      economy, combat,
//                                                       espionage, construction,
//                                                       research
//   lib/government/modifiers.ts  getGovernmentModifiers() approval, pop growth,
//                                                       legitimacy
//
// A civ bonus therefore lands in the same place a tech bonus does, and every
// existing consumer picks it up without being touched.
//
// ── Why a translation table instead of new keys ──────────────────────────────
// The authored key names ('trade_value', 'manpower_generation', …) were invented
// alongside the data and match no consumer anywhere. Renaming them in the data
// would churn ten civilizations and seven ideologies and still leave the older
// entries stale. Mapping them here keeps the authored files readable as design
// documents while making them mean something.
//
// Keys with no honest home are listed in UNCONSUMED_KEYS rather than quietly
// dropped — validateCivilizationModifierKeys() reports them, which is what stops
// this from silently rotting back into decoration.

import type { GameWorldState } from '../game-world-state';
import { CivilizationRegistry } from './registry';

/** The two live modifier vocabularies this module can route into. */
export type ModifierTarget = 'tech' | 'government';

export interface KeyMapping {
    target: ModifierTarget;
    /** The canonical key in that vocabulary's registry. */
    key: string;
    /**
     * Multiplied into the authored value before it is summed. Used where the
     * authored key reads in the opposite direction from its consumer — an
     * `energy_efficiency` bonus must LOWER upkeep, and `rebellion_chance` is a
     * malus whose positive value must LOWER approval.
     */
    scale?: number;
    /** Why this pairing is the honest one. */
    note?: string;
}

/**
 * Authored key -> live consumer key.
 *
 * Each authored key gets exactly ONE home. Routing `trade_value` into both the
 * tech and government vocabularies would double-count it, since economy-service
 * reads both.
 */
export const CIV_MODIFIER_MAP: Record<string, KeyMapping> = {
    // ── Economy: revenue ────────────────────────────────────────────────────
    trade_value: { target: 'tech', key: 'eco_tax_mult' },
    market_efficiency: { target: 'tech', key: 'eco_tax_mult' },
    credits_generation: { target: 'tech', key: 'eco_tax_mult' },

    // ── Economy: extraction ─────────────────────────────────────────────────
    energy_generation: { target: 'tech', key: 'eco_production_mult' },
    resource_output_final: { target: 'tech', key: 'eco_production_mult' },
    food_output: { target: 'tech', key: 'eco_production_mult' },
    metals_output: { target: 'tech', key: 'eco_production_mult' },
    planetary_efficiency: { target: 'tech', key: 'eco_production_mult' },
    salvage_efficiency: { target: 'tech', key: 'eco_production_mult' },

    // ── Economy: manufacturing and upkeep ───────────────────────────────────
    military_production_speed: { target: 'tech', key: 'eco_manufacturing_mult' },
    ammo_production: { target: 'tech', key: 'eco_manufacturing_mult' },
    energy_efficiency: {
        target: 'tech', key: 'eco_upkeep_mult', scale: -1,
        note: 'Efficiency is authored positive but must REDUCE upkeep.',
    },

    // ── Build and research throughput ───────────────────────────────────────
    construction_speed: { target: 'tech', key: 'construction_speed' },
    research_speed: { target: 'tech', key: 'research_speed' },
    relic_research_speed: { target: 'tech', key: 'research_speed' },

    // ── Combat ──────────────────────────────────────────────────────────────
    combat_strength: { target: 'tech', key: 'combat_power_multiplier' },
    military_offensive_strength: { target: 'tech', key: 'ground_power_multiplier' },
    fleet_discipline: { target: 'tech', key: 'orbital_power_multiplier' },

    // ── Espionage ───────────────────────────────────────────────────────────
    espionage_power: { target: 'tech', key: 'esp_op_success_add' },
    sabotage_efficiency: { target: 'tech', key: 'esp_op_success_add' },
    espionage_detection_evasion: {
        target: 'tech', key: 'esp_exposure_mult', scale: -1,
        note: 'Evasion is authored positive but must REDUCE the exposure roll.',
    },

    // ── Government: the population and consent half ─────────────────────────
    happiness: { target: 'government', key: 'approval' },
    stability: { target: 'government', key: 'approval' },
    rebellion_chance: {
        target: 'government', key: 'approval', scale: -1,
        note: 'A malus: a civ authored to rebel more must sit at LOWER approval.',
    },
    political_unity: { target: 'government', key: 'legitimacy_drift' },
    manpower_generation: { target: 'government', key: 'pop_growth' },
    planetary_assimilation_speed: { target: 'government', key: 'pop_growth' },
};

/**
 * Authored keys with no honest consumer today. Listed explicitly so the
 * validator can distinguish "known decorative" from "typo" — a key in neither
 * this set nor the map above is almost certainly a mistake.
 *
 * Each needs a real system before it can be mapped: there is no diplomacy trust
 * model, no leader XP curve, and no per-unit veterancy accumulator.
 */
export const UNCONSUMED_KEYS = new Set([
    'diplomatic_trust_cap',
    'diplomatic_influence',
    'treaty_trust_gain',
    'autonomy_boost',
    'leader_xp_gain',
    'unit_experience_gain',
    'manpower_upkeep',
]);

interface FactionIdentity {
    civilizationId?: string;
    ideologyId?: string;
}

function identityOf(world: GameWorldState | null | undefined, factionId: string): FactionIdentity {
    const faction = world?.economy?.factions?.get?.(factionId) as FactionIdentity | undefined;
    return {
        civilizationId: faction?.civilizationId,
        ideologyId: faction?.ideologyId,
    };
}

/**
 * The authored bundles for a faction, civilization first then ideology.
 * Missing or unknown ids simply contribute nothing — a faction whose
 * civilizationId matches no entry behaves exactly as it does today.
 */
export function getAuthoredBundles(
    world: GameWorldState | null | undefined,
    factionId: string,
): Record<string, number>[] {
    const { civilizationId, ideologyId } = identityOf(world, factionId);
    const bundles: Record<string, number>[] = [];

    const civ = civilizationId ? CivilizationRegistry.getCivilization(civilizationId) : undefined;
    if (civ?.baseModifiers) bundles.push(civ.baseModifiers as Record<string, number>);

    const ideology = ideologyId ? CivilizationRegistry.getIdeology(ideologyId) : undefined;
    if (ideology?.modifiers) bundles.push(ideology.modifiers as Record<string, number>);

    return bundles;
}

/**
 * Resolve a faction's civilization + ideology into ONE vocabulary's additive
 * deltas. `0.2` always means "+20%" / "+0.2 points" regardless of target; the
 * caller decides how to compose that with its own baseline.
 *
 * Civilization and ideology stack additively with each other, matching how
 * policies, cabinet and legacy already stack in getGovernmentModifiers.
 */
export function getCivilizationModifiers(
    world: GameWorldState | null | undefined,
    factionId: string,
    target: ModifierTarget,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const bundle of getAuthoredBundles(world, factionId)) {
        for (const [authoredKey, rawValue] of Object.entries(bundle)) {
            if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) continue;
            const mapping = CIV_MODIFIER_MAP[authoredKey];
            if (!mapping || mapping.target !== target) continue;
            out[mapping.key] = (out[mapping.key] ?? 0) + rawValue * (mapping.scale ?? 1);
        }
    }
    return out;
}

export interface CivilizationModifierAudit {
    /** Authored keys that map nowhere and are not in UNCONSUMED_KEYS. */
    unknown: { source: string; key: string }[];
    /** Authored keys knowingly without a consumer. */
    decorative: { source: string; key: string }[];
    /** Factions whose civilizationId / ideologyId resolves to no definition. */
    danglingIds: { factionId: string; field: 'civilizationId' | 'ideologyId'; value: string }[];
    /** Definitions nobody references. Not a bug — worth knowing. */
    unusedDefinitions: string[];
}

/**
 * Walk every authored bundle and every faction and report what does not line
 * up. This is the civilization-side equivalent of validateTechModifierKeys(),
 * and exists for the same reason: the failure mode in this codebase is silence,
 * not errors.
 *
 * Pass a world to also check faction id references; omit it to audit the data
 * files alone.
 */
export function validateCivilizationModifierKeys(
    world?: GameWorldState | null,
): CivilizationModifierAudit {
    const audit: CivilizationModifierAudit = {
        unknown: [], decorative: [], danglingIds: [], unusedDefinitions: [],
    };

    const inspect = (source: string, bundle: Record<string, number> | undefined) => {
        for (const key of Object.keys(bundle ?? {})) {
            if (CIV_MODIFIER_MAP[key]) continue;
            if (UNCONSUMED_KEYS.has(key)) audit.decorative.push({ source, key });
            else audit.unknown.push({ source, key });
        }
    };

    for (const civ of CivilizationRegistry.getAllCivilizations()) {
        inspect(civ.id, civ.baseModifiers as Record<string, number>);
    }
    for (const ideology of CivilizationRegistry.getAllIdeologies()) {
        inspect(ideology.id, ideology.modifiers as Record<string, number>);
    }

    const referenced = new Set<string>();
    for (const faction of world?.economy?.factions?.values?.() ?? []) {
        const { civilizationId, ideologyId } = faction as unknown as FactionIdentity;
        if (civilizationId) {
            referenced.add(civilizationId);
            if (!CivilizationRegistry.getCivilization(civilizationId)) {
                audit.danglingIds.push({ factionId: (faction as any).id, field: 'civilizationId', value: civilizationId });
            }
        }
        if (ideologyId) {
            referenced.add(ideologyId);
            if (!CivilizationRegistry.getIdeology(ideologyId)) {
                audit.danglingIds.push({ factionId: (faction as any).id, field: 'ideologyId', value: ideologyId });
            }
        }
    }

    if (world) {
        for (const civ of CivilizationRegistry.getAllCivilizations()) {
            if (!referenced.has(civ.id)) audit.unusedDefinitions.push(civ.id);
        }
        for (const ideology of CivilizationRegistry.getAllIdeologies()) {
            if (!referenced.has(ideology.id)) audit.unusedDefinitions.push(ideology.id);
        }
    }

    return audit;
}
