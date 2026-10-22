// lib/exploration/body-generator.ts
// Deterministic planetary bodies for surveyed systems. Before a system is
// surveyed it holds nothing; the first completed survey materializes its bodies
// into construction state (unowned, colonizable) and movement state (anomaly
// attachment targets). Generation is seeded on the system id alone, so every
// faction that surveys the same system finds the identical bodies — same
// determinism contract as the planet-surface Voronoi layer.
//
// A system is laid out the way a real one is (planSystemBodies, pure):
//
//   the star     decides how many bodies there are and where its habitable
//                band lies. A blue giant has a crowded system and a wide,
//                distant band; a red dwarf a few worlds huddled close; a
//                neutron star or pulsar only irradiated rock; a black hole
//                little but the wreck of whatever orbited it.
//   the orbit    decides what forms there: hot inner rock, desert and volcanic
//                worlds; temperate gardens, oceans and jungles in the band;
//                ice, gas giants and frozen highlands beyond it.
//   the dice     decide size (small, medium, large: tiles and population),
//                habitability (0..100: a colony's popCapacity), the deposits
//                worth an outpost (rare minerals, geothermal vents, ice,
//                helium-3, fertile soil) and moons around the big ones.
//
// Archetype tags are real PLANET_ARCHETYPES names, so the 64-district surface
// (lib/planet-surface/generator.ts) matches the body: a volcanic world gets a
// volcanic board.

import type { GameWorldState } from '../game-world-state';
import type { PlanetNode } from '../movement/types';
import type { Planet as ConstructionPlanet, PlanetType, BodySize } from '../construction/construction-types';
import type { PlanetArchetype } from '../planet-surface/types';
import { RNG, seedFromString } from '../trade-system/rng';
import { classifyStar, type StarKey } from '../galaxy/star-class';

export type OrbitZone = 'hot' | 'temperate' | 'cold';

interface BodyKind {
    type: PlanetType;
    weight: number;
    colonizable: boolean;
    archetype?: PlanetArchetype;
    /** Base habitability before size and star. Dead matter is 0. */
    hab: number;
    tags: string[];
    /** Only ever this size. */
    size?: BodySize;
}

/** What forms in each zone, weighted. */
const ZONE_BODIES: Record<OrbitZone, BodyKind[]> = {
    hot: [
        { type: 'desert', weight: 26, colonizable: true, archetype: 'arid', hab: 42, tags: [] },
        { type: 'standard', weight: 16, colonizable: true, archetype: 'volcanic', hab: 24, tags: ['volcanic'] },
        { type: 'standard', weight: 10, colonizable: true, archetype: 'toxic', hab: 18, tags: ['toxic'] },
        { type: 'moon', weight: 30, colonizable: false, hab: 0, tags: ['barren', 'scorched'] },
        { type: 'megaplanet', weight: 8, colonizable: false, hab: 0, tags: ['crushing_gravity'], size: 'large' },
    ],
    temperate: [
        { type: 'standard', weight: 30, colonizable: true, archetype: 'continental', hab: 72, tags: [] },
        { type: 'ocean', weight: 16, colonizable: true, archetype: 'oceanic', hab: 62, tags: [] },
        { type: 'standard', weight: 9, colonizable: true, archetype: 'jungle', hab: 58, tags: [] },
        { type: 'standard', weight: 7, colonizable: true, archetype: 'swamp', hab: 52, tags: [] },
        { type: 'desert', weight: 10, colonizable: true, archetype: 'arid', hab: 46, tags: [] },
        { type: 'standard', weight: 3, colonizable: true, archetype: 'gaia', hab: 92, tags: ['pristine'] },
        { type: 'moon', weight: 12, colonizable: false, hab: 0, tags: ['barren'] },
        { type: 'tomb', weight: 4, colonizable: false, hab: 0, tags: ['relic_site'] },
    ],
    cold: [
        { type: 'arctic', weight: 20, colonizable: true, archetype: 'frozen', hab: 34, tags: ['ice'] },
        { type: 'standard', weight: 8, colonizable: true, archetype: 'montane', hab: 30, tags: [] },
        { type: 'gas_giant', weight: 30, colonizable: false, archetype: 'toxic', hab: 0, tags: ['gas_giant', 'helium3'], size: 'large' },
        { type: 'moon', weight: 24, colonizable: false, hab: 0, tags: ['barren', 'ice'] },
        { type: 'megaplanet', weight: 6, colonizable: false, hab: 0, tags: ['crushing_gravity'], size: 'large' },
        { type: 'tomb', weight: 3, colonizable: false, hab: 0, tags: ['relic_site'] },
    ],
};

/**
 * Per star: how many bodies (min..max), where the habitable band sits (first
 * and last temperate orbit), and what the star does to life there.
 */
const STAR_SYSTEMS: Record<StarKey, { min: number; max: number; band: [number, number]; habMult: number; tags: string[]; deadOnly?: boolean }> = {
    blueGiant:  { min: 2, max: 5, band: [2, 4], habMult: 0.85, tags: [] },        // bright and young: the band is far out
    yellow:     { min: 1, max: 4, band: [1, 3], habMult: 1, tags: [] },
    redDwarf:   { min: 0, max: 3, band: [0, 1], habMult: 0.8, tags: ['tidally_locked'] }, // close, flaring, one face to the sun
    whiteDwarf: { min: 0, max: 2, band: [0, 0], habMult: 0.6, tags: [] },
    binary:     { min: 1, max: 4, band: [1, 3], habMult: 0.9, tags: [] },
    neutron:    { min: 0, max: 2, band: [-1, -1], habMult: 0.3, tags: ['irradiated'] },
    pulsar:     { min: 0, max: 2, band: [-1, -1], habMult: 0.25, tags: ['irradiated'] },
    blackHole:  { min: 0, max: 2, band: [-1, -1], habMult: 0, tags: [], deadOnly: true },
};

const SIZE_TILES: Record<BodySize, [number, number]> = { small: [4, 5], medium: [6, 8], large: [9, 12] };
const SIZE_POP: Record<BodySize, number> = { small: 0.6, medium: 1, large: 1.4 };

/** Deposits a body may carry (tags read by outposts and the surface). */
function depositsFor(rng: RNG, kind: BodyKind, zone: OrbitZone): string[] {
    const out: string[] = [];
    const rare = kind.type === 'megaplanet' || kind.archetype === 'arid' || kind.archetype === 'volcanic' ? 0.3 : 0.1;
    if (rng.check(rare)) out.push('rare_minerals');
    if ((kind.archetype === 'volcanic' || zone === 'hot') && rng.check(0.4)) out.push('geothermal');
    if (zone === 'cold' && !kind.tags.includes('ice') && kind.type !== 'gas_giant' && rng.check(0.4)) out.push('ice');
    if ((kind.archetype === 'continental' || kind.archetype === 'gaia' || kind.archetype === 'jungle') && rng.check(0.2)) out.push('fertile');
    return out;
}

/** Orbits a system has room for, star outward. */
const ORBIT_SLOTS = 6;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const MOON_LETTERS = ['a', 'b', 'c'];

export interface BodySpec {
    id: string;
    name: string;
    type: PlanetType;
    zone: OrbitZone;
    orbitIndex: number;
    parentId?: string;
    size: BodySize;
    colonizable: boolean;
    habitability: number;
    maxTiles: number;
    popCapacity: number;
    tags: string[];
}

function pickKind(rng: RNG, kinds: BodyKind[]): BodyKind {
    const total = kinds.reduce((s, k) => s + k.weight, 0);
    let roll = rng.next() * total;
    for (const k of kinds) { roll -= k.weight; if (roll <= 0) return k; }
    return kinds[0];
}

function zoneOf(orbit: number, band: [number, number]): OrbitZone {
    if (band[0] < 0) return orbit === 0 ? 'hot' : 'cold'; // no band at all around a dead star
    return orbit < band[0] ? 'hot' : orbit <= band[1] ? 'temperate' : 'cold';
}

function makeBody(rng: RNG, kind: BodyKind, zone: OrbitZone, starMult: number, starTags: string[], id: string, name: string, orbitIndex: number, parentId?: string, forceSize?: BodySize): BodySpec {
    const sizeRoll = rng.next();
    const size: BodySize = forceSize ?? kind.size ?? (sizeRoll < 0.3 ? 'small' : sizeRoll < 0.8 ? 'medium' : 'large');
    const [lo, hi] = SIZE_TILES[size];
    const maxTiles = lo + Math.floor(rng.next() * (hi - lo + 1));
    const jitter = (rng.next() - 0.5) * 20;
    const habitability = kind.colonizable ? Math.max(5, Math.min(100, Math.round((kind.hab + jitter) * starMult))) : 0;
    const popCapacity = kind.colonizable ? Math.max(10, Math.round(habitability * SIZE_POP[size])) : 0;
    const tags = [
        ...(kind.colonizable ? ['colonizable'] : ['dead_matter']),
        ...(kind.archetype ? [`archetype:${kind.archetype}`] : []),
        ...kind.tags,
        ...depositsFor(rng, kind, zone),
        ...(kind.colonizable ? starTags : starTags.filter(t => t === 'irradiated')),
        `size:${size}`,
    ];
    return { id, name, type: kind.type, zone, orbitIndex, parentId, size, colonizable: kind.colonizable, habitability, maxTiles, popCapacity, tags: [...new Set(tags)] };
}

/** The bodies a survey of this system finds. Pure: same system, same bodies. */
export function planSystemBodies(system: { id: string; name: string; tags?: string[] }): BodySpec[] {
    const rng = new RNG(seedFromString(`bodies|${system.id}`));
    const star = STAR_SYSTEMS[classifyStar(system).key];
    // Weighted to the middle of the range: two dice, not one.
    const count = Math.min(star.max, star.min + Math.floor(((rng.next() + rng.next()) / 2) * (star.max - star.min + 1)));
    // Orbits are not packed against the star: the bodies take `count` of
    // ORBIT_SLOTS slots, so a two-world system can be one hot rock and one
    // gas giant far out. Named I, II, ... in order out from the star.
    const slots = [...Array(ORBIT_SLOTS).keys()];
    rng.shuffle(slots);
    const orbits = slots.slice(0, count).sort((a, b) => a - b);
    const out: BodySpec[] = [];
    for (let i = 0; i < count; i++) {
        const zone = zoneOf(orbits[i], star.band);
        let kinds = ZONE_BODIES[zone];
        if (star.deadOnly || star.band[0] < 0) kinds = kinds.filter(k => !k.colonizable || k.archetype === 'toxic' || k.archetype === 'frozen');
        if (star.deadOnly) kinds = kinds.filter(k => !k.colonizable);
        const kind = pickKind(rng, kinds);
        const id = `planet-${system.id}-body-${i + 1}`;
        const body = makeBody(rng, kind, zone, star.habMult, star.tags, id, `${system.name} ${ROMAN[i] ?? String(i + 1)}`, orbits[i]);
        out.push(body);
        // Big worlds hold moons: an ice moon round a gas giant is a classic outpost site.
        const moonChance = kind.type === 'gas_giant' ? 0.45 : body.size === 'large' ? 0.2 : 0;
        if (moonChance && rng.check(moonChance)) {
            const moons = kind.type === 'gas_giant' && rng.check(0.25) ? 2 : 1;
            for (let m = 0; m < moons; m++) {
                const moonKind: BodyKind = { type: 'moon', weight: 1, colonizable: false, hab: 0, tags: zone === 'cold' ? ['barren', 'ice'] : ['barren'] };
                out.push(makeBody(rng, moonKind, zone, star.habMult, star.tags, `${id}-moon-${m + 1}`, `${body.name}${MOON_LETTERS[m]}`, orbits[i], id, 'small'));
            }
        }
    }
    return out;
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

    const created: ConstructionPlanet[] = [];
    for (const body of planSystemBodies(system as any)) {
        const constrPlanet: ConstructionPlanet = {
            id: body.id,
            name: body.name,
            ownerId: '',
            systemId,
            planetType: body.type,
            infrastructureLevel: 0,
            stability: 100,
            happiness: 50,
            specialization: null,
            maxTiles: body.maxTiles,
            tiles: Array.from({ length: body.maxTiles }).map((_, t) => ({
                tileId: `${body.id}-t${t + 1}`,
                districtType: 'any' as const,
                buildingId: null,
                constructionState: 'empty' as const,
                constructionCompleteAt: null,
            })),
            buildQueue: [],
            activeModifiers: [],
            tags: [...body.tags],
            population: 0,
            popCapacity: body.popCapacity,
            popGrowth: 0,
            unrest: 0,
            isOccupied: false,
            demographics: [],
            orbitIndex: body.orbitIndex,
            size: body.size,
            habitability: body.habitability,
            ...(body.parentId ? { parentPlanetId: body.parentId } : {}),
        };
        world.construction.planets.set(body.id, constrPlanet);

        const planetNode: PlanetNode = {
            id: body.id,
            systemId,
            name: body.name,
            tags: [...body.tags],
            tagReveal: { allTags: [...body.tags], revealedAt: { surveyed: [...body.tags] } },
            anomalyIds: [],
            frontierClaims: [],
        };
        world.movement.planets.set(body.id, planetNode);
        created.push(constrPlanet);
    }

    if (created.length > 0) {
        console.log(`[Exploration] Survey of ${system.name} charted ${created.length} bod${created.length === 1 ? 'y' : 'ies'}.`);
    }
    return created;
}

/**
 * Population a world holds once it is a full colony: its habitability scaled
 * by size. Worlds from before bodies had a habitability, and dead rock under
 * domes, hold the old flat 50.
 */
export function colonyCapacity(planet: { habitability?: number; size?: BodySize; tags?: string[] }, domed = false): number {
    if (domed || !(Number(planet.habitability) > 0)) return 50;
    return Math.max(10, Math.round(Number(planet.habitability) * SIZE_POP[planet.size ?? 'medium']));
}
