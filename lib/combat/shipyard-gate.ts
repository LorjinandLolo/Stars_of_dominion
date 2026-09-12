// lib/combat/shipyard-gate.ts
//
// The one rule for where a hull can be laid down:
//
//   A fleet can only take on a hull that a shipyard you own in its current
//   system can lay down — your capital's Orbital Shipyard lays corvettes and
//   destroyers, an Advanced Spaceyard (or a surface Fleet Drydock) adds
//   cruisers, a Capital Spaceyard adds battleships.
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
import { ORBITAL_STRUCTURE_BY_ID } from '../../data/orbital-structures';
import type { OrbitalState } from '../orbital/orbital-types';
import { SHIP_CLASS_IDS, getHull, normalizeUnitKey } from './ship-registry';
import type { ShipClassId } from './ship-types';

/** Largest `shipyard_tier` effect any orbital structure grants (tested against the catalog). */
export const MAX_YARD_TIER = 3;

/** Lowest yard tier that lays each hull. The whole gate is this table. */
export const HULL_MIN_YARD_TIER: Readonly<Record<ShipClassId, number>> = {
    corvette: 1,
    destroyer: 1,
    cruiser: 2,
    battleship: 3,
};

/**
 * Surface buildings that count as a yard, and the tier they imply. The
 * seeded capital tile `orbital_shipyard` is what makes every faction tier 1
 * from its first cycle. Battleships are orbital-only by design: a surface-only
 * empire tops out at cruisers.
 */
export const SURFACE_YARD_TIERS: Readonly<Record<string, number>> = {
    orbital_shipyard: 1,
    fleet_drydock: 2,
};

const SURFACE_YARD_NAMES: Readonly<Record<string, string>> = {
    orbital_shipyard: 'Orbital Shipyard',
    fleet_drydock: 'Fleet Drydock',
};

/** What to build to reach a tier — the text the player sees when refused. */
export const YARD_TIER_NAMES: Readonly<Record<number, string>> = {
    1: 'Orbital Shipyard (surface) or Spaceyard',
    2: 'Advanced Spaceyard (or a surface Fleet Drydock)',
    3: 'Capital Spaceyard',
};

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
    tier: number;
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

const NO_YARD: YardSource = Object.freeze({ tier: 0, planetId: null, planetName: null, structureName: null });

/** Lowest tier that lays this hull; Infinity for anything that is not a ship class (fail-closed). */
export function minYardTierFor(hullId: string | null | undefined): number {
    const key = normalizeUnitKey(hullId ?? '');
    const tier = (HULL_MIN_YARD_TIER as Record<string, number>)[key];
    return tier === undefined ? Infinity : tier;
}

/** Best yard on one planet: max(orbital tier, best active surface yard), with its name. */
export function planetYardSource(planet: YardPlanetLike | undefined | null, nowSeconds = 0): YardSource {
    if (!planet) return NO_YARD;
    let best: YardSource = NO_YARD;

    const orbitalTier = computeOrbitalRatings(planet as any, nowSeconds).shipyardTier;
    if (orbitalTier > best.tier) {
        const slot = (planet.orbital?.slots ?? []).find(s =>
            s?.structureId
            && (s.state === 'active' || s.state === 'damaged')
            && (ORBITAL_STRUCTURE_BY_ID[s.structureId]?.effects ?? []).some(e => e.type === 'shipyard_tier' && e.value === orbitalTier));
        best = {
            tier: orbitalTier,
            planetId: planet.id,
            planetName: planet.name ?? null,
            structureName: slot?.structureId ? (ORBITAL_STRUCTURE_BY_ID[slot.structureId]?.name ?? slot.structureId) : 'Spaceyard',
        };
    }

    for (const tile of planet.tiles ?? []) {
        if (!tile?.buildingId || tile.constructionState !== 'active') continue;
        const tier = SURFACE_YARD_TIERS[tile.buildingId];
        if (tier === undefined || tier <= best.tier) continue;
        best = {
            tier,
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
    let best: YardSource = NO_YARD;
    for (const p of planets) {
        if (!p || p.ownerId !== factionId || p.systemId !== systemId) continue;
        const src = planetYardSource(p, nowSeconds);
        if (src.tier > best.tier) best = src;
    }
    return best;
}

export function hullsBuildableAt(tier: number): ShipClassId[] {
    return SHIP_CLASS_IDS.filter(h => HULL_MIN_YARD_TIER[h] <= tier);
}

export function nextHullAfter(tier: number): { hull: ShipClassId; tier: number; yardName: string } | null {
    const next = SHIP_CLASS_IDS.find(h => HULL_MIN_YARD_TIER[h] > tier);
    if (!next) return null;
    const need = HULL_MIN_YARD_TIER[next];
    return { hull: next, tier: need, yardName: YARD_TIER_NAMES[need] ?? `tier ${need} yard` };
}

function systemLabel(anchor: YardAnchor): string {
    return anchor.systemName ?? anchor.systemId ?? 'this system';
}

export const TRANSIT_REASON = 'Fleet is under way — ships can only be commissioned while it holds in a system with your shipyard.';

export function noYardReason(anchor: YardAnchor): string {
    return `No shipyard of yours in ${systemLabel(anchor)}. Build an Orbital Shipyard on a world you own here, or move the fleet to a system that has one.`;
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
    if (yard.tier < 1) {
        const prefix = hullId ? '' : 'A task force can only be commissioned where you have a shipyard. ';
        return { ok: false, code: 'no_yard', reason: prefix + noYardReason(anchor), yard };
    }
    if (!hullId) return { ok: true, yard };

    const need = minYardTierFor(hullId);
    const hullName = getHull(hullId)?.name ?? String(hullId);
    if (!Number.isFinite(need)) {
        return { ok: false, code: 'tier', reason: `${hullName} is not a hull any yard can lay down.`, yard };
    }
    if (need > yard.tier) {
        const where = yard.structureName && yard.planetName ? ` (${yard.structureName} at ${yard.planetName})` : '';
        return {
            ok: false,
            code: 'tier',
            reason: `${hullName} needs a tier ${need} yard — ${YARD_TIER_NAMES[need] ?? `tier ${need}`}. ${systemLabel(anchor)} has tier ${yard.tier}${where}.`,
            yard,
        };
    }
    return { ok: true, yard };
}

/** Short card-footer text for a hull at this anchor, or null when it can be laid down. */
export function yardLockReason(yard: YardSource, anchor: YardAnchor, hullId: string): string | null {
    if (!anchor.holding) return 'Fleet under way';
    if (yard.tier < 1) return 'No shipyard here';
    const need = minYardTierFor(hullId);
    if (need > yard.tier) return Number.isFinite(need) ? `Needs tier-${need} yard` : 'Not a hull';
    return null;
}
