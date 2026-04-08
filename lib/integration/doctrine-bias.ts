/**
 * lib/integration/doctrine-bias.ts
 * Reads doctrine behaviour biases from config and produces weighted
 * PredictionOption lists. Biases are hints — not guarantees.
 */

import type { DoctrineDefinition } from '@/lib/doctrine/types';
import type { PredictionOption } from './types';

// Use require to safely load JSON without TypeScript resolving the extended type
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DOCTRINE_DEFS: DoctrineDefinition[] = require('@/lib/doctrine/data/doctrine-definitions.json');

/** Returns the behavior bias for a doctrine id, or null if none set. */
export function getDoctrineBias(doctrineId: string) {
    const def = DOCTRINE_DEFS.find(d => d.id === doctrineId);
    return (def as any)?.behaviorBias ?? null;
}

/**
 * Maps a raw option id to a predicted likelihood weight based on opponent doctrine.
 *
 * Attack-biased doctrines lean toward aggressive crisis strategies.
 * Defend-biased doctrines lean toward shield/bunker strategies.
 * Deceptive doctrines lean toward feint/jamming strategies.
 *
 * @param opponentDoctrineId  Active doctrine id of the opponent (may be null / unknown).
 * @param validOptions        All valid actions the opponent could choose in this scenario.
 */
export function getPredictionHints(
    opponentDoctrineId: string | null,
    validOptions: { id: string; name: string; description: string }[]
): PredictionOption[] {
    const bias = opponentDoctrineId ? getDoctrineBias(opponentDoctrineId) : null;

    return validOptions.map(opt => {
        let weightHint: PredictionOption['weightHint'] = 'possible';

        if (bias) {
            const cr = bias.crisisResponseBias as string | undefined;
            const db = bias.diplomaticBias as string | undefined;

            // Attack-biased → offensive options are 'likely'
            if (cr === 'attack' && /barrage|strike|drop|assault|blitz/.test(opt.id)) {
                weightHint = 'likely';
            }
            // Defend-biased → defensive options are 'likely'
            else if (cr === 'defend' && /shield|bunker|jam|entrench|fortif/.test(opt.id)) {
                weightHint = 'likely';
            }
            // Deceptive → feint / covert options are 'likely'
            else if (db === 'deceptive' && /feint|covert|jam|shadow/.test(opt.id)) {
                weightHint = 'likely';
            }
            // Weak or no match → 'unlikely' hint to make likely options stand out
            else if (bias.biasStrength === 'strong') {
                weightHint = 'unlikely';
            }
        }

        return {
            id: opt.id,
            label: opt.name,
            description: opt.description,
            weightHint,
        };
    });
}
