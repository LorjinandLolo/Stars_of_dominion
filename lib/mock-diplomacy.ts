import { DiplomacyState } from '@/types/ui-state';

export const mockDiplomacyState: DiplomacyState = {
    rivalries: [
        { id: 'rivalry-1', empireAId: 'faction-aurelian', empireBId: 'faction-vektori', rivalryScore: 65, escalationLevel: 3, activeSanctionIds: ['trade_embargo'], detenteActive: false },
    ],
    proxyConflicts: [
        {
            id: 'proxy-1',
            systemId: 'alpha-vektori-prime',
            sponsorIds: [],
            rebelFactionId: 'rebel-front',
            targetEmpireId: 'faction-vektori',
            intensity: 15,
            fundingLevel: 0,
            blowbackRisk: 5
        }
    ],
    treaties: [
        { id: 'treaty-1', type: 'non_aggression', signatories: ['faction-aurelian', 'faction-covenant'], signedAtTick: 1000, status: 'active' }
    ],
    tradePacts: [
        { id: 'pact-1', empireAId: 'faction-aurelian', empireBId: 'faction-covenant', resourceAdjustments: { 'energy': 1.1 }, tariffExemption: true, signedAtTick: 1200 }
    ],
    tributes: [
        { id: 'tribute-1', vassalId: 'faction-null-syndicate', overlordId: 'faction-vektori', resourceType: 'credits', amountPerTick: 50, status: 'active' }
    ]
};
