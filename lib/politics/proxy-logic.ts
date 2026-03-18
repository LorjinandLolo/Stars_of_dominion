import { GameWorldState } from '../game-world-state';
import { ProxyConflict } from './cold-war-types';
import { Resource } from '../trade-system/types';

/**
 * Funnels resources into a proxy conflict to destabilize a rival.
 */
export function sponsorProxyConflict(
    world: GameWorldState,
    sponsorId: string,
    conflictId: string,
    amount: number
): { success: boolean; message: string; conflict?: ProxyConflict } {
    const conflict = world.proxyConflicts.get(conflictId);
    if (!conflict) {
        return { success: false, message: "Conflict not found" };
    }

    const faction = world.economy.factions.get(sponsorId);
    if (!faction) {
        return { success: false, message: "Sponsor faction not found" };
    }

    // Check credits
    const currentCredits = faction.reserves[Resource.ENERGY] || 0;
    if (currentCredits < amount) {
        return { success: false, message: "Insufficient energy reserves for funding" };
    }

    // Deduct cost
    faction.reserves[Resource.ENERGY] = currentCredits - amount;

    // Update conflict state
    if (!conflict.sponsorIds.includes(sponsorId)) {
        conflict.sponsorIds.push(sponsorId);
    }

    conflict.fundingLevel += amount;
    
    // Intensity grows with funding but with diminishing returns
    // Every 500 energy adds ~10-15 intensity
    const intensityGain = (amount / 500) * 12;
    conflict.intensity = Math.min(100, conflict.intensity + intensityGain);

    // High intensity significantly spikes blowback risk
    if (conflict.intensity > 50) {
        conflict.blowbackRisk = Math.min(100, 5 + (conflict.intensity - 50) * 1.5);
    }

    console.log(`[POLITICS] Faction ${sponsorId} sponsored proxy ${conflictId} with ${amount}. New Intensity: ${conflict.intensity.toFixed(1)}%`);

    return { 
        success: true, 
        message: `Transferred ${amount} Energy to insurgents. Conflict intensity increased.`,
        conflict 
    };
}
