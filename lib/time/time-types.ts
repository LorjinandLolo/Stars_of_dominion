// lib/time/time-types.ts
// Stars of Dominion — Time & Turn System Core Types
// All timestamps are UTC ISO strings unless otherwise noted.

// ─── Strategic Tick ───────────────────────────────────────────────────────────

export interface StrategicTickState {
    /** ISO timestamp of the last successfully completed tick. */
    lastTickAt: string;
    /** ISO timestamp of the next scheduled tick (lastTickAt + 6h). */
    nextTickAt: string;
    /** Tick interval in hours. Default: 6. */
    tickIntervalHours: number;
    /** Monotonically increasing tick counter. Used to detect double-application. */
    tickIndex: number;
}

// ─── Timed Projects ───────────────────────────────────────────────────────────

export type TimedProjectType =
    | 'building'
    | 'ship_production'
    | 'research'
    | 'recruitment'
    | 'terraform'
    | 'fortification';

export type TimedProjectStatus =
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'cancelled';

export interface TimedProject {
    id: string;
    empireId: string;
    planetId: string;
    projectType: TimedProjectType;
    projectRef: string;        // e.g. tech ID, building ID, ship design ID
    startedAt: string;         // ISO
    totalTicksRequired: number;
    ticksCompleted: number;
    completesAtEstimated: string; // ISO — recalculated on each tick
    status: TimedProjectStatus;
    completedAt?: string;      // ISO — set when status becomes 'completed'
    notificationSent: boolean;
}

// ─── Fleet Transit ────────────────────────────────────────────────────────────

export type FleetMissionType =
    | 'patrol'
    | 'attack'
    | 'blockade'
    | 'colonize'
    | 'supply'
    | 'escort'
    | 'retreat';

export type FleetTransitStatus =
    | 'en_route'
    | 'arrived'
    | 'intercepted'
    | 'recalled';

export interface FleetTransit {
    id: string;
    empireId: string;
    originId: string;
    destinationId: string;
    departureTime: string;     // ISO
    arrivalTime: string;       // ISO
    missionType: FleetMissionType;
    /** Ship/unit IDs being transported. */
    payload: string[];
    status: FleetTransitStatus;
    /** If arrivalTime has passed and mission is attack/blockade, creates a crisis. */
    triggersCrisis: boolean;
    arrivalCrisisId?: string;  // Set after crisis created
}

// ─── Crisis Events ────────────────────────────────────────────────────────────

export type CrisisType =
    | 'orbital_assault'
    | 'blockade'
    | 'sabotage'
    | 'assassination_attempt'
    | 'coup_attempt'
    | 'rebellion_incitement'
    | 'blackmail'
    | 'propaganda_strike'
    | 'trade_seizure'
    | 'political_coercion'
    | 'proxy_funding_revealed'
    | 'espionage_exposed';

export type CrisisResponseOption =
    | 'escalate'
    | 'fortify'
    | 'deceive'
    | 'negotiate'
    | 'sacrifice';

export type CrisisAutoResolvePolicy =
    | 'use_doctrine'
    | 'default_fortify'
    | 'default_negotiate'
    | 'default_sacrifice';

export type CrisisResolutionStatus =
    | 'pending'
    | 'attacker_committed'
    | 'defender_responded'
    | 'auto_resolved'
    | 'resolved';

export interface CrisisEvent {
    id: string;
    attackerEmpireId: string;
    defenderEmpireId: string;
    /** The primary geographic target. */
    targetId: string;
    targetType: 'planet' | 'system' | 'region' | 'empire';
    crisisType: CrisisType;
    createdAt: string;         // ISO
    expiresAt: string;         // ISO — createdAt + duration from config
    severity: 'minor' | 'major' | 'existential';
    /** Whether the defender can see the crisis in their panel. */
    visibleToDefender: boolean;
    /** Attacker's optional prediction of defender's response. */
    attackerPrediction?: CrisisResponseOption;
    /** Set when defender responds. Null until then. */
    defenderResponse: CrisisResponseOption | null;
    autoResolvePolicy: CrisisAutoResolvePolicy;
    resolutionStatus: CrisisResolutionStatus;
    /** Narrative outcome text, populated on resolution. */
    outcomeText?: string;
    /** True if prediction matched response — gives attacker bonus effect. */
    predictionMatched?: boolean;
    /** Available response options shown to the defender. */
    availableResponses: CrisisResponseOption[];
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationCategory =
    | 'crisis'
    | 'diplomacy'
    | 'construction'
    | 'research'
    | 'combat'
    | 'espionage'
    | 'trade'
    | 'politics'
    | 'system';

export type NotificationPriority = 'urgent' | 'normal' | 'low';

export interface GameNotification {
    id: string;
    factionId: string;         // Recipient faction
    category: NotificationCategory;
    priority: NotificationPriority;
    title: string;
    body: string;
    createdAt: string;         // ISO
    read: boolean;
    /** Deep-link: which NavTab to open when clicking. */
    linkToTab?: string;
    /** Optional payload for rendering specialised UI (e.g. crisis ID). */
    payload?: Record<string, unknown>;
}
