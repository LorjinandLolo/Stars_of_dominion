"use client";

// components/planet/WarLayer.tsx
// The ground war drawn on the surface board: who holds what, where the front
// line is, where the enemy came down. Same districts the player developed in
// peacetime — no separate battle map.

import React from 'react';
import type { PlanetSurface } from '@/lib/planet-surface/types';
import type { DistrictWarState } from '@/lib/combat/siege/siege-types';
import { controllerOf, computeFront, isPassable } from '@/lib/combat/siege/district-front';
import type { SurfaceGeometry, Pt } from './surfaceGeometry';

interface WarLayerProps {
    surface: PlanetSurface;
    geo: SurfaceGeometry;
    war: DistrictWarState;
    /** Colors of the two sides — attacker first. */
    attackerColor: string;
    defenderColor: string;
    /** True when the viewing player is the invader (frames the front line). */
    playerIsAttacker: boolean;
}

const EPS = 0.6;
const near = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;

/** Shared polygon edges between two cells — the actual front trace. */
function sharedEdges(a: Pt[], b: Pt[]): Array<[Pt, Pt]> {
    const out: Array<[Pt, Pt]> = [];
    for (let i = 0; i < a.length; i++) {
        const p = a[i];
        const q = a[(i + 1) % a.length];
        if (b.some(v => near(p, v)) && b.some(v => near(q, v))) out.push([p, q]);
    }
    return out;
}

export default function WarLayer({ surface, geo, war, attackerColor, defenderColor, playerIsAttacker }: WarLayerProps) {
    const front = React.useMemo(() => computeFront(surface, war), [surface, war]);
    const frontSet = React.useMemo(() => new Set(front), [front]);

    // Trace the front: every edge where attacker ground meets defender ground.
    const frontEdges = React.useMemo(() => {
        const edges: Array<{ key: string; a: Pt; b: Pt }> = [];
        for (const sec of surface.sectors) {
            if (controllerOf(war, sec.index) !== 'attacker') continue;
            for (const n of geo.cellNeighbors[sec.index]) {
                if (controllerOf(war, n) === 'attacker') continue;
                if (!isPassable(surface.sectors[n])) continue;
                for (const [p, q] of sharedEdges(geo.rawPolygons[sec.index], geo.rawPolygons[n])) {
                    edges.push({ key: `fe-${sec.index}-${n}-${p[0].toFixed(0)}`, a: p, b: q });
                }
            }
        }
        return edges;
    }, [surface, geo, war]);

    return (
        <g pointerEvents="none">
            {/* Territory tint: who holds the ground */}
            {surface.sectors.map(sec => {
                if (!isPassable(sec)) return null;
                const held = controllerOf(war, sec.index);
                const contested = frontSet.has(sec.index);
                if (held !== 'attacker' && !contested) return null;
                return (
                    <path
                        key={`war-${sec.index}`}
                        d={geo.paths[sec.index]}
                        fill={held === 'attacker' ? attackerColor : defenderColor}
                        fillOpacity={held === 'attacker' ? 0.34 : 0.2}
                        className={contested ? 'war-contested' : undefined}
                    />
                );
            })}

            {/* Contested districts: the fighting, marked with crossed blades */}
            {front.map(idx => {
                const [x, y] = geo.centroids[idx];
                return (
                    <g key={`ct-${idx}`} className="war-clash" style={{ transformOrigin: `${x}px ${y}px` }}>
                        <circle cx={x} cy={y} r={13} fill="#7f1d1d" fillOpacity={0.5} stroke="#fca5a5" strokeWidth={1} />
                        <path
                            d={`M ${x - 6} ${y - 6} L ${x + 6} ${y + 6} M ${x + 6} ${y - 6} L ${x - 6} ${y + 6}`}
                            stroke="#fecaca" strokeWidth={2} strokeLinecap="round"
                        />
                    </g>
                );
            })}

            {/* The front line itself */}
            {frontEdges.map(e => (
                <g key={e.key}>
                    <line x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} stroke="#0f172a" strokeWidth={5} strokeLinecap="round" opacity={0.75} />
                    <line
                        x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]}
                        stroke={playerIsAttacker ? attackerColor : defenderColor}
                        strokeWidth={2.6} strokeLinecap="round"
                        strokeDasharray="9 5" className="war-front"
                    />
                </g>
            ))}

            {/* Beachheads: where the invasion came down */}
            {war.landingZones.map(idx => {
                const [x, y] = geo.centroids[idx];
                return (
                    <g key={`lz-${idx}`}>
                        <circle cx={x} cy={y} r={20} fill="none" stroke={attackerColor} strokeWidth={1.6}
                            strokeDasharray="5 4" className="war-lz" style={{ transformOrigin: `${x}px ${y}px` }} />
                        {/* drop-ship chevron */}
                        <path d={`M ${x} ${y - 9} l 6 11 l -6 -3.5 l -6 3.5 Z`} fill={attackerColor} stroke="#020617" strokeWidth={0.7} />
                    </g>
                );
            })}

            <style>{`
                .war-front { animation: war-front 1.1s linear infinite; }
                @keyframes war-front { to { stroke-dashoffset: -14; } }
                .war-contested { animation: war-contested 1.6s ease-in-out infinite; }
                @keyframes war-contested { 0%,100% { fill-opacity: 0.18; } 50% { fill-opacity: 0.42; } }
                .war-clash { animation: war-clash 1.6s ease-in-out infinite; }
                @keyframes war-clash { 0%,100% { transform: scale(0.92); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } }
                .war-lz { animation: war-lz 3.2s ease-out infinite; }
                @keyframes war-lz { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(1.25); opacity: 0; } }
                @media (prefers-reduced-motion: reduce) {
                    .war-front, .war-contested, .war-clash, .war-lz { animation: none; }
                }
            `}</style>
        </g>
    );
}
