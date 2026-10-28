// lib/combat/shipyard-gate.ts
//
// The one rule for where a hull can be laid down:
//
//   A fleet can only take on a hull that a shipyard you own in its current
//   system can lay down. Yards come in two lines, both in orbit:
//     light — Fleet Drydock (patrol craft, corvettes; every capital starts
//             with one) → Reinforced Drydock (frigates) → Assault Drydock
//             (assault ships);
//     heavy — Spaceyard (destroyers) → Advanced Spaceyard (cruisers) →
//             Capital Spaceyard (carriers, battleships, dreadnoughts).
//   Old surface yards are moved up by foldSurfaceYards (lib/orbital).
//
// Worker (scripts/game-loop.ts MIL_BUILD_FLEET / MIL_RECRUIT_FORMATION_UNIT),
// the AI capital spawns (ai-expansion, belt-ambush-ai) and the recruit picker
// (components/units/ShipDesignPicker.tsx) all call the SAME functions here,
// so the client can never offer a hull the server refuses.
//
// Pure and client-safe: takes planet iterables, never a world; no lib/db.
// Checked at ORDER time only — RecruitmentService.completeJob is never gated,
// so a ship paid for at a yard is delivered wherever the fleet has sailed.

import { computeOrbitalRatings } from '../orbital/orbital-service';
import { drydockYardTier } from '../outposts/outpost-catalog';
import { ORBITAL_STRUCTURE_BY_ID } from '../../data/orbital-structures';
import type { OrbitalState } from '../orbital/orbital-types';
import { SHIP_CLASS_IDS, getHull, normalizeUnitKey } from './ship-registry';
import type { ShipClassId } from './ship-types';

/** Largest `shipyard_tier` (heavy line) effect any orbital structure grants (tested against the catalog). */
export const MAX_YARD_TIER = 3;

export type YardLine = 'light' | 'heavy';

/** Which yard line, at which tier, lays each hull. The whole gate is this table. */
export const HULL_YARD: Readonly<Record<ShipClassId, { line: YardLine; tier: number }>> = {
    patrol: { line: 'light', tier: 1 },
    corvette: { line: 'light', tier: 1 },
    frigate: { line: 'light', tier: 2 },
    assault: { line: 'light', tier: 3 },
    destroyer: { line: 'heavy', tier: 1 },
    cruiser: { line: 'heavy', tier: 2 },
    carrier: { line: 'heavy', tier: 3 },
    battleship: { line: 'heavy', tier: 3 },
    dreadnought: { line: 'heavy', tier: 3 },
    scout: { line: 'light', tier: 1 },
    torpedo_boat: { line: 'light', tier: 2 },
    raider: { line: 'light', tier: 3 },
    commando: { line: 'light', tier: 3 },
    minelayer: { line: 'light', tier: 2 },
    ewar: { line: 'light', tier: 3 },
    tender: { line: 'light', tier: 2 },
    supply_ship: { line: 'light', tier: 2 },
    interdictor: { line: 'heavy', tier: 2 },
    heavy_cruiser: { line: 'heavy', tier: 2 },
    troop_transport: { line: 'heavy', tier: 2 },
    siege_ship: { line: 'heavy', tier: 2 },
    command_ship: { line: 'heavy', tier: 3 },
    mobile_yard: { line: 'heavy', tier: 3 },
};

/**
 * Retired surface yards and the heavy tier they imply (each also counts as a
 * light tier 1 yard: it laid corvettes). No longer buildable — the worker
 * folds them into orbit — but one that found no free orbital slot still
 * counts until it does.
 */
export const SURFACE_YARD_TIERS: Readonly<Record<string, number>> = {
    orbital_shipyard: 1,
    fleet_drydock: 2,
};

const SURFACE_YARD_NAMES: Readonly<Record<string, string>> = {
    orbital_shipyard: 'Orbital Shipyard',
    fleet_drydock: 'Fleet Drydock',
};

/** What to build to reach a heavy tier — the text the player sees when refused. */
export const YARD_TIER_NAMES: Readonly<Record<number, string>> = {
    1: 'Spaceyard (Orbital tab)',
    2: 'Advanced Spaceyard',
    3: 'Capital Spaceyard',
};

/** What to build to reach a light tier. */
export const LIGHT_YARD_TIER_NAMES: Readonly<Record<number, string>> = {
    1: 'Fleet Drydock (Orbital tab)',
    2: 'Reinforced Drydock',
    3: 'Assault Drydock',
};

const stripTab = (name: string) => name.replace(/ \(Orbital tab\)$/, '');

export function yardNameFor(line: YardLine, tier: number): string {
    return (line === 'light' ? LIGHT_YARD_TIER_NAMES : YARD_TIER_NAMES)[tier] ?? `tier ${tier} ${line} yard`;
}

/** The slice of a planet this module reads — construction planets and the synced store shape both satisfy it. */
export interface YardPlanetLike {
    id: string;
    name?: string | null;
    ownerId?: string | null;
    systemId?: string | null;
    tiles?: Array<{ buildingId?: string | null; constructionState?: string }> | null;
    orbital?: OrbitalState | null;
}

export interface YardSource {
    /** Heavy line (Spaceyards): destroyers and up. */
    tier: number;
    /** Light line (Drydocks): patrol craft, corvettes, frigates, assault ships. */
    light: number;
    planetId: string | null;
    planetName: string | null;
    structureName: string | null;
}

export interface YardAnchor {
    systemId: string | null | undefined;
    systemName?: string | null;
    /** false while the fleet is under way (currentSystemId null or destination set). */
    holding: boolean;
}

export type YardGateCode = 'transit' | 'no_yard' | 'tier';

export type YardGateResult =
    | { ok: true; yard: YardSource }
    | { ok: false; code: YardGateCode; reason: string; yard: YardSource };

const NO_YARD: YardSource = Object.freeze({ tier: 0, light: 0, planetId: null, planetName: null, structureName: null });

/** The line and tier that lay this hull; null for anything that is not a ship class (fail-closed). */
export function hullYardFor(hullId: string | null | undefined): { line: YardLine; tier: number } | null {
    const key = normalizeUnitKey(hullId ?? '');
    return (HULL_YARD as Record<string, { line: YardLine; tier: number }>)[key] ?? null;
}

/** Lowest tier (on its own line) that lays this hull; Infinity for anything that is not a ship class. */
export function minYardTierFor(hullId: string | null | undefined): number {
    return hullYardFor(hullId)?.tier ?? Infinity;
}

/** Any yard at all, either line: what civilian hulls and a bare task force need. */
export function hasAnyYard(yard: Pick<YardSource, 'tier' | 'light'>): boolean {
    return yard.tier >= 1 || yard.light >= 1;
}

/** Can this yard lay this hull? false for anything that is not a ship class. */
export function yardCanLay(yard: Pick<YardSource, 'tier' | 'light'>, hullId: string | null | undefined): boolean {
    const need = hullYardFor(hullId);
    if (!need) return false;
    return (need.line === 'light' ? yard.light : yard.tier) >= need.tier;
}

/** Best yard on one planet: max(orbital tier, best active surface yard), with its name. */
export function planetYardSource(planet: YardPlanetLike | undefined | null, nowSeconds = 0): YardSource {
    if (!planet) return NO_YARD;
    const ratings = computeOrbitalRatings(planet as any, nowSeconds);
    const heavy = planetHeavySource(planet, ratings.shipyardTier);
    let light = ratings.lightYardTier;
    // Outpost drydocks and retired surface yards laid corvettes: light tier too.
    if (laysCorvettesOffOrbit(planet)) light = Math.max(light, 1);
    if (heavy.tier > 0) return { ...heavy, light };
    if (light > 0) {
        const slot = (planet.orbital?.slots ?? []).find(s => s?.structureId
            && (s.state === 'active' || s.state === 'damaged')
            && (ORBITAL_STRUCTURE_BY_ID[s.structureId]?.effects ?? []).some(e => e.type === 'light_yard_tier' && e.value === light));
        return { tier: 0, light, planetId: planet.id, planetName: planet.name ?? null, structureName: slot?.structureId ? (ORBITAL_STRUCTURE_BY_ID[slot.structureId]?.name ?? slot.structureId) : 'Fleet Drydock' };
    }
    return NO_YARD;
}

function laysCorvettesOffOrbit(planet: YardPlanetLike): boolean {
    const outpost: any = (planet as any).outpost;
    if (outpost?.base && !(outpost.colonists <= 0) && planetHeavySource(planet, 0).tier > 0) return true;
    return (planet.tiles ?? []).some(t => t?.buildingId && t.constructionState === 'active' && SURFACE_YARD_TIERS[t.buildingId] !== undefined);
}

/** Best heavy-line yard on one planet: max(orbital tier, outpost drydocks, retired surface yard). */
function planetHeavySource(planet: YardPlanetLike, orbitalTier: number): YardSource {
    let best: YardSource = NO_YARD;
    if (orbitalTier > best.tier) {
        const slot = (planet.orbital?.slots ?? []).find(s =>
            s?.structureId
            && (s.state === 'active' || s.state === 'damaged')
            && (ORBITAL_STRUCTURE_BY_ID[s.structureId]?.effects ?? []).some(e => e.type === 'shipyard_tier' && e.value === orbitalTier));
        best = {
            tier: orbitalTier,
            light: 0,
            planetId: planet.id,
            planetName: planet.name ?? null,
            structureName: slot?.structureId ? (ORBITAL_STRUCTURE_BY_ID[slot.structureId]?.name ?? slot.structureId) : 'Spaceyard',
        };
    }

    // A military base's drydocks (lib/outposts): one is a tier 1 yard, two tier 2.
    const outpost: any = (planet as any).outpost;
    if (outpost?.base && !(outpost.colonists <= 0)) {
        const docks = (outpost.cells ?? []).filter((c: any) => c?.module === 'drydock' && c.buildDoneShift === undefined && !c.off && !((c.downUntilShift ?? 0) > outpost.shift)).length;
        const tier = drydockYardTier(docks);
        if (tier > best.tier) best = { tier, light: 0, planetId: planet.id, planetName: planet.name ?? null, structureName: 'Drydock' };
    }

    for (const tile of planet.tiles ?? []) {
        if (!tile?.buildingId || tile.constructionState !== 'active') continue;
        const tier = SURFACE_YARD_TIERS[tile.buildingId];
        if (tier === undefined || tier <= best.tier) continue;
        best = {
            tier,
            light: 0,
            planetId: planet.id,
            planetName: planet.name ?? null,
            structureName: SURFACE_YARD_NAMES[tile.buildingId] ?? tile.buildingId,
        };
    }
    return best;
}

export function planetYardTier(planet: YardPlanetLike | undefined | null, nowSeconds = 0): number {
    return planetYardSource(planet, nowSeconds).tier;
}

/** Best yard this faction owns in a system; tier 0 with null fields when none (or no system). */
export function systemYardFor(
    planets: Iterable<YardPlanetLike>,
    factionId: string,
    systemId: string | null | undefined,
    nowSeconds = 0,
): YardSource {
    if (!systemId) return NO_YARD;
    // The two lines may be on different worlds of the system: best of each.
    let heavy: YardSource = NO_YARD;
    let light: YardSource = NO_YARD;
    for (const p of planets) {
        if (!p || p.ownerId !== factionId || p.systemId !== systemId) continue;
        const src = planetYardSource(p, nowSeconds);
        if (src.tier > heavy.tier) heavy = src;
        if (src.light > light.light) light = src;
    }
    if (heavy.tier > 0) return { ...heavy, light: light.light };
    return light.light > 0 ? { ...light, tier: 0 } : NO_YARD;
}

export function hullsBuildableAt(yard: Pick<YardSource, 'tier' | 'light'>): ShipClassId[] {
    return SHIP_CLASS_IDS.filter(h => yardCanLay(yard, h));
}

/** The cheapest next unlock on each line, for the yard hint. */
export function nextHullAfter(yard: Pick<YardSource, 'tier' | 'light'>): { hull: ShipClassId; line: YardLine; tier: number; yardName: string } | null {
    const next = SHIP_CLASS_IDS.find(h => !yardCanLay(yard, h));
    if (!next) return null;
    const need = HULL_YARD[next];
    return { hull: next, line: need.line, tier: need.tier, yardName: yardNameFor(need.line, need.tier) };
}

function systemLabel(anchor: YardAnchor): string {
    return anchor.systemName ?? anchor.systemId ?? 'this system';
}

export const TRANSIT_REASON = 'Fleet is under way — ships can only be commissioned while it holds in a system with your shipyard.';

export function noYardReason(anchor: YardAnchor): string {
    return `No shipyard of yours in ${systemLabel(anchor)}. Build a Fleet Drydock or a Spaceyard in orbit of a world you own here, or move the fleet to a system that has one.`;
}

/**
 * The gate. Order of checks: holding → owned yard in system → hull tier.
 * `hullId` null means a bare task force (MIL_BUILD_FLEET with nothing
 * chained), which needs any yard at all.
 */
export function checkShipyardGate(
    planets: Iterable<YardPlanetLike>,
    factionId: string,
    anchor: YardAnchor,
    hullId: string | null | undefined,
    nowSeconds = 0,
): YardGateResult {
    if (!anchor.holding) {
        return { ok: false, code: 'transit', reason: TRANSIT_REASON, yard: NO_YARD };
    }
    const yard = systemYardFor(planets, factionId, anchor.systemId, nowSeconds);
    if (!hasAnyYard(yard)) {
        const prefix = hullId ? '' : 'A task force can only be commissioned where you have a shipyard. ';
        return { ok: false, code: 'no_yard', reason: prefix + noYardReason(anchor), yard };
    }
    if (!hullId) return { ok: true, yard };

    const need = hullYardFor(hullId);
    const hullName = getHull(hullId)?.name ?? String(hullId);
    if (!need) {
        return { ok: false, code: 'tier', reason: `${hullName} is not a hull any yard can lay down.`, yard };
    }
    if (!yardCanLay(yard, hullId)) {
        const have = need.line === 'light' ? yard.light : yard.tier;
        return {
            ok: false,
            code: 'tier',
            reason: `${hullName} needs a tier ${need.tier} ${need.line === 'light' ? 'drydock' : 'spaceyard'} — ${yardNameFor(need.line, need.tier)}. ${systemLabel(anchor)} has ${have > 0 ? stripTab(yardNameFor(need.line, have)) : `no ${need.line === 'light' ? 'drydock' : 'spaceyard'}`}.`,
            yard,
        };
    }
    return { ok: true, yard };
}

/** Short card-footer text for a hull at this anchor, or null when it can be laid down. */
export function yardLockReason(yard: YardSource, anchor: YardAnchor, hullId: string): string | null {
    if (!anchor.holding) return 'Fleet under way';
    if (!hasAnyYard(yard)) return 'No shipyard here';
    const need = hullYardFor(hullId);
    if (!need) return 'Not a hull';
    if (!yardCanLay(yard, hullId)) return `Needs ${stripTab(yardNameFor(need.line, need.tier))}`;
    return null;
}
