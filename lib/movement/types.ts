// lib/movement/types.ts
// Stars of Dominion — Movement, Exploration & Doctrine Type System
// Extends lib/trade-system/types.ts; does not replace it.

import type { EconomyWorldState } from '../economy/economy-types';
import type { IdeologyProfile } from '../politics/ideology-types';

// ─── Movement Layers ─────────────────────────────────────────────────────────

export type MovementLayer =
    | 'hyperlane'
    | 'trade'
    | 'corridor'
    | 'gate'
    | 'deepSpace';

/**
 * Per-layer speed/risk/detectability multipliers granted by a fleet's
 * hyperdrive technology. Not a global constant — each tech level differs.
 */
export interface LayerModifiers {
    /** Speed multiplier on this layer relative to base fleet speed. */
    speedMultiplier: number;
    /** 0–1: fraction of normal detectability on this layer. */
    detectabilityMultiplier: number;
    /** Fuel/supply consumption multiplier on this layer. */
    supplyStrainMultiplier: number;
}

export type HyperdriveProfile = Record<MovementLayer, LayerModifiers>;

// ─── System & Planet ─────────────────────────────────────────────────────────

export type RevealStage = 'unknown' | 'pinged' | 'scanned' | 'surveyed';

/** Progressive tag reveal state for a single system. */
export interface TagRevealState {
    /** All tags on this system (ground truth). */
    allTags: string[];
    /** Tags visible at each stage. Populated by ExplorationService on survey. */
    revealedAt: Partial<Record<RevealStage, string[]>>;
}

/**
 * A star system node in the movement graph.
 * Compatible with (but separate from) the existing trade-system Planet type.
 */
export interface SystemNode {
    id: string;
    name: string;
    /** Axial hex coordinates (q, r). */
    q: number;
    r: number;
    tags: string[];
    tagReveal: TagRevealState;
    /** Direct hyperlane adjacencies (system IDs). */
    hyperlaneNeighbors: string[];
    /** IDs of trade route segments that pass through this system. */
    tradeSegmentIds: string[];
    /** IDs of corridor clusters this system belongs to. */
    corridorIds: string[];
    /** ID of the gate installed here, if any. */
    gateId?: string;
    /** Owner faction ID. Undefined = unclaimed. */
    ownerFactionId?: string;
    /** Instability 0–100. Affects deep-space expansion and infra degradation. */
    instability: number;
    /** Localized security level 0-100. Low security attracts pirates. */
    security?: number;
    /** Trade volume/value 0-100. High value attracts pirates. */
    tradeValue?: number;
    /** Current pirate lawlessness 0-100. At 100, system flips to a Pirate Haven. */
    lawlessness?: number;
    /** Tracked localized ideology profile for rebellions/dissent. */
    ideology?: IdeologyProfile;
}



/** A planet within a star system. Deterministic; anomalies are separate attachments. */
export interface PlanetNode {
    id: string;
    systemId: string;
    name: string;
    tags: string[];
    tagReveal: TagRevealState;
    /** IDs of anomalies currently attached to this planet. */
    anomalyIds: string[];
    /** Frontier expansion phase if any faction has claimed this planet. */
    frontierClaims: FrontierClaim[];
}

// ─── Fog of War / Sensors ─────────────────────────────────────────────────────

/** A single sensor contribution source. */
export type SensorSourceKind = 'planet' | 'outpost' | 'fleet';

export interface SensorSource {
    id: string;
    kind: SensorSourceKind;
    factionId: string;
    systemId: string;
    /** How many graph hops this source reaches. */
    detectionRadius: number;
    /** 0–1: base strength at range 0. Decays with distance per config. */
    detectionStrength: number;
}

/** Per-faction snapshot of what is visible for one system. */
export interface SystemVisibilityEntry {
    revealStage: RevealStage;
    /** ISO timestamp of last active sensor contact. */
    lastSeenAt: string;
    /** Partial tag list available at the current reveal stage. */
    visibleTags: string[];
    /** Observed fleet IDs (only those above detectability threshold). */
    observedFleetIds: string[];
    /** Whether movement intent (destination) is partially visible. */
    movementIntentVisible: boolean;
}

/** Full faction visibility map. Key = systemId. */
export type FactionVisibility = Record<string, SystemVisibilityEntry>;

// ─── Infrastructure — Trade Segments ─────────────────────────────────────────

export type TradeSegmentStatus =
    | 'active'
    | 'disrupted'
    | 'blockaded'
    | 'rerouted'
    | 'collapsed';

export interface TradeSegment {
    id: string;
    fromSystemId: string;
    toSystemId: string;
    /** Normalised 0–1. Affects route line thickness in UI. */
    throughput: number;
    status: TradeSegmentStatus;
    /** True after rerouting — this segment replaces a collapsed predecessor. */
    isReroute: boolean;
    /** Physical integrity 0–1. Decays via degradation modes. */
    integrity: number;
    /** Faction currently blockading this segment, if any. */
    blockadingFactionId?: string;
    /** Whether disruption events are flashing in the UI (ephemeral UI hint). */
    isFlashing: boolean;
}

// ─── Infrastructure — Corridors ───────────────────────────────────────────────

export interface Corridor {
    id: string;
    name: string;
    /** System IDs that form this corridor cluster. */
    nodeIds: string[];
    /** Subset of nodeIds that are chokepoints (strategic leverage points). */
    chokepointIds: string[];
    /** 0–1: degree of militarization — affects denial field strength. */
    militarizationLevel: number;
    /** Faction controlling the majority of this corridor, or undefined. */
    controllingFactionId?: string;
    /** Whether a denial field is active. */
    denialFieldActive: boolean;
}

// ─── Infrastructure — Gates ───────────────────────────────────────────────────

export type GateState = 'online' | 'offline' | 'unstable' | 'sabotaged' | 'destroyed';
export type GateAccessPolicy = 'open' | 'restricted' | 'closed';

export interface GateObject {
    id: string;
    systemId: string;
    /** Which faction built or controls this gate. */
    ownerFactionId: string;
    state: GateState;
    accessPolicy: GateAccessPolicy;
    /** Structural integrity 0–1. Falls under sabotage/overload. */
    integrity: number;
    /** Set of faction IDs with access in 'restricted' mode. */
    allowedFactionIds: string[];
    /** Whether overload has been triggered (causes instability). */
    overloadTriggered: boolean;
    /** ISO timestamp of last sabotage event, if any. */
    lastSabotagedAt?: string;
}

// ─── Infrastructure — Degradation ─────────────────────────────────────────────

export type DegradationMode = 'physical' | 'hostile' | 'economic';

export interface InfrastructureDegradation {
    id: string;
    /** The type of infrastructure being degraded. */
    infraType: 'tradeSegment' | 'corridor' | 'gate';
    targetId: string;
    mode: DegradationMode;
    /** Current severity 0–1. */
    severity: number;
    /** Whether this collapse was permanent (rare). */
    isPermanent: boolean;
    /** ISO timestamp degradation began. */
    startedAt: string;
    /** Recovery progress 0–1. Only used when recovering. */
    recoveryProgress: number;
}

export interface ReshapeResult {
    isPermanent: boolean;
    /** New links added to the hyperlane graph (permanent reroutes). */
    newLinks: { fromSystemId: string; toSystemId: string }[];
    /** Corridors that fractured — they become two separate shorter corridors. */
    fracturedCorridorIds: string[];
    /** New deep-space paths that opened up. */
    newDeepSpacePaths: { fromSystemId: string; toSystemId: string }[];
    narrative: string;
}

// ─── Fleet ────────────────────────────────────────────────────────────────────

export type FleetDoctrineType =
    | 'Defensive'
    | 'Offensive'
    | 'Raider'
    | 'Fortress'
    | 'Mobility';

export type EmpirePostureType =
    | 'Expansionist'
    | 'Consolidating'
    | 'Militarist'
    | 'Pacifist'
    | 'Mercantile';

export interface FleetOrder {
    type: 'move' | 'explore' | 'patrol' | 'blockade' | 'escort' | 'withdraw';
    targetSystemId: string;
    preferredLayer: MovementLayer;
    issuedAt: string; // ISO
    /** If set, auto-choose best available layer. Overrides preferredLayer. */
    autoLayer?: boolean;
}

export interface FleetDoctrine {
    type: FleetDoctrineType;
    /** 0–1: how far the fleet deviates from empire posture. 0 = aligned, 1 = fully deviant. */
    deviationFromPosture: number;
    /** Preferred movement layers in priority order. */
    preferredLayers: MovementLayer[];
    /** 0–1 HP fraction at which fleet attempts to retreat. */
    retreatThreshold: number;
    /** Accumulated logistics strain 0–1. High strain reduces supply efficiency. */
    logisticsStrain: number;
    /** Accumulated morale offset; negative = fatigue. -100 to 100. */
    moraleDrift: number;
    /** Supply stock remaining (normalised 0–1). */
    supplyLevel: number;
}

export interface Fleet {
    id: string;
    factionId: string;
    name: string;
    /** Current system the fleet is in, or null if in transit. */
    currentSystemId: string | null;
    /** System the fleet is travelling toward. Set during transit. */
    destinationSystemId: string | null;
    /** The movement layer being used for the current hop. */
    activeLayer: MovementLayer | null;
    /** 0–1 progress along current hop. */
    transitProgress: number;
    /** Estimated time remaining to destination, seconds. */
    etaSeconds: number;
    /** The full planned path (system IDs). Current hop = path[0]→path[1]. */
    plannedPath: string[];
    orders: FleetOrder[];
    doctrine: FleetDoctrine;
    /** ID of the empire posture this fleet is currently aligned to. */
    postureId: EmpirePostureType;
    /** 0–1: fleet strength (combat power / HP proxy). */
    strength: number;
    /** The aggregate base power of the entire fleet. */
    basePower: number;
    /** The unit breakdown (e.g. { interceptor: 10, destroyer: 2 }). */
    composition: any; // Using any for now to avoid circular deps if needed, but will refine to UnitComposition
    /** Hyperdrive profile this fleet uses for layer modifiers. */
    hyperdriveProfile: HyperdriveProfile;
    /** Whether this fleet is detectable above threshold (ui hint). */
    isDetectable: boolean;
}

// ─── Exploration ─────────────────────────────────────────────────────────────

export type AnomalyTrigger =
    | 'onSurvey'
    | 'onSettlement'
    | 'onMining'
    | 'onTradeThrough';

export interface Anomaly {
    id: string;
    name: string;
    description: string;
    trigger: AnomalyTrigger;
    /** Override tag weights (applied on top of base anomalyBaseChance). */
    tagWeights: Record<string, number>;
    /** The effect payload emitted to the event bus on trigger. */
    payload: Record<string, unknown>;
    /** Has this anomaly been triggered yet? */
    triggered: boolean;
    triggeredAt?: string;
}

export type FrontierPhase = 'claim' | 'anchor' | 'integrate';

export interface FrontierClaim {
    systemId: string;
    factionId: string;
    phase: FrontierPhase;
    /** Presence score 0–100: drives phase advancement. */
    presenceScore: number;
    /** ISO timestamp of when this phase started. */
    phaseStartedAt: string;
    /** Days since claim began. Drives minimum time threshold. */
    claimAgeDays: number;
}

export interface ExplorationOrder {
    fleetId: string;
    targetSystemId: string;
    mode: 'ping' | 'scan' | 'survey';
    /** Whether issued by player or by doctrine automation. */
    isAutomated: boolean;
    issuedAt: string;
    /** ISO timestamp when this stage completes. */
    completesAt: string;
}

export interface AutomationDoctrine {
    factionId: string;
    /** Maximum simultaneous automated scouts. */
    maxScouts: number;
    /** 'conservative' | 'balanced' | 'aggressive' — maps to config risk tolerances. */
    riskTolerance: 'conservative' | 'balanced' | 'aggressive';
    /** Priority hints: prefer expanding toward these region IDs. */
    targetRegionIds: string[];
    /** Credits/supply per tick allocated to automated scouting. */
    budget: number;
    active: boolean;
}

// ─── Doctrine & Empire Posture ────────────────────────────────────────────────

export interface InfluenceBloc {
    id: 'military' | 'trade' | 'frontier' | 'science';
    name: string;
    /** 0–100: share of total influence. */
    influence: number;
    /** 0–100: bloc satisfaction. Low satisfaction = drift toward crisis. */
    satisfaction: number;
    /** Per-tick drift direction: positive = growing, negative = declining. */
    trend: number;
}

export interface EmpirePosture {
    factionId: string;
    current: EmpirePostureType;
    /** Non-null while switching; represents the target. */
    pendingTarget: EmpirePostureType | null;
    /** ISO timestamp when the switch completes. */
    switchCompletesAt: string | null;
    /** 0–1 inefficiency penalty active during transition. */
    transitionPenalty: number;
    blocs: InfluenceBloc[];
    societyId?: string;
    governmentId?: string;
    society_tags?: string[];
    government_tags?: string[];
    ideology: IdeologyProfile;
}

// ─── Air Sorties (Naval Air Support) ───────────────────────────────────────────

export type AirMissionType = 'scout' | 'strike_fleet' | 'strike_planet' | 'escort';
export type AirSortieStatus = 'outbound' | 'executing' | 'returning' | 'destroyed';

export interface AirSortie {
    id: string;
    factionId: string;
    parentBaseId: string; // Fleet ID or Planet ID
    missionType: AirMissionType;
    composition: { interceptor?: number; bomber?: number };
    originSystemId: string;
    targetId: string; // System, Fleet, Planet, or Route ID
    status: AirSortieStatus;
    maxRadius: number; // Operational radius in hyperlane jumps
    
    currentSystemId: string;
    launchedAt: number;
}

// ─── World State (aggregate passed to services) ───────────────────────────────

export interface MovementWorldState {
    systems: Map<string, SystemNode>;
    planets: Map<string, PlanetNode>;
    gates: Map<string, GateObject>;
    tradeSegments: Map<string, TradeSegment>;
    corridors: Map<string, Corridor>;
    fleets: Map<string, Fleet>;
    factionVisibility: Map<string, FactionVisibility>; // factionId → visibility map
    sensorSources: SensorSource[];
    anomalyPool: Anomaly[];
    frontierClaims: FrontierClaim[];
    explorationOrders: ExplorationOrder[];
    automationDoctrines: Map<string, AutomationDoctrine>;
    empirePostures: Map<string, EmpirePosture>;
    degradations: Map<string, InfrastructureDegradation>;
    sorties: Map<string, AirSortie>;
    /** Unix epoch in seconds — current simulation time. */
    nowSeconds: number;
}

// ─── Infra Action (weaponization) ─────────────────────────────────────────────

export type InfraActionType =
    | 'blockade'
    | 'disruptRoute'
    | 'militarizeCorridor'
    | 'activateDenialField'
    | 'sabotageGate'
    | 'overloadGate'
    | 'closeGate'
    | 'openShadowHub'
    | 'establishSmugglersLane';

export interface InfraAction {
    type: InfraActionType;
    actorFactionId: string;
    targetId: string; // systemId, segmentId, gateId, or corridorId depending on type
    targetSystemId?: string;
    /** Intensity 0–1; affects probability of success and consequence severity. */
    intensity: number;
}

// ─── UI Render Primitives ─────────────────────────────────────────────────────

export type OverlayPrimitiveKind = 'line' | 'icon' | 'heatTile' | 'label';

export interface OverlayLine {
    kind: 'line';
    fromSystemId: string;
    toSystemId: string;
    color: string;
    /** 1–8 pixels. */
    thickness: number;
    dashed: boolean;
    /** Used to drive flashing animation in UI. */
    flashing: boolean;
    opacity: number;
    layer: MovementLayer;
}

export interface OverlayIcon {
    kind: 'icon';
    systemId: string;
    iconType: string; // e.g. 'gate-online', 'gate-sabotaged', 'blockade', 'anomaly'
    color: string;
    size: number;
}

export interface OverlayHeatTile {
    kind: 'heatTile';
    systemId: string;
    /** 0–1 heat intensity, mapped to color scale in UI. */
    intensity: number;
    colorScheme: 'red' | 'blue' | 'green' | 'amber' | 'purple';
}

export interface OverlayLabel {
    kind: 'label';
    systemId: string;
    text: string;
    color: string;
}

export type OverlayPrimitive = OverlayLine | OverlayIcon | OverlayHeatTile | OverlayLabel;

export type OverlayType =
    | 'systems'
    | 'trade'
    | 'corridor'
    | 'gates'
    | 'deepSpace'
    | 'sensors'
    | 'influence';

// ─── Fleet Card (UI) ──────────────────────────────────────────────────────────

export interface FleetCardData {
    fleetId: string;
    name: string;
    factionId: string;
    doctrineType: FleetDoctrineType;
    doctrineIcon: string; // e.g. 'shield', 'sword', 'skull'
    activeLayer: MovementLayer | null;
    layerBias: MovementLayer[]; // preferred layers in order
    supplyStrainLevel: 'low' | 'moderate' | 'high' | 'critical';
    supplyStrainValue: number; // 0–1
    moraleDrift: number; // negative = fatigue
    strength: number; // 0–1
    etaLabel: string; // Human-readable, e.g. "14 min" or "In system"
    isDetectable: boolean;
    isInTransit: boolean;
    postureAligned: boolean;
}
