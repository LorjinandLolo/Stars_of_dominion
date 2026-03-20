/**
 * lib/reputation/types.ts
 * Core data models for the Reputation System.
 */

export interface FactionReputation {
    factionId: string;
    scores: {
        aggression: number;
        reliability: number;
        deception: number;
        tradeInfluence: number;
        oppression: number;
        honor: number;
    };
    derivedTags: string[]; // e.g., 'Warmonger', 'Honorable'
    history: {
        timestamp: number;
        action: string;
        delta: Partial<FactionReputation['scores']>;
    }[];
}

export interface ReputationThreshold {
    id: string;
    scoreKey: keyof FactionReputation['scores'];
    min?: number;
    max?: number;
    tag: string;
}
