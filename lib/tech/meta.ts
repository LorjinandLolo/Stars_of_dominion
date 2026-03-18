import { Tech, Magnitude, PlayerTechState } from './types';

export enum MetaTechMutationType {
    MODIFY_MAGNITUDE = 'MODIFY_MAGNITUDE',
    ADD_SECONDARY_EFFECT = 'ADD_SECONDARY_EFFECT',
    CHANGE_VISIBILITY = 'CHANGE_VISIBILITY'
}

export interface MetaTechMutation {
    type: MetaTechMutationType;
    scope: 'FUTURE_TECHS_ONLY' | 'ALL_OWN_TECHS';
    payload: any; // e.g. { magnitudeShift: 1 } (increase by 1 step)
}

export class MetaTechManager {

    /**
     * Applies active meta-tech mutations to a generated tech BEFORE it is added to state.
     */
    static applyMutations(tech: Tech, state: PlayerTechState): Tech {
        // Find active Meta-Techs in player state
        // (In a real DB implementation, we'd query active effects. Here we simulate looking up 'meta' tags or effects)

        // For simplicity in this engine: We assume PlayerTechState has a registry of active mutations.
        // Since we didn't add `activeMutations` to PlayerTechState in types.ts yet, we'll iterate activeEffects.
        // But activeEffects are just `TechEffect`.
        // We need a place to store "Permanent Mutations".
        // Let's assume we store them in `state.activeEffects` with a special modifier payload?
        // OR better: we evaluate them here based on unlocked techs that are "Meta".

        let mutatedTech = { ...tech };

        // We need to fetch the actual Tech objects for all unlocked techs to check if they are Meta.
        // (This would be slow in a huge DB, but fine for memory registry).
        // To be cleaner, let's assume we pass a list of ActiveMutations.

        return mutatedTech;
    }

    static resolveMagnitude(base: Magnitude, shift: number): Magnitude {
        const levels = [Magnitude.VERY_LOW, Magnitude.LOW, Magnitude.MED, Magnitude.HIGH, Magnitude.SEVERE];
        const idx = levels.indexOf(base);
        if (idx === -1) return base;

        let newIdx = idx + shift;
        if (newIdx < 0) newIdx = 0;
        if (newIdx >= levels.length) newIdx = levels.length - 1;

        return levels[newIdx];
    }
}
