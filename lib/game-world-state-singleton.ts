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
import { ensureLaneGraph, loadLaneLinks } from './movement/lane-graph';
import type { EconomyWorldState } from './economy/economy-types';
import type { EspionageWorldState } from './espionage/espionage-types';
import { CorporateWorldState, createEmptyCorporateWorldState } from './economy/corporate/company-registry';
import { ConstructionWorldState, Planet } from './construction/construction-types';
import { defaultCouncilState } from './ui/defaults';
import { Faction, Resource, Market, TradeAgreement } from './trade-system/types';
import { LeadershipWorldState, Leader, LeaderRole } from './leadership/types';
import { initializeFactionHomeWorld } from './economy/services/initialization-service';
import { assignFlavorTags } from './galaxy/system-tags';
import { applyHomeworldNames, capitalSystemIdFor } from './galaxy/faction-capitals';
import { emptyTitleState } from './titles/title-service';

// ─── Module-Level Singletons ───────────────────────────────────────────────

let globalGameStateInstance: GameWorldState | null = null;

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
            // The snapshot's lanes live in `data.links`, not on the nodes — without
            // this every system boots with an empty neighbour list and the whole
            // hyperlane layer (pathing, sensors, cohesion, press) is dead.
            ensureLaneGraph(systems, { links: loadLaneLinks(systemsPath) });
            // The generator hands out procedural labels ("Rim Node 68"), which
            // is fine for the 553 systems nobody lives on and wrong for the
            // fourteen a player calls home. Renaming here, before visibility is
            // seeded, means the name is already right on first reveal.
            const renamed = applyHomeworldNames(systems);
            if (renamed) console.log(`[Galaxy] Named ${renamed} faction homeworld system(s).`);
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

/**
 * A civilization's signature luxury, stocked at world birth.
 *
 * Keyed by civilizationId and spread into the faction's opening reserves. An
 * empty entry for everyone else, so the spread is a no-op.
 */
const LUXURY_RESERVES: Record<string, Partial<Record<Resource, number>>> = {
    'civ-buthari': { [Resource.SACRED_FLORA]: 2500 },
    'civ-gabagoon': { [Resource.CAPACOLA]: 2500 },
};

function buildEmptyEconomyState(): EconomyWorldState {
    const factions = new Map<string, Faction>();
    // Capitals are NOT literals here any more — they live in
    // lib/galaxy/faction-capitals.ts alongside each faction's homeworld name,
    // because ten of them used to be placeholder strings that matched no system
    // and silently disabled trade routes, cohesion distance and pirate reach for
    // those factions. `faction-rhimetals` also stops borrowing civ-grakkar: it
    // has its own civilization now.
    const FACTION_DATA = [
        { id: 'faction-aurelian', name: 'Aurelian Hegemony', civilizationId: 'civ-elyndra', ideologyId: 'ideo-capitalist' },
        { id: 'faction-vektori', name: 'Vektori Technocracy', civilizationId: 'civ-velkori', ideologyId: 'ideo-individualist' },
        { id: 'faction-null-syndicate', name: 'Nullward Syndicate', civilizationId: 'civ-auraxian', ideologyId: 'ideo-mercantile' },
        { id: 'faction-covenant', name: 'Altaris Covenant', civilizationId: 'civ-solari', ideologyId: 'ideo-theocratic' },
        { id: 'nexulan_convergence', name: 'Nexulan Convergence', civilizationId: 'civ-nexulan', ideologyId: 'ideo-technocratic' },
        { id: 'banking_clan', name: 'Intergalactic Banking Clan', civilizationId: 'civ-intergalactic', ideologyId: 'ideo-mercantile' },
        { id: 'faction-rhimetals', name: 'Rhimetals / Rufus', civilizationId: 'civ-rhimetals', ideologyId: 'ideo-collectivist' },
        { id: 'faction-gabagoonians', name: 'Gabagoonians / Cohen', civilizationId: 'civ-gabagoon', ideologyId: 'ideo-individualist' },
        { id: 'faction-infernoids', name: 'Infernoids / Martijn', civilizationId: 'civ-infernoid', ideologyId: 'ideo-militaristic' },
        { id: 'faction-movanites', name: 'Movanites / David', civilizationId: 'civ-movanite', ideologyId: 'ideo-industrialist' },
        { id: 'faction-leopantheri', name: 'Leo-pantheri / Lolo', civilizationId: 'civ-leopantheri', ideologyId: 'ideo-diplomatic' },
        { id: 'faction-buthari', name: 'The Buthari / Hisham', civilizationId: 'civ-buthari', ideologyId: 'ideo-traditionalist' },
        { id: 'faction-sarrak', name: 'Sarrak / Sil', civilizationId: 'civ-sarrak', ideologyId: 'ideo-militaristic' },
        { id: 'faction-kaerruun', name: 'Kaer’Ruun / Otto', civilizationId: 'civ-kaerruun', ideologyId: 'ideo-militaristic' },
    ];

    FACTION_DATA.forEach((data) => {
        const theatreId = `theatre-${data.id.split('-')[1]}`;
        factions.set(data.id, {
            id: data.id,
            name: data.name,
            capitalSystemId: capitalSystemIdFor(data.id) ?? 'unknown-capital',
            theatreId: theatreId,
            backingRatioPolicy: 0.5,
            reserves: {
                [Resource.CREDITS]: 50000,
                [Resource.METALS]: 3000,
                [Resource.CHEMICALS]: 1500,
                [Resource.FOOD]: 2500,
                [Resource.ENERGY]: 5000,
                // Signature luxuries. Both were already Resource enum members —
                // "Buthari sacred flora" and "Gabagoonian luxury resource; also a
                // combat stimulant" — and neither was ever placed in anyone's
                // reserves, so the abilities that spend them had nothing to spend.
                ...LUXURY_RESERVES[data.civilizationId ?? ''],
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

export function getGameWorldState(): GameWorldState {
    if (!globalGameStateInstance) {
        globalGameStateInstance = {
            shared: defaultSharedState(),
            movement: buildEmptyMovementState(),
            economy: buildEmptyEconomyState(),
            corporate: createEmptyCorporateWorldState(),
            espionage: { operations: new Map(), factionIntel: new Map(), reports: new Map(), boardOpportunities: new Map(), attributionRecords: [], shadowEconomyNodes: new Map(), regionEscalation: new Map(), agents: new Map(), intelNetworks: new Map() },
            piracy: { organizations: new Map(), bases: new Map(), hostages: new Map(), protectionContracts: new Map(), tributes: new Map(), blackMarkets: new Map(), smugglingRuns: new Map(), sponsorships: new Map(), successions: new Map(), captures: new Map(), bounties: new Map(), opportunityIndex: new Map(), emergenceLog: [] },
            activeSeason: null,
            seasonHistory: [],
            hallOfFame: [],
            milestones: new Map(),
            titles: emptyTitleState(),
            legacyPrestigeBonuses: new Map(),
            victoryState: null,
            postVictoryTransition: null,
            territoryHistory: [],
            tech: new Map(),
            techHistory: new Map(),
            diplomacy: { offers: new Map(), cooldowns: new Map(), gambits: new Map(), leverage: new Map(), mandates: new Map(), sanctions: new Map(), promises: new Map(), interventions: new Map() },
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
            press: { tick: 0, empires: new Map(), planets: new Map(), pressFactions: new Map(), activeStories: new Map(), publishedStories: [], crises: new Map(), investigations: new Map(), campaigns: new Map(), quarantinedPlanets: new Set(), jammedSystems: new Set(), counterNarratives: new Map() },
            leadership: buildEmptyLeadershipState(),
            government: new Map(),
            planetCohesion: new Map(),
            defianceEvents: new Map(),
            secessionCrises: new Map(),
            doctrines: new Map(),
            reputation: new Map(),
            factionTraits: new Map(),
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
    // Corporate state now lives INSIDE the world state so it is ticked,
    // serialized, and synced with everything else.
    return getGameWorldState().corporate;
}

/**
 * Returns the construction state from the main game world singleton.
 * This ensures consistency across system layers.
 */
export function getConstructionWorldState(): ConstructionWorldState {
    return getGameWorldState().construction;
}
