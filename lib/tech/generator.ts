import {
    Tech, Domain, Tier, PrimaryEffectType, SecondaryEffectType,
    VisibilityModifierType, BurnType, Magnitude, Intent, GenerationTag, GameStateContext
} from './types';
import { RaceConstraint, RaceConstraintManager } from './race';

export class TechGenerator {

    /**
     * Layer 1: Auto-Generation Constraints
     */
    static generateTech(
        domain: Domain,
        tier: Tier,
        context: GameStateContext,
        constraint?: RaceConstraint
    ): Tech {

        // 1. Determine Intent based on Context (Living Tree)
        const intent = this.selectIntent(context);

        // 2. Select Primary Effect (Core Constraint: Exactly ONE)
        const pEffectType = this.selectPrimaryEffect(intent, tier);
        const pMag = this.calculateMagnitude(tier, context);

        // 3. Optional Secondary (Probability based on tier & intent)
        let sEffect = undefined;
        if (Math.random() > 0.5 || tier >= Tier.III) {
            sEffect = {
                type: this.selectSecondaryEffect(intent),
                magnitude: pMag === Magnitude.SEVERE ? Magnitude.HIGH : Magnitude.LOW
            };
        }

        // 4. Burn (Mandatory for Tier IV)
        let burn = undefined;
        if (tier === Tier.IV) {
            burn = {
                type: this.selectBurnType(intent),
                description: "Procedurally generated sacrifice"
            };
        }

        // 5. Visibility (Optional)
        let vis = undefined;
        if (intent === Intent.DECEPTION || Math.random() > 0.7) {
            vis = this.selectVisibility(tier);
        }

        // 6. Assemble
        const tech: Tech = {
            id: `gen_${domain}_${tier}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: `Generated ${domain} Protocol ${Math.floor(Math.random() * 999)}`,
            domain,
            tier,
            intent,
            description: "A procedurally generated technology.",
            primaryEffect: { type: pEffectType, magnitude: pMag },
            secondaryEffect: sEffect,
            visibilityModifier: vis,
            burnCost: burn,
            generationTags: []
        };

        // 7. Layer 2: Race Constraints
        return RaceConstraintManager.validateAndCorrect(tech, constraint);
    }

    // --- Selectors ---

    private static selectIntent(ctx: GameStateContext): Intent {
        // Map context to intent weights
        // Simplification:
        if (ctx.warIntensity === Magnitude.HIGH || ctx.warIntensity === Magnitude.SEVERE) return Intent.AGGRESSION;
        if (ctx.economicStress === Magnitude.HIGH) return Intent.LEVERAGE;
        return Intent.CONTROL; // default
    }

    private static selectPrimaryEffect(intent: Intent, tier: Tier): PrimaryEffectType {
        // Bias based on intent
        switch (intent) {
            case Intent.AGGRESSION:
                return Math.random() > 0.5 ? PrimaryEffectType.STAT_SHIFT : PrimaryEffectType.EXTERNALITY_WEAPON;
            case Intent.DECEPTION:
                return PrimaryEffectType.INFORMATION_ASYMMETRY;
            case Intent.CONTROL:
                return Tier.IV === tier ? PrimaryEffectType.COMMITMENT_TRAP : PrimaryEffectType.CRISIS_MODIFIER;
            case Intent.LEVERAGE:
                return PrimaryEffectType.STAT_SHIFT;
            default:
                return PrimaryEffectType.STAT_SHIFT;
        }
    }

    private static selectSecondaryEffect(intent: Intent): SecondaryEffectType {
        const opts = Object.values(SecondaryEffectType);
        return opts[Math.floor(Math.random() * opts.length)];
    }

    private static selectBurnType(intent: Intent): BurnType {
        // "Tier IV techs MUST include exactly ONE Burn"
        return BurnType.PERMANENT_PRODUCTION_PENALTY; // simplified
    }

    private static selectVisibility(tier: Tier): VisibilityModifierType {
        return VisibilityModifierType.OBSCURE_TIER;
    }

    private static calculateMagnitude(tier: Tier, ctx: GameStateContext): Magnitude {
        // Base mag on tier
        if (tier === Tier.I) return Magnitude.LOW;
        if (tier === Tier.II) return Magnitude.MED;
        if (tier === Tier.III) return Magnitude.HIGH;
        return Magnitude.SEVERE;
    }
}
