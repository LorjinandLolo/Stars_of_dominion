import { SeasonState } from '@/types/ui-state';

export const mockSeasonState: SeasonState = {
    phase: 'active',
    season: 2,
    regionalLocks: {
        'crimson-expanse': 'unlocked',
        'veldt-dominion': 'unlocked',
        'middle-rim': 'unlocked',
    },
    nearLockRegionIds: [],
};
