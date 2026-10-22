"use client";

// components/planet/CampOverlay.tsx
// A camp world seen from orbit (lib/camps/labour-camp.ts): wired compounds
// with barrack rows, watchtowers sweeping searchlights, open quarry pits in
// the rock and foundries smoking everywhere else. Drawn over the districts
// outside the city core. Deterministic per district.

import React from 'react';
import type { PlanetSurface } from '@/lib/planet-surface/types';
import type { SurfaceGeometry } from './surfaceGeometry';

const ROCKY = ['mountains', 'desert', 'volcanic', 'frozen'];

export default function CampOverlay({ surface, geo, revolt = false }: { surface: PlanetSurface; geo: SurfaceGeometry; revolt?: boolean }) {
    const sites = surface.sectors.filter(s => s.ring >= 2 && s.terrain !== 'ocean' && (s.index % 5 === 0 || s.index % 5 === 2 || s.index % 5 === 3));
    return (
        <g pointerEvents="none">
            {sites.map(sec => {
                const [cx, cy] = geo.centroids[sec.index];
                const u = Math.max(6, Math.sqrt(geo.areas[sec.index]) * 0.15);
                const rocky = ROCKY.includes(sec.terrain);
                const sweep = 5 + (sec.index % 4);
                return (
                    <g key={sec.index} transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}>
                        {/* The wire */}
                        <rect x={-u * 2.2} y={-u * 1.6} width={u * 4.4} height={u * 3.2} fill="#1c1917" fillOpacity={0.45}
                            stroke={revolt ? '#ef4444' : '#a8a29e'} strokeWidth={0.9} strokeDasharray="2 1.4" />
                        {/* Barrack rows */}
                        {[-1, 0, 1].map(row => (
                            <rect key={row} x={-u * 1.7} y={-u * 0.25 + row * u * 0.85} width={u * (rocky ? 1.6 : 2.2)} height={u * 0.42} fill="#57534e" stroke="#292524" strokeWidth={0.4} />
                        ))}
                        {/* The work: a quarry in the rock, a foundry elsewhere */}
                        {rocky ? (
                            <g transform={`translate(${u * 1.15} 0)`}>
                                <ellipse rx={u * 0.85} ry={u * 1.05} fill="#44403c" />
                                <ellipse rx={u * 0.55} ry={u * 0.7} fill="#292524" />
                                <ellipse rx={u * 0.25} ry={u * 0.32} fill="#0c0a09" />
                            </g>
                        ) : (
                            <g transform={`translate(${u * 1.5} ${u * 0.2})`}>
                                <rect x={-u * 0.2} y={-u * 1.2} width={u * 0.4} height={u * 1.2} fill="#44403c" />
                                <circle cy={-u * 1.45} r={u * 0.35} fill="#78716c" opacity={0.6} className="camp-smoke" />
                                <circle cx={u * 0.3} cy={-u * 1.9} r={u * 0.45} fill="#78716c" opacity={0.4} className="camp-smoke" style={{ animationDelay: '-1.4s' }} />
                            </g>
                        )}
                        {/* Watchtower at the corner, sweeping the yard */}
                        <g transform={`translate(${-u * 2.2} ${-u * 1.6})`}>
                            <g className="camp-sweep" style={{ animationDuration: `${sweep}s` }}>
                                <path d={`M 0 0 L ${u * 6} ${-u * 1.1} L ${u * 6} ${u * 1.1} Z`} fill={revolt ? '#fca5a5' : '#fef9c3'} opacity={0.38} />
                            </g>
                            <rect x={-u * 0.25} y={-u * 0.25} width={u * 0.5} height={u * 0.5} fill="#292524" stroke="#a8a29e" strokeWidth={0.5} />
                            <circle r={u * 0.12} fill={revolt ? '#ef4444' : '#fde047'} />
                        </g>
                    </g>
                );
            })}
            <style>{`
                @keyframes camp-sweep { 0% { transform: rotate(10deg); } 50% { transform: rotate(80deg); } 100% { transform: rotate(10deg); } }
                .camp-sweep { animation: camp-sweep 6s ease-in-out infinite; transform-origin: 0 0; transform-box: view-box; }
                @keyframes camp-smoke { 0% { transform: translateY(0); opacity: 0.6; } 100% { transform: translateY(-6px); opacity: 0; } }
                .camp-smoke { animation: camp-smoke 2.8s ease-out infinite; }
                @media (prefers-reduced-motion: reduce) { .camp-sweep, .camp-smoke { animation: none; } }
            `}</style>
        </g>
    );
}
