// ===== file: lib/press-system/propagation.ts =====
import {
    PlanetState,
    PublishedStory,
    EmpireState
} from './types';
import { PressConfig } from './config';
import { clamp } from './utils';

/** True while anyone, anywhere, is still talking about this publication. */
export function isCirculating(published: PublishedStory): boolean {
    for (const intensity of published.transmissionMap.values()) {
        if (intensity >= PressConfig.propagation.deadIntensity) return true;
    }
    return false;
}

/**
 * Calculates news contagion spread across the planetary network.
 * Stories flow from their epicenter to adjacent systems.
 *
 * A story always dies. Everywhere it has reached, it fades by a few percent a
 * tick; and it reaches a neighbouring system at most `hopAttenuation` as loud
 * as the system it came from, so it is loudest at its epicenter and quieter
 * with every hop. The original model ADDED a share of each world's intensity
 * to every neighbour each tick, and neighbours added it straight back: on any
 * two adjacent worlds that outgrew the decay by half again per tick, so a story
 * saturated every connected audience at full intensity and stayed there for
 * ever.
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
    const { hopAttenuation, deadIntensity } = PressConfig.propagation;
    const nextMap = new Map<string, number>();

    // Natural decay applies everywhere, including planets that can't spread the
    // story onward — otherwise a quarantine froze local intensity at its peak
    // forever and the damage never wore off. Higher viralFactor must decay
    // SLOWER (the original formula subtracted it from the rate, so the most
    // viral stories died the fastest).
    const decayRate = clamp(0.96 + (published.viralFactor * 0.02), 0, 0.995);
    for (const [planetId, intensity] of published.transmissionMap.entries()) {
        const faded = clamp(intensity * decayRate, 0, 100);
        // Once it is no longer worth repeating it is gone, not frozen at a
        // whisper that warms the empire a little for the rest of the season.
        nextMap.set(planetId, faded < deadIntensity ? 0 : faded);
    }

    // Spread from each currently "infected" planet
    for (const [planetId, intensity] of published.transmissionMap.entries()) {
        if (intensity < deadIntensity) continue;
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

            // How loud it can get next door, and how fast it gets there: base
            // 15% of the gap per hour, curbed by stability and counter-narrative.
            const ceiling = intensity * hopAttenuation * (1 - resistance);
            const have = nextMap.get(neighborPlanetId) || 0;
            if (ceiling <= have) continue;

            const transmissionRate = 0.15 * (1 - neighborPlanet.stability / 200) * (1 - resistance);
            const reached = have + (ceiling - have) * Math.min(1, transmissionRate * dt);
            nextMap.set(neighborPlanetId, clamp(reached, 0, 100));
        }
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
 *
 * Two rules keep the rollup a measure of how loud the news is, not of how many
 * outlets and how many worlds there are:
 *
 *   - one story is one story. Every state outlet in the galaxy repeats bad news
 *     about a rival, so in a galaxy of fourteen empires a single story arrived
 *     fifteen times over. On any world a story is as loud as its loudest outlet
 *     there, however many others carry it.
 *   - an empire's pressure is the AVERAGE over its audiences, not the sum. A
 *     story gripping one world of ten is a tenth of the problem of a story
 *     gripping all of them — and summing made every large empire a permanent
 *     crisis simply for being large.
 */
export function propagateEffects(
    tick: number,
    publishedStories: PublishedStory[],
    planets: Map<string, PlanetState>,
    empires: Map<string, EmpireState>
): { planetUpdates: Map<string, Partial<PlanetState>>; empirePressure: Map<string, number> } {
    const planetUpdates = new Map<string, Partial<PlanetState>>();
    const heatByEmpire = new Map<string, number>();
    const audiences = new Map<string, number>();

    for (const [id, planet] of planets.entries()) {
        if (planet.ownerId) audiences.set(planet.ownerId, (audiences.get(planet.ownerId) ?? 0) + 1);

        // Effect scales with intensity (0-100) and viralFactor, per STORY.
        const loudest = new Map<string, number>();
        for (const pub of publishedStories) {
            const intensity = pub.transmissionMap.get(id) || 0;
            if (intensity === 0) continue;
            const impact = (intensity / 100) * pub.viralFactor;
            if (impact > (loudest.get(pub.storyId) ?? 0)) loudest.set(pub.storyId, impact);
        }

        let localHeat = 0;
        for (const impact of loudest.values()) localHeat += impact;
        if (localHeat === 0) continue;

        // Max impact: -5 stability and +3 radicalization per high-intensity story
        planetUpdates.set(id, {
            stability: clamp(planet.stability - localHeat * 5, 0, 100),
            radicalization: clamp(planet.radicalization + localHeat * 3, 0, 100)
        });

        if (planet.ownerId) {
            heatByEmpire.set(planet.ownerId, (heatByEmpire.get(planet.ownerId) ?? 0) + localHeat);
        }
    }

    // Scale so a single loud story is a nudge, not an instant crisis.
    const { heatToPressure, maxHeatPerTick } = PressConfig.pressure;
    const empirePressure = new Map<string, number>();
    for (const [empireId, raw] of heatByEmpire.entries()) {
        const mean = raw / Math.max(1, audiences.get(empireId) ?? 1);
        empirePressure.set(empireId, Math.min(maxHeatPerTick, mean * heatToPressure));
    }

    return { planetUpdates, empirePressure };
}
