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
    | 'montane';

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
}

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
