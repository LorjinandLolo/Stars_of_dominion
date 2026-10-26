"use client";

// components/planet/CityScenery.tsx
// An urban district seen from orbit, laid out like a real town rather than a
// row of towers along one street:
//
//   - a street grid aligned to the highway coming in, shaped to the district;
//   - arterials from the centre out to every neighbouring urban district,
//     meeting that district's own at the shared border, so a capital that
//     spans several districts reads as one city;
//   - density by place in the city: downtown towers in the capital's heart,
//     mid-rise blocks around it, low houses and gardens in the suburbs, a
//     market square and a spire in a town;
//   - parks, an industrial yard on the edge of the big districts, the civic
//     dome on the capital's plaza;
//   - nothing built in the river (it is drawn over the streets: bridges) or
//     on a highway, rail line or installation.
//
// Deterministic from the district seed (the rng is passed in).

import React from 'react';
import { pointInPolygon, type Pt } from './surfaceGeometry';
import { isoBox, isoShades } from './iso';

/** Where in the settlement a district is: the capital's heart, its ring, its edge, or a town. */
export type CityTier = 'downtown' | 'city' | 'suburb' | 'town';

export interface CityProps {
    polygon: Pt[];
    /** Motif unit (DistrictScenery's s). */
    s: number;
    rand: () => number;
    tier: CityTier;
    /** District 0: the plaza and the civic dome. */
    seat: boolean;
    /** Bearing of the highway entering the district, if any. */
    roadBearing: number | null;
    /** Shared-border midpoints with neighbouring urban districts: where the arterials leave. */
    exits: Pt[];
    /** River centreline segments in this district, with half-width. */
    water: Array<{ a: Pt; b: Pt; hw: number }>;
    routes?: Array<[Pt, Pt]>;
    clearance: number;
    keepOut?: { x: number; y: number; r: number } | null;
}

/** Block pitch (street to street) per tier, in motif units. */
const PITCH: Record<CityTier, number> = { downtown: 1.05, city: 1.2, suburb: 1.45, town: 1.3 };
/** How built-up the middle of the district is, per tier (falls off toward its edge). */
const DENSITY: Record<CityTier, number> = { downtown: 1, city: 0.78, suburb: 0.42, town: 0.6 };
const PALETTE = ['#5b6b8c', '#2a7f8f', '#8892a8', '#3c4d70', '#6d7ea3'];
const ROOFS = ['#9a3412', '#b45309', '#7c2d12', '#a16207'];

function distToSegment(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}
const f1 = (n: number) => n.toFixed(1);

export function renderCity(props: CityProps): React.ReactNode {
    const { polygon, s, rand: r, tier, seat, roadBearing, exits, water, routes, clearance, keepOut } = props;
    if (polygon.length < 3) return null;
    const cx = polygon.reduce((t, p) => t + p[0], 0) / polygon.length;
    const cy = polygon.reduce((t, p) => t + p[1], 0) / polygon.length;
    const inner: Pt[] = polygon.map(([x, y]) => [cx + (x - cx) * 0.9, cy + (y - cy) * 0.9]);
    const inside = (p: Pt) => pointInPolygon(p, inner);
    const radius = Math.max(...inner.map(p => Math.hypot(p[0] - cx, p[1] - cy)));

    const angle = roadBearing ?? r() * Math.PI;
    const u: Pt = [Math.cos(angle), Math.sin(angle)];
    const v: Pt = [-u[1], u[0]];
    const at = (a: number, b: number): Pt => [cx + u[0] * a + v[0] * b, cy + u[1] * a + v[1] * b];
    const pitch = s * PITCH[tier];
    const wet = (p: Pt, extra: number) => water.some(w => distToSegment(p, w.a, w.b) < w.hw + extra);
    const blocked = (p: Pt, extra: number) =>
        wet(p, extra)
        || (routes ?? []).some(([a, b]) => distToSegment(p, a, b) < clearance * 0.75)
        || (!!keepOut && Math.hypot(p[0] - keepOut.x, p[1] - keepOut.y) < keepOut.r);

    // ── Streets: the grid, clipped to the district ───────────────────────
    const reach = Math.ceil(radius / pitch) + 1;
    const offA = (r() - 0.5) * pitch, offB = (r() - 0.5) * pitch;
    const streets: string[] = [];
    const runAlong = (fixed: number, axis: 'a' | 'b') => {
        let run: Pt[] = [];
        const flush = () => { if (run.length >= 2) streets.push(`M ${run.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L ')}`); run = []; };
        for (let t = -reach * pitch; t <= reach * pitch; t += s * 0.3) {
            const p = axis === 'a' ? at(fixed, t) : at(t, fixed);
            if (inside(p)) run.push(p); else flush();
        }
        flush();
    };
    for (let k = -reach; k <= reach; k++) {
        runAlong(k * pitch + offA, 'a');
        runAlong(k * pitch + offB, 'b');
    }
    // Arterials: centre to each urban neighbour's shared border, and on to
    // the highway's bearing where there is no neighbour.
    const arterials: Array<[Pt, Pt]> = exits.map(e => [[cx, cy], e]);
    if (!arterials.length) arterials.push([at(-radius, 0), at(radius, 0)]);

    // ── Blocks ────────────────────────────────────────────────────────────
    type Piece = { y: number; node: React.ReactNode };
    const pieces: Piece[] = [];
    const plates: React.ReactNode[] = [];
    const greens: React.ReactNode[] = [];
    const half = pitch * 0.5, plate = pitch * 0.36;
    const plateAt = (p: Pt, k: string, fill: string, opacity: number) => {
        const corner = (da: number, db: number): Pt => [p[0] + u[0] * da + v[0] * db, p[1] + u[1] * da + v[1] * db];
        const pts = [corner(-plate, -plate), corner(plate, -plate), corner(plate, plate), corner(-plate, plate)];
        return <polygon key={k} points={pts.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ')} fill={fill} opacity={opacity} />;
    };
    const tower = (p: Pt, h: number, w: number, color: string, key: string, lit: boolean): Piece => {
        const d = w * 0.85;
        const faces = isoBox(p[0], p[1], w, d, h);
        const [top, left, right] = isoShades(color);
        const bands = Math.max(0, Math.min(4, Math.floor(h / (s * 0.42))));
        return {
            y: p[1],
            node: (
                <g key={key}>
                    <ellipse cx={p[0]} cy={p[1] + d * 0.35} rx={w * 1.1} ry={w * 0.45} fill="#020617" opacity={0.25} />
                    <polygon points={faces.left} fill={left} />
                    <polygon points={faces.right} fill={right} />
                    <polygon points={faces.top} fill={top} stroke="#0f172a" strokeWidth={0.35} />
                    {Array.from({ length: bands }, (_, b) => {
                        const z = h * ((b + 0.7) / (bands + 0.5));
                        const pts = isoBox(p[0], p[1], w, d, z).right.split(' ');
                        return <line key={b} x1={pts[0].split(',')[0]} y1={pts[3].split(',')[1]} x2={pts[1].split(',')[0]} y2={pts[2].split(',')[1]}
                            stroke="#a5f3fc" strokeWidth={Math.max(0.4, s * 0.05)} opacity={0.42} />;
                    })}
                    {lit && <circle cx={p[0]} cy={p[1] + (w - d) * 0.5 - h - s * 0.08} r={Math.max(0.7, s * 0.09)} fill="#fbbf24" className="bm-twinkle" />}
                </g>
            ),
        };
    };
    const house = (p: Pt, key: string): Piece => {
        const w = s * 0.24, h = s * 0.22;
        const roof = ROOFS[Math.floor(r() * ROOFS.length)];
        return {
            y: p[1],
            node: (
                <g key={key}>
                    <rect x={p[0] - w} y={p[1] - h} width={w * 2} height={h * 1.4} fill="#d6d3d1" />
                    <path d={`M ${f1(p[0] - w * 1.15)} ${f1(p[1] - h)} L ${f1(p[0])} ${f1(p[1] - h * 2.1)} L ${f1(p[0] + w * 1.15)} ${f1(p[1] - h)} Z`} fill={roof} />
                </g>
            ),
        };
    };
    const tree = (p: Pt, key: string) => (
        <g key={key}>
            <circle cx={p[0]} cy={p[1]} r={s * 0.2} fill="#166534" />
            <circle cx={p[0] - s * 0.06} cy={p[1] - s * 0.06} r={s * 0.11} fill="#22c55e" opacity={0.7} />
        </g>
    );

    let plazaDone = false;
    let plaza: Pt | null = null;
    let yardDone = tier === 'suburb' || tier === 'town';
    const blocks: Array<{ p: Pt; d: number; key: string }> = [];
    for (let i = -reach; i < reach; i++) {
        for (let j = -reach; j < reach; j++) {
            const p = at(i * pitch + offA + half, j * pitch + offB + half);
            if (!inside(p) || blocked(p, pitch * 0.3)) continue;
            blocks.push({ p, d: Math.hypot(p[0] - cx, p[1] - cy) / radius, key: `${i}_${j}` });
        }
    }
    blocks.sort((a, b) => a.d - b.d);
    for (const bl of blocks) {
        const { p, d, key } = bl;
        const density = DENSITY[tier] * (1 - 0.55 * d);
        // The blocks around the seat of government are its open square.
        if (plaza && Math.hypot(p[0] - plaza[0], p[1] - plaza[1]) < pitch * 1.3) {
            plates.push(plateAt(p, `sq-${key}`, '#cbd5e1', 0.45));
            greens.push(tree([p[0] + (r() - 0.5) * plate, p[1] + (r() - 0.5) * plate], `sqt-${key}`));
            continue;
        }
        // The seat of government: a plaza and the dome on the central block.
        if (seat && !plazaDone) {
            plazaDone = true;
            plaza = p;
            plates.push(plateAt(p, `plaza-${key}`, '#e2e8f0', 0.6));
            pieces.push({
                y: p[1] + 0.01,
                node: (
                    <g key={`dome-${key}`}>
                        {/* colonnade, dome, mast and banner: the seat of power, read at a glance */}
                        <rect x={p[0] - s * 0.8} y={p[1] - s * 0.42} width={s * 1.6} height={s * 0.5} fill="#e7e5e4" />
                        {[-0.6, -0.3, 0, 0.3, 0.6].map((o, k) => (
                            <line key={k} x1={p[0] + o * s} y1={p[1] + s * 0.06} x2={p[0] + o * s} y2={p[1] - s * 0.38} stroke="#a8a29e" strokeWidth={s * 0.06} />
                        ))}
                        <path d={`M ${f1(p[0] - s * 0.52)} ${f1(p[1] - s * 0.42)} A ${f1(s * 0.52)} ${f1(s * 0.52)} 0 0 1 ${f1(p[0] + s * 0.52)} ${f1(p[1] - s * 0.42)}`} fill="#facc15" />
                        <line x1={p[0]} y1={p[1] - s * 0.94} x2={p[0]} y2={p[1] - s * 1.4} stroke="#e7e5e4" strokeWidth={s * 0.06} />
                        <path d={`M ${f1(p[0])} ${f1(p[1] - s * 1.4)} l ${f1(s * 0.34)} ${f1(s * 0.11)} l ${f1(-s * 0.34)} ${f1(s * 0.11)} Z`} fill="#facc15" />
                    </g>
                ),
            });
            continue;
        }
        // A town's market square and spire.
        if (tier === 'town' && !plazaDone) {
            plazaDone = true;
            plates.push(plateAt(p, `market-${key}`, '#d6c9a5', 0.55));
            pieces.push({
                y: p[1],
                node: (
                    <g key={`spire-${key}`}>
                        <rect x={p[0] - s * 0.16} y={p[1] - s * 0.55} width={s * 0.32} height={s * 0.6} fill="#e7e5e4" />
                        <path d={`M ${f1(p[0] - s * 0.2)} ${f1(p[1] - s * 0.55)} L ${f1(p[0])} ${f1(p[1] - s * 1.15)} L ${f1(p[0] + s * 0.2)} ${f1(p[1] - s * 0.55)} Z`} fill="#64748b" />
                    </g>
                ),
            });
            continue;
        }
        // Parks: rarer downtown, common in the suburbs.
        if (r() < (density > 0.7 ? 0.06 : 0.16)) {
            greens.push(plateAt(p, `park-${key}`, '#15803d', 0.55));
            for (let k = 0; k < 3; k++) greens.push(tree([p[0] + (r() - 0.5) * plate * 1.4, p[1] + (r() - 0.5) * plate * 1.4], `pt-${key}-${k}`));
            continue;
        }
        // An industrial yard on the edge of a big district.
        if (!yardDone && d > 0.7) {
            yardDone = true;
            plates.push(plateAt(p, `yard-${key}`, '#57534e', 0.5));
            pieces.push({
                y: p[1],
                node: (
                    <g key={`yard-${key}`}>
                        <rect x={p[0] - s * 0.45} y={p[1] - s * 0.32} width={s * 0.85} height={s * 0.38} fill="#57534e" />
                        <path d={`M ${f1(p[0] - s * 0.5)} ${f1(p[1] - s * 0.32)} l ${f1(s * 0.47)} ${f1(-s * 0.18)} l ${f1(s * 0.47)} ${f1(s * 0.18)} Z`} fill="#78716c" />
                        <rect x={p[0] + s * 0.42} y={p[1] - s * 0.85} width={s * 0.12} height={s * 0.9} fill="#44403c" />
                        <circle cx={p[0] + s * 0.48} cy={p[1] - s * 0.95} r={s * 0.09} fill="#cbd5e1" className="bm-smoke" />
                    </g>
                ),
            });
            continue;
        }
        plates.push(plateAt(p, `pl-${key}`, density > 0.5 ? '#334155' : '#3f4a3a', 0.5));
        if (density >= 0.72) {
            // Downtown: one or two towers to a block.
            const n = r() < 0.5 ? 2 : 1;
            for (let k = 0; k < n; k++) {
                const q: Pt = n === 1 ? p : [p[0] + (k ? 1 : -1) * plate * 0.45, p[1] + (k ? 1 : -1) * plate * 0.2];
                pieces.push(tower(q, s * (1.3 + r() * 1.5) * density, s * (0.3 + r() * 0.12), PALETTE[Math.floor(r() * PALETTE.length)], `t-${key}-${k}`, r() < 0.4));
            }
        } else if (density >= 0.45) {
            // Mid-rise: two or three blocks of flats.
            const n = 2 + (r() < 0.5 ? 1 : 0);
            for (let k = 0; k < n; k++) {
                const q: Pt = [p[0] + (r() - 0.5) * plate * 1.2, p[1] + (r() - 0.5) * plate * 1.2];
                pieces.push(tower(q, s * (0.5 + r() * 0.5), s * 0.26, PALETTE[Math.floor(r() * PALETTE.length)], `m-${key}-${k}`, false));
            }
        } else {
            // Suburbs: houses with gardens.
            const n = 3 + (r() < 0.5 ? 1 : 0);
            for (let k = 0; k < n; k++) {
                const q: Pt = [p[0] + (r() - 0.5) * plate * 1.5, p[1] + (r() - 0.5) * plate * 1.5];
                pieces.push(house(q, `h-${key}-${k}`));
            }
            if (r() < 0.5) greens.push(tree([p[0] + (r() - 0.5) * plate, p[1] + (r() - 0.5) * plate], `ht-${key}`));
        }
    }

    const streetW = s * (tier === 'downtown' ? 0.12 : 0.1);
    return (
        <>
            {plates}
            {greens}
            {streets.map((d, i) => <path key={`st-${i}`} d={d} fill="none" stroke="#1e293b" strokeWidth={streetW} strokeLinecap="round" opacity={0.9} />)}
            {arterials.map(([a, b], i) => (
                <g key={`ar-${i}`}>
                    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#1f2937" strokeWidth={s * 0.22} strokeLinecap="round" />
                    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fbbf24" strokeWidth={s * 0.05}
                        strokeDasharray={`${f1(s * 0.18)} ${f1(s * 0.3)}`} opacity={0.5} className="bm-glow" />
                </g>
            ))}
            {pieces.sort((a, b) => a.y - b.y).map(pc => pc.node)}
        </>
    );
}
