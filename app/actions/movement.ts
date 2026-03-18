"use server";

import { revalidatePath } from "next/cache";
import { getGameWorldState } from "@/lib/game-world-state-singleton";
import { issueMoveOrder, findPath } from "@/lib/movement/movement-service";
import type { Fleet, MovementLayer } from "@/lib/movement/types";

export async function buildFleetAction(planetId: string, systemId: string, factionId: string) {
    const world = getGameWorldState();

    // In a full implementation, we would check for a 'shipyard' building and deduct resources
    // For now, we simply spawn the fleet.
    const fleetId = `fleet-${Date.now()}`;
    const newFleet: Fleet = {
        id: fleetId,
        factionId,
        name: `Task Force ${Math.floor(Math.random() * 100)}`,
        currentSystemId: systemId,
        destinationSystemId: null,
        activeLayer: null,
        transitProgress: 0,
        etaSeconds: 0,
        plannedPath: [],
        orders: [],
        doctrine: {
            type: 'Offensive',
            deviationFromPosture: 0,
            preferredLayers: ['hyperlane', 'gate'],
            retreatThreshold: 0.3,
            logisticsStrain: 0,
            moraleDrift: 0,
            supplyLevel: 1.0
        },
        postureId: 'Expansionist',
        strength: 1.0,
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
            trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
            corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
            gate: { speedMultiplier: 10.0, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
            deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 0.2, supplyStrainMultiplier: 1.0 },
        },
        isDetectable: true
    };

    world.movement.fleets.set(fleetId, newFleet);
    revalidatePath('/');
    return { success: true, fleetId };
}

export async function moveFleetAction(fleetId: string, targetSystemId: string, layer: MovementLayer = 'hyperlane') {
    const world = getGameWorldState();
    const fleet = world.movement.fleets.get(fleetId);

    if (!fleet) {
        return { success: false, error: "Fleet not found" };
    }

    // Try to issue the move order
    const updatedFleet = issueMoveOrder(fleet, targetSystemId, layer, world.movement);

    if (updatedFleet.destinationSystemId === targetSystemId) {
        world.movement.fleets.set(fleetId, updatedFleet);
        revalidatePath('/');
        return { success: true };
    } else {
        return { success: false, error: "No valid path to target system" };
    }
}

export async function getFleetsAction() {
    const world = getGameWorldState();
    return Array.from(world.movement.fleets.values());
}

