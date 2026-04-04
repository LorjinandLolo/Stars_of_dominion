import fs from 'fs';
import path from 'path';
import { PlanetProduction, PlanetServiceState, ServiceStatus } from '../economy-types';

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

let serviceDefs: ServiceDefinition[] = [];

export function loadServiceDefinitions() {
    if (serviceDefs.length > 0) return serviceDefs;
    try {
        const filePath = path.join(process.cwd(), 'lib', 'economy', 'services', 'definitions.json');
        const raw = fs.readFileSync(filePath, 'utf-8');
        serviceDefs = JSON.parse(raw);
    } catch (e) {
        console.error('[ServiceEngine] Failed to load service definitions.json', e);
    }
    return serviceDefs;
}

export function initializePlanetServices(planet: PlanetProduction) {
    const defs = loadServiceDefinitions();
    // Start with level 1 of each core service so the planet doesn't instantly die
    defs.forEach(def => {
        planet.services[def.id] = {
            serviceId: def.id,
            level: 1,
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

export function updatePlanetServices(planet: PlanetProduction, deltaSeconds: number) {
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

        // 2. Capacity Calculation
        state.capacity = def.baseCapacity + (state.level * def.scaling.capacityPerLevel);

        // 3. Demand Assignment
        state.demand = baseDemand[def.id] || 0;

        // 4. Upkeep resolution (cost strictly per second, evaluated every tick)
        let canPayUpkeep = true;
        for (const [res, amount] of Object.entries(def.baseUpkeep)) {
            const key = res as keyof typeof planet.stockpile;
            const cost = amount * Math.pow(def.scaling.upkeepMultiplier, state.level) * deltaSeconds;
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

    // Apply exact unrest risk conversion directly to Instability
    planet.instability = Math.max(0, Math.min(100, (planet.instability || 0) + (totalUnrestRisk * deltaSeconds * 0.1) - (totalHappinessModifier > 0 ? deltaSeconds * 0.1 : 0)));

    // Return the grid efficiency so the `tickProduction` heartbeat knows how to throttle the rest of the planet's yields
    return gridEfficiency;
}
