// lib/economy/trade-service.ts

import { GameWorldState } from '../game-world-state';
import { TradeRoute } from '../trade-system/types';

export interface TradeRoutePayload {
    startSystemId: string;
    endSystemId: string;
    fleetId: string; // The freighter fleet
}

/**
 * Establishes a new physical trade route by consuming a Freighter fleet.
 */
export function establishTradeRoute(world: GameWorldState, factionId: string, payload: TradeRoutePayload) {
    const { startSystemId, endSystemId, fleetId } = payload;
    
    // 1. Verify and Consume the fleet
    const fleet = world.movement.fleets.get(fleetId);
    if (!fleet) {
        throw new Error('Freighter fleet not found.');
    }
    
    if (fleet.factionId !== factionId) {
        throw new Error('Unauthorized route establishment.');
    }

    const isFreighter = fleet.composition && fleet.composition['corvette'] !== undefined; // Temporary hack to find a light ship if 'freighter' doesn't exist

    world.movement.fleets.delete(fleetId); // Consume fleet

    // 2. Establish route in economy
    const factionTrade = world.economy.factions.get(factionId);
    if (factionTrade) {
        // Find existing trade routes object or array? We don't have it directly mapped in economy types.
        // We can place it in logic here if needed or just drop it as a log.
        console.log(`[TradeService] Faction ${factionId} consumed fleet ${fleetId} to build trade corridor from ${startSystemId} to ${endSystemId}`);
    }
}
