'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { manuallyPublishStory } from '@/lib/press-system/simulation';
import { CrisisChoice, PublishedStory } from '@/lib/press-system/types';
import { resolveCrisis } from '@/lib/press-system/crisis';

export type ActionResult = {
    success: boolean;
    message?: string;
    data?: any;
};

/**
 * Seed a story at a specific planet.
 */
export async function seedStoryAction(storyId: string, planetId: string): Promise<ActionResult> {
    const world = getGameWorldState();
    
    const planets = world.construction.planets;
    const planet = planets.get(planetId);
    if (!planet) return { success: false, message: "Planet not found" };

    world.press = manuallyPublishStory(world.press, storyId, planetId);

    revalidatePath('/');
    return { success: true };
}

/**
 * Toggle informational quarantine on a planet.
 */
export async function toggleQuarantineAction(planetId: string): Promise<ActionResult> {
    const world = getGameWorldState();
    
    if (world.press.quarantinedPlanets.has(planetId)) {
        world.press.quarantinedPlanets.delete(planetId);
    } else {
        world.press.quarantinedPlanets.add(planetId);
    }

    revalidatePath('/');
    return { success: true, data: Array.from(world.press.quarantinedPlanets) };
}

/**
 * Toggle signal jamming in a system.
 */
export async function toggleSignalJamAction(systemId: string): Promise<ActionResult> {
    const world = getGameWorldState();
    
    if (world.press.jammedSystems.has(systemId)) {
        world.press.jammedSystems.delete(systemId);
    } else {
        world.press.jammedSystems.add(systemId);
    }

    revalidatePath('/');
    return { success: true, data: Array.from(world.press.jammedSystems) };
}

/**
 * Resolves a media crisis with a specific choice.
 */
export async function resolveCrisisAction(crisisId: string, choice: CrisisChoice): Promise<ActionResult> {
    const world = getGameWorldState();
    const crisis = world.press.crises.get(crisisId);
    
    if (!crisis) return { success: false, message: "Crisis not found" };
    
    const empire = world.press.empires.get(crisis.targetEmpireId);
    if (!empire) return { success: false, message: "Empire not found" };

    const result = resolveCrisis(crisis, choice, empire);
    
    // Apply deltas
    Object.assign(empire, result.empireDelta);
    crisis.resolved = true;
    crisis.choiceMade = choice;
    crisis.outcome = result.outcome;

    revalidatePath('/');
    return { success: true, message: result.outcome };
}

/**
 * Utility to get current viral intensity of a story across all planets.
 */
export async function getViralHotspotsAction(storyId: string): Promise<Record<string, number>> {
    const world = getGameWorldState();
    const pub = world.press.publishedStories.find(p => p.id === storyId || p.storyId === storyId);
    
    if (!pub) return {};
    
    const hotspots: Record<string, number> = {};
    pub.transmissionMap.forEach((intensity, planetId) => {
        hotspots[planetId] = intensity;
    });
    
    return hotspots;
}

/**
 * Deploys an active counter-narrative to a system.
 * This sets a resistance value (starts at 100) that decays over time.
 */
export async function deployCounterNarrativeAction(systemId: string): Promise<ActionResult> {
    const world = getGameWorldState();
    
    // Set resistance to 100 (max)
    world.press.counterNarratives.set(systemId, 100);
    
    revalidatePath('/');
    return { success: true };
}
