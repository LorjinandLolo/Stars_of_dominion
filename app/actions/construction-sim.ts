/**
 * app/actions/construction-sim.ts
 * Client-safe server actions for construction simulation state.
 * These do NOT import node-appwrite.
 */
'use server'

import { getConstructionWorldState, getGameWorldState } from '@/lib/game-world-state-singleton';
import { getBuildingsForSystem } from '@/lib/construction/construction-service';
import { SystemConstructionData } from './construction';
import type { ActionResult } from '@/lib/actions/types';
import { Planet } from '@/lib/construction/construction-types';

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
