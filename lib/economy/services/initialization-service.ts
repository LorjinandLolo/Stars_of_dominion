import { GameWorldState } from '../../game-world-state';
import { PlanetProduction, PlanetType as EconomyPlanetType } from '../economy-types';
import { initializePlanetServices } from './service-engine';
import { Planet as ConstructionPlanet, PlanetType as ConstructionPlanetType } from '../../construction/construction-types';
import { CivilizationRegistry } from '../../civilization/registry';
import { homeworldNameFor, homeworldArchetypeTagFor } from '../../galaxy/faction-capitals';
import { BUILDINGS } from '@/data/buildings';

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

    // A capital that names no real system is not a place, and everything seeded
    // into it is an orphan: planet ids are built from this string, so a phantom
    // capital produced four economy planets, four construction planets and a
    // region pointing at a system that does not exist — re-asserted on every
    // strategic tick. Refuse loudly instead of manufacturing 80 dead records.
    if (!world.movement.systems.has(capitalSystemId)) {
        console.error(
            `[InitService] Faction ${factionId} has capital "${capitalSystemId}", which is not a system ` +
            `in this galaxy. Skipping homeworld seeding — fix the capital in lib/galaxy/faction-capitals.ts.`
        );
        return;
    }

    // Who this faction IS, if the civilization is authored. Missing or unknown
    // ids fall through to the generic starting kit below, so an unauthored
    // faction still boots.
    const civ = faction.civilizationId
        ? CivilizationRegistry.getCivilization(faction.civilizationId)
        : undefined;
    const starting = civ?.startingStateEffects;

    /** Authored bonus for one resource, case-insensitive on the authored key. */
    const startingResource = (key: string): number => {
        const table = starting?.startingResources;
        if (!table) return 0;
        const value = table[key] ?? table[key.toLowerCase()] ?? table[key.toUpperCase()];
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    };

    /**
     * The capital's opening buildings. A civilization may name its own, but only
     * ids that exist in the real registry are honoured — the authored lists
     * predate data/buildings.ts and several entries (Auraxian's 'trading_hub')
     * name nothing. A dangling id is reported and skipped rather than silently
     * producing an empty tile.
     */
    const resolveStarterBuildings = (): string[] => {
        const COMMON = ['metal_mine', 'chemical_plant', 'hydroponic_farm', 'habitat_block', 'orbital_shipyard'];
        const authored = starting?.startingBuildings;
        if (!authored?.length) return COMMON;

        const known = new Set(BUILDINGS.map(b => b.id));
        const valid = authored.filter(id => known.has(id));
        const dangling = authored.filter(id => !known.has(id));
        if (dangling.length) {
            console.warn(
                `[InitService] ${civ!.id} lists starting buildings that are not in data/buildings.ts: ` +
                `${dangling.join(', ')} — skipped.`
            );
        }
        // The shipyard is not flavour: without it a faction cannot build ships
        // and can never expand, so it is appended regardless of what was authored.
        const merged = [...valid];
        if (!merged.includes('orbital_shipyard')) merged.push('orbital_shipyard');
        return merged.length > 1 ? merged : COMMON;
    };

    // 2. We want to ensure 4 planets exist in this system: ONE owned capital
    // plus three unowned, colonizable bodies. Every faction starts from a
    // single world — the rest of the home system (and the galaxy beyond it)
    // has to be surveyed and colonized. See lib/exploration/colonize-service.ts.
    const PLANET_DEFINITIONS: { idSuffix: string, type: EconomyPlanetType }[] = [
        { idSuffix: '', type: 'industrial' },    // The Capital
        { idSuffix: '-colony-1', type: 'agricultural' },
        { idSuffix: '-colony-2', type: 'research' },
        { idSuffix: '-colony-3', type: 'fortress' }
    ];

    PLANET_DEFINITIONS.forEach((def, index) => {
        const planetId = `planet-${capitalSystemId}${def.idSuffix}`;

        // Guard on CONSTRUCTION, not economy: the unowned bodies below have no
        // economy record, and guarding on economy would recreate them (owned)
        // on every worker boot.
        if (world.construction.planets.has(planetId)) {
            return; // Already initialized
        }

        // ── Unowned home-system bodies ─────────────────────────────────────
        if (index > 0) {
            const bodyName = `${homeworldNameFor(factionId) ?? `${faction.name} Prime`} ${['II', 'III', 'IV'][index - 1]}`;
            world.construction.planets.set(planetId, {
                id: planetId,
                name: bodyName,
                ownerId: '',
                systemId: capitalSystemId,
                planetType: mapToConstructionType(def.type),
                infrastructureLevel: 0,
                stability: 100,
                happiness: 50,
                specialization: null,
                maxTiles: 8,
                tiles: Array.from({ length: 8 }).map((_, i) => ({
                    tileId: `${planetId}-t${i + 1}`,
                    districtType: 'any',
                    buildingId: null,
                    constructionState: 'empty',
                    constructionCompleteAt: null
                })),
                buildQueue: [],
                activeModifiers: [],
                tags: ['colonizable'],
                population: 0,
                popCapacity: 50,
                popGrowth: 0,
                unrest: 0,
                isOccupied: false,
                demographics: []
            });
            return;
        }

        console.log(`[InitService] Initializing Starting Planet [${planetId}] (${def.type}) for ${factionId} in system ${capitalSystemId}.`);

        // 3. Create the PlanetProduction object (ECONOMY)
        const ecoPlanet: PlanetProduction = {
            planetId: planetId,
            systemId: capitalSystemId,
            factionId: factionId,
            planetType: def.type,
            // The capital carries its authored terrain identity as a tag, which
            // is what generateSurface reads. Without it every homeworld in the
            // game generated `continental` — 'capital' and 'homeworld' are the
            // only hints present, and they match the continental test at the
            // bottom of inferArchetype's chain. Pyrothar had zero volcanic
            // districts. The construction planet shares this array by reference
            // below, so one write covers both records.
            tags: index === 0
                ? ['homeworld', 'settled_core', ...(homeworldArchetypeTagFor(factionId) ? [homeworldArchetypeTagFor(factionId)!] : [])]
                : ['established_colony', 'sector_capital'],
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
            // The capital carries the civilization's authored startingResources
            // on TOP of the common kit, so an authored bonus is a head start
            // rather than a replacement and an unauthored faction is unaffected.
            stockpile: {
                metals: (index === 0 ? 2000 : 500) + (index === 0 ? startingResource('METALS') : 0),
                energy: (index === 0 ? 5000 : 1000) + (index === 0 ? startingResource('ENERGY') : 0),
                food: (index === 0 ? 2000 : 500) + (index === 0 ? startingResource('FOOD') : 0),
                credits: (index === 0 ? 50000 : 1000) + (index === 0 ? startingResource('CREDITS') : 0),
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
            // The capital planet carries the homeworld name the players wrote
            // (Pyrothar, Meatballia Prima, The Solara Shell); colonies stay
            // generic. Falls back to the old "<Faction> Prime" for anyone with
            // no authored homeworld.
            name: index === 0
                ? (homeworldNameFor(factionId) ?? `${faction.name} Prime`)
                : `${faction.name} Sector Col ${index}`,
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
            const starterBuildings = resolveStarterBuildings();

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
            revealStage: 'surveyed',
            lastSeenAt: new Date().toISOString(),
            visibleTags: world.movement.systems.get(capitalSystemId)?.tags || [],
            observedFleetIds: [],
            movementIntentVisible: true
        };
    });

    // 10. Seed the faction's economic region + collapse tracker. Without a
    // region, tickCollapseState iterates an empty map and the whole collapse
    // pillar is a no-op.
    const regionId = `region-${factionId}`;
    if (!world.economy.regions.has(regionId)) {
        world.economy.regions.set(regionId, {
            id: regionId,
            name: `${faction.name} Core Region`,
            systemIds: [capitalSystemId],
            factionId,
            tradeEfficiency: 1,
            collapsePressure: 0,
            collapseStage: 'stable',
            identityDrifting: false,
        });
        world.economy.collapseStates.set(regionId, {
            regionId,
            stage: 'stable',
            cause: '',
            pressure: 0,
        });
    }
}
