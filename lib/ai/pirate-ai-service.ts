/**
 * lib/ai/pirate-ai-service.ts
 * Tactical logic for autonomous pirate raider fleets.
 */

import { GameWorldState } from '../game-world-state';
import { Fleet, FleetOrder } from '../movement/types';

/**
 * Process a single tactical 'turn' for a pirate fleet.
 * Called during the strategic tick simulation.
 */
export function processPirateTurn(fleet: Fleet, world: GameWorldState): FleetOrder | null {
    // 1. If currently in transit, don't change orders (let them arrive)
    if (fleet.transitProgress > 0) return null;

    const currentSystemId = fleet.currentSystemId;
    if (!currentSystemId) return null;

    const currentSystem = world.movement.systems.get(currentSystemId);
    if (!currentSystem) return null;

    // 2. Performance Check: Is there a superior non-pirate force here?
    const nonPirateFleets = Array.from(world.movement.fleets.values()).filter(
        f => f.currentSystemId === currentSystemId && f.factionId !== 'faction-pirates' && f.transitProgress === 0
    );

    const piratePower = fleet.strength;
    const enemyPower = nonPirateFleets.reduce((sum, f) => sum + f.strength, 0);

    if (enemyPower > piratePower * 1.5) {
        // RETREAT! Find any adjacent system with higher security (ironically) or just away.
        const neighbors = Array.from(world.movement.systems.values()).filter(s => 
            currentSystem.hyperlaneNeighbors.includes(s.id)
        );
        if (neighbors.length > 0) {
            const escapeTarget = neighbors[Math.floor(Math.random() * neighbors.length)];
            return {
                type: 'withdraw',
                targetSystemId: escapeTarget.id,
                startTime: world.movement.nowSeconds,
                arrivalTime: world.movement.nowSeconds + 3600 // 1 hour transit
            } as any; 
        }
    }

    // 3. Check for Interdiction: Are there trade convoys here or high value?
    const tradeValue = currentSystem.tradeValue || 0;
    if (tradeValue > 30) {
        // If we are already blockading, stay. 
        // Otherwise, start blockading.
        return {
            type: 'blockade',
            targetSystemId: currentSystemId,
            startTime: world.movement.nowSeconds,
            arrivalTime: world.movement.nowSeconds
        } as any;
    }

    // 4. Piracy Radar: Find the nearest high-value system
    let bestTargetId: string | null = null;
    let highestValue = -1;

    for (const sys of world.movement.systems.values()) {
        if (sys.id === currentSystemId) continue;
        
        // Simple heuristic: Value / Distance
        // For simplicity, we just use raw trade value for now
        const sysValue = sys.tradeValue || 0;
        if (sysValue > highestValue) {
            highestValue = sysValue;
            bestTargetId = sys.id;
        }
    }


    if (bestTargetId && highestValue > 20) {
        return {
            type: 'move',
            targetSystemId: bestTargetId,
            startTime: world.movement.nowSeconds,
            arrivalTime: world.movement.nowSeconds + 7200 // 2 hour transit for raiders
        } as any;
    }

    return null;
}
