/**
 * lib/integration/reputation-vm.ts
 * Converts raw FactionReputation backend scores into a public-facing
 * ReputationProfile view model. Never exposes raw numbers to the UI.
 *
 * Intel quality defaults to 50 (moderate certainty) until wired to espionage.
 * TODO: wire intelQuality to EspionageState.networks[targetFactionId].strength
 */

import type { FactionReputation } from '@/lib/reputation/types';
import type { ReputationProfile, ReputationSignal, CertaintyLevel } from './types';

/** Placeholder until espionage system provides per-faction intel quality. */
export const DEFAULT_INTEL_QUALITY = 50;

// ── Label mappings (data-driven) ───────────────────────────────────────────────

interface LabelMapping {
    key: keyof FactionReputation['scores'];
    min?: number;
    max?: number;
    label: string;
    source: string;          // Explanation shown to player
}

const LABEL_MAPPINGS: LabelMapping[] = [
    { key: 'aggression',      min: 70, label: 'Aggressive',      source: 'Frequently initiates hostile actions' },
    { key: 'aggression',      max: 20, label: 'Pacifist',         source: 'Avoids direct military confrontation' },
    { key: 'reliability',     min: 70, label: 'Reliable',         source: 'Consistently honors agreements and treaties' },
    { key: 'reliability',     max: 30, label: 'Opportunistic',    source: 'Abandons agreements when advantageous' },
    { key: 'deception',       min: 60, label: 'Deceptive',        source: 'Frequently misrepresents intentions' },
    { key: 'tradeInfluence',  min: 65, label: 'Trade-Oriented',   source: 'Prioritizes economic gain in negotiations' },
    { key: 'oppression',      min: 75, label: 'Authoritarian',    source: 'Maintains stability through internal control' },
    { key: 'honor',           min: 70, label: 'Honorable',        source: 'Strong adherence to declared positions' },
    { key: 'honor',           max: 30, label: 'Retaliatory',      source: 'Responds disproportionately to perceived slights' },
];

// ── Certainty derivation ───────────────────────────────────────────────────────

function deriveCertainty(intelQuality: number): CertaintyLevel {
    if (intelQuality >= 70) return 'confirmed';
    if (intelQuality >= 40) return 'suspected';
    return 'unknown';
}

// ── View model builder ────────────────────────────────────────────────────────

/**
 * Converts backend FactionReputation into a UI-safe ReputationProfile.
 * @param rep  Raw backend reputation data.
 * @param intelQuality  0–100. Defaults to 50 (moderate). Controls certainty of labels.
 */
export function buildReputationProfile(
    rep: FactionReputation,
    intelQuality: number = DEFAULT_INTEL_QUALITY
): ReputationProfile {
    const signals: ReputationSignal[] = [];

    for (const mapping of LABEL_MAPPINGS) {
        const val = rep.scores[mapping.key];
        const matches =
            (mapping.min !== undefined && val >= mapping.min) ||
            (mapping.max !== undefined && val <= mapping.max);

        if (!matches) continue;

        const certainty = deriveCertainty(intelQuality);

        // At low intel, only surface ~40% of unknown signals to simulate gaps
        if (certainty === 'unknown' && Math.random() > 0.4) continue;

        signals.push({
            label: mapping.label,
            certainty,
            source: mapping.source,
        });
    }

    const tendencyDescription =
        signals.length === 0
            ? 'Intelligence is insufficient to form a reliable assessment.'
            : `This faction is assessed as ${signals
                  .filter(s => s.certainty !== 'unknown')
                  .map(s => s.label)
                  .join(', ') || 'an unknown quantity'}.`;

    const recentActions = rep.history.slice(-5).map(h => ({
        action: h.action,
        timestamp: h.timestamp,
        effect: Object.entries(h.delta)
            .map(([k, v]) => `${(v ?? 0) > 0 ? '+' : ''}${v} ${k}`)
            .join(', '),
    }));

    return {
        factionId: rep.factionId,
        knownTraits: signals,
        tendencyDescription,
        intelQuality,
        recentActions,
    };
}
