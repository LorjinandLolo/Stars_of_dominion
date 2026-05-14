/**
 * lib/integration/resolution-summary.ts
 * Builds a structured ResolutionSummary after any crisis or combat resolution.
 * Used for post-action feedback display and chronicle logging.
 *
 * Prediction bonus: credits reward (fixed) + mechanical tactical multiplier (15%).
 * Credits are wired via the economy service.
 */

import type { ResolutionSummary, PredictionOutcome } from './types';
import { getAvailableStrategies } from '@/lib/crisis-shared';

/** Credits awarded to player for a correct prediction. Tunable constant. */
export const PREDICTION_BONUS_CREDITS = 100;

interface BuildParams {
    crisisId?: string;
    combatId?: string;
    yourActionId: string;
    opponentActionId: string;
    predictedActionId?: string;    // Undefined = player skipped prediction
    winner: 'attacker' | 'defender' | 'draw';
    message: string;
    doctrineEffectsApplied?: string[];
    reputationSignals?: string[];
    timestamp?: number;
    techModifiers?: Record<string, number>; // Passed from engine
}

/** All known strategies across both sides — for label lookup. */
function findLabel(id: string): string {
    const all = [
        ...getAvailableStrategies('attack'),
        ...getAvailableStrategies('defense'),
    ];
    return all.find(s => s.id === id)?.name ?? id.replace(/_/g, ' ');
}

/**
 * Constructs a ResolutionSummary and calculates any prediction bonus.
 * @returns { summary, predictionBonus } — bonus is 0 if prediction was skipped or wrong.
 */
export function buildResolutionSummary(params: BuildParams): {
    summary: ResolutionSummary;
    predictionBonus: number;
} {
    let prediction: PredictionOutcome | undefined;
    let predictionBonus = 0;

    if (params.predictedActionId) {
        const correct = params.predictedActionId === params.opponentActionId;
        
        // Dynamic bonus calculation based on tech identity
        const baseBonus = params.techModifiers?.['prediction_bonus_credits'] ?? PREDICTION_BONUS_CREDITS;
        const tacticalMultiplier = (params.techModifiers?.['prediction_bonus_multiplier'] ?? 1.0) * 15;
        
        predictionBonus = correct ? baseBonus : 0;

        prediction = {
            predictedActionId: params.predictedActionId,
            actualActionId: params.opponentActionId,
            correct,
            bonusApplied: correct
                ? `+${Math.round(predictionBonus)} credits & +${Math.round(tacticalMultiplier)}% Tactical Advantage (Foresight)`
                : undefined,
        };
    }

    const summary: ResolutionSummary = {
        crisisId: params.crisisId,
        combatId: params.combatId,
        yourActionId: params.yourActionId,
        yourActionLabel: findLabel(params.yourActionId),
        opponentActionId: params.opponentActionId,
        opponentActionLabel: findLabel(params.opponentActionId),
        prediction,
        winner: params.winner,
        message: params.message,
        doctrineEffectsApplied: params.doctrineEffectsApplied ?? [],
        reputationSignals: params.reputationSignals ?? [],
        timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
    };

    return { summary, predictionBonus };
}
