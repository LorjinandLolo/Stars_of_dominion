/**
 * lib/economy/empire-logic.ts
 * 
 * Logic for empire-level stabilizers: Energy Backing, Inflation, and Power Shortages.
 */

export interface EmpireStabilityState {
    totalCredits: number;
    totalEnergyProduction: number;
    creditBackingRatio: number; // e.g., 100 credits per 1 energy unit
    energyLoad: number; // Required energy for infrastructure
}

export interface StabilityMetrics {
    inflationRate: number; // 0.0 to 1.0
    confidenceIndex: number; // 0 to 100
    isEnergyShortage: boolean;
    backingHealth: number; // 0 to 1.0
}

/**
 * Calculates empire stability metrics based on energy and credits.
 */
export function calculateEmpireStability(state: EmpireStabilityState): StabilityMetrics {
    const { totalCredits, totalEnergyProduction, creditBackingRatio, energyLoad } = state;

    // 1. Credit Backing
    const creditSupportCap = totalEnergyProduction * creditBackingRatio;
    const backingHealth = totalCredits <= 0 ? 1.0 : Math.min(1.0, creditSupportCap / totalCredits);

    // 2. Inflation Rate
    // If credits exceed supported levels, inflation rises
    let inflationRate = 0;
    if (totalCredits > creditSupportCap) {
        const excessRatio = (totalCredits - creditSupportCap) / creditSupportCap;
        inflationRate = Math.min(0.5, excessRatio * 0.1); // Max 50% inflation for now
    }

    // 3. Confidence Index
    // Derived from backing health and inflation
    const confidenceIndex = (backingHealth * 80) + ((1 - inflationRate) * 20);

    // 4. Energy Shortage
    const isEnergyShortage = totalEnergyProduction < energyLoad;

    return {
        inflationRate,
        confidenceIndex,
        isEnergyShortage,
        backingHealth
    };
}

/**
 * Calculates modified upkeep costs based on inflation.
 */
export function getModifiedUpkeep(baseUpkeep: number, inflationRate: number): number {
    return baseUpkeep * (1 + inflationRate);
}

/**
 * Calculates output penalty due to energy shortage.
 */
export function getEnergyShortagePenalty(available: number, required: number): number {
    if (available >= required) return 1.0;
    if (required === 0) return 1.0;
    
    // Scale penalty: 0% available = 50% output penalty (0.5 multiplier)
    const ratio = available / required;
    return 0.5 + (ratio * 0.5);
}
