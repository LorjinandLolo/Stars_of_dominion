import {
    Tech, PlayerTechState, GameStateContext,
    Domain, Tier, TechEffectType, TechEffect,
    ResearchSlot
} from './types';

// --- DATA & REGISTRY ---

class TechRegistry {
    private techs: Map<string, Tech> = new Map();

    register(tech: Tech) {
        this.validateSafetyRails(tech);
        this.techs.set(tech.id, tech);
    }

    get(id: string): Tech | undefined {
        return this.techs.get(id);
    }

    getAll(): Tech[] {
        return Array.from(this.techs.values());
    }

    private validateSafetyRails(tech: Tech) {
        if (!tech.id || !tech.name || !tech.effects) {
            throw new Error(`Invalid tech definition: ${tech.id}`);
        }
    }
}

export const registry = new TechRegistry();

// --- ENGINE ---

export class TechEngine {

    /**
     * Initializes a new player state with HoI4 defaults
     */
    static initPlayerState(factionId: string): PlayerTechState {
        return {
            factionId,
            unlockedTechs: new Set(),
            activeSlots: [
                { slotId: 'slot-1', targetTechId: null, startTime: 0, progressHours: 0 },
                { slotId: 'slot-2', targetTechId: null, startTime: 0, progressHours: 0 }
            ],
            activeEffects: [],
            maxSlots: 2,
            globalModifiers: {
                'research_speed': 1.0,
                'construction_speed': 1.0
            },
            lockedTechs: new Set()
        };
    }

    /**
     * Assigns a tech to a research slot
     */
    static assignResearch(state: PlayerTechState, slotId: string, techId: string, now: number): PlayerTechState {
        const tech = registry.get(techId);
        if (!tech) throw new Error("Tech not found");

        const newState = this.cloneState(state);
        const slot = newState.activeSlots.find(s => s.slotId === slotId);
        if (!slot) throw new Error("Slot not found");

        // Validate availability
        this.validateAvailability(newState, tech);

        // Assign
        slot.targetTechId = techId;
        slot.startTime = now;
        slot.progressHours = 0;

        return newState;
    }

    /**
     * Ticks research progress for all slots
     */
    static tickResearch(state: PlayerTechState, deltaSeconds: number): PlayerTechState {
        const newState = this.cloneState(state);
        const deltaHours = deltaSeconds / 3600;
        const speed = state.globalModifiers['research_speed'] || 1.0;

        const completedTechIds: string[] = [];

        for (const slot of newState.activeSlots) {
            if (!slot.targetTechId) continue;

            const tech = registry.get(slot.targetTechId);
            if (!tech) continue;

            // Apply progress
            const boost = slot.isBoosted ? (slot.boostValue || 1.0) : 1.0;
            slot.progressHours += deltaHours * speed * boost;

            // Check completion
            if (slot.progressHours >= tech.researchCost) {
                completedTechIds.push(tech.id);
                slot.targetTechId = null;
                slot.progressHours = 0;
            }
        }

        // Apply completed techs
        for (const tid of completedTechIds) {
            this.unlockTech(newState, tid);
        }

        return newState;
    }

    private static unlockTech(state: PlayerTechState, techId: string) {
        const tech = registry.get(techId);
        if (!tech) return;

        state.unlockedTechs.add(techId);

        // 1. Apply Effects
        for (const effect of tech.effects) {
            this.applyEffect(state, effect);
        }

        // 2. Handle Mutual Exclusivity (Doctrine Locks)
        if (tech.mutuallyExclusiveWith) {
            for (const conflictId of tech.mutuallyExclusiveWith) {
                state.lockedTechs.add(conflictId);
            }
        }
    }

    private static applyEffect(state: PlayerTechState, effect: TechEffect) {
        switch (effect.type) {
            case TechEffectType.UNLOCK_RESEARCH_SLOT:
                state.maxSlots += 1;
                state.activeSlots.push({
                    slotId: `slot-${state.maxSlots}`,
                    targetTechId: null,
                    startTime: 0,
                    progressHours: 0
                });
                break;
            case TechEffectType.MODIFIER_PERCENT:
                const current = state.globalModifiers[effect.target!] || 1.0;
                state.globalModifiers[effect.target!] = current + effect.value!;
                break;
            case TechEffectType.MODIFIER_FLAT:
                const flat = state.globalModifiers[effect.target!] || 0;
                state.globalModifiers[effect.target!] = flat + effect.value!;
                break;
            // Other system-specific effects (e.g., building unlocks) are queried via unlockedTechs set
        }
    }

    private static validateAvailability(state: PlayerTechState, tech: Tech) {
        if (state.unlockedTechs.has(tech.id)) throw new Error("Already researched");
        if (state.lockedTechs.has(tech.id)) throw new Error("Technology is mutually exclusive with an existing choice");

        // Prerequisite check
        for (const preId of tech.prerequisites) {
            if (!state.unlockedTechs.has(preId)) {
                const pre = registry.get(preId);
                throw new Error(`Missing prerequisite: ${pre ? pre.name : preId}`);
            }
        }

        // Slot check (is it already being researched?)
        const isResearching = state.activeSlots.some(s => s.targetTechId === tech.id);
        if (isResearching) throw new Error("Already being researched in another slot");
    }

    private static cloneState(state: PlayerTechState): PlayerTechState {
        return {
            ...state,
            unlockedTechs: new Set(state.unlockedTechs),
            activeSlots: state.activeSlots.map(s => ({ ...s })),
            activeEffects: [...state.activeEffects],
            globalModifiers: { ...state.globalModifiers },
            lockedTechs: new Set(state.lockedTechs)
        };
    }
}
