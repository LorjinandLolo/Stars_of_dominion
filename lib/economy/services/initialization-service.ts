import { GameWorldState } from '../../game-world-state';
import { PlanetProduction, PlanetType as EconomyPlanetType } from '../economy-types';
import { initializePlanetServices } from './service-engine';
import { Planet as ConstructionPlanet, PlanetType as ConstructionPlanetType } from '../../construction/construction-types';

/**
 * Maps Economy planet types to Construction system types for UI/visual consistency.
 */
function mapToConstructionType(ecoType: EconomyPlanetType): ConstructionPlanetType {
    switch (ecoType) {
        case 'industrial': return 'industrial';
        case 'agricultural': return 'agricultural';
        case 'research': return 'research';
        case 'fortress': return 'fortress';
        default: return 'standard';
    }
}

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
    const PLANET_DEFINITIONS: { idSuffix: string, type: EconomyPlanetType }[] = [
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

        // 3. Create the PlanetProduction object (ECONOMY)
        const ecoPlanet: PlanetProduction = {
            planetId: planetId,
            systemId: capitalSystemId,
            factionId: factionId,
            planetType: def.type,
            tags: index === 0 ? ['homeworld', 'settled_core'] : ['established_colony', 'sector_capital'],
            services: {}, 
            demographics: {
                population: index === 0 ? 150 : 50, // Higher starting pop to allow immediate expansion
                growthRate: 0.05,
                housingCapacity: index === 0 ? 200 : 100,
                serviceSatisfaction: 100,
                unrestRisk: 0,
                manpowerEfficiency: 1.0
            },
            currentRates: {},
            stockpile: {
                metals: index === 0 ? 2000 : 500, // Boosted starting metals
                energy: index === 0 ? 5000 : 1000,
                food: index === 0 ? 2000 : 500,
                credits: index === 0 ? 50000 : 1000 // Boosted starting credits
            },
            derived: {
                construction: index === 0 ? 1.5 : 0.8,
                military: index === 0 ? 1.0 : 0.5,
                research: index === 0 ? 1.0 : 0.5,
                cultural: index === 0 ? 1.0 : 0.5
            },
            energyLoad: 0,
            energyProduced: 0,
            happiness: 85,
            instability: 0,
            commodityScarcity: false
        };

        // 4. Seed the Data-Driven Services at Level 1 
        initializePlanetServices(ecoPlanet);

        // 5. Inject into Economy state
        world.economy.planets.set(planetId, ecoPlanet);

        // 6. Create matching CONSTRUCTION Planet
        const constrPlanet: ConstructionPlanet = {
            id: planetId,
            name: index === 0 ? `${faction.name} Prime` : `${faction.name} Sector Col ${index}`,
            ownerId: factionId,
            systemId: capitalSystemId,
            planetType: index === 0 ? 'capital' : mapToConstructionType(def.type),
            infrastructureLevel: index === 0 ? 2 : 1, // Capital starts at Level 2 for better buildings
            stability: 90,
            happiness: 85,
            specialization: null,
            maxTiles: index === 0 ? 12 : 8,
            tiles: Array.from({ length: index === 0 ? 12 : 8 }).map((_, i) => ({
                tileId: `${planetId}-t${i+1}`,
                districtType: 'any',
                buildingId: null,
                constructionState: 'empty',
                constructionCompleteAt: null
            })),
            buildQueue: [],
            activeModifiers: [],
            tags: ecoPlanet.tags,
            population: ecoPlanet.demographics.population,
            popCapacity: ecoPlanet.demographics.housingCapacity,
            popGrowth: ecoPlanet.demographics.growthRate,
            unrest: 0,
            isOccupied: false,
            demographics: [
                { speciesId: 'species-human', name: 'Primary Species', percentage: 100, socialClass: 'Citizen' }
            ]
        };

        // 7. Seed Capital Infrastructure (Index 0 Only)
        if (index === 0) {
            const starterBuildings = [
                'metal_mine',
                'chemical_plant',
                'hydroponic_farm',
                'habitat_block',
                'orbital_shipyard' // Crucial for expansion
            ];

            starterBuildings.forEach((bId, offset) => {
                if (constrPlanet.tiles[offset]) {
                    constrPlanet.tiles[offset].buildingId = bId;
                    constrPlanet.tiles[offset].constructionState = 'active';
                }
            });
        }

        // 8. Inject into Construction state
        world.construction.planets.set(planetId, constrPlanet);
        
        // 9. Reveal the system for the faction (Redundancy check)
        if (!world.movement.factionVisibility.has(factionId)) {
            world.movement.factionVisibility.set(factionId, {});
        }
        const factionVis = world.movement.factionVisibility.get(factionId)!;
        factionVis[capitalSystemId] = {
            systemId: capitalSystemId,
            revealStage: 'surveyed',
            lastScanTick: 0
        };
    });
}
