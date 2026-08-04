// components/planet/roadNetwork.ts
// Phase 5 — visible infrastructure. Every developed district gets a land
// route back to the capital core, computed by BFS over the sector adjacency
// graph (ocean blocks roads). Purely visual and deterministic: same world →
// same roads on every client.

import type { PlanetSurface } from '@/lib/planet-surface/types';
import type { SectorOccupant } from '@/lib/planet-surface/occupancy';
import type { SurfaceGeometry, Pt } from './surfaceGeometry';

export interface RoadEdge {
    key: string;
    from: Pt;
    to: Pt;
    /** Control point for a soft curve. */
    mid: Pt;
    /** rail = heavy industry endpoint; supply = animated logistics flow;
     *  power = transmission line from a generator to nearby developments. */
    kind: 'road' | 'rail' | 'supply' | 'power';
    /** Sector indexes this edge connects. */
    a: number;
    b: number;
}

/** An overpass where two ground routes cross — the heavier route bridges over. */
export interface Bridge {
    key: string;
    x: number;
    y: number;
    /** Bearing (radians) of the upper edge at the crossing. */
    angle: number;
}

const POWER_BUILDING = /reactor|power|energy|grid|solar|stellar|collector|harvester|conduit/i;

const CAPITAL_SECTOR = 0;

/** Symmetric adjacency: a↔b if either lists the other as a neighbour. */
function buildAdjacency(surface: PlanetSurface): number[][] {
    const adj: Set<number>[] = surface.sectors.map(() => new Set<number>());
    for (const sec of surface.sectors) {
        for (const n of sec.neighbors) {
            adj[sec.index].add(n);
            adj[n].add(sec.index);
        }
    }
    return adj.map(s => Array.from(s));
}

export function computeRoadNetwork(
    surface: PlanetSurface,
    geo: SurfaceGeometry,
    occupancy: Map<number, SectorOccupant>,
    buildingCategory: (buildingId: string) => string | undefined,
): RoadEdge[] {
    const adj = buildAdjacency(surface);
    const passable = (i: number) => surface.sectors[i].terrain !== 'ocean';

    // BFS tree rooted at the capital over land.
    const parent = new Array<number>(surface.sectors.length).fill(-1);
    const seen = new Array<boolean>(surface.sectors.length).fill(false);
    const queue: number[] = [];
    if (passable(CAPITAL_SECTOR)) {
        queue.push(CAPITAL_SECTOR);
        seen[CAPITAL_SECTOR] = true;
    }
    while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adj[cur]) {
            if (seen[n] || !passable(n)) continue;
            seen[n] = true;
            parent[n] = cur;
            queue.push(n);
        }
    }

    // Walk each developed district's path to the root; dedupe edges.
    const edgeKind = new Map<string, 'road' | 'rail' | 'supply'>();
    const rank = { road: 0, rail: 1, supply: 2 } as const;
    for (const [idx, occ] of occupancy) {
        if (!seen[idx] || idx === CAPITAL_SECTOR) continue;
        const cat = buildingCategory(occ.buildingId);
        const kind: 'road' | 'rail' | 'supply' =
            cat === 'logistics' || cat === 'space' ? 'supply'
            : cat === 'industrial' || cat === 'resource' ? 'rail'
            : 'road';
        let cur = idx;
        while (parent[cur] !== -1) {
            const p = parent[cur];
            const key = cur < p ? `${cur}-${p}` : `${p}-${cur}`;
            const existing = edgeKind.get(key);
            if (!existing || rank[kind] > rank[existing]) edgeKind.set(key, kind);
            cur = p;
        }
    }

    const edges: RoadEdge[] = [];
    for (const [key, kind] of edgeKind) {
        const [a, b] = key.split('-').map(Number);
        const from = geo.centroids[a];
        const to = geo.centroids[b];
        // Gentle bow perpendicular to the segment so routes read as built
        // things, not survey lines.
        const mx = (from[0] + to[0]) / 2;
        const my = (from[1] + to[1]) / 2;
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const len = Math.hypot(dx, dy) || 1;
        const bow = Math.min(10, len * 0.12) * ((a + b) % 2 === 0 ? 1 : -1);
        const mid: Pt = [mx - (dy / len) * bow, my + (dx / len) * bow];
        edges.push({ key, from, to, mid, kind, a, b });
    }

    // Transmission lines: each generator feeds its 2 nearest developed
    // districts. Straight runs — pylons don't follow the terrain.
    const developed = Array.from(occupancy.keys());
    for (const [idx, occ] of occupancy) {
        if (!POWER_BUILDING.test(occ.buildingId)) continue;
        const [fx, fy] = geo.centroids[idx];
        const targets = developed
            .filter(o => o !== idx)
            .map(o => {
                const [tx, ty] = geo.centroids[o];
                return { o, d: Math.hypot(tx - fx, ty - fy) };
            })
            .sort((a, b) => a.d - b.d)
            .slice(0, 2);
        for (const { o } of targets) {
            const key = `pw-${idx < o ? `${idx}-${o}` : `${o}-${idx}`}`;
            if (edges.some(e => e.key === key)) continue;
            const from = geo.centroids[idx];
            const to = geo.centroids[o];
            edges.push({ key, from, to, mid: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], kind: 'power', a: idx, b: o });
        }
    }
    return edges;
}

// ─── Crossings ───────────────────────────────────────────────────────────────
// Ground routes should never just paint over each other. Where two edges
// cross away from a shared junction, the heavier route gets an overpass deck.
// Power lines are aerial — pylons need no bridges.

const KIND_RANK = { road: 0, rail: 1, supply: 2, power: 3 } as const;
const ENDPOINT_EPS = 14; // crossings this close to a junction are just the junction

function segIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denom;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
    return [p1[0] + t * d1x, p1[1] + t * d1y];
}

export function computeBridges(edges: RoadEdge[]): Bridge[] {
    const ground = edges.filter(e => e.kind !== 'power');
    const bridges: Bridge[] = [];
    for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) {
            const e1 = ground[i], e2 = ground[j];
            // Tree edges meeting at a shared district are a junction, not a crossing.
            if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
            const hit = segIntersect(e1.from, e1.to, e2.from, e2.to);
            if (!hit) continue;
            const nearEndpoint = [e1.from, e1.to, e2.from, e2.to].some(
                p => Math.hypot(p[0] - hit[0], p[1] - hit[1]) < ENDPOINT_EPS
            );
            if (nearEndpoint) continue;
            const upper = KIND_RANK[e1.kind] >= KIND_RANK[e2.kind] ? e1 : e2;
            bridges.push({
                key: `br-${e1.key}-${e2.key}`,
                x: hit[0],
                y: hit[1],
                angle: Math.atan2(upper.to[1] - upper.from[1], upper.to[0] - upper.from[0]),
            });
        }
    }
    return bridges;
}
