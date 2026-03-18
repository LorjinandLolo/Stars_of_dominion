// lib/seasons/season-types.ts
// Pillar 7 — Seasonal Macro Shifts data schemas.

// ─── Modifier types ───────────────────────────────────────────────────────────

export type SeasonModifierType =
    | 'tradeVolatility'
    | 'militaryEscalation'
    | 'commodityScarcity'
    | 'gateFlux'
    | 'deepSpaceBloom'
    | 'ideologicalDrift';

/** A single seasonal modifier that tilts equilibrium. */
export interface SeasonModifier {
    id: SeasonModifierType;
    label: string;
    /** 0–1 pressure rate applied per season duration. Config-sourced. */
    pressureRate: number;
    /** Which SharedState key this modifier affects. */
    affectedVariable: string;
    /** Human-readable description of the effect. */
    description?: string;
}

// ─── Active season ────────────────────────────────────────────────────────────

export type SeasonPhase =
    | 'announced'    // declared but not yet started (announcement lead time)
    | 'active'       // modifiers are in effect
    | 'ending'       // last 20% of season duration (rewards visible)
    | 'complete';    // season ended, rewards applied

export interface ActiveSeason {
    id: string;
    seasonNumber: number;
    phase: SeasonPhase;
    /** Active modifier pool (2–3 per spec). */
    modifiers: SeasonModifier[];
    /** ISO timestamp when announced. */
    announcedAt: string;
    /** ISO timestamp when modifiers become active. */
    activatesAt: string;
    /** ISO timestamp when the season ends. */
    endsAt: string;
    /** Prestige/title tracking per faction. Key = factionId. */
    factionRecognition: Map<string, SeasonFactionRecord>;
}

export interface SeasonFactionRecord {
    factionId: string;
    earnedTitles: string[];
    prestige: number;
    bonusesApplied: string[];
}

// ─── Season record (history) ──────────────────────────────────────────────────

export interface SeasonRecord {
    id: string;
    seasonNumber: number;
    modifiers: SeasonModifier[];
    completedAt: string;
    /** Final recognition per faction. */
    factionOutcomes: Record<string, SeasonFactionRecord>;
    /** Narrative summary of what defined this season. */
    narrative: string;
}

// ─── Reward definitions ───────────────────────────────────────────────────────

export interface SeasonReward {
    /** Title granted. */
    title: string;
    /** Prestige points added. */
    prestige: number;
    /** Minor persistent bonus — must not snowball. */
    bonus: string;
}

// ─── Victory types ─────────────────────────────────────────────────────────────

export type VictoryType = 'conquest' | 'enlightenment';

export type EnlightenmentPhase =
    | 'inactive'      // not attempting
    | 'qualifying'    // sustaining thresholds, timer running
    | 'transcending'  // qualification met, timed window active
    | 'complete';     // victory achieved

/**
 * Tracks an active Conquest victory: which faction controls all territory,
 * and what pressure has accumulated on their empire.
 */
export interface ConquestState {
    /** The faction that achieved full territorial control. */
    factionId: string;
    /** ISO timestamp when conquest was declared. */
    declaredAt: string;
    /** Accumulated stability drift pressure (0–1). Feeds crisis system. */
    rebellionPressure: number;
    /** Which regions have crossed the autonomous-pressure threshold. */
    flaggedAutonomousRegions: string[];
    /** Whether a post-victory transition has been initiated. */
    transitionStarted: boolean;
}

/**
 * Per-faction Enlightenment qualification progress.
 */
export interface EnlightenmentProgress {
    factionId: string;
    phase: EnlightenmentPhase;
    /** ISO timestamp when qualification timer started (null if not qualifying). */
    qualifyingStartedAt: string | null;
    /** Accumulated qualification seconds. Resets on any threshold failure. */
    qualificationSecondsAccumulated: number;
    /** ISO timestamp when transcendence window started. */
    transcendenceStartedAt: string | null;
    /** Whether transcendence was interrupted (requires restart). */
    transcendenceInterrupted: boolean;
    /** Structural impact granted on success. */
    structuralImpact: string | null;
    /** Legacy bonuses applied. Key = bonus type, value = magnitude. */
    legacyBonuses: Record<string, number>;
}

/**
 * Galaxy-wide victory state. At most one conquest or one enlightenment active
 * at a time. Enlightenment progress is tracked per faction.
 */
export interface VictoryState {
    conquest: ConquestState | null;
    enlightenmentProgress: Map<string, EnlightenmentProgress>;
    /** Result of the most recent victory (for history/UI). */
    lastVictoryType: VictoryType | null;
    lastVictoryFactionId: string | null;
    lastVictoryAt: string | null;
}

/**
 * 48-hour multiplier phase that follows any victory.
 * Amplifies drift rates across all shared-state variables temporarily.
 */
export interface PostVictoryTransition {
    victoryType: VictoryType;
    triggeringFactionId: string;
    /** ISO start timestamp. */
    startedAt: string;
    /** ISO end timestamp (startedAt + 48h). */
    endsAt: string;
    /** Whether the transition has been resolved (next season modifier applied). */
    resolved: boolean;
    /** Multipliers active during the transition for each pressure vector. */
    multipliers: {
        instability: number;
        tradeVolatility: number;
        espionageActivity: number;
        blocSensitivity: number;
        deepSpaceExpansion: number;
    };
}

/**
 * Snapshot of territorial ownership and infrastructure at a season boundary.
 * Ownership is never automatically reset — this record is the source of truth.
 */
export interface TerritoryPersistenceRecord {
    seasonNumber: number;
    /** ISO timestamp of snapshot. */
    snapshotAt: string;
    /** systemId → owning factionId at time of snapshot. */
    territories: Record<string, string>;
    /** segmentId → integrity value (0–1). */
    infraIntegrity: Record<string, number>;
    /** gateId → integrity value (0–1). */
    gateIntegrity: Record<string, number>;
    /** Any regions flagged as autonomousPressure=true at snapshot time. */
    autonomousPressureRegions: string[];
}
