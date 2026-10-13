// lib/combat/siege/formations.ts
//
// Formations are the pieces on the planetary board. Each one is a discrete
// stack of one unit type standing in one district, and it moves district to
// district across the adjacency graph — the ground war becomes positional
// instead of two abstract army pools grinding against each other.
//
// Pure functions: the worker owns the mutations, the client re-derives the
// same legal moves for display.

import type { PlanetSurface, TerrainType } from '../../planet-surface/types';
import type { GroundUnitType, TacticalStanceId } from './siege-types';
import type { DistrictWarState, DistrictController } from './siege-types';
import { buildAdjacency, controllerOf, isPassable } from './district-front';

export type FormationSide = 'attacker' | 'defender';

export interface Formation {
    id: string;
    side: FormationSide;
    unitType: GroundUnitType;
    /** Fighting men in the formation. At 0 it is destroyed. */
    strength: number;
    /**
     * Strength at creation or last reinforcement — the baseline woundedness is
     * measured against. Optional because formations in sieges that predate the
     * field have none; processSieges back-fills them on first sight, without
     * which every woundedness read would be a permanent zero.
     */
    maxStrength?: number;
    /** District it currently occupies (0-63). */
    sectorIndex: number;
    /** Ordered destination for the coming cycle, resolved simultaneously. */
    moveTo?: number | null;
    /**
     * Queued waypoints beyond the immediate move (shift-click a path). One
     * step is consumed per cycle, so a long march plays out over several.
     */
    path?: number[];
    /** Per-formation posture; falls back to the army-wide stance. */
    stance?: TacticalStanceId;
    /** 0-100 — drops when cut off from friendly ground. */
    supply: number;
    /**
     * 0-100 cohesion under fire. Strategic redeployment and hard marching
     * shred it; a disorganised formation fights at a fraction of its weight
     * and has to sit still to recover.
     */
    organization?: number;
    /** Moving by rail: fast and far, but arrives disorganised and vulnerable. */
    redeploying?: boolean;
    /** Battle-plan assignment, if any (see battle-plans.ts). */
    planId?: string | null;
    /** True when the formation has no path home: encircled and starving. */
    encircled?: boolean;
    /** Consecutive cycles at zero supply; at STARVE_SURRENDER_CYCLES it lays down its arms. */
    starvedCycles?: number;
}

export const ORG_MAX = 100;
/** Organisation regained per cycle when a formation holds still and is supplied. */
export const ORG_RECOVERY = 12;
/** Organisation burned per district crossed under strategic redeployment. */
export const ORG_REDEPLOY_COST = 22;
/** Organisation burned by an ordinary contested advance. */
export const ORG_MARCH_COST = 4;

/**
 * Movement points per cycle. Terrain costs are 1 (plains) to 2.2 (mountains)
 * and are multiplied by the formation's sensitivity, so these budgets decide
 * what each unit can actually cross: armour rolls over open ground but cannot
 * force a mountain range in one bound, while airborne can bound anywhere.
 */
const BASE_MOVE: Record<GroundUnitType, number> = {
    AIRBORNE: 3.2,      // air-mobile: two hops, terrain barely matters
    SPECIAL_OPS: 3.2,
    ARMOR: 2.2,         // fast on roads and plains, stopped by heights
    INFANTRY: 2,
    ANTI_ARMOR: 2,
    ARTILLERY: 1.8,     // the guns move last
    MILITIA: 1.6,       // militia defend their homes; they rarely march far
    ELDER_INFERNOID: 1.4, // ponderous — you see it coming a long way off
};

/** How costly a district is to enter. Ocean is impassable. */
const TERRAIN_COST: Record<TerrainType, number> = {
    plains: 1, desert: 1, urban: 1.5, forest: 1.5, ruins: 1.2,
    frozen: 1.8, jungle: 2, toxic: 1.8, mountains: 2.2, volcanic: 2,
    ocean: Infinity,
};

/** Heavy formations bog down off-road; light ones don't care as much. */
const TERRAIN_SENSITIVITY: Record<GroundUnitType, number> = {
    ARMOR: 1.4, ARTILLERY: 1.4, ANTI_ARMOR: 1.1,
    INFANTRY: 1, MILITIA: 1, AIRBORNE: 0.5, SPECIAL_OPS: 0.5,
    // Heavy, but it steps over what stops a tank rather than driving through it.
    ELDER_INFERNOID: 1.2,
};

export const isHeavy = (t: GroundUnitType) => t === 'ARMOR' || t === 'ARTILLERY';

/**
 * Whether this kind of formation can enter this terrain at all, off-road: a
 * single step costs more than its whole move budget otherwise (infantry and
 * armor never climb mountains). Plans route around such ground.
 */
export function canEverEnter(unitType: GroundUnitType, terrain: TerrainType): boolean {
    return TERRAIN_COST[terrain] * (TERRAIN_SENSITIVITY[unitType] ?? 1) <= (BASE_MOVE[unitType] ?? 2) + 1e-6;
}

/**
 * Splits an army's unit pool into board pieces, deployed on the districts that
 * side holds. Attackers come ashore at the beachhead; defenders stand on their
 * own ground, weighted toward the capital and the front.
 */
export function seedFormations(
    surface: PlanetSurface,
    war: DistrictWarState,
    side: FormationSide,
    composition: Partial<Record<GroundUnitType, number>>,
    idPrefix: string,
    /**
     * Where the pieces appear, overriding the side's default spread. Used for
     * mid-siege arrivals: a reinforcement comes ashore at the beachhead, a
     * garrison recruit musters at the capital — not scattered along a front
     * that may already be collapsing.
     */
    at?: number[],
): Formation[] {
    const home = surface.sectors
        .filter(s => isPassable(s) && controllerOf(war, s.index) === (side as DistrictController))
        .map(s => s.index);
    const anchor = at?.length
        ? at
        : side === 'attacker'
            ? (war.landingZones.length ? war.landingZones : home)
            : (home.length ? home : [0]);
    if (!anchor.length) return [];

    const out: Formation[] = [];
    let n = 0;
    for (const [unitType, total] of Object.entries(composition) as Array<[GroundUnitType, number]>) {
        if (!total || total <= 0) continue;
        // Break a unit pool into 1-3 stacks so a side has several pieces to
        // manoeuvre rather than one doom-stack.
        const stacks = Math.min(3, Math.max(1, Math.round(total / 600)));
        const per = Math.floor(total / stacks);
        for (let i = 0; i < stacks; i++) {
            const strength = i === stacks - 1 ? total - per * (stacks - 1) : per;
            if (strength <= 0) continue;
            out.push({
                id: `${idPrefix}-${unitType}-${n++}`,
                side,
                unitType,
                strength,
                maxStrength: strength,
                sectorIndex: anchor[(out.length) % anchor.length],
                supply: 100,
            });
        }
    }
    return out;
}

export interface MoveOption {
    sectorIndex: number;
    /** Movement points the step costs this formation. */
    cost: number;
    /** True when the destination is enemy-held — entering means a fight. */
    contested: boolean;
}

/**
 * Districts this formation may enter this cycle. Ocean blocks movement,
 * terrain costs movement points, and roads are ignored here (they are handled
 * by the caller passing a discount) — a heavy division cannot cross a mountain
 * range in one bound, but airborne can.
 */
export function legalMoves(
    surface: PlanetSurface,
    war: DistrictWarState,
    formation: Formation,
    roadLinks?: Set<string>,
    /**
     * Optional per-civilization override of what a district costs to enter,
     * given the terrain and the table's base cost.
     *
     * This function stays faction-blind — Formation carries a `side`, not a
     * faction id — exactly like resolveDistrictBattle: the CALLER resolves the
     * civilization and passes a number. Omitting it takes the original code
     * path unchanged, which is what the other thirteen empires do.
     *
     * Both callers must pass the same thing. legalMoves is server-authoritative
     * (the worker rejects an over-budget order) AND drives the client's reach
     * preview, so an override applied in only one place would show a player
     * moves the worker then refuses.
     */
    terrainCostOverride?: (terrain: TerrainType, base: number) => number,
): MoveOption[] {
    const adjacency = buildAdjacency(surface);
    const budget = BASE_MOVE[formation.unitType];
    const sensitivity = TERRAIN_SENSITIVITY[formation.unitType];
    const start = formation.sectorIndex;

    // Dijkstra-lite over a tiny graph.
    const best = new Map<number, number>([[start, 0]]);
    const queue: number[] = [start];
    while (queue.length) {
        const cur = queue.shift()!;
        const spent = best.get(cur) ?? 0;
        for (const n of adjacency[cur]) {
            const sec = surface.sectors[n];
            if (!isPassable(sec)) continue;
            const linked = roadLinks?.has(cur < n ? `${cur}-${n}` : `${n}-${cur}`);
            // A road halves the going; rough ground punishes heavy formations.
            const base = TERRAIN_COST[sec.terrain];
            const effective = terrainCostOverride ? terrainCostOverride(sec.terrain, base) : base;
            const raw = effective * (linked ? 0.5 : sensitivity);
            const cost = spent + raw;
            if (cost > budget + 1e-6) continue;
            if ((best.get(n) ?? Infinity) <= cost) continue;
            best.set(n, cost);
            // You may enter enemy ground, but not push through it in one move.
            if (controllerOf(war, n) === formation.side) queue.push(n);
        }
    }

    best.delete(start);
    return Array.from(best.entries()).map(([sectorIndex, cost]) => ({
        sectorIndex,
        cost,
        contested: controllerOf(war, sectorIndex) !== formation.side,
    }));
}

/**
 * Strategic redeployment: rail movement across friendly territory. Fast and
 * long-ranged, but it burns organisation, so a formation that redeploys into
 * a fight arrives in no state to win it.
 */
export function redeployRoute(
    surface: PlanetSurface,
    war: DistrictWarState,
    formation: Formation,
    target: number,
): number[] | null {
    const adjacency = buildAdjacency(surface);
    // Breadth-first over OWN territory only — you cannot rail through the enemy.
    const prev = new Map<number, number>();
    const seen = new Set<number>([formation.sectorIndex]);
    const queue = [formation.sectorIndex];
    while (queue.length) {
        const cur = queue.shift()!;
        if (cur === target) break;
        for (const n of adjacency[cur]) {
            if (seen.has(n) || !isPassable(surface.sectors[n])) continue;
            if (controllerOf(war, n) !== formation.side) continue;
            seen.add(n);
            prev.set(n, cur);
            queue.push(n);
        }
    }
    if (!seen.has(target) || target === formation.sectorIndex) return null;
    const route: number[] = [];
    let cur = target;
    while (cur !== formation.sectorIndex) {
        route.unshift(cur);
        const p = prev.get(cur);
        if (p == null) return null;
        cur = p;
    }
    return route;
}

/**
 * Applies ordered moves. Illegal or stale orders are dropped, not obeyed.
 * A formation with queued waypoints advances one step per cycle.
 */
export function resolveMoves(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    roadLinks?: Set<string>,
): string[] {
    const log: string[] = [];
    for (const f of formations) {
        if (f.strength <= 0) continue;

        // Rail movement covers several districts in one cycle at the cost of
        // organisation; it aborts the moment the route stops being friendly.
        if (f.redeploying && f.path?.length) {
            let steps = 0;
            while (f.path.length && steps < 3) {
                const next = f.path[0];
                if (controllerOf(war, next) !== f.side || !isPassable(surface.sectors[next])) {
                    f.path = [];
                    f.redeploying = false;
                    log.push(`${f.unitType} redeployment aborted — the line was cut.`);
                    break;
                }
                f.path.shift();
                f.sectorIndex = next;
                f.organization = Math.max(0, (f.organization ?? ORG_MAX) - ORG_REDEPLOY_COST);
                steps++;
            }
            if (!f.path.length) f.redeploying = false;
            f.moveTo = null;
            continue;
        }

        // Pull the next waypoint off a queued path when nothing else is ordered.
        if (f.moveTo == null && f.path?.length) f.moveTo = f.path.shift() ?? null;
        if (f.moveTo == null) continue;

        const options = legalMoves(surface, war, f, roadLinks);
        const ok = options.find(o => o.sectorIndex === f.moveTo);
        f.moveTo = null;
        if (!ok) {
            // The path is stale (terrain, or the enemy moved) — drop the rest
            // rather than marching the formation somewhere senseless.
            f.path = [];
            continue;
        }
        f.sectorIndex = ok.sectorIndex;
        f.organization = Math.max(0, (f.organization ?? ORG_MAX) - (ok.contested ? ORG_MARCH_COST * 2 : ORG_MARCH_COST));
        if (ok.contested) log.push(`${f.unitType} pushes into district ${ok.sectorIndex}.`);
    }
    return log;
}

/**
 * Formations that held still and are in supply pull themselves back together.
 * `fighting` is the set of districts where a battle resolved this cycle: a
 * formation standing in one is not resting, whatever its orders say.
 */
export function recoverOrganization(formations: Formation[], fighting?: Set<number>): void {
    for (const f of formations) {
        if (f.strength <= 0) continue;
        const moving = f.redeploying || (f.path?.length ?? 0) > 0 || f.moveTo != null;
        if (moving || f.encircled) continue;
        if (fighting?.has(f.sectorIndex)) continue;
        f.organization = Math.min(ORG_MAX, (f.organization ?? ORG_MAX) + ORG_RECOVERY * (f.supply / 100));
    }
}

/**
 * Where a side's reinforcements come ashore mid-siege: the beachhead for the
 * attacker, the deepest-held district (the capital while it stands) for the
 * defender. Null when the side holds nothing — there is nowhere to land.
 */
export function musterDistrict(
    surface: PlanetSurface,
    war: DistrictWarState,
    side: FormationSide,
    /**
     * Districts to muster at before the default, in order of preference —
     * the defender's barracks, then airbase (strongpoints.ts). Each must be
     * passable and held by `side`, or it is skipped.
     */
    preferred: number[] = [],
): number | null {
    for (const idx of preferred) {
        const sec = surface.sectors[idx];
        if (sec && isPassable(sec) && controllerOf(war, idx) === (side as DistrictController)) return idx;
    }
    if (side === 'attacker') {
        const held = war.landingZones.filter(i => controllerOf(war, i) === 'attacker');
        if (held.length) return held[0];
    }
    const own = surface.sectors
        .filter(s => isPassable(s) && controllerOf(war, s.index) === (side as DistrictController))
        .sort((a, b) => side === 'defender' ? a.ring - b.ring : b.ring - a.ring);
    return own.length ? own[0].index : null;
}

/**
 * Supply: a formation must trace friendly ground back to its base of
 * operations — the beachhead for an invader, the capital for a defender.
 * Anything cut off starts starving, which is how encirclement kills.
 */
export interface SupplyOptions {
    /**
     * Whether the beachhead is a supply source at all. False once the invader
     * has lost the orbit for longer than the blockade grace: with nothing
     * coming down from above, the landing zones feed nobody.
     */
    attackerBaseSupplied?: boolean;
    /**
     * Districts the defender draws supply from. Defaults to its own ground in
     * rings 0-1 (the capital core); a long blockade shrinks this to the core
     * plus the strongpoints it still mans.
     */
    defenderSources?: number[];
    /** Cycles at zero supply before a formation surrenders where it stands. */
    starveSurrenderCycles?: number;
}

export interface SupplyResult {
    log: string[];
    /** Men who starved into surrender this cycle, by side and type. Prisoners to the last man. */
    surrendered: Record<FormationSide, Partial<Record<GroundUnitType, number>>>;
}

export function updateSupply(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
    options: SupplyOptions = {},
): SupplyResult {
    const adjacency = buildAdjacency(surface);
    const log: string[] = [];
    const surrendered: SupplyResult['surrendered'] = { attacker: {}, defender: {} };

    const reachable = (side: FormationSide): Set<number> => {
        const sources = side === 'attacker'
            ? (options.attackerBaseSupplied === false ? [] : war.landingZones.filter(i => controllerOf(war, i) === 'attacker'))
            : (options.defenderSources
                ?? surface.sectors.filter(s => isPassable(s) && controllerOf(war, s.index) === 'defender' && s.ring <= 1).map(s => s.index))
                .filter(i => isPassable(surface.sectors[i]) && controllerOf(war, i) === 'defender');
        const seen = new Set<number>(sources);
        const queue = [...sources];
        while (queue.length) {
            const cur = queue.shift()!;
            for (const n of adjacency[cur]) {
                if (seen.has(n)) continue;
                if (!isPassable(surface.sectors[n])) continue;
                if (controllerOf(war, n) !== side) continue;
                seen.add(n);
                queue.push(n);
            }
        }
        return seen;
    };

    const supplied = { attacker: reachable('attacker'), defender: reachable('defender') };

    const surrenderAt = options.starveSurrenderCycles ?? Infinity;
    for (const f of formations) {
        if (f.strength <= 0) continue;
        const inSupply = supplied[f.side].has(f.sectorIndex);
        const was = f.encircled;
        f.encircled = !inSupply;
        if (inSupply) {
            f.supply = Math.min(100, f.supply + 20);
            f.starvedCycles = 0;
        } else {
            f.supply = Math.max(0, f.supply - 25);
            if (!was) log.push(`${f.unitType} in district ${f.sectorIndex} is cut off.`);
            if (f.supply <= 0) {
                f.starvedCycles = (f.starvedCycles ?? 0) + 1;
                if (f.starvedCycles >= surrenderAt) {
                    // Men who have not eaten in this long do not fight; they
                    // lay down their arms where they stand.
                    surrendered[f.side][f.unitType] = (surrendered[f.side][f.unitType] ?? 0) + f.strength;
                    log.push(`${f.strength} ${f.unitType} in district ${f.sectorIndex}, starved out, surrender.`);
                    f.strength = 0;
                    continue;
                }
                // Starving formations bleed out.
                f.strength = Math.max(0, Math.round(f.strength * 0.9));
            }
        }
    }
    return { log, surrendered };
}

/**
 * Ground with soldiers on it and no one to contest it changes hands without a
 * shot — this is how a manoeuvre force takes an undefended flank instead of
 * having to fight for every district.
 */
export function claimUndefended(
    surface: PlanetSurface,
    war: DistrictWarState,
    formations: Formation[],
): { captured: number[]; liberated: number[] } {
    const captured: number[] = [];
    const liberated: number[] = [];
    const presence = new Map<number, Set<FormationSide>>();
    for (const f of formations) {
        if (f.strength <= 0) continue;
        const set = presence.get(f.sectorIndex) ?? new Set<FormationSide>();
        set.add(f.side);
        presence.set(f.sectorIndex, set);
    }
    for (const [idx, sides] of presence) {
        if (sides.size !== 1) continue; // contested — settled by battle instead
        const holder: FormationSide = sides.has('attacker') ? 'attacker' : 'defender';
        if (controllerOf(war, idx) === holder) continue;
        if (holder === 'attacker') {
            war.control[idx] = 'attacker';
            captured.push(idx);
        } else {
            delete war.control[idx];
            liberated.push(idx);
        }
    }
    return { captured, liberated };
}

/**
 * One side's pieces summed back into an army pool. The pool on the siege
 * state is a DISPLAY of the formations and is rewritten from this every
 * cycle; the same sum decides what a winner keeps when a world changes hands.
 */
export function tallySide(formations: Formation[], side: FormationSide): {
    comp: Partial<Record<GroundUnitType, number>>;
    total: number;
    supply: number;
    org: number;
    encircledShare: number;
} {
    const comp: Partial<Record<GroundUnitType, number>> = {};
    let total = 0, supply = 0, org = 0, n = 0, encircled = 0;
    for (const f of formations) {
        if (f.side !== side || f.strength <= 0) continue;
        comp[f.unitType] = (comp[f.unitType] ?? 0) + f.strength;
        total += f.strength;
        supply += f.supply ?? 100;
        org += f.organization ?? 100;
        if (f.encircled) encircled++;
        n++;
    }
    return { comp, total, supply: n ? supply / n : 100, org: n ? org / n : 100, encircledShare: n ? encircled / n : 0 };
}

/** Formations standing in a district, optionally filtered to one side. */
export const formationsAt = (formations: Formation[], sectorIndex: number, side?: FormationSide) =>
    formations.filter(f => f.strength > 0 && f.sectorIndex === sectorIndex && (!side || f.side === side));

/** Districts where both sides have live formations — battles happen here. */
export function contestedDistricts(formations: Formation[]): number[] {
    const bySector = new Map<number, Set<FormationSide>>();
    for (const f of formations) {
        if (f.strength <= 0) continue;
        const set = bySector.get(f.sectorIndex) ?? new Set<FormationSide>();
        set.add(f.side);
        bySector.set(f.sectorIndex, set);
    }
    return Array.from(bySector.entries())
        .filter(([, sides]) => sides.size > 1)
        .map(([idx]) => idx)
        .sort((a, b) => a - b);
}

/** Drops destroyed formations. */
export const pruneFormations = (formations: Formation[]) => formations.filter(f => f.strength > 0);
