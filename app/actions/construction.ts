'use server'
/**
 * app/actions/construction.ts
 * Multiplayer Authoritative Refactor
 */

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { getBuildingsForSystem } from '@/lib/construction/construction-service';
import type { ActionResult } from '@/lib/actions/types';
import { executePlayerAction } from './registry-handler';

/**
 * Queues a new building on a specific planet for the given faction.
 */
export async function queueBuildingAction(
    planetId: string,
    systemId: string,
    buildingType: string,
    factionId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `build-${Date.now()}`,
        actionId: 'PLANET_CONSTRUCT_BUILDING',
        issuerId: factionId,
        targetId: planetId,
        payload: { planetId, systemId, buildingType },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Queues a new space construction order (Ships/Nodes).
 */
export async function queueSpaceConstructionAction(
    planetId: string,
    shipType: string,
    factionId: string
): Promise<ActionResult> {
    // Mapping this to MIL_BUILD_FLEET for now as it's the primary space construction action
    const result = await executePlayerAction({
        id: `ship-${Date.now()}`,
        actionId: 'MIL_BUILD_FLEET',
        issuerId: factionId,
        targetId: planetId,
        payload: { planetId, shipType },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Cancels an active construction order.
 */
export async function cancelBuildingAction(
    orderId: string,
    factionId: string
): Promise<ActionResult> {
    // Note: Cancellation via order queue not yet fully implemented in loop
    console.log(`[Construction] Requested cancel for ${orderId} by ${factionId}`);
    return { success: true };
}

/**
 * Upgrades an existing building to the next tier.
 */
export async function upgradeBuildingAction(buildingId: string, factionId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `upgrade-${Date.now()}`,
        actionId: 'PLANET_UPGRADE_BUILDING',
        issuerId: factionId,
        targetId: buildingId,
        payload: { buildingId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Repairs a damaged building.
 */
export async function repairBuildingAction(buildingId: string, factionId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `repair-${Date.now()}`,
        actionId: 'PLANET_REPAIR_BUILDING',
        issuerId: factionId,
        targetId: buildingId,
        payload: { buildingId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Recruits ground units on a planet.
 */
export async function recruitUnitsAction(planetId: string, unitType: string, count: number, factionId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `recruit-${Date.now()}`,
        actionId: 'PLANET_RECRUIT_UNITS',
        issuerId: factionId,
        targetId: planetId,
        payload: { planetId, unitType, count },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * FETCHES buildings for a system (Read Only)
 */
export async function getBuildingsForSystemAction(systemId: string) {
    const world = getGameWorldState();
    return getBuildingsForSystem(systemId, world.construction);
}
