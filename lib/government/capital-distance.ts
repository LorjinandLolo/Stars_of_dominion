// lib/government/capital-distance.ts
// Pure world reads shared by the cohesion tick and the faction modules.
//
// A LEAF on purpose, and the reason is the client bundle: sarrak.ts needs
// distancesFromCapital, saga.ts (client-side, via useGameSync) imports sarrak,
// and cohesion-service reaches government-service → politics/registry → `fs` —
// a Node-only module. Webpack bundles whole modules, not the functions you
// happened to call, so the old sarrak → cohesion-service import dragged `fs`
// into the browser and broke the build. Everything here reads GameWorldState
// and imports nothing but types.

import type { GameWorldState } from '@/lib/game-world-state';
import type { PlanetCohesion } from './cohesion-types';

/**
 * Distances from a capital, plus which metric produced them — the caller needs
 * to know whether a "3" means three lane hops or three grid tiles.
 */
export interface CapitalDistances {
    distances: Map<string, number>;
    metric: 'lanes' | 'grid';
}

/** Axial hex distance between two systems on the galaxy grid. */
export function hexDistance(aQ: number, aR: number, bQ: number, bR: number): number {
    const dq = aQ - bQ;
    const dr = aR - bR;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * Distance from a faction's capital to every system, in jumps.
 *
 * Prefers hyperlane hops, but falls back to axial hex distance when the lane
 * graph is unavailable. The fallback used to be load-bearing — the galaxy
 * shipped 567 systems with EMPTY `hyperlaneNeighbors`, so a pure BFS reported
 * every world as cut off from its own capital and handed the whole empire the
 * maximum distance penalty. `lib/movement/lane-graph.ts` now populates the
 * graph on load, so the grid metric only covers worlds outside the lane net.
 *
 * Computed once per faction per tick — the graph does not change mid-tick.
 */
export function distancesFromCapital(world: GameWorldState, factionId: string): CapitalDistances {
    const out = new Map<string, number>();
    const capital = world.economy.factions.get(factionId)?.capitalSystemId;
    const capitalSystem = capital ? world.movement.systems.get(capital) : undefined;
    if (!capital || !capitalSystem) return { distances: out, metric: 'lanes' };

    out.set(capital, 0);
    const queue: string[] = [capital];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const hops = out.get(current)!;
        const system = world.movement.systems.get(current);
        if (!system) continue;

        for (const neighbour of system.hyperlaneNeighbors ?? []) {
            if (out.has(neighbour)) continue;
            out.set(neighbour, hops + 1);
            queue.push(neighbour);
        }
    }

    // The lane graph reached nothing — measure across the grid instead.
    if (out.size <= 1) {
        for (const [systemId, system] of world.movement.systems) {
            out.set(systemId, Math.round(hexDistance(system.q, system.r, capitalSystem.q, capitalSystem.r)));
        }
        return { distances: out, metric: 'grid' };
    }

    return { distances: out, metric: 'lanes' };
}

/** The cohesion record for one world, or undefined before the first tick seeds it. */
export function getPlanetCohesion(world: GameWorldState, planetId: string): PlanetCohesion | undefined {
    return world.planetCohesion?.get(planetId);
}
