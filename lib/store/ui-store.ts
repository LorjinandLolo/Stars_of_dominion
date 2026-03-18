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
} from '@/types/ui-state';
import type { Fleet } from '@/lib/movement/types';
import {
    mockSystems,
    mockLinks,
    mockRegions,
    mockCrisisWindows,
    mockCouncilState,
    mockPlayerState,
    mockCrisisEvents,
    mockPressState,
} from '@/lib/ui-mock-data';
import { mockSeasonState } from '@/lib/mock-season';
import { mockChronicle } from '@/lib/mock-chronicle';
import { mockCivilizationalOutcomes } from '@/lib/mock-outcomes';
import { mockEspionageState } from '@/lib/mock-espionage';
import { mockPoliticsState } from '@/lib/mock-politics';
import { mockDiplomacyState } from '@/lib/mock-diplomacy';
import { mockTechState } from '@/lib/mock-tech';
import { mockDiscourseState } from '@/lib/mock-discourse';
import { mockCorporateState } from '@/lib/mock-corporate';

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

    // ── Systems & links ──
    systems: SystemNode[];
    updateSystem: (id: string, patch: Partial<SystemNode>) => void;
    links: Link[];

    // ── Fleets ──
    fleets: Fleet[];
    setFleets: (fleets: Fleet[]) => void;

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

    // ── Ship Designs ──
    shipDesigns: ShipDesign[];
    addShipDesign: (design: ShipDesign) => void;
    updateShipDesign: (id: string, patch: Partial<ShipDesign>) => void;
    deleteShipDesign: (id: string) => void;
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

    // ── Systems & links ──
    systems: mockSystems,
    updateSystem: (id, patch) =>
        set((state) => ({
            systems: state.systems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
    links: mockLinks,

    // ── Fleets ──
    fleets: [],
    setFleets: (fleets) => set({ fleets }),

    // ── Regions ──
    regions: mockRegions,
    updateRegion: (id, patch) =>
        set((state) => ({
            regions: state.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

    // ── Crisis windows ──
    crisisWindows: mockCrisisWindows,
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
    councilState: mockCouncilState,
    updateCouncil: (patch) =>
        set((state) => ({ councilState: { ...state.councilState, ...patch } })),

    // ── Player ──
    playerState: mockPlayerState,
    updatePlayer: (patch) =>
        set((state) => ({ playerState: { ...state.playerState, ...patch } })),

    // ── Season ──
    seasonState: mockSeasonState,
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
    crisisEvents: mockCrisisEvents,
    addCrisisEvent: (ev) =>
        set((state) => ({ crisisEvents: [...state.crisisEvents, ev] })),
    resolveCrisisEvent: (id) =>
        set((state) => ({
            crisisEvents: state.crisisEvents.map((e) =>
                e.id === id ? { ...e, resolved: true } : e
            ),
        })),

    // ── Chronicle ──
    chronicle: mockChronicle,
    addChronicleEntry: (entry) =>
        set((state) => ({ chronicle: [...state.chronicle, entry] })),

    // ── Outcomes ──
    civilizationalOutcomes: mockCivilizationalOutcomes,
    setCivilizationalOutcomes: (outcomes) => set({ civilizationalOutcomes: outcomes }),

    // ── Season end ──
    showSeasonEnd: false,
    setShowSeasonEnd: (show) => set({ showSeasonEnd: show }),

    // ── Economic Terminal ──
    showEconomicTerminal: false,
    setShowEconomicTerminal: (show) => set({ showEconomicTerminal: show }),

    // ── Espionage ──
    espionageState: mockEspionageState,
    updateEspionage: (patch) =>
        set((state) => ({ espionageState: { ...state.espionageState, ...patch } })),

    // ── Politics ──
    politicsState: mockPoliticsState,
    updatePolitics: (patch) =>
        set((state) => ({ politicsState: { ...state.politicsState, ...patch } })),

    // ── Diplomacy ──
    diplomacyState: mockDiplomacyState,
    updateDiplomacy: (patch) =>
        set((state) => ({ diplomacyState: { ...state.diplomacyState, ...patch } })),

    // ── Tech ──
    techState: mockTechState,
    updateTech: (patch) =>
        set((state) => ({ techState: { ...state.techState, ...patch } })),

    // ── Discourse ──
    discourseState: mockDiscourseState,
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
    corporateState: mockCorporateState,
    updateCorporate: (patch) =>
        set((state) => ({ corporateState: { ...state.corporateState, ...patch } })),

    // ── Press ──
    pressState: mockPressState,
    updatePress: (patch) =>
        set((state) => ({ pressState: { ...state.pressState, ...patch } })),

    // ── Combat ──
    activeCombats: [],
    updateCombat: (id: string, patch) =>
        set((state) => ({
            activeCombats: state.activeCombats.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

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
}));
