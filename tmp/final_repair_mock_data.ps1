$filePath = 'c:\Users\lorij\OneDrive\Desktop\Star_of_Dom\lib\ui-mock-data.ts'
$tail = @"
export const mockEspionageState: EspionageState = {
    agents: [
        {
            id: 'ag-001',
            name: 'Kaelen Voss',
            codename: 'SILENT_WATCHER',
            status: 'deployed',
            deployedToSystemId: 'crimson-expanse',
            experienceLevel: 45,
            traitIds: ['ghost', 'veteran'],
            coverStrength: 0.85,
        },
        {
            id: 'ag-002',
            name: 'Mara Jade',
            codename: 'RED_POINT',
            status: 'available',
            deployedToSystemId: null,
            experienceLevel: 32,
            traitIds: ['brutal'],
            coverStrength: 1.0,
        },
    ],
    networks: [
        {
            id: 'net-001',
            systemId: 'crimson-expanse',
            strength: 0.65,
            penetrationLevel: 'confirmed',
        },
    ],
    operations: [
        {
            id: 'op-001',
            targetFactionId: 'faction-aurelian',
            targetRegionId: 'crimson-expanse',
            domain: 'infrastructureSabotage',
            status: 'active',
            startedAt: '2026-03-14T10:00:00Z',
            completesAt: '2026-03-15T10:00:00Z',
            investmentLevel: 0.75,
        },
    ],
    candidates: [
        {
            id: 'cand-001',
            name: 'Darius Thorne',
            codename: 'NIGHTSHADE',
            traitIds: ['seducer'],
            recruitmentCost: 1500,
        },
    ],
    exposureRisk: 37,
};

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

export const mockDiplomacyState: DiplomacyState = {
    rivalries: [
        { id: 'rivalry-aurelian-vektori', empireAId: 'faction-aurelian', empireBId: 'faction-vektori', rivalryScore: 65, escalationLevel: 3, activeSanctionIds: ['trade_embargo'], detenteActive: false },
        { id: 'rivalry-aurelian-covenant', empireAId: 'faction-aurelian', empireBId: 'faction-covenant', rivalryScore: 25, escalationLevel: 0, activeSanctionIds: [], detenteActive: true },
        { id: 'rivalry-aurelian-null', empireAId: 'faction-aurelian', empireBId: 'faction-null-syndicate', rivalryScore: 45, escalationLevel: 2, activeSanctionIds: [], detenteActive: false },
    ],
    proxyConflicts: [
        {
            id: 'proxy-vektori-labor-unrest',
            systemId: 'alpha-vektori-prime',
            sponsorIds: [],
            rebelFactionId: 'rebel-labor-front',
            targetEmpireId: 'faction-vektori',
            intensity: 15,
            fundingLevel: 0,
            blowbackRisk: 5
        }
    ]
};

export const mockTechState: TechState = {
    unlockedTechIds: ['mil_1_a', 'eco_1_a', 'dip_1_a', 'cul_1_a'],
    hardLocks: [
        { domain: 'Diplomatic', tier: 2 }
    ],
    activeEffects: [],
    burnedCosts: [],
    counters: {
        enemyResentment: 2,
        internalInstability: 5
    }
};

export const mockDiscourseState: DiscourseState = {
    activeFactionId: 'military',
    messages: {
        'military': [
            { id: 'm1', speaker: 'faction', content: 'Supreme Hegemon, the fleet is ready for your command, but the logistics are strained.', timestamp: 1773664309.84656000 },
        ]
    },
    isGenerating: false
};

export const mockCorporateState: CorporateState = {
    companies: [
        {
            id: 'company-aurelian-spice',
            fullName: 'Aurelian Spice Charter Company',
            foundingFactionId: 'faction-aurelian',
            sharePrice: 24.80,
            sharePricePrev: 22.10,
            sharesOutstanding: 1_000_000,
            treasury: 420_000,
            dividendsPaidTotal: 65_000,
            privateFleetSize: 18,
            autonomyLevel: 45,
            corruptionIndex: 22,
            activeTradeRouteIds: ['route-1', 'route-2'],
            monopolySystemsCount: 4,
            corporateColoniesCount: 2,
            powers: [CharterPower.MONOPOLY, CharterPower.GOVERNANCE],
        },
        {
            id: 'company-vektori-deep-rim',
            fullName: 'Vektori Deep Rim Charter Company',
            foundingFactionId: 'faction-vektori',
            sharePrice: 11.30,
            sharePricePrev: 13.40,
            sharesOutstanding: 2_000_000,
            treasury: 198_000,
            dividendsPaidTotal: 21_000,
            privateFleetSize: 7,
            autonomyLevel: 72,
            corruptionIndex: 58,
            activeTradeRouteIds: ['route-3'],
            monopolySystemsCount: 2,
            corporateColoniesCount: 0,
            powers: [CharterPower.MONOPOLY, CharterPower.PARAMILITARY],
        },
        {
            id: 'company-covenant-relics',
            fullName: 'Covenant Relics Charter Company',
            foundingFactionId: 'faction-covenant',
            sharePrice: 18.60,
            sharePricePrev: 18.55,
            sharesOutstanding: 500_000,
            treasury: 312_000,
            dividendsPaidTotal: 48_000,
            privateFleetSize: 12,
            autonomyLevel: 30,
            corruptionIndex: 5,
            activeTradeRouteIds: ['route-4', 'route-5', 'route-6'],
            monopolySystemsCount: 6,
            corporateColoniesCount: 1,
            powers: [CharterPower.MONOPOLY, CharterPower.GOVERNANCE],
        },
    ],
    markets: [
        { resource: Resource.METALS, currentPrice: 13.4, basePrice: 10, supply: 18400, demand: 21200 },
        { resource: Resource.CHEMICALS, currentPrice: 8.7, basePrice: 10, supply: 22000, demand: 17500 },
        { resource: Resource.FOOD, currentPrice: 16.2, basePrice: 10, supply: 9800, demand: 14300 },
        { resource: Resource.ENERGY, currentPrice: 11.1, basePrice: 10, supply: 15000, demand: 15900 },
        { resource: Resource.RARES, currentPrice: 32.6, basePrice: 10, supply: 3200, demand: 5100 },
    ],
    playerPortfolioValue: 125000,
    totalDividendsReceived: 12400,
};
"@

$head = Get-Content -Path $filePath -TotalCount 16645
# Truncate and write
$head | Set-Content -Path $filePath -Encoding utf8
Add-Content -Path $filePath -Value $tail -Encoding utf8
