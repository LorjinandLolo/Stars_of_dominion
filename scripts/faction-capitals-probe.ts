// scripts/faction-capitals-probe.ts
// Do all fourteen factions exist as places, with an identity, that trade can reach?
//
// Ten of them used to carry placeholder capital ids matching no system, which
// silently disabled trade routes, cohesion distance-from-capital and the pirate
// reach penalty for those factions while seeding 80 orphan planet records.
// Nine referenced civilizations that were never written.
//
//   npx tsx scripts/faction-capitals-probe.ts
//
// Boots the world from generated-systems.json — no database, no worker.

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { auditFactionCapitals, FACTION_CAPITALS, homeworldArchetypeFor } from '../lib/galaxy/faction-capitals';
import { generateSurface, ARCHETYPE_TAG_PREFIX } from '../lib/planet-surface/generator';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { CivilizationRegistry } from '../lib/civilization/registry';
import { validateCivilizationModifierKeys, getCivilizationModifiers } from '../lib/civilization/modifiers';
import { buildTradeGraph } from '../lib/trade-system/graph-adapter';
import { findBestRoute } from '../lib/trade-system/pathfinding';
import { Resource } from '../lib/trade-system/types';

let failures = 0;
const fail = (msg: string) => { failures++; console.log(`  FAIL  ${msg}`); };

const world = getGameWorldState();
const factions = [...world.economy.factions.values()];
const systems = world.movement.systems;

console.log(`\n=== identity (${factions.length} factions, ${systems.size} systems) ===`);
console.log('faction'.padEnd(24), 'capital system'.padEnd(24), 'homeworld'.padEnd(18), 'civ'.padEnd(20), 'ideology');
for (const f of factions) {
    const sys: any = systems.get(f.capitalSystemId);
    const civ = (f as any).civilizationId;
    const ideo = (f as any).ideologyId;
    const civOk = !!CivilizationRegistry.getCivilization(civ);
    const ideoOk = !!CivilizationRegistry.getIdeology(ideo);
    if (!sys) fail(`${f.id}: capital "${f.capitalSystemId}" is not a system`);
    if (!civOk) fail(`${f.id}: civilizationId "${civ}" matches no CIVILIZATIONS entry`);
    if (!ideoOk) fail(`${f.id}: ideologyId "${ideo}" matches no IDEOLOGIES entry`);
    console.log(
        f.id.padEnd(24),
        String(f.capitalSystemId).slice(0, 23).padEnd(24),
        String(sys?.name ?? '—').padEnd(18),
        `${civOk ? ' ' : '!'}${civ}`.padEnd(20),
        `${ideoOk ? ' ' : '!'}${ideo}`
    );
}

console.log(`\n=== homeworld names reached the map ===`);
for (const [factionId, { systemId, homeworldName }] of Object.entries(FACTION_CAPITALS)) {
    const sys: any = systems.get(systemId);
    if (!sys) { fail(`${factionId}: mapped system ${systemId} does not exist`); continue; }
    if (sys.name !== homeworldName) fail(`${factionId}: system named "${sys.name}", expected "${homeworldName}"`);
    // The capital PLANET should carry it too.
    const planet: any = [...world.construction.planets.values()]
        .find((p: any) => p.systemId === systemId && p.ownerId === factionId && p.planetType === 'capital');
    if (!planet) fail(`${factionId}: no capital planet in ${systemId}`);
    else if (planet.name !== homeworldName) fail(`${factionId}: capital planet named "${planet.name}", expected "${homeworldName}"`);
}
console.log(`  ${Object.keys(FACTION_CAPITALS).length} homeworlds named on both the system and the capital planet`);

console.log(`\n=== no orphan planets ===`);
const orphanEco = [...world.economy.planets.values()].filter(p => !systems.has(p.systemId));
const orphanCon = [...world.construction.planets.values()].filter((p: any) => !systems.has(p.systemId));
if (orphanEco.length) fail(`${orphanEco.length} economy planets sit in systems that do not exist`);
if (orphanCon.length) fail(`${orphanCon.length} construction planets sit in systems that do not exist`);
console.log(`  economy planets ${world.economy.planets.size}, construction planets ${world.construction.planets.size}, orphans ${orphanEco.length + orphanCon.length}`);

const audit = auditFactionCapitals(world);
if (audit.unresolved.length) fail(`${audit.unresolved.length} unresolved capital(s): ${audit.unresolved.map(u => u.factionId).join(', ')}`);
if (audit.collisions.length) fail(`capital collision: ${audit.collisions.map(c => `${c.systemId} <- ${c.factionIds.join('+')}`).join('; ')}`);
if (audit.unmapped.length) fail(`factions with no FACTION_CAPITALS entry: ${audit.unmapped.join(', ')}`);

console.log(`\n=== civilization identity moves the numbers ===`);
let withMods = 0;
for (const f of factions) {
    const tech = getCivilizationModifiers(world, f.id, 'tech');
    const gov = getCivilizationModifiers(world, f.id, 'government');
    const n = Object.keys(tech).length + Object.keys(gov).length;
    if (n > 0) withMods++;
    else fail(`${f.id}: resolves to no modifiers at all`);
}
console.log(`  ${withMods}/${factions.length} factions carry live civilization + ideology modifiers`);

const keyAudit = validateCivilizationModifierKeys(world);
if (keyAudit.unknown.length) {
    fail(`unrecognised authored keys: ${keyAudit.unknown.map(u => `${u.source}.${u.key}`).join(', ')}`);
}
if (keyAudit.danglingIds.length) {
    fail(`dangling identity ids: ${keyAudit.danglingIds.map(d => `${d.factionId}.${d.field}=${d.value}`).join(', ')}`);
}
console.log(`  unused definitions (harmless): ${keyAudit.unusedDefinitions.join(', ') || 'none'}`);

console.log(`\n=== AI doctrine biases actually match ===`);
// Only these literals are tested by StrategicAIService.manageDoctrines.
const LIVE = {
    military: ['aggressive', 'mass_assault', 'decisive_battle', 'defensive', 'guerilla_warfare', 'active_defense'],
    economic: ['expansionist', 'biological_extraction', 'mercantile', 'free_market', 'resource_tribute'],
    intelligence: ['internal_security', 'synaptic_infiltration', 'corporate_espionage', 'covert_ops', 'defensive', 'aggressive'],
};
for (const f of factions) {
    const civ = CivilizationRegistry.getCivilization((f as any).civilizationId);
    if (!civ) continue;
    for (const axis of ['military', 'economic', 'intelligence'] as const) {
        const authored = civ.doctrineBiases?.[axis] ?? [];
        if (!authored.length) { fail(`${civ.id}: no ${axis} doctrine bias`); continue; }
        if (!authored.some(b => LIVE[axis].includes(b))) {
            fail(`${civ.id}: ${axis} biases [${authored.join(', ')}] match nothing the AI tests — falls back to balanced`);
        }
    }
}
console.log(`  every civilization steers at least one doctrine on each axis`);

console.log(`\n=== capital-to-capital routing ===`);
const graph = buildTradeGraph(world);
console.log(`  trade graph: ${graph.nodes.length} nodes, ${graph.edges.length} directed edges`);
const empty = new Map();
let pairs = 0, routable = 0, worst = 0, hopTotal = 0;
for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
        pairs++;
        const res = findBestRoute(graph, factions[i].capitalSystemId, factions[j].capitalSystemId,
            factions[i].id, Resource.METALS, empty, empty, empty);
        if (res) { routable++; hopTotal += res.path.length - 1; worst = Math.max(worst, res.path.length - 1); }
        else fail(`no route ${factions[i].id} -> ${factions[j].id}`);
    }
}
console.log(`  ${routable}/${pairs} capital pairs routable, mean ${(hopTotal / Math.max(1, routable)).toFixed(1)} hops, longest ${worst}`);

// ── homeworld terrain identity ──────────────────────────────────────────────
//
// Every capital used to generate `continental`, whatever its lore said: the only
// hints present are planetType 'capital' and a 'homeworld' tag, and those match
// the continental test at the BOTTOM of inferArchetype's chain. Pyrothar, "ash
// cloud and molten rock", had zero volcanic districts. Nothing reported it,
// because continental is a legitimate branch.
console.log(`\n=== homeworld terrain matches the fiction ===`);
{
    const capitalOf = (w: any, factionId: string, systemId: string): any =>
        [...w.construction.planets.values()].find(
            (p: any) => p.systemId === systemId && p.ownerId === factionId && p.planetType === 'capital');

    const mix = (surface: any): Record<string, number> => {
        const counts: Record<string, number> = {};
        for (const s of surface.sectors) counts[s.terrain] = (counts[s.terrain] ?? 0) + 1;
        return counts;
    };
    const dominant = (surface: any): string =>
        Object.entries(mix(surface)).sort((a, b) => b[1] - a[1])[0][0];

    const surfaces = new Map<string, any>();
    let allContinental = true;
    for (const [factionId, home] of Object.entries(FACTION_CAPITALS)) {
        const planet = capitalOf(world, factionId, home.systemId);
        if (!planet) { fail(`${factionId}: no capital planet to check terrain on`); continue; }
        const surface = generateSurface(planet.id, planet.planetType, planet.tags);
        surfaces.set(factionId, surface);
        if (surface.archetype !== home.archetype) {
            fail(`${home.homeworldName}: generated ${surface.archetype}, authored ${home.archetype}`);
        }
        if (surface.archetype !== 'continental') allContinental = false;
        console.log(
            `  ${home.homeworldName.padEnd(18)} ${String(surface.archetype).padEnd(12)}` +
            Object.entries(mix(surface)).sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([t, n]) => ` ${t} ${n}`).join(','));
    }

    // The regression guard: the ORIGINAL bug was uniformity, so assert it is gone.
    if (allContinental) fail('every homeworld is continental again — the archetype tag is not reaching generateSurface');

    // Each claim below quotes the civilization's own lore.
    const has = (factionId: string, terrain: string) => (mix(surfaces.get(factionId)) [terrain] ?? 0);
    if (has('faction-infernoids', 'volcanic') <= 0) fail('Pyrothar has no volcanic districts — "ash cloud and molten rock"');
    if (dominant(surfaces.get('faction-buthari')) !== 'mountains') fail('Jabal is not mountain-dominant — "mist-covered plateau and carved cliff dwelling"');
    if (dominant(surfaces.get('faction-sarrak')) !== 'jungle') fail('Gor’Zhul is not jungle-dominant — "bioluminescent swamp, carnivorous flora"');
    if (dominant(surfaces.get('faction-kaerruun')) !== 'jungle') fail('Rrriiaa is not jungle-dominant — "twilight deathworld where everything hunts"');
    if (dominant(surfaces.get('nexulan_convergence')) !== 'urban') fail('The Solara Shell is not urban-dominant — "its interior one continuous laboratory"');

    // Sarrak biome affinity keys on jungle terrain. Before this it worked only
    // because Gor'Zhul happened to roll jungle 15 out of the continental pool.
    if (has('faction-sarrak', 'jungle') < 20) fail(`Gor’Zhul jungle ${has('faction-sarrak', 'jungle')}/64 — too thin for biome affinity to bite`);

    // The landBias guard. Every capital passes 'capital' as its type hint, and
    // landBias shrinks ocean blobs to 0.32 pull — which silently drained the one
    // authored ocean world down to 7 districts. Same class of bug as the one
    // above: a generic rule beating authored intent.
    if (has('faction-rhimetals', 'ocean') < 15) fail(`Aeiralux ocean ${has('faction-rhimetals', 'ocean')}/64 — landBias is draining an authored ocean world`);

    // Colonies must NOT be touched. The whole claim that this change is contained
    // rests on it reshuffling the fourteen capitals and nothing else.
    const taggedNonCapitals = [...world.construction.planets.values()].filter(
        (p: any) => p.planetType !== 'capital' && (p.tags ?? []).some((t: string) => String(t).startsWith(ARCHETYPE_TAG_PREFIX)));
    if (taggedNonCapitals.length) fail(`${taggedNonCapitals.length} non-capital planets carry an archetype tag`);

    // A typo'd tag must fall through to inference, not reach ARCHETYPE_TERRAIN
    // as undefined and fail deep inside terrain generation.
    const bogus = generateSurface('probe-bogus-archetype', 'capital', ['homeworld', `${ARCHETYPE_TAG_PREFIX}vulcanic`]);
    if (bogus.archetype !== 'continental') fail(`a typo'd archetype tag produced "${bogus.archetype}" instead of falling through`);

    // Determinism: the board is generated, never stored, so client and worker
    // must agree every time.
    const p = capitalOf(world, 'faction-infernoids', FACTION_CAPITALS['faction-infernoids'].systemId);
    if (generateSurface(p.id, p.planetType, p.tags).archetype !== 'volcanic') fail('archetype is not stable across calls');

    // ── the live-save path ──
    // Planet tags persist, so a code-only change would leave every existing save
    // on the old continental boards. Build a legacy snapshot by stripping the
    // tags, and prove a load heals it.
    const legacy = deserializeWorld(serializeWorld(world));
    for (const pl of [...(legacy as any).construction.planets.values(), ...(legacy as any).economy.planets.values()]) {
        (pl as any).tags = ((pl as any).tags ?? []).filter((t: string) => !String(t).startsWith(ARCHETYPE_TAG_PREFIX));
    }
    const stripped = capitalOf(legacy, 'faction-infernoids', FACTION_CAPITALS['faction-infernoids'].systemId);
    if (generateSurface(stripped.id, stripped.planetType, stripped.tags).archetype !== 'continental') {
        fail('the legacy fixture is not actually broken — this test would pass for the wrong reason');
    }
    const healed = deserializeWorld(serializeWorld(legacy));
    const healedPlanet = capitalOf(healed, 'faction-infernoids', FACTION_CAPITALS['faction-infernoids'].systemId);
    if (generateSurface(healedPlanet.id, healedPlanet.planetType, healedPlanet.tags).archetype !== 'volcanic') {
        fail('a legacy save does not heal on load — existing games keep the continental boards');
    }
    const authored = Object.keys(FACTION_CAPITALS).filter(f => homeworldArchetypeFor(f));
    console.log(`  ${authored.length}/14 archetypes authored, legacy saves heal on load`);
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ all fourteen factions are real places with real identities\n`);
process.exit(failures ? 1 : 0);
