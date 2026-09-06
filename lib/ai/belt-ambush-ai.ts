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
//   4. No picket at all → commission one at the capital, paid from the
//      treasury at the same double-headroom rule the expansion AI uses.
//
// Runs from tick step10b after tickAIExpansion, and stays out of its way: the
// expansion AI drives whichever own fleet sorts FIRST by id as its scout, so
// this module never touches that fleet and names its pickets so they sort
// after the scout. Same claimedFactionIds convention as every other AI service.

import type { Fleet } from '../movement/types';
import { hasAsteroidBelt, AMBUSH_WAR_ESCALATION } from '../movement/belts';
import { isFleetOperational, issueMoveOrder } from '../movement/movement-service';

/** The world slice this module reads and writes — GameWorldState satisfies it. */
export interface BeltAmbushWorldView {
    claimedFactionIds?: unknown;
    movement: {
        fleets: Map<string, Fleet>;
        systems: Map<string, { id: string; ownerId?: string | null; hyperlaneNeighbors?: string[] }>;
    };
    rivalries: Map<string, { empireAId: string; empireBId: string; escalationLevel?: number }>;
    economy: { factions: Map<string, { name?: string; capitalSystemId?: string; reserves?: Record<string, number> }> };
}

/** Three corvettes and a destroyer, priced like the player's MIL_BUILD_FLEET + hull recruits. */
export const PICKET_COST: Readonly<Record<string, number>> = { CREDITS: 5200, METALS: 2100 };
export const PICKET_COMPOSITION: Readonly<Record<string, number>> = { CORVETTE: 3, DESTROYER: 1 };
/** 100 base + 3×10 + 22, matching data/combat/ground-units.json power values. */
export const PICKET_BASE_POWER = 152;
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
    return Object.entries(cost).every(([k, v]) => (reserves[k] ?? 0) >= v * headroom);
}

function commissionPicket(world: BeltAmbushWorldView, factionId: string, ordinal: number): Fleet | null {
    const faction = world.economy.factions.get(factionId);
    const capital = faction?.capitalSystemId;
    if (!faction || !capital || !world.movement.systems.has(capital)) return null;
    const reserves = faction.reserves;
    if (!canAfford(reserves, PICKET_COST, 2)) return null;
    for (const [k, v] of Object.entries(PICKET_COST)) reserves![k] = (reserves![k] ?? 0) - v;

    const id = `fleet-${factionId}-trap-${ordinal}`;
    const fleet: Fleet = {
        id,
        factionId,
        name: `${faction.name ?? factionId} Belt Picket ${ordinal}`,
        currentSystemId: capital,
        destinationSystemId: null,
        activeLayer: null,
        transitProgress: 0,
        etaSeconds: 0,
        plannedPath: [],
        orders: [],
        doctrine: {
            type: 'Defensive',
            deviationFromPosture: 0,
            preferredLayers: ['hyperlane'],
            retreatThreshold: 0.4,
            logisticsStrain: 0,
            moraleDrift: 0,
            supplyLevel: 1.0,
        },
        postureId: 'Consolidating',
        strength: 1.0,
        basePower: PICKET_BASE_POWER,
        composition: { ...PICKET_COMPOSITION },
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
            trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
            corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
            gate: { speedMultiplier: 10.0, detectabilityMultiplier: 2.0, supplyStrainMultiplier: 1.0 },
            deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 0.2, supplyStrainMultiplier: 1.0 },
        },
        isDetectable: true,
        orbitingPlanetId: null,
        arrivalOrbitPlanetId: null,
        stance: null,
    } as Fleet;
    world.movement.fleets.set(id, fleet);
    return fleet;
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
    const pickets = own.filter(f => f.id !== scoutId && isFleetOperational(f));

    const enemies = warEnemiesOf(world, factionId);
    if (enemies.size === 0) {
        for (const f of pickets) {
            if (f.stance === 'belt') { f.stance = null; turn.stoodDown.push(f.id); }
        }
        return turn;
    }

    // 2. Parked in a belt → lurk.
    for (const f of pickets) {
        if (!isParked(f) || !hasAsteroidBelt(f.currentSystemId!)) continue;
        if (f.stance !== 'belt') {
            f.stance = 'belt';
            f.orbitingPlanetId = null;
        }
        turn.lurking.push(f.id);
    }

    // 3. One idle picket toward the nearest untended trap.
    const traps = trapSystemsFor(world, factionId, enemies);
    const tended = new Set<string>();
    for (const f of pickets) {
        if (f.stance === 'belt' && f.currentSystemId) tended.add(f.currentSystemId);
        if (f.destinationSystemId) tended.add(f.destinationSystemId);
    }
    const open = new Set(traps.filter(id => !tended.has(id)));
    if (open.size > 0) {
        for (const f of pickets) {
            if (!isParked(f) || f.stance === 'belt') continue;
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
    const existingPickets = own.filter(f => isPicketId(f.id)).length;
    if (scoutId && pickets.length < wanted && existingPickets < MAX_PICKETS) {
        const fleet = commissionPicket(world, factionId, existingPickets + 1);
        if (fleet) {
            turn.commissioned = fleet.id;
            console.log(`[Belt AI] ${factionId} commissioned ${fleet.name} at ${fleet.currentSystemId}.`);
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
