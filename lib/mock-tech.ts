import { TechState } from '@/types/ui-state';

export const mockTechState: TechState = {
    unlockedTechIds: ['mil_plt_1', 'eco_tra_1', 'dip_emb_1', 'cul_har_1'],
    lockedTechIds: [],
    activeSlots: [
        { slotId: 'slot-1', techId: 'mil_inf_1', startTime: Date.now() / 1000 - 3600, progressHours: 24, ticksCompleted: 4, ticksRequired: 12, status: 'researching' }
    ],
    maxSlots: 1,
    globalModifiers: {
        'research_speed': 1.0,
        'construction_speed': 1.0
    },
    hardLocks: [
        { domain: 'Military', tier: 4 }
    ],
    activeEffects: [
        { id: 'eff-1', sourceTechId: 'eco_tra_1', type: 'unlock', description: 'Chartered Companies enabled' }
    ],
    burnedCosts: [],
    counters: {
        enemyResentment: 0,
        internalInstability: 5
    }
};
