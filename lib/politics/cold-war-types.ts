import { IdeologyProfile } from './ideology-types';

/**
 * Represents the persistent strategic rivalry between two empires.
 * Exists when empires are not formally allied or at total war, but
 * engage in sustained ideological competition.
 */
export interface RivalryState {
    id: string;              // e.g. "rivalry-empA-empB"
    empireAId: string;
    empireBId: string;
    rivalryScore: number;    // 0-100 indicating tension
    escalationLevel: number; // 0 (Calm) to 7 (Direct War Trigger Risk)
    activeSanctionIds: string[];
    proxyConflictsInvolved: string[];
    detenteActive: boolean;  // If true, rivalryScore is slowly decaying / capped
}

/**
 * An ideological bloc or coalition of empires.
 * Not necessarily a strict military alliance, but a sphere of influence.
 */
export interface Bloc {
    id: string;
    name: string;
    doctrineTags: string[];  // Defined by faction/policy JSONs (e.g. "anti_piracy_stabilization")
    cohesion: number;        // 0-100
    leaderEmpireId: string;
    memberEmpireIds: string[];
}

/**
 * Tracks the ideological saturation and local leaning of a specific neutral or border system.
 */
export interface InfluenceProfile {
    systemId: string;
    localLeaning: IdeologyProfile; // Base bias of the local population
    foreignInfluence: Record<string, number>; // EmpireID -> Influence Score (0-100)
    resistance: number;            // 0-100 how hard it is to shift influence here
}

/**
 * Defines an active cross-border ideological campaign.
 */
export interface PropagandaCampaign {
    id: string;
    senderId: string;
    targetSystemId: string; // Or empire ID
    tags: string[];         // e.g., ["anti_corporate", "liberation_broadcast"]
    intensity: number;      // Determines shift magnitude per tick
    baseDurationTicks: number;
    ticksRemaining: number;
    isCovert: boolean;      // If exposed, massive rivalry spike
}

/**
 * Represents foreign sponsorship of an internal rebellion or dissident faction.
 */
export interface ProxyConflict {
    id: string;
    systemId: string;
    sponsorIds: string[];   // Foreign backers funneling resources
    rebelFactionId: string; // Internal faction receiving support
    targetEmpireId: string; // The empire experiencing the proxy crisis
    intensity: number;      // 0-100 Scale of the conflict
    fundingLevel: number;   // Amount of resources diverted by sponsors
    blowbackRisk: number;   // 0-100 chance of unexpected negative consequences for sponsor
}

/**
 * Data-driven template for Cold War Crises (loaded via JSON).
 */
export interface ColdWarCrisisTemplate {
    id: string;
    name: string;
    description: string;
    requiredEscalationIndex: number; // At what level this crisis can trigger
    triggerTags: string[];
    escalationBump: number;
    options: string[];
    // Effects are handled by event bus or hardcoded handlers based on option selection
}

/**
 * Active crisis instance.
 */
export interface ActiveColdWarCrisis {
    id: string;
    templateId: string;
    primaryEmpireId: string;
    secondaryEmpireId: string;
    triggeredAtTick: number;
    resolved: boolean;
}

/**
 * Advanced Statecraft: Formal agreements between empires.
 */
export type TreatyType = 'non_aggression' | 'mutual_defense' | 'research_share' | 'intelligence_pact' | 'open_borders';

export interface Treaty {
    id: string;
    type: TreatyType;
    signatories: string[]; // Empire IDs
    signedAtTick: number;
    expiresAtTick?: number;
    status: 'active' | 'suspended' | 'broken';
}

/**
 * Advanced Statecraft: Economic agreements and trade pacts.
 */
export interface TradePact {
    id: string;
    empireAId: string;
    empireBId: string;
    resourceAdjustments: Record<string, number>; // Resource -> Production multiplier or flat bonus
    tariffExemption: boolean;
    signedAtTick: number;
}

/**
 * Advanced Statecraft: One-sided resource transfers or demands.
 */
export interface Tribute {
    id: string;
    vassalId: string;
    overlordId: string;
    resourceType: string;
    amountPerTick: number;
    status: 'active' | 'refused' | 'cancelled';
}
