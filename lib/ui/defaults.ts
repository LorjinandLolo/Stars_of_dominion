import { 
    CouncilState, 
    PlayerState, 
    SeasonState, 
    EspionageState, 
    DiplomacyState, 
    PoliticsState, 
    TechState, 
    DiscourseState, 
    CorporateState,
    PressState,
    EmpireIdentityState
} from '@/types/ui-state';

export const defaultCouncilState: CouncilState = {
    status: 'absent',
    legitimacy: 0,
    cohesion: 0,
    polarization: 0,
    enforcementCapacity: 0,
    corruptionExposure: 0,
    emergencySession: false,
};

export const defaultPlayerState: PlayerState = {
    factionId: '',
    role: 'sovereign',
    credits: 0,
    pirateInvolvementScore: 0,
    infamy: 0,
    heat: 0,
    networkControl: 0,
    blackMarketLiquidity: 0,
    crewLoyalty: 0,
};

export const defaultSeasonState: SeasonState = {
    phase: 'active',
    season: 1,
    regionalLocks: {},
    nearLockRegionIds: [],
};

export const defaultEspionageState: EspionageState = {
    agents: [],
    networks: [],
    operations: [],
    candidates: [],
    exposureRisk: 0,
};

export const defaultDiplomacyState: DiplomacyState = {
    rivalries: [],
    proxyConflicts: [],
    treaties: [],
    tradePacts: [],
    tributes: [],
};

export const defaultPoliticsState: PoliticsState = {
    blocs: [],
    activePolicies: [],
    crisisConditionMet: false,
    activeIndicators: [],
    allFactions: [],
};

export const defaultTechState: TechState = {
    unlockedTechIds: [],
    hardLocks: [],
    activeEffects: [],
    burnedCosts: [],
    counters: {
        enemyResentment: 0,
        internalInstability: 0,
    },
};

export const defaultDiscourseState: DiscourseState = {
    activeFactionId: null,
    messages: {},
    isGenerating: false,
};

export const defaultCorporateState: CorporateState = {
    companies: [],
    markets: [],
    playerPortfolioValue: 0,
    totalDividendsReceived: 0,
};

export const defaultEmpireIdentityState: EmpireIdentityState = {
    leadership: {
        leaders: new Map(),
        recruitmentPool: [],
        nowSeconds: 0,
    },
    doctrines: {
        factionId: '',
        activeDoctrines: {
            military: null,
            economic: null,
            intelligence: null
        },
        lastChangeTimestamps: {
            military: 0,
            economic: 0,
            intelligence: 0
        }
    },
    reputation: {},
};
