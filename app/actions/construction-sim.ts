'use server'
/**
 * app/actions/construction-sim.ts
 * Client-safe server actions for construction simulation state.
 * These do NOT import node-appwrite.
 */

import { getConstructionWorldState, getGameWorldState } from '@/lib/game-world-state-singleton';
import { getBuildingsForSystem } from '@/lib/construction/construction-service';
import type { ActionResult } from '@/lib/actions/types';
import { Planet, PlacedBuilding, SpaceBuildOrder, BuildOrder } from '@/lib/construction/construction-types';

export interface SystemConstructionData {
    planets: Planet[];
    buildings: PlacedBuilding[];
    queue: BuildOrder[];
    spaceBuildQueue: SpaceBuildOrder[];
}

/**
 * Returns all placed buildings and active queue orders for a given system.
 * This version is safe to call from client components.
 */
export async function getSystemBuildingsAction(systemId: string): Promise<ActionResult<SystemConstructionData>> {
    const state = getConstructionWorldState();
    const result = getBuildingsForSystem(systemId, state);
    
    const planets: Planet[] = [];
    for (const planet of state.planets.values()) {
        if (planet.systemId === systemId) {
            planets.push(planet);
        }
    }

    return { 
        success: true, 
        data: { 
            planets,
            buildings: result.buildings,
            queue: result.queue,
            spaceBuildQueue: getGameWorldState().construction.spaceBuildQueue.filter(q => q.systemId === systemId)
        } 
    };
}

/**
 * Returns the current global simulation time.
 * Safe for client usage.
 */
export async function getGlobalStateAction(): Promise<{ nowSeconds: number }> {
    return { nowSeconds: getGameWorldState().nowSeconds };
}

/**
 * DEV UTILITY — Seeds additional planets into an existing system.
 * Call this from dev tooling or the BattleCommandPanel to simulate
 * multi-planet systems before full procedural generation is complete.
 * 
 * @param systemId  The system to add planets to
 * @param planets   Array of planet specs to seed
 */
export async function seedMultiplePlanetsAction(
    systemId: string,
    planets: Array<{
        name: string;
        ownerId: string;
        planetType?: string;
        tags?: string[];
    }>
): Promise<ActionResult> {
    const world = getGameWorldState();
    
    for (let i = 0; i < planets.length; i++) {
        const spec = planets[i];
        const planetId = `planet-${systemId}-orbit-${i + 2}`; // orbit-1 = primary, orbit-2+ = secondaries

        // Don't overwrite existing planets
        if (world.construction.planets.has(planetId)) continue;

        const newPlanet: Planet = {
            id: planetId,
            name: spec.name,
            ownerId: spec.ownerId,
            systemId,
            planetType: (spec.planetType as any) || 'standard',
            infrastructureLevel: 1,
            stability: 65 + Math.floor(Math.random() * 20),
            happiness: 70,
            specialization: null,
            maxTiles: 6,
            tiles: [
                { tileId: `${planetId}-t1`, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null },
                { tileId: `${planetId}-t2`, districtType: 'any', buildingId: null, constructionState: 'empty', constructionCompleteAt: null },
            ],
            buildQueue: [],
            activeModifiers: [],
            tags: spec.tags || [],
            population: 10 + Math.floor(Math.random() * 30),
            popCapacity: 50,
            popGrowth: 0.02,
            unrest: Math.floor(Math.random() * 25),
            isOccupied: false,
            demographics: [
                { speciesId: 'species-human', name: 'Colonists', percentage: 80, socialClass: 'Citizen' },
                { speciesId: 'species-worker', name: 'Labor Caste', percentage: 20, socialClass: 'Resident' },
            ]
        };
        world.construction.planets.set(planetId, newPlanet);
    }

    return { success: true };
}

/**
 * Flips ownership of a planet — used as a siege resolution stand-in
 * until full combat resolution is wired into the invasion action handler.
 */
export async function flipPlanetOwnerAction(
    planetId: string,
    newOwnerId: string
): Promise<ActionResult> {
    const world = getGameWorldState();
    const planet = world.construction.planets.get(planetId);
    if (!planet) return { success: false, error: `Planet ${planetId} not found.` };

    planet.ownerId = newOwnerId;
    planet.isOccupied = true;
    planet.unrest = Math.min(100, (planet.unrest || 0) + 30);
    planet.stability = Math.max(0, (planet.stability || 50) - 20);

    return { success: true };
}
