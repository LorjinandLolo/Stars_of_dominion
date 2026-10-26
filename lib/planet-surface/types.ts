// lib/planet-surface/types.ts
// Stars of Dominion — planetary surface board model.
//
// Every inhabited planet has a circular surface board of 64 sectors:
// 8 concentric rings × 8 directional wedges. The board is generated
// DETERMINISTICALLY from the planet id, so the client and the worker
// always agree on terrain/regions without storing 64 sectors in the DB.
// Only player-made changes (buildings, later: armies, damage) are stored
// in world state, keyed by sector index.

export const SURFACE_RINGS = 8;
export const SURFACE_WEDGES = 8;
export const SURFACE_SECTOR_COUNT = SURFACE_RINGS * SURFACE_WEDGES; // 64

export type TerrainType =
    | 'plains'
    | 'mountains'
    | 'forest'
    | 'jungle'
    | 'desert'
    | 'ocean'
    | 'frozen'
    | 'toxic'
    | 'volcanic'
    | 'urban'
    | 'ruins';

/** Broad planet archetype that biases terrain distribution. */
export type PlanetArchetype =
    | 'continental'
    | 'arid'
    | 'oceanic'
    | 'frozen'
    | 'volcanic'
    | 'toxic'
    | 'gaia'
    /** Highland/fortress world: ridges and canyon passes, little open water. */
    | 'montane'
    /** Wetland: standing water threaded through dense growth. Gor'Zhul. */
    | 'swamp'
    /** Canopy deathworld — dense growth, little open water. Rrriiaa. */
    | 'jungle'
    /** Wholly built world or megastructure interior. The Solara Shell. */
    | 'arcology';

/**
 * Runtime list of every archetype, for validating an authored value.
 *
 * The union alone is compile-time only, and archetypes arrive from a planet TAG
 * — a string that survives a DB round trip. Without this check a typo'd tag
 * returns a bogus archetype and ARCHETYPE_TERRAIN[bogus] is undefined, which
 * fails deep inside terrain generation rather than at the boundary.
 */
export const PLANET_ARCHETYPES: readonly PlanetArchetype[] = [
    'continental', 'arid', 'oceanic', 'frozen', 'volcanic', 'toxic', 'gaia',
    'montane', 'swamp', 'jungle', 'arcology',
];

export type RegionKind =
    | 'capital'
    | 'urban'
    | 'industrial'
    | 'agricultural'
    | 'mining'
    | 'coastal'
    | 'military'
    | 'research'
    | 'wilderness'
    | 'frontier';

export interface SocialGroupSeed {
    id: string;
    name: string;       // e.g. "Miners", "Frontier Settlers"
    share: number;      // 0..1 of the region's population
    loyalty: number;    // 0..100 baseline attitude toward the government
    militancy: number;  // 0..100 baseline willingness to resist/fight
}

export interface SurfaceSector {
    /** 0..63 — the stable key used by orders and world state. */
    index: number;
    /**
     * Seed-point position in the unit disc (-1..1). The client derives the
     * district's Voronoi polygon from this; the worker only needs terrain and
     * adjacency, so polygons never have to agree byte-for-byte — the seeds do.
     */
    cx: number;
    cy: number;
    /** Radial band 0 (capital core) .. 7 (frontier perimeter) — derived from |seed|. */
    ring: number;
    /** Directional octant 0 (north), clockwise — derived from seed angle. */
    wedge: number;
    terrain: TerrainType;
    regionId: string;
    /** 0..100 — how hospitable the sector is to habitation/industry. */
    habitability: number;
    /** True for the natural defensive chokepoints (mountain passes etc.). */
    chokepoint: boolean;
    /** Indexes of the 3 nearest neighbouring sectors (approximate adjacency). */
    neighbors: number[];
    /**
     * A river runs through it (lib/planet-surface/generator.ts carveRivers):
     * fresh water for the people, and a line for a defender to hold.
     */
    river?: boolean;
    /** Where water flows on to from here (a river district or the sea): set on river districts and on the mountain spring a river rises in. */
    riverTo?: number;
    /**
     * How much water passes through, 0..1 of the world's biggest river (the
     * square root of the gathered rain, so width reads naturally). Drawing
     * only: the river-district rules do not care how big the river is.
     */
    riverFlow?: number;
    /** Water pooled in a basin on its way down: drawn as a lake, still a river district. */
    lake?: boolean;
    /**
     * What this district was before the cities grew (generator growCities),
     * set only where that moved it. Legacy buildings with no stored district
     * are auto-placed by terrain (autoPlaceBuilding), and must keep landing
     * where they always did.
     */
    placementTerrain?: TerrainType;
    /** Part of a town away from the capital city (growCities): a river crossing or a port. */
    town?: boolean;
    /** What is in the ground here, if anything worth digging for. */
    deposit?: DepositKind;
}

/**
 * District-level deposits. Where the body's deposit tags
 * (lib/exploration/body-generator.ts) actually are on the map, plus the
 * common ore seams every rocky world has.
 */
export type DepositKind = 'ore' | 'rare_minerals' | 'geothermal' | 'ice' | 'fertile' | 'relic';

export interface SurfaceRegion {
    id: string;
    name: string;         // e.g. "Northern Mining Frontier"
    kind: RegionKind;
    sectorIndexes: number[];
    color: string;        // accent used for soft region borders on the board
    socialGroups: SocialGroupSeed[]; // 2-3 dominant groups
}

export interface PlanetSurface {
    planetId: string;
    archetype: PlanetArchetype;
    sectors: SurfaceSector[];   // always 64, index-ordered
    regions: SurfaceRegion[];   // 8-12
}

export const sectorIndex = (ring: number, wedge: number) => ring * SURFACE_WEDGES + wedge;

export const WEDGE_NAMES = ['Northern', 'Northeastern', 'Eastern', 'Southeastern', 'Southern', 'Southwestern', 'Western', 'Northwestern'] as const;
