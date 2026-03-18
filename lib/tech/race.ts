import {
    PrimaryEffectType, SecondaryEffectType, VisibilityModifierType, BurnType,
    Tech, TechEffect, Magnitude
} from './types';

export interface RaceConstraint {
    raceId: string;
    forbiddenPrimary: Set<PrimaryEffectType>;
    forbiddenSecondary: Set<SecondaryEffectType>;
    forbiddenVisibility: Set<VisibilityModifierType>;
    forbiddenBurn: Set<BurnType>;

    // Callback to generate a penalty if a forbidden element is forced (e.g. by random gen)
    penaltyGenerator: (tech: Tech) => TechEffect | undefined;
}

export const STANDARD_PENALTY: TechEffect = {
    type: SecondaryEffectType.HAPPINESS_DRAIN,
    target: 'global_stability',
    value: -5,
    magnitude: Magnitude.MED,
    modifier: { reason: "Race Constraint Violation" }
};

export class RaceConstraintManager {
    static validateAndCorrect(tech: Tech, constraint?: RaceConstraint): Tech {
        if (!constraint) return tech;

        const correctedTech = { ...tech };
        let violation = false;

        // Check Primary
        if (tech.primaryEffect && constraint.forbiddenPrimary.has(tech.primaryEffect.type)) {
            violation = true;
            // Strategy: Keep the forbidden effect but add a stiff penalty (Cruelty Layer)
            // "If a forbidden element is used... Add mandatory Secondary Effect"
        }

        // Check Secondary
        if (tech.secondaryEffect && constraint.forbiddenSecondary.has(tech.secondaryEffect.type as SecondaryEffectType)) {
            violation = true;
        }

        // Check Visibility
        if (tech.visibilityModifier && constraint.forbiddenVisibility.has(tech.visibilityModifier as VisibilityModifierType)) {
            violation = true;
        }

        // Check Burn
        if (tech.burnCost && constraint.forbiddenBurn.has(tech.burnCost.type as BurnType)) {
            violation = true;
        }

        if (violation) {
            // Apply Penalty
            const penalty = constraint.penaltyGenerator(tech) || STANDARD_PENALTY;
            correctedTech.secondaryEffect = {
                type: (penalty.type as SecondaryEffectType),
                magnitude: penalty.magnitude || Magnitude.MED
            };

            // Mark description
            correctedTech.description += " [CONTRA-INNOVATION PROTOCOL ENGAGED]";
        }

        return correctedTech;
    }
}
