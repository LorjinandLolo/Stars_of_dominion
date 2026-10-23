// components/planet/riverPaths.ts
// Rivers drawn as rivers. The generator (lib/planet-surface/generator.ts
// flowRivers) says which districts carry water, where it flows on to and how
// much (riverFlow); this turns that into shapes for the board:
//
//   - one continuous ribbon per river, from spring to sea, joining its
//     tributaries exactly where they meet;
//   - it crosses each border at the middle of the shared edge and bends
//     around the district centre, so it never runs through the town there;
//   - it meanders (more for the big rivers), starts as a thread at the spring
//     and widens with the water it carries, opening into an estuary;
//   - a big river fans out into a delta at the sea; a basin becomes a lake.
//
// Pure geometry, client only, deterministic from the surface.

import type { PlanetSurface } from '@/lib/planet-surface/types';
import type { SurfaceGeometry, Pt } from './surfaceGeometry';

export interface RiverRibbon {
    key: string;
    /** Closed outline of the water. */
    water: string;
    /** The same, wider: the banks drawn under the water. */
    bank: string;
    /** Light line down the middle: the current. */
    shimmer: string;
    shimmerWidth: number;
}
export interface RiverShapes { ribbons: RiverRibbon[]; lakes: Array<{ key: string; d: string }>; deltas: Array<{ key: string; fan: string }> }

/** Width at the spring and per unit of riverFlow (board units). */
const W_MIN = 1.1;
const W_FLOW = 6.2;
/** How far the river bends off the straight line, at least and per unit of flow. */
const MEANDER_MIN = 1.6;
const MEANDER_FLOW = 3.4;
/** A mouth this big opens into a delta (the world's biggest river is 1). */
const DELTA_FLOW = 0.75;

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5);
const f1 = (n: number) => n.toFixed(1);
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Midpoint of the edge two cells share, or of their centres when they share none. */
function portal(geo: SurfaceGeometry, a: number, b: number): Pt {
    const pa = geo.rawPolygons[a] ?? [], pb = geo.rawPolygons[b] ?? [];
    const shared = pa.filter(p => pb.some(q => Math.abs(p[0] - q[0]) < 0.6 && Math.abs(p[1] - q[1]) < 0.6));
    if (shared.length >= 2) return mid(shared[0], shared[1]);
    return mid(geo.centroids[a], geo.centroids[b]);
}

/** Catmull-Rom through the points, sampled `per` times per span. */
function spline(points: Pt[], per: number): Pt[] {
    if (points.length < 3) return points;
    const out: Pt[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
        for (let k = 0; k < per; k++) {
            const t = k / per, t2 = t * t, t3 = t2 * t;
            out.push([
                0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ]);
        }
    }
    out.push(points[points.length - 1]);
    return out;
}

/** A ribbon of varying width around a centreline. */
function ribbon(line: Pt[], widths: number[]): string {
    const left: Pt[] = [], right: Pt[] = [];
    for (let i = 0; i < line.length; i++) {
        const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len, w = widths[i] / 2;
        left.push([line[i][0] + nx * w, line[i][1] + ny * w]);
        right.push([line[i][0] - nx * w, line[i][1] - ny * w]);
    }
    const pts = [...left, ...right.reverse()];
    return `M ${pts.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L ')} Z`;
}

const polyline = (line: Pt[]) => `M ${line.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L ')}`;

export function buildRivers(surface: PlanetSurface, geo: SurfaceGeometry): RiverShapes {
    const S = surface.sectors;
    const isSea = (i: number) => S[i]?.terrain === 'ocean';
    // Nodes: river districts, and the springs (high ground feeding one).
    const flowOf = (i: number) => S[i].river ? Math.max(0.05, S[i].riverFlow ?? 0.3) : 0.05;
    const nodes = S.filter(s => s.riverTo !== undefined && (s.river || !isSea(s.index))).map(s => s.index);
    const down = (i: number) => S[i].riverTo ?? -1;
    const upstream = new Map<number, number[]>();
    for (const i of nodes) {
        const d = down(i);
        if (d >= 0 && S[d].river) upstream.set(d, [...(upstream.get(d) ?? []), i]);
    }
    // The main stem into a district is the biggest river feeding it; the
    // others are tributaries that end where they meet it.
    const mainUp = (i: number) => (upstream.get(i) ?? []).sort((a, b) => flowOf(b) - flowOf(a) || a - b)[0];
    // Where a river runs within a district: off the centre, between the
    // border it came in through and the one it leaves by.
    const spine = (i: number): Pt => {
        const c = geo.centroids[i];
        if (S[i].lake) return c; // a river runs through its lake
        const up = mainUp(i), d = down(i);
        const entry = up !== undefined ? portal(geo, up, i) : c;
        const exit = d >= 0 ? portal(geo, i, d) : c;
        return lerp(c, mid(entry, exit), 0.6);
    };

    const ribbons: RiverRibbon[] = [];
    const deltas: RiverShapes['deltas'] = [];
    const heads = nodes.filter(i => !(upstream.get(i)?.length));
    for (const head of heads) {
        // Down the stem until the sea, the end of the water, or a bigger river.
        const path = [head];
        let end: { kind: 'sea' | 'join' | 'none'; at: number } = { kind: 'none', at: -1 };
        for (let guard = 0; guard < 64; guard++) {
            const cur = path[path.length - 1];
            const d = down(cur);
            if (d < 0 || !S[d]) break;
            if (isSea(d)) { end = { kind: 'sea', at: d }; break; }
            if (!S[d].river) { end = { kind: 'join', at: d }; break; }
            if (mainUp(d) !== cur) { end = { kind: 'join', at: d }; break; }
            if (path.includes(d)) break;
            path.push(d);
        }
        // Waypoints and the water at each.
        const pts: Pt[] = [];
        const flows: number[] = [];
        const springStart = !S[head].river;
        pts.push(springStart ? geo.centroids[head] : spine(head));
        flows.push(springStart ? 0.02 : flowOf(head) * 0.5);
        for (let k = 0; k < path.length; k++) {
            const a = path[k];
            const b = k + 1 < path.length ? path[k + 1] : end.at;
            if (k > 0) { pts.push(spine(a)); flows.push(flowOf(a)); }
            if (b >= 0) { pts.push(portal(geo, a, b)); flows.push(flowOf(a)); }
        }
        let mouthDir: Pt | null = null;
        if (end.kind === 'sea') {
            const p = pts[pts.length - 1], c = geo.centroids[end.at];
            const m = lerp(p, c, 0.3);
            mouthDir = [m[0] - p[0], m[1] - p[1]];
            pts.push(m); flows.push(flows[flows.length - 1] * 1.25);
        } else if (end.kind === 'join') {
            pts.push(S[end.at].river ? spine(end.at) : geo.centroids[end.at]);
            flows.push(flows[flows.length - 1]);
        }
        if (pts.length < 2) continue;

        // Smooth, then meander: a slow wave across the course, faded out at
        // both ends so joins and mouths meet exactly.
        const line = spline(pts, 8);
        const flowAt = spline(pts.map((_, i) => [flows[i], 0] as Pt), 8).map(p => p[0]);
        const phase = hash(head) * Math.PI * 2;
        let run = 0;
        const bent: Pt[] = line.map((p, i) => {
            if (i > 0) run += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]);
            const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
            const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
            const u = i / (line.length - 1);
            const fade = Math.sin(Math.PI * u);
            const amp = (MEANDER_MIN + MEANDER_FLOW * flowAt[i]) * fade;
            const off = Math.sin(run / 17 + phase) * amp + Math.sin(run / 7.3 + phase * 1.7) * amp * 0.25;
            return [p[0] - (dy / len) * off, p[1] + (dx / len) * off];
        });
        const widths = bent.map((_, i) => {
            const u = i / (bent.length - 1);
            let w = W_MIN + W_FLOW * Math.max(0, flowAt[i]);
            w *= Math.min(1, 0.2 + u * 5);                                  // a thread where it rises
            if (end.kind === 'sea' && u > 0.85) w *= 1 + (u - 0.85) * 2.5;   // the estuary opens
            return w;
        });
        ribbons.push({
            key: `river-${head}`,
            water: ribbon(bent, widths),
            bank: ribbon(bent, widths.map(w => w + 2.4)),
            shimmer: polyline(bent),
            shimmerWidth: Math.max(0.5, (W_MIN + W_FLOW * flowOf(path[path.length - 1])) * 0.16),
        });

        // A big river spreads into a delta where it meets the sea.
        const last = path[path.length - 1];
        if (end.kind === 'sea' && mouthDir && flowOf(last) >= DELTA_FLOW) {
            const base = bent[bent.length - 1];
            const len0 = Math.hypot(mouthDir[0], mouthDir[1]) || 1;
            const ux = mouthDir[0] / len0, uy = mouthDir[1] / len0;
            const reach = 12 + 12 * flowOf(last);
            const tip = (deg: number, scale = 1): Pt => {
                const r = (deg * Math.PI) / 180;
                return [base[0] + (ux * Math.cos(r) - uy * Math.sin(r)) * reach * scale, base[1] + (ux * Math.sin(r) + uy * Math.cos(r)) * reach * scale];
            };
            // The sand the river has dropped: a rounded fan.
            const a = tip(-38, 0.8), b = tip(0, 1.25), c2 = tip(38, 0.8);
            deltas.push({ key: `delta-${last}`, fan: `M ${f1(base[0])} ${f1(base[1])} Q ${f1(a[0])} ${f1(a[1])} ${f1(b[0])} ${f1(b[1])} Q ${f1(c2[0])} ${f1(c2[1])} ${f1(base[0])} ${f1(base[1])} Z` });
            // Two or three arms, gently curved, thinning to nothing.
            const w0 = widths[widths.length - 1];
            const swing = hash(last) * 10 - 5;
            const arms = flowOf(last) >= 0.9 ? [-22, 4, 26] : [-16, 18];
            for (const deg of arms) {
                const d = deg + swing;
                const bow = lerp(base, tip(d, 0.55), 0.5);
                const bend: Pt = [bow[0] - uy * deg * 0.08, bow[1] + ux * deg * 0.08];
                const arm = spline([base, bend, tip(d, 0.9 + hash(last + deg) * 0.25)], 6);
                const aw = arm.map((_, i) => Math.max(0.3, w0 * 0.45 * (1 - i / (arm.length - 1)) ** 0.8));
                ribbons.push({
                    key: `delta-${last}-${deg}`,
                    water: ribbon(arm, aw),
                    bank: ribbon(arm, aw.map(w => w + 1.4)),
                    shimmer: polyline(arm.slice(0, Math.ceil(arm.length * 0.6))),
                    shimmerWidth: 0.4,
                });
            }
        }
    }

    // Lakes: a rounded basin inside the district, through its edge midpoints.
    const lakes = S.filter(s => s.lake).map(s => {
        // The visible (clipped) district, so a lake on the rim stays on the planet.
        const poly = geo.polygons[s.index] ?? [];
        const c = geo.centroids[s.index];
        const ring = poly.map(p => lerp(c, p, 0.42));
        if (ring.length < 3) return null;
        const mids = ring.map((p, i) => mid(p, ring[(i + 1) % ring.length]));
        let d = `M ${f1(mids[0][0])} ${f1(mids[0][1])}`;
        for (let i = 1; i <= ring.length; i++) {
            const ctrl = ring[i % ring.length], to = mids[i % ring.length];
            d += ` Q ${f1(ctrl[0])} ${f1(ctrl[1])} ${f1(to[0])} ${f1(to[1])}`;
        }
        return { key: `lake-${s.index}`, d: `${d} Z` };
    }).filter((x): x is { key: string; d: string } => !!x);

    return { ribbons, lakes, deltas };
}
