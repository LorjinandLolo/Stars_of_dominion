
import { Faction } from '@/types/game';
import { VictoryState, VictoryCondition } from '@/types/victory';
import { DefeatManager } from '@/lib/defeat/manager';
import { DefeatState } from '@/types/defeat';

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
     * Checks if the given faction has achieved victory over the others.
     */
    static checkVictory(myFaction: Faction, otherFactions: Faction[], context: any = {}): VictoryState {

        // 1. Check Last Standing (Conquest / Collapse)
        // We need to know the status of other factions. 
        // Ideally, we run DefeatManager on them, or we trust their persisted state if we had one.
        // For this check, we will assume we calculate their defeat status on the fly or it's passed in.

        let activeRivals = 0;
        let defeatedRivals = 0;

        for (const rival of otherFactions) {
            // Self-check prevention (though caller should filter)
            if (rival.$id === myFaction.$id) continue;

            // We need to check if rival is "Alive"
            // We can run a lightweight Defeat Check?
            // Or assume if they are not in the list they are gone?
            // Let's run a checkDefeatConditions if we have their data.

            // Getting context for rival might be hard (planets, etc). 
            // For MVP, let's look at their resources directly.

            let rivalStatus: DefeatState['status'] = 'ALIVE';

            // QUICK CHECK: If resources say collapsed
            const rRes = typeof rival.resources === 'string' ? JSON.parse(rival.resources) : rival.resources;
            if (rRes._health && rRes._health.status === 'collapsed') {
                rivalStatus = 'ELIMINATED'; // Effectively
            }

            if (rivalStatus === 'ALIVE') activeRivals++;
            else defeatedRivals++;
        }

        if (activeRivals === 0 && otherFactions.length > 0) {
            return {
                status: 'VICTORIOUS',
                type: 'CONQUEST',
                message: 'All rival factions have collapsed or been eliminated. The galaxy is yours.',
                victor_id: myFaction.$id,
                timestamp: new Date().toISOString()
            };
        }

        // 2. Check Economic Hegemony
        // Compare Income Rates
        const myRates = context.income_rates || { credits: 0 };
        let myIncome = myRates.credits || 0;
        let totalGalacticIncome = myIncome;

        for (const rival of otherFactions) {
            if (rival.$id === myFaction.$id) continue;
            const rRates = typeof (rival as any).income_rates === 'string' ? JSON.parse((rival as any).income_rates) : (rival as any).income_rates;
            if (rRates && rRates.credits) {
                totalGalacticIncome += rRates.credits;
            }
        }

        if (totalGalacticIncome > 0) {
            const share = myIncome / totalGalacticIncome;
            if (share >= 0.75) {
                return {
                    status: 'VICTORIOUS',
                    type: 'ECONOMIC_HEGEMONY',
                    message: `You control ${Math.floor(share * 100)}% of the galactic economy. Acceptance is inevitable.`,
                    victor_id: myFaction.$id,
                    timestamp: new Date().toISOString()
                };
            }
        }

        return { status: 'PENDING' };
    }
}
