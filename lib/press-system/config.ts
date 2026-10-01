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

    // Information pressure is a stock with a leak: coverage fills it, and it
    // drains by a share of itself every tick. A steady level of coverage
    // therefore settles at heat / leak instead of climbing to the ceiling.
    pressure: {
        leakPerTick: 0.03,       // half-life ~23 ticks (under six sim days)
        heatToPressure: 3,       // pressure per tick from one story at full intensity and full virality
        maxHeatPerTick: 8,
        silenceBelow: 0.5,       // under this the public has moved on
    },

    // The life of a story.
    stories: {
        shelfLifeTicks: 40,              // ten sim days; after that it is old news
        rumourChancePerPressure: 0.001,  // per tick, per point of pressure: 10% at the ceiling
        economicReportChance: 0.05,      // per tick, only above economicReportPressure
        economicReportPressure: 60,
    },

    // What an audience returns to once the coverage dies down.
    audience: {
        restingStability: 70,
        restingRadicalization: 5,
        recoveryPerTick: 0.02,   // share of the gap closed each tick
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
        },
        [CrisisChoice.QUARANTINE]: {
            trustCost: -20,
            pressureReduction: -30,
            stabilityBonus: -10
        },
        [CrisisChoice.JAM_SIGNAL]: {
            trustCost: -15,
            pressureReduction: -25,
            stabilityBonus: -5
        },
        [CrisisChoice.COUNTER_NARRATIVE]: {
            trustCost: 5,
            pressureReduction: -15,
            stabilityBonus: 0
        },
        [CrisisChoice.DENY]: {
            trustCost: 0,
            pressureReduction: -25, // Strong relief when it holds
            stabilityBonus: 0
        },
        [CrisisChoice.DISTRACT]: {
            trustCost: -2,
            pressureReduction: -20, // Fast relief, but the story keeps circulating
            stabilityBonus: 0
        }
    },

    // Denial only holds when the story is poorly documented.
    denial: {
        exposureEvidenceThreshold: 60, // evidenceStrength >= this → denial exposed
        exposedTrustPenalty: -15,
        exposedCredibilityPenalty: -25,
        exposedPressureSpike: 15,
        heldCredibilityBonus: 3
    },

    // Credibility side-effects of the classic choices.
    credibility: {
        admitReformBonus: 8,
        suppressFailPenalty: -10,
        suppressMediaFreedomCost: -5,
        jamMediaFreedomCost: -3
    },

    // Propagation
    propagation: {
        baseRadius: 5, // Light years or grid units? Assuming Grid distance.
        decayPerHop: 0.2, // 20% reduction per unit distance
        tradeRouteBonus: 1.5, // Multiplier for spread along trade routes
        hopAttenuation: 0.7, // a story arrives next door at most this loud, relative to where it came from
        deadIntensity: 2 // below this nobody on that world is talking about it any more
    }
};
