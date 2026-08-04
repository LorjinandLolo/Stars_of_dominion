// ===== file: lib/press-system/publishing.ts =====
import {
    Story,
    PressFactionState,
    PressFactionType,
    PublishedStory,
    PlanetState,
    StorySource
} from './types';
import { PressConfig } from './config';
import { RNG } from './utils';

/**
 * Pick the planet a story breaks on: somewhere inside the empire it is about,
 * falling back to any audience at all. Stories used to epicenter on a literal
 * 'GENERIC_CAPITAL' placeholder, which matches no planet — so calculateViralSpread
 * bailed on the first lookup and nothing ever propagated or decayed.
 */
function pickEpicenter(
    story: Story,
    planets: Map<string, PlanetState>,
    rng: RNG
): string | null {
    const owned: string[] = [];
    for (const [id, planet] of planets.entries()) {
        if (planet.ownerId === story.targetEmpireId) owned.push(id);
    }
    const pool = owned.length > 0 ? owned : [...planets.keys()];
    if (pool.length === 0) return null;
    return pool[rng.nextInt(0, pool.length - 1)];
}

/**
 * Decides which stories get published by which factions.
 * Returns only NEW publications: `alreadyPublished` carries the
 * `${publisherId}:${storyId}` pairs already in circulation, because active
 * stories stay in the pool for many ticks and every outlet would otherwise
 * re-run the same story (under the same id) on every single tick.
 */
export function processPublishing(
    tick: number,
    candidates: Story[],
    pressFactions: Map<string, PressFactionState>,
    rng: RNG,
    planets: Map<string, PlanetState> = new Map(),
    alreadyPublished: Set<string> = new Set()
): PublishedStory[] {
    const published: PublishedStory[] = [];

    for (const story of candidates) {
        for (const [factionId, faction] of pressFactions.entries()) {
            if (alreadyPublished.has(`${factionId}:${story.id}`)) continue;

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

                const originPlanetId = pickEpicenter(story, planets, rng);
                if (!originPlanetId) continue; // no audience anywhere — nothing to break the story to

                published.push({
                    id: `PUB_${factionId}_${story.id}`,
                    storyId: story.id,
                    publisherId: factionId,
                    tickPublished: tick,
                    viralFactor: viral,
                    originPlanetId,
                    transmissionMap: new Map(),
                    jammedSystems: new Set()
                });
            }
        }
    }

    return published;
}
