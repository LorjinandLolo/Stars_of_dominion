// lib/store/ui-store.ts
// Stars of Dominion — Global Zustand UI Store

import { create } from 'zustand';
import type {
    NavTab,
    OverlayType,
    PlayerState,
    CouncilState,
    Region,
    RegionCrisisWindow,
    SeasonState,
    CrisisEvent,
    ChronicleEntry,
    CivilizationalOutcome,
    SystemNode,
    Link,
    EspionageState,
    PoliticsState,
    DiplomacyState,
    TechState,
    DiscourseState,
    DiscourseMessage,
    CorporateState,
    PressState,
    CombatState,
    ShipDesign,
    EmpireIdentityState,
    RecruitmentJob,
} from '@/types/ui-state';
import type { Fleet, FactionVisibility } from '@/lib/movement/types';
import type { Faction } from '@/lib/trade-system/types';

// ─── Store shape ──────────────────────────────────────────────────────────────

export interface UIStore {
    // ── Navigation ──
    activeTab: NavTab;
    setActiveTab: (tab: NavTab) => void;

    // ── Player Faction (set from lobby) ──
    playerFactionId: string | null;
    setPlayerFactionId: (id: string) => void;

    // ── Galaxy overlays ──
    activeOverlay: OverlayType | null;
    setActiveOverlay: (overlay: OverlayType | null) => void;
    toggleOverlay: (overlay: OverlayType) => void;

    // ── System selection ──
    selectedSystemId: string | null;
    setSelectedSystem: (id: string | null) => void;

    // ── Fleet selection ──
    selectedFleetId: string | null;
    setSelectedFleetId: (id: string | null) => void;

    // ── Planet selection ──
    selectedPlanetId: string | null;
    setSelectedPlanet: (id: string | null) => void;

    // ── Orbital engagement (fleet in orbit around a specific planet) ──
    orbitedPlanetId: string | null;
    setOrbitedPlanet: (id: string | null) => void;

    // ── Systems & links ──
    systems: SystemNode[];
    setSystems: (systems: SystemNode[]) => void;
    updateSystem: (id: string, patch: Partial<SystemNode>) => void;
    links: Link[];

    // ── Contested systems (populated when planet data is loaded per system) ──
    contestedSystemIds: Set<string>;
    setSystemContested: (systemId: string, contested: boolean) => void;

    // ── Fleets ──
    fleets: Fleet[];
    setFleets: (fleets: Fleet[]) => void;

    // ── Planets (Synced from world.construction.planets) ──
    planets: any[]; // Use any[] for now to avoid complex imports, or import Planet type
    setPlanets: (planets: any[]) => void;

    // ── Regions ──
    regions: Region[];
    updateRegion: (id: string, patch: Partial<Region>) => void;

    // ── Regional crisis windows ──
    crisisWindows: RegionCrisisWindow[];
    addCrisisWindow: (w: RegionCrisisWindow) => void;
    removeCrisisWindow: (id: string) => void;
    updateCrisisWindowPhase: (id: string, phase: RegionCrisisWindow['phase']) => void;

    // ── Crisis window UI: minimize per id ──
    crisisWindowMinimized: Record<string, boolean>;
    toggleCrisisWindowMinimized: (id: string) => void;

    // ── Council ──
    councilState: CouncilState;
    updateCouncil: (patch: Partial<CouncilState>) => void;

    // ── Player ──
    playerState: PlayerState;
    updatePlayer: (patch: Partial<PlayerState>) => void;

    // ── Season & locks ──
    seasonState: SeasonState;
    updateSeason: (patch: Partial<SeasonState>) => void;
    lockRegion: (regionId: string) => void;

    // ── Crisis events ──
    crisisEvents: CrisisEvent[];
    addCrisisEvent: (ev: CrisisEvent) => void;
    resolveCrisisEvent: (id: string) => void;

    // ── Chronicle ──
    chronicle: ChronicleEntry[];
    addChronicleEntry: (entry: ChronicleEntry) => void;

    // ── Civilizational outcomes ──
    civilizationalOutcomes: CivilizationalOutcome[];
    setCivilizationalOutcomes: (outcomes: CivilizationalOutcome[]) => void;

    // ── Season end overlay ──
    showSeasonEnd: boolean;
    setShowSeasonEnd: (show: boolean) => void;

    // ── Economic Terminal ──
    showEconomicTerminal: boolean;
    setShowEconomicTerminal: (show: boolean) => void;

    // ── Espionage ──
    espionageState: EspionageState;
    updateEspionage: (patch: Partial<EspionageState>) => void;

    // ── Politics ──
    politicsState: PoliticsState;
    updatePolitics: (patch: Partial<PoliticsState>) => void;

    // ── Diplomacy ──
    diplomacyState: DiplomacyState;
    updateDiplomacy: (patch: Partial<DiplomacyState>) => void;

    // ── Tech ──
    techState: TechState;
    updateTech: (patch: Partial<TechState>) => void;

    // ── Discourse ──
    discourseState: DiscourseState;
    updateDiscourse: (patch: Partial<DiscourseState>) => void;
    addDiscourseMessage: (factionId: string, message: DiscourseMessage) => void;

    // ── Corporate ──
    corporateState: CorporateState;
    updateCorporate: (patch: Partial<CorporateState>) => void;

    // ── Press ──
    pressState: PressState;
    updatePress: (patch: Partial<PressState>) => void;

    // ── Combat ──
    activeCombats: CombatState[];
    updateCombat: (id: string, patch: Partial<CombatState>) => void;
    recruitmentJobs: RecruitmentJob[];
    setRecruitmentJobs: (jobs: RecruitmentJob[]) => void;

    // ── Ship Designs ──
    shipDesigns: ShipDesign[];
    addShipDesign: (design: ShipDesign) => void;
    updateShipDesign: (id: string, patch: Partial<ShipDesign>) => void;
    deleteShipDesign: (id: string) => void;

    // ── Empire Identity (Phase 3) ──
    empireIdentity: EmpireIdentityState;
    updateEmpireIdentity: (patch: Partial<EmpireIdentityState>) => void;

    // ── Global Time ──
    nowSeconds: number;
    setNowSeconds: (now: number) => void;

    // ── Visibility ──
    factionVisibility: FactionVisibility | null;
    setFactionVisibility: (vis: FactionVisibility | null) => void;

    // ── Floating Panels ──
    floatedTabs: Partial<Record<NavTab, { x: number; y: number; w: number; h: number } | null>>;
    toggleFloatTab: (tab: NavTab) => void;
    updateFloatedTabPos: (tab: NavTab, pos: { x: number; y: number; w?: number; h?: number }) => void;
    closeFloatedTab: (tab: NavTab) => void;

    // ── Factions & Economy ──
    factions: Record<string, Faction>;
    setFactions: (factions: Record<string, Faction>) => void;

    // ── Manual ──
    showManual: boolean;
    setShowManual: (show: boolean) => void;
    activeManualSectionId: string;
    setActiveManualSection: (id: string) => void;

    // ── Multiplayer Mode ──
    isMultiplayer: boolean;
    setIsMultiplayer: (val: boolean) => void;

    // ── Map Focus ──
    focusTarget: { x: number; y: number; zoom?: number } | null;
    setFocusTarget: (target: { x: number; y: number; zoom?: number } | null) => void;
}


// ─── Visibility helpers (re-exported for components) ─────────────────────────

/** SHADOW tab visibility threshold */
export const SHADOW_TAB_THRESHOLD = 30;

export function isShadowTabVisible(player: PlayerState): boolean {
    return player.pirateInvolvementScore >= SHADOW_TAB_THRESHOLD || player.role !== 'sovereign';
}

export function isCouncilTabVisible(council: CouncilState): boolean {
    return council.status !== 'absent';
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIStore>((set, get) => ({
    // ── Navigation ──
    activeTab: 'galaxy',
    setActiveTab: (tab) => set({ activeTab: tab }),

    // ── Player Faction (set from lobby) ──
    playerFactionId: null,
    setPlayerFactionId: (id) => set({ playerFactionId: id }),

    // ── Overlay ──
    activeOverlay: null,
    setActiveOverlay: (overlay) => set({ activeOverlay: overlay }),
    toggleOverlay: (overlay) =>
        set((state) => ({
            activeOverlay: state.activeOverlay === overlay ? null : overlay,
        })),

    // ── System selection ──
    selectedSystemId: null,
    setSelectedSystem: (id) => set({ selectedSystemId: id }),

    // ── Fleet selection ──
    selectedFleetId: null,
    setSelectedFleetId: (id: string | null) => set({ selectedFleetId: id }),

    // ── Planet selection ──
    selectedPlanetId: null,
    setSelectedPlanet: (id: string | null) => set({ selectedPlanetId: id }),

    // ── Orbital engagement ──
    orbitedPlanetId: null,
    setOrbitedPlanet: (id: string | null) => set({ orbitedPlanetId: id }),

    // ── Systems & links ──
    systems: [],
    setSystems: (systems) => set({ systems }),
    updateSystem: (id, patch) =>
        set((state) => ({
            systems: state.systems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
    links: [],

    // ── Contested systems ──
    contestedSystemIds: new Set<string>(),
    setSystemContested: (systemId, contested) =>
        set((state) => {
            const next = new Set(state.contestedSystemIds);
            if (contested) next.add(systemId);
            else next.delete(systemId);
            return { contestedSystemIds: next };
        }),

    // ── Fleets ──
    fleets: [],
    setFleets: (fleets) => set({ fleets }),

    // ── Planets ──
    planets: [],
    setPlanets: (planets) => set({ planets }),

    // ── Regions ──
    regions: [],
    updateRegion: (id, patch) =>
        set((state) => ({
            regions: state.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

    // ── Crisis windows ──
    crisisWindows: [],
    addCrisisWindow: (w) =>
        set((state) => ({ crisisWindows: [...state.crisisWindows, w] })),
    removeCrisisWindow: (id) =>
        set((state) => ({ crisisWindows: state.crisisWindows.filter((w) => w.id !== id) })),
    updateCrisisWindowPhase: (id, phase) =>
        set((state) => ({
            crisisWindows: state.crisisWindows.map((w) => (w.id === id ? { ...w, phase } : w)),
        })),

    // ── Crisis window minimize ──
    crisisWindowMinimized: {},
    toggleCrisisWindowMinimized: (id) =>
        set((state) => ({
            crisisWindowMinimized: {
                ...state.crisisWindowMinimized,
                [id]: !state.crisisWindowMinimized[id],
            },
        })),

    // ── Council ──
    councilState: { status: 'absent', members: [], policies: [], votes: {} } as any,
    updateCouncil: (patch) =>
        set((state) => ({ councilState: { ...state.councilState, ...patch } })),

    // ── Player ──
    playerState: { role: 'sovereign', factionId: '', credits: 0, pirateInvolvementScore: 0 } as any,
    updatePlayer: (patch) =>
        set((state) => ({ playerState: { ...state.playerState, ...patch } })),

    // ── Season ──
    seasonState: { season: 0, phase: 'active', regionalLocks: {}, nearLockRegionIds: [] } as any,
    updateSeason: (patch) =>
        set((state) => ({ seasonState: { ...state.seasonState, ...patch } })),
    lockRegion: (regionId) =>
        set((state) => ({
            seasonState: {
                ...state.seasonState,
                regionalLocks: {
                    ...state.seasonState.regionalLocks,
                    [regionId]: 'locked',
                },
            },
        })),

    // ── Crisis events ──
    crisisEvents: [],
    addCrisisEvent: (ev) =>
        set((state) => ({ crisisEvents: [...state.crisisEvents, ev] })),
    resolveCrisisEvent: (id) =>
        set((state) => ({
            crisisEvents: state.crisisEvents.map((e) =>
                e.id === id ? { ...e, resolved: true } : e
            ),
        })),

    // ── Chronicle ──
    chronicle: [],
    addChronicleEntry: (entry) =>
        set((state) => ({ chronicle: [...state.chronicle, entry] })),

    // ── Outcomes ──
    civilizationalOutcomes: [],
    setCivilizationalOutcomes: (outcomes) => set({ civilizationalOutcomes: outcomes }),

    // ── Season end ──
    showSeasonEnd: false,
    setShowSeasonEnd: (show) => set({ showSeasonEnd: show }),

    // ── Economic Terminal ──
    showEconomicTerminal: false,
    setShowEconomicTerminal: (show) => set({ showEconomicTerminal: show }),

    // ── Espionage ──
    espionageState: { operations: [], counterIntel: {}, networks: {} } as any,
    updateEspionage: (patch) =>
        set((state) => ({ espionageState: { ...state.espionageState, ...patch } })),

    // ── Politics ──
    politicsState: { blocs: [], activePolicies: [], crisisConditionMet: false, activeIndicators: [], allFactions: [] } as any,
    updatePolitics: (patch) =>
        set((state) => ({ politicsState: { ...state.politicsState, ...patch } })),

    // ── Diplomacy ──
    diplomacyState: { activeTreaties: [], pendingAgreements: [] } as any,
    updateDiplomacy: (patch) =>
        set((state) => ({ diplomacyState: { ...state.diplomacyState, ...patch } })),

    // ── Tech ──
    techState: { researched: [], researchQueue: [], knownBlueprints: [] } as any,
    updateTech: (patch) =>
        set((state) => ({ techState: { ...state.techState, ...patch } })),

    // ── Discourse ──
    discourseState: { activeChats: [], messages: {} } as any,
    updateDiscourse: (patch) =>
        set((state) => ({ discourseState: { ...state.discourseState, ...patch } })),
    addDiscourseMessage: (factionId, message) =>
        set((state) => {
            const currentMessages = state.discourseState.messages[factionId] || [];
            return {
                discourseState: {
                    ...state.discourseState,
                    messages: {
                        ...state.discourseState.messages,
                        [factionId]: [...currentMessages, message],
                    },
                },
            };
        }),

    // ── Corporate ──
    corporateState: { activeCharters: [], marketFluctuations: {} } as any,
    updateCorporate: (patch) =>
        set((state) => ({ corporateState: { ...state.corporateState, ...patch } })),

    // ── Press ──
    pressState: { publishedStories: [], activeStories: [], credibilityByFaction: {} } as any,
    updatePress: (patch) =>
        set((state) => ({ pressState: { ...state.pressState, ...patch } })),

    // ── Combat ──
    activeCombats: [],
    updateCombat: (id: string, patch) =>
        set((state) => ({
            activeCombats: (state as any).activeCombats.map((c: any) => (c.id === id ? { ...c, ...patch } : c)),
        })),
    recruitmentJobs: [],
    setRecruitmentJobs: (jobs) => set({ recruitmentJobs: jobs }),

    // ── Ship Designs ──
    shipDesigns: [],
    addShipDesign: (design) =>
        set((state) => ({ shipDesigns: [...state.shipDesigns, design] })),
    updateShipDesign: (id, patch) =>
        set((state) => ({
            shipDesigns: state.shipDesigns.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
    deleteShipDesign: (id) =>
        set((state) => ({ shipDesigns: state.shipDesigns.filter((d) => d.id !== id) })),

    // ── Empire Identity ──
    empireIdentity: {
        leadership: { leaders: new Map(), recruitmentPool: [], nowSeconds: 0 },
        doctrines: { 
            factionId: '', 
            activeDoctrines: { military: null, economic: null, intelligence: null }, 
            lastChangeTimestamps: { military: 0, economic: 0, intelligence: 0 } 
        },
        reputation: {},
    },
    updateEmpireIdentity: (patch) =>
        set((state) => ({ empireIdentity: { ...state.empireIdentity, ...patch } })),

    // ── Global Time ──
    nowSeconds: 0,
    setNowSeconds: (nowSeconds) => set({ nowSeconds }),

    // ── Visibility ──
    factionVisibility: null,
    setFactionVisibility: (vis: FactionVisibility | null) => set({ factionVisibility: vis }),

    // ── Floating Panels ──
    floatedTabs: {},
    toggleFloatTab: (tab) =>
        set((state) => {
            const isFloated = !!state.floatedTabs[tab];
            if (isFloated) {
                const newFloated = { ...state.floatedTabs };
                delete newFloated[tab];
                return { floatedTabs: newFloated };
            } else {
                return {
                    floatedTabs: {
                        ...state.floatedTabs,
                        [tab]: { x: 100, y: 100, w: 800, h: 600 },
                    },
                    activeTab: state.activeTab === tab ? 'galaxy' : state.activeTab,
                };
            }
        }),
    updateFloatedTabPos: (tab, pos) =>
        set((state) => ({
            floatedTabs: {
                ...state.floatedTabs,
                [tab]: { ...state.floatedTabs[tab]!, ...pos },
            },
        })),
    closeFloatedTab: (tab) =>
        set((state) => {
            const newFloated = { ...state.floatedTabs };
            delete newFloated[tab];
            return { floatedTabs: newFloated };
        }),
    // ── Factions & Economy ──
    factions: {},
    setFactions: (factions) => set({ factions }),

    // ── Manual ──
    showManual: false,
    setShowManual: (show) => set({ showManual: show }),
    activeManualSectionId: 'intro',
    setActiveManualSection: (id) => set({ activeManualSectionId: id }),

    // ── Multiplayer Mode ──
    isMultiplayer: false,
    setIsMultiplayer: (val) => set({ isMultiplayer: val }),

    // ── Map Focus ──
    focusTarget: null,
    setFocusTarget: (focusTarget) => set({ focusTarget }),
}));

