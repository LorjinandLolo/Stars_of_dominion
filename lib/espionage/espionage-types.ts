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

// ─── Counter-intelligence ─────────────────────────────────────────────────────

export interface CounterIntelState {
    factionId: string;
    /** Region IDs where counter-intel is actively deployed. */
    activeRegionIds: string[];
    /** Counter-intel investment level per region (0–1). */
    regionalInvestment: Map<string, number>;
    /** Total counter-intel budget allocated (0–1 fraction of max). */
    totalBudget: number;
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
    counterIntel: Map<string, CounterIntelState>; // factionId → state
    attributionRecords: AttributionRecord[];
    shadowEconomyNodes: Map<string, ShadowEconomyNode>; // systemId → node
    regionEscalation: Map<string, RegionEscalation>;    // regionId → escalation
    // Phase 15: Agent & Intel Network
    agents: Map<string, SpyAgent>;                           // agentId → agent
    intelNetworks: Map<string, IntelNetwork>;                // `${factionId}:${systemId}` → network
}
