'use server';
/**
 * app/actions/moveArmy.ts
 * Multiplayer Authoritative Refactor
 */

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/actions/types';
import { executePlayerAction } from './registry-handler';

/**
 * Moves an army to a target planet or hex.
 */
export async function moveArmyAction(
    armyId: string, 
    targetPlanetId: string,
    factionId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `army-move-${Date.now()}`,
        actionId: 'MIL_MOVE_ARMY',
        issuerId: factionId,
        targetId: targetPlanetId,
        payload: { armyId, targetPlanetId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Embarks an army onto a fleet.
 */
export async function embarkArmyAction(
    armyId: string,
    fleetId: string,
    factionId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `army-embark-${Date.now()}`,
        actionId: 'MIL_EMBARK_ARMY',
        issuerId: factionId,
        targetId: fleetId,
        payload: { armyId, fleetId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Disembarks an army onto a planet.
 */
export async function disembarkArmyAction(
    armyId: string,
    planetId: string,
    factionId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `army-disembark-${Date.now()}`,
        actionId: 'MIL_DISEMBARK_ARMY',
        issuerId: factionId,
        targetId: planetId,
        payload: { armyId, planetId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}
