// lib/specialization/specialization-effects.ts
// Phase 5 — Reading a declared specialization's live effects.
//
// Deliberately split from specialization-service: this module depends on nothing
// but the catalog and the planet's own state, so the systems a specialization
// modifies (orbital, storage, haulage) can import it without an import cycle.
// Qualification and declaration — which do need to inspect the orbital layer —
// live in specialization-service.

import type { Planet as ConstructionPlanet } from '../construction/construction-types';
import { SPECIALIZATION_BY_ID } from '../../data/specializations';
import {
    TRANSITION_EFFECT_SCALE,
    TRANSITION_STABILITY_PENALTY,
} from './specialization-types';
import type { SpecializationEffects, SpecializationState } from './specialization-types';

/** True while the world is still retooling into its declared specialization. */
export function isRetooling(state: SpecializationState | undefined, now: number): boolean {
    if (!state?.transitionEndsAtSeconds) return false;
    return now < state.transitionEndsAtSeconds;
}

const MULTIPLIER_KEYS: Array<keyof SpecializationEffects> = [
    'metalsOutput', 'chemicalsOutput', 'foodOutput', 'energyOutput', 'manpowerOutput',
    'researchOutput', 'constructionSpeed', 'shipProduction', 'troopRecruitment',
    'defenseStrength', 'storageCapacity', 'haulage', 'tradeThroughput', 'orbitalDefense',
];

const FLAT_KEYS: Array<keyof SpecializationEffects> = [
    'stability', 'happiness', 'espionageResistance',
];

/**
 * Effects a world's specialization is currently providing.
 *
 * Multipliers are interpolated toward 1 during retooling rather than simply
 * halved: a 1.6x bonus at 50% scale becomes 1.3x, not 0.8x. Halving the raw
 * number would turn a bonus into a penalty.
 */
export function computeSpecializationEffects(
    planet: ConstructionPlanet | undefined,
    now: number
): SpecializationEffects {
    if (!planet?.specializationState) return {};

    const def = SPECIALIZATION_BY_ID[planet.specializationState.id];
    if (!def) return {};

    const scale = isRetooling(planet.specializationState, now) ? TRANSITION_EFFECT_SCALE : 1;
    const result: SpecializationEffects = {};

    for (const key of MULTIPLIER_KEYS) {
        const value = def.effects[key];
        if (value === undefined) continue;
        result[key] = 1 + (value - 1) * scale;
    }
    for (const key of FLAT_KEYS) {
        const value = def.effects[key];
        if (value === undefined) continue;
        result[key] = value * scale;
    }

    // Retooling a world is disruptive whatever it is retooling into.
    if (scale < 1) {
        result.stability = (result.stability ?? 0) - TRANSITION_STABILITY_PENALTY;
    }

    return result;
}

/** One multiplier, defaulting to 1 when the specialization does not mention it. */
export function specializationMultiplier(
    planet: ConstructionPlanet | undefined,
    key: keyof SpecializationEffects,
    now: number
): number {
    return computeSpecializationEffects(planet, now)[key] ?? 1;
}
