// lib/time/auto-resolve.ts
// Stars of Dominion — Offline Auto-Resolution
// Determines the default crisis response when the defender doesn't respond in time.

import { CrisisEvent, CrisisResponseOption } from './time-types';
import { DOCTRINE_DEFAULT_RESPONSE, DoctrineType, CRISIS_RESPONSES } from './time-config';
import { getGameWorldState } from '../game-world-state-singleton';

// ─── Doctrine Detection ───────────────────────────────────────────────────────

/**
 * Determine the doctrine type for an empire from its posture/blocs.
 * Falls back to 'default' if no doctrine is detected.
 */
export function detectDoctrineType(factionId: string): DoctrineType {
    try {
        const world = getGameWorldState();
        const posture = world.movement.empirePostures.get(factionId);
        if (!posture) return 'default';

        // Map posture/stance to doctrine type
        const stance = (posture as any).stance as string | undefined;
        if (!stance) return 'default';

        const mapping: Record<string, DoctrineType> = {
            militarist:   'militarist',
            aggressive:   'militarist',
            expansionist: 'expansionist',
            diplomatic:   'diplomat',
            isolationist: 'diplomat',
            intelligence: 'intelligence',
            shadow:       'intelligence',
            economic:     'commercial',
            trade:        'commercial',
            theocratic:   'theocratic',
            anarchist:    'anarchist',
        };

        return mapping[stance.toLowerCase()] ?? 'default';
    } catch {
        return 'default';
    }
}

// ─── Auto-Resolve Selection ───────────────────────────────────────────────────

/**
 * Select an automatic crisis response for an offline defender.
 * Priority order:
 * 1. Empire doctrine default (doctrine-specific response)
 * 2. Player-configured crisis posture (stored in localStorage on client — not available server-side, so falls through)
 * 3. Fallback: 'fortify' for military crises, 'negotiate' for political crises
 */
export function selectAutoResponse(crisis: CrisisEvent): CrisisResponseOption {
    const doctrine = detectDoctrineType(crisis.defenderEmpireId);
    const doctrineResponse = DOCTRINE_DEFAULT_RESPONSE[doctrine];

    // Ensure the doctrine response is actually available for this crisis type
    const available = CRISIS_RESPONSES[crisis.crisisType] ?? [];
    if (available.includes(doctrineResponse)) {
        return doctrineResponse;
    }

    // Fallback: pick best available response by priority
    const fallbackPriority: CrisisResponseOption[] = [
        'fortify', 'negotiate', 'deceive', 'sacrifice', 'escalate'
    ];
    for (const option of fallbackPriority) {
        if (available.includes(option)) return option;
    }

    // Should never reach here, but safety fallback
    return available[0] ?? 'sacrifice';
}

// ─── Outcome Calculation ─────────────────────────────────────────────────────

export interface CrisisOutcome {
    defenderResponse: CrisisResponseOption;
    predictionMatched: boolean;
    outcomeText: string;
    attackerEffectMultiplier: number;
    defenderEffectMultiplier: number;
}

const OUTCOME_TEXTS: Record<CrisisResponseOption, string[]> = {
    escalate:  [
        'The defender struck back hard, escalating the conflict beyond anticipated boundaries.',
        'Aggressive counter-measures destabilized the attacker\'s position.',
    ],
    fortify:   [
        'The target hardened their defenses, limiting the damage from the attack.',
        'Emergency fortifications blunted the assault before it could take hold.',
    ],
    deceive:   [
        'The defender fed false intelligence to the attacker, obscuring the true damage.',
        'A masterful disinformation campaign neutralized the attempted crisis.',
    ],
    negotiate: [
        'The defending faction sought a diplomatic channel, buying time with concessions.',
        'Peace overtures slowed the crisis resolution but limited casualties.',
    ],
    sacrifice: [
        'The defender accepted the losses and redirected resources elsewhere.',
        'A controlled sacrifice prevented further escalation at the cost of the target.',
    ],
};

/**
 * Calculate the full outcome of a crisis resolution.
 */
export function calculateCrisisOutcome(
    crisis: CrisisEvent,
    defenderResponse: CrisisResponseOption
): CrisisOutcome {
    const predictionMatched =
        crisis.attackerPrediction != null &&
        crisis.attackerPrediction === defenderResponse;

    const PREDICTION_MATCH_BONUS   = 1.35;
    const PREDICTION_MISS_DEFENDER  = 0.80;

    let attackerMult  = 1.0;
    let defenderMult  = 1.0;

    if (predictionMatched) {
        attackerMult = PREDICTION_MATCH_BONUS;
        defenderMult = 1.0;
    } else if (!predictionMatched && crisis.attackerPrediction != null) {
        // Attacker guessed wrong — defender gets a defensive boost
        attackerMult = PREDICTION_MISS_DEFENDER;
        defenderMult = 1.2;
    }

    // Response-specific modifiers
    if (defenderResponse === 'escalate') {
        defenderMult *= 1.3;
        attackerMult *= 0.85;
    } else if (defenderResponse === 'sacrifice') {
        attackerMult *= 1.1;
        defenderMult *= 0.7;
    }

    const texts = OUTCOME_TEXTS[defenderResponse];
    const outcomeText = texts[Math.floor(Math.random() * texts.length)];

    return {
        defenderResponse,
        predictionMatched,
        outcomeText,
        attackerEffectMultiplier: attackerMult,
        defenderEffectMultiplier: defenderMult,
    };
}
