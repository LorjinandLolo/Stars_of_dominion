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
    PLANET_ARCHETYPES,
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

/**
 * Tag prefix carrying an AUTHORED archetype, e.g. `archetype:volcanic`.
 *
 * Namespaced on purpose. The bare terrain words collide with the 108 political
 * system tags, and reusing an existing gameplay tag would have side effects —
 * tagging Jabal `fortified` to make it montane would also make it Buthari
 * "sacred territory", which is a different mechanic entirely.
 */
export const ARCHETYPE_TAG_PREFIX = 'archetype:';

/** Build the authored tag for an archetype. */
export function archetypeTag(archetype: PlanetArchetype): string {
    return `${ARCHETYPE_TAG_PREFIX}${archetype}`;
}

/** Map the game's loose planet type strings/tags onto a terrain archetype. */
export function inferArchetype(planetId: string, typeHint?: string, tags?: string[]): PlanetArchetype {
    // An AUTHORED archetype always wins. Everything below this line is inference
    // from loose strings, and inference is what produced the original defect:
    // every capital carries planetType 'capital' and a 'homeworld' tag and NO
    // thematic hint at all, so all fourteen fell through to `continental` — the
    // volcanic hellscape, the swamp and the mountain world included.
    for (const raw of tags ?? []) {
        const t = raw.toLowerCase();
        if (!t.startsWith(ARCHETYPE_TAG_PREFIX)) continue;
        const named = t.slice(ARCHETYPE_TAG_PREFIX.length) as PlanetArchetype;
        // Validated, not cast: a typo'd tag must fall through to inference
        // rather than reach ARCHETYPE_TERRAIN as undefined.
        if (PLANET_ARCHETYPES.includes(named)) return named;
    }

    const hint = `${typeHint ?? ''} ${(tags ?? []).join(' ')}`.toLowerCase();
    // Swamp before jungle: a wetland is usually described with both.
    if (/swamp|marsh|bayou|wetland|mire/.test(hint)) return 'swamp';
    if (/arcology|ringworld|dyson|megastructure|shellworld/.test(hint)) return 'arcology';
    if (/jungle|rainforest|canopy/.test(hint)) return 'jungle';
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

// Terrain shares per archetype: how much of the board each terrain gets
// (terrainQuotas). Where it goes is the climate model's job (generateTerrain).
// Geography identity per class: continental worlds are 70-80% LAND (seas are
// features, not the default); ocean worlds invert that; frozen worlds carry
// ice sheets instead of open water; deserts get scattered lakes at most.
const ARCHETYPE_TERRAIN: Record<PlanetArchetype, Array<[TerrainType, number]>> = {
    // Standing water threaded through dense growth — the water is everywhere and
    // shallow rather than gathered into seas. Jungle-dominant, which is what
    // makes Sarrak biome affinity bite on their own homeworld instead of by luck.
    swamp:       [['jungle', 46], ['ocean', 24], ['forest', 9], ['plains', 8], ['toxic', 8], ['ruins', 2], ['mountains', 3]],
    // Canopy deathworld: almost no open ground and almost no open water.
    jungle:      [['jungle', 62], ['forest', 13], ['plains', 8], ['mountains', 6], ['ocean', 6], ['ruins', 2], ['toxic', 3]],
    // A built world. There is no natural surface left to speak of.
    arcology:    [['urban', 74], ['ruins', 9], ['plains', 6], ['mountains', 5], ['toxic', 4], ['desert', 2]],
    continental: [['plains', 28], ['forest', 21], ['mountains', 14], ['ocean', 23], ['jungle', 8], ['desert', 7], ['frozen', 5]],
    arid:        [['desert', 42], ['plains', 20], ['mountains', 21], ['ocean', 5], ['volcanic', 6], ['ruins', 6]],
    oceanic:     [['ocean', 64], ['plains', 9], ['forest', 7], ['jungle', 8], ['mountains', 7], ['frozen', 5]],
    frozen:      [['frozen', 58], ['mountains', 20], ['plains', 8], ['ocean', 4], ['forest', 5], ['ruins', 5]],
    volcanic:    [['volcanic', 37], ['mountains', 27], ['desert', 15], ['plains', 10], ['toxic', 9], ['ruins', 2]],
    toxic:       [['toxic', 42], ['desert', 18], ['mountains', 16], ['volcanic', 12], ['plains', 10], ['ruins', 2]],
    gaia:        [['plains', 26], ['forest', 25], ['jungle', 15], ['ocean', 21], ['mountains', 12], ['ruins', 6]],
    montane:     [['mountains', 65], ['plains', 9], ['frozen', 8], ['forest', 8], ['desert', 4], ['ocean', 3], ['ruins', 3]],
};

const TERRAIN_HABITABILITY: Record<TerrainType, number> = {
    plains: 85, forest: 75, jungle: 60, urban: 95, ocean: 25,
    mountains: 45, desert: 40, frozen: 30, toxic: 15, volcanic: 20, ruins: 55,
};

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

// ─── Noise ───────────────────────────────────────────────────────────────────
// Smooth value noise on a hashed lattice. Deterministic per planet and cheap
// enough to evaluate at 64 points: the board only ever samples it at seeds.

function latticeValue(seed: number, ix: number, iy: number): number {
    let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function valueNoise(seed: number, x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = latticeValue(seed, ix, iy), b = latticeValue(seed, ix + 1, iy);
    const c = latticeValue(seed, ix, iy + 1), d = latticeValue(seed, ix + 1, iy + 1);
    const top = a + (b - a) * sx, bottom = c + (d - c) * sx;
    return (top + (bottom - top) * sy) * 2 - 1; // -1..1
}

/** Fractal noise: a few octaves, coarse features first. Roughly -1..1. */
function fbm(seed: number, x: number, y: number, octaves: number, frequency: number): number {
    let sum = 0, amp = 1, norm = 0, f = frequency;
    for (let o = 0; o < octaves; o++) {
        sum += valueNoise(seed + o * 1013, x * f, y * f) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
    }
    return sum / norm;
}

// ─── Terrain generation ─────────────────────────────────────────────────────
// A small climate model instead of random blobs. Every district gets an
// elevation (fractal noise, with the settled heart raised into a continent),
// a ridge value (ridged noise: long mountain chains rather than square
// massifs), a latitude (north and south are the poles, with a little axial
// tilt per world) and a moisture that rises near the sea. The archetype's pool
// still decides HOW MUCH of each terrain a world has; the climate decides
// WHERE it goes: seas fill the lowlands, ranges follow the ridges, ice caps
// sit at the poles, jungle is hot and wet, desert hot and dry. Until 2026-10
// an ice sheet could sit beside a temperate capital and the share of sea on a
// continental world swung from none to a third on the luck of nine blobs.

/** Land-world capitals keep their seas to coastal waters: the settled continent is the showpiece. */
const CAPITAL_SEA_FACTOR = 0.45;
/** How many districts the settled capital core takes (the heart plus its best neighbours). */
const CAPITAL_CORE_SIZE = 4;

/**
 * Whole-district counts per terrain from the archetype pool (largest remainder).
 *
 * Each world jitters the pool first. Without it every continental world had
 * the same mix to the district, which read as one planet copied fourteen
 * times; the jitter is wide for the minor terrains and narrow for the
 * archetype's defining one, so a jungle world is always a jungle world but
 * one temperate world can be rugged and the next a breadbasket.
 */
function terrainQuotas(rand: () => number, archetype: PlanetArchetype, landBias: boolean): Map<TerrainType, number> {
    const base = ARCHETYPE_TERRAIN[archetype];
    const top = Math.max(...base.map(([, w]) => w));
    const pool = base.map(([t, w]) => [t, w * (w === top ? 0.85 + rand() * 0.3 : 0.4 + rand() * 1.3)] as [TerrainType, number]);
    // Never against an archetype defined by its water: an authored ocean or
    // swamp homeworld must not be drained because every capital is passed
    // the `capital` hint (Aeiralux generated 7 ocean districts of 64 that way).
    const waterDefined = archetype === 'oceanic' || archetype === 'swamp';
    if (landBias && !waterDefined) {
        const ocean = pool.find(([t]) => t === 'ocean');
        if (ocean) {
            const moved = ocean[1] * (1 - CAPITAL_SEA_FACTOR);
            ocean[1] -= moved;
            const plains = pool.find(([t]) => t === 'plains');
            if (plains) plains[1] += moved; else pool.push(['plains', moved]);
        }
    }
    const total = pool.reduce((s, [, w]) => s + w, 0);
    const exact = pool.map(([t, w]) => ({ t, x: (w / total) * SURFACE_SECTOR_COUNT }));
    const quotas = new Map<TerrainType, number>(exact.map(e => [e.t, Math.floor(e.x)]));
    let left = SURFACE_SECTOR_COUNT - [...quotas.values()].reduce((s, n) => s + n, 0);
    for (const e of [...exact].sort((a, b) => (b.x % 1) - (a.x % 1))) {
        if (left <= 0) break;
        quotas.set(e.t, (quotas.get(e.t) ?? 0) + 1);
        left--;
    }
    return quotas;
}

/**
 * Who claims land first, and what each terrain looks for. Ocean is not here:
 * it always takes the lowest ground first. Plains take whatever is left.
 */
const CLAIM_ORDER: TerrainType[] = ['mountains', 'volcanic', 'frozen', 'desert', 'jungle', 'forest', 'toxic', 'ruins', 'urban'];

function generateTerrain(rand: () => number, archetype: PlanetArchetype, seeds: SeedPoint[], neighbors: number[][], landBias: boolean, settled: boolean, founded = false): TerrainType[] {
    const noiseSeed = Math.floor(rand() * 0xffffffff);
    const ox = rand() * 50, oy = rand() * 50;
    const tilt = (rand() - 0.5) * 0.7; // radians: the poles are roughly north and south
    const sample = (field: number, x: number, y: number, octaves: number, freq: number) =>
        fbm(noiseSeed + field * 7919, x + ox, y + oy, octaves, freq);

    const n = seeds.length;
    // Fields are sampled at only 64 points, so neighbouring districts can
    // disagree sharply; two rounds of averaging with the six nearest turn
    // that into regions instead of confetti.
    const near6 = seeds.map((s, i) => seeds
        .map((o, j) => ({ j, d: i === j ? Infinity : dist(s, o) }))
        .sort((a, b) => a.d - b.d).slice(0, 6).map(x => x.j));
    const smooth = (field: number[], rounds = 2): number[] => {
        let cur = field;
        for (let r = 0; r < rounds; r++) {
            cur = cur.map((v, i) => v * 0.5 + (near6[i].reduce((s2, j) => s2 + cur[j], 0) / near6[i].length) * 0.5);
        }
        return cur;
    };
    const elevation = smooth(seeds.map(s => {
        const r = Math.hypot(s.x, s.y);
        // The settled heart sits on high, dry ground; the rim falls away.
        const heart = settled ? (landBias ? 0.45 : 0.2) * (1 - r) : 0;
        return sample(1, s.x, s.y, 2, 1.3) + heart;
    }));
    // Ridged noise peaks along lines, which is what reads as a range.
    const ridge = smooth(seeds.map(s => 1 - Math.abs(sample(2, s.x, s.y, 2, 1.6))), 1);
    const latitude = seeds.map(s => Math.min(1, Math.abs(s.y * Math.cos(tilt) - s.x * Math.sin(tilt)) * 1.05));
    const moistureBase = smooth(seeds.map(s => sample(3, s.x, s.y, 2, 1.4)));
    const blotch = (field: number) => smooth(seeds.map(s => sample(field, s.x, s.y, 2, 1.8)));
    const toxicField = blotch(4), ruinField = blotch(5), urbanField = blotch(6), hotspot = blotch(7);

    const quotas = terrainQuotas(rand, archetype, landBias);
    const terrain: Array<TerrainType | null> = new Array(n).fill(null);
    const claim = (t: TerrainType, score: (i: number) => number) => {
        let want = quotas.get(t) ?? 0;
        if (want <= 0) return;
        const order = [...Array(n).keys()].filter(i => terrain[i] === null).sort((a, b) => score(b) - score(a));
        for (const i of order) {
            if (want-- <= 0) break;
            terrain[i] = t;
        }
    };

    // 1. Seas fill the lowest ground, so coastlines follow the elevation.
    //    A settled heart is never drowned.
    claim('ocean', i => -elevation[i] - (settled && i === 0 ? 10 : 0));

    // Moisture: the base field, plus how close the sea is.
    const seaSeeds = seeds.filter((_, i) => terrain[i] === 'ocean');
    const moisture = seeds.map((s, i) => {
        let d = Infinity;
        for (const o of seaSeeds) d = Math.min(d, dist(s, o));
        const coastal = seaSeeds.length ? Math.exp(-d / 0.3) : 0;
        return moistureBase[i] * 0.6 + coastal * 0.8;
    });
    const heat = (i: number) => 1 - latitude[i] - Math.max(0, elevation[i]) * 0.25;

    const scores: Partial<Record<TerrainType, (i: number) => number>> = {
        mountains: i => ridge[i] * 0.9 + elevation[i] * 0.6,
        volcanic: i => hotspot[i] * 0.7 + ridge[i] * 0.4,
        frozen: i => latitude[i] * 1.6 + elevation[i] * 0.3 + moistureBase[i] * 0.1,
        desert: i => heat(i) - moisture[i],
        jungle: i => heat(i) + moisture[i],
        forest: i => moisture[i] - Math.abs(heat(i) - 0.45) * 0.8,
        toxic: i => toxicField[i] - moisture[i] * 0.3,
        ruins: i => ruinField[i],
        urban: i => urbanField[i] - Math.hypot(seeds[i].x, seeds[i].y) * 0.6,
    };
    for (const t of CLAIM_ORDER) {
        const score = scores[t];
        if (score) claim(t, score);
    }
    const out: TerrainType[] = terrain.map(t => t ?? 'plains');

    // Lone districts: a single cell of one terrain inside another reads as
    // noise, not geography. It joins its surroundings when most of its six
    // nearest agree. Seas and the capital are left alone (coastlines matter).
    const lonely = out.map((t, i) => {
        if (t === 'ocean' || (settled && i === 0)) return t;
        const around = near6[i].map(j => out[j]);
        if (around.includes(t)) return t;
        const tally = new Map<TerrainType, number>();
        for (const a of around) tally.set(a, (tally.get(a) ?? 0) + 1);
        const [best, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        return count >= 4 && best !== 'ocean' ? best : t;
    });
    for (let i = 0; i < n; i++) out[i] = lonely[i];

    // An UNSETTLED world has no cities. A body tagged colonizable/dead_matter
    // was rendering an urban capital core and metropolitan sprawl before
    // anyone had ever landed — remap any urban to wilderness (ruins on an
    // arcology: dead megastructure is the fiction, not a living city) and skip
    // the capital-core seeding entirely. The surface cache keys on tags, so
    // the moment settlement flips the tags, the settled surface takes over.
    if (!settled) {
        for (let i = 0; i < out.length; i++) {
            if (out[i] === 'urban') out[i] = archetype === 'arcology' ? 'ruins' : 'plains';
        }
        // District 0 is where a world is won (CAPITAL_SECTOR): an outpost's
        // dome stands there, and a world with no one on it is still landed on
        // there. It is never a mountain wall or open sea, which no infantry
        // could ever enter and which made an outpost on a dead world (or an
        // empty one) impossible to take by force.
        if (founded) out[0] = 'urban';
        else if (out[0] === 'mountains' || out[0] === 'ocean') out[0] = 'plains';
        return out;
    }

    // Capital core: the innermost district is always settled ground. Make the
    // heart urban along with its most hospitable neighbours.
    out[0] = 'urban';
    const coreNeighbors = [...neighbors[0]].sort(
        (a, b) => TERRAIN_HABITABILITY[out[b]] - TERRAIN_HABITABILITY[out[a]]
    );
    for (const nb of coreNeighbors.slice(0, CAPITAL_CORE_SIZE - 1)) out[nb] = 'urban';

    return out;
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
    settled = true,
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
        // A world nobody has settled has no Capital District — just the spot
        // a survey team would put one.
        name: settled ? 'Capital District' : 'Prime Landing Site',
        kind: 'capital',
        sectorIndexes: capitalSectors,
        color: REGION_COLORS.capital,
        socialGroups: settled ? buildSocialGroups(rand, 'capital') : [],
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
    // Nobody lives on a body that is still waiting to be settled (or that can
    // never be) — its surface must read as wilderness, not as a city that
    // predates its own founding.
    const settled = !(tags?.includes('colonizable') || tags?.includes('dead_matter'));
    // An outpost (or a colony on dead rock) has a settlement on an otherwise
    // unsettled surface: its dome is the capital district.
    const founded = !!(tags?.includes('outpost') || tags?.includes('colony'));
    const terrain = generateTerrain(rand, archetype, seeds, neighbors, landBias, settled, founded);
    const { regions, regionOf } = generateRegions(rand, terrain, seeds, settled);

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
