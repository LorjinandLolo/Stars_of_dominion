/**
 * lib/doctrine/types.ts
 * Core data models for the 3-domain Doctrine System.
 */

export type DoctrineDomain = 'military' | 'economic' | 'intelligence';

export type DiplomaticBias = 'aggressive' | 'cooperative' | 'deceptive' | 'isolationist';
export type CrisisResponseBias = 'attack' | 'defend' | 'negotiate' | 'withdraw';
export type CombatStanceBias = 'blitz' | 'shock' | 'entrench' | 'feint';

/**
 * Optional strategic tendency data attached to each doctrine.
 * Used by the prediction hint system — does NOT force AI or player choices.
 * Biases are tunable via doctrine-definitions.json config.
 */
export interface DoctrineBehaviorBias {
    crisisResponseBias?: CrisisResponseBias;
    diplomaticBias?: DiplomaticBias;
    combatStanceBias?: CombatStanceBias;
    /** How strongly to weight this bias in prediction hints. */
    biasStrength: 'weak' | 'moderate' | 'strong';
}

export interface DoctrineDefinition {
    id: string;
    domain: DoctrineDomain;
    name: string;
    description: string;
    modifiers: Record<string, number>;
    enabledActions?: string[];
    disabledActions?: string[];
    /** Optional strategic tendency for prediction hinting and AI weighting. */
    behaviorBias?: DoctrineBehaviorBias;
    /** If set, this doctrine is locked until the given doctrineId is also active. */
    requiresDoctrineId?: string;
}

export interface EmpireDoctrines {
    factionId: string;
    activeDoctrines: Record<DoctrineDomain, string | null>; // domain -> doctrineId
    lastChangeTimestamps: Record<DoctrineDomain, number>; // domain -> unixSeconds
}
