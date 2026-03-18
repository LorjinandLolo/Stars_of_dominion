/**
 * lib/economy/derived-logic.ts
 * 
 * Formulas for calculating Derived Capacities from Trade and Empire resources.
 */

import { Resource } from '../trade-system/types';

export interface DerivedCapacities {
    construction: number;
    military: number;
    research: number;
    cultural: number;
}

export interface InputResources {
    metals: number;
    chemicals: number;
    energy: number;
    food: number;
    ammo: number;
    rares: number;
    credits: number;
    happiness: number;
    infrastructureLevel: number;
    efficiencyModifier: number;
}

/**
 * Calculates industrial and strategic capacities based on input resources.
 */
export function calculateDerivedCapacities(inputs: InputResources): DerivedCapacities {
    const { 
        metals, chemicals, energy, food, ammo, rares, credits, 
        happiness, infrastructureLevel, efficiencyModifier 
    } = inputs;

    // Infrastructure Multiplier: Base 1.0 + 0.2 per level
    const infraMult = 1.0 + (infrastructureLevel - 1) * 0.2;
    
    // Workforce Multiplier: Derived from food and happiness (0.5 to 1.5)
    // Assumes food satisfaction if food > 0
    const workforceMult = Math.min(1.5, Math.max(0.5, (happiness / 100) + (food > 0 ? 0.5 : 0)));

    // 1. Construction Capacity
    // (metals * 0.4 + chemicals * 0.3 + energy * 0.3)
    const construction = (
        (metals * 0.4) + 
        (chemicals * 0.3) + 
        (energy * 0.3)
    ) * infraMult * workforceMult * efficiencyModifier;

    // 2. Military Capacity
    // (ammo * 0.4 + metals * 0.3 + manpower/infra * 0.3)
    const military = (
        (ammo * 0.4) + 
        (metals * 0.3) + 
        (infraMult * 10 * 0.3) 
    ) * efficiencyModifier;

    // 3. Research Capacity
    // (chemicals * 0.5 + energy * 0.3 + happiness/10 * 0.2)
    const research = (
        (chemicals * 0.5) + 
        (energy * 0.3) + 
        ((happiness / 10) * 0.2)
    ) * infraMult * efficiencyModifier;

    // 4. Cultural Capacity
    // (happiness * 0.4 + credits/1000 * 0.4 + rares * 0.2)
    const cultural = (
        ((happiness / 10) * 0.4) + 
        ((credits / 1000) * 0.4) + 
        (rares * 0.2)
    ) * efficiencyModifier;

    return {
        construction: Math.max(0, construction),
        military: Math.max(0, military),
        research: Math.max(0, research),
        cultural: Math.max(0, cultural)
    };
}

/**
 * Applies the Production Focus multiplier (+25% / -10%)
 */
export function applyProductionFocus(
    baseProduction: Record<Resource, number>,
    focus: Resource | null
): Record<Resource, number> {
    if (!focus) return baseProduction;

    const nextProduction = { ...baseProduction };
    
    // Trade resources only can be prioritized (metals, chem, food, ammo, rares)
    const tradeResources = [Resource.METALS, Resource.CHEMICALS, Resource.FOOD, Resource.AMMO, Resource.RARES];
    
    if (!tradeResources.includes(focus)) return baseProduction;

    for (const res of tradeResources) {
        if (res === focus) {
            nextProduction[res] = (nextProduction[res] || 0) * 1.25;
        } else {
            nextProduction[res] = (nextProduction[res] || 0) * 0.90;
        }
    }

    return nextProduction;
}
