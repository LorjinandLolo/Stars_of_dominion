// lib/time/time-config.ts
// Stars of Dominion — Time System Configuration
// Designers can tune crisis durations and tick intervals here.

import type { CrisisType, CrisisAutoResolvePolicy, CrisisResponseOption } from './time-types';

// ─── Strategic Tick ───────────────────────────────────────────────────────────

export const TICK_INTERVAL_HOURS = 6;
/** The fixed UTC hours at which strategic ticks fire: 00:00, 06:00, 12:00, 18:00 */
export const TICK_HOURS_UTC = [0, 6, 12, 18] as const;

// ─── Crisis Durations (hours) ──────────────────────────────────────────────────

export const CRISIS_DURATION_HOURS: Record<CrisisType, number> = {
    sabotage:                6,
    espionage_exposed:       6,
    proxy_funding_revealed:  6,
    propaganda_strike:       12,
    trade_seizure:           12,
    blackmail:               12,
    political_coercion:      12,
    rebellion_incitement:    12,
    assassination_attempt:   12,
    blockade:                12,
    orbital_assault:         12,
    coup_attempt:            24,
};

// ─── Crisis Severity Map ──────────────────────────────────────────────────────

export const CRISIS_SEVERITY: Record<CrisisType, 'minor' | 'major' | 'existential'> = {
    sabotage:                'minor',
    espionage_exposed:       'minor',
    proxy_funding_revealed:  'minor',
    propaganda_strike:       'minor',
    trade_seizure:           'major',
    blackmail:               'major',
    political_coercion:      'major',
    rebellion_incitement:    'major',
    assassination_attempt:   'major',
    blockade:                'major',
    orbital_assault:         'existential',
    coup_attempt:            'existential',
};

// ─── Available Responses per Crisis Type ──────────────────────────────────────

export const CRISIS_RESPONSES: Record<CrisisType, CrisisResponseOption[]> = {
    sabotage:                ['fortify', 'deceive', 'sacrifice'],
    espionage_exposed:       ['deceive', 'negotiate', 'sacrifice'],
    proxy_funding_revealed:  ['escalate', 'deceive', 'negotiate'],
    propaganda_strike:       ['deceive', 'escalate', 'negotiate'],
    trade_seizure:           ['escalate', 'negotiate', 'sacrifice'],
    blackmail:               ['negotiate', 'deceive', 'sacrifice'],
    political_coercion:      ['escalate', 'negotiate', 'deceive'],
    rebellion_incitement:    ['fortify', 'sacrifice', 'negotiate'],
    assassination_attempt:   ['fortify', 'escalate', 'deceive'],
    blockade:                ['escalate', 'fortify', 'negotiate', 'sacrifice'],
    orbital_assault:         ['escalate', 'fortify', 'negotiate', 'sacrifice'],
    coup_attempt:            ['escalate', 'fortify', 'sacrifice', 'deceive', 'negotiate'],
};

// ─── Doctrine → Auto-resolve Default ─────────────────────────────────────────

export type DoctrineType =
    | 'militarist'
    | 'expansionist'
    | 'diplomat'
    | 'intelligence'
    | 'commercial'
    | 'theocratic'
    | 'anarchist'
    | 'default';

export const DOCTRINE_DEFAULT_RESPONSE: Record<DoctrineType, CrisisResponseOption> = {
    militarist:    'escalate',
    expansionist:  'fortify',
    diplomat:      'negotiate',
    intelligence:  'deceive',
    commercial:    'sacrifice',
    theocratic:    'negotiate',
    anarchist:     'escalate',
    default:       'fortify',
};

export const DOCTRINE_AUTO_RESOLVE_POLICY: Record<DoctrineType, CrisisAutoResolvePolicy> = {
    militarist:    'use_doctrine',
    expansionist:  'use_doctrine',
    diplomat:      'use_doctrine',
    intelligence:  'use_doctrine',
    commercial:    'use_doctrine',
    theocratic:    'use_doctrine',
    anarchist:     'use_doctrine',
    default:       'default_fortify',
};

// ─── Prediction Bonus (attacker gets this multiplier on effects when correct) ──

/** Multiplier applied to attack strength when prediction matches defender choice. */
export const PREDICTION_MATCH_BONUS = 1.35;
/** Multiplier applied to defense when prediction fails (defender bonus). */
export const PREDICTION_MISS_DEFENDER_BONUS = 0.8;

// ─── Modifiers for special techs / events ─────────────────────────────────────

/** Global crisis duration multiplier. 1.0 = normal. Can be changed by tech/season. */
export let crisisDurationMultiplier = 1.0;
/** Global tick efficiency multiplier. 1.0 = normal. */
export let tickEfficiencyMultiplier = 1.0;

export function applyTemporaryModifier(type: 'crisis_duration' | 'tick_efficiency', value: number) {
    if (type === 'crisis_duration') crisisDurationMultiplier = value;
    if (type === 'tick_efficiency') tickEfficiencyMultiplier = value;
}

export function resetModifiers() {
    crisisDurationMultiplier = 1.0;
    tickEfficiencyMultiplier = 1.0;
}
