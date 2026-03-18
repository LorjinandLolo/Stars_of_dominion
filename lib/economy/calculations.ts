import { ResourceId, EconomyState, TradeRoute, Crisis } from '@/types';

// Extended Planet Interface for Economy
export interface EconomyPlanet {
    $id: string;
    name: string;
    type?: 'terran' | 'ocean' | 'desert' | 'volcanic' | 'barren' | 'gas_giant';
    buildings?: Record<string, number>; // buildingId -> count
}

// Base Production Rates per Planet Type (Hourly)
const PLANET_YIELDS: Record<string, Partial<Record<ResourceId, number>>> = {
    'terran': { food: 20, happiness: 5, metals: 10, credits: 50 },
    'ocean': { food: 30, happiness: 10, chemicals: 10, credits: 40 },
    'desert': { metals: 20, chemicals: 10, food: 5, credits: 30 },
    'volcanic': { metals: 40, chemicals: 20, happiness: -5, credits: 20 },
    'barren': { metals: 15, chemicals: 5, credits: 10 },
    'gas_giant': { chemicals: 50, credits: 10, happiness: -5 },
    'default': { metals: 5, food: 5, credits: 10 }
};

// Building Outputs (Hourly per building)
const BUILDING_OUTPUTS: Record<string, Partial<Record<ResourceId, number>>> = {
    'mine': { metals: 10 },
    'farm': { food: 15 },
    'lab': { credits: -5 }, // Upkeep example
    'factory': { chemicals: 10, credits: -2 }
};

// Derived Stats logic
export function calculateConstructionCapacity(metals: number, chemicals: number): number {
    return (metals * 0.5) + (chemicals * 0.2); // Simplified formula
}

export function calculateResearchProgress(food: number, happiness: number): number {
    if (happiness < 50) return 0; // Unhappy people don't research
    return (food * 0.1) * (happiness / 100);
}

/**
 * Calculates the total hourly income for a faction based on their planets.
 * @param planets List of planets owned by the faction
 */
export function calculateIncome(planets: EconomyPlanet[]): Record<ResourceId, number> {
    const totalIncome: Record<ResourceId, number> = {
        metals: 0, chemicals: 0, food: 0, happiness: 0, credits: 0
    };

    planets.forEach(planet => {
        const type = planet.type || 'default';
        const base = PLANET_YIELDS[type] || PLANET_YIELDS['default'];

        // Add Base Yields
        Object.entries(base).forEach(([res, amount]) => {
            totalIncome[res as ResourceId] = (totalIncome[res as ResourceId] || 0) + amount;
        });

        // Add Building Yields (with diminishing returns logic if needed)
        // TODO: Implement Diminishing Returns loop here when buildings are real
    });

    return totalIncome;
}

/**
 * Applies Trade Routes and Crises to the base income.
 */
export function getNetIncome(
    baseIncome: Record<ResourceId, number>,
    routes: TradeRoute[],
    crises: Crisis[],
    myPlanetIds: string[],
    upkeep: Record<ResourceId, number> = { metals: 0, chemicals: 0, food: 0, happiness: 0, credits: 0 }
): Record<ResourceId, number> {
    const net = { ...baseIncome };
    const planetSet = new Set(myPlanetIds);

    // 1. Process Trade Routes
    routes.forEach(route => {
        const isOrigin = planetSet.has(route.origin_planet_id);
        const isTarget = planetSet.has(route.target_planet_id);

        if (isOrigin) {
            // EXPORT: Lose Resource, Gain Credits
            // For now assuming 1 Resource = 1 Credit for simplicity, should look up prices later
            const creditValue = route.amount;

            net[route.resource] = (net[route.resource] || 0) - route.amount;
            net['credits'] = (net['credits'] || 0) + creditValue;
        } else if (isTarget) {
            // IMPORT: Gain Resource, Lose Credits
            const creditValue = route.amount;

            net[route.resource] = (net[route.resource] || 0) + route.amount;
            net['credits'] = (net['credits'] || 0) - creditValue;
        }
    });

    // 2. Process Crises
    crises.forEach(crisis => {
        // Apply active consequences continuously if logic dictates (e.g. embargo reduces credits/hour)
        // Assuming consequences in Crisis definitions are "per hour" penalties or one-offs?
        // Since this is calculating RATE, we assume they are per-hour modifiers.

        crisis.consequences.forEach(cons => {
            // Assume 'amount' is negative for penalties
            const res = cons.resource as ResourceId;
            net[res] = (net[res] || 0) + cons.amount;
        });
    });

    // 3. Subtract Upkeep
    Object.entries(upkeep).forEach(([res, amount]) => {
        net[res as ResourceId] = (net[res as ResourceId] || 0) - amount;
    });

    return net;
}

/**
 * Calculates the new resource state based on elapsed time.
 * @param current Current resource stockpiles
 * @param rates Hourly income rates
 * @param hoursElapsed Time passed in hours
 * @param capacities Max storage caps
 */
export function applyTimeDelta(
    current: Record<ResourceId, number>,
    rates: Record<ResourceId, number>,
    hoursElapsed: number,
    capacities: Record<string, number>
): Record<ResourceId, number> {
    const next = { ...current };

    // Process each resource
    (Object.keys(current) as ResourceId[]).forEach(res => {
        const rate = rates[res] || 0;
        const delta = rate * hoursElapsed;

        let newValue = (next[res] || 0) + delta;

        // Clamp to 0 (no negative stockpiles, though negative rates are fine)
        // Exception: Happiness is 0-100
        if (res === 'happiness') {
            newValue = Math.min(100, Math.max(0, newValue));
        } else {
            newValue = Math.max(0, newValue);
            // TODO: Apply Caps if capacities exist
        }

        next[res] = newValue;
    });

    return next;
}
