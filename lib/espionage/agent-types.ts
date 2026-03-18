/**
 * lib/espionage/agent-types.ts
 * Phase 15 — Espionage Agency: Agent & Intel Network data models.
 *
 * Agents are unique named operatives with traits that modify op outcomes.
 * Intel Networks are persistent spy presences in a system that power Fog of War.
 */

import type { OperationDomain } from './espionage-types';

// ─── Agent Traits ─────────────────────────────────────────────────────────────

export type AgentTraitId =
    | 'ghost'         // +25% attribution avoidance on any op
    | 'brutal'        // +30% sabotage damage, but +20% exposure risk
    | 'seducer'       // +40% political subversion success rate
    | 'economist'     // +35% shadow economy ops; smuggling generates more revenue
    | 'double_agent'  // Can run counter-intel while appearing loyal; risk if discovered
    | 'veteran'       // +10% success across ALL domains; gains XP 50% faster
    | 'compromised';  // Hidden malus: -20% all ops; owner unaware unless counter-intel detects

export interface AgentTrait {
    id: AgentTraitId;
    /** Human-readable name shown on Agent Card. */
    label: string;
    /** Flavor description for the UI. */
    description: string;
    /** Modifier applied during op resolution. Key = stat name, value = delta. */
    modifiers: Partial<{
        attributionAvoidance: number; // additive delta to avoidance probability
        sabotageBonus: number;
        exposureRisk: number;
        subversionBonus: number;
        shadowEconomyBonus: number;
        globalSuccessBonus: number;
        xpMultiplier: number;
        globalSuccessPenalty: number;
    }>;
}

export const AGENT_TRAITS: Record<AgentTraitId, AgentTrait> = {
    ghost: {
        id: 'ghost', label: 'Ghost', description: 'Leaves no trace. +25% attribution avoidance.',
        modifiers: { attributionAvoidance: 0.25 }
    },
    brutal: {
        id: 'brutal', label: 'Brutal', description: 'Gets results at any cost. +30% sabotage, +20% exposure.',
        modifiers: { sabotageBonus: 0.30, exposureRisk: 0.20 }
    },
    seducer: {
        id: 'seducer', label: 'Seducer', description: 'Masters political manipulation. +40% subversion ops.',
        modifiers: { subversionBonus: 0.40 }
    },
    economist: {
        id: 'economist', label: 'Economist', description: 'Turns black markets into gold. +35% shadow economy ops.',
        modifiers: { shadowEconomyBonus: 0.35 }
    },
    double_agent: {
        id: 'double_agent', label: 'Double Agent', description: 'Plays both sides. Runs counter-intel undetected.',
        modifiers: { attributionAvoidance: 0.15 }
    },
    veteran: {
        id: 'veteran', label: 'Veteran', description: 'Survived dozens of missions. +10% all ops, 50% faster XP.',
        modifiers: { globalSuccessBonus: 0.10, xpMultiplier: 1.5 }
    },
    compromised: {
        id: 'compromised', label: 'Compromised', description: '[CLASSIFIED] Asset has been turned. Hidden -20% penalty.',
        modifiers: { globalSuccessPenalty: 0.20 }
    },
};

// ─── Agent Status ─────────────────────────────────────────────────────────────

export type AgentStatus =
    | 'available'   // Ready to be assigned
    | 'deployed'    // Active in a system building/running a network
    | 'on_cooldown' // Resting after an op; cannot be deployed
    | 'burned'      // Cover blown; cannot operate; must be retired
    | 'captured'    // Held by enemy faction; may be traded or interrogated
    | 'turned';     // Enemy converted them; now a liability

// ─── Spy Agent ────────────────────────────────────────────────────────────────

export interface SpyAgent {
    id: string;
    /** Real name (known internally). */
    name: string;
    /** Code name for field use — shown in UI. */
    codename: string;
    ownerFactionId: string;
    /** 1–3 trait IDs. */
    traitIds: AgentTraitId[];
    /** 0–100: grows with successful ops; degrades on failure or idle. */
    experienceLevel: number;
    status: AgentStatus;
    /** System the agent is currently deployed to. Null when recalled or idle. */
    deployedToSystemId: string | null;
    /** Which domain they are covering in their deployed system. */
    deployedDomain: OperationDomain | null;
    /**
     * 0–1: how intact the agent's cover story is.
     * Degrades every op based on risk. Exposes agent on reach 0.
     */
    coverStrength: number;
    /**
     * 0–1: probability they resist being turned by enemy counter-intel.
     * Degrades slowly over time in hostile environments.
     */
    loyaltyRating: number;
    /** Unix-seconds: when the agent becomes available_again after cooldown. */
    cooldownUntil: number | null;
    /** Total number of Operations this agent has participated in. */
    operationsRun: number;
    /** Unix-seconds of the most recent op. */
    lastOperationAt: number | null;
}

// ─── Intel Networks ───────────────────────────────────────────────────────────

export type NetworkPenetrationLevel = 'none' | 'rumor' | 'confirmed' | 'deep';

/** What the owning faction sees in a system based on network penetration. */
export type VisibilityLevel = 'dark' | 'rumor' | 'confirmed' | 'transparent';

/**
 * A persistent intelligence presence built in a system by deployed agents.
 * Used to gate Fog of War visibility on the Galactic Map.
 */
export interface IntelNetwork {
    id: string;
    ownerFactionId: string;
    systemId: string;
    /**
     * 0–1: how mature the network is.
     * Grows while agents are deployed here; decays when abandoned.
     * Thresholds: 0.25 → rumor, 0.50 → confirmed, 0.80 → deep
     */
    strength: number;
    penetrationLevel: NetworkPenetrationLevel;
    /** IDs of SpyAgents currently assigned here. */
    agentIds: string[];
    /**
     * Unix-seconds: network begins decaying if no agent assigned past this point.
     * Refreshed every time an agent is assigned here.
     */
    activeUntil: number;
}

// ─── Recruit Pool ─────────────────────────────────────────────────────────────

/** A candidate surfaced for recruitment — not yet a full agent. */
export interface AgentCandidate {
    id: string;
    name: string;
    codename: string;
    traitIds: AgentTraitId[];
    /** Credit cost to recruit this candidate. */
    recruitmentCost: number;
    /** How many days until this candidate is no longer available. */
    expiresInDays: number;
}
