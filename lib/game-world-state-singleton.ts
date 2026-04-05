/**
 * lib/game-world-state-singleton.ts
 *
 * Module-level singletons for the in-memory game simulation state.
 * These are used by Server Actions to access and mutate live game state
 * without a full Appwrite round-trip for every interaction.
 *
 * In production you would replace this with a Redis/durable-state layer.
 * For the current single-server dev setup this provides immediate interactivity.
 */

import { GameWorldState, defaultSharedState } from './game-world-state';
import type { MovementWorldState } from './movement/types';
import type { EconomyWorldState } from './economy/economy-types';
import type { EspionageWorldState } from './espionage/espionage-types';
import { CorporateWorldState, createEmptyCorporateWorldState } from './economy/corporate/company-registry';
import { ConstructionWorldState, Planet, PlanetTile } from './construction/construction-types';
import { mockCouncilState } from './ui-mock-data';
import { Faction, Resource, Market, TradeAgreement } from './trade-system/types';
import { ProxyConflict, Treaty, TradePact, Tribute } from './politics/cold-war-types';
import { PressFactionType, SimulationState as PressSimulationState } from './press-system/types';
import { IntelligenceWorldState, IntelligenceNetwork } from './intelligence/types';
import { OPERATION_DEFINITIONS } from './intelligence/operation-definitions';
import { LeadershipWorldState, Leader, LeaderRole } from './leadership/types';
import { EmpireDoctrines } from './doctrine/types';
import { FactionReputation } from './reputation/types';
import { initializeFactionHomeWorld } from './economy/services/initialization-service';

// ─── Module-Level Singletons ───────────────────────────────────────────────


let globalGameStateInstance: GameWorldState | null = null;
let globalCorporateStateInstance: CorporateWorldState | null = null;
let globalConstructionStateInstance: ConstructionWorldState | null = null;

function buildEmptyMovementState(): MovementWorldState {
    return {
        systems: new Map(),
        planets: new Map(),
        gates: new Map(),
        tradeSegments: new Map(),
        corridors: new Map(),
        fleets: new Map(),
        factionVisibility: new Map(),
        sensorSources: [],
        anomalyPool: [],
        frontierClaims: [],
        explorationOrders: [],
        automationDoctrines: new Map(),
        empirePostures: new Map(),
        degradations: new Map(),
        sorties: new Map(),
        nowSeconds: Math.floor(Date.now() / 1000),
    };
}

function buildEmptyEconomyState(): EconomyWorldState {
    const factions = new Map<string, Faction>();
    
    // Seed initial factions (4 starters + 8 friends factions)
    const FACTION_DATA = [
        { id: 'faction-aurelian', name: 'Aurelian Combine', civilizationId: 'civ-elyndra', ideologyId: 'ideo-capitalist', capitalId: 'alpha-5b34961e18bb6fd14903' },
        { id: 'faction-vektori', name: 'Vektori High Command', civilizationId: 'civ-velkori', ideologyId: 'ideo-imperialist', capitalId: 'alpha-fe148b9a69a680fa14a3' },
        { id: 'faction-null-syndicate', name: 'Null Syndicate', civilizationId: 'civ-auraxian', ideologyId: 'ideo-technocratic', capitalId: 'alpha-1acb646b529592834b59' },
        { id: 'faction-covenant', name: 'Covenant of the Void', civilizationId: 'civ-solari', ideologyId: 'ideo-theocratic', capitalId: 'alpha-10fae8cf89590243337b' },
        { id: 'faction-rhimetals', name: 'Rhimetals / Rufus', civilizationId: 'civ-grakkar', ideologyId: 'ideo-imperialist', capitalId: 'alpha-18109e81be8a4bb03aab' },
        // ... other factions will load their capitals from the DB
    ];


    FACTION_DATA.forEach((data) => {
        const theatreId = `theatre-${data.id.split('-')[1]}`;
        factions.set(data.id, {
            id: data.id,
            name: data.name,
            capitalSystemId: data.capitalId || 'unknown-capital',
            theatreId: theatreId,
            backingRatioPolicy: 0.5,
            reserves: { [Resource.ENERGY]: 2500, [Resource.METALS]: 500, [Resource.FOOD]: 500 },
            creditSupply: 1000000,
            liquidity: 500000,
            debt: 0,
            stability: 100,
            ideology: 0,
            centralization: 50,
            economicModel: 0,
            civilizationId: data.civilizationId,
            ideologyId: data.ideologyId,
            metrics: {
                tradeDependencyIndex: 0.2,
                chokepointDependencyScore: 0.1,
                reserveStressIndex: 0,
                capitalExposureRating: 0.1
            }
        } as any);
    });


    const markets = new Map<string, Market>();
    Object.values(Resource).map(res => {
        markets.set(`theatre-aurelian:${res}`, {
            theatreId: 'theatre-aurelian',
            resource: res,
            supply: 1000,
            demand: 800,
            basePrice: 10,
            volatility: 0.1,
            currentPrice: 10 + Math.random() * 5
        });
    });

    const tradeAgreements = new Map<string, TradeAgreement>();
    // Seed one starter agreement
    tradeAgreements.set('ag-starter', {
        id: 'ag-starter',
        aFactionId: 'faction-aurelian',
        bFactionId: 'faction-vektori',
        resource: Resource.METALS,
        volumePerHour: 50,
        startTick: 0,
        endTick: 1000,
        priceFormula: 'market'
    });

    return {
        planets: new Map(),
        tradeHubs: new Map(),
        tradeFlowEdges: new Map(),
        regions: new Map(),
        collapseStates: new Map(),
        markets,
        tradeRoutes: new Map(),
        tradeAgreements,
        factions,
        policies: new Map(),
        warStates: new Map(),
        lastFlowUpdateAt: 0,
    };
}
function buildEmptyEspionageState(): EspionageWorldState {
    return {
        operations: new Map(),
        counterIntel: new Map(),
        attributionRecords: [],
        shadowEconomyNodes: new Map(),
        regionEscalation: new Map(),
        agents: new Map(),
        intelNetworks: new Map(),
    };
}

function buildEmptyIntelligenceState(): IntelligenceWorldState {
    const definitions = new Map<string, typeof OPERATION_DEFINITIONS[0]>();
    OPERATION_DEFINITIONS.forEach(def => definitions.set(def.id, def));

    const networks = new Map<string, IntelligenceNetwork>();
    const FACTION_IDS = [
        'faction-aurelian', 'faction-vektori', 'faction-null-syndicate', 
        'faction-covenant', 'faction-rhimetals', 'faction-gabagoonians', 
        'faction-infernoids', 'faction-movanites', 'faction-leopantheri', 
        'faction-buthari', 'faction-sarrak', 'faction-kaerruun', 'faction-pirates'
    ];

    FACTION_IDS.forEach(id => {
        networks.set(id, {
            empireId: id,
            intelPoints: 100,
            agentCapacity: 3,
            usedAgentCapacity: 0,
            counterIntelStrength: 10,
            surveillanceStrength: 10,
            propagandaResistance: 10,
            internalSecurity: 10,
            infiltrationLevels: {}
        });
    });

    return {
        operations: new Map(),
        networks,
        sleeperCells: new Map(),
        definitions
    };
}


function buildEmptyConstructionState(): ConstructionWorldState {
    return {
        planets: new Map(),
        spaceBuildQueue: [],
        nowSeconds: Math.floor(Date.now() / 1000)
    };
}

function buildEmptyPressState(): PressSimulationState {
    return {
        tick: 0,
        empires: new Map(),
        planets: new Map(),
        pressFactions: new Map([
            ['faction-state-media', {
                id: 'faction-state-media',
                type: PressFactionType.STATE_MEDIA,
                affiliatedEmpireId: 'faction-aurelian',
                credibility: 85,
                bias: 50,
                cooldowns: new Map()
            }],
            ['faction-independent', {
                id: 'faction-independent',
                type: PressFactionType.INDEPENDENT_MEDIA,
                credibility: 90,
                bias: 0,
                cooldowns: new Map()
            }],
            ['faction-pirate', {
                id: 'faction-pirate',
                type: PressFactionType.PIRATE_PRESS,
                credibility: 30,
                bias: -60,
                cooldowns: new Map()
            }]
        ]),
        activeStories: new Map(),
        publishedStories: [],
        crises: new Map(),
        quarantinedPlanets: new Set(),
        jammedSystems: new Set(),
        counterNarratives: new Map()
    };
}

function buildEmptyLeadershipState(): LeadershipWorldState {
    const roles: LeaderRole[] = [
        'Admiral', 'General', 'Governor', 'IntelligenceDirector', 
        'DiplomaticEnvoy', 'EconomicMinister', 'CharterCompanyExecutive'
    ];
    
    const pool: Leader[] = roles.map((role, idx) => ({
        id: `leader-start-${idx}`,
        factionId: 'faction-aurelian',
        name: `Initial ${role}`,
        role: role,
        level: 1,
        xp: 0,
        loyalty: 80,
        status: 'active',
        traits: [],
        history: [{ timestamp: Date.now() / 1000, description: 'Entered service.' }]
    }));

    // Add one wildcard
    pool.push({
        id: 'leader-wildcard-1',
        factionId: 'faction-aurelian',
        name: 'Rising Star',
        role: 'Admiral',
        level: 1,
        xp: 0,
        loyalty: 90,
        status: 'active',
        traits: ['aggressive_tactician'],
        history: [{ timestamp: Date.now() / 1000, description: 'Discovered in the academy.' }]
    });

    return {
        leaders: new Map(),
        recruitmentPool: pool,
        nowSeconds: Math.floor(Date.now() / 1000)
    };
}

/**
 * Get (or lazily create) the singleton GameWorldState.
 * This is the live in-memory simulation state used by all Server Actions.
 */
export function getGameWorldState(): GameWorldState {
    if (!globalGameStateInstance) {
        globalGameStateInstance = {
            shared: defaultSharedState(),
            movement: buildEmptyMovementState(),
            economy: buildEmptyEconomyState(),
            espionage: buildEmptyEspionageState(),
            activeSeason: null,
            seasonHistory: [],
            hallOfFame: [],
            milestones: new Map(),
            legacyPrestigeBonuses: new Map(),
            victoryState: null,
            postVictoryTransition: null,
            territoryHistory: [],
            tech: new Map(),
            rivalries: new Map(),
            blocs: new Map(),
            proxyConflicts: new Map(),
            treaties: new Map(),
            tradePacts: new Map(),
            tributes: new Map(),
            propagandaCampaigns: new Map(),
            activeCombats: new Map(),
            construction: buildEmptyConstructionState(),
            council: mockCouncilState,
            press: buildEmptyPressState(),
            intelligence: buildEmptyIntelligenceState(),
            leadership: buildEmptyLeadershipState(),
            doctrines: new Map(),
            reputation: new Map(),
            nowSeconds: Math.floor(Date.now() / 1000),
        };


        // Initial state is empty; it will be populated by the first Appwrite snapshot load
        // However, we ensure all seeded factions have a functional Homeworld
        globalGameStateInstance.economy.factions.forEach((f, id) => {
            initializeFactionHomeWorld(globalGameStateInstance!, id);
        });
    }
    return globalGameStateInstance!;
}

/**
 * Get (or lazily create) the singleton CorporateWorldState.
 * Kept separate from GameWorldState since it is managed by company-registry.
 */
export function getCorporateWorldState(): CorporateWorldState {
    if (!globalCorporateStateInstance) {
        globalCorporateStateInstance = createEmptyCorporateWorldState();
    }
    return globalCorporateStateInstance;
}

/**
 * Returns the lazily initialized ConstructionWorldState singleton.
 */
export function getConstructionWorldState(): ConstructionWorldState {
    if (!globalConstructionStateInstance) {
        globalConstructionStateInstance = buildEmptyConstructionState();
    }
    return globalConstructionStateInstance;
}
