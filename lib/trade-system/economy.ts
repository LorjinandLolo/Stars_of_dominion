import { Faction, Resource } from './types';
import { calculateEmpireStability, getModifiedUpkeep } from '../economy/empire-logic';

/**
 * Updates faction economies based on trade results.
 */
export function updateFactionEconomy(
    factions: Map<string, Faction>,
    tariffRevenue: Map<string, number>,
    piracyLoss: Map<string, number>,
    // Aggregated figures from planets
    factionEnergyProduction: Map<string, number>,
    factionEnergyLoad: Map<string, number>
): Map<string, Faction> {
    const nextFactions = new Map<string, Faction>();

    for (const [id, faction] of factions.entries()) {
        const next = { ...faction, metrics: { ...faction.metrics } };

        // 1. Calculate Stability & Inflation
        const energyProd = factionEnergyProduction.get(id) || 0;
        const energyLoad = factionEnergyLoad.get(id) || 0;
        
        const stability = calculateEmpireStability({
            totalCredits: next.creditSupply, // Using creditSupply as total circulating credits
            totalEnergyProduction: energyProd,
            creditBackingRatio: next.metrics.energyBackingRatio || 1000,
            energyLoad: energyLoad
        });

        next.metrics.inflationRate = stability.inflationRate;
        next.metrics.confidenceIndex = stability.confidenceIndex;
        next.metrics.energyLoad = energyLoad;
        next.metrics.reserveStressIndex = (1 - stability.backingHealth) * 100;

        // 2. Apply Revenue (Tariffs)
        const rev = tariffRevenue.get(id) || 0;
        next.liquidity += rev;

        // 3. Apply Losses (Piracy)
        const loss = piracyLoss.get(id) || 0;
        next.liquidity -= loss;

        // 4. Debt Service with Inflation
        // Base interest 0.1% + inflation impact
        const baseInterest = next.debt * 0.001;
        const interest = getModifiedUpkeep(baseInterest, stability.inflationRate);
        next.liquidity -= interest;

        // 5. Update Credit Supply (Printing/Contraction)
        // Simplification: if liquidity is high, we might contract. If low, print (increasing supply/inflation).
        if (next.liquidity < 0) {
            const deficit = Math.abs(next.liquidity);
            next.creditSupply += deficit; // Print money to cover deficit
            next.liquidity = 0;
        }

        nextFactions.set(id, next);
    }

    return nextFactions;
}
