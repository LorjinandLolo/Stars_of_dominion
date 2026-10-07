// lib/espionage/espionage-types.ts
// Pillar 6 — Espionage & Subversion data schemas.

import type { SpyAgent, IntelNetwork } from './agent-types';
import type { ClueTag } from './dossier';

// ─── Operation domains ────────────────────────────────────────────────────────

export type OperationDomain =
    | 'infrastructureSabotage'
    | 'politicalSubversion'
    | 'shadowEconomy';

export type AttributionState =
    | 'invisible'   // effect visible, source unknown
    | 'suspected'   // probability indicator shown, tension raised
    | 'exposed';    // confirmed origin, diplomatic penalty

export type OperationStatus =
    | 'pending'
    | 'active'
    | 'resolved'
    | 'failed';

// ─── Operation ────────────────────────────────────────────────────────────────

export interface EspionageOperation {
    id: string;
    /** Faction conducting the operation. */
    actorFactionId: string;
    /** Faction targeted. */
    targetFactionId: string;
    /** Galaxy region/system targeted. */
    targetRegionId: string;
    domain: OperationDomain;
    /**
     * Catalog definition id (lib/espionage/operation-catalog.ts).
     * Optional: legacy domain-only ops predate the catalog.
     */
    definitionId?: string;
    /**
     * A false flag: the empire this operation was dressed up to look like.
     * Suspicion and planted clues point there (item 12; set by false-flag
     * operations in 12c). HIDDEN from everyone but the sponsor.
     */
    falseFlagFactionId?: string;
    /**
     * The agent running this operation, when one was named at launch. Their
     * traits and experience shape the odds; resolution costs them cover and
     * earns them experience. Absent for agentless (and all AI) operations.
     */
    agentId?: string;
    /** 0–1: investment level. Higher = better success rate + more detectable. */
    investmentLevel: number;
    /** 0–1: how risky the method chosen is. Affects attribution probability. */
    riskLevel: number;
    /** ISO timestamp when the operation started. */
    startedAt: string;
    /** ISO timestamp when the operation resolves. */
    completesAt: string;
    status: OperationStatus;
    attributionState: AttributionState;
    /** Whether the success check passed (resolved at completesAt). */
    succeeded?: boolean;
    /** Narrative from resolution. */
    narrative?: string;
}

// ─── Per-faction intelligence state ───────────────────────────────────────────

/**
 * Unified per-faction espionage state: the Intel resource, operation capacity,
 * per-target infiltration, and all counter-intelligence stats.
 * Absorbs the former CounterIntelState (regional investments) and the former
 * lib/intelligence IntelligenceNetwork (intel points, infiltration, defense).
 * Plain Records instead of Maps so faction shards serialize without special-casing.
 */
export interface FactionIntelState {
    factionId: string;
    /** Accumulated Intel resource; spent to launch covert operations. */
    intelPoints: number;
    /** Max simultaneous catalog operations. */
    agentCapacity: number;
    usedAgentCapacity: number;
    // Defensive stats (0–100 scales).
    counterIntelStrength: number;
    surveillanceStrength: number;
    propagandaResistance: number;
    internalSecurity: number;
    /** Infiltration score (0–100) keyed by target factionId. */
    infiltrationLevels: Record<string, number>;
    /** Counter-intel investment level per region (0–1), keyed by regionId. */
    regionalCounterIntel: Record<string, number>;
    /** Total counter-intel budget allocated (0–1 fraction of max). */
    counterIntelBudget: number;
    /**
     * True when last tick's counter-intelligence upkeep could not be paid in
     * Intel. The settings are kept, but while unpaid nothing they buy works:
     * regional coverage reads as zero and strength drifts toward zero.
     */
    counterIntelUnpaid?: boolean;
    /**
     * What this empire's service has found out about each rival, keyed by
     * factionId. Never the truth itself: only what sweeps, prisoners and our
     * own sources have shown us. Feeds the case board's dossiers.
     */
    dossier?: Record<string, DossierKnowledge>;
    /** Foreign agents we hold, as they present themselves. */
    prisoners?: PrisonerRecord[];
}

// ─── Attribution tracking ─────────────────────────────────────────────────────

export interface AttributionRecord {
    operationId: string;
    /** Which faction was fingered. May be incorrect in 'suspected' state. */
    suspectedFactionId: string;
    attributionState: AttributionState;
    /** Current attribution probability (0–1). */
    probability: number;
    /** Diplomatic tension increase applied. */
    tensionApplied: number;
    resolvedAt: string;
}

// ─── Intelligence reports (imperfect intel) ───────────────────────────────────

/**
 * A finding delivered to a faction by a successful intelligence operation.
 * Reports are IMPERFECT: `confidence` is what the player sees; `accurate` is
 * the hidden truth flag (false = distorted, fabricated, or planted by enemy
 * counter-intelligence). Never expose `accurate` to the report's owner.
 */
export interface IntelReport {
    id: string;
    /** Faction that received the report. */
    ownerFactionId: string;
    /** Faction the report is about. */
    targetFactionId: string;
    /** Intel domain, e.g. 'military' | 'political' | 'scientific' | 'counterintel'. */
    domain: string;
    title: string;
    /** Human-readable finding, numbers possibly distorted. */
    body: string;
    /** 0–1: displayed reliability estimate. */
    confidence: number;
    /**
     * HIDDEN truth flag. False = the body's key figures are wrong (bad tradecraft
     * or an enemy counter-intelligence plant). UI must never render this.
     */
    accurate: boolean;
    /** Operation that produced this report. */
    sourceOperationId?: string;
    createdAt: number;  // unix seconds (sim clock)
    expiresAt: number;  // unix seconds — stale reports are pruned
}

// ─── Intelligence Operations Board ────────────────────────────────────────────

/** What seizing an opportunity grants. One reward per opportunity. */
export type OpportunityReward =
    | { type: 'infiltration'; amount: number }        // vs targetFactionId
    | { type: 'intel'; amount: number }               // Intel points
    | { type: 'credits'; amount: number }
    | { type: 'report'; domain: 'military' | 'political' | 'scientific' } // instant intel report on target
    | { type: 'counterIntel'; amount: number }        // own counterIntelStrength
    | { type: 'instability'; amount: number }         // target capital system instability
    | { type: 'corporateScandal' };                   // opens a fraud crisis at the target's largest company

export type OpportunityKind = 'opportunity' | 'threat';

export type OpportunityStatus = 'available' | 'seized' | 'expired';

/**
 * A time-limited entry on a faction's Intelligence Operations Board.
 * Spawned from opportunity-templates.ts; expires if not seized in time.
 */
export interface BoardOpportunity {
    id: string;
    /** Faction whose board this appears on. */
    ownerFactionId: string;
    templateId: string;
    kind: OpportunityKind;
    /** Faction the opportunity concerns (threats: usually the owner itself). */
    targetFactionId: string;
    /** System involved, when relevant. */
    systemId?: string;
    title: string;
    description: string;
    cost: { intelPoints?: number; credits?: number };
    reward: OpportunityReward;
    createdAt: number;   // unix seconds (sim clock)
    expiresAt: number;   // unix seconds — gone if not seized
    status: OpportunityStatus;
}

// ─── Shadow economy activity ──────────────────────────────────────────────────

export interface ShadowEconomyNode {
    systemId: string;
    /** Sponsoring faction. */
    factionId: string;
    /** Piracy spawn chance per hour (from config). */
    piracyChancePerHour: number;
    /** Smuggling route capacity (0–1, reduces trade route throughput). */
    smugglingCapacity: number;
    /** Trade insurance cost inflation in this region (fractional). */
    insuranceCostInflation: number;
    /** ISO timestamp when this node becomes inactive. */
    expiresAt: string;
}

// ─── Escalation tracking ─────────────────────────────────────────────────────

export interface RegionEscalation {
    regionId: string;
    /** Operation count in this region within the cooldown window. */
    operationCount: number;
    /** ISO timestamp of the most recent operation in this region. */
    lastOperationAt: string;
}

// ─── Espionage world state ──────────────────────────────────────────────────

export interface EspionageWorldState {
    operations: Map<string, EspionageOperation>;
    factionIntel: Map<string, FactionIntelState>; // factionId → state
    reports: Map<string, IntelReport>;            // reportId → report
    boardOpportunities: Map<string, BoardOpportunity>; // opportunityId → entry
    attributionRecords: AttributionRecord[];
    shadowEconomyNodes: Map<string, ShadowEconomyNode>; // systemId → node
    regionEscalation: Map<string, RegionEscalation>;    // regionId → escalation
    // Phase 15: Agent & Intel Network
    agents: Map<string, SpyAgent>;                           // agentId → agent
    intelNetworks: Map<string, IntelNetwork>;                // `${factionId}:${systemId}` → network
    // Item 12: investigations into operations a victim did not catch outright.
    cases?: Map<string, CovertCase>;                         // caseId → case
}

// ─── Case board (item 12) ─────────────────────────────────────────────────────

/** Where a clue came from. `author` is a non-simulation author (a Server Master). */
export type ClueSource = 'method' | 'press' | 'sensors' | 'motive' | 'own_intel' | 'interrogation' | 'author';

/**
 * One piece of evidence on a case. The text and the suspects it names are the
 * player's; `weights` is the hidden truth of how much it really points at each
 * suspect (positive toward, negative away, 0 a red herring) and never reaches
 * the owner — AI accusations (12c) read it, players read the text.
 */
export interface CaseClue {
    id: string;
    source: ClueSource;
    text: string;
    /** Suspects the clue names. Public: the text says as much. */
    pointsAt: string[];
    arrivedAt: number;   // unix seconds (sim clock)
    /** HIDDEN. */
    weights?: Record<string, number>;
    /** Who wrote it, when not the simulation. */
    authorId?: string;
    /** What it speaks to: motive, means, opportunity, or testimony. Public. */
    tag?: ClueTag;
    /** Suspects the clue argues AGAINST (their sources heard nothing, an honest denial). Public: the text says as much. */
    clears?: string[];
}

export type CaseStatus = 'open' | 'accused' | 'leaked' | 'cold';

/**
 * A covert operation against an empire that its service did not catch outright,
 * now under investigation. The board shows the effect (what, where, when), the
 * suspects and the clues as they arrive; the player names a culprit.
 *
 * Fields marked HIDDEN are the truth of the case. They are saved in the owner's
 * shard (the only copy) and stripped on the wire (lib/persistence/shard-privacy.ts).
 */
export interface CovertCase {
    id: string;
    ownerFactionId: string;
    title: string;
    /** What happened, where and when, without the author. */
    summary: string;
    systemId: string;
    kindPhrase: string;
    openedAt: number;
    suspectIds: string[];
    clues: CaseClue[];
    status: CaseStatus;
    accusedFactionId?: string | null;
    /** How an accusation went. Public once filed. */
    verdict?: 'correct' | 'wrong' | null;
    closedAt?: number | null;
    /** When the next clue is due (sim clock). */
    nextClueAt: number;
    /** HIDDEN: the operation and its real sponsor. */
    operationId?: string;
    actorFactionId?: string;
    /** HIDDEN: who the operation was dressed up as. */
    falseFlagFactionId?: string | null;
    /** HIDDEN: clues not yet arrived. */
    pendingClues?: CaseClue[];
    /** HIDDEN: captured agents already questioned for this case. */
    interrogatedAgentIds?: string[];
    /** HIDDEN: when a mole in the owner's service last leaked this file. */
    moleLeakedAt?: number;
}

/** What our service has learned about one rival (FactionIntelState.dossier). */
export interface DossierKnowledge {
    /** Their infiltration of us, as a sweep last measured it. */
    revealedInfiltration?: number;
    revealedAt?: number;
    /** Whether they have Black Market tradecraft; known only with sources inside them. */
    blackMarket?: boolean;
    blackMarketSeenAt?: number;
}

/** A captured foreign agent, as their captor sees them. */
export interface PrisonerRecord {
    agentId: string;
    codename: string;
    /** Their species (civilization id), plain to see. */
    species: string | null;
    /** Who they say they work for. A Double Agent lies. */
    claimedEmployerId: string;
    takenAt: number;
    systemId: string;
}
