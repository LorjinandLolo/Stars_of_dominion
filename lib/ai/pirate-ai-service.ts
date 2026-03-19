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

    // 2. Intelligence: Identify local non-pirate presence
    const nonPirateFleets = Array.from(world.movement.fleets.values()).filter(
        f => f.currentSystemId === currentSystemId && f.factionId !== 'faction-pirates' && f.transitProgress === 0
    );

    const piratePower = fleet.strength;
    const enemyPower = nonPirateFleets.reduce((sum: number, f: Fleet) => sum + f.strength, 0);

    // 3. Repair Logic: If we are in a safe haven and damaged, STAY for repair
    const isAtHaven = currentSystem.tags.includes('corsair_den');
    if (isAtHaven && fleet.strength < 0.9) {
        return {
            type: 'patrol',
            targetSystemId: currentSystemId,
            startTime: world.movement.nowSeconds,
            arrivalTime: world.movement.nowSeconds
        } as any;
    }

    // 4. Survival & Retreat: If heavily damaged OR facing superior force, find Haven
    if (enemyPower > piratePower * 1.5 || fleet.strength < 0.4) {
        // Find nearest safe-haven
        let nearestHavenId: string | null = null;
        let minDistance = Infinity;

        for (const [sysId, sys] of world.movement.systems) {
            if (sys.tags.includes('corsair_den')) {
                // Simple Euclidean distance for heuristic
                const dx = sys.q - currentSystem.q;
                const dy = sys.r - currentSystem.r;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestHavenId = sysId;
                }
            }
        }

        if (nearestHavenId && nearestHavenId !== currentSystemId) {
            return {
                type: 'move',
                targetSystemId: nearestHavenId,
                startTime: world.movement.nowSeconds,
                arrivalTime: world.movement.nowSeconds + 3600 
            } as any;
        }

        // Standard retreat if no haven or already at haven
        if (enemyPower > piratePower * 1.5) {
            const neighbors = Array.from(world.movement.systems.values()).filter(s => 
                currentSystem.hyperlaneNeighbors.includes(s.id)
            );
            if (neighbors.length > 0) {
                const escapeTarget = neighbors[Math.floor(Math.random() * neighbors.length)];
                return {
                    type: 'withdraw',
                    targetSystemId: escapeTarget.id,
                    startTime: world.movement.nowSeconds,
                    arrivalTime: world.movement.nowSeconds + 3600
                } as any; 
            }
        }
    }

    // 5. Interdiction: Are there trade convoys here or high value?
    const tradeValue = currentSystem.tradeValue || 0;
    if (tradeValue > 30) {
        return {
            type: 'blockade',
            targetSystemId: currentSystemId,
            startTime: world.movement.nowSeconds,
            arrivalTime: world.movement.nowSeconds
        } as any;
    }

    // 6. Piracy Radar: Find the nearest high-value system
    let bestTargetId: string | null = null;
    let highestValue = -1;

    for (const sys of world.movement.systems.values()) {
        if (sys.id === currentSystemId) continue;
        
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
            arrivalTime: world.movement.nowSeconds + 7200 
        } as any;
    }

    return null;
}
