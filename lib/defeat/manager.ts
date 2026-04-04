import { GameWorldState } from '../game-world-state';
import { DefeatState, ActiveDefeat, DefeatCondition } from '@/types/defeat';

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
     * Uses the authoritative GameWorldState.
     */
    static checkDefeatConditions(factionId: string, world: GameWorldState): DefeatState {
        const activeDefeats: ActiveDefeat[] = [];
        let doomScore = 0;
        let status: DefeatState['status'] = 'ALIVE';

        // 1. Check Terminal Defeats (Game Over)
        const terminalDefeat = this.checkTerminalDefeats(factionId, world);
        if (terminalDefeat) {
            activeDefeats.push(terminalDefeat);
            status = 'ELIMINATED';
            doomScore = 100;
        }

        // 2. Check Strategic Defeats (Economy, Military)
        if (status !== 'ELIMINATED') {
            const strategicDefeats = this.checkStrategicDefeats(factionId, world);
            activeDefeats.push(...strategicDefeats);
            doomScore += strategicDefeats.length * 20;
        }

        // 3. Check Internal & Crisis
        if (status !== 'ELIMINATED') {
            const internalDefeats = this.checkInternalDefeats(factionId, world);
            activeDefeats.push(...internalDefeats);
            doomScore += internalDefeats.length * 15;
        }

        if (doomScore > 100) doomScore = 100;

        if (status !== 'ELIMINATED' && doomScore > 80) {
            status = 'DYING';
        }

        return {
            status,
            active_defeats: activeDefeats,
            doom_score: doomScore
        };
    }

    private static checkTerminalDefeats(factionId: string, world: GameWorldState): ActiveDefeat | null {
        // Condition: No planets owned
        const ownedPlanets = Array.from(world.construction.planets.values()).filter(p => p.ownerId === factionId);
        
        if (ownedPlanets.length === 0) {
            return {
                condition_id: DEFEAT_CONDITIONS['HOMEWORLD_LOST'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'TERMINAL',
                message: `All systems lost. Your faction has been eliminated.`
            };
        }
        return null;
    }

    private static checkStrategicDefeats(factionId: string, world: GameWorldState): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];
        const econ = world.economy.factions.get(factionId);
        if (!econ) return defeats;

        // Economic Collapse (Solvency check)
        if ((econ.reserves.CREDITS || 0) < -5000) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['ECONOMIC_COLLAPSE'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: 'Massive debt has collapsed the economy. Production halted.'
            });
        } else if ((econ.reserves.CREDITS || 0) < 0) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['BANKRUPTCY'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'Sovereign default. Credit rating is zero.'
            });
        }

        return defeats;
    }

    private static checkInternalDefeats(factionId: string, world: GameWorldState): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];
        const planets = Array.from(world.construction.planets.values()).filter(p => p.ownerId === factionId);
        if (planets.length === 0) return defeats;

        const avgHappiness = planets.reduce((s, p) => s + (p.happiness || 50), 0) / planets.length;

        if (avgHappiness < 15) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['REBELLION'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: 'Planetary systems are in open revolt.'
            });
        } else if (avgHappiness < 35) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['CIVIL_UNREST'].id,
                triggered_at: new Date().toISOString(),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'Widespread civil disobedience detected.'
            });
        }

        return defeats;
    }
}
