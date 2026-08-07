/**
 * lib/economy/corporate/charter-catalog.ts
 * Static definitions for the Charter Corporation layer.
 *
 * Everything here is data the simulation reads but never mutates: what each
 * mission is good at, what each right costs the state in control, how each
 * personality weights its own decisions, and the templates for demands,
 * crises and megaprojects.
 */

import type {
    CorporateMission,
    CorporateRight,
    RightCategory,
    CorporatePersonality,
    CorporateAssetType,
    CorporateDemandType,
    CorporateCrisisType,
    CrisisOption,
    CorporateActionType,
    OperatingTerritory,
} from './charter-types';

// ─── Missions ────────────────────────────────────────────────────────────────

export interface MissionDef {
    id: CorporateMission;
    name: string;
    description: string;
    /** Asset types this mission builds when it expands. */
    assetTypes: CorporateAssetType[];
    /** Multiplier on toll + asset revenue. */
    revenueMultiplier: number;
    /** Multiplier on the credit cost of each expansion step. */
    expansionCostMultiplier: number;
    /** Personalities this mission tends to produce. */
    personalityBias: CorporatePersonality[];
}

export const MISSION_DEFS: Record<CorporateMission, MissionDef> = {
    mining: {
        id: 'mining',
        name: 'Mining',
        description: 'Strips ore from claimed bodies and sells it into the galactic market.',
        assetTypes: ['mining_outpost', 'warehouse'],
        revenueMultiplier: 1.15,
        expansionCostMultiplier: 0.9,
        personalityBias: ['profit_driven', 'corrupt', 'expansionist'],
    },
    colonization: {
        id: 'colonization',
        name: 'Colonization',
        description: 'Settles frontier systems on the government\'s behalf, at its own expense.',
        assetTypes: ['colony_seed', 'warehouse', 'trade_station'],
        revenueMultiplier: 0.85,
        expansionCostMultiplier: 1.35,
        personalityBias: ['expansionist', 'humanitarian', 'state_loyalist'],
    },
    trade: {
        id: 'trade',
        name: 'Trade',
        description: 'Runs commodity houses and takes a cut of everything that moves.',
        assetTypes: ['trade_station', 'warehouse'],
        revenueMultiplier: 1.25,
        expansionCostMultiplier: 1.0,
        personalityBias: ['profit_driven', 'monopolist'],
    },
    banking: {
        id: 'banking',
        name: 'Banking',
        description: 'Lends to governments. Owns their debts, and therefore their choices.',
        assetTypes: ['bank_branch'],
        revenueMultiplier: 1.4,
        expansionCostMultiplier: 1.2,
        personalityBias: ['conservative', 'profit_driven', 'monopolist'],
    },
    logistics: {
        id: 'logistics',
        name: 'Logistics',
        description: 'Freight, hauling and depot networks. Unglamorous, indispensable.',
        assetTypes: ['warehouse', 'trade_station'],
        revenueMultiplier: 1.1,
        expansionCostMultiplier: 0.85,
        personalityBias: ['expansionist', 'monopolist', 'conservative'],
    },
    shipbuilding: {
        id: 'shipbuilding',
        name: 'Shipbuilding',
        description: 'Private yards. Builds its own escorts as readily as the navy\'s hulls.',
        assetTypes: ['shipyard', 'defence_platform'],
        revenueMultiplier: 1.05,
        expansionCostMultiplier: 1.25,
        personalityBias: ['militarist', 'innovative', 'profit_driven'],
    },
    research: {
        id: 'research',
        name: 'Research',
        description: 'Corporate laboratories. Patents first, publication never.',
        assetTypes: ['research_lab'],
        revenueMultiplier: 0.95,
        expansionCostMultiplier: 1.15,
        personalityBias: ['innovative', 'conservative'],
    },
    extraction: {
        id: 'extraction',
        name: 'Resource Extraction',
        description: 'Gas, volatiles and exotics, pulled out of places nobody else will work.',
        assetTypes: ['mining_outpost', 'defence_platform', 'warehouse'],
        revenueMultiplier: 1.3,
        expansionCostMultiplier: 1.05,
        personalityBias: ['corrupt', 'profit_driven', 'militarist'],
    },
};

// ─── Operating territory ─────────────────────────────────────────────────────

export interface TerritoryDef {
    id: OperatingTerritory;
    name: string;
    description: string;
    /** How many systems the company may hold assets in. */
    reachCap: number;
    /** Autonomy drift multiplier — the further it roams, the less it obeys. */
    autonomyDrift: number;
    /** Political capital charged at founding. */
    charterCost: number;
    /** Whether the charter permits assets outside the founder's borders. */
    foreignOperations: boolean;
}

export const TERRITORY_DEFS: Record<OperatingTerritory, TerritoryDef> = {
    domestic: {
        id: 'domestic',
        name: 'Domestic Only',
        description: 'Operations confined to systems the founding empire already holds.',
        reachCap: 6,
        autonomyDrift: 0.6,
        charterCost: 20,
        foreignOperations: false,
    },
    frontier: {
        id: 'frontier',
        name: 'Frontier',
        description: 'Unclaimed and border systems. The classic charter-company remit.',
        reachCap: 12,
        autonomyDrift: 1.0,
        charterCost: 40,
        foreignOperations: false,
    },
    allied: {
        id: 'allied',
        name: 'Allied Empires',
        description: 'May trade and build inside the territory of treaty partners.',
        reachCap: 18,
        autonomyDrift: 1.3,
        charterCost: 60,
        foreignOperations: true,
    },
    neutral: {
        id: 'neutral',
        name: 'Neutral Space',
        description: 'Anywhere no empire claims, and anywhere that will have it.',
        reachCap: 24,
        autonomyDrift: 1.6,
        charterCost: 80,
        foreignOperations: true,
    },
    galactic: {
        id: 'galactic',
        name: 'Entire Galaxy',
        description: 'No territorial limit whatsoever. Rarely granted twice.',
        reachCap: 40,
        autonomyDrift: 2.1,
        charterCost: 120,
        foreignOperations: true,
    },
};

// ─── Rights ──────────────────────────────────────────────────────────────────

export interface RightDef {
    id: CorporateRight;
    category: RightCategory;
    name: string;
    description: string;
    /** Political capital charged at founding for granting it. */
    charterCost: number;
    /** Added to the company's per-cycle autonomy drift. */
    autonomyWeight: number;
    /** Added to the company's influence ceiling contribution. */
    influenceWeight: number;
}

export const RIGHT_DEFS: Record<CorporateRight, RightDef> = {
    // Economic
    build_infrastructure: {
        id: 'build_infrastructure', category: 'economic', name: 'Build Infrastructure',
        description: 'May raise depots, relays and stations at its own cost.',
        charterCost: 10, autonomyWeight: 0.15, influenceWeight: 4,
    },
    establish_colonies: {
        id: 'establish_colonies', category: 'economic', name: 'Establish Colonies',
        description: 'May plant settlements on unclaimed worlds.',
        charterCost: 25, autonomyWeight: 0.35, influenceWeight: 8,
    },
    own_stations: {
        id: 'own_stations', category: 'economic', name: 'Own Orbital Stations',
        description: 'Holds title to orbital infrastructure outright.',
        charterCost: 15, autonomyWeight: 0.2, influenceWeight: 5,
    },
    purchase_land: {
        id: 'purchase_land', category: 'economic', name: 'Purchase Land',
        description: 'May buy surface tracts from the crown and from private holders.',
        charterCost: 10, autonomyWeight: 0.15, influenceWeight: 4,
    },
    collect_fees: {
        id: 'collect_fees', category: 'economic', name: 'Collect Fees',
        description: 'Charges docking, transit and handling fees on its own works.',
        charterCost: 15, autonomyWeight: 0.2, influenceWeight: 5,
    },
    // Military
    armed_escorts: {
        id: 'armed_escorts', category: 'military', name: 'Armed Escorts',
        description: 'Arms its own freighters. The first step nobody thinks twice about.',
        charterCost: 15, autonomyWeight: 0.25, influenceWeight: 3,
    },
    security_forces: {
        id: 'security_forces', category: 'military', name: 'Security Forces',
        description: 'Keeps uniformed personnel on its own property.',
        charterCost: 20, autonomyWeight: 0.3, influenceWeight: 4,
    },
    mercenary_recruitment: {
        id: 'mercenary_recruitment', category: 'military', name: 'Mercenary Recruitment',
        description: 'Hires soldiers on the open market without state approval.',
        charterCost: 35, autonomyWeight: 0.5, influenceWeight: 6,
    },
    defensive_stations: {
        id: 'defensive_stations', category: 'military', name: 'Defensive Stations',
        description: 'Fortifies its holdings against raiders — and against recovery.',
        charterCost: 30, autonomyWeight: 0.4, influenceWeight: 5,
    },
    private_fleets: {
        id: 'private_fleets', category: 'military', name: 'Private Fleets',
        description: 'Maintains warships. At scale, a second navy answering to a board.',
        charterCost: 50, autonomyWeight: 0.75, influenceWeight: 10,
    },
    // Political
    negotiate_agreements: {
        id: 'negotiate_agreements', category: 'political', name: 'Negotiate Local Agreements',
        description: 'Signs its own accords with local authorities and foreign powers.',
        charterCost: 30, autonomyWeight: 0.5, influenceWeight: 8,
    },
    administer_territories: {
        id: 'administer_territories', category: 'political', name: 'Administer Frontier Territories',
        description: 'Acts as the civil authority where the state has no presence.',
        charterCost: 45, autonomyWeight: 0.7, influenceWeight: 12,
    },
    collect_tariffs: {
        id: 'collect_tariffs', category: 'political', name: 'Collect Tariffs',
        description: 'Levies customs in its own name at its own ports.',
        charterCost: 40, autonomyWeight: 0.6, influenceWeight: 10,
    },
    govern_colonies: {
        id: 'govern_colonies', category: 'political', name: 'Govern Colonies',
        description: 'Full civil jurisdiction over corporate settlements. Courts included.',
        charterCost: 60, autonomyWeight: 0.9, influenceWeight: 14,
    },
};

/** Rights grouped for the charter-writing UI. */
export const RIGHTS_BY_CATEGORY: Record<RightCategory, CorporateRight[]> = {
    economic: ['build_infrastructure', 'establish_colonies', 'own_stations', 'purchase_land', 'collect_fees'],
    military: ['armed_escorts', 'security_forces', 'mercenary_recruitment', 'defensive_stations', 'private_fleets'],
    political: ['negotiate_agreements', 'administer_territories', 'collect_tariffs', 'govern_colonies'],
};

// ─── Personalities ───────────────────────────────────────────────────────────

export interface PersonalityDef {
    id: CorporatePersonality;
    name: string;
    creed: string;
    /**
     * Relative weight per growth action. The growth engine filters to what the
     * company can currently afford and is legally allowed to do, then picks by
     * weight — so personality shows up as a tendency, not a script.
     */
    weights: Partial<Record<CorporateActionType, number>>;
    /** Fraction of treasury the company refuses to spend. */
    reserveFloor: number;
    /** Multiplier on natural autonomy drift. */
    autonomyDrift: number;
    /** Multiplier on corruption accumulation. */
    corruptionDrift: number;
    /** How readily it lobbies: multiplier on demand frequency. */
    demandRate: number;
}

export const PERSONALITY_DEFS: Record<CorporatePersonality, PersonalityDef> = {
    expansionist: {
        id: 'expansionist', name: 'Expansionist',
        creed: 'Growth now, margins later.',
        weights: { built_asset: 5, opened_route: 3, entered_market: 3, hired_workers: 2, expanded_fleet: 1 },
        reserveFloor: 0.05, autonomyDrift: 1.2, corruptionDrift: 1.0, demandRate: 1.3,
    },
    conservative: {
        id: 'conservative', name: 'Conservative',
        creed: 'A full vault outlasts a bold plan.',
        weights: { hoarded_reserves: 5, built_asset: 2, hired_workers: 2, opened_route: 1 },
        reserveFloor: 0.45, autonomyDrift: 0.7, corruptionDrift: 0.6, demandRate: 0.7,
    },
    innovative: {
        id: 'innovative', name: 'Innovative',
        creed: 'The patent is the moat.',
        weights: { funded_research: 5, built_asset: 3, hired_workers: 2, entered_market: 2 },
        reserveFloor: 0.15, autonomyDrift: 1.0, corruptionDrift: 0.7, demandRate: 1.0,
    },
    militarist: {
        id: 'militarist', name: 'Militarist',
        creed: 'Property that cannot be defended is not property.',
        weights: { expanded_fleet: 5, built_asset: 2, price_war: 1, acquired_rival: 1 },
        reserveFloor: 0.1, autonomyDrift: 1.5, corruptionDrift: 1.1, demandRate: 1.2,
    },
    monopolist: {
        id: 'monopolist', name: 'Monopolist',
        creed: 'Competition is an accounting error.',
        weights: { acquired_rival: 5, price_war: 4, entered_market: 3, built_asset: 2 },
        reserveFloor: 0.2, autonomyDrift: 1.3, corruptionDrift: 1.2, demandRate: 1.5,
    },
    humanitarian: {
        id: 'humanitarian', name: 'Humanitarian',
        creed: 'A prosperous colony buys more than a garrison.',
        weights: { improved_colony: 5, hired_workers: 4, built_asset: 2, funded_research: 1 },
        reserveFloor: 0.15, autonomyDrift: 0.8, corruptionDrift: 0.4, demandRate: 0.8,
    },
    corrupt: {
        id: 'corrupt', name: 'Corrupt',
        creed: 'Every regulation has a price list.',
        weights: { bribed_officials: 5, built_asset: 2, acquired_rival: 2, hoarded_reserves: 1 },
        reserveFloor: 0.1, autonomyDrift: 1.4, corruptionDrift: 2.2, demandRate: 1.4,
    },
    state_loyalist: {
        id: 'state_loyalist', name: 'State Loyalist',
        creed: 'The charter is a duty, not a licence.',
        weights: { built_asset: 4, hired_workers: 3, improved_colony: 3, opened_route: 2 },
        reserveFloor: 0.2, autonomyDrift: 0.35, corruptionDrift: 0.5, demandRate: 0.4,
    },
    profit_driven: {
        id: 'profit_driven', name: 'Profit Driven',
        creed: 'Whatever returns most, this quarter.',
        weights: { opened_route: 4, built_asset: 4, entered_market: 3, withheld_investment: 1, acquired_rival: 2 },
        reserveFloor: 0.12, autonomyDrift: 1.1, corruptionDrift: 1.0, demandRate: 1.2,
    },
};

// ─── Asset economics ─────────────────────────────────────────────────────────

export interface AssetDef {
    type: CorporateAssetType;
    name: string;
    cost: number;
    incomePerTick: number;
    upkeepPerTick: number;
    /** Right the charter must contain before this can be built. */
    requiredRight?: CorporateRight;
}

export const ASSET_DEFS: Record<CorporateAssetType, AssetDef> = {
    trade_station: { type: 'trade_station', name: 'Trade Station', cost: 18_000, incomePerTick: 340, upkeepPerTick: 60, requiredRight: 'own_stations' },
    mining_outpost: { type: 'mining_outpost', name: 'Mining Outpost', cost: 14_000, incomePerTick: 300, upkeepPerTick: 55, requiredRight: 'purchase_land' },
    warehouse: { type: 'warehouse', name: 'Bonded Warehouse', cost: 8_000, incomePerTick: 150, upkeepPerTick: 25, requiredRight: 'build_infrastructure' },
    shipyard: { type: 'shipyard', name: 'Private Shipyard', cost: 30_000, incomePerTick: 520, upkeepPerTick: 130, requiredRight: 'build_infrastructure' },
    research_lab: { type: 'research_lab', name: 'Corporate Laboratory', cost: 22_000, incomePerTick: 330, upkeepPerTick: 90, requiredRight: 'build_infrastructure' },
    bank_branch: { type: 'bank_branch', name: 'Clearing House', cost: 16_000, incomePerTick: 400, upkeepPerTick: 45 },
    colony_seed: { type: 'colony_seed', name: 'Colonial Charter Settlement', cost: 40_000, incomePerTick: 620, upkeepPerTick: 180, requiredRight: 'establish_colonies' },
    defence_platform: { type: 'defence_platform', name: 'Defence Platform', cost: 25_000, incomePerTick: 90, upkeepPerTick: 110, requiredRight: 'defensive_stations' },
};

// ─── Demand templates ────────────────────────────────────────────────────────

export interface DemandDef {
    type: CorporateDemandType;
    /** Minimum influence before the company dares raise it. */
    minInfluence: number;
    /** Minimum autonomy before it is even considered. */
    minAutonomy: number;
    severity: number;
    text: string;
    concession: string;
    threat: string;
    /** Applied to the company when the state accepts. */
    onAccept: { autonomy?: number; loyalty?: number; influence?: number; treasury?: number; corruption?: number };
    /** Applied when the state refuses. */
    onReject: { autonomy?: number; loyalty?: number; influence?: number; treasury?: number };
    /** Applied to the government when the state accepts. */
    stateOnAccept: { approval?: number; politicalCapital?: number; credits?: number; stability?: number };
    /** Applied to the government when the state refuses. */
    stateOnReject: { approval?: number; politicalCapital?: number; credits?: number; stability?: number };
}

export const DEMAND_DEFS: Record<CorporateDemandType, DemandDef> = {
    lower_taxes: {
        type: 'lower_taxes', minInfluence: 15, minAutonomy: 0, severity: 1,
        text: 'We request a reduction in the state\'s share of our returns.',
        concession: 'Profit share to the treasury drops by 5 points.',
        threat: 'Capital is redirected to friendlier jurisdictions.',
        onAccept: { loyalty: 8, treasury: 6_000 },
        onReject: { loyalty: -10, autonomy: 3 },
        stateOnAccept: { approval: -1 },
        stateOnReject: { approval: -2, stability: -0.01 },
    },
    monopoly_protection: {
        type: 'monopoly_protection', minInfluence: 25, minAutonomy: 0, severity: 2,
        text: 'We require exclusive rights in the markets we opened.',
        concession: 'Rival companies are barred from the company\'s core systems.',
        threat: 'The company undercuts its competitors until the market is bare.',
        onAccept: { loyalty: 10, influence: 5, treasury: 10_000 },
        onReject: { loyalty: -12, autonomy: 4 },
        stateOnAccept: { approval: -3, politicalCapital: -5 },
        stateOnReject: { approval: 1 },
    },
    expansion_rights: {
        type: 'expansion_rights', minInfluence: 30, minAutonomy: 15, severity: 2,
        text: 'Permit our expansion into allied territory.',
        concession: 'Charter territory widens one step.',
        threat: 'The company negotiates its own access, with or without a licence.',
        onAccept: { autonomy: 5, loyalty: 6, influence: 6 },
        onReject: { loyalty: -12, autonomy: 6 },
        stateOnAccept: { politicalCapital: -10 },
        stateOnReject: { approval: -1 },
    },
    military_spending: {
        type: 'military_spending', minInfluence: 30, minAutonomy: 10, severity: 2,
        text: 'The lanes are unsafe. Increase naval appropriations — or licence ours.',
        concession: 'The treasury underwrites the company\'s escort programme.',
        threat: 'The company arms itself regardless and bills nobody.',
        onAccept: { loyalty: 10, treasury: 12_000 },
        onReject: { loyalty: -8, autonomy: 5 },
        stateOnAccept: { credits: -12_000, approval: 2 },
        stateOnReject: { approval: -1 },
    },
    deregulation: {
        type: 'deregulation', minInfluence: 35, minAutonomy: 20, severity: 2,
        text: 'Remove the environmental and labour restrictions on our operations.',
        concession: 'Oversight is lifted; output rises and so does resentment.',
        threat: 'Compliance costs are passed to the state as reduced returns.',
        onAccept: { treasury: 15_000, corruption: 8, loyalty: 6 },
        onReject: { loyalty: -9, autonomy: 3 },
        stateOnAccept: { approval: -5, stability: -0.02 },
        stateOnReject: { approval: 2 },
    },
    state_contract: {
        type: 'state_contract', minInfluence: 20, minAutonomy: 0, severity: 1,
        text: 'Award us the standing supply contract for the fleet.',
        concession: 'The treasury pays a retainer; the company\'s books improve.',
        threat: 'The company prioritises foreign buyers at the next shortage.',
        onAccept: { loyalty: 12, treasury: 20_000, influence: 4 },
        onReject: { loyalty: -6 },
        stateOnAccept: { credits: -20_000 },
        stateOnReject: {},
    },
    greater_autonomy: {
        type: 'greater_autonomy', minInfluence: 55, minAutonomy: 45, severity: 3,
        text: 'We request greater autonomy in the conduct of our affairs.',
        concession: 'The board answers to its shareholders, not the ministry.',
        threat: 'The company begins acting without asking.',
        onAccept: { autonomy: 12, loyalty: 8, influence: 8 },
        onReject: { loyalty: -18, autonomy: 8 },
        stateOnAccept: { approval: -4, politicalCapital: -10 },
        stateOnReject: { politicalCapital: -5 },
    },
    senate_representation: {
        type: 'senate_representation', minInfluence: 65, minAutonomy: 50, severity: 3,
        text: 'We request representation in the Imperial Senate.',
        concession: 'A commercial bloc sits in the chamber and votes its interests.',
        threat: 'The company funds whichever opposition will seat it.',
        onAccept: { autonomy: 10, loyalty: 12, influence: 14 },
        onReject: { loyalty: -20, autonomy: 10, influence: 4 },
        stateOnAccept: { approval: -6, politicalCapital: -15 },
        stateOnReject: { approval: -3 },
    },
    territorial_administration: {
        type: 'territorial_administration', minInfluence: 70, minAutonomy: 55, severity: 3,
        text: 'We request administration of the frontier territories we developed.',
        concession: 'Corporate law replaces imperial law beyond the border.',
        threat: 'Frontier unrest, quietly funded, until the state cannot govern there anyway.',
        onAccept: { autonomy: 15, loyalty: 10, influence: 16 },
        onReject: { loyalty: -22, autonomy: 12 },
        stateOnAccept: { approval: -7, politicalCapital: -20, stability: -0.02 },
        stateOnReject: { stability: -0.03 },
    },
    customs_authority: {
        type: 'customs_authority', minInfluence: 75, minAutonomy: 60, severity: 3,
        text: 'We request authority over customs at the ports we built.',
        concession: 'The company sets and keeps the duties on its own harbours.',
        threat: 'Duties are collected anyway, and simply not remitted.',
        onAccept: { autonomy: 14, loyalty: 8, influence: 12, treasury: 25_000 },
        onReject: { loyalty: -20, autonomy: 11 },
        stateOnAccept: { credits: -15_000, approval: -5, politicalCapital: -15 },
        stateOnReject: { approval: -2 },
    },
};

// ─── Crisis templates ────────────────────────────────────────────────────────

export interface CrisisDef {
    type: CorporateCrisisType;
    headline: string;
    description: string;
    /** Weight in the crisis draw. Modulated at runtime by company condition. */
    baseWeight: number;
    options: CrisisOption[];
}

export const CRISIS_DEFS: CrisisDef[] = [
    {
        type: 'mining_disaster',
        headline: 'Shaft Collapse at a Company Site',
        description: 'A pressure failure has killed the shift and shut the workings. The company wants the loss written off; the colony wants somebody charged.',
        baseWeight: 10,
        options: [
            {
                id: 'state_compensation', label: 'Pay compensation from the treasury',
                description: 'The state absorbs the cost and the goodwill.',
                creditCost: 15_000,
                effects: { approval: 3, loyalty: 10, treasury: 5_000 },
            },
            {
                id: 'prosecute', label: 'Prosecute the company',
                description: 'Fines and an inquiry. The board will remember it.',
                politicalCapitalCost: 10,
                effects: { approval: 5, loyalty: -15, autonomy: 4, treasury: -20_000, corruption: -8 },
            },
            {
                id: 'ignore', label: 'Let the company settle it',
                description: 'No state involvement. It settles cheaply and quietly.',
                effects: { approval: -4, corruption: 6, treasury: -4_000 },
            },
        ],
    },
    {
        type: 'worker_strike',
        headline: 'Company Workers Walk Out',
        description: 'Pay and hours. Operations are stopped across the company\'s holdings and the freight is stacking up.',
        baseWeight: 12,
        options: [
            {
                id: 'mediate', label: 'Mediate a settlement',
                description: 'Slower and dearer, but nobody is shot.',
                politicalCapitalCost: 8,
                effects: { approval: 4, loyalty: 6, treasury: -8_000 },
            },
            {
                id: 'break_strike', label: 'Send troops to reopen the works',
                description: 'Production resumes immediately. So does the resentment.',
                effects: { approval: -8, loyalty: 14, treasury: 6_000, influence: 3 },
            },
            {
                id: 'side_with_workers', label: 'Back the workers',
                description: 'Legislate the demands. The board reads it as a warning.',
                politicalCapitalCost: 12,
                effects: { approval: 7, loyalty: -12, autonomy: 5, treasury: -15_000 },
            },
        ],
    },
    {
        type: 'corruption_scandal',
        headline: 'Ministry Officials on the Company Payroll',
        description: 'Ledgers surfaced showing routine payments to officials who approved the company\'s licences.',
        baseWeight: 9,
        options: [
            {
                id: 'purge', label: 'Purge the implicated officials',
                description: 'Public, painful, and it cleans the ministry.',
                politicalCapitalCost: 15,
                effects: { approval: 6, corruption: -20, loyalty: -10, autonomy: 3 },
            },
            {
                id: 'bury', label: 'Bury the report',
                description: 'It goes away. It always comes back larger.',
                effects: { approval: -3, corruption: 10, loyalty: 8 },
            },
            {
                id: 'fine', label: 'Fine the company and move on',
                description: 'Revenue now, no reform.',
                effects: { treasury: -25_000, approval: 2, corruption: -5, loyalty: -5 },
            },
        ],
    },
    {
        type: 'accounting_fraud',
        headline: 'The Books Were Fiction',
        description: 'Reported earnings were inflated for several quarters. Shareholders are being told now, publicly.',
        baseWeight: 7,
        options: [
            {
                id: 'audit', label: 'Force an independent audit',
                description: 'Confidence collapses first, then recovers on honest numbers.',
                politicalCapitalCost: 10,
                effects: { sharePriceMultiplier: 0.7, corruption: -15, loyalty: -6, approval: 3 },
            },
            {
                id: 'backstop', label: 'Backstop the company publicly',
                description: 'The state\'s credit props up the share price.',
                creditCost: 30_000,
                effects: { sharePriceMultiplier: 1.1, loyalty: 12, approval: -5, treasury: 30_000 },
            },
            {
                id: 'let_fall', label: 'Let the market punish it',
                description: 'No intervention. The lesson is expensive for everyone holding stock.',
                effects: { sharePriceMultiplier: 0.5, influence: -10, loyalty: -8 },
            },
        ],
    },
    {
        type: 'executive_assassination',
        headline: 'Company Director Killed',
        description: 'The head of the board is dead in a lift shaft on a company station. Nobody believes it was the lift.',
        baseWeight: 5,
        options: [
            {
                id: 'investigate', label: 'Open a state investigation',
                description: 'Whoever did it, the company will resent the scrutiny.',
                politicalCapitalCost: 8,
                effects: { loyalty: -6, corruption: -8, approval: 2 },
            },
            {
                id: 'install_successor', label: 'Install a friendly successor',
                description: 'The state picks the next director. Effective, and remembered.',
                politicalCapitalCost: 20,
                effects: { loyalty: 20, autonomy: -12, approval: -3, influence: -4 },
            },
            {
                id: 'stay_out', label: 'Stay out of it',
                description: 'The board settles its own succession.',
                effects: { autonomy: 5, corruption: 5 },
            },
        ],
    },
    {
        type: 'debt_crisis',
        headline: 'The Company Cannot Service Its Debt',
        description: 'Expansion outran revenue. Creditors are calling in paper the company cannot cover.',
        baseWeight: 8,
        options: [
            {
                id: 'bailout', label: 'Bail it out',
                description: 'Too important to fail. That precedent is now set.',
                creditCost: 40_000,
                effects: { treasury: 40_000, loyalty: 18, autonomy: -6, approval: -6 },
            },
            {
                id: 'debt_for_equity', label: 'Convert the debt to state equity',
                description: 'The government\'s stake rises. So does its exposure.',
                creditCost: 25_000,
                effects: { treasury: 25_000, autonomy: -15, loyalty: 5, influence: -5 },
            },
            {
                id: 'liquidate_assets', label: 'Force an asset sale',
                description: 'The company survives, smaller and bitter.',
                effects: { treasury: 10_000, influence: -12, loyalty: -14, autonomy: 4 },
            },
        ],
    },
    {
        type: 'shareholder_revolt',
        headline: 'Shareholders Move Against the Board',
        description: 'The minority holders have the votes to force a new board, and a new policy toward the state.',
        baseWeight: 8,
        options: [
            {
                id: 'back_board', label: 'Back the sitting board',
                description: 'State votes carry the day. The board owes the state.',
                politicalCapitalCost: 12,
                effects: { loyalty: 16, autonomy: -8, influence: 3 },
            },
            {
                id: 'back_rebels', label: 'Back the insurgent shareholders',
                description: 'A new board, unpredictable and grateful to nobody.',
                politicalCapitalCost: 8,
                effects: { loyalty: -10, autonomy: 6, corruption: -10, sharePriceMultiplier: 1.15 },
            },
            {
                id: 'abstain', label: 'Abstain',
                description: 'The state does not vote its shares. The market decides.',
                effects: { autonomy: 4, sharePriceMultiplier: 0.9 },
            },
        ],
    },
    {
        type: 'hostile_takeover_bid',
        headline: 'A Rival Is Buying the Company',
        description: 'A competitor has assembled a controlling block and is bidding for the rest.',
        baseWeight: 6,
        options: [
            {
                id: 'block', label: 'Block the takeover by decree',
                description: 'The charter is invoked. The market notices the intervention.',
                politicalCapitalCost: 15,
                effects: { loyalty: 12, sharePriceMultiplier: 0.9, influence: -3 },
            },
            {
                id: 'buy_in', label: 'Outbid the rival with state credit',
                description: 'The government raises its stake to keep control.',
                creditCost: 35_000,
                effects: { autonomy: -10, loyalty: 10, sharePriceMultiplier: 1.2 },
            },
            {
                id: 'allow', label: 'Allow it',
                description: 'The company changes hands. Its obligations may not survive.',
                effects: { autonomy: 15, loyalty: -20, influence: 8 },
            },
        ],
    },
    {
        type: 'corporate_civil_war',
        headline: 'Two Boards, One Company',
        description: 'The company has split into rival directorates, each with its own security forces and its own claim to the charter.',
        baseWeight: 4,
        options: [
            {
                id: 'recognise_loyalist', label: 'Recognise the loyalist directorate',
                description: 'One half keeps the charter; the other keeps the ships.',
                politicalCapitalCost: 20,
                effects: { loyalty: 22, autonomy: -10, fleet: -20, treasury: -20_000, influence: -8 },
            },
            {
                id: 'partition', label: 'Partition the charter between them',
                description: 'Two smaller companies, both diminished, neither grateful.',
                politicalCapitalCost: 12,
                effects: { influence: -15, treasury: -30_000, autonomy: 3 },
            },
            {
                id: 'seize', label: 'Send the navy and seize the assets',
                description: 'The state takes the works by force and inherits the mess.',
                politicalCapitalCost: 30,
                effects: { autonomy: -30, loyalty: -25, treasury: -50_000, fleet: -40, approval: -5 },
            },
        ],
    },
    {
        type: 'foreign_acquisition',
        headline: 'Foreign Capital Is Buying In',
        description: 'A foreign power\'s investment arm has taken a large position and wants a board seat.',
        baseWeight: 7,
        options: [
            {
                id: 'permit', label: 'Permit the investment',
                description: 'Capital arrives. So does a foreign interest in company policy.',
                effects: { treasury: 30_000, autonomy: 8, loyalty: -8, influence: 6 },
            },
            {
                id: 'restrict', label: 'Cap foreign ownership by statute',
                description: 'The stake is frozen. The foreign power takes note.',
                politicalCapitalCost: 12,
                effects: { autonomy: -5, loyalty: 8, sharePriceMultiplier: 0.9 },
            },
            {
                id: 'match', label: 'Match the purchase with state funds',
                description: 'Expensive, but control stays at home.',
                creditCost: 30_000,
                effects: { autonomy: -10, loyalty: 10, sharePriceMultiplier: 1.1 },
            },
        ],
    },
    {
        type: 'bankruptcy',
        headline: 'The Company Is Insolvent',
        description: 'Treasury exhausted, upkeep unpaid, assets going dark. Without intervention the charter dies here.',
        baseWeight: 6,
        options: [
            {
                id: 'recapitalise', label: 'Recapitalise the company',
                description: 'State credit restarts operations under tighter terms.',
                creditCost: 45_000,
                effects: { treasury: 45_000, autonomy: -18, loyalty: 20 },
            },
            {
                id: 'wind_down', label: 'Wind it down in an orderly fashion',
                description: 'Assets sold, shareholders paid what is left, charter surrendered.',
                effects: { treasury: 5_000, influence: -25, loyalty: -5 },
            },
            {
                id: 'sell_foreign', label: 'Sell the charter to foreign buyers',
                description: 'Somebody else\'s problem, and somebody else\'s asset.',
                effects: { treasury: 20_000, autonomy: 25, loyalty: -25, influence: 5 },
            },
        ],
    },
];

// ─── Megaproject definitions ─────────────────────────────────────────────────

export interface MegaprojectDef {
    id: string;
    name: string;
    description: string;
    benefit: string;
    /** Missions that would ever propose it. Empty = any. */
    missions: CorporateMission[];
    totalCost: number;
    /** Fraction of the cost the company asks the state to underwrite. */
    stateShare: number;
    durationDays: number;
    /** Influence the company must already have to propose it. */
    minInfluence: number;
    /** Applied on completion. */
    onComplete: {
        companyIncomePerTick?: number;
        companyInfluence?: number;
        companyAutonomy?: number;
        stateCreditsPerTick?: number;
        stateApproval?: number;
        tradeEfficiency?: number;
    };
}

export const MEGAPROJECT_DEFS: MegaprojectDef[] = [
    {
        id: 'galactic_bank', name: 'Galactic Bank',
        description: 'A clearing institution for every empire that will use it, chartered in our name.',
        benefit: 'Permanent credit income for the company and the state; deep influence over galactic finance.',
        missions: ['banking', 'trade'],
        totalCost: 250_000, stateShare: 0.3, durationDays: 30, minInfluence: 50,
        onComplete: { companyIncomePerTick: 900, companyInfluence: 12, stateCreditsPerTick: 250 },
    },
    {
        id: 'deep_space_hub', name: 'Deep Space Trade Hub',
        description: 'A transhipment city between the lanes, owned outright.',
        benefit: 'Large company income; galaxy-wide trade efficiency improves.',
        missions: ['trade', 'logistics'],
        totalCost: 200_000, stateShare: 0.35, durationDays: 24, minInfluence: 40,
        onComplete: { companyIncomePerTick: 750, companyInfluence: 10, tradeEfficiency: 0.04 },
    },
    {
        id: 'mega_shipyard', name: 'Mega Shipyard',
        description: 'Slipways on a scale no state yard can match.',
        benefit: 'Company income and a standing private construction capacity.',
        missions: ['shipbuilding'],
        totalCost: 220_000, stateShare: 0.4, durationDays: 26, minInfluence: 40,
        onComplete: { companyIncomePerTick: 700, companyInfluence: 8, companyAutonomy: 5, stateApproval: 3 },
    },
    {
        id: 'hyperlane_gateway', name: 'Hyperlane Gateway',
        description: 'A permanent transit gate financed on corporate paper.',
        benefit: 'Trade efficiency rises across the galaxy; the company charges for passage.',
        missions: ['logistics', 'trade', 'colonization'],
        totalCost: 300_000, stateShare: 0.45, durationDays: 36, minInfluence: 55,
        onComplete: { companyIncomePerTick: 820, companyInfluence: 14, tradeEfficiency: 0.06 },
    },
    {
        id: 'orbital_ring', name: 'Orbital Ring',
        description: 'A ring over a company world, with corporate law running its length.',
        benefit: 'Enormous income and a visible seat of corporate power.',
        missions: ['colonization', 'mining', 'extraction'],
        totalCost: 340_000, stateShare: 0.3, durationDays: 40, minInfluence: 60,
        onComplete: { companyIncomePerTick: 1_000, companyInfluence: 16, companyAutonomy: 8 },
    },
    {
        id: 'processing_complex', name: 'Resource Processing Complex',
        description: 'Refining at industrial scale, sited where the ore is.',
        benefit: 'Steady company income; the state\'s share of output rises.',
        missions: ['mining', 'extraction'],
        totalCost: 180_000, stateShare: 0.35, durationDays: 22, minInfluence: 35,
        onComplete: { companyIncomePerTick: 640, companyInfluence: 7, stateCreditsPerTick: 150 },
    },
    {
        id: 'stock_exchange', name: 'Interstellar Stock Exchange',
        description: 'A market for every charter in the galaxy — listed, priced, and traded here.',
        benefit: 'Company influence and income; the state gains a window into every corporate balance sheet.',
        missions: ['banking', 'trade'],
        totalCost: 260_000, stateShare: 0.25, durationDays: 32, minInfluence: 55,
        onComplete: { companyIncomePerTick: 780, companyInfluence: 18, stateCreditsPerTick: 180 },
    },
    {
        id: 'banking_network', name: 'Banking Network',
        description: 'Branch offices in every port worth the name.',
        benefit: 'Reliable income and reach into other empires\' economies.',
        missions: ['banking'],
        totalCost: 150_000, stateShare: 0.25, durationDays: 18, minInfluence: 30,
        onComplete: { companyIncomePerTick: 520, companyInfluence: 10 },
    },
    {
        id: 'research_arcology', name: 'Research Arcology',
        description: 'A closed city of laboratories under corporate jurisdiction.',
        benefit: 'Company income and technological leverage over the state.',
        missions: ['research'],
        totalCost: 210_000, stateShare: 0.4, durationDays: 28, minInfluence: 40,
        onComplete: { companyIncomePerTick: 600, companyInfluence: 12, companyAutonomy: 6 },
    },
];

// ─── Naming ──────────────────────────────────────────────────────────────────

/** Suffixes used when the AI or a bootstrap needs to invent a charter name. */
export const CHARTER_NAME_PREFIXES = [
    'Astral Frontier', 'Meridian Star', 'Outer Reach', 'Aurelian Spice', 'Coreward',
    'Vela Deepwater', 'Northern Verge', 'Halcyon Freight', 'Iron Meridian', 'Pale Horizon',
    'Cygnet', 'Torrent Line', 'Blackfall', 'Concord Assay', 'Thousand Ports',
];
