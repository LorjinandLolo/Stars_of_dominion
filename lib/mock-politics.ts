import { PoliticsState } from '@/types/ui-state';

export const mockPoliticsState: PoliticsState = {
    blocs: [
        { id: 'military', name: 'Military High Command', influence: 35, satisfaction: 42, trend: -0.1, isCrisisContributor: true },
        { id: 'trade', name: 'Mercantile Guild', influence: 30, satisfaction: 78, trend: 0.2, isCrisisContributor: false },
        { id: 'science', name: 'Science Directorate', influence: 20, satisfaction: 65, trend: 0.0, isCrisisContributor: false },
        { id: 'frontier', name: 'Frontier Pioneers', influence: 15, satisfaction: 55, trend: 0.1, isCrisisContributor: false },
    ],
    activePolicies: ['open_trade', 'research_push'],
    crisisConditionMet: false,
    activeIndicators: ['lowBlocSatisfaction'],
};
