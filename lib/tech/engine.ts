import {
    Tech, PlayerTechState, GameStateContext,
    TechTreeType, TechTier, TechEffectType, TechEffect,
    ResearchSlot
} from './types';
// time-config holds only constants and type-only imports, so pulling the tick
// length in here cannot create a cycle back through the tick processor.
import { TICK_INTERVAL_HOURS } from '../time/time-config';

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
        if (!tech.id || !tech.name || tech.tree === undefined || tech.tier === undefined) {
            throw new Error(`Invalid tech definition: ${tech.id || 'unknown'}`);
        }
    }
}

export const registry = new TechRegistry();

// --- SHARED UNLOCK PATH ---

/**
 * Convert a tech's `researchCost` (base hours) into whole strategic ticks.
 * The worker counts progress in ticks, the catalog is authored in hours; this
 * is the only place the two units meet.
 */
export function ticksForTech(tech: Tech, costMultiplier = 1): number {
    return Math.max(1, Math.ceil((tech.researchCost * costMultiplier) / TICK_INTERVAL_HOURS));
}

function applyEffect(state: PlayerTechState, effect: TechEffect) {
    switch (effect.type) {
        case TechEffectType.MODIFIER_PERCENT:
            if (effect.modifierKey) {
                const key = effect.modifierKey;
                const current = state.globalModifiers[key] ?? 1.0;
                state.globalModifiers[key] = current + (effect.value ?? 0);
            }
            break;
        case TechEffectType.MODIFIER_FLAT:
            if (effect.modifierKey) {
                const key = effect.modifierKey;
                const flat = state.globalModifiers[key] ?? 0;
                state.globalModifiers[key] = flat + (effect.value ?? 0);
            }
            break;
    }

    // Always store active effects for lookup by other systems
    state.activeEffects.push(effect);
}

/**
 * Record `techId` as unlocked on `state`, apply its effects, and lock out any
 * mutually exclusive siblings. Mutates `state` in place.
 *
 * This is the single unlock path. The tick worker used to re-implement it
 * inline and had already drifted from the engine; every caller — research
 * completion, debug grants, and later diffusion/emergent grants — must come
 * through here so identity locking can never be skipped.
 */
export function applyUnlock(state: PlayerTechState, techId: string): void {
    const tech = registry.get(techId);
    if (!tech) return;

    // Worlds deserialized from the DB can arrive without these populated.
    if (!state.unlockedTechIds) state.unlockedTechIds = [];
    if (!state.globalModifiers) state.globalModifiers = {};
    if (!state.activeEffects) state.activeEffects = [];
    if (!state.lockedTechIds) state.lockedTechIds = [];

    if (state.unlockedTechIds.includes(techId)) return; // already applied
    state.unlockedTechIds.push(techId);

    // 1. Apply Effects
    for (const effect of tech.effects ?? []) {
        applyEffect(state, effect);

        // Research capacity grows here rather than at the call sites, so a slot
        // granted by research, by a diffusion grant, or by an emergent unlock all
        // arrive the same way. TECH_START_RESEARCH's "find an empty slot" logic
        // needs no change — it simply finds one more.
        if (effect.type === TechEffectType.UNLOCK_RESEARCH_SLOT) {
            if (!state.activeSlots) state.activeSlots = [];
            state.maxSlots = (state.maxSlots ?? state.activeSlots.length) + 1;
            state.activeSlots.push({
                slotId: `slot-${state.maxSlots}`,
                techId: null,
                startTime: 0,
                progressHours: 0,
                ticksCompleted: 0,
                ticksRequired: 0,
                status: 'empty',
            });
        }
    }

    // 2. Handle Mutual Exclusivity (Identity/Branch Locking)
    if (tech.mutuallyExclusiveGroup) {
        // Find all other techs in this group and lock them
        const groupConflictTechs = registry.getAll().filter(t =>
            t.mutuallyExclusiveGroup === tech.mutuallyExclusiveGroup &&
            t.id !== tech.id
        );

        for (const conflict of groupConflictTechs) {
            if (!state.lockedTechIds.includes(conflict.id)) {
                state.lockedTechIds.push(conflict.id);
            }
        }
    }
}

// --- ENGINE ---

export class TechEngine {

    /**
     * Initializes a new player state with HoI4 defaults
     */
    static initPlayerState(factionId: string): PlayerTechState {
        return {
            factionId,
            unlockedTechIds: [],
            activeSlots: [
                { slotId: 'slot-1', techId: null, startTime: 0, progressHours: 0, ticksCompleted: 0, ticksRequired: 0, status: 'empty' }
            ],
            activeEffects: [],
            maxSlots: 1,
            globalModifiers: {
                'research_speed': 1.0,
                'construction_speed': 1.0
            },
            researchPoints: 0,
            lockedTechIds: []
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

        // Assign. ticksRequired is what the strategic tick worker counts down;
        // leaving it at 0 (the old behaviour) meant research never completed in
        // the live game, because the worker's completion check treats a missing
        // requirement as "not ready" forever.
        slot.techId = techId;
        slot.status = 'researching';
        slot.startTime = now;
        slot.progressHours = 0;
        slot.ticksCompleted = 0;
        // A tech the faction's own conduct revealed runs as a crash programme.
        slot.ticksRequired = ticksForTech(tech, newState.emergentDiscounts?.[techId] ?? 1);

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
            if (!slot.techId) continue;

            const tech = registry.get(slot.techId);
            if (!tech) continue;

            // Apply progress
            const boost = slot.isBoosted ? (slot.boostValue || 1.0) : 1.0;
            slot.progressHours += deltaHours * speed * boost;

            // Check completion
            if (slot.progressHours >= tech.researchCost) {
                completedTechIds.push(tech.id);
                slot.techId = null;
                slot.status = 'complete';
                slot.progressHours = 0;
            }
        }

        // Apply completed techs
        for (const tid of completedTechIds) {
            applyUnlock(newState, tid);
        }

        return newState;
    }

    private static validateAvailability(state: PlayerTechState, tech: Tech) {
        if (state.unlockedTechIds.includes(tech.id)) throw new Error("Already researched");
        if (state.lockedTechIds.includes(tech.id)) throw new Error("Technology is mutually exclusive with an existing choice");

        // Dedicated emergent techs have no place in the tree — they exist only
        // once a faction's own history has revealed them. Catalog techs that an
        // emergent trigger merely discounts stay normally researchable, so a
        // reveal is always a bonus and never removes an existing path.
        if (tech.id.startsWith('emg_') && !(state.revealedEmergentTechIds ?? []).includes(tech.id)) {
            throw new Error("This doctrine has not emerged from our history yet");
        }

        // Group-based locking check
        if (tech.mutuallyExclusiveGroup) {
            const alreadyPickedInGroup = state.unlockedTechIds.some(uid => {
                const ut = registry.get(uid);
                return ut?.mutuallyExclusiveGroup === tech.mutuallyExclusiveGroup;
            });
            if (alreadyPickedInGroup) throw new Error("A different path in this branch has already been chosen");
        }

        // Prerequisite check. A reveal may have waived some of the chain —
        // conduct stood in for the missing theory — so those are skipped.
        const waived = state.emergentWaivedPrereqs?.[tech.id] ?? [];
        for (const preId of tech.prerequisites) {
            if (waived.includes(preId)) continue;
            if (!state.unlockedTechIds.includes(preId)) {
                const pre = registry.get(preId);
                throw new Error(`Missing prerequisite: ${pre ? pre.name : preId}`);
            }
        }

        // Slot check (is it already being researched?)
        const isResearching = state.activeSlots.some(s => s.techId === tech.id);
        if (isResearching) throw new Error("Already being researched in another slot");
    }

    private static cloneState(state: PlayerTechState): PlayerTechState {
        return {
            ...state,
            unlockedTechIds: [...state.unlockedTechIds],
            activeSlots: state.activeSlots.map(s => ({ ...s })),
            activeEffects: [...state.activeEffects.map(e => ({ ...e }))],
            globalModifiers: { ...state.globalModifiers },
            lockedTechIds: [...state.lockedTechIds]
        };
    }
}
