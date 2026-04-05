import { GameWorldState } from '../../game-world-state';
import { PlanetProduction, PlanetType } from '../economy-types';
import { initializePlanetServices } from './service-engine';

/**
 * Ensures a faction has its home system initialized in the world state.
 * Creates a "Starting Kit" of 4 planets (1 Capital + 3 Colonies) in the system
 * to ensure robust early-game capacity.
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

    // 2. We want to ensure 4 planets exist in this system
    const PLANET_DEFINITIONS: { idSuffix: string, type: PlanetType }[] = [
        { idSuffix: '', type: 'industrial' },    // The Capital
        { idSuffix: '-colony-1', type: 'agricultural' },
        { idSuffix: '-colony-2', type: 'research' },
        { idSuffix: '-colony-3', type: 'fortress' }
    ];

    PLANET_DEFINITIONS.forEach((def, index) => {
        const planetId = `planet-${capitalSystemId}${def.idSuffix}`;
        
        if (world.economy.planets.has(planetId)) {
            return; // Already initialized
        }

        console.log(`[InitService] Initializing Starting Planet [${planetId}] (${def.type}) for ${factionId} in system ${capitalSystemId}.`);

        // 3. Create the PlanetProduction object
        const planet: PlanetProduction = {
            planetId: planetId,
            systemId: capitalSystemId,
            factionId: factionId,
            planetType: def.type,
            tags: index === 0 ? ['homeworld', 'settled_core'] : ['established_colony', 'sector_capital'],
            services: {}, 
            demographics: {
                population: index === 0 ? 50 : 25, // Starting with 50 for capital, 25 for colonies
                growthRate: 0.05,
                housingCapacity: index === 0 ? 60 : 30,
                serviceSatisfaction: 100,
                unrestRisk: 0,
                manpowerEfficiency: 1.0
            },
            currentRates: {},
            stockpile: {
                metals: index === 0 ? 1000 : 500,
                energy: index === 0 ? 1000 : 500,
                food: index === 0 ? 1000 : 500,
                credits: index === 0 ? 5000 : 1000
            },
            derived: {
                construction: index === 0 ? 1.0 : 0.5,
                military: index === 0 ? 0.5 : 0.2,
                research: index === 0 ? 0.5 : 0.2,
                cultural: index === 0 ? 0.2 : 0.1
            },
            energyLoad: 0,
            energyProduced: 0,
            happiness: 80,
            instability: 0,
            commodityScarcity: false
        };

        // 4. Seed the Data-Driven Services at Level 1 
        initializePlanetServices(planet);

        // 5. Inject into the world state
        world.economy.planets.set(planetId, planet);
    });
}
