// ===== file: lib/press-system/publishing.ts =====
import {
    Story,
    PressFactionState,
    PressFactionType,
    PublishedStory,
    StorySource
} from './types';
import { PressConfig } from './config';
import { RNG } from './utils';

/**
 * Decides which stories get published by which factions.
 * Returns a list of NEWLY publishers.
 */
export function processPublishing(
    tick: number,
    candidates: Story[],
    pressFactions: Map<string, PressFactionState>,
    rng: RNG
): PublishedStory[] {
    const published: PublishedStory[] = [];

    for (const story of candidates) {
        for (const [factionId, faction] of pressFactions.entries()) {

            // Check Cooldowns (simplified: faction can only stick to one story per tick?)
            // Or cooldown per topic? 
            // Let's skip cooldown for MVP logic simplicity, assume high volume is okay

            // Calculate "Interest Score"
            // High magnitude = High interest
            // Alignment with Bias?
            // IF faction is STATE_MEDIA and story targets THEIR affiliate:
            //   - Ignore Negative stories?
            //   - Publish Positive stories?

            let interest = story.baseMagnitude;

            const config = PressConfig.behaviors[faction.type];

            // Bias Adjustment
            // Faction Bias: -100 (Anti) ... 100 (Pro)
            // Need to know if Story is "Negative" or "Positive" for the Target.
            // Assumption: Leaks/Rumors/Econ are usually NEGATIVE for stability.
            // War Reports could be either.
            // Simplified: All generated stories currently are "Incidents/Problems".
            // So:
            //   - State Media (Pro-State) wants to SUPPRESS (Low Interest)
            //   - Pirate/Indep (Anti/Neutral) wants to PUBLISH (High Interest)

            if (faction.type === PressFactionType.STATE_MEDIA && faction.affiliatedEmpireId === story.targetEmpireId) {
                // State Media ignores bad news about own empire
                interest *= 0.1;
            } else if (faction.type === PressFactionType.PIRATE_PRESS) {
                // Pirates love chaos
                interest *= 1.5;
            }

            // Threshold Check
            if (interest > config.publishThreshold) {
                // Publish!

                // Calculate Viral Factor
                // Credibility * Magnitude
                const viral = (faction.credibility / 100) * (story.baseMagnitude / 100);

                published.push({
                    id: `PUB_${factionId}_${story.id}`,
                    storyId: story.id,
                    publisherId: factionId,
                    tickPublished: tick,
                    viralFactor: viral,
                    originPlanetId: 'GENERIC_CAPITAL', // Mock
                    transmissionMap: new Map(),
                    jammedSystems: new Set()
                });
            }
        }
    }

    return published;
}
