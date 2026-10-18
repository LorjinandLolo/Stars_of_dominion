// lib/ai/belt-ambush-ai.ts
// AI factions lay belt ambushes. Players got the belt stance (lib/movement/
// belts.ts) but the AI never used it, so a war against an AI empire had no
// trap to walk into. One deterministic turn per AI-run faction per tick:
//
//   1. Not at war with anyone → every lurker stands down.
//   2. An operational picket parked in a belt system takes the belt stance.
//   3. One idle picket per tick sails to the nearest TRAP system: a belt
//      system this faction owns (or nobody does) that borders enemy space —
//      the lane an invader must come down.
//   4. No picket at all → order one built at the capital through the
//      player's MIL_BUILD_FLEET + MIL_RECRUIT_FORMATION_UNIT (lib/ai/
//      ai-fleet-orders), with double the price in hand as the expansion AI
//      keeps. It lurks once its hulls are laid.
//
// Runs from tick step10b after tickAIExpansion, and stays out of its way: the
// expansion AI drives whichever own fleet sorts FIRST by id as its scout, so
// this module never touches that fleet and names its pickets so they sort
// after the scout. Same claimedFactionIds convention as every other AI service.

import type { Fleet } from '../movement/types';
import { hasAsteroidBelt, AMBUSH_WAR_ESCALATION } from '../movement/belts';
import { isFleetOperational, issueMoveOrder } from '../movement/movement-service';
import { minYardTierFor, type YardPlanetLike } from '../combat/shipyard-gate';
import { fleetBuildQuote, hasQueuedFleetBuild, queueAIFleetBuild, yardCanLay } from './ai-fleet-orders';
import { queueAIOrder } from './ai-orders';

/** Same test as lib/ai/war-ai.ts isWarfleetId — kept local so the two modules do not import each other. */
function isWarfleetId(id: string): boolean {
    return /-war-\d+$/.test(id);
}

/** The world slice this module reads and writes — GameWorldState satisfies it. */
export interface BeltAmbushWorldView {
    claimedFactionIds?: unknown;
    movement: {
        fleets: Map<string, Fleet>;
        systems: Map<string, { id: string; ownerId?: string | null; hyperlaneNeighbors?: string[] }>;
    };
    /** Planets, for the shipyard rule a picket must obey like any other hull. */
    construction: { planets: Map<string, YardPlanetLike> };
    rivalries: Map<string, { empireAId: string; empireBId: string; escalationLevel?: number }>;
    economy: { factions: Map<string, { name?: string; capitalSystemId?: string; reserves?: Record<string, number> }> };
    nowSeconds?: number;
}

// Three corvettes and a destroyer. Lowercase: the combat engine's counter grid
// and the tactical adapter key compositions by lowercase ship class
// (lib/combat/ship-registry.ts).
export const PICKET_COMPOSITION: Readonly<Record<string, number>> = { corvette: 3, destroyer: 1 };
/**
 * What MIL_BUILD_FLEET + the hull recruits charge for a picket, and its
 * finished rating. A function, not a constant: this module and
 * lib/ai/ai-fleet-orders import each other (through ai-orders).
 */
export function picketQuote(): { cost: Record<string, number>; power: number } {
    return fleetBuildQuote({ ...PICKET_COMPOSITION });
}
/** Yard tier the capital must have to lay every hull in the picket (1: the seeded Orbital Shipyard suffices). */
export const PICKET_REQUIRED_TIER = Math.max(...Object.keys(PICKET_COMPOSITION).map(minYardTierFor));
/** Pickets per faction at war — one per trap, at most this many. */
export const MAX_PICKETS = 2;
/** How far (hyperlane hops) a picket will travel to reach a trap. */
export const TRAP_SEARCH_HOPS = 4;

const NON_PLAYABLE = new Set(['faction-pirates', 'faction-neutral']);

export function isAIRunFaction(world: Pick<BeltAmbushWorldView, 'claimedFactionIds'>, factionId: string): boolean {
    if (NON_PLAYABLE.has(factionId)) return false;
    const claimed = world.claimedFactionIds;
    if (!Array.isArray(claimed)) return false; // no list → nobody is AI
    return !claimed.includes(factionId);
}

/** Factions this one is at war with (rivalry escalation at the ambush threshold). */
export function warEnemiesOf(world: Pick<BeltAmbushWorldView, 'rivalries'>, factionId: string): Set<string> {
    const out = new Set<string>();
    for (const r of world.rivalries.values()) {
        if ((r.escalationLevel ?? 0) < AMBUSH_WAR_ESCALATION) continue;
        if (r.empireAId === factionId) out.add(r.empireBId);
        else if (r.empireBId === factionId) out.add(r.empireAId);
    }
    return out;
}

function isParked(f: Fleet): boolean {
    return !!f.currentSystemId && !f.destinationSystemId;
}

function isPicketId(id: string): boolean {
    return /-trap-\d+$/.test(id);
}

/**
 * Belt systems where an ambush pays: owned by this faction or unclaimed, and
 * one hyperlane jump from a system an enemy owns. Sorted for determinism.
 */
export function trapSystemsFor(world: Pick<BeltAmbushWorldView, 'movement'>, factionId: string, enemies: ReadonlySet<string>): string[] {
    const out: string[] = [];
    for (const sys of world.movement.systems.values()) {
        if (!hasAsteroidBelt(sys.id)) continue;
        const owner = sys.ownerId ?? null;
        if (owner && owner !== factionId && owner !== 'faction-neutral') continue;
        const borders = (sys.hyperlaneNeighbors ?? []).some(n => {
            const o = world.movement.systems.get(n)?.ownerId;
            return !!o && enemies.has(o);
        });
        if (borders) out.push(sys.id);
    }
    return out.sort();
}

/** Nearest of `targets` from `from` by hyperlane hops (sorted-neighbour BFS), within `maxHops`. */
function nearestTarget(world: Pick<BeltAmbushWorldView, 'movement'>, from: string, targets: ReadonlySet<string>, maxHops: number): string | null {
    if (targets.has(from)) return from;
    const seen = new Set<string>([from]);
    let frontier = [from];
    for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
        const next: string[] = [];
        for (const id of frontier) {
            const neighbors = [...(world.movement.systems.get(id)?.hyperlaneNeighbors ?? [])].sort();
            for (const n of neighbors) {
                if (seen.has(n)) continue;
                seen.add(n);
                if (targets.has(n)) return n;
                next.push(n);
            }
        }
        frontier = next;
    }
    return null;
}

function canAfford(reserves: Record<string, number> | undefined, cost: Readonly<Record<string, number>>, headroom: number): boolean {
    if (!reserves) return false;
    // An untracked reserve key is free, as the order handlers charge it.
    return Object.entries(cost).every(([k, v]) => reserves[k] === undefined || reserves[k] >= v * headroom);
}

/**
 * Order a picket built at the capital through the player's orders. Returns the
 * id it will carry, or null when the yard cannot lay it or the treasury cannot
 * cover twice the price. Nothing exists until the worker drains the order.
 */
function orderPicket(world: BeltAmbushWorldView, factionId: string): string | null {
    const faction = world.economy.factions.get(factionId);
    const capital = faction?.capitalSystemId;
    if (!faction || !capital || !world.movement.systems.has(capital)) return null;
    // Same yard rule as every other hull, checked again by the handler.
    if (!yardCanLay(world, factionId, capital, { ...PICKET_COMPOSITION })) return null;
    if (!canAfford(faction.reserves, picketQuote().cost, 2)) return null;
    let ordinal = 1;
    while (world.movement.fleets.has(`fleet-${factionId}-trap-${ordinal}`)) ordinal++;
    const id = `fleet-${factionId}-trap-${ordinal}`;
    const queued = queueAIFleetBuild(world, {
        factionId,
        fleetId: id,
        name: `${faction.name ?? factionId} Belt Picket ${ordinal}`,
        composition: { ...PICKET_COMPOSITION },
        systemId: capital,
        reason: `belt picket ${ordinal}`,
        shapeFleet: (shell: any) => ({
            postureId: 'Consolidating',
            doctrine: { ...shell.doctrine, type: 'Defensive', retreatThreshold: 0.4 },
        }),
    });
    return queued ? id : null;
}

export interface BeltAmbushTurn {
    factionId: string;
    stoodDown: string[];
    lurking: string[];
    moved: { fleetId: string; to: string } | null;
    commissioned: string | null;
}

/** One faction's turn. Exported so tests can drive a single faction; the tick calls tickAIBeltAmbush. */
export function beltAmbushTurn(world: BeltAmbushWorldView, factionId: string): BeltAmbushTurn {
    const turn: BeltAmbushTurn = { factionId, stoodDown: [], lurking: [], moved: null, commissioned: null };
    const own = [...world.movement.fleets.values()]
        .filter(f => f.factionId === factionId)
        .sort((a, b) => a.id.localeCompare(b.id));
    // The expansion AI's scout is whichever own fleet sorts first — hands off.
    const scoutId = own[0]?.id ?? null;
    // Battle groups belong to the war AI (lib/ai/war-ai.ts).
    const pickets = own.filter(f => f.id !== scoutId && !isWarfleetId(f.id) && isFleetOperational(f));

    const enemies = warEnemiesOf(world, factionId);
    // Stances go through the player's MIL_FLEET_STANCE (belt system and parked
    // checks in the handler), drained with the rest of the AI's orders.
    const stance = (f: Fleet, s: 'belt' | 'open') => queueAIOrder(world, {
        factionId, actionId: 'MIL_FLEET_STANCE', payload: { fleetId: f.id, stance: s }, reason: `${f.id} ${s === 'belt' ? 'lurks' : 'stands down'}`,
    });
    if (enemies.size === 0) {
        for (const f of pickets) {
            if (f.stance === 'belt' && isParked(f) && stance(f, 'open')) turn.stoodDown.push(f.id);
        }
        return turn;
    }

    // 2. Parked in a belt → lurk.
    const lurking = new Set<string>();
    for (const f of pickets) {
        if (!isParked(f) || !hasAsteroidBelt(f.currentSystemId!)) continue;
        if (f.stance !== 'belt' && !stance(f, 'belt')) continue;
        lurking.add(f.id);
        turn.lurking.push(f.id);
    }

    // 3. One idle picket toward the nearest untended trap.
    const traps = trapSystemsFor(world, factionId, enemies);
    const tended = new Set<string>();
    for (const f of pickets) {
        if ((f.stance === 'belt' || lurking.has(f.id)) && f.currentSystemId) tended.add(f.currentSystemId);
        if (f.destinationSystemId) tended.add(f.destinationSystemId);
    }
    const open = new Set(traps.filter(id => !tended.has(id)));
    if (open.size > 0) {
        for (const f of pickets) {
            if (!isParked(f) || f.stance === 'belt' || lurking.has(f.id)) continue;
            const target = nearestTarget(world, f.currentSystemId!, open, TRAP_SEARCH_HOPS);
            if (!target) continue;
            try {
                const updated = issueMoveOrder(f, target, 'hyperlane', world.movement as any);
                world.movement.fleets.set(f.id, updated);
                turn.moved = { fleetId: f.id, to: target };
            } catch (e: any) {
                console.warn(`[Belt AI] ${factionId} picket ${f.id} could not reach ${target}: ${e?.message ?? e}`);
            }
            break;
        }
    }

    // 4. Nothing to lurk with → raise a picket (only once a scout exists, so
    //    the expansion AI never mistakes the picket for its survey wing).
    const wanted = Math.min(MAX_PICKETS, Math.max(1, traps.length));
    // A picket on the slip (empty, not yet operational) counts by its id, and
    // one still in the outbox by its order, so nothing is ordered twice.
    const existingPickets = own.filter(f => isPicketId(f.id)).length;
    if (scoutId && pickets.length < wanted && existingPickets < MAX_PICKETS
        && !hasQueuedFleetBuild(world, factionId, /-trap-\d+$/)) {
        const ordered = orderPicket(world, factionId);
        if (ordered) {
            turn.commissioned = ordered;
            console.log(`[Belt AI] ${factionId} orders ${ordered} built at its capital.`);
        }
    }
    return turn;
}

/** Every AI-run faction takes its belt turn. Never throws for one faction's sake. */
export function tickAIBeltAmbush(world: BeltAmbushWorldView): void {
    if (!Array.isArray(world.claimedFactionIds)) return;
    for (const factionId of [...world.economy.factions.keys()].sort()) {
        if (!isAIRunFaction(world, factionId)) continue;
        try {
            beltAmbushTurn(world, factionId);
        } catch (e) {
            console.error(`[Belt AI] ${factionId} turn failed:`, e);
        }
    }
}
