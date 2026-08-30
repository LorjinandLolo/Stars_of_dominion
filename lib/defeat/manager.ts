import { GameWorldState } from '../game-world-state';
import { DefeatState, ActiveDefeat, DefeatCondition } from '@/types/defeat';

/** Records stamp the sim clock, never the wall clock — replayability rule. */
function nowISO(world: GameWorldState): string {
    return new Date(world.nowSeconds * 1000).toISOString();
}

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

        // 1. Check Terminal Defeats (Game Over). A CRITICAL result here is the
        // zero-planet grace window — doomed but not yet done.
        const terminalDefeat = this.checkTerminalDefeats(factionId, world);
        if (terminalDefeat) {
            activeDefeats.push(terminalDefeat);
            if (terminalDefeat.severity === 'TERMINAL') {
                status = 'ELIMINATED';
                doomScore = 100;
            } else {
                doomScore += 60; // grace window: deep in the red, not out
            }
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

    /** Sim-seconds a faction may sit at zero planets before elimination.
     *  15 sim days ≈ 24 real hours at the 15x clock — under the new
     *  capital-only starts, one lost siege in week 1 must not end a friend's
     *  whole season on the spot; a day is time to counterattack or be saved. */
    private static readonly ZERO_PLANET_GRACE_SIM_SECONDS = 15 * 86400;

    private static checkTerminalDefeats(factionId: string, world: GameWorldState): ActiveDefeat | null {
        // Condition: No planets owned — sustained through the grace window.
        const ownedPlanets = Array.from(world.construction.planets.values()).filter(p => p.ownerId === factionId);
        const econ = world.economy.factions.get(factionId) as any;

        if (ownedPlanets.length > 0) {
            if (econ?.zeroPlanetsSince) delete econ.zeroPlanetsSince; // recovered
            return null;
        }

        if (econ && !econ.zeroPlanetsSince) econ.zeroPlanetsSince = world.nowSeconds;
        const since = econ?.zeroPlanetsSince ?? world.nowSeconds;
        const elapsed = world.nowSeconds - since;
        if (elapsed < this.ZERO_PLANET_GRACE_SIM_SECONDS) {
            const realHoursLeft = Math.max(1, Math.ceil((this.ZERO_PLANET_GRACE_SIM_SECONDS - elapsed) / 3600 / 15));
            return {
                condition_id: DEFEAT_CONDITIONS['HOMEWORLD_LOST'].id,
                triggered_at: nowISO(world),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: `All worlds lost. Retake a planet within ~${realHoursLeft}h or the faction falls.`
            };
        }

        return {
            condition_id: DEFEAT_CONDITIONS['HOMEWORLD_LOST'].id,
            triggered_at: nowISO(world),
            status: 'ACTIVE',
            severity: 'TERMINAL',
            message: `All systems lost. Your faction has been eliminated.`
        };
    }

    private static checkStrategicDefeats(factionId: string, world: GameWorldState): ActiveDefeat[] {
        const defeats: ActiveDefeat[] = [];
        const econ = world.economy.factions.get(factionId);
        if (!econ) return defeats;

        // Economic Collapse (Solvency check)
        if ((econ.reserves.CREDITS || 0) < -5000) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['ECONOMIC_COLLAPSE'].id,
                triggered_at: nowISO(world),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: 'Massive debt has collapsed the economy. Production halted.'
            });
        } else if ((econ.reserves.CREDITS || 0) < 0) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['BANKRUPTCY'].id,
                triggered_at: nowISO(world),
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
                triggered_at: nowISO(world),
                status: 'ACTIVE',
                severity: 'CRITICAL',
                message: 'Planetary systems are in open revolt.'
            });
        } else if (avgHappiness < 35) {
            defeats.push({
                condition_id: DEFEAT_CONDITIONS['CIVIL_UNREST'].id,
                triggered_at: nowISO(world),
                status: 'ACTIVE',
                severity: 'WARNING',
                message: 'Widespread civil disobedience detected.'
            });
        }

        return defeats;
    }
}
