/**
 * lib/game-world-state-singleton.ts
 *
 * Module-level singletons for the in-memory game simulation state.
 * These are used by Server Actions to access and mutate live game state
 * without a full Appwrite round-trip for every interaction.
 */

import fs from 'fs';
import path from 'path';
import { GameWorldState, defaultSharedState } from './game-world-state';
import type { MovementWorldState } from './movement/types';
import type { EconomyWorldState } from './economy/economy-types';
import type { EspionageWorldState } from './espionage/espionage-types';
import { CorporateWorldState, createEmptyCorporateWorldState } from './economy/corporate/company-registry';
import { ConstructionWorldState, Planet } from './construction/construction-types';
import { IntelligenceWorldState } from './intelligence/types';
import { defaultCouncilState } from './ui/defaults';
import { Faction, Resource, Market, TradeAgreement } from './trade-system/types';
import { OPERATION_DEFINITIONS } from './intelligence/operation-definitions';
import { LeadershipWorldState, Leader, LeaderRole } from './leadership/types';
import { initializeFactionHomeWorld } from './economy/services/initialization-service';
import { assignFlavorTags } from './galaxy/system-tags';

// ─── Module-Level Singletons ───────────────────────────────────────────────

let globalGameStateInstance: GameWorldState | null = null;
let globalCorporateStateInstance: CorporateWorldState | null = null;

function buildEmptyMovementState(): MovementWorldState {
    const systems = new Map();
    try {
        const systemsPath = path.resolve(process.cwd(), 'generated-systems.json');
        if (fs.existsSync(systemsPath)) {
            const data = JSON.parse(fs.readFileSync(systemsPath, 'utf-8'));
            if (data.systemNodes) {
                data.systemNodes.forEach((sys: any) => {
                    // Default array-valued fields so tick steps that call
                    // `.some(...)`/`.includes(...)` on them can't throw on sparse data.
                    const baseTags = sys.tags || [];
                    // Seed deterministic flavour tags so the galaxy has personality on load.
                    const flavorTags = assignFlavorTags(sys.id, baseTags);
                    systems.set(sys.id, {
                        ...sys,
                        tags: [...baseTags, ...flavorTags],
                        hyperlaneNeighbors: sys.hyperlaneNeighbors || [],
                    });
                });
            }
        }
    } catch (err) {
        console.error('[MovementState] Failed to load generated-systems.json:', err);
    }

    return {
        systems,
        planets: new Map(),
        gates: new Map(),
        tradeSegments: new Map(),
        corridors: new Map(),
        fleets: new Map(),
        armies: new Map(),
        factionVisibility: new Map(),
        sensorSources: [],
        anomalyPool: [],
        frontierClaims: [],
        explorationOrders: [],
        automationDoctrines: new Map(),
        empirePostures: new Map(),
        degradations: new Map(),
        sorties: new Map(),
        forwardBases: new Map(),
        nowSeconds: Math.floor(Date.now() / 1000),
    };
}

function buildEmptyEconomyState(): EconomyWorldState {
    const factions = new Map<string, Faction>();
    const FACTION_DATA = [
        { id: 'faction-aurelian', name: 'Aurelian Hegemony', civilizationId: 'civ-elyndra', ideologyId: 'ideo-capitalist', capitalId: 'alpha-5b34961e18bb6fd14903' },
        { id: 'faction-vektori', name: 'Vektori Technocracy', civilizationId: 'civ-velkori', ideologyId: 'ideo-individualist', capitalId: 'alpha-fe148b9a69a680fa14a3' },
        { id: 'faction-null-syndicate', name: 'Nullward Syndicate', civilizationId: 'civ-auraxian', ideologyId: 'ideo-mercantile', capitalId: 'alpha-1acb646b529592834b59' },
        { id: 'faction-covenant', name: 'Altaris Covenant', civilizationId: 'civ-solari', ideologyId: 'ideo-theocratic', capitalId: 'alpha-10fae8cf89590243337b' },
        { id: 'nexulan_convergence', name: 'Nexulan Convergence', civilizationId: 'civ-nexulan', ideologyId: 'ideo-technocratic', capitalId: 'alpha-nexulan-cap' },
        { id: 'banking_clan', name: 'Intergalactic Banking Clan', civilizationId: 'civ-intergalactic', ideologyId: 'ideo-mercantile', capitalId: 'alpha-banking-cap' },
        { id: 'faction-rhimetals', name: 'Rhimetals / Rufus', civilizationId: 'civ-grakkar', ideologyId: 'ideo-collectivist', capitalId: 'alpha-rhimetals-cap' },
        { id: 'faction-gabagoonians', name: 'Gabagoonians / Cohen', civilizationId: 'civ-gabagoon', ideologyId: 'ideo-individualist', capitalId: 'alpha-gabagoon-cap' },
        { id: 'faction-infernoids', name: 'Infernoids / Martijn', civilizationId: 'civ-infernoid', ideologyId: 'ideo-militaristic', capitalId: 'alpha-infernoid-cap' },
        { id: 'faction-movanites', name: 'Movanites / David', civilizationId: 'civ-movanite', ideologyId: 'ideo-industrialist', capitalId: 'alpha-movanite-cap' },
        { id: 'faction-leopantheri', name: 'Leo-pantheri / Lolo', civilizationId: 'civ-leopantheri', ideologyId: 'ideo-diplomatic', capitalId: 'alpha-leopantheri-cap' },
        { id: 'faction-buthari', name: 'The Buthari / Hisham', civilizationId: 'civ-buthari', ideologyId: 'ideo-traditionalist', capitalId: 'alpha-buthari-cap' },
        { id: 'faction-sarrak', name: 'Sarrak / Sil', civilizationId: 'civ-sarrak', ideologyId: 'ideo-militaristic', capitalId: 'alpha-sarrak-cap' },
        { id: 'faction-kaerruun', name: 'Kaer’Ruun / Otto', civilizationId: 'civ-kaerruun', ideologyId: 'ideo-militaristic', capitalId: 'alpha-kaerruun-cap' },
    ];

    FACTION_DATA.forEach((data) => {
        const theatreId = `theatre-${data.id.split('-')[1]}`;
        factions.set(data.id, {
            id: data.id,
            name: data.name,
            capitalSystemId: data.capitalId || 'unknown-capital',
            theatreId: theatreId,
            backingRatioPolicy: 0.5,
            reserves: { 
                [Resource.CREDITS]: 50000,
                [Resource.METALS]: 3000, 
                [Resource.CHEMICALS]: 1500,
                [Resource.FOOD]: 2500,
                [Resource.ENERGY]: 5000 
            },
            creditSupply: 1000000,
            liquidity: 500000,
            debt: 0,
            stability: 100,
            ideology: 0,
            centralization: 50,
            economicModel: 0,
            civilizationId: data.civilizationId,
            ideologyId: data.ideologyId,
            metrics: { tradeDependencyIndex: 0.2, chokepointDependencyScore: 0.1, reserveStressIndex: 0, capitalExposureRating: 0.1 }
        } as any);
    });

    return {
        planets: new Map(),
        tradeHubs: new Map(),
        tradeFlowEdges: new Map(),
        regions: new Map(),
        collapseStates: new Map(),
        markets: new Map(),
        tradeRoutes: new Map(),
        tradeAgreements: new Map(),
        factions,
        policies: new Map(),
        warStates: new Map(),
        lastFlowUpdateAt: 0,
    };
}

function buildEmptyConstructionState(): ConstructionWorldState {
    return {
        planets: new Map(),
        spaceBuildQueue: [],
        nowSeconds: Math.floor(Date.now() / 1000)
    };
}

function buildEmptyLeadershipState(): LeadershipWorldState {
    return {
        leaders: new Map(),
        recruitmentPool: [],
        nowSeconds: Math.floor(Date.now() / 1000)
    };
}

function buildEmptyIntelligenceState(): IntelligenceWorldState {
    const definitions = new Map<string, typeof OPERATION_DEFINITIONS[0]>();
    OPERATION_DEFINITIONS.forEach(def => definitions.set(def.id, def));
    return {
        operations: new Map(),
        networks: new Map(),
        sleeperCells: new Map(),
        definitions
    };
}

export function getGameWorldState(): GameWorldState {
    if (!globalGameStateInstance) {
        globalGameStateInstance = {
            shared: defaultSharedState(),
            movement: buildEmptyMovementState(),
            economy: buildEmptyEconomyState(),
            espionage: { operations: new Map(), counterIntel: new Map(), attributionRecords: [], shadowEconomyNodes: new Map(), regionEscalation: new Map(), agents: new Map(), intelNetworks: new Map() },
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
            council: defaultCouncilState,
            press: { tick: 0, empires: new Map(), planets: new Map(), pressFactions: new Map(), activeStories: new Map(), publishedStories: [], crises: new Map(), quarantinedPlanets: new Set(), jammedSystems: new Set(), counterNarratives: new Map() },
            intelligence: buildEmptyIntelligenceState(),
            leadership: buildEmptyLeadershipState(),
            doctrines: new Map(),
            reputation: new Map(),
            nowSeconds: Math.floor(Date.now() / 1000),
            combat: { recruitmentJobs: [] }
        };

        // Initialize homeworlds
        globalGameStateInstance.economy.factions.forEach((f, id) => {
            initializeFactionHomeWorld(globalGameStateInstance!, id);
            if (f.capitalSystemId) {
                globalGameStateInstance!.movement.factionVisibility.set(id, {
                    [f.capitalSystemId]: {
                        revealStage: 'surveyed',
                        lastSeenAt: new Date().toISOString(),
                        visibleTags: globalGameStateInstance!.movement.systems.get(f.capitalSystemId)?.tags || [],
                        observedFleetIds: [],
                        movementIntentVisible: true
                    }
                });
            }
        });
    }
    return globalGameStateInstance!;
}

export function getCorporateWorldState(): CorporateWorldState {
    if (!globalCorporateStateInstance) {
        globalCorporateStateInstance = createEmptyCorporateWorldState();
    }
    return globalCorporateStateInstance!;
}

/**
 * Returns the construction state from the main game world singleton.
 * This ensures consistency across system layers.
 */
export function getConstructionWorldState(): ConstructionWorldState {
    return getGameWorldState().construction;
}
