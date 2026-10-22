// lib/planet-surface/roads.ts
// The road graph, shared by the surface view (which draws it) and the ground
// war (where a road halves the going). Every developed district gets a land
// route back to the capital core along a BFS tree over the sector adjacency;
// ocean blocks roads. Pure and deterministic: same surface and developed
// districts → same roads on the worker and on every client.

import type { PlanetSurface } from './types';

const CAPITAL_SECTOR = 0;

/** Symmetric adjacency: a↔b if either lists the other as a neighbour. */
function adjacencyOf(surface: PlanetSurface): number[][] {
    const adj: Set<number>[] = surface.sectors.map(() => new Set<number>());
    for (const sec of surface.sectors) {
        for (const n of sec.neighbors) {
            adj[sec.index].add(n);
            adj[n].add(sec.index);
        }
    }
    return adj.map(s => Array.from(s));
}

/** The road key for a link between two districts, order-independent. */
export const roadKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Each district's parent on the road tree rooted at the capital (-1 for the
 * capital and for land the capital cannot reach), and whether it is reachable.
 */
export function roadTree(surface: PlanetSurface): { parent: number[]; reached: boolean[] } {
    const adj = adjacencyOf(surface);
    const passable = (i: number) => surface.sectors[i].terrain !== 'ocean';
    const parent = new Array<number>(surface.sectors.length).fill(-1);
    const reached = new Array<boolean>(surface.sectors.length).fill(false);
    const queue: number[] = [];
    if (surface.sectors[CAPITAL_SECTOR] && passable(CAPITAL_SECTOR)) {
        queue.push(CAPITAL_SECTOR);
        reached[CAPITAL_SECTOR] = true;
    }
    while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adj[cur]) {
            if (reached[n] || !passable(n)) continue;
            reached[n] = true;
            parent[n] = cur;
            queue.push(n);
        }
    }
    return { parent, reached };
}

/** The road links (roadKey) serving a set of developed districts. */
export function roadLinkKeys(surface: PlanetSurface, developed: Iterable<number>): string[] {
    const { parent, reached } = roadTree(surface);
    const keys = new Set<string>();
    for (const idx of developed) {
        if (!reached[idx] || idx === CAPITAL_SECTOR) continue;
        let cur = idx;
        while (parent[cur] !== -1) {
            keys.add(roadKey(cur, parent[cur]));
            cur = parent[cur];
        }
    }
    return [...keys].sort();
}
