/**
 * lib/espionage/faction-intel.ts
 * Accessors for per-faction intelligence state (FactionIntelState).
 *
 * Consolidation Phase 1: unified replacement for the per-empire state formerly
 * split between lib/intelligence IntelligenceNetwork and CounterIntelState.
 */

import type { FactionIntelState } from './espionage-types';
import type { GameWorldState } from '../game-world-state';

export function defaultFactionIntelState(factionId: string): FactionIntelState {
    return {
        factionId,
        intelPoints: 0,
        agentCapacity: 3,
        usedAgentCapacity: 0,
        counterIntelStrength: 0,
        surveillanceStrength: 0,
        propagandaResistance: 0,
        internalSecurity: 0,
        infiltrationLevels: {},
        regionalCounterIntel: {},
        counterIntelBudget: 0,
    };
}

export function getOrCreateFactionIntel(world: GameWorldState, factionId: string): FactionIntelState {
    let state = world.espionage.factionIntel.get(factionId);
    if (!state) {
        state = defaultFactionIntelState(factionId);
        world.espionage.factionIntel.set(factionId, state);
    }
    return state;
}

/** Adjust attacker's infiltration score (0–100) against a target faction. */
export function updateInfiltration(
    world: GameWorldState,
    attackerFactionId: string,
    targetFactionId: string,
    delta: number
): void {
    const state = getOrCreateFactionIntel(world, attackerFactionId);
    const current = state.infiltrationLevels[targetFactionId] ?? 0;
    state.infiltrationLevels[targetFactionId] = Math.max(0, Math.min(100, current + delta));
}
