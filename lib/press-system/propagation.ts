// ===== file: lib/press-system/propagation.ts =====
import {
    PlanetState,
    PublishedStory,
    EmpireState
} from './types';
import { clamp } from './utils';

/**
 * Calculates news contagion spread across the planetary network.
 * Stories flow from their epicenter to adjacent systems.
 */
export function calculateViralSpread(
    published: PublishedStory,
    planets: Map<string, PlanetState>,
    adj: Map<string, string[]>, // SystemID -> Neighbors (SystemIDs)
    quarantinedPlanets: Set<string>,
    globalJammedSystems: Set<string>,
    counterNarratives: Map<string, number>,
    dt: number = 1
): Map<string, number> {
    const nextMap = new Map(published.transmissionMap);
    
    // Natural decay applies everywhere, including planets that can't spread the
    // story onward — otherwise a quarantine froze local intensity at its peak
    // forever and the damage never wore off.
    const decay = (planetId: string, intensity: number) => {
        // Higher viralFactor must decay SLOWER. The original formula subtracted
        // it from the rate, so the most viral stories died the fastest.
        const decayRate = clamp(0.96 + (published.viralFactor * 0.02), 0, 0.995);
        nextMap.set(planetId, clamp(intensity * decayRate, 0, 100));
    };

    // Spread from each currently "infected" planet
    for (const [planetId, intensity] of published.transmissionMap.entries()) {
        if (intensity < 2) continue; // Lowered threshold for "dying" news
        if (quarantinedPlanets.has(planetId)) { decay(planetId, intensity); continue; } // Can't spread OUT of quarantine

        const planet = planets.get(planetId);
        if (!planet) continue;

        const sysId = planet.id.replace('planet_', '');
        const neighbors = adj.get(sysId) || [];

        for (const neighborSysId of neighbors) {
            const neighborPlanetId = `planet_${neighborSysId}`;
            if (published.jammedSystems.has(neighborSysId)) continue;
            if (globalJammedSystems.has(neighborSysId)) continue;

            const neighborPlanet = planets.get(neighborPlanetId);
            if (!neighborPlanet) continue;

            // Resistance from Counter-Narratives (0-100)
            const resistance = (counterNarratives.get(neighborSysId) || 0) / 100;

            // Transmission Rate: Base 15% per tick, inhibited by stability AND counter-narratives
            // Stability has a softer curb, counter-narrative is a direct multiplier
            const transmissionRate = 0.15 * (1 - neighborPlanet.stability / 200) * (1 - resistance);
            const inflow = intensity * transmissionRate * dt;
            
            const currentIntensity = nextMap.get(neighborPlanetId) || 0;
            nextMap.set(neighborPlanetId, clamp(currentIntensity + inflow, 0, 100));
        }

        decay(planetId, intensity);
    }

    // Ensure epicenter stays active initially
    if (published.transmissionMap.size === 0 && published.originPlanetId) {
        nextMap.set(published.originPlanetId, 100);
    }

    return nextMap;
}

/**
 * Propagates effects of published stories to planets based on local viral intensity.
 *
 * Also rolls the same intensity up into per-empire information pressure. Without
 * that rollup nothing in the simulation ever RAISED pressure — it was only ever
 * decayed — so the organic story → pressure → crisis chain could never fire and
 * crises only appeared via investigations and foreign campaigns.
 */
export function propagateEffects(
    tick: number,
    publishedStories: PublishedStory[],
    planets: Map<string, PlanetState>,
    empires: Map<string, EmpireState>
): { planetUpdates: Map<string, Partial<PlanetState>>; empirePressure: Map<string, number> } {
    const planetUpdates = new Map<string, Partial<PlanetState>>();
    const empirePressure = new Map<string, number>();

    for (const [id, planet] of planets.entries()) {
        let deltaStability = 0;
        let deltaRadicalization = 0;
        let localHeat = 0;

        for (const pub of publishedStories) {
            const intensity = pub.transmissionMap.get(id) || 0;
            if (intensity === 0) continue;

            // Effect scales with intensity (0-100) and viralFactor
            // Max impact: -5 stability and +3 radicalization per high-intensity story
            const baseImpact = (intensity / 100) * pub.viralFactor;

            deltaStability -= baseImpact * 5;
            deltaRadicalization += baseImpact * 3;
            localHeat += baseImpact;
        }

        if (deltaStability !== 0 || deltaRadicalization !== 0) {
            planetUpdates.set(id, {
                stability: clamp(planet.stability + deltaStability, 0, 100),
                radicalization: clamp(planet.radicalization + deltaRadicalization, 0, 100)
            });
        }

        if (localHeat > 0 && planet.ownerId) {
            empirePressure.set(planet.ownerId, (empirePressure.get(planet.ownerId) ?? 0) + localHeat);
        }
    }

    // Scale so a single loud story across a few worlds is a nudge, not an instant crisis.
    for (const [empireId, raw] of empirePressure.entries()) {
        empirePressure.set(empireId, Math.min(8, raw * 1.5));
    }

    return { planetUpdates, empirePressure };
}
