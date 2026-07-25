import { PlanetProduction, PlanetServiceState, ServiceStatus } from '../economy-types';
// Load definitions via a bundler-resolved static import instead of fs.readFileSync from
// process.cwd(). The old approach returned [] under Next's bundled/serverless runtime,
// silently disabling upkeep, coverage, and grid-efficiency for every planet.
import serviceDefinitionsJson from './definitions.json';

export interface ServiceDefinition {
    id: string;
    name: string;
    category: string;
    description: string;
    baseCapacity: number;
    baseUpkeep: Record<string, number>;
    scaling: {
        capacityPerLevel: number;
        upkeepMultiplier: number;
    };
    effects: Record<string, Record<string, number>>;
    tags: string[];
}

const serviceDefs: ServiceDefinition[] = serviceDefinitionsJson as unknown as ServiceDefinition[];

/** Demand each service must cover, per unit of population. */
const SERVICE_DEMAND_PER_POP: Record<string, number> = {
    housing: 15,
    healthcare: 5,
    food_distribution: 5,
    energy_grid: 10,
};

/** Smallest service level whose capacity covers the population's demand. */
function requiredServiceLevel(def: ServiceDefinition, population: number): number {
    const demand = population * (SERVICE_DEMAND_PER_POP[def.id] ?? 0);
    return Math.max(1, Math.ceil((demand - def.baseCapacity) / def.scaling.capacityPerLevel));
}

export function loadServiceDefinitions() {
    return serviceDefs;
}

export function initializePlanetServices(planet: PlanetProduction) {
    const defs = loadServiceDefinitions();
    const pop = planet.demographics?.population ?? 10;
    // Size each service to the starting population. Seeding everything at
    // level 1 left capitals (pop 150) with every service "collapsed" from the
    // first tick, throttling the whole planet to 10% output forever.
    defs.forEach(def => {
        planet.services[def.id] = {
            serviceId: def.id,
            level: requiredServiceLevel(def, pop),
            capacity: 0,
            demand: 0,
            efficiency: 1.0,
            coverageRatio: 1.0,
            status: 'adequate',
            unpaidUpkeepTicks: 0,
            modifiers: []
        };
    });

    // Provide default demographics if missing
    if (!planet.demographics) {
        planet.demographics = {
            population: 10, // Default 10 Abstract Bio-Units
            growthRate: 0.0,
            housingCapacity: 10,
            serviceSatisfaction: 100,
            unrestRisk: 0,
            manpowerEfficiency: 1.0
        };
    }
}

export function updatePlanetServices(
    planet: PlanetProduction,
    deltaSeconds: number,
    factionReserves?: Record<string, number>,
    upkeepMult: number = 1
) {
    const defs = loadServiceDefinitions();

    // Reset loop accumulators before applying effects
    let totalHappinessModifier = 0;
    let totalGrowthModifier = 0;
    let totalUnrestRisk = 0;
    let gridEfficiency = 1.0; 

    // 1. Calculate Demand
    // Housing demand = population * 10
    // Healthcare demand = population * 1
    // Food demand = population * 1
    // Energy demand = population * 2 + buildings (abstractly scaled)
    const baseDemand: Record<string, number> = {
        housing: planet.demographics.population * 15,
        healthcare: planet.demographics.population * 5,
        food_distribution: planet.demographics.population * 5,
        energy_grid: planet.demographics.population * 10,
    };

    defs.forEach(def => {
        const state = planet.services[def.id];
        if (!state) return;

        // Civilian infrastructure tracks population growth automatically (until
        // player-controlled service investment exists). Never shrinks.
        state.level = Math.max(state.level, requiredServiceLevel(def, planet.demographics.population));

        // 2. Capacity Calculation
        state.capacity = def.baseCapacity + (state.level * def.scaling.capacityPerLevel);

        // 3. Demand Assignment
        state.demand = baseDemand[def.id] || 0;

        // 4. Upkeep resolution. Costs are per HOUR with linear level scaling —
        // the old per-second exponential (base × mult^level × deltaSeconds)
        // burned a capital's entire 50k credit stock in a single strategic tick,
        // guaranteeing collapse. Credits are paid from the faction treasury
        // (planet stockpile credits never regenerate); physical resources come
        // from the planet stockpile.
        const hours = deltaSeconds / 3600;
        const levelMult = 1 + (def.scaling.upkeepMultiplier - 1) * (state.level - 1);
        let canPayUpkeep = true;
        for (const [res, amount] of Object.entries(def.baseUpkeep)) {
            const cost = amount * levelMult * hours * Math.max(0.1, upkeepMult);
            if (res === 'credits' && factionReserves) {
                if ((factionReserves['CREDITS'] ?? 0) >= cost) {
                    factionReserves['CREDITS'] = (factionReserves['CREDITS'] ?? 0) - cost;
                } else {
                    canPayUpkeep = false;
                }
                continue;
            }
            const key = res as keyof typeof planet.stockpile;
            if ((planet.stockpile[key] || 0) >= cost) {
                planet.stockpile[key] = (planet.stockpile[key] || 0) - cost;
            } else {
                canPayUpkeep = false;
            }
        }

        if (!canPayUpkeep) {
            state.unpaidUpkeepTicks += 1;
            state.efficiency = Math.max(0, state.efficiency - 0.1); 
        } else {
            state.unpaidUpkeepTicks = 0;
            state.efficiency = 1.0;
        }

        // 5. Coverage and Status
        const effectiveCapacity = state.capacity * state.efficiency;
        state.coverageRatio = state.demand > 0 ? effectiveCapacity / state.demand : 1.0;

        if (state.coverageRatio >= 1.0) state.status = 'adequate';
        else if (state.coverageRatio >= 0.75) state.status = 'strained';
        else if (state.coverageRatio >= 0.4) state.status = 'failing';
        else state.status = 'collapsed';

        // 6. Aggregate Effects
        const effects = def.effects[state.status] || {};
        
        if (effects['happiness']) totalHappinessModifier += effects['happiness'];
        if (effects['stability']) totalUnrestRisk += Math.abs(effects['stability']); // Treat neg stability as unrest risk broadly
        if (effects['unrestRisk']) totalUnrestRisk += effects['unrestRisk'];
        if (effects['populationGrowth']) totalGrowthModifier += effects['populationGrowth'];
        
        if (def.id === 'energy_grid' && effects['efficiency']) {
            gridEfficiency = effects['efficiency'];
        }
        
    });

    // 7. Apply to Demographics & Generic Yields
    planet.demographics.serviceSatisfaction = Math.max(0, Math.min(100, 50 + (totalHappinessModifier * 5)));
    planet.demographics.unrestRisk = Math.max(0, Math.min(100, totalUnrestRisk));
    planet.demographics.growthRate = 0.05 + totalGrowthModifier; // 5% baseline abstract growth

    // Apply unrest risk conversion directly to Instability. Scaled per HOUR —
    // the old per-second scaling (deltaSeconds * 0.1) pegged instability at
    // ~100 on the very first strategic tick, drowning every other signal.
    const hours = deltaSeconds / 3600;
    planet.instability = Math.max(0, Math.min(100,
        (planet.instability || 0)
        + totalUnrestRisk * hours * 0.2
        - (totalHappinessModifier > 0 ? hours * 0.5 : 0)
    ));

    // Return the grid efficiency so the `tickProduction` heartbeat knows how to throttle the rest of the planet's yields
    return gridEfficiency;
}
