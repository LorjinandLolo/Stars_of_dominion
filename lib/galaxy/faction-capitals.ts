// lib/galaxy/faction-capitals.ts
// Where each faction starts, and what its homeworld is called.
//
// Ten of the fourteen factions shipped with placeholder capital ids
// (`alpha-nexulan-cap`, `alpha-banking-cap`, …) matching nothing in
// generated-systems.json. A capital that is not a real place does not merely
// look wrong, it silently disables everything keyed off the capital:
//
//   - updateTradeRoutes starts every route at factionA.capitalSystemId and ends
//     at factionB.capitalSystemId, so no agreement involving those ten could
//     ever be pathfound into a route.
//   - initializeFactionHomeWorld had no existence guard, so it built the full
//     four-planet starting kit at the phantom id — 40 economy planets, 40
//     construction planets and 10 regions pointing at nothing, re-asserted on
//     every strategic tick.
//   - distancesFromCapital (cohesion) returns an empty map, and the pirate
//     Opportunity Index reach penalty degenerates.
//
// The ten ids below are real, verified members of the stitched lane graph,
// picked by greedy farthest-point spread over systems with hyperlane degree >= 3,
// tradeValue >= 47 and security >= 32 (144 of 567 qualify). The four capitals
// that already resolved are left exactly where they were.
//
// Connectivity is not a constraint on placement: buildLaneGraph welds the raw
// link set's 11 components into one at load (lib/movement/lane-graph.ts:156-178),
// so every system is reachable from every other. Verified: all 91 capital pairs
// route, 4 hops at closest, 55 at furthest.
//
// Verify with `npx tsx scripts/faction-capitals-probe.ts`.

import type { SystemNode } from '../movement/types';
import type { GameWorldState } from '../game-world-state';
import type { PlanetArchetype } from '../planet-surface/types';
import { archetypeTag, ARCHETYPE_TAG_PREFIX } from '../planet-surface/generator';

export interface FactionHomeworld {
    /** A real system id from generated-systems.json. */
    systemId: string;
    /**
     * The name the players gave their homeworld. Applied to BOTH the star system
     * on the galaxy map and the capital planet, so a player sees "Pyrothar"
     * where their empire starts rather than a generated label.
     */
    homeworldName: string;
    /**
     * The terrain identity of the capital planet, authored from the civilization's
     * own lore rather than inferred.
     *
     * This exists because inference could never work here. `inferArchetype` reads
     * `planetType` and `tags`, and every capital carries `planetType: 'capital'`
     * with `tags: ['homeworld', 'settled_core']` — no thematic word anywhere. So
     * all fourteen fell through to the `capital|homeworld -> continental` test at
     * the bottom of the chain. Pyrothar, described as "ash cloud and molten rock",
     * generated as a temperate forest world with ZERO volcanic districts; Gor'Zhul,
     * a "bioluminescent swamp", and Jabal, "mist-covered plateau and carved cliff
     * dwelling", the same. Nothing reported it, because continental is a
     * legitimate branch.
     *
     * Scope of the fix is contained: terrain RNG is seeded on `planetId` alone and
     * the archetype only selects which weighted pool the blob seeds draw from, so
     * changing these reshuffles the fourteen capitals and nothing else in the
     * galaxy.
     */
    archetype: PlanetArchetype;
}

/**
 * factionId -> starting system. Every systemId must exist in the world map.
 *
 * Each `archetype` is quoted against the civilization's own `lore` string, so
 * the reasoning is auditable rather than taste. Where the lore describes
 * something the archetype set genuinely does not have — Savarr'Tel's "golden
 * grasslands", Graviton Vale's crushing-gravity super-Earth — `continental` is
 * recorded as a deliberate choice, not left as the accident it used to be.
 */
export const FACTION_CAPITALS: Record<string, FactionHomeworld> = {
    // ── The four founding factions: no homeworld terrain in their lore ───────
    'faction-aurelian': { systemId: 'alpha-5b34961e18bb6fd14903', homeworldName: 'Aglate', archetype: 'continental' },        // q6,r13    nullward-fringe
    'faction-vektori': { systemId: 'alpha-fe148b9a69a680fa14a3', homeworldName: 'Sha Gaura', archetype: 'continental' },      // q37,r13   nullward-fringe
    'faction-null-syndicate': { systemId: 'alpha-1acb646b529592834b59', homeworldName: 'Barjern', archetype: 'continental' }, // q37,r26   crimson-expanse
    'faction-covenant': { systemId: 'alpha-10fae8cf89590243337b', homeworldName: 'Adah', archetype: 'continental' },          // q6,r8     nullward-fringe

    // ── The ten that carried placeholders, spread across the galaxy ──────────

    // "The Solara Shell encloses their star entirely, its interior one
    // continuous laboratory." Not a planet at all — a built interior.
    'nexulan_convergence': { systemId: 'omicron-c86b09367f435f7aa417', homeworldName: 'The Solara Shell', archetype: 'arcology' }, // q159,r164
    // Authored faction, no terrain in the brief. A creditor republic can bank anywhere.
    'banking_clan': { systemId: 'gamma-3d68ef177e55f1ad4fd4', homeworldName: 'Aurea Ripa', archetype: 'continental' },        // q15,r164
    // "Suspended above Aeiralux's storm-torn surface … floating spires."
    // They never touch the ground; the ground is weather and water.
    'faction-rhimetals': { systemId: 'beta-e82292557740b3348233', homeworldName: 'Aeiralux', archetype: 'oceanic' },          // q164,r6
    // "A humid protein moon of fungal forests and capacola vines."
    'faction-gabagoonians': { systemId: 'midrim-68', homeworldName: 'Meatballia Prima', archetype: 'gaia' },                  // q73,r84
    // "Pyrothar is ash cloud and molten rock." The original bug, in one line.
    'faction-infernoids': { systemId: 'omicron-a6b34eed2f81b3538700', homeworldName: 'Pyrothar', archetype: 'volcanic' },     // q126,r122
    // "A super-Earth whose crushing gravity shaped everything from architecture
    // to bone." No terrain stated; continental by choice, not by default.
    'faction-movanites': { systemId: 'midrim-106', homeworldName: 'Graviton Vale', archetype: 'continental' },                // q14,r84
    // "Golden grasslands, stone citadels and underground sanctuaries." There is
    // no savanna archetype; continental is plains-dominant and the closest fit.
    'faction-leopantheri': { systemId: 'midrim-15', homeworldName: 'Savarr’Tel', archetype: 'continental' },                   // q127,r71
    // "Jabal is mist-covered plateau and carved cliff dwelling."
    'faction-buthari': { systemId: 'midrim-81', homeworldName: 'Jabal', archetype: 'montane' },                               // q79,r123
    // "Bioluminescent swamp, carnivorous flora and bone-adorned fortresses."
    // Sarrak biome affinity keys on jungle terrain — before this it worked only
    // because Gor'Zhul happened to roll jungle 15 out of the continental pool.
    'faction-sarrak': { systemId: 'gamma-15c234ff62898d6a0397', homeworldName: 'Gor’Zhul', archetype: 'swamp' },              // q22,r122
    // "Rrriiaa is a twilight deathworld where everything hunts."
    'faction-kaerruun': { systemId: 'midrim-48', homeworldName: 'Rrriiaa', archetype: 'jungle' },                             // q65,r40
};

/** Convenience: the capital system id for a faction, or undefined. */
export function capitalSystemIdFor(factionId: string): string | undefined {
    return FACTION_CAPITALS[factionId]?.systemId;
}

/** Convenience: the homeworld name for a faction, or undefined. */
export function homeworldNameFor(factionId: string): string | undefined {
    return FACTION_CAPITALS[factionId]?.homeworldName;
}

/** Convenience: the authored archetype for a faction's homeworld, or undefined. */
export function homeworldArchetypeFor(factionId: string): PlanetArchetype | undefined {
    return FACTION_CAPITALS[factionId]?.archetype;
}

/**
 * The planet tag that carries the authored archetype, e.g. `archetype:volcanic`.
 *
 * A TAG rather than a new parameter on generateSurface, because generateSurface
 * is called as `(planet.id, planet.planetType, planet.tags)` from roughly a
 * dozen sites across the worker and the client. Threading a fourth argument
 * through all of them is how one site gets missed and renders a different board
 * than the worker fights on — and the surface cache is keyed on the tags, so the
 * tag route invalidates correctly for free.
 */
export function homeworldArchetypeTagFor(factionId: string): string | undefined {
    const archetype = homeworldArchetypeFor(factionId);
    return archetype ? archetypeTag(archetype) : undefined;
}

/**
 * Stamp each faction's authored archetype onto its capital planet, in both the
 * economy and construction records.
 *
 * Idempotent, and CORRECTING: a stale `archetype:` tag is removed rather than
 * added alongside, so re-authoring Pyrothar from volcanic to toxic actually
 * takes effect instead of leaving two tags where the first one wins by
 * accident of ordering.
 *
 * Runs at world build AND on snapshot load, for the same reason
 * reconcileFactionCapitals does: planet tags persist, so a code-only change
 * would leave every live save generating the old continental boards.
 */
export function applyHomeworldArchetypes(world: GameWorldState): number {
    let stamped = 0;
    const w = world as any;

    const stamp = (tags: string[] | undefined, tag: string): string[] | null => {
        const current = (tags ?? []).filter(t => String(t).toLowerCase().startsWith(ARCHETYPE_TAG_PREFIX));
        if (current.length === 1 && current[0] === tag) return null; // already correct
        const kept = (tags ?? []).filter(t => !String(t).toLowerCase().startsWith(ARCHETYPE_TAG_PREFIX));
        kept.push(tag);
        return kept;
    };

    for (const [factionId, home] of Object.entries(FACTION_CAPITALS)) {
        const tag = archetypeTag(home.archetype);

        for (const planet of (w.economy?.planets?.values?.() ?? [])) {
            if (planet?.factionId !== factionId || planet?.systemId !== home.systemId) continue;
            if (!(planet.tags ?? []).includes('homeworld')) continue;
            const next = stamp(planet.tags, tag);
            if (next) { planet.tags = next; stamped++; }
        }

        for (const planet of (w.construction?.planets?.values?.() ?? [])) {
            if (planet?.ownerId !== factionId || planet?.systemId !== home.systemId) continue;
            if (planet?.planetType !== 'capital') continue;
            const next = stamp(planet.tags, tag);
            if (next) { planet.tags = next; stamped++; }
        }
    }
    return stamped;
}

/**
 * Rename each faction's capital STAR SYSTEM to its homeworld name.
 *
 * The generated map hands out procedural labels ("Rim Node 68"), which is fine
 * for the other 553 systems and wrong for the fourteen a player calls home.
 * Idempotent, and it never touches a system that is not somebody's capital.
 *
 * Runs at world build, before visibility is seeded, so the name the player sees
 * on first reveal is already correct.
 */
export function applyHomeworldNames(systems: Map<string, SystemNode>): number {
    let renamed = 0;
    for (const { systemId, homeworldName } of Object.values(FACTION_CAPITALS)) {
        const system = systems.get(systemId);
        if (!system || system.name === homeworldName) continue;
        system.name = homeworldName;
        renamed++;
    }
    return renamed;
}

export interface CapitalAudit {
    /** Factions whose capital names no system in this galaxy. */
    unresolved: { factionId: string; capitalSystemId: string }[];
    /** Two factions holding the same capital. */
    collisions: { systemId: string; factionIds: string[] }[];
    /** Factions in the world with no entry in FACTION_CAPITALS at all. */
    unmapped: string[];
}

/**
 * Check every faction's capital against the live system map.
 *
 * This is the guard that would have caught the original bug: the ids were wrong
 * for as long as the game has existed, and nothing anywhere said so.
 */
export function auditFactionCapitals(world: GameWorldState): CapitalAudit {
    const audit: CapitalAudit = { unresolved: [], collisions: [], unmapped: [] };
    const systems = world.movement?.systems;
    const factions = world.economy?.factions;
    if (!systems?.size || !factions?.size) return audit;

    const bySystem = new Map<string, string[]>();
    for (const factionId of [...factions.keys()].sort()) {
        const faction = factions.get(factionId)!;
        const capital = faction.capitalSystemId;
        if (!FACTION_CAPITALS[factionId]) audit.unmapped.push(factionId);
        if (!capital || !systems.has(capital)) {
            audit.unresolved.push({ factionId, capitalSystemId: capital ?? '(none)' });
            continue;
        }
        if (!bySystem.has(capital)) bySystem.set(capital, []);
        bySystem.get(capital)!.push(factionId);
    }
    for (const [systemId, factionIds] of bySystem) {
        if (factionIds.length > 1) audit.collisions.push({ systemId, factionIds });
    }
    return audit;
}
