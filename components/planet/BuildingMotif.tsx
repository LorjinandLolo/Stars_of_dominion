"use client";

// components/planet/BuildingMotif.tsx
// Buildings ARE the landscape. Strong minimalist silhouettes (Rebel Inc
// school): a mine is an open pit with a headframe, a city is a skyline, a
// military base is a fenced compound with a radar — readable at a glance,
// identifiable at small size, no tooltip required.

import React from 'react';
import type { SectorOccupant } from '@/lib/planet-surface/occupancy';
import { Pickaxe, Factory, Shield, FlaskConical, Home, Rocket, Package, ShieldCheck } from 'lucide-react';
import { isoBox, isoShades } from './iso';

const CATEGORY_GLYPH: Record<string, React.ComponentType<any>> = {
    resource: Pickaxe,
    industrial: Factory,
    military: Shield,
    research: FlaskConical,
    society: Home,
    defense: ShieldCheck,
    space: Rocket,
    logistics: Package,
};

interface MotifProps {
    category: string;
    buildingId: string;
    occupant: SectorOccupant;
    cx: number;
    cy: number;
    /** Rough cell size — motifs scale with their district. */
    scale: number;
    dimmed: boolean;
}

/** A proper 3-blade wind turbine, not a cross. */
function Turbine({ x, y, s }: { x: number; y: number; s: number }) {
    return (
        <g>
            <path d={`M ${x - s * 0.09} ${y} L ${x - s * 0.045} ${y - s * 1.15} L ${x + s * 0.045} ${y - s * 1.15} L ${x + s * 0.09} ${y} Z`} fill="#e7e5e4" />
            <g className="bm-spin" style={{ transformOrigin: `${x}px ${y - s * 1.15}px` }}>
                {[0, 120, 240].map(a => (
                    <path key={a}
                        d={`M ${x} ${y - s * 1.15} l ${s * 0.09} ${-s * 0.06} L ${x + s * 0.62} ${y - s * 1.15 - s * 0.28} l ${-s * 0.13} ${s * 0.16} Z`}
                        fill="#f5f5f4"
                        transform={`rotate(${a} ${x} ${y - s * 1.15})`}
                    />
                ))}
            </g>
            <circle cx={x} cy={y - s * 1.15} r={s * 0.07} fill="#78716c" />
        </g>
    );
}

export default function BuildingMotif({ category, buildingId, occupant, cx, cy, scale, dimmed }: MotifProps) {
    const s = Math.max(5, scale * 0.14);
    const busy = occupant.state === 'under_construction' || occupant.state === 'pending';
    const ruined = occupant.state === 'ruined';
    const Glyph = CATEGORY_GLYPH[category] ?? Factory;

    const isFarm = /farm|agri|hydro|food/i.test(buildingId);
    const isMine = /mine|extract|quarry|drill|deconstructor/i.test(buildingId);
    const isSolar = /solar|stellar|collector|conduit/i.test(buildingId);
    const isPower = /reactor|power|energy|grid|harvester/i.test(buildingId) || isSolar;

    const motif = (() => {
        if (isFarm) {
            // Fields + barn + silo + turbine
            return (
                <g>
                    {[-1, 0, 1].map(i => (
                        <rect key={i} x={cx - s * 1.9} y={cy - s * 0.75 + i * s * 0.65} width={s * 2.2} height={s * 0.36}
                            rx={s * 0.08} fill={i % 2 ? '#a3e635' : '#65a30d'} opacity={0.9} />
                    ))}
                    {/* barn: gabled, dark red */}
                    <rect x={cx + s * 0.6} y={cy - s * 0.15} width={s * 0.95} height={s * 0.6} fill="#9a3412" />
                    <path d={`M ${cx + s * 0.5} ${cy - s * 0.15} L ${cx + s * 1.07} ${cy - s * 0.6} L ${cx + s * 1.65} ${cy - s * 0.15} Z`} fill="#7c2d12" />
                    {/* silo: cylinder + dome */}
                    <rect x={cx + s * 1.75} y={cy - s * 0.55} width={s * 0.42} height={s * 1.0} rx={s * 0.06} fill="#d6d3d1" />
                    <path d={`M ${cx + s * 1.75} ${cy - s * 0.55} A ${s * 0.21} ${s * 0.21} 0 0 1 ${cx + s * 2.17} ${cy - s * 0.55}`} fill="#a8a29e" />
                    <Turbine x={cx - s * 1.5} y={cy + s * 0.45} s={s} />
                </g>
            );
        }
        if (isMine || (category === 'resource' && !isPower)) {
            // Open terraced pit + headframe + conveyor to stockpile
            return (
                <g>
                    <ellipse cx={cx - s * 0.5} cy={cy + s * 0.15} rx={s * 1.15} ry={s * 0.62} fill="#3f2f23" />
                    <ellipse cx={cx - s * 0.5} cy={cy + s * 0.15} rx={s * 0.78} ry={s * 0.4} fill="#57432f" />
                    <ellipse cx={cx - s * 0.5} cy={cy + s * 0.15} rx={s * 0.4} ry={s * 0.2} fill="#292018" />
                    {/* headframe: A-tower with wheel */}
                    <path d={`M ${cx + s * 0.65} ${cy + s * 0.55} L ${cx + s * 0.95} ${cy - s * 0.75} L ${cx + s * 1.25} ${cy + s * 0.55}`} fill="none" stroke="#a8a29e" strokeWidth={s * 0.13} />
                    <line x1={cx + s * 0.72} y1={cy + s * 0.1} x2={cx + s * 1.18} y2={cy + s * 0.1} stroke="#a8a29e" strokeWidth={s * 0.09} />
                    <circle cx={cx + s * 0.95} cy={cy - s * 0.75} r={s * 0.16} fill="none" stroke="#d6d3d1" strokeWidth={s * 0.08} />
                    {/* conveyor + ore stockpile */}
                    <line x1={cx + s * 1.05} y1={cy + s * 0.35} x2={cx + s * 1.85} y2={cy - s * 0.05} stroke="#78716c" strokeWidth={s * 0.1} />
                    <path d={`M ${cx + s * 1.6} ${cy + s * 0.55} q ${s * 0.35} ${-s * 0.6} ${s * 0.7} 0 Z`} fill="#8b7355" />
                </g>
            );
        }
        if (isSolar) {
            // Solar array: tilted panel grid + collector mast
            return (
                <g>
                    {[0, 1, 2].map(i => (
                        <g key={i}>
                            <path d={`M ${cx - s * 1.7 + i * s * 1.15} ${cy + s * 0.35} l ${s * 0.85} 0 l ${s * 0.25} ${-s * 0.55} l ${-s * 0.85} 0 Z`}
                                fill="#1d4ed8" stroke="#93c5fd" strokeWidth={s * 0.05} />
                            <line x1={cx - s * 1.28 + i * s * 1.15} y1={cy + s * 0.35} x2={cx - s * 1.28 + i * s * 1.15} y2={cy + s * 0.6} stroke="#94a3b8" strokeWidth={s * 0.08} />
                        </g>
                    ))}
                    <line x1={cx + s * 1.9} y1={cy + s * 0.6} x2={cx + s * 1.9} y2={cy - s * 0.7} stroke="#cbd5e1" strokeWidth={s * 0.1} />
                    <circle cx={cx + s * 1.9} cy={cy - s * 0.8} r={s * 0.18} fill="#fbbf24" className="bm-glow" />
                </g>
            );
        }
        if (isPower) {
            // Cooling tower pair + steam + small reactor block
            return (
                <g>
                    {[0, 1].map(i => (
                        <g key={i}>
                            <path d={`M ${cx - s * 1.3 + i * s * 1.15} ${cy + s * 0.6}
                                      C ${cx - s * 1.05 + i * s * 1.15} ${cy - s * 0.1} ${cx - s * 1.05 + i * s * 1.15} ${cy - s * 0.35} ${cx - s * 1.15 + i * s * 1.15} ${cy - s * 0.8}
                                      L ${cx - s * 0.55 + i * s * 1.15} ${cy - s * 0.8}
                                      C ${cx - s * 0.65 + i * s * 1.15} ${cy - s * 0.35} ${cx - s * 0.65 + i * s * 1.15} ${cy - s * 0.1} ${cx - s * 0.4 + i * s * 1.15} ${cy + s * 0.6} Z`}
                                fill="#94a3b8" stroke="#64748b" strokeWidth={s * 0.05} />
                            {!ruined && (
                                <circle cx={cx - s * 0.85 + i * s * 1.15} cy={cy - s * 1.0} r={s * 0.2}
                                    fill="#e2e8f0" className="bm-smoke" style={{ animationDelay: `${i * 1.4}s` }} />
                            )}
                        </g>
                    ))}
                    <rect x={cx + s * 0.75} y={cy - s * 0.1} width={s * 1.0} height={s * 0.7} fill="#334155" />
                    <circle cx={cx + s * 1.25} cy={cy + s * 0.25} r={s * 0.16} fill="#38bdf8" className="bm-glow" />
                </g>
            );
        }
        switch (category) {
            case 'industrial':
                // Sawtooth factory + tall smokestacks + rail spur
                return (
                    <g>
                        <path d={`M ${cx - s * 1.8} ${cy + s * 0.6} L ${cx - s * 1.8} ${cy - s * 0.25}
                                  l ${s * 0.6} ${-s * 0.45} l 0 ${s * 0.45} l ${s * 0.6} ${-s * 0.45} l 0 ${s * 0.45}
                                  l ${s * 0.6} ${-s * 0.45} l 0 ${s * 1.15} Z`} fill="#475569" />
                        <rect x={cx + s * 0.35} y={cy - s * 1.45} width={s * 0.3} height={s * 2.05} fill="#57534e" />
                        <rect x={cx + s * 0.9} y={cy - s * 1.05} width={s * 0.26} height={s * 1.65} fill="#44403c" />
                        {!ruined && [0, 1, 2].map(i => (
                            <circle key={i} cx={cx + s * 0.5} cy={cy - s * 1.65} r={s * 0.18}
                                fill="#cbd5e1" className="bm-smoke" style={{ animationDelay: `${i * 1.1}s` }} />
                        ))}
                        <line x1={cx - s * 1.8} y1={cy + s * 0.72} x2={cx + s * 1.6} y2={cy + s * 0.72} stroke="#78716c" strokeWidth={s * 0.09} strokeDasharray={`${s * 0.22} ${s * 0.14}`} />
                    </g>
                );
            case 'society': {
                // An arcology cluster in isometric: staggered towers on a raised
                // platform, crowned by a central spire. Unmistakably built.
                const towers = [
                    { x: -1.5, y: 0.5, h: 1.0 }, { x: -0.6, y: -0.4, h: 1.9 },
                    { x: 0.4, y: 0.4, h: 1.35 }, { x: 1.3, y: -0.3, h: 0.85 },
                    { x: -0.2, y: 1.2, h: 0.7 },
                ];
                const colors = ['#5b6b8c', '#2a7f8f', '#3c4d70', '#6d7ea3', '#8892a8'];
                return (
                    <g>
                        {/* plaza the towers stand on */}
                        <ellipse cx={cx} cy={cy + s * 0.7} rx={s * 2.4} ry={s * 1.05} fill="#1e293b" opacity={0.55} />
                        {towers
                            .map((t, i) => ({ ...t, i, sy: cy + t.y * s * 0.75 }))
                            .sort((a, b) => a.sy - b.sy)
                            .map(t => {
                                const ox = cx + t.x * s * 0.8;
                                const oy = t.sy;
                                const w = s * 0.5;
                                const faces = isoBox(ox, oy, w, w * 0.85, s * t.h);
                                const [top, left, right] = isoShades(colors[t.i % colors.length]);
                                return (
                                    <g key={t.i}>
                                        <polygon points={faces.left} fill={left} />
                                        <polygon points={faces.right} fill={right} />
                                        <polygon points={faces.top} fill={top} stroke="#0f172a" strokeWidth={0.3} />
                                        <circle cx={ox} cy={oy - s * t.h - s * 0.05} r={s * 0.08}
                                            fill="#fbbf24" className="bm-twinkle" style={{ animationDelay: `${t.i * 0.6}s` }} />
                                    </g>
                                );
                            })}
                        {/* central spire */}
                        <line x1={cx - s * 0.3} y1={cy - s * 1.85} x2={cx - s * 0.3} y2={cy - s * 2.6} stroke="#cbd5e1" strokeWidth={s * 0.07} />
                        <circle cx={cx - s * 0.3} cy={cy - s * 2.66} r={s * 0.09} fill="#f87171" className="bm-twinkle" />
                    </g>
                );
            }
            case 'research':
                // Observatory dome + radio dish
                return (
                    <g>
                        <path d={`M ${cx - s * 1.15} ${cy + s * 0.55} A ${s * 0.85} ${s * 0.85} 0 0 1 ${cx + s * 0.55} ${cy + s * 0.55} Z`} fill="#155e75" stroke="#22d3ee" strokeWidth={s * 0.08} />
                        <rect x={cx - s * 0.42} y={cy - s * 0.62} width={s * 0.24} height={s * 0.5} fill="#0e7490" transform={`rotate(30 ${cx - s * 0.3} ${cy - s * 0.35})`} />
                        <path d={`M ${cx + s * 1.0} ${cy + s * 0.15} A ${s * 0.5} ${s * 0.5} 0 0 1 ${cx + s * 1.9} ${cy - s * 0.35}`} fill="none" stroke="#a5f3fc" strokeWidth={s * 0.1} />
                        <line x1={cx + s * 1.45} y1={cy - s * 0.1} x2={cx + s * 1.45} y2={cy + s * 0.55} stroke="#67e8f9" strokeWidth={s * 0.09} />
                    </g>
                );
            case 'military':
                // Fenced compound in army drab: perimeter, guard tower, hangar, radar
                return (
                    <g>
                        <rect x={cx - s * 1.9} y={cy - s * 1.0} width={s * 3.8} height={s * 2.0} fill="#1a2e05" fillOpacity={0.5}
                            stroke="#4d7c0f" strokeWidth={s * 0.09} strokeDasharray={`${s * 0.28} ${s * 0.18}`} />
                        {/* guard tower — dark steel, not signal green */}
                        <path d={`M ${cx - s * 1.45} ${cy + s * 0.65} l ${s * 0.16} ${-s * 1.0} l ${s * 0.3} 0 l ${s * 0.16} ${s * 1.0}`} fill="none" stroke="#4b5563" strokeWidth={s * 0.1} />
                        <rect x={cx - s * 1.45} y={cy - s * 0.65} width={s * 0.62} height={s * 0.34} fill="#374151" stroke="#1f2937" strokeWidth={s * 0.04} />
                        {/* hangar */}
                        <path d={`M ${cx - s * 0.45} ${cy + s * 0.62} l 0 ${-s * 0.5} A ${s * 0.55} ${s * 0.55} 0 0 1 ${cx + s * 0.65} ${cy + s * 0.12} l 0 ${s * 0.5} Z`} fill="#3f6212" />
                        <rect x={cx - s * 0.28} y={cy + s * 0.22} width={s * 0.66} height={s * 0.4} fill="#1a2e05" />
                        {/* radar mast: dark steel, dish sweeping */}
                        <line x1={cx + s * 1.35} y1={cy + s * 0.62} x2={cx + s * 1.35} y2={cy - s * 0.15} stroke="#4b5563" strokeWidth={s * 0.1} />
                        <g className="bm-radar" style={{ transformOrigin: `${cx + s * 1.35}px ${cy - s * 0.2}px` }}>
                            <path d={`M ${cx + s * 1.35} ${cy - s * 0.2} A ${s * 0.42} ${s * 0.42} 0 0 1 ${cx + s * 1.05} ${cy - s * 0.72}`} fill="none" stroke="#d9f99d" strokeWidth={s * 0.1} />
                        </g>
                    </g>
                );
            case 'defense':
                // Fortress: walls, corner bastions, turret with barrel
                return (
                    <g>
                        <rect x={cx - s * 1.2} y={cy - s * 0.7} width={s * 2.4} height={s * 1.4} fill="#292524" fillOpacity={0.55} stroke="#a8a29e" strokeWidth={s * 0.16} />
                        {[[-1.2, -0.7], [1.2, -0.7], [-1.2, 0.7], [1.2, 0.7]].map(([ox, oy], i) => (
                            <rect key={i} x={cx + ox * s - s * 0.22} y={cy + oy * s - s * 0.22} width={s * 0.44} height={s * 0.44} fill="#78716c" />
                        ))}
                        <circle cx={cx} cy={cy} r={s * 0.38} fill="#44403c" stroke="#d6d3d1" strokeWidth={s * 0.07} />
                        <line x1={cx} y1={cy} x2={cx + s * 0.85} y2={cy - s * 0.55} stroke="#e7e5e4" strokeWidth={s * 0.13} />
                    </g>
                );
            case 'space':
                // Launch complex: pad, gantry tower, rocket
                return (
                    <g>
                        <circle cx={cx - s * 0.2} cy={cy + s * 0.45} r={s * 1.0} fill="#1e293b" stroke="#475569" strokeWidth={s * 0.07} />
                        <circle cx={cx - s * 0.2} cy={cy + s * 0.45} r={s * 0.5} fill="none" stroke="#38bdf8" strokeWidth={s * 0.06} strokeDasharray={`${s * 0.2} ${s * 0.15}`} />
                        <path d={`M ${cx - s * 0.2} ${cy - s * 1.2} c ${s * 0.22} ${s * 0.3} ${s * 0.22} ${s * 0.9} ${s * 0.16} ${s * 1.35} l ${-s * 0.32} 0 c ${-s * 0.06} ${-s * 0.45} ${-s * 0.06} ${-s * 1.05} ${s * 0.16} ${-s * 1.35} Z`} fill="#e2e8f0" />
                        <path d={`M ${cx - s * 0.36} ${cy + s * 0.15} l ${-s * 0.2} ${s * 0.3} l ${s * 0.2} 0 Z`} fill="#94a3b8" />
                        <path d={`M ${cx - s * 0.04} ${cy + s * 0.15} l ${s * 0.2} ${s * 0.3} l ${-s * 0.2} 0 Z`} fill="#94a3b8" />
                        {/* gantry */}
                        <line x1={cx + s * 0.55} y1={cy + s * 0.45} x2={cx + s * 0.55} y2={cy - s * 1.25} stroke="#78716c" strokeWidth={s * 0.11} />
                        {[0.25, -0.25, -0.75].map((oy, i) => (
                            <line key={i} x1={cx + s * 0.55} y1={cy + oy * s} x2={cx + s * 0.1} y2={cy + oy * s} stroke="#78716c" strokeWidth={s * 0.06} />
                        ))}
                    </g>
                );
            case 'logistics':
                // Warehouse row + gantry crane + container stacks
                return (
                    <g>
                        {[0, 1].map(i => (
                            <g key={i}>
                                <rect x={cx - s * 1.8 + i * s * 1.15} y={cy - s * 0.25} width={s * 1.0} height={s * 0.8} fill="#57534e" />
                                <path d={`M ${cx - s * 1.85 + i * s * 1.15} ${cy - s * 0.25} A ${s * 0.55} ${s * 0.35} 0 0 1 ${cx - s * 0.75 + i * s * 1.15} ${cy - s * 0.25}`} fill="#78716c" />
                            </g>
                        ))}
                        {/* gantry crane */}
                        <path d={`M ${cx + s * 0.75} ${cy + s * 0.55} l 0 ${-s * 1.1} l ${s * 1.2} 0 l 0 ${s * 1.1}`} fill="none" stroke="#eab308" strokeWidth={s * 0.1} />
                        <line x1={cx + s * 1.15} y1={cy - s * 0.55} x2={cx + s * 1.15} y2={cy - s * 0.1} stroke="#eab308" strokeWidth={s * 0.07} />
                        {/* containers */}
                        {[0, 1, 2].map(i => (
                            <rect key={i} x={cx + s * 0.85 + (i % 2) * s * 0.55} y={cy + s * 0.28 - Math.floor(i / 2) * s * 0.3} width={s * 0.5} height={s * 0.26}
                                fill={['#dc2626', '#2563eb', '#d97706'][i]} />
                        ))}
                    </g>
                );
            default:
                return <circle cx={cx} cy={cy} r={s * 0.8} fill="#475569" />;
        }
    })();

    return (
        <g pointerEvents="none" opacity={dimmed ? 0.15 : 1}>
            {busy && (
                <g>
                    <rect x={cx - s * 2.0} y={cy - s * 1.9} width={s * 4.0} height={s * 2.9} fill="none"
                        stroke="#38bdf8" strokeWidth={1.4} strokeDasharray="5 4" className="bm-scaffold" />
                    <line x1={cx + s * 1.6} y1={cy - s * 1.9} x2={cx + s * 2.4} y2={cy - s * 2.6} stroke="#7dd3fc" strokeWidth={1.2} />
                    <line x1={cx + s * 2.4} y1={cy - s * 2.6} x2={cx + s * 1.9} y2={cy - s * 2.6} stroke="#7dd3fc" strokeWidth={1.2} />
                </g>
            )}
            <g opacity={busy ? 0.55 : 1}>
                {motif}
            </g>
            {ruined && (
                <g>
                    <path d={`M ${cx - s * 1.4} ${cy - s * 1.2} L ${cx + s * 1.4} ${cy + s * 1.0} M ${cx + s * 1.4} ${cy - s * 1.2} L ${cx - s * 1.4} ${cy + s * 1.0}`}
                        stroke="#ef4444" strokeWidth={s * 0.18} opacity={0.8} />
                    {[0, 1].map(i => (
                        <circle key={i} cx={cx - s * 0.4 + i * s * 0.7} cy={cy - s * 0.9} r={s * 0.16}
                            fill="#57534e" className="bm-smoke" style={{ animationDelay: `${i * 1.6}s` }} />
                    ))}
                </g>
            )}
            {/* Category badge for skimming */}
            <g transform={`translate(${(cx + s * 2.0).toFixed(1)}, ${(cy - s * 2.3).toFixed(1)})`}>
                <circle cx={5.5} cy={5.5} r={8} fill="#020617" fillOpacity={0.72} />
                <Glyph size={11} color={ruined ? '#fca5a5' : busy ? '#7dd3fc' : '#e2e8f0'} strokeWidth={2.4} />
            </g>
        </g>
    );
}
