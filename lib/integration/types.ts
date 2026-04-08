/**
 * lib/integration/types.ts
 * Shared interfaces for the Doctrine → Reputation → Prediction → Resolution loop.
 * UI components read these types; domain logic lives in services, not components.
 */

// ── Certainty ─────────────────────────────────────────────────────────────────

export type CertaintyLevel = 'confirmed' | 'suspected' | 'unknown';

// ── Reputation ────────────────────────────────────────────────────────────────

/** A single known fact about a faction, with certainty rating. */
export interface ReputationSignal {
    label: string;           // e.g. 'Aggressive', 'Reliable', 'Deceptive'
    certainty: CertaintyLevel;
    source?: string;         // Brief player-readable explanation: 'Likely to initiate conflict'
}

/** Public-facing view model for a faction's reputation — hides raw backend scores. */
export interface ReputationProfile {
    factionId: string;
    knownTraits: ReputationSignal[];
    tendencyDescription: string;   // One-sentence intelligence assessment
    intelQuality: number;          // 0–100. Affects how certain labels appear.
    recentActions?: {
        action: string;
        timestamp: number;
        effect: string;            // Human-readable delta summary
    }[];
}

// ── Prediction ────────────────────────────────────────────────────────────────

/** An option the player can predict the opponent will choose. */
export interface PredictionOption {
    id: string;
    label: string;
    description: string;
    /** Hint from doctrine bias. Does NOT guarantee outcome. */
    weightHint: 'likely' | 'possible' | 'unlikely';
}

/** Result of a prediction check, stored in ResolutionSummary. */
export interface PredictionOutcome {
    predictedActionId: string;
    actualActionId: string;
    correct: boolean;
    bonusApplied?: string;   // Human-readable bonus description if correct
}

// ── Resolution ────────────────────────────────────────────────────────────────

/** Structured post-action outcome for display and chronicle logging. */
export interface ResolutionSummary {
    crisisId?: string;
    combatId?: string;
    yourActionId: string;
    yourActionLabel: string;
    opponentActionId: string;
    opponentActionLabel: string;
    prediction?: PredictionOutcome;
    winner: 'attacker' | 'defender' | 'draw';
    message: string;
    doctrineEffectsApplied: string[];
    reputationSignals: string[];
    timestamp: number;
}
