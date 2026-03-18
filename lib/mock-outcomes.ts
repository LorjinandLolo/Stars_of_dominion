import { CivilizationalOutcome } from '@/types/ui-state';

export const mockCivilizationalOutcomes: CivilizationalOutcome[] = [
    {
        factionId: 'faction-aurelian',
        title: 'Imperial Hegemon',
        summary: 'The Aurelian Combine expanded its institutional grip across Crimson Expanse, leveraging Council blocs and trade infrastructure to enforce a new regional order.',
        metricsSnapshot: {
            controlledSystems: 48,
            tradeVolume: 3900,
            stabilityIndex: 74,
            councilInfluence: 58,
        },
        conflictsWithOutcomeIds: ['faction-vektori'],
    },
    {
        factionId: 'faction-null-syndicate',
        title: 'Shadow Sovereign',
        summary: 'Operating from the margins, the Null Syndicate built an unassailable black market empire in the Nullward Fringe.',
        metricsSnapshot: {
            controlledSystems: 22,
            blackMarketLiquidity: 88,
            networkControl: 72,
            infamy: 54,
        },
        conflictsWithOutcomeIds: [],
    },
];
