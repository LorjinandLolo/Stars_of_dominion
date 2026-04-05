// types/ui-state.ts
// Stars of Dominion — UI Shell State Types

// ─── Navigation ───────────────────────────────────────────────────────────────

export type NavTab =
    | 'galaxy'
    | 'economy'
    | 'government'
    | 'intelligence'
    | 'press'
    | 'shadow'
    | 'council'
    | 'dossier'
    | 'tech'
    | 'discourse'
    | 'corporate'
    | 'war'
    | 'diplomacy'
    | 'leadership'
    | 'designer'
    | 'guide';

import { Resource, CharterPower } from '@/lib/economy/corporate/company-types';
export { Resource, CharterPower };
import { ProxyConflict, Treaty, TradePact, Tribute } from '@/lib/politics/cold-war-types';
import { SimulationState as PressSimulationState, PressFactionType, PressFactionState } from '@/lib/press-system/types';
import { ResearchSlot } from '@/lib/tech/types';
export { PressFactionType };
export type { PressFactionState };
import { CombatState } from '@/lib/combat/combat-types';
import { ShipDesign } from '@/lib/combat/ship-types';
import { LeadershipWorldState } from '@/lib/leadership/types';
import { EmpireDoctrines } from '@/lib/doctrine/types';
import { FactionReputation } from '@/lib/reputation/types';

import { RecruitmentJob } from '@/lib/combat/siege/siege-types';
export type { CombatState, ShipDesign, LeadershipWorldState, EmpireDoctrines, FactionReputation, RecruitmentJob };

// ─── Overlay ──────────────────────────────────────────────────────────────────

export type OverlayType =
    | 'tradeHeat'
    | 'instability'
    | 'institutionalAlignment'
    | 'escalation'
    | 'regionalStability'
    | 'deepSpace';

// ─── System Nodes ─────────────────────────────────────────────────────────────
export interface Anomaly {
    id: string;
    name: string;
    type: 'ancient_ruins' | 'stellar_phenomena' | 'pre_ftl' | 'void_rift';
    description: string;
    bonus: {
        research?: number;
        trade?: number;
        stability?: number;
    };
}

export interface SystemNode {
    id: string;
    /** Axial hex coordinates */
    q: number;
    r: number;
    name: string;
    ownerId?: string;        // Legacy field
    ownerFactionId?: string; // Phase 15: Authoritative Ownership
    isContested?: boolean;   // Phase 15: Authoritative Dispute
    tags: string[];
    security: number;        // 0–100
    tradeValue: number;      // 0–100
    instability: number;     // 0–100
    escalationLevel: number; // 0–10
    regionId?: string;

    // Exploration
    isSurveyed?: boolean;
    anomaly?: Anomaly;

    // Phase 13: Ground Combat System Variables
    unrest?: number; // 0-100% chance to trigger violent secession
    siege?: any;     // Stores temporary active `SiegeState`
}

// ─── Links ────────────────────────────────────────────────────────────────────

export type LinkClass = 'base' | 'trade' | 'landBridge' | 'gate' | 'shadowRoute';

export interface Link {
    id: string;
    fromSystemId: string;
    toSystemId: string;
    class: LinkClass;
}

// ─── Regions ──────────────────────────────────────────────────────────────────

export type RegionStatus = 'emerging' | 'stable' | 'dissolving';

export type IdeologyType =
    | 'imperial'
    | 'federalist'
    | 'mercantile'
    | 'anarchist'
    | 'technocrat'
    | 'theocratic';

export interface RegionMetrics {
    stabilityIndex: number;       // 0–100
    tradeVolume: number;          // 0–∞
    pirateShare: number;          // 0–1
    escalationAvg: number;        // 0–10
    dominantIdeology: IdeologyType;
    institutionalInfluence: number; // 0–100
    strengthScore: number;         // 0–100 — drives lock determination
}

export interface Region {
    id: string;
    name: string;
    systemIds: string[];
    metrics: RegionMetrics;
    status: RegionStatus;
    color: string; // hex color for soft border highlight
}

// ─── Regional Crisis Windows ──────────────────────────────────────────────────

export type CrisisKind = 'order' | 'ash' | 'coldWar' | 'imperial';
export type CrisisPhase = 'warning' | 'active' | 'nearLock';

export interface RegionCrisisWindow {
    id: string;
    regionId: string;
    kind: CrisisKind;
    phase: CrisisPhase;
    startedAt: string; // ISO timestamp
    endsAt?: string;   // ISO timestamp when applicable
    intensity: number; // 0–100
}

// ─── Council ──────────────────────────────────────────────────────────────────

export type CouncilStatus = 'absent' | 'founded' | 'split' | 'collapsed';

export interface Bloc {
    id: string;
    name: string;
    memberFactionIds: string[];
    influenceScore: number; // 0–100
}

export interface CouncilState {
    status: CouncilStatus;
    legitimacy: number;          // 0–100
    cohesion: number;            // 0–100
    polarization: number;        // 0–100
    enforcementCapacity: number; // 0–100
    corruptionExposure: number;  // 0–100
    blocs?: Bloc[];              // present when status === 'split'
    activeResolutionIds?: string[];
    emergencySession: boolean;
}

// ─── Phase 3: Empire Identity ──────────────────────────────────────────────

export interface EmpireIdentityState {
    leadership: LeadershipWorldState;
    doctrines: EmpireDoctrines;
    reputation: Record<string, FactionReputation>; // Keyed by factionId
}

// ─── Espionage ──────────────────────────────────────────────────────────────
import type { SpyAgent, IntelNetwork, AgentStatus } from '@/lib/espionage/agent-types';
export type { SpyAgent, IntelNetwork, AgentStatus };

export interface EspionageOperation {
    id: string;
    targetFactionId: string;
    targetRegionId: string;
    domain: string;
    status: 'pending' | 'active' | 'resolved' | 'failed';
    startedAt: string;
    completesAt: string;
    investmentLevel: number;
}

export interface AgentCandidate {
    id: string;
    name: string;
    codename: string;
    traitIds: string[];
    recruitmentCost: number;
}

export interface EspionageState {
    agents: SpyAgent[];
    networks: IntelNetwork[];
    operations: EspionageOperation[];
    candidates: AgentCandidate[];
    exposureRisk: number; // 0-100
}

// ─── Diplomacy & Rivalries ──────────────────────────────────────────────────

export interface RivalryState {
    id: string;
    empireAId: string;
    empireBId: string;
    rivalryScore: number;    // 0-100
    escalationLevel: number; // 0-7
    activeSanctionIds: string[];
    detenteActive: boolean;
}

export interface DiplomacyState {
    rivalries: RivalryState[];
    proxyConflicts: ProxyConflict[];
    treaties: Treaty[];
    tradePacts: TradePact[];
    tributes: Tribute[];
}

// ─── Politics & Blocs ───────────────────────────────────────────────────────

export interface InternalBloc {
    id: string;
    name: string;
    influence: number;      // 0-100
    satisfaction: number;   // 0-100
    trend: number;          // -1 to 1
    isCrisisContributor: boolean;
}

export interface PoliticsState {
    blocs: InternalBloc[];
    activePolicies: string[];
    crisisConditionMet: boolean;
    activeIndicators: string[];
    allFactions: any[]; // Phase 3: Live faction data for diplomacy
}

// ─── Tech & Research ────────────────────────────────────────────────────────

export interface TechState {
    unlockedTechIds: string[];
    lockedTechIds?: string[];
    activeSlots?: ResearchSlot[];
    maxSlots?: number;
    globalModifiers?: Record<string, number>;
    hardLocks: { domain: string; tier: number }[];
    activeEffects: any[];
    burnedCosts: any[];
    counters: {
        enemyResentment: number;
        internalInstability: number;
    };
}

// ─── Discourse ──────────────────────────────────────────────────────────────

export interface DiscourseMessage {
    id: string;
    speaker: 'player' | 'faction';
    content: string;
    timestamp: number;
}

export interface DiscourseState {
    activeFactionId: string | null;
    messages: Record<string, DiscourseMessage[]>;
    isGenerating: boolean;
}

// ─── Corporate ──────────────────────────────────────────────────────────────

export interface CompanySnapshot {
    id: string;
    fullName: string;
    foundingFactionId: string;
    sharePrice: number;
    sharePricePrev: number;
    sharesOutstanding: number;
    treasury: number;
    dividendsPaidTotal: number;
    privateFleetSize: number;
    autonomyLevel: number;
    corruptionIndex: number;
    activeTradeRouteIds: string[];
    monopolySystemsCount: number;
    corporateColoniesCount: number;
    powers: CharterPower[];
}

export interface MarketTicker {
    resource: Resource;
    currentPrice: number;
    basePrice: number;
    supply: number;
    demand: number;
}

export interface CorporateState {
    companies: CompanySnapshot[];
    markets: MarketTicker[];
    playerPortfolioValue: number;
    totalDividendsReceived: number;
}

// ─── Press & Viral News ──────────────────────────────────────────────────────
export type PressState = PressSimulationState;

// ─── Player State ─────────────────────────────────────────────────────────────

export type PlayerRole = 'sovereign' | 'shadow' | 'hybrid';

export interface PlayerState {
    factionId: string;
    civilizationId?: string;
    ideologyId?: string;
    role: PlayerRole;
    pirateInvolvementScore: number; // 0–100; ≥30 unlocks SHADOW tab
    infamy: number;                 // 0–100
    heat: number;                   // 0–100
    networkControl: number;         // 0–100
    blackMarketLiquidity: number;   // 0–100
    crewLoyalty: number;            // 0–100
}

// ─── Crisis Events ────────────────────────────────────────────────────────────

export type CrisisEventType =
    | 'diplomatic_incident'
    | 'blockade'
    | 'trade_war'
    | 'rebellion'
    | 'sabotage'
    | 'plague'
    | 'pirate_surge';

export interface CrisisEvent {
    id: string;
    regionId?: string;
    targetFactionId: string;
    type: CrisisEventType;
    startedAt: string;         // ISO timestamp
    responseDeadline: string;  // ISO timestamp
    severity: 'minor' | 'major' | 'existential';
    resolved: boolean;
}

// ─── Season ───────────────────────────────────────────────────────────────────

export type SeasonPhase = 'active' | 'finalCrisis' | 'locked';

export type RegionLockStatus = 'unlocked' | 'approaching' | 'locked';

export interface SeasonState {
    phase: SeasonPhase;
    seasonNumber: number;
    regionalLocks: Record<string, RegionLockStatus>;
    /** Approximate - only shown when very close to lock; never shown as exact % early */
    nearLockRegionIds: string[];
}

// ─── Chronicle ────────────────────────────────────────────────────────────────

export type ChronicleEventType =
    | 'region_formed'
    | 'region_dissolved'
    | 'crisis_started'
    | 'crisis_resolved'
    | 'council_founded'
    | 'council_split'
    | 'council_collapsed'
    | 'faction_ascended'
    | 'faction_fallen'
    | 'pirate_surge'
    | 'season_locked';

export interface ChronicleEntry {
    id: string;
    eventId: string;
    type: ChronicleEventType;
    timestamp: string;       // ISO
    regionId?: string;
    factionsInvolved: string[];
    headline: string;
    detail?: string;
}

// ─── Civilizational Outcomes ──────────────────────────────────────────────────

export interface CivilizationalOutcome {
    factionId: string;
    title: string;   // e.g. "Dominant Hegemony", "Pyrrhic Survivor"
    summary: string;
    metricsSnapshot: Record<string, number>;
    conflictsWithOutcomeIds: string[]; // other factionIds it directly conflicts with
}

// ─── UI Panel State (transient) ───────────────────────────────────────────────

export interface UIState {
    activeTab: NavTab;
    activeOverlay: OverlayType | null;
    selectedSystemId: string | null;
    crisisWindowMinimized: Record<string, boolean>;
    showSeasonEnd: boolean;
    espionageState: EspionageState;
    pressState: PressState;
    diplomacyState: DiplomacyState;
    shipDesigns: ShipDesign[];
}
