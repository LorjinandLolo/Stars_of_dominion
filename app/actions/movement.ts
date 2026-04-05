'use server';

import { revalidatePath } from "next/cache";
import { getGameWorldState } from "@/lib/game-world-state-singleton";
import type { MovementLayer } from "@/lib/movement/types";
import { executePlayerAction } from "./registry-handler";

export async function buildFleetAction(planetId: string, systemId: string, factionId: string) {
    const result = await executePlayerAction({
        id: `build-fleet-${Date.now()}`,
        actionId: 'MIL_BUILD_FLEET',
        issuerId: factionId,
        targetId: planetId,
        payload: { planetId, systemId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

export async function moveFleetAction(fleetId: string, targetSystemId: string, layer: MovementLayer = 'hyperlane') {
    const result = await executePlayerAction({
        id: `move-fleet-${Date.now()}`,
        actionId: 'MIL_MOVE_FLEET',
        issuerId: 'PLAYER_FACTION', // Will be resolved by registry handler or passed in
        targetId: fleetId,
        payload: { fleetId, destinationId: targetSystemId, layer },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

export async function getFleetsAction() {
    const world = getGameWorldState();
    return Array.from(world.movement.fleets.values());
}

