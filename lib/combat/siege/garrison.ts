// lib/combat/siege/garrison.ts
//
// The one shape of a planet's standing defence. Three places used to build
// it by hand — the landing handler (500 default troops), recruitment-service
// (0 troops) and nowhere at all on capture, which is how a conquered world
// kept its previous owner's garrison object. Everyone builds it here now.

import type { PlanetaryDefenseState, UnitComposition } from './siege-types';

/** What an undeveloped world fields when nobody ever raised a garrison. */
export const DEFAULT_GARRISON_TROOPS: Partial<UnitComposition> = { INFANTRY: 400, MILITIA: 100 };

export function defaultGarrison(
    planet: { id: string; stability?: number },
    ownerEmpireId: string,
    troops: Partial<UnitComposition> = {},
    fortificationLevel = 0,
): PlanetaryDefenseState {
    const unitComposition: Record<string, number> = {};
    let total = 0;
    for (const [type, n] of Object.entries(troops)) {
        const count = Math.max(0, Math.floor(Number(n) || 0));
        if (count <= 0) continue;
        unitComposition[type] = count;
        total += count;
    }
    return {
        planetId: planet.id,
        ownerEmpireId,
        garrisonTroops: total,
        unitComposition: unitComposition as UnitComposition,
        fortificationLevel,
        fortificationLayers: { orbitalSuppressed: false, outerDefenses: 100, innerDefenses: 100, commandBunkers: 100 },
        supply: 100,
        maxSupply: 100,
        morale: 100,
        maxMorale: 100,
        cohesion: 100,
        maxCohesion: 100,
        resistance: 0,
        stability: planet.stability ?? 60,
        infrastructureIntegrity: 100,
        militiaAvailable: true,
        occupationProgress: 0,
        isUnderSiege: false,
    };
}
