import { GameWorldState } from '../game-world-state';
import { VictoryState, VictoryCondition } from '@/types/victory';

export const VICTORY_CONDITIONS: Record<string, VictoryCondition> = {
    'GALACTIC_MONOPOLY': {
        id: 'GALACTIC_MONOPOLY',
        type: 'ECONOMIC_HEGEMONY',
        name: 'Galactic Monopoly',
        description: 'You control over 75% of the total galactic credits generation.',
        threshold: 0.75
    },
    'LAST_STANDING': {
        id: 'LAST_STANDING',
        type: 'CONQUEST',
        name: 'Last Faction Standing',
        description: 'All other major factions have been eliminated or have collapsed.',
    }
};

export class VictoryManager {

    /**
     * Checks if the given faction has achieved victory.
     * Uses the authoritative GameWorldState for multiplayer accuracy.
     */
    static checkVictory(factionId: string, world: GameWorldState): VictoryState {
        const myEcon = world.economy.factions.get(factionId);
        if (!myEcon) return { status: 'PENDING' };

        // 1. Check Last Standing (Conquest / Elimination)
        let activeRivals = 0;
        for (const [rId, rEcon] of world.economy.factions) {
            if (rId === factionId) continue;
            if (rId === 'faction-pirates' || rId === 'faction-neutral') continue;

            // Faction is active if it owns any systems or has significant reserves
            const ownedSystems = Array.from(world.movement.systems.values()).filter(s => s.ownerFactionId === rId);
            const isAlive = ownedSystems.length > 0 || (rEcon.reserves.CREDITS || 0) > 1000;
            
            if (isAlive) activeRivals++;
        }

        if (activeRivals === 0 && world.economy.factions.size > 2) {
            return {
                status: 'VICTORIOUS',
                type: 'CONQUEST',
                message: 'All rival factions have collapsed or been eliminated. The galaxy is yours.',
                victor_id: factionId,
                timestamp: new Date().toISOString()
            };
        }

        // 2. Check Economic Hegemony
        let totalGalacticIncome = 0;
        let myIncome = 0;

        for (const planet of world.economy.planets.values()) {
            if (planet.factionId === 'faction-pirates' || planet.factionId === 'faction-neutral') continue;
            
            const income = planet.currentRates.credits || 0;
            totalGalacticIncome += income;
            if (planet.factionId === factionId) {
                myIncome += income;
            }
        }

        if (totalGalacticIncome > 0) {
            const share = myIncome / totalGalacticIncome;
            if (share >= 0.75) {
                return {
                    status: 'VICTORIOUS',
                    type: 'ECONOMIC_HEGEMONY',
                    message: `You control ${Math.floor(share * 100)}% of the galactic economy. Acceptance is inevitable.`,
                    victor_id: factionId,
                    timestamp: new Date().toISOString()
                };
            }
        }

        return { status: 'PENDING' };
    }
}
