// ===== file: lib/press-system/stories.ts =====
import {
    Story,
    StorySource,
    StoryTruth,
    EmpireState,
    PlanetState
} from './types';
import { RNG } from './utils';

export interface TriggerContext {
    espionageSuccess?: boolean;
    battleUncertainty?: number; // 0-100
    economicStress?: number; // 0-100
    factionId: string; // Faction triggering the event
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateId(rng: RNG, length = 8): string {
    let res = '';
    for (let i = 0; i < length; i++) {
        res += ID_CHARS[rng.nextInt(0, ID_CHARS.length - 1)];
    }
    return res;
}

/**
 * Generates potential stories based on world state and triggers.
 */
export function generateStories(
    tick: number,
    empires: Map<string, EmpireState>,
    rng: RNG,
    triggers: TriggerContext[] = [] // Optional external triggers
): Story[] {
    const stories: Story[] = [];

    // 1. Process Explicit Triggers
    for (const trigger of triggers) {
        if (trigger.espionageSuccess) {
            stories.push({
                id: `LEAK_${generateId(rng)}`,
                source: StorySource.ESPIONAGE_LEAK,
                truth: StoryTruth.TRUE,
                targetEmpireId: trigger.factionId,
                subject: 'Classified Intelligence Leak',
                baseMagnitude: rng.nextInt(50, 90),
                tickCreated: tick
            });
        }
    }

    // 2. Background Generation (Rumors, Economic Reports)
    // For each empire, small chance of random rumor or report
    for (const [id, empire] of empires.entries()) {
        // High pressure increases chance of localized rumors
        const pressure = empire.informationPressure;
        if (rng.check(pressure * 0.005)) { // e.g. 50 pressure -> 25% chance? No, 0.25%? 
            // 0.005 * 100 = 0.5 (50% chance seems high per tick if tick is hourly)
            // Let's assume tick is hourly. 0.001 * pressure = 10% at max pressure?
            // Actually, let's keep it modest.

            stories.push({
                id: `RUMOR_${generateId(rng)}`,
                source: StorySource.RUMOR_MILL,
                truth: rng.check(0.5) ? StoryTruth.FALSE : StoryTruth.UNKNOWN, // Often false
                targetEmpireId: id,
                subject: 'Unverified Rumors of Unrest',
                baseMagnitude: rng.nextInt(10, 40),
                tickCreated: tick
            });
        }

        // Economic reports if pressure is high
        if (pressure > 60 && rng.check(0.05)) {
            stories.push({
                id: `ECON_${generateId(rng)}`,
                source: StorySource.ECONOMIC_DATA,
                truth: StoryTruth.TRUE,
                targetEmpireId: id,
                subject: 'Market Volatility Report',
                baseMagnitude: rng.nextInt(30, 60),
                tickCreated: tick
            });
        }
    }

    return stories;
}
