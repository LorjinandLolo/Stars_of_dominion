// lib/narrative/chronicle-types.ts — the vocabulary of the galaxy's memory.
//
// See docs/narrative-system/README.md. Two rules govern everything here:
//   1. A ChronicleEvent records what ACTUALLY happened. `actorIds` is the truth
//      and never reaches the press layer.
//   2. `attribution` is the ceiling of what the public may know. The narrator
//      reads facts through that ceiling, so an LLM cannot leak what it was
//      never shown.

/** Every kind of event the simulation can record. Adding one requires an
 *  importance entry in chronicle-importance.ts — the table is exhaustive so a
 *  new type cannot silently score zero. */
export type ChronicleEventType =
    // War & combat
    | 'war_declared'
    | 'war_ended'
    | 'battle_resolved'
    | 'system_captured'
    | 'capital_captured'
    | 'siege_started'
    | 'planet_bombarded'
    | 'fleet_destroyed'
    // Diplomacy
    | 'treaty_signed'
    | 'treaty_broken'
    | 'alliance_formed'
    | 'alliance_dissolved'
    | 'tribute_imposed'
    | 'council_vote'
    // Espionage
    | 'operation_resolved'
    | 'operation_exposed'
    | 'agent_captured'
    // Politics & government
    | 'leader_rose'
    | 'leader_died'
    | 'coup_attempted'
    | 'government_changed'
    | 'secession_declared'
    | 'civil_war_started'
    | 'defiance_event'
    // Economy
    | 'trade_route_opened'
    | 'trade_route_lost'
    | 'economic_crisis'
    | 'blockade_started'
    // Piracy
    | 'pirate_raid'
    | 'pirate_state_recognized'
    // World & meta
    | 'empire_eliminated'
    | 'colony_founded'
    | 'season_milestone';

/**
 * Public attribution ceiling for an event.
 * - 'exposed'                — the galaxy knows who did it.
 * - 'suspected:<factionId>'  — a name is whispered; may be the wrong one.
 * - 'invisible'              — the effect is visible, the hand behind it is not.
 *
 * Mirrors the espionage system's AttributionState ladder, extended with the
 * suspected party so the press can blame a specific (possibly innocent) faction.
 */
export type ChronicleAttribution =
    | 'exposed'
    | 'invisible'
    | `suspected:${string}`;

/** Facts are type-specific and free-form; stored as a JSON string column.
 *  Keep values primitive — the narrator renders them straight into a prompt. */
export type ChronicleFacts = Record<string, string | number | boolean | null>;

/** What a call site hands to `record()`. Tick and day are filled in by the
 *  recorder from the world clock, and importance is computed, not supplied. */
export interface ChronicleDraft {
    type: ChronicleEventType;
    /** Who really acted. Never rendered into press prose unless attribution allows. */
    actorIds: string[];
    /** Who it happened to. Always public — you can see your own planet burn. */
    targetIds?: string[];
    /** System or planet id where it happened. */
    location?: string;
    /** Mechanical outcome — casualties, sums, terms, names. */
    facts?: ChronicleFacts;
    /** Defaults to 'exposed'. Covert acts must pass their real state. */
    attribution?: ChronicleAttribution;
    /**
     * Events sharing a key inside one narration batch merge into a single
     * article — one battle report, not five district skirmishes.
     */
    coalesceKey?: string;
    /**
     * Overrides the computed score. Use only where the base type cannot express
     * the stakes (e.g. a battle whose losses were catastrophic). Clamped 0-100.
     */
    importanceOverride?: number;
}

/** A recorded event, as it exists in memory before the batch flush. */
export interface ChronicleRow {
    tick: number;
    day: number;
    type: ChronicleEventType;
    importance: number;
    actorIds: string;    // JSON
    targetIds: string;   // JSON
    actorNames: string;  // JSON — display names as of the event
    targetNames: string; // JSON
    location: string | null;
    facts: string;      // JSON
    attribution: string;
    coalesceKey: string | null;
}

/** Below this score an event is memory-only: it feeds feud counts and
 *  precedent queries but never becomes prose. */
export const NARRATION_THRESHOLD = 15;
