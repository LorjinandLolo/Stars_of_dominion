// lib/galaxy/population-composition.ts
// Who actually lives on a world.
//
// Planet.demographics has existed since the construction system was written and
// has always been a placeholder: every planet in the galaxy carried either
// "Primary Species" at 100% Citizen, or a fixed 80/20 colonist/labour split,
// forever. Nothing changed it — not growth, not conquest, not colonisation — and
// its single reader is the SOCIETY tab's bar chart, so fourteen civilizations
// rendered as the same two anonymous bands.
//
// This module derives a real composition from state the game already tracks:
// who owns the world, which civilization they are, whether it is their
// homeworld, and who held it before they took it. Deterministic per planet, so
// the same world always reads the same way and a snapshot round-trip is stable.
//
// It is descriptive, not simulated: the authoritative population COUNT stays on
// PlanetProduction.demographics (a scalar model), and this is the composition of
// that count. Two fields named `demographics` on two different types is
// confusing enough without both claiming to own the number.

import type { GameWorldState } from '../game-world-state';
import type { Demographic } from '../construction/construction-types';
import { RNG, seedFromString } from '../trade-system/rng';

interface SpeciesIdentity {
    speciesId: string;
    /** What this people call themselves. */
    name: string;
}

/**
 * The people of each civilization. Names come from the player-authored designs
 * where they exist; the older eight keep the names their lore already used.
 */
export const SPECIES_BY_CIV: Record<string, SpeciesIdentity> = {
    'civ-elyndra': { speciesId: 'species-elyndran', name: 'Elyndran' },
    'civ-velkori': { speciesId: 'species-velkori', name: 'Velkori' },
    'civ-auraxian': { speciesId: 'species-auraxian', name: 'Auraxian' },
    'civ-solari': { speciesId: 'species-solari', name: 'Solari' },
    'civ-mycelari': { speciesId: 'species-mycelari', name: 'Mycelari' },
    'civ-nythari': { speciesId: 'species-nythari', name: 'Nythari' },
    'civ-grakkar': { speciesId: 'species-grakkar', name: 'Grakkar' },
    'civ-xalthuun': { speciesId: 'species-xalthuun', name: 'Xal’thuun' },
    // The ten authored from the player designs.
    'civ-rhimetals': { speciesId: 'species-rhimetal', name: 'Rhimetal' },
    'civ-gabagoon': { speciesId: 'species-gabagoonian', name: 'Gabagoonian' },
    'civ-infernoid': { speciesId: 'species-infernoid', name: 'Infernoid' },
    'civ-movanite': { speciesId: 'species-movanite', name: 'Movanite' },
    'civ-leopantheri': { speciesId: 'species-leopantheri', name: 'Leo-pantheri' },
    'civ-buthari': { speciesId: 'species-buthari', name: 'Buthari' },
    'civ-sarrak': { speciesId: 'species-sarrak', name: 'Sarrak' },
    'civ-kaerruun': { speciesId: 'species-kaerruun', name: 'Kaer’Ruun' },
    'civ-nexulan': { speciesId: 'species-nexulan', name: 'Nexulan' },
    'civ-intergalactic': { speciesId: 'species-intergalactic', name: 'Free Trader' },
};

const UNKNOWN_SPECIES: SpeciesIdentity = { speciesId: 'species-drifter', name: 'Drifters' };

/** Species that turn up as minorities on any well-connected world. */
const COSMOPOLITAN: SpeciesIdentity[] = [
    { speciesId: 'species-auraxian', name: 'Auraxian' },
    { speciesId: 'species-drifter', name: 'Drifters' },
    { speciesId: 'species-velkori', name: 'Velkori' },
    { speciesId: 'species-grakkar', name: 'Grakkar' },
];

function speciesOfFaction(world: GameWorldState, factionId: string | undefined): SpeciesIdentity {
    if (!factionId) return UNKNOWN_SPECIES;
    const civId = (world.economy?.factions?.get(factionId) as { civilizationId?: string } | undefined)?.civilizationId;
    return (civId && SPECIES_BY_CIV[civId]) || UNKNOWN_SPECIES;
}

/** Round a set of shares to whole percentages summing to exactly 100. */
function normalise(bands: Demographic[]): Demographic[] {
    const total = bands.reduce((s, b) => s + b.percentage, 0);
    if (total <= 0) return bands;
    const scaled = bands.map(b => ({ ...b, percentage: (b.percentage / total) * 100 }));
    const floored = scaled.map(b => ({ ...b, percentage: Math.floor(b.percentage) }));
    let remainder = 100 - floored.reduce((s, b) => s + b.percentage, 0);
    // Hand the rounding remainder to the largest bands first, deterministically.
    const order = scaled
        .map((b, i) => ({ i, frac: b.percentage - Math.floor(b.percentage) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const { i } of order) {
        if (remainder <= 0) break;
        floored[i].percentage += 1;
        remainder -= 1;
    }
    return floored.filter(b => b.percentage > 0);
}

export interface CompositionContext {
    /** True for the owner's seat of government. */
    isHomeworld: boolean;
    /** The faction that held this world before its current owner, if taken. */
    previousOwnerId?: string;
    /** True when the current owner works this world with unfree labour. */
    enslaved?: boolean;
}

/**
 * Derive the population bands for one planet.
 *
 * Deterministic in the planet id, so it is stable across ticks, reloads and
 * snapshot round-trips — only a change of OWNER or of conquest status moves it.
 */
export function composePopulation(
    world: GameWorldState,
    planet: { id: string; ownerId?: string; tags?: string[] },
    ctx: CompositionContext,
): Demographic[] {
    const owner = speciesOfFaction(world, planet.ownerId);
    const rng = new RNG(seedFromString(`pop|${planet.id}`));
    const bands: Demographic[] = [];

    // The ruling people. A homeworld is far more homogeneous than a colony.
    const coreShare = ctx.isHomeworld ? 78 + rng.next() * 14 : 46 + rng.next() * 24;
    bands.push({
        speciesId: owner.speciesId,
        name: owner.name,
        percentage: coreShare,
        socialClass: 'Citizen',
    });

    // A conquered population stays, under whatever terms the conqueror sets.
    if (ctx.previousOwnerId && ctx.previousOwnerId !== planet.ownerId) {
        const conquered = speciesOfFaction(world, ctx.previousOwnerId);
        if (conquered.speciesId !== owner.speciesId) {
            bands.push({
                speciesId: conquered.speciesId,
                name: conquered.name,
                percentage: 18 + rng.next() * 18,
                socialClass: ctx.enslaved ? 'Slave' : 'Resident',
            });
        }
    }

    // Everyone else who ended up here. Colonies draw more of them than capitals.
    const minorityCount = ctx.isHomeworld ? 1 : 2;
    const pool = COSMOPOLITAN.filter(s => s.speciesId !== owner.speciesId);
    for (let i = 0; i < minorityCount && pool.length; i++) {
        const pick = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
        bands.push({
            speciesId: pick.speciesId,
            name: pick.name,
            percentage: 4 + rng.next() * 12,
            socialClass: rng.next() < 0.35 ? 'Servant' : 'Resident',
        });
    }

    return normalise(bands);
}

/**
 * How mixed a world is, 0..1 — one minus the Herfindahl concentration.
 *
 * 0 means everyone is the same people; higher means a genuinely plural
 * population. This is the number a "purity dispute" mechanic would key off,
 * and it is why the composition had to become real data before such a mechanic
 * could mean anything.
 */
export function diversityIndex(bands: Demographic[] | undefined): number {
    if (!bands?.length) return 0;
    const total = bands.reduce((s, b) => s + b.percentage, 0) || 1;
    const concentration = bands.reduce((s, b) => s + Math.pow(b.percentage / total, 2), 0);
    return Math.max(0, Math.min(1, 1 - concentration));
}

/** Fraction of a world living under unfree or servile terms. */
export function subjugatedShare(bands: Demographic[] | undefined): number {
    if (!bands?.length) return 0;
    const total = bands.reduce((s, b) => s + b.percentage, 0) || 1;
    const unfree = bands
        .filter(b => b.socialClass === 'Slave' || b.socialClass === 'Servant')
        .reduce((s, b) => s + b.percentage, 0);
    return unfree / total;
}

/**
 * Recompute one planet's composition from current ownership.
 * Called at bootstrap for every world, and again whenever a world changes hands.
 */
export function refreshPlanetDemographics(
    world: GameWorldState,
    planet: any,
    previousOwnerId?: string,
): void {
    if (!planet?.ownerId) return;
    const tags: string[] = planet.tags ?? [];
    const enslaved = !!world.factionTraits?.get(planet.ownerId)?.sarrak?.slaveWorlds?.[planet.id];
    planet.demographics = composePopulation(world, planet, {
        isHomeworld: tags.includes('homeworld'),
        previousOwnerId: previousOwnerId ?? planet.conqueredFrom,
        enslaved,
    });
    // Remember who held it, so the composition survives a later recompute.
    if (previousOwnerId) planet.conqueredFrom = previousOwnerId;
}

/**
 * Give every owned world a real population composition.
 *
 * Safe to call on every boot: it only rewrites planets still carrying the old
 * placeholder ("Primary Species" / "Colonists"), so a world whose composition
 * has since been recomputed by conquest is left alone.
 */
export function ensurePlanetDemographics(world: GameWorldState): number {
    let seeded = 0;
    for (const planet of world.construction?.planets?.values() ?? []) {
        const p: any = planet;
        if (!p.ownerId) continue;
        const bands: Demographic[] = p.demographics ?? [];
        const isPlaceholder = !bands.length
            || bands.some(b => b.speciesId === 'species-human'
                || b.speciesId === 'species-colonist'
                || b.speciesId === 'species-labor');
        if (!isPlaceholder) continue;
        refreshPlanetDemographics(world, p);
        seeded += 1;
    }
    if (seeded) console.log(`[Population] Composed demographics for ${seeded} world(s).`);
    return seeded;
}
