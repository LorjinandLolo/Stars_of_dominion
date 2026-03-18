// ===== file: lib/press-system/config.ts =====
import { PressFactionType, CrisisChoice } from './types';

export const PressConfig = {
    // 0-100 Scales
    scales: {
        maxCredibility: 100,
        maxTrust: 100,
        maxPressure: 100,
        maxStat: 100
    },

    // Thresholds
    thresholds: {
        crisisTriggerPressure: 70, // Pressure > 70 triggers crisis check
        storyViralThreshold: 50, // Credibility * Magnitude > 50 to go viral
    },

    // Faction Behaviors
    behaviors: {
        [PressFactionType.STATE_MEDIA]: {
            credibilityDecay: 0.5, // Per false story
            credibilityGain: 0.2, // Per true story
            bias: 50, // Pro-state
            publishThreshold: 30 // Will publish low magnitude if pro-state
        },
        [PressFactionType.INDEPENDENT_MEDIA]: {
            credibilityDecay: 2.0, // High penalty for lying
            credibilityGain: 0.5,
            bias: 0,
            publishThreshold: 50
        },
        [PressFactionType.PIRATE_PRESS]: {
            credibilityDecay: 0.1, // Audience expects some lies
            credibilityGain: 0.1,
            bias: -50, // Anti-state
            publishThreshold: 20 // Spams everything
        }
    },

    // Crisis Effects (Deltas)
    effects: {
        [CrisisChoice.SUPPRESS]: {
            trustCost: -10,
            pressureReduction: -20, // Short term relief
            stabilityBonus: 5,
            backlashRisk: 30 // % chance of failure
        },
        [CrisisChoice.ADMIT_REFORM]: {
            trustCost: 5, // Short term hit
            trustGainLongTerm: 10,
            pressureReduction: -40, // Big relief
            stabilityBonus: -5 // Temporary chaos
        },
        [CrisisChoice.BLAME_FOREIGN]: {
            trustCost: -2,
            diplomaticPenalty: 10,
            pressureReduction: -10
        },
        [CrisisChoice.IGNORE]: {
            trustCost: -5,
            pressureReduction: 0, // Keeps burning
            stabilityBonus: -10
        },
        [CrisisChoice.COUNTER_LEAK]: {
            trustCost: -5,
            pressureReduction: -5,
            offensiveImpact: 20 // Damage to attacker
        }
    },

    // Propagation
    propagation: {
        baseRadius: 5, // Light years or grid units? Assuming Grid distance.
        decayPerHop: 0.2, // 20% reduction per unit distance
        tradeRouteBonus: 1.5 // Multiplier for spread along trade routes
    }
};
