// lib/espionage/espionage-types.ts
// Pillar 6 — Espionage & Subversion data schemas.

import type { SpyAgent, IntelNetwork } from './agent-types';

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
    | { type: 'instability'; amount: number };        // target capital system instability

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
}
