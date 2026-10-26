"use client";

// components/planet/DistrictScenery.tsx
// Miniature landscapes drawn inside each Voronoi district, so a player reads
// the world at a glance: trees mean forest, ridges mean mountains, a skyline
// means a city. Everything is procedural and seeded by (planetId, sectorIndex)
// — no art assets, and the same district always looks the same.

import React from 'react';
import type { TerrainType } from '@/lib/planet-surface/types';
import { pointInPolygon, type Pt } from './surfaceGeometry';
import { isoBox, isoShades } from './iso';
import type { Climate } from './terrainMeta';
import { renderCity, type CityTier } from './CityScenery';

/**
 * Scenery colours per climate for the living terrains (plains, forest,
 * jungle). Temperate is the original look; a cold world grows tundra and
 * snow-dusted pines, a scorched one ash and burnt trunks, a poisoned one
 * sickly growth, a dry one steppe.
 */
const SCENE: Record<Climate, { grass: string; shrub: string; hill: string; tree: [string, string]; treeDark: [string, string]; canopy: [string, string, string]; snow: boolean; dead: boolean; roof: [string, string] }> = {
    temperate: { grass: '#65a30d', shrub: '#3f6212', hill: '#4d7c0f', tree: ['#166534', '#15803d'], treeDark: ['#14532d', '#166534'], canopy: ['#065f46', '#047857', '#059669'], snow: false, dead: false, roof: ['#a16207', '#78350f'] },
    cold:      { grass: '#cbd5e1', shrub: '#64748b', hill: '#94a3b8', tree: ['#2f5d50', '#3b6d5f'], treeDark: ['#264d42', '#2f5d50'], canopy: ['#33584b', '#3e6658', '#4a7465'], snow: true, dead: false, roof: ['#78716c', '#e2e8f0'] },
    scorched:  { grass: '#57534e', shrub: '#292524', hill: '#44403c', tree: ['#3f3a36', '#4a443f'], treeDark: ['#292524', '#3f3a36'], canopy: ['#3f3a36', '#4a443f', '#57534e'], snow: false, dead: true, roof: ['#57534e', '#292524'] },
    poisoned:  { grass: '#a3b33a', shrub: '#5b6b1f', hill: '#7a8a2f', tree: ['#56661f', '#6b7a2f'], treeDark: ['#45521a', '#56661f'], canopy: ['#4d6620', '#5f7a28', '#86a32f'], snow: false, dead: false, roof: ['#78716c', '#44403c'] },
    glassed:   { grass: '#155e75', shrub: '#0e3a46', hill: '#155e75', tree: ['#1e293b', '#1e293b'], treeDark: ['#0f172a', '#0f172a'], canopy: ['#1e293b', '#1e293b', '#334155'], snow: false, dead: true, roof: ['#1e293b', '#0f172a'] },
    dry:       { grass: '#a16207', shrub: '#713f12', hill: '#a16207', tree: ['#4d6b2a', '#5f7f33'], treeDark: ['#3f5a22', '#4d6b2a'], canopy: ['#3f6b2a', '#4d7c33', '#65a30d'], snow: false, dead: false, roof: ['#a16207', '#78350f'] },
};

// ─── Seeded scatter ──────────────────────────────────────────────────────────

function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** Distance from a point to a line segment — used to keep clear of routes. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** True when the point sits inside the cleared corridor of any route. */
function onRoute(p: Pt, routes: Array<[Pt, Pt]> | undefined, clearance: number): boolean {
    if (!routes?.length) return false;
    return routes.some(([a, b]) => distToSegment(p, a, b) < clearance);
}

function bounds(poly: Pt[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Rejection-samples `count` points strictly inside the district polygon.
 * `keepOut` is a circle (a built installation) that scenery must not sit on
 * top of, and `spacing` is the minimum gap between scattered motifs — without
 * it, trees and buildings pile onto each other.
 */
function scatter(
    poly: Pt[],
    count: number,
    rand: () => number,
    inset = 0.82,
    keepOut?: { x: number; y: number; r: number } | null,
    spacing = 0,
    routes?: Array<[Pt, Pt]>,
    routeClearance = 0,
): Pt[] {
    if (poly.length < 3) return [];
    const { minX, minY, maxX, maxY } = bounds(poly);
    // Shrink toward the centroid so scenery never touches the district border.
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const inner: Pt[] = poly.map(([x, y]) => [cx + (x - cx) * inset, cy + (y - cy) * inset]);
    const out: Pt[] = [];
    let guard = 0;
    const sp2 = spacing * spacing;
    while (out.length < count && guard++ < count * 60) {
        const p: Pt = [minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)];
        if (!pointInPolygon(p, inner)) continue;
        if (keepOut) {
            const dx = p[0] - keepOut.x, dy = p[1] - keepOut.y;
            if (dx * dx + dy * dy < keepOut.r * keepOut.r) continue;
        }
        if (onRoute(p, routes, routeClearance)) continue;
        if (sp2 > 0 && out.some(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < sp2)) continue;
        out.push(p);
    }
    return out;
}

// ─── Per-terrain scenery ─────────────────────────────────────────────────────

interface SceneryProps {
    terrain: TerrainType;
    polygon: Pt[];
    seedKey: string;
    /** Rough cell size, used to scale motif density and size. */
    scale: number;
    dimmed: boolean;
    /** Radial band 0 (core) .. 7 (frontier) — urban density tier derives from it. */
    ring?: number;
    /** The world's climate: what plains, forest and jungle look like here. */
    climate?: Climate;
    /** Someone lives on this world (a colony, or natives): plains get farmsteads. */
    inhabited?: boolean;
    /** Who: a colony's farmsteads, or a native people's round huts (in the forest too). */
    settlers?: 'colony' | 'natives';
    /** True inside the capital region — grants the grand civic landmark. */
    capital?: boolean;
    /**
     * Footprint of a built installation in this district. Scenery keeps clear
     * of it so nothing is ever drawn on top of a building.
     */
    keepOut?: { x: number; y: number; r: number } | null;
    /**
     * Road / rail / supply segments crossing this district. Nothing is built
     * on top of a route — the corridor is cleared for it.
     */
    routes?: Array<[Pt, Pt]>;
    /**
     * Bearing (radians) of the network road entering this district, if any.
     * The urban main street adopts it so the local street reads as the
     * continuation of the highway instead of crossing it at a random angle.
     */
    roadBearing?: number | null;
    /** For an urban district: where it sits in the settlement and where its streets leave (CityScenery). */
    city?: { tier: CityTier; seat: boolean; exits: Pt[] };
    /** River centreline segments crossing this district (riverPaths.ts), with half-width: kept clear. */
    water?: Array<{ a: Pt; b: Pt; hw: number }>;
}

/** A native village hut: round, thatched, with a fire ring. */
function NativeHut({ x, y, s }: { x: number; y: number; s: number }) {
    return (
        <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <circle r={s * 0.42} fill="#7c5a34" />
            <path d={`M ${-s * 0.5} 0 Q 0 ${-s * 0.75} ${s * 0.5} 0 Z`} fill="#b08a4a" />
            <circle cx={s * 0.55} cy={s * 0.3} r={s * 0.09} fill="#f97316" opacity={0.85} />
        </g>
    );
}

function Tree({ x, y, s, dark, climate = 'temperate' }: { x: number; y: number; s: number; dark: boolean; climate?: Climate }) {
    const c = SCENE[climate];
    const [a, b] = dark ? c.treeDark : c.tree;
    if (c.dead) {
        // Burnt standing trunks: a spar and two broken limbs.
        return (
            <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} stroke={a} strokeLinecap="round">
                <line x1={0} y1={s * 0.3} x2={0} y2={-s * 0.85} strokeWidth={s * 0.12} />
                <line x1={0} y1={-s * 0.35} x2={s * 0.3} y2={-s * 0.6} strokeWidth={s * 0.07} />
                <line x1={0} y1={-s * 0.15} x2={-s * 0.28} y2={-s * 0.4} strokeWidth={s * 0.07} />
            </g>
        );
    }
    return (
        <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <rect x={-s * 0.07} y={0} width={s * 0.14} height={s * 0.3} fill="#5b3a1e" />
            <path d={`M 0 ${-s} L ${s * 0.5} ${s * 0.05} L ${-s * 0.5} ${s * 0.05} Z`} fill={a} />
            <path d={`M 0 ${-s * 0.6} L ${s * 0.4} ${s * 0.25} L ${-s * 0.4} ${s * 0.25} Z`} fill={b} />
            {c.snow && <path d={`M 0 ${-s} L ${s * 0.2} ${-s * 0.55} L ${-s * 0.2} ${-s * 0.55} Z`} fill="#f1f5f9" opacity={0.9} />}
        </g>
    );
}

export default function DistrictScenery({ terrain, polygon, seedKey, scale, dimmed, ring = 4, capital = false, roadBearing = null, keepOut = null, routes: routesIn, climate = 'temperate', inhabited = true, settlers = 'colony', city, water }: SceneryProps) {
    // Nothing grows or stands in a river: its course is cleared like a road's.
    const routes = React.useMemo(
        () => (water?.length ? [...(routesIn ?? []), ...water.map(w => [w.a, w.b] as [Pt, Pt])] : routesIn),
        [routesIn, water],
    );
    const sc = SCENE[climate];
    const rand = React.useMemo(() => mulberry32(hash(seedKey)), [seedKey]);
    const s = Math.max(4, scale * 0.16); // motif unit size
    /** Cleared corridor width either side of a route's centreline. */
    const clearance = Math.max(6, s * 0.85);

    const content = React.useMemo(() => {
        const r = mulberry32(hash(seedKey)); // fresh stream per render pass
        // A glassed world: whatever was here is fused glass, shards catching
        // the light and cracks still glowing with the heat.
        if (climate === 'glassed') {
            if (terrain === 'ocean') return null;
            const pts = scatter(polygon, 7, r, 0.85, keepOut, s * 0.8, routes, clearance);
            return pts.map((p, i) => {
                const w = s * (0.5 + r() * 0.6);
                if (i % 3 === 0) {
                    return (
                        <path key={i} d={`M ${p[0] - w} ${p[1]} l ${w * 0.6} ${-w * 0.25} l ${w * 0.5} ${w * 0.3} l ${w * 0.7} ${-w * 0.2}`}
                            fill="none" stroke="#22d3ee" strokeWidth={s * 0.08} opacity={0.55} strokeLinecap="round" />
                    );
                }
                return (
                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${Math.round(r() * 60 - 30)})`}>
                        <path d={`M 0 ${-w} L ${w * 0.35} 0 L 0 ${w * 0.25} L ${-w * 0.3} 0 Z`} fill="#334155" stroke="#67e8f9" strokeWidth={0.5} strokeOpacity={0.5} />
                        <path d={`M 0 ${-w} L ${w * 0.35} 0 L 0 ${-w * 0.2} Z`} fill="#a5f3fc" opacity={0.35} />
                    </g>
                );
            });
        }
        switch (terrain) {
            case 'forest': {
                // Dense clusters with size variance — old growth beside saplings.
                const pts = scatter(polygon, 10, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return pts.map((p, i) => (settlers === 'natives' && inhabited && i % 5 === 2)
                    ? <NativeHut key={i} x={p[0]} y={p[1]} s={s} />
                    : <Tree key={i} x={p[0]} y={p[1]} s={s * (0.55 + r() * 0.75)} dark={i % 2 === 0} climate={climate} />);
            }
            case 'jungle': {
                // A closed canopy: the ground is never seen. An under-layer of
                // shadowed foliage fills the gaps, overlapping crowns sit on
                // it, a few emergent giants break the roof, and mist hangs in
                // the low places. Clipped to the district so the roof has an
                // edge where the jungle ends.
                const clipId = `jc-${seedKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const under = scatter(polygon, 16, r, 0.98, keepOut, s * 0.6, routes, clearance);
                const crowns = scatter(polygon, 26, r, 0.92, keepOut, s * 0.42, routes, clearance);
                const giants = scatter(polygon, 2, r, 0.7, keepOut, s * 1.6, routes, clearance);
                const mist = scatter(polygon, 2, r, 0.75, keepOut, s, routes, clearance);
                return (
                    <>
                        <defs>
                            <clipPath id={clipId}><polygon points={polygon.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} /></clipPath>
                        </defs>
                        <g clipPath={`url(#${clipId})`}>
                            {under.map((p, i) => (
                                <circle key={`u${i}`} cx={p[0]} cy={p[1]} r={s * (0.85 + r() * 0.3)} fill={sc.canopy[0]} opacity={0.8} />
                            ))}
                            {crowns.map((p, i) => {
                                const R = s * (0.38 + r() * 0.3);
                                return (
                                    <g key={`c${i}`} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                        <circle cx={R * 0.18} cy={R * 0.22} r={R} fill="#022c22" opacity={0.35} />
                                        <circle r={R} fill={i % 3 === 0 ? sc.canopy[0] : sc.canopy[1]} />
                                        <circle cx={-R * 0.22} cy={-R * 0.26} r={R * 0.62} fill={sc.canopy[2]} opacity={0.85} />
                                        <circle cx={-R * 0.34} cy={-R * 0.4} r={R * 0.22} fill="#ffffff" opacity={0.14} />
                                    </g>
                                );
                            })}
                            {giants.map((p, i) => {
                                const R = s * 0.85;
                                return (
                                    <g key={`g${i}`} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                        <ellipse cx={R * 0.35} cy={R * 0.45} rx={R} ry={R * 0.75} fill="#022c22" opacity={0.4} />
                                        <circle r={R} fill={sc.canopy[1]} />
                                        <circle cx={-R * 0.3} cy={-R * 0.1} r={R * 0.55} fill={sc.canopy[2]} />
                                        <circle cx={R * 0.25} cy={-R * 0.35} r={R * 0.45} fill={sc.canopy[2]} opacity={0.8} />
                                        <circle cx={-R * 0.35} cy={-R * 0.45} r={R * 0.2} fill="#ffffff" opacity={0.16} />
                                    </g>
                                );
                            })}
                            {mist.map((p, i) => (
                                <ellipse key={`m${i}`} cx={p[0]} cy={p[1]} rx={s * 1.3} ry={s * 0.35} fill="#e2e8f0" opacity={0.12} />
                            ))}
                        </g>
                    </>
                );
            }
            case 'mountains': {
                // Varied peaks with snow caps — no connector lines, they read
                // as smears at map scale.
                const pts = scatter(polygon, 5, r, 0.82, keepOut, s * 0.9, routes, clearance).sort((a, b) => a[0] - b[0]);
                if (!pts.length) return null;
                return (
                    <>
                        {pts.map((p, i) => {
                            const h = s * (0.7 + r() * 0.55);
                            return (
                                <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                    <path d={`M ${-h * 0.85} ${h * 0.45} L 0 ${-h} L ${h * 0.85} ${h * 0.45} Z`} fill={i % 2 ? '#78716c' : '#6b6560'} />
                                    <path d={`M ${-h * 0.26} ${-h * 0.2} L 0 ${-h} L ${h * 0.26} ${-h * 0.2} L 0 ${-h * 0.42} Z`} fill={climate === 'scorched' ? '#292524' : climate === 'poisoned' ? '#a3b33a' : '#e7e5e4'} />
                                </g>
                            );
                        })}
                    </>
                );
            }
            case 'volcanic': {
                const pts = scatter(polygon, 4, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return pts.map((p, i) => (
                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                        <path d={`M ${-s * 0.9} ${s * 0.45} L 0 ${-s * 0.85} L ${s * 0.9} ${s * 0.45} Z`} fill="#44403c" />
                        <path d={`M ${-s * 0.22} ${-s * 0.45} L 0 ${-s * 0.85} L ${s * 0.22} ${-s * 0.45} Z`} fill="#f97316" />
                        <circle cy={-s * 0.95} r={s * 0.18} fill="#fb923c" opacity={0.75} />
                    </g>
                ));
            }
            case 'plains': {
                const pts = scatter(polygon, 9, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return (
                    <>
                        {pts.map((p, i) => {
                            if (i % 4 === 0 && inhabited && settlers === 'natives') return <NativeHut key={i} x={p[0]} y={p[1]} s={s} />;
                            if (i % 4 === 0 && inhabited) {
                                // scattered farmstead / village — only where someone lives
                                return (
                                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                        <rect x={-s * 0.35} y={-s * 0.25} width={s * 0.7} height={s * 0.5} fill={sc.roof[0]} />
                                        <path d={`M ${-s * 0.45} ${-s * 0.25} L 0 ${-s * 0.6} L ${s * 0.45} ${-s * 0.25} Z`} fill={sc.roof[1]} />
                                    </g>
                                );
                            }
                            if (i % 4 === 1) {
                                // rolling hill contour
                                return (
                                    <path key={i} d={`M ${p[0] - s * 1.2} ${p[1]} q ${s * 1.2} ${-s * 0.55} ${s * 2.4} 0`}
                                        fill="none" stroke={sc.hill} strokeWidth={s * 0.12} opacity={0.5} />
                                );
                            }
                            // Scorched ground: a glowing crack in the ash instead of grass.
                            if (sc.dead && i % 4 === 2) {
                                return (
                                    <path key={i} d={`M ${p[0] - s * 0.6} ${p[1]} l ${s * 0.35} ${-s * 0.2} l ${s * 0.3} ${s * 0.25} l ${s * 0.4} ${-s * 0.15}`}
                                        fill="none" stroke="#f97316" strokeWidth={s * 0.1} opacity={0.75} strokeLinecap="round" />
                                );
                            }
                            // grass tufts / shrubs (tundra moss and snow patches when cold)
                            return (
                                <g key={i}>
                                    <path d={`M ${p[0].toFixed(1)} ${p[1].toFixed(1)} q ${s * 0.3} ${-s * 0.5} ${s * 0.6} 0`} fill="none" stroke={sc.grass} strokeWidth={s * 0.16} opacity={0.8} />
                                    <circle cx={p[0] + s * 0.75} cy={p[1] - s * 0.1} r={s * 0.14} fill={sc.shrub} opacity={0.8} />
                                    {sc.snow && <ellipse cx={p[0] - s * 0.3} cy={p[1] + s * 0.3} rx={s * 0.4} ry={s * 0.16} fill="#f1f5f9" opacity={0.7} />}
                                </g>
                            );
                        })}
                    </>
                );
            }
            case 'desert': {
                const pts = scatter(polygon, 7, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return (
                    <>
                        {pts.map((p, i) => {
                            if (i === 0) {
                                // oasis
                                return (
                                    <g key={i}>
                                        {/* an oasis — or, on a scorched world, a lava pool */}
                                        <ellipse cx={p[0]} cy={p[1]} rx={s * 0.6} ry={s * 0.35} fill={climate === 'scorched' ? '#ea580c' : climate === 'poisoned' ? '#84cc16' : '#0891b2'} opacity={0.8} />
                                        {climate !== 'scorched' && <circle cx={p[0] + s * 0.5} cy={p[1] - s * 0.35} r={s * 0.25} fill={climate === 'poisoned' ? '#5b6b1f' : '#15803d'} />}
                                    </g>
                                );
                            }
                            if (i % 3 === 0) {
                                // mesa / rock formation
                                return (
                                    <path key={i}
                                        d={`M ${p[0] - s * 0.7} ${p[1] + s * 0.35} l ${s * 0.2} ${-s * 0.65} l ${s * 0.35} ${-s * 0.1} l ${s * 0.15} ${s * 0.25} l ${s * 0.35} ${s * 0.5} Z`}
                                        fill="#92400e" opacity={0.85} />
                                );
                            }
                            // layered dune crescents
                            return (
                                <g key={i}>
                                    <path d={`M ${p[0] - s} ${p[1]} q ${s} ${-s * 0.75} ${s * 2} 0`} fill="none" stroke="#d97706" strokeWidth={s * 0.2} opacity={0.65} />
                                    <path d={`M ${p[0] - s * 0.5} ${p[1] + s * 0.3} q ${s * 0.6} ${-s * 0.45} ${s * 1.2} 0`} fill="none" stroke="#b45309" strokeWidth={s * 0.14} opacity={0.5} />
                                </g>
                            );
                        })}
                    </>
                );
            }
            case 'frozen': {
                // Ice sheets: angular floe plates with pressure-ridge cracks.
                const pts = scatter(polygon, 5, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return pts.map((p, i) => {
                    const w = s * (0.8 + r() * 0.7);
                    if (i % 3 === 2) {
                        return <ellipse key={i} cx={p[0]} cy={p[1]} rx={s * 0.6} ry={s * 0.35} fill="#7dd3fc" opacity={0.45} />;
                    }
                    return (
                        <g key={i}>
                            <path d={`M ${p[0] - w} ${p[1]} L ${p[0] - w * 0.3} ${p[1] - w * 0.55} L ${p[0] + w * 0.6} ${p[1] - w * 0.4} L ${p[0] + w} ${p[1] + w * 0.25} L ${p[0] - w * 0.2} ${p[1] + w * 0.5} Z`}
                                fill="#e2e8f0" opacity={0.92} />
                            <line x1={p[0] - w * 0.5} y1={p[1] - w * 0.1} x2={p[0] + w * 0.45} y2={p[1] + w * 0.15} stroke="#94a3b8" strokeWidth={s * 0.07} opacity={0.6} />
                        </g>
                    );
                });
            }
            case 'ocean': {
                // Mixed sea states: long swells, short chop, occasional whitecap.
                const pts = scatter(polygon, 8, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return pts.map((p, i) => {
                    const w = s * (0.7 + r() * 0.8);
                    if (i % 4 === 3) {
                        return <circle key={i} cx={p[0]} cy={p[1]} r={s * 0.09} fill="#e0f2fe" opacity={0.8} />;
                    }
                    return (
                        <path key={i}
                            d={`M ${p[0] - w} ${p[1]} q ${w * 0.5} ${-w * 0.35} ${w} 0 q ${w * 0.5} ${w * 0.35} ${w} 0`}
                            fill="none" stroke="#7dd3fc" strokeWidth={s * (0.1 + r() * 0.1)} opacity={0.35 + r() * 0.3} />
                    );
                });
            }
            case 'toxic': {
                const pts = scatter(polygon, 6, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return pts.map((p, i) => (
                    <g key={i}>
                        <ellipse cx={p[0]} cy={p[1]} rx={s * 0.55} ry={s * 0.32} fill="#7e22ce" opacity={0.55} />
                        <circle cx={p[0] + s * 0.2} cy={p[1] - s * 0.35} r={s * 0.14} fill="#c084fc" opacity={0.7} />
                    </g>
                ));
            }
            case 'ruins': {
                const pts = scatter(polygon, 5, r, 0.82, keepOut, s * 0.9, routes, clearance);
                return pts.map((p, i) => (
                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                        <rect x={-s * 0.5} y={-s * 0.7} width={s * 0.22} height={s * 1.1} fill="#a8a29e" opacity={0.85} />
                        <rect x={s * 0.1} y={-s * 0.4} width={s * 0.2} height={s * 0.8} fill="#78716c" opacity={0.8} />
                        <rect x={-s * 0.6} y={-s * 0.85} width={s * 1.1} height={s * 0.16} fill="#d6d3d1" opacity={0.6} />
                    </g>
                ));
            }
            case 'urban':
                // The street grid, density by place in the settlement, parks,
                // the plaza and the dome: CityScenery.tsx.
                return renderCity({
                    polygon, s, rand: r,
                    tier: city?.tier ?? (ring <= 1 ? 'downtown' : ring <= 3 ? 'city' : 'suburb'),
                    seat: city?.seat ?? false,
                    roadBearing, exits: city?.exits ?? [], water: water ?? [],
                    routes, clearance, keepOut,
                });
            default:
                return null;
        }
    }, [terrain, polygon, seedKey, s, ring, capital, roadBearing, keepOut, routes, clearance, climate, inhabited, settlers, city, water]);

    if (!content) return null;
    return <g pointerEvents="none" opacity={dimmed ? 0.12 : 0.9}>{content}</g>;
}
