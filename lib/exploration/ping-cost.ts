// lib/exploration/ping-cost.ts
// Relay ping: chart a system's star without sending a ship.
//
// A ping is bounced off the faction's nearest shipyard, so its price is the
// distance from that yard to the target in hyperlane jumps. The worker quotes
// and charges with quoteRelayPing; the client shows the same number with
// relayPingQuote over the synced system list — both call the one pure
// function below, so the button never promises a price the treasury won't
// pay. A leaf on purpose (types + one hex helper): useGameSync imports it
// into the browser bundle.

import type { GameWorldState } from '../game-world-state';
import { hexDistance } from '../government/capital-distance';

export const RELAY_PING_BASE_CREDITS = 250;
export const RELAY_PING_PER_JUMP_CREDITS = 150;
/** Beyond this many jumps the price stops climbing — the far rim must stay reachable. */
export const RELAY_PING_MAX_JUMPS = 20;

/** Surface buildings that count as a yard (same list PlanetConstructionPanel uses). */
const SHIPYARD_BUILDING_IDS = new Set(['orbital_shipyard', 'fleet_drydock', 'shipyard', 'naval_base', 'fleet_command']);
/** Orbital structures that count as a yard, matched by id so new hull tiers join automatically. */
const ORBITAL_YARD_PATTERN = /shipyard|spaceyard|drydock|slipway/i;

export interface PingGraphSystem {
    id: string;
    q: number;
    r: number;
    hyperlaneNeighbors?: string[];
}

export interface RelayPingQuote {
    credits: number;
    jumps: number;
    /** The yard (or capital) the ping is sent from; null when the faction has neither. */
    anchorSystemId: string | null;
    /** How `jumps` was measured — lanes when the graph connects, grid otherwise. */
    metric: 'lanes' | 'grid' | 'none';
}

export function relayPingCredits(jumps: number): number {
    const capped = Math.max(0, Math.min(RELAY_PING_MAX_JUMPS, Math.round(jumps)));
    return RELAY_PING_BASE_CREDITS + RELAY_PING_PER_JUMP_CREDITS * capped;
}

/** Systems where this faction has a working yard, surface or orbital. */
export function shipyardSystemIdsFor(world: GameWorldState, factionId: string): string[] {
    const out = new Set<string>();
    const planets = world?.construction?.planets;
    if (!planets) return [];
    for (const planet of planets.values()) {
        const p = planet as any;
        if (p.ownerId !== factionId || !p.systemId) continue;
        const surfaceYard = (p.tiles ?? []).some((t: any) =>
            t?.buildingId && SHIPYARD_BUILDING_IDS.has(t.buildingId) && t.constructionState === 'active');
        const orbitalYard = (p.orbital?.slots ?? []).some((s: any) =>
            s?.structureId && ORBITAL_YARD_PATTERN.test(String(s.structureId)) &&
            (s.state === undefined || s.state === 'active' || s.state === 'damaged'));
        if (surfaceYard || orbitalYard) out.add(p.systemId);
    }
    return [...out];
}

/**
 * Price a ping of `targetId` from the nearest of `anchorSystemIds`.
 * Multi-source BFS over hyperlanes; falls back to hex distance when the lane
 * graph does not connect the two (the seeded galaxy once shipped with empty
 * neighbour lists, and a rim system can still sit off the net).
 */
export function relayPingQuote(
    systems: Iterable<PingGraphSystem>,
    anchorSystemIds: string[],
    targetId: string,
): RelayPingQuote {
    const byId = new Map<string, PingGraphSystem>();
    for (const s of systems) if (s?.id) byId.set(s.id, s);
    const anchors = anchorSystemIds.filter(id => byId.has(id));
    const target = byId.get(targetId);
    if (anchors.length === 0 || !target) {
        return { credits: relayPingCredits(0), jumps: 0, anchorSystemId: anchors[0] ?? null, metric: 'none' };
    }
    if (anchors.includes(targetId)) {
        return { credits: relayPingCredits(0), jumps: 0, anchorSystemId: targetId, metric: 'lanes' };
    }

    // BFS from every anchor at once; the first to reach the target is nearest.
    const dist = new Map<string, number>();
    const from = new Map<string, string>();
    const queue: string[] = [];
    for (const a of anchors) { dist.set(a, 0); from.set(a, a); queue.push(a); }
    while (queue.length > 0) {
        const cur = queue.shift()!;
        const hops = dist.get(cur)!;
        if (cur === targetId) {
            return { credits: relayPingCredits(hops), jumps: hops, anchorSystemId: from.get(cur)!, metric: 'lanes' };
        }
        for (const n of byId.get(cur)?.hyperlaneNeighbors ?? []) {
            if (dist.has(n)) continue;
            dist.set(n, hops + 1);
            from.set(n, from.get(cur)!);
            queue.push(n);
        }
    }

    // Off the lane net: measure straight across the grid to the closest anchor.
    let best: { id: string; d: number } | null = null;
    for (const a of anchors) {
        const s = byId.get(a)!;
        const d = Math.round(hexDistance(s.q, s.r, target.q, target.r));
        if (!best || d < best.d) best = { id: a, d };
    }
    return { credits: relayPingCredits(best!.d), jumps: best!.d, anchorSystemId: best!.id, metric: 'grid' };
}

/** Worker-side convenience: anchors are the faction's yards, or its capital if it has none. */
export function quoteRelayPing(world: GameWorldState, factionId: string, targetId: string): RelayPingQuote {
    const yards = shipyardSystemIdsFor(world, factionId);
    const capital = world.economy?.factions?.get(factionId)?.capitalSystemId;
    const anchors = yards.length > 0 ? yards : capital ? [capital] : [];
    return relayPingQuote(world.movement.systems.values() as Iterable<PingGraphSystem>, anchors, targetId);
}
