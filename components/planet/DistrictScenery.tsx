"use client";

// components/planet/DistrictScenery.tsx
// Miniature landscapes drawn inside each Voronoi district, so a player reads
// the world at a glance: trees mean forest, ridges mean mountains, a skyline
// means a city. Everything is procedural and seeded by (planetId, sectorIndex)
// — no art assets, and the same district always looks the same.

import React from 'react';
import type { TerrainType } from '@/lib/planet-surface/types';
import { pointInPolygon, type Pt } from './surfaceGeometry';

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

/** Rejection-samples `count` points strictly inside the district polygon. */
function scatter(poly: Pt[], count: number, rand: () => number, inset = 0.82): Pt[] {
    if (poly.length < 3) return [];
    const { minX, minY, maxX, maxY } = bounds(poly);
    // Shrink toward the centroid so scenery never touches the district border.
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const inner: Pt[] = poly.map(([x, y]) => [cx + (x - cx) * inset, cy + (y - cy) * inset]);
    const out: Pt[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 30) {
        const p: Pt = [minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)];
        if (pointInPolygon(p, inner)) out.push(p);
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
    /** True inside the capital region — grants the grand civic landmark. */
    capital?: boolean;
    /**
     * Bearing (radians) of the network road entering this district, if any.
     * The urban main street adopts it so the local street reads as the
     * continuation of the highway instead of crossing it at a random angle.
     */
    roadBearing?: number | null;
}

function Tree({ x, y, s, dark }: { x: number; y: number; s: number; dark: boolean }) {
    return (
        <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            <rect x={-s * 0.07} y={0} width={s * 0.14} height={s * 0.3} fill="#5b3a1e" />
            <path d={`M 0 ${-s} L ${s * 0.5} ${s * 0.05} L ${-s * 0.5} ${s * 0.05} Z`} fill={dark ? '#14532d' : '#166534'} />
            <path d={`M 0 ${-s * 0.6} L ${s * 0.4} ${s * 0.25} L ${-s * 0.4} ${s * 0.25} Z`} fill={dark ? '#166534' : '#15803d'} />
        </g>
    );
}

export default function DistrictScenery({ terrain, polygon, seedKey, scale, dimmed, ring = 4, capital = false, roadBearing = null }: SceneryProps) {
    const rand = React.useMemo(() => mulberry32(hash(seedKey)), [seedKey]);
    const s = Math.max(4, scale * 0.16); // motif unit size

    const content = React.useMemo(() => {
        const r = mulberry32(hash(seedKey)); // fresh stream per render pass
        switch (terrain) {
            case 'forest': {
                // Dense clusters with size variance — old growth beside saplings.
                const pts = scatter(polygon, 10, r);
                return pts.map((p, i) => (
                    <Tree key={i} x={p[0]} y={p[1]} s={s * (0.55 + r() * 0.75)} dark={i % 2 === 0} />
                ));
            }
            case 'jungle': {
                const pts = scatter(polygon, 9, r);
                return (
                    <>
                        {pts.map((p, i) => (
                            <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                <circle r={s * 0.5} fill={i % 2 ? '#065f46' : '#047857'} />
                                <circle r={s * 0.3} cx={s * 0.25} cy={-s * 0.2} fill="#059669" />
                            </g>
                        ))}
                        {/* river thread */}
                        {(() => {
                            const line = scatter(polygon, 3, r, 0.7);
                            if (line.length < 3) return null;
                            return <path d={`M ${line.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' Q ')}`} fill="none" stroke="#0ea5e9" strokeWidth={s * 0.2} opacity={0.55} />;
                        })()}
                    </>
                );
            }
            case 'mountains': {
                // Varied peaks with snow caps — no connector lines, they read
                // as smears at map scale.
                const pts = scatter(polygon, 5, r).sort((a, b) => a[0] - b[0]);
                if (!pts.length) return null;
                return (
                    <>
                        {pts.map((p, i) => {
                            const h = s * (0.7 + r() * 0.55);
                            return (
                                <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                    <path d={`M ${-h * 0.85} ${h * 0.45} L 0 ${-h} L ${h * 0.85} ${h * 0.45} Z`} fill={i % 2 ? '#78716c' : '#6b6560'} />
                                    <path d={`M ${-h * 0.26} ${-h * 0.2} L 0 ${-h} L ${h * 0.26} ${-h * 0.2} L 0 ${-h * 0.42} Z`} fill="#e7e5e4" />
                                </g>
                            );
                        })}
                    </>
                );
            }
            case 'volcanic': {
                const pts = scatter(polygon, 4, r);
                return pts.map((p, i) => (
                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                        <path d={`M ${-s * 0.9} ${s * 0.45} L 0 ${-s * 0.85} L ${s * 0.9} ${s * 0.45} Z`} fill="#44403c" />
                        <path d={`M ${-s * 0.22} ${-s * 0.45} L 0 ${-s * 0.85} L ${s * 0.22} ${-s * 0.45} Z`} fill="#f97316" />
                        <circle cy={-s * 0.95} r={s * 0.18} fill="#fb923c" opacity={0.75} />
                    </g>
                ));
            }
            case 'plains': {
                const pts = scatter(polygon, 9, r);
                return (
                    <>
                        {pts.map((p, i) => {
                            if (i % 4 === 0) {
                                // scattered farmstead / village
                                return (
                                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                                        <rect x={-s * 0.35} y={-s * 0.25} width={s * 0.7} height={s * 0.5} fill="#a16207" />
                                        <path d={`M ${-s * 0.45} ${-s * 0.25} L 0 ${-s * 0.6} L ${s * 0.45} ${-s * 0.25} Z`} fill="#78350f" />
                                    </g>
                                );
                            }
                            if (i % 4 === 1) {
                                // rolling hill contour
                                return (
                                    <path key={i} d={`M ${p[0] - s * 1.2} ${p[1]} q ${s * 1.2} ${-s * 0.55} ${s * 2.4} 0`}
                                        fill="none" stroke="#4d7c0f" strokeWidth={s * 0.12} opacity={0.5} />
                                );
                            }
                            // grass tufts / shrubs
                            return (
                                <g key={i}>
                                    <path d={`M ${p[0].toFixed(1)} ${p[1].toFixed(1)} q ${s * 0.3} ${-s * 0.5} ${s * 0.6} 0`} fill="none" stroke="#65a30d" strokeWidth={s * 0.16} opacity={0.8} />
                                    <circle cx={p[0] + s * 0.75} cy={p[1] - s * 0.1} r={s * 0.14} fill="#3f6212" opacity={0.8} />
                                </g>
                            );
                        })}
                    </>
                );
            }
            case 'desert': {
                const pts = scatter(polygon, 7, r);
                return (
                    <>
                        {pts.map((p, i) => {
                            if (i === 0) {
                                // oasis
                                return (
                                    <g key={i}>
                                        <ellipse cx={p[0]} cy={p[1]} rx={s * 0.6} ry={s * 0.35} fill="#0891b2" opacity={0.8} />
                                        <circle cx={p[0] + s * 0.5} cy={p[1] - s * 0.35} r={s * 0.25} fill="#15803d" />
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
                const pts = scatter(polygon, 5, r);
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
                const pts = scatter(polygon, 8, r);
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
                const pts = scatter(polygon, 6, r);
                return pts.map((p, i) => (
                    <g key={i}>
                        <ellipse cx={p[0]} cy={p[1]} rx={s * 0.55} ry={s * 0.32} fill="#7e22ce" opacity={0.55} />
                        <circle cx={p[0] + s * 0.2} cy={p[1] - s * 0.35} r={s * 0.14} fill="#c084fc" opacity={0.7} />
                    </g>
                ));
            }
            case 'ruins': {
                const pts = scatter(polygon, 5, r);
                return pts.map((p, i) => (
                    <g key={i} transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`}>
                        <rect x={-s * 0.5} y={-s * 0.7} width={s * 0.22} height={s * 1.1} fill="#a8a29e" opacity={0.85} />
                        <rect x={s * 0.1} y={-s * 0.4} width={s * 0.2} height={s * 0.8} fill="#78716c" opacity={0.8} />
                        <rect x={-s * 0.6} y={-s * 0.85} width={s * 1.1} height={s * 0.16} fill="#d6d3d1" opacity={0.6} />
                    </g>
                ));
            }
            case 'urban': {
                // A miniature city viewed from orbit: a main street with mixed
                // building stock along it, parks, an industrial edge, and one
                // landmark. Density tier comes from the radial band — core
                // districts are metropolises, frontier ones are outposts.
                const tier = ring <= 1 ? 3 : ring <= 3 ? 2 : ring <= 5 ? 1 : 0; // 3=metro 2=city 1=town 0=outpost
                const cx0 = polygon.reduce((t, p) => t + p[0], 0) / polygon.length;
                const cy0 = polygon.reduce((t, p) => t + p[1], 0) / polygon.length;
                // Main street bearing: continue the incoming highway when one
                // touches this district; otherwise seeded.
                const roadAngle = roadBearing ?? r() * Math.PI;
                const dirX = Math.cos(roadAngle), dirY = Math.sin(roadAngle);
                const perpX = -dirY, perpY = dirX;
                const reach = s * (2.2 + tier * 0.5);
                const inside = (p: Pt) => pointInPolygon(p, polygon);

                // Slots along the street, alternating sides; skip ones that
                // fall outside the district.
                const slotCount = [4, 7, 11, 15][tier];
                const slots: Array<{ p: Pt; side: number; t: number }> = [];
                for (let i = 0; i < slotCount; i++) {
                    const t = -1 + (2 * (i + 0.5)) / slotCount;           // -1..1 along street
                    const side = i % 2 === 0 ? 1 : -1;
                    const off = s * (0.55 + r() * 0.5);
                    const p: Pt = [
                        cx0 + dirX * t * reach + perpX * side * off,
                        cy0 + dirY * t * reach + perpY * side * off,
                    ];
                    if (inside(p)) slots.push({ p, side, t });
                }

                const palette = ['#475569', '#0e7490', '#78716c', '#334155', '#7c5c3e'];
                const roadA: Pt = [cx0 - dirX * reach, cy0 - dirY * reach];
                const roadB: Pt = [cx0 + dirX * reach, cy0 + dirY * reach];

                const building = (p: Pt, h: number, w: number, c: string, key: React.Key, lit: boolean) => (
                    <g key={key}>
                        <rect x={p[0] - w / 2} y={p[1] - h} width={w} height={h} fill={c} />
                        <rect x={p[0] + w / 2 - w * 0.28} y={p[1] - h} width={w * 0.28} height={h} fill="#1e293b" opacity={0.35} />
                        {h > s * 0.5 && [0.25, 0.55].map((fy, j) => (
                            <rect key={j} x={p[0] - w * 0.36} y={p[1] - h + h * fy} width={w * 0.72} height={Math.min(h * 0.08, s * 0.08)}
                                fill="#e0f2fe" opacity={0.5} />
                        ))}
                        {lit && (
                            <rect x={p[0] - w * 0.15} y={p[1] - h * 0.4} width={w * 0.3} height={w * 0.3}
                                fill="#fbbf24" className="bm-twinkle" style={{ animationDelay: `${(Number(key) || 0) * 0.7}s` }} />
                        )}
                    </g>
                );

                return (
                    <>
                        {/* main street (glowing at night) + cross street on big cities */}
                        <line x1={roadA[0]} y1={roadA[1]} x2={roadB[0]} y2={roadB[1]} stroke="#1f2937" strokeWidth={s * 0.28} strokeLinecap="round" />
                        <line x1={roadA[0]} y1={roadA[1]} x2={roadB[0]} y2={roadB[1]} stroke="#fbbf24" strokeWidth={s * 0.06}
                            strokeDasharray={`${s * 0.18} ${s * 0.3}`} opacity={0.55} className="bm-glow" />
                        {tier >= 2 && (
                            <line x1={cx0 - perpX * reach * 0.55} y1={cy0 - perpY * reach * 0.55}
                                x2={cx0 + perpX * reach * 0.55} y2={cy0 + perpY * reach * 0.55}
                                stroke="#1f2937" strokeWidth={s * 0.2} strokeLinecap="round" opacity={0.85} />
                        )}

                        {/* building stock: tower-heavy — this is a CITY. Talls dominate
                            the core, mid-rises fill the rest, low-rise only at the fringe. */}
                        {slots.map((slot, i) => {
                            const central = Math.abs(slot.t) < 0.6;
                            const isTall = tier >= 1 && central && i % 3 !== 2;
                            const h = isTall
                                ? s * (1.4 + r() * 1.1 + tier * 0.15)
                                : s * (0.6 + r() * 0.6 + tier * 0.15);
                            const w = s * (0.38 + r() * 0.3);
                            return building(slot.p, h, w, palette[i % palette.length], i, i % 2 === 0);
                        })}

                        {/* second row behind downtown: depth without clutter */}
                        {tier >= 2 && slots.filter((_, i) => i % 3 === 0).map((slot, i) => {
                            const p: Pt = [slot.p[0] + perpX * slot.side * s * 0.75, slot.p[1] + perpY * slot.side * s * 0.75];
                            if (!inside(p)) return null;
                            const h = s * (0.9 + r() * 0.9);
                            return building(p, h, s * 0.42, palette[(i + 2) % palette.length], `b2-${i}`, false);
                        })}

                        {/* industrial edge: warehouse + chimney at the end of the street (city and up) */}
                        {tier >= 2 && (() => {
                            const p: Pt = [roadB[0] - dirX * s * 0.4, roadB[1] - dirY * s * 0.4];
                            if (!inside(p)) return null;
                            return (
                                <g>
                                    <rect x={p[0] - s * 0.55} y={p[1] - s * 0.4} width={s * 1.0} height={s * 0.45} fill="#57534e" />
                                    <path d={`M ${p[0] - s * 0.6} ${p[1] - s * 0.4} l ${s * 0.55} ${-s * 0.22} l ${s * 0.55} ${s * 0.22} Z`} fill="#78716c" />
                                    <rect x={p[0] + s * 0.55} y={p[1] - s * 0.95} width={s * 0.14} height={s * 1.0} fill="#44403c" />
                                    <circle cx={p[0] + s * 0.62} cy={p[1] - s * 1.05} r={s * 0.1} fill="#cbd5e1" className="bm-smoke" />
                                </g>
                            );
                        })()}

                        {/* landmark: what this city is ABOUT */}
                        {(() => {
                            const p: Pt = [cx0 - perpX * s * 0.9, cy0 - perpY * s * 0.9];
                            if (!inside(p) || tier === 0) return null;
                            if (capital) {
                                // grand civic dome + banner — unmistakably the seat of power
                                return (
                                    <g>
                                        <rect x={p[0] - s * 0.7} y={p[1] - s * 0.35} width={s * 1.4} height={s * 0.4} fill="#e7e5e4" />
                                        <path d={`M ${p[0] - s * 0.45} ${p[1] - s * 0.35} A ${s * 0.45} ${s * 0.45} 0 0 1 ${p[0] + s * 0.45} ${p[1] - s * 0.35}`} fill="#facc15" />
                                        {[-0.5, -0.25, 0, 0.25, 0.5].map((o, j) => (
                                            <line key={j} x1={p[0] + o * s} y1={p[1] + s * 0.05} x2={p[0] + o * s} y2={p[1] - s * 0.32} stroke="#a8a29e" strokeWidth={s * 0.06} />
                                        ))}
                                        <line x1={p[0]} y1={p[1] - s * 0.8} x2={p[0]} y2={p[1] - s * 1.2} stroke="#e7e5e4" strokeWidth={s * 0.05} />
                                        <path d={`M ${p[0]} ${p[1] - s * 1.2} l ${s * 0.3} ${s * 0.1} l ${-s * 0.3} ${s * 0.1} Z`} fill="#facc15" />
                                    </g>
                                );
                            }
                            const pickLm = Math.floor(r() * 3);
                            if (pickLm === 0) {
                                // monument obelisk on a plaza
                                return (
                                    <g>
                                        <rect x={p[0] - s * 0.45} y={p[1] - s * 0.06} width={s * 0.9} height={s * 0.14} fill="#94a3b8" opacity={0.6} />
                                        <path d={`M ${p[0] - s * 0.08} ${p[1]} L ${p[0] - s * 0.03} ${p[1] - s * 1.05} L ${p[0] + s * 0.03} ${p[1] - s * 1.05} L ${p[0] + s * 0.08} ${p[1]} Z`} fill="#e7e5e4" />
                                    </g>
                                );
                            }
                            if (pickLm === 1) {
                                // financial spire: glass wedge
                                return (
                                    <g>
                                        <path d={`M ${p[0] - s * 0.3} ${p[1]} L ${p[0]} ${p[1] - s * 1.4} L ${p[0] + s * 0.3} ${p[1]} Z`} fill="#0ea5e9" opacity={0.9} />
                                        <line x1={p[0]} y1={p[1] - s * 1.4} x2={p[0]} y2={p[1] - s * 1.65} stroke="#7dd3fc" strokeWidth={s * 0.05} />
                                    </g>
                                );
                            }
                            // rail station: platform hall + tracks stub
                            return (
                                <g>
                                    <rect x={p[0] - s * 0.55} y={p[1] - s * 0.35} width={s * 1.1} height={s * 0.35} fill="#7c5c3e" />
                                    <path d={`M ${p[0] - s * 0.62} ${p[1] - s * 0.35} A ${s * 0.62} ${s * 0.45} 0 0 1 ${p[0] + s * 0.62} ${p[1] - s * 0.35}`} fill="#a8a29e" />
                                    <line x1={p[0] - s * 0.7} y1={p[1] + s * 0.12} x2={p[0] + s * 0.7} y2={p[1] + s * 0.12} stroke="#64748b" strokeWidth={s * 0.07} strokeDasharray={`${s * 0.1} ${s * 0.12}`} />
                                </g>
                            );
                        })()}
                    </>
                );
            }
            default:
                return null;
        }
    }, [terrain, polygon, seedKey, s, ring, capital, roadBearing]);

    if (!content) return null;
    return <g pointerEvents="none" opacity={dimmed ? 0.12 : 0.9}>{content}</g>;
}
