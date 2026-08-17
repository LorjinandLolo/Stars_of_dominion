// lib/factions/civ-ids.ts
// Civilization identity, and nothing else.
//
// A leaf module on purpose. Faction mechanics need to be readable from deep
// inside engine services (cohesion, combat, infrastructure), but those services
// must not import a faction module wholesale — lib/factions/sarrak.ts already
// imports cohesion-service for distancesFromCapital, so a reverse import would
// close a cycle. Everything here is a pure read off world.economy.factions with
// no further imports, so anyone can depend on it safely.

import type { GameWorldState } from '../game-world-state';
import type { Grievance } from './faction-traits-types';

export const CIV_KAERRUUN = 'civ-kaerruun';
export const CIV_SARRAK = 'civ-sarrak';
export const CIV_BUTHARI = 'civ-buthari';
export const CIV_INFERNOID = 'civ-infernoid';
export const CIV_MOVANITE = 'civ-movanite';
export const CIV_LEOPANTHERI = 'civ-leopantheri';
export const CIV_RHIMETALS = 'civ-rhimetals';
export const CIV_GABAGOON = 'civ-gabagoon';
export const CIV_NEXULAN = 'civ-nexulan';
export const CIV_BANKING = 'civ-intergalactic';

/** The civilization a faction belongs to, or undefined. */
export function civilizationOf(world: GameWorldState, factionId: string): string | undefined {
    const faction = world?.economy?.factions?.get?.(factionId) as { civilizationId?: string } | undefined;
    return faction?.civilizationId;
}

export function isCivilization(world: GameWorldState, factionId: string, civId: string): boolean {
    return civilizationOf(world, factionId) === civId;
}

/**
 * The Buthari of Jabal.
 *
 * Exported here rather than from lib/factions/buthari.ts because the engine
 * services that need to ask (diplomacy's createOffer, the espionage service)
 * cannot import a faction module — buthari.ts imports offer-service, so the
 * reverse import would close a cycle.
 */
export function isButhari(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_BUTHARI);
}

/**
 * The Infernoids of Pyrothar.
 *
 * Here for the same reason: cold-war-service and pressure-service both need to
 * ask, and neither may import a faction module.
 */
export function isInfernoid(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_INFERNOID);
}

/**
 * How much war weariness a faction accrues, 0..1.
 *
 * Lives here rather than in sarrak.ts because its only consumer is
 * updateEmpireCohesion, and cohesion-service cannot import the faction module.
 *
 * The Sarrak accrue none — "Religious Cohesion: morale never drops due to war
 * weariness. High resistance to psychological attacks or culture flips."
 */
export function warFatigueResistance(world: GameWorldState, factionId: string): number {
    return isCivilization(world, factionId, CIV_SARRAK) ? 0 : 1;
}

/**
 * The Movanites of Graviton Vale.
 *
 * Here rather than in movanite.ts because the order loop in the worker and
 * population-service both need to ask, and neither may import a faction module.
 */
export function isMovanite(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_MOVANITE);
}

/**
 * The Leo-pantheri of Savarr'Tel.
 *
 * Here because government/modifiers.ts composes their honour standing as a
 * modifier source, and the worker charges honour at the order boundary.
 */
export function isLeopantheri(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_LEOPANTHERI);
}

/**
 * The Rhimetals of Aeiralux.
 *
 * Here because government/modifiers.ts composes their hive coherence and the
 * worker defers their unprovoked orders; neither may import a faction module.
 */
export function isRhimetals(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_RHIMETALS);
}

/**
 * The Gabagoonians of Meatballia Prima.
 *
 * Here because the press order handler in the worker resolves a vendetta victim,
 * and the terrain dispatcher asks whether they are waddling or surging.
 */
export function isGabagoon(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_GABAGOON);
}

/**
 * The Nexulan Convergence.
 *
 * Here because government/modifiers.ts composes their core starvation, the
 * combat manager reads their pre-cognition, and the diplomatic AI reads their
 * condescension — none of which may import a faction module.
 */
export function isNexulan(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_NEXULAN);
}

/**
 * The Intergalactic Banking Clan.
 *
 * Here because government/modifiers.ts composes their default cascade and the
 * worker's loan handlers gate on them; neither may import a faction module.
 */
export function isBankingClan(world: GameWorldState, factionId: string): boolean {
    return isCivilization(world, factionId, CIV_BANKING);
}

// ─── Grievances ─────────────────────────────────────────────────────────────
//
// The readers live in this leaf, not in buthari.ts where they started, because
// two civilizations now key off them and their consumers sit at different
// depths: the Buthari order gate, the Movanite FAFO clause read from the worker
// order loop, and population-service. buthari.ts imports offer-service, so any
// of those importing it would close a cycle. buthari.ts re-exports these so its
// own call sites and probe are unchanged.

/** How long a grievance entitles retaliation before it lapses. 60 strategic ticks. */
export const GRIEVANCE_DURATION_SECONDS = 60 * 6 * 60 * 60;

/**
 * The shared grievance record, back-filling from the old Buthari-only location.
 *
 * Grievances moved up to FactionTraitState when the Movanite FAFO clause needed
 * the same trigger. Live snapshots still carry them under `buthari.grievances`,
 * and without this hoist a Buthari empire mid-campaign would silently lose every
 * right of reply it had earned on the next worker restart.
 */
export function grievanceStore(
    world: GameWorldState,
    factionId: string,
): Record<string, Grievance> | undefined {
    const traits = world.factionTraits?.get(factionId);
    if (!traits) return undefined;
    if (!traits.grievances) {
        const legacy = traits.buthari?.grievances;
        traits.grievances = legacy && Object.keys(legacy).length ? { ...legacy } : {};
    }
    return traits.grievances;
}

/**
 * Whether this faction's civilization reads grievances at all.
 *
 * The single predicate both writers gate on — recordGrievance in buthari.ts and
 * recordGrievanceLocal in offer-service.ts. Keeping it in one place is the point:
 * the two guards drifted apart once already, and the result was two shipped
 * factions whose retaliation logic read a store nothing ever wrote to.
 */
export function readsGrievances(world: GameWorldState, factionId: string): boolean {
    const civ = civilizationOf(world, factionId);
    return civ === CIV_BUTHARI || civ === CIV_MOVANITE || civ === CIV_LEOPANTHERI
        || civ === CIV_RHIMETALS || civ === CIV_GABAGOON;
}

/** Every faction this one is currently entitled to answer. */
export function grievanceHolders(world: GameWorldState, factionId: string): string[] {
    const store = grievanceStore(world, factionId);
    if (!store) return [];
    const now = world.nowSeconds ?? 0;
    return Object.entries(store)
        .filter(([, g]) => now - g.sinceSeconds < GRIEVANCE_DURATION_SECONDS)
        .map(([id]) => id);
}

export function hasGrievanceAgainst(world: GameWorldState, factionId: string, targetId: string): boolean {
    return grievanceHolders(world, factionId).includes(targetId);
}
