import { SystemNode } from '@/types/ui-state';
import { IdeologyProfile } from '../politics/ideology-types';

export interface OccupationState {
    systemId: string;
    occupierId: string;
    originalOwnerId: string;
    durationTicks: number;
    policeForce: number; // The military strength currently enforcing martial law
}

/**
 * Evaluates the systemic effects of placing a planet under Martial Law / Military Occupation.
 * Returns the modified modifiers for economy and ideology.
 */
export function evaluateOccupationTick(
    occupation: OccupationState,
    system: SystemNode,
    systemIdeology: IdeologyProfile
) {
    // 1. Economic Devastation from Occupation
    // The native populace refuses to work, sabotaging lines.
    // The larger the police force, the more output is salvaged under gunpoint.
    let baseOutputMultiplier = 0.10; // 90% economic penalty by default during occupation

    // Every 1000 police troops salvages 5% of the economy, up to a max of 50%
    const martialLawEfficiency = Math.min(0.40, (occupation.policeForce / 1000) * 0.05);
    const finalEconomicMultiplier = baseOutputMultiplier + martialLawEfficiency;

    // 2. Ideological Suppression vs Radicalization
    const updatedIdeology = { ...systemIdeology };

    // The longer a planet is occupied, the more the populace radicalizes against the occupier
    // However, a massive police force can temporarily suppress Libertarian ideals into Authoritarian submission
    if (occupation.durationTicks > 50) {
        // Lingering occupation breeds extreme hatred
        updatedIdeology.militarism_pacifism = Math.max(-100, updatedIdeology.militarism_pacifism - 1); // Becomes more militaristic (assuming negative is militarist for this axis depending on setup, let's say positive is militarist)
        updatedIdeology.militarism_pacifism = Math.min(100, updatedIdeology.militarism_pacifism + 2); // Correct: Positive = Militarist

        // Suppression of liberty
        if (occupation.policeForce > 5000) {
            updatedIdeology.authoritarianism_liberty = Math.max(-100, updatedIdeology.authoritarianism_liberty - 5); // Shift to Authoritarian
        } else {
            // Not enough police? They demand liberty
            updatedIdeology.authoritarianism_liberty = Math.min(100, updatedIdeology.authoritarianism_liberty + 2); // Shift to Liberty
        }
    }

    // 3. Unrest generation
    // Occupation generates massive systemic unrest unless crushed by overwhelming numbers
    let generatedUnrest = 15;
    if (occupation.policeForce >= 10000) {
        generatedUnrest = 2; // Martial law suppresses open riots
    }

    return {
        economicMultiplier: finalEconomicMultiplier,
        updatedIdeology,
        unrestDelta: generatedUnrest,
        // Advance the duration
        nextOccupationState: {
            ...occupation,
            durationTicks: occupation.durationTicks + 1
        }
    };
}
