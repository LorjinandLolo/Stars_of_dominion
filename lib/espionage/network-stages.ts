/**
 * lib/espionage/network-stages.ts
 * Spy network progression stages (design doc: Recon Cell → Embedded Network →
 * Deep Assets → Shadow Government).
 *
 * A faction's stage against a target empire derives from its infiltration
 * score (FactionIntelState.infiltrationLevels, 0–100). Stages gate which
 * catalog operation categories can be launched against that target.
 */

import type { OperationCategory } from './operation-catalog';

export type NetworkStage =
    | 'none'
    | 'recon_cell'
    | 'embedded_network'
    | 'deep_assets'
    | 'shadow_government';

export interface NetworkStageInfo {
    stage: NetworkStage;
    label: string;
    description: string;
    /** Infiltration score at which this stage begins. */
    minInfiltration: number;
}

/** Ascending order — stageForInfiltration walks this from the top. */
export const NETWORK_STAGES: NetworkStageInfo[] = [
    { stage: 'none', label: 'No Presence', description: 'No meaningful assets in place.', minInfiltration: 0 },
    { stage: 'recon_cell', label: 'Recon Cell', description: 'Basic intelligence gathering.', minInfiltration: 10 },
    { stage: 'embedded_network', label: 'Embedded Network', description: 'Small-scale sabotage and influence.', minInfiltration: 35 },
    { stage: 'deep_assets', label: 'Deep Assets', description: 'Advanced espionage and covert operations.', minInfiltration: 65 },
    { stage: 'shadow_government', label: 'Shadow Government', description: 'Near-complete political influence.', minInfiltration: 90 },
];

const STAGE_ORDER: NetworkStage[] = NETWORK_STAGES.map(s => s.stage);

export function stageForInfiltration(infiltration: number): NetworkStage {
    for (let i = NETWORK_STAGES.length - 1; i >= 0; i--) {
        if (infiltration >= NETWORK_STAGES[i].minInfiltration) return NETWORK_STAGES[i].stage;
    }
    return 'none';
}

export function stageInfo(stage: NetworkStage): NetworkStageInfo {
    return NETWORK_STAGES.find(s => s.stage === stage) ?? NETWORK_STAGES[0];
}

/** Next stage up, or null at shadow_government. */
export function nextStage(stage: NetworkStage): NetworkStageInfo | null {
    const idx = STAGE_ORDER.indexOf(stage);
    return idx >= 0 && idx < NETWORK_STAGES.length - 1 ? NETWORK_STAGES[idx + 1] : null;
}

/**
 * Minimum stage required to launch each op category against a target.
 * intel_gathering is available from the start — running recon IS how a
 * network gets established. counter_intelligence is defensive (swept in your
 * own space) and never gated by infiltration of the target.
 */
export const MIN_STAGE_FOR_CATEGORY: Record<OperationCategory, NetworkStage> = {
    intel_gathering: 'none',
    counter_intelligence: 'none',
    disinformation: 'embedded_network',
    economic: 'embedded_network',
    sabotage: 'deep_assets',
    military_blackops: 'deep_assets',
    political: 'shadow_government',
};

export function meetsStage(current: NetworkStage, required: NetworkStage): boolean {
    return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(required);
}

/**
 * Can `infiltration` support launching an op of `category`?
 * Returns the blocking stage info when it can't (for error messages/UI).
 */
export function canLaunchCategory(
    infiltration: number,
    category: OperationCategory
): { allowed: boolean; currentStage: NetworkStage; requiredStage: NetworkStage } {
    const currentStage = stageForInfiltration(infiltration);
    const requiredStage = MIN_STAGE_FOR_CATEGORY[category];
    return { allowed: meetsStage(currentStage, requiredStage), currentStage, requiredStage };
}
