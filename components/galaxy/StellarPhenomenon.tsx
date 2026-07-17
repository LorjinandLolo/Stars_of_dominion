"use client";

import React, { memo } from 'react';
import { hashString, PHENOMENA_TAGS } from './starVisuals';

// Priority order when a system has more than one phenomenon tag.
const PHENOMENA_PRIORITY = ['black_hole', 'dyson_remnant', 'nebula', 'ion_storm', 'asteroid_field', 'rogue_comet'];

export function dominantPhenomenon(tags?: string[]): string | null {
    if (!tags) return null;
    for (const p of PHENOMENA_PRIORITY) if (tags.includes(p)) return p;
    return null;
}

export function hasPhenomenon(tags?: string[]): boolean {
    if (!tags) return false;
    for (const t of tags) if (PHENOMENA_TAGS.has(t)) return true;
    return false;
}

/**
 * Large, spatial rendering of stellar phenomena — drawn as its own layer BEHIND the star
 * nodes so nebulae, black holes, asteroid belts, ion storms, dyson remnants and comets
 * read as regions/landmarks rather than tiny icons.
 */
const StellarPhenomenon = memo(({ sys, x, y, zoom }: { sys: any; x: number; y: number; zoom: number }) => {
    const type = dominantPhenomenon(sys.tags);
    if (!type) return null;

    const h = hashString(sys.id || '');
    const rot = h % 360;
    // Counter-scale against the map zoom so nebulae hold a steady on-screen size and stay
    // anchored to their system instead of ballooning/shrinking as you zoom.
    const invZoom = 1 / (zoom || 1);
    let feature: React.ReactNode = null;

    if (type === 'nebula') {
        const hueA = ['#818cf8', '#a78bfa', '#22d3ee', '#f472b6'][h % 4];
        const hueB = ['#c084fc', '#60a5fa', '#5eead4', '#fb7185'][(h >> 2) % 4];
        feature = (
            <g filter="url(#nebula-blur)" transform={`rotate(${rot}) scale(${invZoom})`}>
                <ellipse rx={38} ry={24} fill={hueA} opacity={0.11} className="gx-breathe-slow" />
                <ellipse cx={9} cy={-6} rx={22} ry={16} fill={hueB} opacity={0.09} />
                <ellipse cx={-11} cy={8} rx={17} ry={13} fill={hueA} opacity={0.08} />
            </g>
        );
    } else if (type === 'black_hole') {
        feature = (
            <g transform={`rotate(${rot})`}>
                <circle r={30} fill="url(#glow-blackHole)" opacity={0.55} />
                <ellipse rx={17} ry={5} fill="none" stroke="#c084fc" strokeWidth={1.6} opacity={0.85} className="gx-spin" />
                <ellipse rx={12} ry={3.4} fill="none" stroke="#f0abfc" strokeWidth={1} opacity={0.9} className="gx-spin" />
                <circle r={4} fill="#04010a" />
                <circle r={4} fill="none" stroke="#a855f7" strokeWidth={0.7} opacity={0.9} />
            </g>
        );
    } else if (type === 'dyson_remnant') {
        feature = (
            <g transform={`rotate(${rot})`}>
                <circle r={22} fill="url(#glow-blackHole)" opacity={0.18} />
                <circle r={15} fill="none" stroke="#a78bfa" strokeWidth={1.1} strokeDasharray="7 4" opacity={0.75} className="gx-spin-slow" />
                <circle r={18} fill="none" stroke="#8b5cf6" strokeWidth={0.6} strokeDasharray="3 6" opacity={0.5} className="gx-spin-rev" />
            </g>
        );
    } else if (type === 'ion_storm') {
        feature = (
            <g className="gx-breathe">
                <circle r={16} fill="#5eead4" opacity={0.05} />
                <circle r={13} fill="none" stroke="#5eead4" strokeWidth={0.8} strokeDasharray="1 2.5" opacity={0.7} className="gx-spin" />
                <circle r={9} fill="none" stroke="#99f6e4" strokeWidth={0.5} strokeDasharray="0.5 3" opacity={0.6} className="gx-spin-rev" />
            </g>
        );
    } else if (type === 'asteroid_field') {
        const rocks = Array.from({ length: 16 }, (_, i) => {
            const a = (((h >> i) % 360) * Math.PI) / 180 + i * 0.4;
            const rad = 9 + ((h >> (i + 3)) % 8);
            return <circle key={i} cx={Math.cos(a) * rad} cy={Math.sin(a) * rad * 0.7} r={0.7} fill="#a8a29e" opacity={0.7} />;
        });
        feature = <g className="gx-spin-slow">{rocks}</g>;
    } else if (type === 'rogue_comet') {
        feature = (
            <g transform={`rotate(${rot})`}>
                <line x1={-12} y1={7} x2={9} y2={-5} stroke="#93c5fd" strokeWidth={0.8} opacity={0.5} strokeLinecap="round" />
                <circle cx={9} cy={-5} r={1.6} fill="#dbeafe" />
            </g>
        );
    }

    return <g transform={`translate(${x}, ${y})`} pointerEvents="none">{feature}</g>;
}, (p, n) =>
    p.sys.id === n.sys.id && p.x === n.x && p.y === n.y && p.zoom === n.zoom &&
    (p.sys.tags?.join(',') === n.sys.tags?.join(','))
);

StellarPhenomenon.displayName = 'StellarPhenomenon';

export default StellarPhenomenon;
