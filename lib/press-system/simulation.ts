// ===== file: lib/press-system/simulation.ts =====
import {
    SimulationState,
    EmpireState,
    PlanetState,
    PressFactionState,
    Story,
    PublishedStory,
    MediaCrisis,
    StorySource
} from './types';
import { generateStories, TriggerContext } from './stories';
import { processPublishing } from './publishing';
import { propagateEffects, calculateViralSpread } from './propagation';
import { checkCrises } from './crisis';
import { RNG } from './utils';

/**
 * Manually injects a story into the published pool at a specific epicenter.
 */
export function manuallyPublishStory(
    state: SimulationState,
    storyId: string,
    originPlanetId: string,
    publisherId: string = 'manual-seed'
): SimulationState {
    const story = state.activeStories.get(storyId);
    if (!story) throw new Error('Story not found in active pool');

    const pub: PublishedStory = {
        id: `pub_${Date.now()}_${storyId}`,
        storyId,
        publisherId,
        tickPublished: state.tick,
        viralFactor: story.baseMagnitude / 100, // Fixed high viral for manual seeds?
        originPlanetId,
        transmissionMap: new Map([[originPlanetId, 100]]),
        jammedSystems: new Set()
    };

    return {
        ...state,
        publishedStories: [...state.publishedStories, pub]
    };
}

/**
 * Runs one tick of the Press System simulation.
 */
export function tickPressSystem(
    state: SimulationState,
    dtHours: number,
    seed: number,
    adj: Map<string, string[]>, // Topological connectivity
    triggers: TriggerContext[] = []
): { newState: SimulationState, newCrises: MediaCrisis[] } {
    const tick = state.tick + 1;
    const rng = new RNG(seed + tick);

    // 1. Generate Stories
    const newCandidates = generateStories(tick, state.empires, rng, triggers);

    // Add to active pool
    const nextActiveStories = new Map(state.activeStories);
    newCandidates.forEach(s => nextActiveStories.set(s.id, s));

    // 2. Publish
    const candidates = Array.from(nextActiveStories.values());
    const recentlyPublished = processPublishing(tick, candidates, state.pressFactions, rng);

    // Add to history and initialize viral spread map for new stories
    const nextPublished = [...state.publishedStories];
    recentlyPublished.forEach(pub => {
        // Initialize with epicenter intensity
        const initialMap = new Map<string, number>();
        if (pub.originPlanetId) {
            initialMap.set(pub.originPlanetId, 100);
        }
        nextPublished.push({
            ...pub,
            transmissionMap: initialMap,
            jammedSystems: pub.jammedSystems || new Set()
        });
    });

    // 3. Viral Contagion (Topological Spread)
    const updatedPublished = nextPublished.map(pub => {
        const nextTransmission = calculateViralSpread(
            pub, 
            state.planets, 
            adj, 
            state.quarantinedPlanets,
            state.jammedSystems,
            state.counterNarratives,
            dtHours
        );
        return { ...pub, transmissionMap: nextTransmission };
    });

    // Handle Counter-Narrative Decay
    const nextCounterNarratives = new Map<string, number>();
    for (const [sysId, strength] of state.counterNarratives.entries()) {
        const afterDecay = strength - (5 * dtHours); // 5% decay per hour
        if (afterDecay > 1) {
            nextCounterNarratives.set(sysId, afterDecay);
        }
    }

    // 4. Propagate Effects (Local Intensity based)
    const updates = propagateEffects(tick, updatedPublished, state.planets, state.empires);

    // Apply updates to planets
    const nextPlanets = new Map(state.planets);
    for (const [pid, delta] of updates.entries()) {
        const p = nextPlanets.get(pid);
        if (p) {
            nextPlanets.set(pid, { ...p, ...delta });
        }
    }

    // 5. Update Empires (Trust Decay / Pressure)
    const nextEmpires = new Map(state.empires);
    for (const [eid, emp] of nextEmpires.entries()) {
        let pressure = emp.informationPressure;
        if (emp.activeCrises.size === 0) {
            pressure = Math.max(0, pressure - 0.5);
        }
        nextEmpires.set(eid, { ...emp, informationPressure: pressure });
    }

    // 6. Check Crises
    const generatedCrises = checkCrises(tick, nextEmpires, updatedPublished, nextActiveStories, rng);

    // Add to state and cleanup resolved
    const nextCrises = new Map<string, MediaCrisis>();
    
    // Keep existing unresolved crises
    for (const [cid, c] of state.crises.entries()) {
        if (!c.resolved) {
            nextCrises.set(cid, c);
        } else {
            // Remove from empire activeCrises set if resolved
            const emp = nextEmpires.get(c.targetEmpireId);
            if (emp) {
                emp.activeCrises.delete(cid);
            }
        }
    }

    generatedCrises.forEach(c => {
        nextCrises.set(c.id, c);
        const emp = nextEmpires.get(c.targetEmpireId);
        if (emp) {
            emp.activeCrises.add(c.id);
        }
    });

    return {
        newState: {
            tick,
            empires: nextEmpires,
            planets: nextPlanets,
            pressFactions: state.pressFactions,
            activeStories: nextActiveStories,
            publishedStories: updatedPublished,
            crises: nextCrises,
            quarantinedPlanets: state.quarantinedPlanets,
            jammedSystems: state.jammedSystems,
            counterNarratives: nextCounterNarratives
        },
        newCrises: generatedCrises
    };
}
