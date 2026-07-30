// lib/specialization/specialization-service.ts
// Phase 5 — Declaring, qualifying for, and applying planet specializations.
//
// The old behaviour inferred a specialization from building counts and wrote it
// onto the planet as a side effect of recomputing stats. That is now a hint
// function only: `suggestSpecialization` tells the UI and the AI what a world
// looks like, and nothing but an explicit order changes what it *is*.

import type { Planet as ConstructionPlanet } from '../construction/construction-types';
import type { GameWorldState } from '../game-world-state';
import { BUILDINGS } from '../../data/buildings';
import { SPECIALIZATION_BY_ID, SPECIALIZATIONS } from '../../data/specializations';
import { computeOrbitalRatings } from '../orbital/orbital-service';
import {
    TRANSITION_SECONDS,
    SWITCH_LOCKOUT_SECONDS,
    SWITCH_COST_MULTIPLIER,
} from './specialization-types';
import type {
    SpecializationId,
    SpecializationDefinition,
} from './specialization-types';

// Effect reading lives in specialization-effects.ts so the systems a
// specialization modifies can import it without depending on this module's
// orbital lookups. Re-exported here so callers have one obvious entry point.
export {
    isRetooling,
    computeSpecializationEffects,
    specializationMultiplier,
} from './specialization-effects';

// ─── Building census ──────────────────────────────────────────────────────────

interface BuildingCensus {
    total: number;
    byCategory: Record<string, number>;
    byTag: Record<string, number>;
}

/** Count a planet's active buildings by category and tag. */
export function censusBuildings(planet: ConstructionPlanet): BuildingCensus {
    const census: BuildingCensus = { total: 0, byCategory: {}, byTag: {} };

    for (const tile of planet.tiles) {
        if (tile.constructionState !== 'active' || !tile.buildingId) continue;
        const def = BUILDINGS.find(b => b.id === tile.buildingId);
        if (!def) continue;

        census.total++;
        census.byCategory[def.category] = (census.byCategory[def.category] ?? 0) + 1;
        for (const tag of def.tags ?? []) {
            census.byTag[tag] = (census.byTag[tag] ?? 0) + 1;
        }
    }

    return census;
}

// ─── Qualification ────────────────────────────────────────────────────────────

export interface QualificationResult {
    qualified: boolean;
    /** Human-readable list of everything still missing. */
    missing: string[];
}

/** Does this world meet a specialization's requirements right now? */
export function checkQualification(
    planet: ConstructionPlanet,
    specializationId: SpecializationId | string
): QualificationResult {
    const def = SPECIALIZATION_BY_ID[specializationId];
    if (!def) return { qualified: false, missing: ['Unknown specialization'] };

    const missing: string[] = [];
    const req = def.requirements;
    const census = censusBuildings(planet);

    if (req.infrastructureLevel && (planet.infrastructureLevel ?? 1) < req.infrastructureLevel) {
        missing.push(`Infrastructure level ${req.infrastructureLevel} (have ${planet.infrastructureLevel ?? 1})`);
    }

    if (req.totalBuildings && census.total < req.totalBuildings) {
        missing.push(`${req.totalBuildings} active buildings (have ${census.total})`);
    }

    for (const [category, needed] of Object.entries(req.buildingsByCategory ?? {})) {
        const have = census.byCategory[category] ?? 0;
        if (have < (needed ?? 0)) {
            missing.push(`${needed} ${category} buildings (have ${have})`);
        }
    }

    for (const [tag, needed] of Object.entries(req.buildingsByTag ?? {})) {
        const have = census.byTag[tag] ?? 0;
        if (have < (needed ?? 0)) {
            missing.push(`${needed} ${tag} buildings (have ${have})`);
        }
    }

    if (req.requiresOrbitalStation || req.orbitalShipyardTier) {
        const orbital = computeOrbitalRatings(planet);
        if (req.requiresOrbitalStation && !orbital.hasStation) {
            missing.push('An operational space station in orbit');
        }
        if (req.orbitalShipyardTier && orbital.shipyardTier < req.orbitalShipyardTier) {
            missing.push(`Orbital shipyard tier ${req.orbitalShipyardTier} (have ${orbital.shipyardTier})`);
        }
    }

    return { qualified: missing.length === 0, missing };
}

/** Every specialization this world currently qualifies for. */
export function availableSpecializations(planet: ConstructionPlanet): SpecializationDefinition[] {
    return SPECIALIZATIONS.filter(s => checkQualification(planet, s.id).qualified);
}

// ─── Declaring ────────────────────────────────────────────────────────────────

export interface DeclareCheck {
    allowed: boolean;
    reason?: string;
    /** Credits the declaration will cost. Doubled when replacing an existing one. */
    cost?: number;
    isSwitch?: boolean;
}

/**
 * Can this world declare that specialization? Covers qualification, the switch
 * lockout, and empire-unique specializations.
 *
 * `world` is optional so the UI can check a single planet without one; the
 * empire-uniqueness rule is only enforced when it is supplied.
 */
export function canDeclareSpecialization(
    planet: ConstructionPlanet,
    specializationId: SpecializationId | string,
    now: number,
    world?: GameWorldState
): DeclareCheck {
    const def = SPECIALIZATION_BY_ID[specializationId];
    if (!def) return { allowed: false, reason: 'Unknown specialization' };

    const current = planet.specializationState;
    if (current?.id === def.id) {
        return { allowed: false, reason: `${planet.name} is already a ${def.name}` };
    }
    if (current && now < current.lockedUntilSeconds) {
        const hours = Math.ceil((current.lockedUntilSeconds - now) / 3600);
        return { allowed: false, reason: `Retooling too recently — locked for another ${hours}h` };
    }

    const qualification = checkQualification(planet, def.id);
    if (!qualification.qualified) {
        return { allowed: false, reason: `Requirements not met: ${qualification.missing.join('; ')}` };
    }

    if (def.uniquePerEmpire && world) {
        for (const other of world.construction.planets.values()) {
            if (other.id === planet.id) continue;
            if (other.ownerId !== planet.ownerId) continue;
            if (other.specializationState?.id === def.id) {
                return { allowed: false, reason: `${other.name} is already this empire's ${def.name}` };
            }
        }
    }

    const isSwitch = Boolean(current);
    return {
        allowed: true,
        cost: def.declareCost * (isSwitch ? SWITCH_COST_MULTIPLIER : 1),
        isSwitch,
    };
}

/**
 * Declare a specialization. Payment is the caller's job, matching every other
 * construction path in the game.
 */
export function declareSpecialization(
    planet: ConstructionPlanet,
    specializationId: SpecializationId | string,
    now: number,
    world?: GameWorldState
): { success: boolean; error?: string; cost?: number } {
    const check = canDeclareSpecialization(planet, specializationId, now, world);
    if (!check.allowed) return { success: false, error: check.reason };

    const def = SPECIALIZATION_BY_ID[specializationId]!;

    planet.specializationState = {
        id: def.id,
        declaredAtSeconds: now,
        transitionEndsAtSeconds: now + TRANSITION_SECONDS,
        lockedUntilSeconds: now + SWITCH_LOCKOUT_SECONDS,
    };
    // Keep the legacy display field in step — panels and saves read it.
    planet.specialization = def.name;

    return { success: true, cost: check.cost };
}

/**
 * Abandon a specialization. Free, but the lockout still applies, so a world
 * cannot be flipped back and forth to dodge the retooling cost.
 */
export function clearSpecialization(planet: ConstructionPlanet, now: number): boolean {
    if (!planet.specializationState) return false;
    if (now < planet.specializationState.lockedUntilSeconds) return false;
    planet.specializationState = undefined;
    planet.specialization = null;
    return true;
}

// ─── Hint for UI and AI ───────────────────────────────────────────────────────

/**
 * What this world *looks* like, based on what has been built on it. Purely
 * advisory — it never changes `planet.specialization`. This is the old
 * auto-assignment logic, demoted to a suggestion.
 */
export function suggestSpecialization(planet: ConstructionPlanet): SpecializationId | null {
    const census = censusBuildings(planet);
    const orbital = computeOrbitalRatings(planet);

    if (orbital.shipyardTier >= 2) return 'shipyard_world';
    if ((census.byCategory['research'] ?? 0) >= 3) return 'research_world';
    if ((census.byCategory['military'] ?? 0) + (census.byCategory['defense'] ?? 0) >= 3) return 'fortress_world';
    if ((census.byCategory['logistics'] ?? 0) >= 2 && orbital.hasStation) return 'trade_world';
    if ((census.byCategory['industrial'] ?? 0) >= 3) return 'forge_world';
    if ((census.byTag['food'] ?? 0) >= 2) return 'agricultural_world';
    if ((census.byTag['metals'] ?? 0) >= 2) return 'mining_world';
    if (census.total >= 6 && (census.byCategory['society'] ?? 0) >= 2) return 'capital_world';

    return null;
}
