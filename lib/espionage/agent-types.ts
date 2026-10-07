/**
 * lib/espionage/agent-types.ts
 * Phase 15 — Espionage Agency: Agent & Intel Network data models.
 *
 * Agents are unique named operatives with traits that modify op outcomes.
 * Intel Networks are persistent spy presences in a system that power Fog of War.
 */

import type { OperationCategory } from './operation-catalog';

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
    | 'on_operation' // Running a catalog operation until it resolves
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
    /**
     * Species (civilization id). Usually the employer's own; a hired
     * foreigner leaves the wrong species behind at the scene (item 12b-2).
     */
    species?: string | null;
    /** The owner has found out this agent is compromised (a mole). */
    compromiseKnown?: boolean;
    /** 0–100: grows with successful ops; degrades on failure or idle. */
    experienceLevel: number;
    status: AgentStatus;
    /** System the agent is currently deployed to. Null when recalled or idle. */
    deployedToSystemId: string | null;
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
    /** The empire holding this agent, while status is `captured`. */
    capturedByFactionId?: string | null;
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
     * Planted covert assets in this system (e.g. 'sleeper_cell', 'listening_post').
     * Absorbs the former lib/intelligence SleeperCell entity. Optional: absent
     * on networks created before consolidation.
     */
    assetTags?: string[];
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
    /** Species (civilization id); foreign recruits cost more. */
    species?: string | null;
    foreign?: boolean;
    /** Credit cost to recruit this candidate. */
    recruitmentCost: number;
    /** How many days until this candidate is no longer available. */
    expiresInDays: number;
}

// ─── Trait effects on catalog operations ──────────────────────────────────────

/**
 * Which trait bonus applies to which kind of operation. Category-based rather
 * than through the old three-domain bridge, which filed intelligence gathering
 * under "political subversion" and so let a Seducer add forty points to
 * Technology Theft.
 */
const CATEGORY_TRAIT_BONUS: Partial<Record<OperationCategory, 'sabotageBonus' | 'subversionBonus' | 'shadowEconomyBonus'>> = {
    sabotage: 'sabotageBonus',
    military_blackops: 'sabotageBonus',
    political: 'subversionBonus',
    disinformation: 'subversionBonus',
    economic: 'shadowEconomyBonus',
};

/** Largest swing one agent can put on an operation's success chance. */
export const AGENT_MODIFIER_CAP = 0.5;

/**
 * Success-chance delta an agent brings to an operation of `category`.
 * Traits count in full at 100 experience and half at 0. Pass the traits the
 * caller is allowed to know: the worker passes all of them, the owner's page
 * passes the visible ones, so a hidden `compromised` penalty never shows up in
 * the estimate.
 */
export function agentSuccessModifier(
    traitIds: AgentTraitId[],
    experienceLevel: number,
    category: OperationCategory
): number {
    const bonusKey = CATEGORY_TRAIT_BONUS[category];
    let modifier = 0;
    for (const traitId of traitIds) {
        const m = AGENT_TRAITS[traitId]?.modifiers;
        if (!m) continue;
        modifier += m.globalSuccessBonus ?? 0;
        modifier -= m.globalSuccessPenalty ?? 0;
        if (bonusKey) modifier += m[bonusKey] ?? 0;
    }
    const xpFactor = 0.5 + (Math.max(0, Math.min(100, experienceLevel)) / 100) * 0.5;
    return Math.max(-AGENT_MODIFIER_CAP, Math.min(AGENT_MODIFIER_CAP, modifier * xpFactor));
}

/**
 * How much harder (positive) or easier (negative) the agent makes it to trace
 * an operation back to its sponsor. Ghosts are quiet; Brutal agents are loud.
 */
export function agentAttributionAvoidance(traitIds: AgentTraitId[]): number {
    let avoidance = 0;
    for (const traitId of traitIds) {
        const m = AGENT_TRAITS[traitId]?.modifiers;
        avoidance += m?.attributionAvoidance ?? 0;
        avoidance -= m?.exposureRisk ?? 0;
    }
    return Math.max(-0.3, Math.min(0.5, avoidance));
}

// ─── Recruitment price ────────────────────────────────────────────────────────

export const BASE_RECRUIT_COST = 2500;

/**
 * What a candidate with these traits costs, in credits. The worker prices a
 * recruit from its traits rather than trusting the figure the client sends.
 */
/** A foreign recruit (another species) costs this much more: they are rarer, and worth it. */
export const FOREIGN_RECRUIT_MULTIPLIER = 1.5;

export function recruitCostForTraits(traitIds: AgentTraitId[], foreign = false): number {
    const cost = BASE_RECRUIT_COST
        + (traitIds.length - 1) * 1000
        + (traitIds.includes('veteran') ? 2000 : 0)
        - (traitIds.includes('compromised') ? 1000 : 0); // compromised agents are mysteriously cheap
    const base = Math.max(500, cost);
    return foreign ? Math.round((base * FOREIGN_RECRUIT_MULTIPLIER) / 50) * 50 : base;
}

/** A trait list the recruit pool could have produced: 1-3 known traits, no repeats. */
export function isValidRecruitTraitList(traitIds: unknown): traitIds is AgentTraitId[] {
    if (!Array.isArray(traitIds) || traitIds.length < 1 || traitIds.length > 3) return false;
    if (new Set(traitIds).size !== traitIds.length) return false;
    return traitIds.every(t => typeof t === 'string' && t in AGENT_TRAITS);
}
