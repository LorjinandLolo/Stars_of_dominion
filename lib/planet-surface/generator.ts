// lib/planet-surface/generator.ts
// Deterministic planetary surface generation — Voronoi-district edition.
//
// generateSurface(planetId, hints) is a PURE function: same inputs → same
// board, on the client and in the worker, with nothing persisted. Player
// changes (buildings etc.) live in world state keyed by sector index.
//
// The board is 64 districts seeded by a jittered phyllotaxis spiral in the
// unit disc: index 0 sits at the planet's heart and indexes grow outward, so
// low indexes are the settled core and high indexes the frontier perimeter.
// The client draws organic Voronoi cells from these seeds (components/planet/
// surfaceGeometry); the worker only ever needs terrain + adjacency, which are
// derived here from the seeds alone — no geometry library in this module.

import {
    PlanetSurface,
    SurfaceSector,
    SurfaceRegion,
    TerrainType,
    PlanetArchetype,
    RegionKind,
    SocialGroupSeed,
    SURFACE_SECTOR_COUNT,
    SURFACE_WEDGES,
    SURFACE_RINGS,
    WEDGE_NAMES,
} from './types';

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

function hashString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T,>(rand: () => number, arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

// ─── Archetype inference ─────────────────────────────────────────────────────

/** Map the game's loose planet type strings/tags onto a terrain archetype. */
export function inferArchetype(planetId: string, typeHint?: string, tags?: string[]): PlanetArchetype {
    const hint = `${typeHint ?? ''} ${(tags ?? []).join(' ')}`.toLowerCase();
    if (/ocean|water|aquatic/.test(hint)) return 'oceanic';
    if (/ice|frozen|arctic|tundra/.test(hint)) return 'frozen';
    if (/desert|arid|dune/.test(hint)) return 'arid';
    if (/volcan|lava|molten/.test(hint)) return 'volcanic';
    if (/toxic|poison|corros/.test(hint)) return 'toxic';
    if (/gaia|paradise|eden|resort/.test(hint)) return 'gaia';
    if (/tomb|dead|barren/.test(hint)) return 'arid';
    // Fortress worlds are highland worlds: the defensibility players buy with
    // the Fortress World specialization is written into the terrain itself.
    if (/fortress|fortified|bastion|citadel|redoubt/.test(hint)) return 'montane';
    if (/terran|continental|temperate|habitable|capital|homeworld/.test(hint)) return 'continental';
    // No usable hint: derive one deterministically, weighted toward livable worlds.
    const roll = mulberry32(hashString(planetId + ':arch'))();
    if (roll < 0.40) return 'continental';
    if (roll < 0.55) return 'arid';
    if (roll < 0.68) return 'oceanic';
    if (roll < 0.80) return 'frozen';
    if (roll < 0.88) return 'volcanic';
    if (roll < 0.95) return 'toxic';
    return 'gaia';
}

// Weighted terrain pools per archetype (blob seeds draw from these).
// Geography identity per class: continental worlds are 70-80% LAND (seas are
// features, not the default); ocean worlds invert that; frozen worlds carry
// ice sheets instead of open water; deserts get scattered lakes at most.
const ARCHETYPE_TERRAIN: Record<PlanetArchetype, Array<[TerrainType, number]>> = {
    continental: [['plains', 28], ['forest', 21], ['mountains', 14], ['ocean', 23], ['jungle', 8], ['desert', 7], ['frozen', 5]],
    arid:        [['desert', 40], ['plains', 20], ['mountains', 22], ['ocean', 6], ['volcanic', 6], ['ruins', 6]],
    oceanic:     [['ocean', 52], ['plains', 15], ['forest', 10], ['jungle', 11], ['mountains', 7], ['frozen', 5]],
    frozen:      [['frozen', 52], ['mountains', 22], ['plains', 10], ['ocean', 4], ['forest', 6], ['ruins', 6]],
    volcanic:    [['volcanic', 37], ['mountains', 27], ['desert', 15], ['plains', 10], ['toxic', 9], ['ruins', 2]],
    toxic:       [['toxic', 42], ['desert', 18], ['mountains', 16], ['volcanic', 12], ['plains', 10], ['ruins', 2]],
    gaia:        [['plains', 26], ['forest', 25], ['jungle', 15], ['ocean', 21], ['mountains', 12], ['ruins', 6]],
    montane:     [['mountains', 46], ['plains', 16], ['frozen', 12], ['forest', 11], ['desert', 8], ['ocean', 4], ['ruins', 3]],
};

// Blob size modifier per terrain and archetype family: water on land-worlds
// forms lakes and inland seas (small pull); water on ocean worlds forms real
// oceans (large pull).
function terrainPullModifier(terrain: TerrainType, archetype: PlanetArchetype): number {
    if (terrain === 'ocean') return archetype === 'oceanic' ? 1.45 : archetype === 'montane' ? 0.5 : 0.95;
    if (terrain === 'frozen' && archetype === 'frozen') return 1.3; // ice sheets
    // Highland ranges run in long chains; the valleys between them stay small,
    // which is what turns them into passes.
    if (archetype === 'montane') return terrain === 'mountains' ? 1.35 : 0.75;
    return 1;
}

const TERRAIN_HABITABILITY: Record<TerrainType, number> = {
    plains: 85, forest: 75, jungle: 60, urban: 95, ocean: 25,
    mountains: 45, desert: 40, frozen: 30, toxic: 15, volcanic: 20, ruins: 55,
};

function weightedPick(rand: () => number, pool: Array<[TerrainType, number]>): TerrainType {
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let roll = rand() * total;
    for (const [t, w] of pool) {
        roll -= w;
        if (roll <= 0) return t;
    }
    return pool[0][0];
}

// ─── Seed points ─────────────────────────────────────────────────────────────
// Jittered phyllotaxis spiral: even coverage of the disc with zero iteration,
// fully deterministic, and index order == radial order (0 = core).

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface SeedPoint { x: number; y: number; nominalR: number }

function generateSeeds(rand: () => number): SeedPoint[] {
    const seeds: SeedPoint[] = [];
    for (let i = 0; i < SURFACE_SECTOR_COUNT; i++) {
        const nominalR = Math.sqrt((i + 0.5) / SURFACE_SECTOR_COUNT);
        const r = Math.min(0.97, nominalR * 0.94 + (rand() - 0.5) * 0.05);
        const theta = i * GOLDEN_ANGLE + (rand() - 0.5) * 0.5;
        seeds.push({ x: r * Math.cos(theta), y: r * Math.sin(theta), nominalR });
    }
    return seeds;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

/** Wedge octant for a point: 0 = north, clockwise (screen coords, y down). */
function wedgeOf(x: number, y: number): number {
    // atan2 with north at -y (screen up), clockwise positive.
    const ang = Math.atan2(x, -y); // 0 at north, +π/2 at east
    const norm = (ang + Math.PI * 2) % (Math.PI * 2);
    return Math.round(norm / (Math.PI * 2 / SURFACE_WEDGES)) % SURFACE_WEDGES;
}

// ─── Terrain generation ─────────────────────────────────────────────────────

function generateTerrain(rand: () => number, archetype: PlanetArchetype, seeds: SeedPoint[], neighbors: number[][], landBias: boolean): TerrainType[] {
    const pool = ARCHETYPE_TERRAIN[archetype];

    // Seed 9-12 terrain blobs at random districts; every district takes the
    // terrain of its nearest blob (euclidean on seed points → organic patches).
    const blobCount = 9 + Math.floor(rand() * 4);
    const blobs: Array<{ x: number; y: number; terrain: TerrainType; pull: number }> = [];
    for (let i = 0; i < blobCount; i++) {
        const at = seeds[Math.floor(rand() * seeds.length)];
        const terrain = weightedPick(rand, pool);
        // Capitals/homeworlds are showcase worlds: their seas shrink to
        // coastal waters so the settled continent dominates the view.
        const bias = landBias && terrain === 'ocean' ? 0.32 : 1;
        blobs.push({
            x: at.x, y: at.y,
            terrain,
            pull: (0.75 + rand() * 0.6) * terrainPullModifier(terrain, archetype) * bias,
        });
    }

    const terrain: TerrainType[] = seeds.map(s => {
        let best = blobs[0];
        let bestD = Infinity;
        for (const b of blobs) {
            const d = dist(s, b) / b.pull;
            if (d < bestD) { bestD = d; best = b; }
        }
        return best.terrain;
    });

    // Capital core: the innermost district is always settled ground. Make the
    // heart urban along with its most hospitable neighbours.
    terrain[0] = 'urban';
    const coreNeighbors = [...neighbors[0]].sort(
        (a, b) => TERRAIN_HABITABILITY[terrain[b]] - TERRAIN_HABITABILITY[terrain[a]]
    );
    for (const n of coreNeighbors.slice(0, 3)) terrain[n] = 'urban';

    return terrain;
}

// ─── Region generation ──────────────────────────────────────────────────────

const REGION_KIND_BY_TERRAIN: Partial<Record<TerrainType, RegionKind>> = {
    urban: 'urban',
    mountains: 'mining',
    volcanic: 'mining',
    plains: 'agricultural',
    forest: 'wilderness',
    jungle: 'wilderness',
    ocean: 'coastal',
    frozen: 'frontier',
    desert: 'frontier',
    toxic: 'frontier',
    ruins: 'research',
};

const REGION_COLORS: Record<RegionKind, string> = {
    capital: '#facc15',
    urban: '#e2e8f0',
    industrial: '#f97316',
    agricultural: '#84cc16',
    mining: '#a78bfa',
    coastal: '#38bdf8',
    military: '#f87171',
    research: '#22d3ee',
    wilderness: '#4ade80',
    frontier: '#94a3b8',
};

const REGION_NOUN: Record<RegionKind, string[]> = {
    capital: ['Capital District'],
    urban: ['Metropolitan Belt', 'Urban Sprawl', 'City Reaches'],
    industrial: ['Industrial Basin', 'Foundry Belt'],
    agricultural: ['Agricultural Belt', 'Grain Reaches', 'Pastoral Plains'],
    mining: ['Mining Frontier', 'Ore Highlands', 'Deep Veins'],
    coastal: ['Coastal Territory', 'Tidal Reaches', 'Archipelago'],
    military: ['Military Zone', 'Garrison District'],
    research: ['Ruin Fields', 'Survey Zone'],
    wilderness: ['Wilderness', 'Deep Woods', 'Untamed Reaches'],
    frontier: ['Frontier', 'Badlands', 'Outlands'],
};

interface SocialTemplate { name: string; loyalty: [number, number]; militancy: [number, number] }
const REGION_SOCIAL: Record<RegionKind, SocialTemplate[]> = {
    capital: [
        { name: 'Administrators', loyalty: [70, 95], militancy: [5, 20] },
        { name: 'Political Elites', loyalty: [60, 90], militancy: [10, 30] },
        { name: 'Service Workers', loyalty: [40, 70], militancy: [15, 40] },
    ],
    urban: [
        { name: 'Industrial Workers', loyalty: [40, 70], militancy: [25, 55] },
        { name: 'Merchants', loyalty: [50, 75], militancy: [10, 25] },
        { name: 'Dissidents', loyalty: [10, 35], militancy: [40, 75] },
    ],
    industrial: [
        { name: 'Industrial Workers', loyalty: [40, 70], militancy: [30, 60] },
        { name: 'Engineers', loyalty: [55, 80], militancy: [10, 30] },
    ],
    agricultural: [
        { name: 'Agricultural Communities', loyalty: [55, 85], militancy: [15, 35] },
        { name: 'Rural Traditionalists', loyalty: [45, 75], militancy: [20, 45] },
    ],
    mining: [
        { name: 'Miners', loyalty: [35, 65], militancy: [35, 65] },
        { name: 'Frontier Settlers', loyalty: [30, 60], militancy: [30, 60] },
        { name: 'Separatists', loyalty: [5, 30], militancy: [50, 85] },
    ],
    coastal: [
        { name: 'Merchants', loyalty: [50, 80], militancy: [10, 25] },
        { name: 'Fishing Communities', loyalty: [50, 75], militancy: [15, 35] },
    ],
    military: [
        { name: 'Military Families', loyalty: [70, 95], militancy: [50, 80] },
        { name: 'Veterans', loyalty: [60, 85], militancy: [45, 75] },
    ],
    research: [
        { name: 'Scientists', loyalty: [55, 80], militancy: [5, 20] },
        { name: 'Specialists', loyalty: [50, 80], militancy: [5, 25] },
    ],
    wilderness: [
        { name: 'Settlers', loyalty: [35, 65], militancy: [25, 55] },
        { name: 'Reclusive Communities', loyalty: [20, 50], militancy: [30, 60] },
    ],
    frontier: [
        { name: 'Frontier Settlers', loyalty: [25, 55], militancy: [35, 65] },
        { name: 'Migrant Labourers', loyalty: [30, 60], militancy: [25, 55] },
        { name: 'Separatists', loyalty: [5, 30], militancy: [50, 85] },
    ],
};

function generateRegions(
    rand: () => number,
    terrain: TerrainType[],
    seeds: SeedPoint[],
): { regions: SurfaceRegion[]; regionOf: string[] } {
    // The capital region: every urban district in the settled core.
    const capitalSectors: number[] = [];
    for (let i = 0; i < SURFACE_SECTOR_COUNT; i++) {
        if (terrain[i] === 'urban' && seeds[i].nominalR < 0.45) capitalSectors.push(i);
    }
    if (!capitalSectors.length) capitalSectors.push(0);
    const capitalSet = new Set(capitalSectors);

    // Seed 7-9 region centers on the remaining board, reasonably spread out.
    const centerCount = 7 + Math.floor(rand() * 3);
    const centers: Array<{ x: number; y: number }> = [];
    let guard = 0;
    while (centers.length < centerCount && guard++ < 300) {
        const at = Math.floor(rand() * SURFACE_SECTOR_COUNT);
        if (capitalSet.has(at)) continue;
        const p = seeds[at];
        if (centers.some(c => dist(p, c) < 0.34)) continue;
        centers.push({ x: p.x, y: p.y });
    }

    const regionOf: string[] = new Array(SURFACE_SECTOR_COUNT).fill('');
    const memberships: number[][] = centers.map(() => []);
    for (let i = 0; i < SURFACE_SECTOR_COUNT; i++) {
        if (capitalSet.has(i)) { regionOf[i] = 'region-capital'; continue; }
        let best = 0, bestD = Infinity;
        centers.forEach((c, ci) => {
            const d = dist(seeds[i], c);
            if (d < bestD) { bestD = d; best = ci; }
        });
        memberships[best].push(i);
        regionOf[i] = `region-${best}`;
    }

    const usedNames = new Set<string>();
    const regions: SurfaceRegion[] = [];

    regions.push({
        id: 'region-capital',
        name: 'Capital District',
        kind: 'capital',
        sectorIndexes: capitalSectors,
        color: REGION_COLORS.capital,
        socialGroups: buildSocialGroups(rand, 'capital'),
    });

    memberships.forEach((sectorIdxs, ci) => {
        if (!sectorIdxs.length) return;
        const counts = new Map<RegionKind, number>();
        let rSum = 0;
        for (const idx of sectorIdxs) {
            const kind = REGION_KIND_BY_TERRAIN[terrain[idx]] ?? 'wilderness';
            counts.set(kind, (counts.get(kind) ?? 0) + 1);
            rSum += seeds[idx].nominalR;
        }
        let kind: RegionKind = 'wilderness';
        let max = -1;
        for (const [k, n] of counts.entries()) {
            if (n > max) { max = n; kind = k; }
        }
        const avgR = rSum / sectorIdxs.length;
        // One region per planet becomes the military zone; deterministic pick.
        if (ci === Math.floor(centers.length / 2) && avgR > 0.5) kind = 'military';
        if (kind === 'agricultural' && avgR > 0.8) kind = 'frontier';

        // Name: directional prefix from the mean angle of member seeds.
        const ax = sectorIdxs.reduce((s, i) => s + seeds[i].x, 0);
        const ay = sectorIdxs.reduce((s, i) => s + seeds[i].y, 0);
        let wedgeAvg = wedgeOf(ax, ay);
        let name = `${WEDGE_NAMES[wedgeAvg]} ${pick(rand, REGION_NOUN[kind])}`;
        let bump = 0;
        while (usedNames.has(name) && bump < SURFACE_WEDGES) {
            wedgeAvg = (wedgeAvg + 1) % SURFACE_WEDGES;
            name = `${WEDGE_NAMES[wedgeAvg]} ${pick(rand, REGION_NOUN[kind])}`;
            bump++;
        }
        usedNames.add(name);

        regions.push({
            id: `region-${ci}`,
            name,
            kind,
            sectorIndexes: sectorIdxs,
            color: REGION_COLORS[kind],
            socialGroups: buildSocialGroups(rand, kind),
        });
    });

    return { regions, regionOf };
}

function buildSocialGroups(rand: () => number, kind: RegionKind): SocialGroupSeed[] {
    const templates = REGION_SOCIAL[kind];
    const count = Math.min(templates.length, 2 + (rand() < 0.5 ? 1 : 0));
    const chosen = templates.slice(0, count);
    let remaining = 1;
    return chosen.map((t, i) => {
        const share = i === chosen.length - 1 ? remaining : Math.min(remaining, 0.35 + rand() * 0.3);
        remaining = Math.max(0, remaining - share);
        return {
            id: t.name.toLowerCase().replace(/\s+/g, '-'),
            name: t.name,
            share: Math.round(share * 100) / 100,
            loyalty: Math.round(t.loyalty[0] + rand() * (t.loyalty[1] - t.loyalty[0])),
            militancy: Math.round(t.militancy[0] + rand() * (t.militancy[1] - t.militancy[0])),
        };
    });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const surfaceCache = new Map<string, PlanetSurface>();

export function generateSurface(planetId: string, typeHint?: string, tags?: string[]): PlanetSurface {
    // Tags participate in archetype inference, so they MUST be in the cache
    // key — otherwise a long-running worker whose planet gained a tag would
    // keep serving a stale board while fresh clients compute a new one.
    const cacheKey = `${planetId}|${typeHint ?? ''}|${(tags ?? []).join(',')}`;
    const cached = surfaceCache.get(cacheKey);
    if (cached) return cached;

    const archetype = inferArchetype(planetId, typeHint, tags);
    const rand = mulberry32(hashString(planetId + ':surface'));

    const seeds = generateSeeds(rand);

    // Approximate adjacency: each district's 3 nearest neighbours.
    const neighbors: number[][] = seeds.map((s, i) =>
        seeds
            .map((o, j) => ({ j, d: i === j ? Infinity : dist(s, o) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 3)
            .map(n => n.j)
    );

    const landBias = /capital|homeworld/i.test(typeHint ?? '');
    const terrain = generateTerrain(rand, archetype, seeds, neighbors, landBias);
    const { regions, regionOf } = generateRegions(rand, terrain, seeds);

    const rough = (t: TerrainType) => t === 'mountains' || t === 'volcanic' || t === 'ocean';
    const passable = (t: TerrainType) => t === 'plains' || t === 'desert' || t === 'forest' || t === 'urban';
    // A chokepoint is where movement is FORCED, so it must be rare — deep
    // interior mountains are just wall, not a pass.
    const isChokepoint = (i: number): boolean => {
        const t = terrain[i];
        const walls = neighbors[i].filter(n => terrain[n] === 'mountains' || terrain[n] === 'volcanic').length;
        const open = neighbors[i].filter(n => passable(terrain[n])).length;
        // Range shoulder: mountain at the EDGE of a massif, overlooking open
        // ground — the position that commands the approach.
        if (t === 'mountains') return walls >= 1 && open === 1;
        // Valley pass: open ground almost entirely hemmed in by ranges.
        if (passable(t)) return walls >= neighbors[i].length - 1 && walls >= 2;
        return false;
    };
    const sectors: SurfaceSector[] = seeds.map((s, i) => ({
        index: i,
        cx: s.x,
        cy: s.y,
        ring: Math.min(SURFACE_RINGS - 1, Math.floor(s.nominalR * SURFACE_RINGS)),
        wedge: wedgeOf(s.x, s.y),
        terrain: terrain[i],
        regionId: regionOf[i],
        habitability: TERRAIN_HABITABILITY[terrain[i]],
        chokepoint: isChokepoint(i),
        neighbors: neighbors[i],
    }));

    const surface: PlanetSurface = { planetId, archetype, sectors, regions };
    surfaceCache.set(cacheKey, surface);
    return surface;
}

// ─── Legacy building auto-placement ─────────────────────────────────────────
// Buildings queued before sectors existed have no sectorIndex. Place them
// deterministically so every client shows them in the same spot, preferring
// sensible terrain for the building's type.

const PLACEMENT_PREFERENCE: Array<[RegExp, TerrainType[]]> = [
    [/mine|extract|quarry|drill/i, ['mountains', 'volcanic', 'desert']],
    [/farm|agri|hydro|food/i, ['plains', 'forest', 'jungle']],
    [/power|reactor|energy|solar|geother/i, ['desert', 'volcanic', 'plains']],
    [/naval|port|harbor|fish/i, ['ocean']],
    [/lab|research|science|archive/i, ['urban', 'ruins', 'plains']],
    [/capital|government|admin|palace/i, ['urban']],
    [/housing|residential|habitat|city/i, ['urban', 'plains', 'forest']],
    [/fort|base|military|barracks|defense|shield|cannon/i, ['mountains', 'plains', 'frozen']],
    [/spaceport|landing|dock/i, ['plains', 'desert', 'urban']],
];

export function autoPlaceBuilding(
    surface: PlanetSurface,
    buildingKey: string,
    occupied: Set<number>,
): number | null {
    const pref = PLACEMENT_PREFERENCE.find(([re]) => re.test(buildingKey))?.[1] ?? null;
    const rand = mulberry32(hashString(surface.planetId + '|' + buildingKey));
    const startAt = Math.floor(rand() * SURFACE_SECTOR_COUNT);

    // Two passes: preferred terrain first, then anything buildable.
    for (const pass of [0, 1]) {
        for (let step = 0; step < SURFACE_SECTOR_COUNT; step++) {
            const idx = (startAt + step) % SURFACE_SECTOR_COUNT;
            if (occupied.has(idx)) continue;
            const s = surface.sectors[idx];
            if (s.terrain === 'ocean' && !(pref && pref.includes('ocean'))) continue;
            if (pass === 0 && pref && !pref.includes(s.terrain)) continue;
            return idx;
        }
    }
    return null;
}
