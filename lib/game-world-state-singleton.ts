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
import { mockSystems, mockCouncilState } from './ui-mock-data';
import { Faction, Resource, Market, TradeAgreement } from './trade-system/types';
import { ProxyConflict, Treaty, TradePact, Tribute } from './politics/cold-war-types';
import { PressFactionType, SimulationState as PressSimulationState } from './press-system/types';

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
        nowSeconds: Math.floor(Date.now() / 1000),
    };
}

function buildEmptyEconomyState(): EconomyWorldState {
    const factions = new Map<string, Faction>();
    
    // Seed initial factions
    const FACTION_IDS = ['faction-aurelian', 'faction-vektori', 'faction-null-syndicate', 'faction-covenant'];
    const names = ['Aurelian Combine', 'Vektori High Command', 'Null Syndicate', 'Covenant of the Void'];
    const capitals = [mockSystems[0].id, mockSystems[50].id, mockSystems[100].id, mockSystems[135].id];
    const theatres = ['theatre-aurelian', 'theatre-vektori', 'theatre-null', 'theatre-covenant'];

    FACTION_IDS.forEach((id, i) => {
        factions.set(id, {
            id,
            name: names[i],
            capitalSystemId: capitals[i],
            theatreId: theatres[i],
            backingRatioPolicy: 0.5,
            reserves: { [Resource.ENERGY]: 1000 },
            creditSupply: 1000000,
            liquidity: 500000,
            debt: 0,
            stability: 100,
            ideology: 0,
            centralization: 50,
            economicModel: 0,
            metrics: {
                tradeDependencyIndex: 0.2,
                chokepointDependencyScore: 0.1,
                reserveStressIndex: 0,
                capitalExposureRating: 0.1
            }
        } as any); // cast for safety if name isn't in Faction type, but let's check Faction
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

function buildEmptyConstructionState(): ConstructionWorldState {
    const planets = new Map<string, Planet>();
    // Seed initial planets for ALL mock systems to ensure UI has data regardless of selection
    mockSystems.forEach((sys, idx) => {
        const environmentalTags = [
            'Radioactive World', 'Desert World', 'Oceanic World', 
            'Night World', 'Tomb World', 'Freak Weather', 
            'Freak Geology', 'Hostile Biosphere', 'Seamic Instability'
        ];
        
        // 2-3% chance for Gas Giant tag
        const isGasGiant = Math.random() < 0.025;
        const planetTags = isGasGiant 
            ? ['Gas Giant'] 
            : [environmentalTags[idx % environmentalTags.length]];

        const planet: Planet = {
            id: `planet_${sys.id}`,
            name: `${sys.name} Prime`,
            systemId: sys.id,
            ownerId: sys.ownerId || 'faction-neutral',
            planetType: idx % 3 === 0 ? 'industrial' : idx % 3 === 1 ? 'agricultural' : 'standard',
            infrastructureLevel: 1,
            stability: 100,
            happiness: 80,
            specialization: 'none',
            maxTiles: 6,
            tiles: Array.from({ length: 6 }, (_, i) => ({
                tileId: `tile_${i}`,
                districtType: i === 0 ? 'industrial' : i === 1 ? 'civilian' : 'any',
                buildingId: null,
                constructionState: 'empty',
                constructionCompleteAt: null
            })),
            buildQueue: [],
            activeModifiers: [],
            tags: planetTags
        };
        planets.set(planet.id, planet);
    });

    return {
        planets,
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
            nowSeconds: Math.floor(Date.now() / 1000),
        };

        // Seed a dormant proxy conflict in Vektori space to demonstrate the feature
        const vektoriConflict: ProxyConflict = {
            id: 'proxy-vektori-labor-unrest',
            systemId: mockSystems[50].id,
            sponsorIds: [], // Initially no foreign backing
            rebelFactionId: 'rebel-labor-front',
            targetEmpireId: 'faction-vektori',
            intensity: 15,
            fundingLevel: 0,
            blowbackRisk: 5
        };
        if (globalGameStateInstance) {
            globalGameStateInstance.proxyConflicts.set(vektoriConflict.id, vektoriConflict);
        }
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
