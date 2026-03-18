import { SeasonState } from '@/types/ui-state';

export const mockSeasonState: SeasonState = {
    phase: 'active',
    seasonNumber: 2,
    regionalLocks: {
        'crimson-expanse': 'unlocked',
        'veldt-dominion': 'unlocked',
        'middle-rim': 'unlocked',
    },
    nearLockRegionIds: [],
};
