
import { PlayerComebackState, ComebackPath } from '@/types/comeback';
import { COMEBACK_PATHS } from './data';

export class ComebackManager {

    static getAvailablePaths(defeatType: string): ComebackPath[] {
        return Object.values(COMEBACK_PATHS).filter(p => p.defeat_type === defeatType);
    }

    static initializeState(): PlayerComebackState {
        return {
            active_defeats: [],
            adaptation_xp: 0,
            unlocked_perks: [],
            history: []
        };
    }

    static startPath(state: PlayerComebackState, pathId: string): PlayerComebackState {
        const path = COMEBACK_PATHS[pathId];
        if (!path) throw new Error("Invalid Path ID");

        // Unlock Tier 1 Perk immediately
        const tier1Perks = path.perks.filter(p => p.tier === 1).map(p => p.id);

        return {
            ...state,
            active_path_id: pathId,
            path_started_at: new Date().toISOString(),
            unlocked_perks: [...state.unlocked_perks, ...tier1Perks]
        };
    }

    static grantXp(state: PlayerComebackState, amount: number): PlayerComebackState {
        if (!state.active_path_id) return state;

        const newXp = state.adaptation_xp + amount;
        const newState = { ...state, adaptation_xp: newXp };

        // Check for unlocks
        const path = COMEBACK_PATHS[state.active_path_id];
        const unlockable = path.perks.filter(p =>
            !state.unlocked_perks.includes(p.id) &&
            p.unlock_cost_xp <= newXp
        );

        if (unlockable.length > 0) {
            newState.unlocked_perks = [...newState.unlocked_perks, ...unlockable.map(u => u.id)];
        }

        return newState;
    }
}
