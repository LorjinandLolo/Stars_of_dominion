/**
 * lib/movement/lane-graph.ts
 *
 * Builds the hyperlane graph every BFS/pathfind in the game walks:
 * `SystemNode.hyperlaneNeighbors`. Movement pathing, sensor propagation,
 * cohesion distance-from-capital, press diffusion, pirate raids, border
 * detection and the galaxy map's lane layer all read that one field.
 *
 * `generated-systems.json` ships a `links` array (1089 lanes) alongside its
 * system nodes, but the world loader only ever read `systemNodes` — so every
 * system booted with an EMPTY neighbour list and the lane layer effectively did
 * not exist. Fleets fell through to deep-space crossings on every hop, BFS
 * consumers saw a galaxy of 567 isolated islands, and the map drew a decorative
 * nearest-neighbour constellation that matched no route a fleet could take.
 *
 * The graph is also stitched into a single connected component: the raw link
 * set leaves 11 components (largest 488 of 567), which would strand 79 systems
 * — and any faction inside them — permanently off the network.
 *
 * Deterministic: same input file always yields the same graph (all iteration is
 * over id-sorted keys, no randomness, no Date).
 */

import fs from 'fs';
import path from 'path';
import type { SystemNode } from './types';

export interface LaneLink {
    fromSystemId: string;
    toSystemId: string;
    /** Source classification ('base' | 'gate'). Both become hyperlane edges. */
    class?: string;
}

export interface LaneGraphStats {
    systems: number;
    /** Undirected edges taken from the source link list. */
    linkEdges: number;
    /** Extra edges added to weld disconnected components together. */
    stitchedEdges: number;
    /** Components in the source link graph, before stitching. */
    componentsBefore: number;
    /** Components after stitching. 1 unless the galaxy is empty. */
    componentsAfter: number;
    source: 'links' | 'proximity' | 'none';
}

/** How many nearest neighbours each system gets when no link list is available. */
const PROXIMITY_DEGREE = 3;

/** Axial hex distance — the galaxy grid metric, used for stitching decisions. */
function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * Reads the `links` array out of the world snapshot file. Server/worker only
 * (uses fs). Returns [] when the file is missing or has no links — callers fall
 * back to proximity generation.
 */
export function loadLaneLinks(filePath?: string): LaneLink[] {
    try {
        const p = filePath ?? path.resolve(process.cwd(), 'generated-systems.json');
        if (!fs.existsSync(p)) return [];
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (!Array.isArray(data?.links)) return [];
        return data.links.filter(
            (l: any) => l && typeof l.fromSystemId === 'string' && typeof l.toSystemId === 'string'
        );
    } catch (err) {
        console.error('[LaneGraph] Failed to read lane links:', err);
        return [];
    }
}

/**
 * Rebuilds `hyperlaneNeighbors` for every system from `links`, then welds the
 * result into one connected component. Mutates the systems in place and returns
 * what it did. Idempotent — running it twice yields the same graph.
 *
 * With no usable links, falls back to connecting each system to its
 * PROXIMITY_DEGREE nearest neighbours so the lane layer still exists.
 */
export function buildLaneGraph(
    systems: Map<string, SystemNode>,
    links: LaneLink[]
): LaneGraphStats {
    const ids = [...systems.keys()].sort();
    const stats: LaneGraphStats = {
        systems: ids.length,
        linkEdges: 0,
        stitchedEdges: 0,
        componentsBefore: 0,
        componentsAfter: 0,
        source: 'none',
    };
    if (!ids.length) return stats;

    const adj = new Map<string, Set<string>>();
    for (const id of ids) adj.set(id, new Set());

    const connect = (a: string, b: string): boolean => {
        if (a === b) return false;
        const sa = adj.get(a);
        const sb = adj.get(b);
        if (!sa || !sb) return false;      // link to a system this world doesn't have
        if (sa.has(b)) return false;       // duplicate pair (the source file has 234)
        sa.add(b);
        sb.add(a);
        return true;
    };

    for (const link of links) {
        if (connect(link.fromSystemId, link.toSystemId)) stats.linkEdges++;
    }
    stats.source = stats.linkEdges > 0 ? 'links' : 'proximity';

    // No link data at all — synthesize a lane web from hex proximity so the
    // graph is never empty (an empty graph is the bug this module exists for).
    if (stats.source === 'proximity') {
        for (const id of ids) {
            const a = systems.get(id)!;
            const nearest = ids
                .filter(other => other !== id)
                .map(other => ({ other, d: hexDistance(a, systems.get(other)!) }))
                .sort((x, y) => (x.d - y.d) || (x.other < y.other ? -1 : 1))
                .slice(0, PROXIMITY_DEGREE);
            for (const n of nearest) if (connect(id, n.other)) stats.linkEdges++;
        }
    }

    // ── Components ───────────────────────────────────────────────────────────
    const componentOf = new Map<string, number>();
    const components: string[][] = [];
    for (const id of ids) {
        if (componentOf.has(id)) continue;
        const index = components.length;
        const members: string[] = [];
        const queue = [id];
        componentOf.set(id, index);
        while (queue.length) {
            const current = queue.shift()!;
            members.push(current);
            for (const n of [...adj.get(current)!].sort()) {
                if (componentOf.has(n)) continue;
                componentOf.set(n, index);
                queue.push(n);
            }
        }
        components.push(members);
    }
    stats.componentsBefore = components.length;

    // ── Stitch every island onto the mainland ────────────────────────────────
    // Largest component first; ties broken by lowest member id so the choice is
    // stable across runs. Each island joins via its shortest hex-distance pair.
    const order = components
        .map((members, index) => ({ index, members, anchor: members.slice().sort()[0] }))
        .sort((a, b) => (b.members.length - a.members.length) || (a.anchor < b.anchor ? -1 : 1));

    const mainland = order[0].members.slice().sort();
    for (let i = 1; i < order.length; i++) {
        const island = order[i].members.slice().sort();
        let best: { a: string; b: string; d: number } | null = null;
        for (const a of island) {
            const sa = systems.get(a)!;
            for (const b of mainland) {
                const d = hexDistance(sa, systems.get(b)!);
                if (!best || d < best.d) best = { a, b, d };
            }
        }
        if (best && connect(best.a, best.b)) stats.stitchedEdges++;
        mainland.push(...island);
        mainland.sort();
    }
    stats.componentsAfter = order.length ? 1 : 0;

    // ── Write back ───────────────────────────────────────────────────────────
    for (const id of ids) {
        systems.get(id)!.hyperlaneNeighbors = [...adj.get(id)!].sort();
    }
    return stats;
}

/**
 * Populates the lane graph if it is missing. Safe to call on every boot and on
 * every snapshot load: worlds that already carry lanes are left untouched.
 *
 * Pass `force` to rebuild regardless (e.g. after regenerating the map).
 */
export function ensureLaneGraph(
    systems: Map<string, SystemNode>,
    opts: { force?: boolean; links?: LaneLink[] } = {}
): LaneGraphStats | null {
    if (!systems.size) return null;

    if (!opts.force) {
        for (const sys of systems.values()) {
            if (Array.isArray(sys.hyperlaneNeighbors) && sys.hyperlaneNeighbors.length > 0) return null;
        }
    }

    const links = opts.links ?? loadLaneLinks();
    const stats = buildLaneGraph(systems, links);
    console.log(
        `[LaneGraph] Built ${stats.linkEdges} lanes (+${stats.stitchedEdges} stitched) across ` +
        `${stats.systems} systems from ${stats.source}; ${stats.componentsBefore} components welded into ${stats.componentsAfter}.`
    );
    return stats;
}
