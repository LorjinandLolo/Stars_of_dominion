// components/planet/bodyVisuals.tsx
// How a world looks in the system view: drawn from what the body generator
// rolled (lib/exploration/body-generator.ts — size, habitability, gas giant,
// moons, deposits) and the surface archetype. Pure SVG, deterministic per
// planet id, so a world looks the same every time it is drawn.

import React from 'react';
import { hashString } from '@/lib/galaxy/star-class';
import type { PlanetArchetype } from '@/lib/planet-surface/types';
import { ARCHETYPE_CORE } from './terrainMeta';

/** Marker radius: real size first, then type hints for older worlds. */
export function bodyRadius(planet: any): number {
    const t = String(planet?.planetType ?? '').toLowerCase();
    if (planet?.parentPlanetId) return 11;
    if (t === 'gas_giant') return 54;
    if (t.includes('mega')) return 46;
    if (t.includes('capital')) return 40;
    if (planet?.size === 'large') return 38;
    if (planet?.size === 'small') return 25;
    if (t.includes('moon')) return 22;
    return 32;
}

const GAS_PALETTES: Array<[string, string, string]> = [
    ['#e8c48f', '#b07a45', '#7a4b2a'], // banded tan
    ['#9ec5e8', '#4f7fb3', '#22406b'], // ice giant blue
    ['#a7e3d4', '#4a9c8c', '#1f5a52'], // teal methane
    ['#e6a07a', '#b0563a', '#6b2a1c'], // rust storm
    ['#d9c9f2', '#8f72c4', '#4b3478'], // violet haze
];

const COLD: PlanetArchetype[] = ['frozen', 'montane'];
const CAPPED: PlanetArchetype[] = ['continental', 'oceanic', 'gaia', 'frozen', 'montane', 'swamp'];

export interface BodyArtProps {
    planet: any;
    archetype: PlanetArchetype;
    x: number;
    y: number;
    r: number;
    /** Gradient id to use for the shading terminator (defined by the parent SVG). */
    limbId: string;
}

/**
 * One world: atmosphere, body, bands or caps, rings, terminator. Ids are
 * namespaced on the planet id so many worlds can share one SVG.
 */
export function BodyArt({ planet, archetype, x, y, r, limbId }: BodyArtProps) {
    const id = String(planet.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const h = hashString(planet.id + ':look');
    // Destroyed (lib/combat/planet-ruin.ts): a ring of tumbling rock where the world was.
    if (planet.destroyed) {
        return (
            <g>
                <circle cx={x} cy={y} r={r} fill="#f97316" opacity={0.06} />
                {Array.from({ length: 22 }, (_, k) => {
                    const a = (k / 22) * Math.PI * 2 + ((h >> (k % 16)) % 10) * 0.03;
                    const d = r * (0.55 + ((h >> (k % 11)) % 7) * 0.08);
                    const s = 1.2 + ((h >> (k % 13)) % 4) * 0.8;
                    return <polygon key={k} points={`${x + Math.cos(a) * d},${y + Math.sin(a) * d - s} ${x + Math.cos(a) * d + s},${y + Math.sin(a) * d + s * 0.6} ${x + Math.cos(a) * d - s},${y + Math.sin(a) * d + s * 0.5}`}
                        fill={k % 3 ? '#57534e' : '#78716c'} />;
                })}
            </g>
        );
    }
    // Glassed: a black-glass ball veined with cyan where it is still hot.
    if (planet.glassed) {
        return (
            <g>
                <defs>
                    <radialGradient id={`ba-glass-${id}`} cx="35%" cy="30%">
                        <stop offset="0%" stopColor="#475569" />
                        <stop offset="45%" stopColor="#1e293b" />
                        <stop offset="100%" stopColor="#020617" />
                    </radialGradient>
                    <clipPath id={`ba-gclip-${id}`}><circle cx={x} cy={y} r={r} /></clipPath>
                </defs>
                <circle cx={x} cy={y} r={r} fill={`url(#ba-glass-${id})`} stroke="#020617" strokeWidth={1.5} />
                <g clipPath={`url(#ba-gclip-${id})`} stroke="#22d3ee" strokeWidth={1} opacity={0.6} fill="none">
                    {Array.from({ length: 5 }, (_, k) => {
                        const a = ((h >> k) % 628) / 100;
                        return <path key={k} d={`M ${x} ${y} l ${Math.cos(a) * r * 0.5} ${Math.sin(a) * r * 0.5} l ${Math.cos(a + 0.6) * r * 0.5} ${Math.sin(a + 0.6) * r * 0.5}`} />;
                    })}
                </g>
                <ellipse cx={x - r * 0.35} cy={y - r * 0.4} rx={r * 0.25} ry={r * 0.12} fill="#e0f2fe" opacity={0.25} />
            </g>
        );
    }
    const gas = String(planet.planetType) === 'gas_giant';
    const palette = gas ? GAS_PALETTES[h % GAS_PALETTES.length] : null;
    const [inner, outer] = gas ? [palette![0], palette![2]] : ARCHETYPE_CORE[archetype];
    const hab = Number(planet.habitability) || (planet.ownerId ? 60 : 0);
    const alive = !gas && !planet.parentPlanetId && hab >= 45 && !(planet.tags ?? []).includes('dead_matter');
    const ringed = gas ? h % 2 === 0 : planet.size === 'large' && h % 7 === 0;
    const tilt = ((h >> 4) % 40) - 20;
    const irradiated = (planet.tags ?? []).includes('irradiated');
    const capped = !gas && !planet.parentPlanetId && CAPPED.includes(archetype);
    const capSize = COLD.includes(archetype) ? 0.55 : 0.32;

    const ring = (front: boolean) => (
        <g transform={`rotate(${tilt} ${x} ${y})`} pointerEvents="none">
            <path
                d={front
                    ? `M ${x - r * 1.85} ${y} A ${r * 1.85} ${r * 0.42} 0 0 0 ${x + r * 1.85} ${y}`
                    : `M ${x - r * 1.85} ${y} A ${r * 1.85} ${r * 0.42} 0 0 1 ${x + r * 1.85} ${y}`}
                fill="none" stroke={gas ? palette![0] : '#cbd5e1'} strokeOpacity={front ? 0.75 : 0.35} strokeWidth={r * 0.16}
            />
            <path
                d={front
                    ? `M ${x - r * 1.5} ${y} A ${r * 1.5} ${r * 0.33} 0 0 0 ${x + r * 1.5} ${y}`
                    : `M ${x - r * 1.5} ${y} A ${r * 1.5} ${r * 0.33} 0 0 1 ${x + r * 1.5} ${y}`}
                fill="none" stroke={gas ? palette![1] : '#94a3b8'} strokeOpacity={front ? 0.6 : 0.25} strokeWidth={r * 0.07}
            />
        </g>
    );

    return (
        <g>
            <defs>
                <radialGradient id={`ba-body-${id}`} cx="35%" cy="32%">
                    <stop offset="0%" stopColor={inner} />
                    <stop offset="100%" stopColor={outer} />
                </radialGradient>
                <clipPath id={`ba-clip-${id}`}><circle cx={x} cy={y} r={r} /></clipPath>
                {alive && (
                    <radialGradient id={`ba-air-${id}`}>
                        <stop offset="70%" stopColor={hab >= 70 ? '#7dd3fc' : '#a5b4fc'} stopOpacity={0} />
                        <stop offset="88%" stopColor={hab >= 70 ? '#7dd3fc' : '#a5b4fc'} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={hab >= 70 ? '#7dd3fc' : '#a5b4fc'} stopOpacity={0} />
                    </radialGradient>
                )}
            </defs>

            {ringed && ring(false)}
            {alive && <circle cx={x} cy={y} r={r * 1.22} fill={`url(#ba-air-${id})`} pointerEvents="none" />}
            <circle cx={x} cy={y} r={r} fill={`url(#ba-body-${id})`} stroke="#020617" strokeWidth={1.5} />

            <g clipPath={`url(#ba-clip-${id})`} pointerEvents="none">
                {/* Gas giants: latitude bands and a storm */}
                {gas && Array.from({ length: 6 }, (_, b) => {
                    const by = y - r + (b + 0.5) * (2 * r / 6) + (((h >> b) % 5) - 2);
                    return <rect key={b} x={x - r} y={by - r * 0.09} width={r * 2} height={r * (0.1 + ((h >> (b + 3)) % 3) * 0.04)}
                        fill={b % 2 ? palette![1] : palette![0]} opacity={0.45} transform={`rotate(${tilt * 0.3} ${x} ${y})`} />;
                })}
                {gas && h % 3 === 0 && (
                    <ellipse cx={x + r * 0.3} cy={y + r * 0.25} rx={r * 0.18} ry={r * 0.1} fill={palette![2]} opacity={0.7} />
                )}
                {/* Rocky worlds: polar caps where it is cold enough */}
                {capped && (
                    <>
                        <ellipse cx={x} cy={y - r} rx={r * 0.9} ry={r * capSize} fill="#f1f5f9" opacity={0.75} />
                        <ellipse cx={x} cy={y + r} rx={r * 0.8} ry={r * capSize * 0.8} fill="#f1f5f9" opacity={0.6} />
                    </>
                )}
                {/* Living worlds: a few cloud streaks */}
                {alive && Array.from({ length: 3 }, (_, c) => (
                    <ellipse key={c} cx={x - r * 0.4 + ((h >> (c * 3)) % 9) * r * 0.1} cy={y - r * 0.4 + c * r * 0.4}
                        rx={r * 0.45} ry={r * 0.07} fill="#ffffff" opacity={0.28} />
                ))}
                {irradiated && <circle cx={x} cy={y} r={r} fill="#a855f7" opacity={0.15} />}
            </g>

            <circle cx={x} cy={y} r={r} fill={`url(#${limbId})`} pointerEvents="none" />
            {ringed && ring(true)}
        </g>
    );
}

/** One line on a world: size, habitability, deposits. For the system view's labels. */
export function bodySummary(planet: any): string {
    const parts: string[] = [];
    if (planet.size) parts.push(planet.size);
    if (planet.destroyed) return 'destroyed: a debris field';
    if (planet.glassed) return 'glassed: dead glass';
    if (planet.planetType === 'gas_giant') parts.push('gas giant');
    if (Number(planet.habitability) > 0) parts.push(`hab ${planet.habitability}`);
    const deposits: Record<string, string> = {
        rare_minerals: 'rare minerals', geothermal: 'geothermal', ice: 'ice', helium3: 'helium-3', fertile: 'fertile', relic_site: 'relics',
    };
    const found = (planet.tags ?? []).map((t: string) => deposits[t]).filter(Boolean);
    if (found.length) parts.push(found.join(', '));
    return parts.join(' · ');
}
