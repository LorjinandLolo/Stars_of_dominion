// lib/exploration/body-generator.ts
// Deterministic planetary bodies for surveyed systems. Before a system is
// surveyed it holds nothing; the first completed survey materializes its bodies
// into construction state (unowned, colonizable) and movement state (anomaly
// attachment targets). Generation is seeded on the system id alone, so every
// faction that surveys the same system finds the identical bodies — same
// determinism contract as the planet-surface Voronoi layer.

import type { GameWorldState } from '../game-world-state';
import type { PlanetNode } from '../movement/types';
import type { Planet as ConstructionPlanet, PlanetType } from '../construction/construction-types';
import { RNG, seedFromString } from '../trade-system/rng';

/** Weighted body archetypes. `colonizable` bodies accept PLANET_CLAIM. */
const BODY_TABLE: Array<{
    type: PlanetType;
    weight: number;
    colonizable: boolean;
    maxTiles: number;
    tags: string[];
}> = [
    { type: 'standard',   weight: 22, colonizable: true,  maxTiles: 8, tags: ['colonizable'] },
    { type: 'ocean',      weight: 10, colonizable: true,  maxTiles: 8, tags: ['colonizable', 'archetype:oceanic'] },
    { type: 'desert',     weight: 10, colonizable: true,  maxTiles: 6, tags: ['colonizable', 'archetype:desert'] },
    { type: 'arctic',     weight: 8,  colonizable: true,  maxTiles: 6, tags: ['colonizable', 'archetype:arctic'] },
    // Dead matter: not colonizable, but real — the raw material the Nexulan
    // "refine dead matter" mechanic (and any future extraction) has been
    // waiting for. Tagged so a consumer can find them by query.
    { type: 'moon',       weight: 16, colonizable: false, maxTiles: 4, tags: ['dead_matter', 'barren'] },
    { type: 'megaplanet', weight: 6,  colonizable: false, maxTiles: 12, tags: ['dead_matter', 'crushing_gravity'] },
    { type: 'tomb',       weight: 4,  colonizable: false, maxTiles: 6, tags: ['dead_matter', 'relic_site'] },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

function pickWeighted(rng: RNG): (typeof BODY_TABLE)[number] {
    const total = BODY_TABLE.reduce((s, e) => s + e.weight, 0);
    let roll = rng.next() * total;
    for (const entry of BODY_TABLE) {
        roll -= entry.weight;
        if (roll <= 0) return entry;
    }
    return BODY_TABLE[0];
}

/** True if any construction planet already sits in this system. */
export function systemHasBodies(world: GameWorldState, systemId: string): boolean {
    for (const p of world.construction.planets.values()) {
        if (p.systemId === systemId) return true;
    }
    return false;
}

/**
 * Materialize the bodies of a surveyed system. Idempotent: a system that
 * already holds any construction planet (homeworld kits included) is left
 * untouched. Returns the construction planets created.
 */
export function materializeSystemBodies(world: GameWorldState, systemId: string): ConstructionPlanet[] {
    const system = world.movement.systems.get(systemId);
    if (!system) return [];
    if (systemHasBodies(world, systemId)) return [];

    const rng = new RNG(seedFromString(`bodies|${systemId}`));
    // 0–3 bodies; roughly a fifth of systems are genuinely empty space.
    const roll = rng.next();
    const count = roll < 0.2 ? 0 : roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3;
    const created: ConstructionPlanet[] = [];

    for (let i = 0; i < count; i++) {
        const body = pickWeighted(rng);
        const planetId = `planet-${systemId}-body-${i + 1}`;
        const name = `${system.name} ${ROMAN[i] ?? String(i + 1)}`;

        const constrPlanet: ConstructionPlanet = {
            id: planetId,
            name,
            ownerId: '',
            systemId,
            planetType: body.type,
            infrastructureLevel: 0,
            stability: 100,
            happiness: 50,
            specialization: null,
            maxTiles: body.maxTiles,
            tiles: Array.from({ length: body.maxTiles }).map((_, t) => ({
                tileId: `${planetId}-t${t + 1}`,
                districtType: 'any' as const,
                buildingId: null,
                constructionState: 'empty' as const,
                constructionCompleteAt: null,
            })),
            buildQueue: [],
            activeModifiers: [],
            tags: [...body.tags],
            population: 0,
            popCapacity: body.colonizable ? 50 : 0,
            popGrowth: 0,
            unrest: 0,
            isOccupied: false,
            demographics: [],
        };
        world.construction.planets.set(planetId, constrPlanet);

        const planetNode: PlanetNode = {
            id: planetId,
            systemId,
            name,
            tags: [...body.tags],
            tagReveal: { allTags: [...body.tags], revealedAt: { surveyed: [...body.tags] } },
            anomalyIds: [],
            frontierClaims: [],
        };
        world.movement.planets.set(planetId, planetNode);
        created.push(constrPlanet);
    }

    if (created.length > 0) {
        console.log(`[Exploration] Survey of ${system.name} charted ${created.length} bod${created.length === 1 ? 'y' : 'ies'}.`);
    }
    return created;
}
