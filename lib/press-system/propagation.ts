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
    
    // Spread from each currently "infected" planet
    for (const [planetId, intensity] of published.transmissionMap.entries()) {
        if (intensity < 2) continue; // Lowered threshold for "dying" news
        if (quarantinedPlanets.has(planetId)) continue; // Can't spread OUT of quarantine

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

        // Natural decay: Slower decay if viralFactor is high
        const decayRate = 0.96 - (published.viralFactor * 0.02); 
        nextMap.set(planetId, clamp(intensity * decayRate, 0, 100));
    }

    // Ensure epicenter stays active initially
    if (published.transmissionMap.size === 0 && published.originPlanetId) {
        nextMap.set(published.originPlanetId, 100);
    }

    return nextMap;
}

/**
 * Propagates effects of published stories to planets based on local viral intensity.
 */
export function propagateEffects(
    tick: number,
    publishedStories: PublishedStory[],
    planets: Map<string, PlanetState>,
    empires: Map<string, EmpireState>
): Map<string, Partial<PlanetState>> {
    const updates = new Map<string, Partial<PlanetState>>();

    for (const [id, planet] of planets.entries()) {
        let deltaStability = 0;
        let deltaRadicalization = 0;

        for (const pub of publishedStories) {
            const intensity = pub.transmissionMap.get(id) || 0;
            if (intensity === 0) continue;

            // Effect scales with intensity (0-100) and viralFactor
            // Max impact: -5 stability and +3 radicalization per high-intensity story
            const baseImpact = (intensity / 100) * pub.viralFactor;
            
            deltaStability -= baseImpact * 5;
            deltaRadicalization += baseImpact * 3;
        }

        if (deltaStability !== 0 || deltaRadicalization !== 0) {
            updates.set(id, {
                stability: clamp(planet.stability + deltaStability, 0, 100),
                radicalization: clamp(planet.radicalization + deltaRadicalization, 0, 100)
            });
        }
    }

    return updates;
}
