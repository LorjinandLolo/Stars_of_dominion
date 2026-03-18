// ===== file: lib/press-system/crisis.ts =====
import {
    MediaCrisis,
    EmpireState,
    PublishedStory,
    Story,
    CrisisChoice
} from './types';
import { PressConfig } from './config';
import { RNG } from './utils';

/**
 * Checks for new crises based on accumulated pressure and active stories.
 */
export function checkCrises(
    tick: number,
    empires: Map<string, EmpireState>,
    activeStories: PublishedStory[], // Stories currently circulating
    storyDetails: Map<string, Story>,
    rng: RNG
): MediaCrisis[] {
    const newCrises: MediaCrisis[] = [];

    for (const [empId, empire] of empires.entries()) {
        // Threshold Check
        if (empire.informationPressure > PressConfig.thresholds.crisisTriggerPressure) {
            // Check if already in crisis to avoid spam?
            if (empire.activeCrises.size > 0) continue;

            // Find a trigger story (highest viral factor targeting this empire)
            const triggers = activeStories.filter(p => {
                const s = storyDetails.get(p.storyId);
                return s && s.targetEmpireId === empId;
            });

            if (triggers.length > 0) {
                // Pick highest impact
                triggers.sort((a, b) => b.viralFactor - a.viralFactor);
                const trigger = triggers[0];

                newCrises.push({
                    id: `CRISIS_${tick}_${empId}`,
                    storyId: trigger.storyId,
                    targetEmpireId: empId,
                    deadlineTick: tick + 24, // 24 hour deadline
                    severity: empire.informationPressure,
                    resolved: false
                });
            }
        }
    }

    return newCrises;
}

/**
 * Resolves a crisis based on player choice.
 */
export function resolveCrisis(
    crisis: MediaCrisis,
    choice: CrisisChoice,
    empire: EmpireState
): { empireDelta: Partial<EmpireState>, outcome: string } {
    const effects = PressConfig.effects[choice];

    // Apply changes
    const newTrust = Math.max(0, Math.min(100, empire.publicTrust + effects.trustCost));
    const newPressure = Math.max(0, Math.min(100, empire.informationPressure + effects.pressureReduction));

    // In a real system, we'd roll for "Success/Fail" of suppression based on Trust.
    // e.g. if Trust < 30, Suppression triggers backlash.

    let outcome = "Crisis Resolved";
    if (choice === CrisisChoice.SUPPRESS && empire.publicTrust < 30) {
        // Backlash!
        return {
            empireDelta: {
                publicTrust: Math.max(0, newTrust - 20), // Double penalty
                informationPressure: 100 // Explodes
            },
            outcome: "Suppression Failed! Public Outrage!"
        };
    }

    return {
        empireDelta: {
            publicTrust: newTrust,
            informationPressure: newPressure
        },
        outcome
    };
}
