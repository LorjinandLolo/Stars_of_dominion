import { ResourceId, EconomyState, Entity } from '@/types';

// Baseline Upkeep Costs (Hourly)
const UPKEEP_COSTS: Record<string, Partial<Record<ResourceId, number>>> = {
    'ship': { credits: 10, chemicals: 1 },
    'station': { credits: 70 }, // 50 base + 20 maintenance merged
    'army': { food: 5, credits: 5 }
};

// Fixed specific costs
const SHIP_UPKEEP: Record<ResourceId, number> = { credits: 10, chemicals: 1 } as any; // Cast for now
const STATION_UPKEEP: Record<ResourceId, number> = { credits: 50, metals: 2 } as any;

/**
 * Calculates total upkeep for a faction based on their entities.
 */
export function calculateTotalUpkeep(entities: Entity[]): Record<ResourceId, number> {
    const totalUpkeep: Record<ResourceId, number> = {
        metals: 0, chemicals: 0, food: 0, happiness: 0, credits: 0
    };

    entities.forEach(entity => {
        const costs = UPKEEP_COSTS[entity.type] || {};

        Object.entries(costs).forEach(([res, amount]) => {
            totalUpkeep[res as ResourceId] = (totalUpkeep[res as ResourceId] || 0) + (amount as number);
        });
    });

    return totalUpkeep;
}

/**
 * Evaluates the economic health of a faction.
 * Updates stability and status based on resources and deficit.
 */
export function checkEconomicHealth(state: EconomyState): EconomyState {
    const newState = { ...state };
    const { resources, income_rates, expenses } = newState;
    const stability = newState.economic_health.stability;

    // 1. Calculate SOLVENCY
    // If we have negative credits or are running a deficit that drains reserves fast
    const creditBalance = resources['credits'];
    const netCreditIncome = income_rates['credits']; // This should already include expenses subtraction if done in calculations.ts?
    // Actually, normally Income - Expenses = Net. Here let's assume income_rates IS Net.

    let status: 'solvent' | 'struggling' | 'bankrupt' | 'collapsed' = 'solvent';
    let stabilityChange = 0;

    if (creditBalance < 0) {
        // We are in DEBT
        if (creditBalance < -5000) {
            status = 'collapsed';
            stabilityChange = -5; // Rapid collapse
        } else if (creditBalance < -1000) {
            status = 'bankrupt';
            stabilityChange = -2;
        } else {
            status = 'struggling';
            stabilityChange = -0.5;
        }
    } else if (netCreditIncome < 0) {
        // Burning reserves
        status = 'struggling';
        // No stability hit yet, just warning?
    }

    // 2. Resource Shortages (e.g. Food)
    if (resources['food'] < 0) {
        stabilityChange -= 1; // Starvation
    }

    // Apply Stability Change
    newState.economic_health.stability = Math.max(0, Math.min(100, stability + stabilityChange));

    // Update Counter
    if (status !== 'solvent') {
        newState.economic_health.deficit_counter += 1;
    } else {
        newState.economic_health.deficit_counter = Math.max(0, newState.economic_health.deficit_counter - 1);
    }

    // Auto-Recovery if solvent
    if (status === 'solvent' && stability < 50) {
        newState.economic_health.stability += 0.5;
    }

    newState.economic_health.status = status;
    return newState;
}

/**
 * Applies penalties for bankruptcy (e.g. force sell buildings - mock for now)
 */
export function applyBankruptcyPenalties(state: EconomyState, entities: Entity[]): string[] {
    const logs: string[] = [];
    if (state.economic_health.status === 'bankrupt' || state.economic_health.status === 'collapsed') {
        // Mock: Disband 1 ship if possible
        const shipIndex = entities.findIndex(e => e.type === 'ship');
        if (shipIndex !== -1) {
            // In a real system we would return the ID to be deleted by a manager
            logs.push(`Due to bankruptcy, a ship was sold for scrap.`);
            // entities.splice(shipIndex, 1); // logic would be external
        }
    }
    return logs;
}
