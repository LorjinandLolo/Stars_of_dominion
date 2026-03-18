import { Faction, Planet } from '@/types/game';
import { DefeatState, ActiveDefeat, DefeatCondition, DefeatCategory } from '@/types/defeat';
import { checkEconomicHealth } from '@/lib/economy/upkeep';
import { getAllActiveRoutes } from '@/lib/economy/trade';
import { getActiveCrises } from '@/lib/economy/crisis';
import { ResourceId } from '@/types';

// Define the conditions
export const DEFEAT_CONDITIONS: Record<string, DefeatCondition> = {
    'HOMEWORLD_LOST': {
        id: 'HOMEWORLD_LOST',
        name: 'Homeworld Conquest',
        description: 'Your home planet has been captured by another faction.',
        category: 'TERMINAL',
        severity: 'TERMINAL'
    },
    'ECONOMIC_COLLAPSE': {
        id: 'ECONOMIC_COLLAPSE',
        name: 'Economic Collapse',
        description: 'Your economy has collapsed. Industry and military sustainment are failing.',
        category: 'STRATEGIC',
        severity: 'CRITICAL'
    },
    'BANKRUPTCY': {
        id: 'BANKRUPTCY',
        name: 'Bankruptcy',
        description: 'You are running a severe deficit and have depleted reserves.',
        category: 'STRATEGIC',
        severity: 'WARNING'
    },
    'MILITARY_IRRELEVANCE': {
        id: 'MILITARY_IRRELEVANCE',
        name: 'Military Irrelevance',
        description: 'Your fleet power is negligible compared to galactic average.',
        category: 'STRATEGIC',
        severity: 'WARNING'
    },
    'DIPLOMATIC_ISOLATION': {
        id: 'DIPLOMATIC_ISOLATION',
        name: 'Diplomatic Isolation',
        description: 'You have no active trade routes with other factions.',
        category: 'POLITICAL',
        severity: 'WARNING'
    },
    'CIVIL_UNREST': {
        id: 'CIVIL_UNREST',
        name: 'Civil Unrest',
        description: 'Population is unhappy. Productivity is falling.',
        category: 'INTERNAL',
        severity: 'WARNING'
    },
    'REBELLION': {
        id: 'REBELLION',
        name: 'Open Rebellion',
        description: 'Planets are revolting due to sustained unhappiness.',
        category: 'INTERNAL',
        severity: 'CRITICAL'
    },
    'STRATEGIC_BLINDNESS': {
        id: 'STRATEGIC_BLINDNESS',
        name: 'Strategic Blindness',
        description: 'Intel levels are critically low. You cannot see enemy movements.',
        category: 'ESPIONAGE',
        severity: 'WARNING'
    },
    'CRISIS_OVERWHELM': {
        id: 'CRISIS_OVERWHELM',
        name: 'Crisis Systems Failure',
        description: 'Too many active crises. Administration is paralyzed.',
        category: 'CRISIS',
        severity: 'CRITICAL'
    }
};

export class DefeatManager {

    /**
     * Evaluates the faction's state and returns the current DefeatStatus.
     * This should be called during the main game loop or state update.
     */
    static checkDefeatConditions(faction: Faction, planets: Planet[], context: any = {}): DefeatState {
        const activeDefeats: ActiveDefeat[] = [];
        let doomScore = 0;
        let status: DefeatState['status'] = 'ALIVE';

        // 1. Check Terminal Defeats (Game Over)
        const terminalDefeat = this.checkTerminalDefeats(faction, planets);
        if (terminalDefeat) {
            activeDefeats.push(terminalDefeat);
            status = 'ELIMINATED';
            doomScore = 100;
        }

        // 2. Check Strategic Defeats (Economy, Military)
        // Only run if not already eliminated
        if (status !== 'ELIMINATED') {
            const strategicDefeats = this.checkStrategicDefeats(faction, context);
            activeDefeats.push(...strategicDefeats);

            // Calculate Doom Score based on active defeats
            doomScore += strategicDefeats.length * 20; // Arbitrary weight for now
        }

        // 3. Check Political, Internal, Espionage
        if (status !== 'ELIMINATED') {
            const politicalDefeats = this.checkPoliticalDefeats(faction, planets);
            const internalDefeats = this.checkInternalDefeats(faction);
            const espionageDefeats = this.checkEspionageDefeats(faction);

            activeDefeats.push(...politicalDefeats, ...internalDefeats, ...espionageDefeats);

            doomScore += (politicalDefeats.length * 10) + (internalDefeats.length * 15) + (espionageDefeats.length * 10);
        }

        // Cap Doom Score
        if (doomScore > 100) doomScore = 100;

        // If Doom Score is high but not eliminated, set status to DYING
        if (status !== 'ELIMINATED' && doomScore > 80) {
            status = 'DYING';
        }

        return {
            status,
            active_defeats: activeDefeats,
            doom_score: doomScore
        };
    }

    private static checkTerminalDefeats(faction: Faction, planets: Planet[]): ActiveDefeat | null {
        // Condition 1: Homeworld Conquest
        if (faction.home_planet_id) {
            const homePlanet = planets.find(p => p.$id === faction.home_planet_id);
            if (homePlanet && homePlanet.owner_faction_id !== faction.$id) {
                return {
                    condition_id: DEFEAT_CONDITIONS['HOMEWORLD_LOST'].id,
                    triggered_at: new Date().toISOString(),
                    status: 'ACTIVE',
                    severity: 'TERMINAL',
                    message: `Your homeworld ${homePlanet.name} has been lost to the enemy!`
                };
            }
        }
        return null;
    }

    private static checkStrategicDefeats(faction: Faction, context: any): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];

        // Condition 1: Economic Health
        // We reuse the verify logic from economy lib if possible, or just check the flags
        // Assuming faction.resources might contain health flags if we saved them, 
        // or we recalculate here. Let's recalculate to be safe.

        // Mock state for checkEconomicHealth - in real impl, we'd pass full state
        const ecoState: any = {
            resources: typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources,
            // We need income rates, assuming they are on faction or passed in context
            income_rates: context.income_rates || { credits: 0 },
            economic_health: { stability: 100, deficit_counter: 0, status: 'solvent' } // Default
        };

        const health = checkEconomicHealth(ecoState).economic_health;

        if (health.status === 'collapsed') {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['ECONOMIC_COLLAPSE'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: 'Economy has collapsed. Production halted.'
            });
        } else if (health.status === 'bankrupt') {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['BANKRUPTCY'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'Treasury empty. Debt accumulating.'
            });
        }

        return defeats;
    }

    private static checkInternalDefeats(faction: Faction): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];
        const resources: any = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;
        const happiness = resources.happiness || 50; // Default

        if (happiness < 10) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['REBELLION'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: 'Widespread rebellion due to low happiness.'
            });
        } else if (happiness < 30) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['CIVIL_UNREST'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'Civil unrest is growing.'
            });
        }

        return defeats;
    }

    private static checkPoliticalDefeats(faction: Faction, planets: Planet[]): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];

        // Diplomatic Isolation: No trade routes with OTHER factions
        const myPlanetIds = planets.filter(p => p.owner_faction_id === faction.$id).map(p => p.$id);
        const allRoutes = getAllActiveRoutes();

        const myExternalRoutes = allRoutes.filter(r => {
            const originIsMine = myPlanetIds.includes(r.origin_planet_id);
            const targetIsMine = myPlanetIds.includes(r.target_planet_id);
            // External if exactly one end is mine
            return (originIsMine && !targetIsMine) || (!originIsMine && targetIsMine);
        });

        // If I have planets but no external trade...
        if (myPlanetIds.length > 0 && myExternalRoutes.length === 0) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['DIPLOMATIC_ISOLATION'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'You are diplomatically isolated. Establish trade routes.'
            });
        }

        return defeats;
    }

    private static checkEspionageDefeats(faction: Faction): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];
        const resources: any = typeof faction.resources === 'string' ? JSON.parse(faction.resources) : faction.resources;

        // Blindness: Low Intel
        const intel = resources.intel || 0;
        if (intel < 10) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['STRATEGIC_BLINDNESS'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'Intel cache empty. Map visibility compromised.'
            });
        }

        // Crisis Overwhelm
        const crises = getActiveCrises(faction.$id);

        if (crises.length >= 3) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['CRISIS_OVERWHELM'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: `Overwhelmed by ${crises.length} active crises.`
            });
        }

        return defeats;
    }
}
