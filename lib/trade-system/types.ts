// ===== file: lib/trade-system/types.ts =====
export enum Resource {
    METALS = 'METALS',
    CHEMICALS = 'CHEMICALS',
    FOOD = 'FOOD',
    HAPPINESS = 'HAPPINESS',
    ENERGY = 'ENERGY',
    RARES = 'RARES',
    AMMO = 'AMMO',
    CREDITS = 'CREDITS',
    // Derived type identifiers (for mapping/UI)
    CONSTRUCTION = 'CONSTRUCTION',
    MILITARY_CAP = 'MILITARY_CAP',
    RESEARCH_CAP = 'RESEARCH_CAP',
    CULTURAL_CAP = 'CULTURAL_CAP'
}

export enum RegimeOutcome {
    BALANCED_REPUBLIC = 'BALANCED_REPUBLIC',
    EMERGENCY_DIRECTORATE = 'EMERGENCY_DIRECTORATE',
    MERCHANT_COMMONWEALTH = 'MERCHANT_COMMONWEALTH',
    FEDERAL_FRAGMENTATION = 'FEDERAL_FRAGMENTATION',
    RECONSTRUCTION_TECHNOCRACY = 'RECONSTRUCTION_TECHNOCRACY',
    PIRATE_ANARCHY = 'PIRATE_ANARCHY'
}

export enum FractureOutcome {
    REMAIN = 'REMAIN',
    SECEDE = 'SECEDE',
    BREAKAWAY = 'BREAKAWAY',
    PIRATE_HAVEN = 'PIRATE_HAVEN'
}

export interface Faction {
    id: string;
    name: string;
    theatreId: string;
    backingRatioPolicy: number; // e.g. 0.5 means 50% backing required
    reserves: { [key in Resource]?: number }; // Quantity of each resource held in reserve
    production?: { [key in Resource]?: number }; // Current production rate per tick
    creditSupply: number;
    liquidity: number;
    debt: number;
    stability: number; // 0-100
    ideology: number; // -100 (Authoritarian) to 100 (Libertarian)
    civilizationId?: string; // e.g., 'civ-mycelari'
    ideologyId?: string; // e.g., 'ideo-imperialist'
    centralization: number; // 0 (Decentralized) to 100 (Centralized)
    economicModel: number; // -100 (Planned) to 100 (Free Market)
    capitalSystemId: string;
    metrics: {
        tradeDependencyIndex: number;
        chokepointDependencyScore: number;
        reserveStressIndex: number;
        capitalExposureRating: number;
        inflationRate: number;
        energyBackingRatio: number;
        confidenceIndex: number;
        energyLoad: number;
    };
}

export interface Planet {
    id: string;
    theatreId: string;
    ownerFactionId: string | null;
    isChokepoint: boolean;
    localStability: number; // 0-100
    autonomy: number; // 0-100
    distanceFromCapital: number; // hops
    productionByResource: { [key in Resource]?: number }; // per hour
    consumptionByResource: { [key in Resource]?: number }; // per hour
}

export enum EdgeType {
    HYPERLANE = 'HYPERLANE',
    WORMHOLE = 'WORMHOLE',
    DEEP_SPACE = 'DEEP_SPACE'
}

export interface GraphEdge {
    from: string;
    to: string;
    type: EdgeType;
    baseCost: number;
    isChokepointEdge: boolean;
}

export interface Graph {
    nodes: string[]; // System IDs
    edges: GraphEdge[];
    adj: Map<string, GraphEdge[]>; // Adjacency list for performance
}

export type PriceFormula = 'market' | 'fixed' | 'indexed';

export interface TradeAgreement {
    id: string;
    aFactionId: string;
    bFactionId: string;
    resource: Resource;
    volumePerHour: number;
    startTick: number;
    endTick: number;
    priceFormula: PriceFormula;
    fixedPrice?: number;
}

export interface TradeRoute {
    id: string;
    agreementId: string;
    path: string[]; // Sequence of System IDs
    theatreId: string;
    exposureScore: number;
    piracyRisk: number; // 0-1 probability of loss per tick
    blockadeRisk: number; // 0-1 probability of total interdiction
    deepSpaceRisk: number;
    escortLevel: number;
    routePriority: number;
}

export enum PolicyRule {
    ALLOW = 'ALLOW',
    DENY = 'DENY',
    TAX = 'TAX',
    PRIORITIZE = 'PRIORITIZE'
}

export interface PolicyState {
    tariffsByResource: Map<Resource, number>; // Resource -> tariff % (0.0 to 1.0)
    subsidiesByResource: Map<Resource, number>; // Resource -> subsidy credits per unit
    sanctions: Set<string>; // FactionIDs sanctioned
    embargoes: { factionId: string; resources: Resource[] }[];
    chokepointRules: Map<string, { rule: PolicyRule; taxRate?: number }>; // SystemID -> Rule
    productionFocus: Resource | null;
}

export interface Market {
    theatreId: string;
    resource: Resource;
    supply: number;
    demand: number;
    basePrice: number;
    volatility: number;
    currentPrice: number;
}

export interface WarState {
    factionId: string;
    ammoDemandMultiplier: number;
    metalDemandMultiplier: number;
    blockadeSystems: Set<string>; // SystemIDs currently blockaded by this faction (or against this faction? Clarify in usage)
    // Actually, blockadeSystems usually means systems blockaded BY enemies OF the trade route owner. 
    // But for a global WarState, we might track "active combat zones".
    // Let's assume WarState is passed *relative to the faction evaluating the route*.
    hostileFleetsPresence: Map<string, number>; // SystemID -> Threat Level
}

export interface CollapseEvent {
    factionId: string;
    regimeOutcome: RegimeOutcome;
    fracturedSystems: { systemId: string; outcome: FractureOutcome }[];
    newCapitalNeeded: boolean;
    immediateEffects: {
        priceShock: number; // Multiplier
        tradeFreezeDuration: number; // Ticks
    };
}

export interface SimulationState {
    tick: number;
    factions: Map<string, Faction>;
    planets: Map<string, Planet>;
    markets: Map<string, Market>; // key: "theatreId:resource"
    agreements: Map<string, TradeAgreement>;
    routes: Map<string, TradeRoute>;
    graph: Graph;
    policies: Map<string, PolicyState>; // key: factionId
    warStates: Map<string, WarState>; // key: factionId
}
