import { GameWorldState } from '../../game-world-state';
import { PlanetProduction, PlanetType } from '../economy-types';
import { initializePlanetServices } from './service-engine';

/**
 * Ensures a faction has its home planet initialized in the world state.
 * If the planet doesn't exist in the economy map, it creates a new one 
 * with a standardized "Starting Kit" of resources and infrastructure.
 */
export function initializeFactionHomeWorld(world: GameWorldState, factionId: string) {
    // 1. Locate the faction's defined capital system
    const faction = world.economy.factions.get(factionId);
    if (!faction) {
        console.warn(`[InitService] Cannot initialize homeworld: Faction ${factionId} not found.`);
        return;
    }

    const capitalSystemId = faction.capitalSystemId;
    if (!capitalSystemId || capitalSystemId === 'unknown-capital') {
        console.warn(`[InitService] Faction ${factionId} has no defined capital system.`);
        return;
    }

    // 2. Check if the planet already exists
    // We use the capitalSystemId as the planetId for the primary homeworld in that system
    const planetId = `planet-${capitalSystemId}`;
    if (world.economy.planets.has(planetId)) {
        return; // Already initialized
    }

    console.log(`[InitService] Initializing Homeworld for ${factionId} in system ${capitalSystemId}.`);

    // 3. Create the PlanetProduction object
    const homePlanet: PlanetProduction = {
        planetId: planetId,
        systemId: capitalSystemId,
        factionId: factionId,
        planetType: 'industrial', // Homeworlds start as generic industrial hubs
        tags: ['homeworld', 'settled_core'],
        services: {}, // Will be populated by initializePlanetServices
        demographics: {
            population: 50, // Starting with 50 abstract units (medium density)
            growthRate: 0.05,
            housingCapacity: 60,
            serviceSatisfaction: 100,
            unrestRisk: 0,
            manpowerEfficiency: 1.0
        },
        currentRates: {},
        stockpile: {
            metals: 1000,
            energy: 1000,
            food: 1000,
            credits: 5000
        },
        derived: {
            construction: 1.0,
            military: 0.5,
            research: 0.5,
            cultural: 0.2
        },
        energyLoad: 0,
        energyProduced: 0,
        happiness: 80,
        instability: 0,
        commodityScarcity: false
    };

    // 4. Seed the Data-Driven Services at Level 1 
    initializePlanetServices(homePlanet);

    // 5. Inject into the world state
    world.economy.planets.set(planetId, homePlanet);
}
