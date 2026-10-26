"use client";

// components/planet/RiverLayer.tsx
// The board's rivers and lakes (shapes from riverPaths.ts): banks, water and
// a pale current down the middle; lakes as rounded basins; sand fans where a
// big river makes its delta. Solid water, never dashed — dashed lines on this
// board are routes.

import React from 'react';
import type { RiverShapes } from './riverPaths';

const BANK = '#0c4a6e';
const WATER = '#0ea5e9';
const CURRENT = '#e0f2fe';

/** `shapes` from buildRivers (riverPaths.ts), built once by the surface view and shared with the scenery. */
export default function RiverLayer({ shapes }: { shapes: RiverShapes }) {
    return (
        <g pointerEvents="none">
            {shapes.deltas.map(d => (
                <path key={d.key} d={d.fan} fill="#e6d3a3" opacity={0.55} />
            ))}
            {shapes.lakes.map(l => (
                <g key={l.key}>
                    <path d={l.d} fill={BANK} opacity={0.7} stroke={BANK} strokeWidth={3} strokeLinejoin="round" />
                    <path d={l.d} fill={WATER} opacity={0.92} />
                    {/* a pale shoreline just inside the bank */}
                    <path d={l.d} fill="none" stroke={CURRENT} strokeWidth={0.9} opacity={0.3} />
                </g>
            ))}
            {shapes.ribbons.map(r => <path key={`${r.key}-bank`} d={r.bank} fill={BANK} opacity={0.6} />)}
            {shapes.ribbons.map(r => <path key={`${r.key}-water`} d={r.water} fill={WATER} opacity={0.95} />)}
            {shapes.ribbons.map(r => (
                <path key={`${r.key}-current`} d={r.shimmer} fill="none" stroke={CURRENT} strokeWidth={r.shimmerWidth}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.45} />
            ))}
        </g>
    );
}
