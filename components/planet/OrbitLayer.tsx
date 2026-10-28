"use client";

// components/planet/OrbitLayer.tsx
// What hangs above the world, drawn beside it in the surface view the way
// Empire at War shows a planet's station: a tilted orbit around the globe,
// the station in the margin on its near side, defence platforms riding the
// ring, and the fleets in orbit holding off the far side.
//
// The station is ASSEMBLED from the world's orbital slots (planet.orbital,
// lib/orbital): the station structure is the core, every other structure is a
// module on a truss around it, empty slots are sockets (shown to the owner),
// and work under construction is scaffolding with its progress. So the more
// a player builds in orbit, the more elaborate the station visibly gets.
//
// Two layers share the board's coordinates (0..1000, planet at 500,500 r468)
// and overflow into the margins: 'back' draws the far half of the orbit
// before the board (the planet hides it), 'front' everything in front of it.

import React from 'react';
import { ORBITAL_STRUCTURE_BY_ID } from '@/data/orbital-structures';
import { factionColor } from '@/components/galaxy/starVisuals';

const CX = 500, CY = 500;
/** The orbit: a flat ellipse, tilted, well outside the globe (r 468). */
const RX = 630, RY = 112, TILT = (-9 * Math.PI) / 180;
/** Where on the orbit the station rides: the near right, in the margin. */
const STATION_AT = 0.16;
const FLEETS_AT = Math.PI - 0.12;

const pointAt = (t: number): [number, number] => {
    const x = RX * Math.cos(t), y = RY * Math.sin(t);
    return [CX + x * Math.cos(TILT) - y * Math.sin(TILT), CY + x * Math.sin(TILT) + y * Math.cos(TILT)];
};
/** sin(t) >= 0 is the near half (in front of the planet). */
const near = (t: number) => Math.sin(t) >= 0;
const arc = (from: number, to: number) => {
    const pts: string[] = [];
    for (let k = 0; k <= 48; k++) {
        const [x, y] = pointAt(from + ((to - from) * k) / 48);
        pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `M ${pts.join(' L ')}`;
};
const f1 = (n: number) => n.toFixed(1);

interface Slot { slotId: string; structureId: string | null; state: string; completesAt: number | null; integrity: number }
interface Props {
    planet: any;
    side: 'back' | 'front';
    fleets: any[];
    nowSeconds: number;
    isOwner: boolean;
    onOpenOrbit?: () => void;
}

const STEEL = '#94a3b8', DARK = '#334155', LIGHT = '#e2e8f0', GLOW = '#38bdf8';

/** The station's core, by what kind of station it is. */
function Core({ id, k }: { id: string; k: number }) {
    switch (id) {
        case 'fortress_station':
            return (
                <g>
                    <polygon points={Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return `${f1(Math.cos(a) * 46 * k)},${f1(Math.sin(a) * 46 * k)}`; }).join(' ')}
                        fill={DARK} stroke={STEEL} strokeWidth={3 * k} />
                    {Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return <circle key={i} cx={Math.cos(a) * 34 * k} cy={Math.sin(a) * 34 * k} r={4.5 * k} fill="#f87171" />; })}
                    <circle r={16 * k} fill={STEEL} /><circle r={6 * k} fill={GLOW} className="orb-blink" />
                </g>
            );
        case 'military_station':
            return (
                <g>
                    <polygon points={Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return `${f1(Math.cos(a) * 34 * k)},${f1(Math.sin(a) * 34 * k)}`; }).join(' ')}
                        fill="#475569" stroke={STEEL} strokeWidth={2.5 * k} />
                    {[0, 2, 4].map(i => { const a = (i / 6) * Math.PI * 2; return <rect key={i} x={Math.cos(a) * 26 * k - 4 * k} y={Math.sin(a) * 26 * k - 4 * k} width={8 * k} height={8 * k} fill="#f87171" />; })}
                    <circle r={10 * k} fill={LIGHT} /><circle r={4 * k} fill={GLOW} className="orb-blink" />
                </g>
            );
        case 'research_station':
            return (
                <g>
                    <circle r={30 * k} fill="none" stroke={STEEL} strokeWidth={5 * k} />
                    <circle r={13 * k} fill={GLOW} opacity={0.85} />
                    <path d={`M ${f1(-8 * k)} ${f1(-30 * k)} A ${f1(14 * k)} ${f1(14 * k)} 0 0 1 ${f1(8 * k)} ${f1(-30 * k)}`} fill="none" stroke={LIGHT} strokeWidth={3 * k} />
                    <line x1={0} y1={-30 * k} x2={0} y2={-42 * k} stroke={LIGHT} strokeWidth={2 * k} />
                </g>
            );
        case 'trade_station':
            return (
                <g>
                    <circle r={32 * k} fill="none" stroke={STEEL} strokeWidth={6 * k} />
                    {[0, 1, 2].map(i => { const a = (i / 3) * Math.PI * 2 + 0.5; return <rect key={i} x={Math.cos(a) * 32 * k - 7 * k} y={Math.sin(a) * 32 * k - 5 * k} width={14 * k} height={10 * k} fill="#fbbf24" stroke={DARK} strokeWidth={k} />; })}
                    <circle r={11 * k} fill={LIGHT} /><circle r={4 * k} fill={GLOW} className="orb-blink" />
                </g>
            );
        default: // space_station
            return (
                <g>
                    <circle r={32 * k} fill="none" stroke={STEEL} strokeWidth={6 * k} />
                    {[0, 1, 2, 3].map(i => { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; return <line key={i} x1={0} y1={0} x2={Math.cos(a) * 30 * k} y2={Math.sin(a) * 30 * k} stroke={STEEL} strokeWidth={3 * k} />; })}
                    <circle r={11 * k} fill={LIGHT} /><circle r={4 * k} fill={GLOW} className="orb-blink" />
                </g>
            );
    }
}

/** One module on its truss, pointing outward at `angle`. */
function Module({ id, k }: { id: string; k: number }) {
    switch (id) {
        case 'spaceyard': case 'advanced_spaceyard': case 'capital_spaceyard': {
            const len = (id === 'capital_spaceyard' ? 96 : id === 'advanced_spaceyard' ? 76 : 58) * k;
            const ribs = id === 'capital_spaceyard' ? 6 : id === 'advanced_spaceyard' ? 5 : 4;
            return (
                <g>
                    <line x1={0} y1={-9 * k} x2={len} y2={-9 * k} stroke={STEEL} strokeWidth={2.5 * k} />
                    <line x1={0} y1={9 * k} x2={len} y2={9 * k} stroke={STEEL} strokeWidth={2.5 * k} />
                    {Array.from({ length: ribs }, (_, i) => <line key={i} x1={(i + 0.5) * len / ribs} y1={-9 * k} x2={(i + 0.5) * len / ribs} y2={9 * k} stroke={STEEL} strokeWidth={1.4 * k} />)}
                    {/* a hull on the slip */}
                    <path d={`M ${f1(len * 0.12)} ${f1(-4 * k)} L ${f1(len * 0.82)} 0 L ${f1(len * 0.12)} ${f1(4 * k)} Z`} fill="#64748b" opacity={0.85} />
                    {id === 'capital_spaceyard' && <circle cx={len * 0.5} cy={0} r={1.6 * k} fill="#fbbf24" className="orb-blink" />}
                </g>
            );
        }
        case 'orbital_defense_network':
            return (
                <g>
                    <rect x={0} y={-8 * k} width={18 * k} height={16 * k} fill="#475569" stroke={STEEL} strokeWidth={1.5 * k} />
                    <line x1={18 * k} y1={-4 * k} x2={30 * k} y2={-4 * k} stroke="#f87171" strokeWidth={2.5 * k} />
                    <line x1={18 * k} y1={4 * k} x2={30 * k} y2={4 * k} stroke="#f87171" strokeWidth={2.5 * k} />
                </g>
            );
        case 'shield_projector_array':
            return (
                <g>
                    <line x1={0} y1={0} x2={22 * k} y2={0} stroke={STEEL} strokeWidth={2 * k} />
                    <polygon points={`${f1(22 * k)},${f1(-8 * k)} ${f1(34 * k)},0 ${f1(22 * k)},${f1(8 * k)}`} fill="#a78bfa" />
                    <circle cx={34 * k} cy={0} r={3 * k} fill="#ddd6fe" className="orb-blink" />
                </g>
            );
        case 'deep_sensor_array':
            return (
                <g>
                    <line x1={0} y1={0} x2={30 * k} y2={0} stroke={STEEL} strokeWidth={2 * k} />
                    <path d={`M ${f1(30 * k)} ${f1(-16 * k)} Q ${f1(44 * k)} 0 ${f1(30 * k)} ${f1(16 * k)}`} fill="none" stroke={LIGHT} strokeWidth={3 * k} />
                    <line x1={30 * k} y1={0} x2={44 * k} y2={0} stroke={LIGHT} strokeWidth={1.5 * k} />
                </g>
            );
        case 'orbital_warehouse':
            return (
                <g>
                    <line x1={0} y1={0} x2={10 * k} y2={0} stroke={STEEL} strokeWidth={2 * k} />
                    {[0, 1, 2].map(c => [0, 1].map(rw => (
                        <rect key={`${c}-${rw}`} x={(10 + c * 11) * k} y={(-11 + rw * 11) * k} width={10 * k} height={10 * k}
                            fill={['#b45309', '#0e7490', '#4d7c0f'][(c + rw) % 3]} stroke={DARK} strokeWidth={0.8 * k} />
                    )))}
                </g>
            );
        case 'orbital_logistics_hub':
            return (
                <g>
                    <line x1={0} y1={0} x2={16 * k} y2={0} stroke={STEEL} strokeWidth={2 * k} />
                    <circle cx={30 * k} cy={0} r={14 * k} fill="none" stroke={STEEL} strokeWidth={3.5 * k} />
                    <circle cx={30 * k} cy={0} r={4 * k} fill="#fbbf24" />
                    <path d={`M ${f1(48 * k)} ${f1(-10 * k)} l ${f1(6 * k)} ${f1(2.5 * k)} l ${f1(-6 * k)} ${f1(2.5 * k)} Z`} fill={LIGHT} className="orb-shuttle" />
                </g>
            );
        case 'fleet_drydock': case 'reinforced_drydock': case 'assault_drydock':
            // A U-shaped cradle with a hull held in it, sparks of work.
            // (The upgrades share the drawing for now; see the plan doc.)
            return (
                <g>
                    <line x1={0} y1={0} x2={10 * k} y2={0} stroke={STEEL} strokeWidth={2.5 * k} />
                    <path d={`M ${f1(10 * k)} ${f1(-13 * k)} L ${f1(52 * k)} ${f1(-13 * k)} M ${f1(10 * k)} ${f1(13 * k)} L ${f1(52 * k)} ${f1(13 * k)} M ${f1(10 * k)} ${f1(-13 * k)} L ${f1(10 * k)} ${f1(13 * k)}`}
                        stroke={STEEL} strokeWidth={3 * k} fill="none" />
                    {[22, 36].map(x => <line key={x} x1={x * k} y1={-13 * k} x2={x * k} y2={13 * k} stroke={STEEL} strokeWidth={1 * k} opacity={0.5} />)}
                    <path d={`M ${f1(16 * k)} ${f1(-5 * k)} L ${f1(48 * k)} 0 L ${f1(16 * k)} ${f1(5 * k)} Z`} fill="#94a3b8" />
                    <circle cx={30 * k} cy={-8 * k} r={1.6 * k} fill="#fbbf24" className="orb-blink" />
                </g>
            );
        case 'ship_depot':
            return (
                <g>
                    <line x1={0} y1={0} x2={40 * k} y2={0} stroke={STEEL} strokeWidth={2.5 * k} />
                    {[12, 28].map(x => (
                        <g key={x}>
                            <line x1={x * k} y1={0} x2={x * k} y2={-10 * k} stroke={STEEL} strokeWidth={1.4 * k} />
                            <path d={`M ${f1((x - 6) * k)} ${f1(-12 * k)} L ${f1((x + 7) * k)} ${f1(-15 * k)} L ${f1((x - 6) * k)} ${f1(-18 * k)} Z`} fill="#64748b" />
                        </g>
                    ))}
                </g>
            );
        case 'orbital_research_complex':
            return (
                <g>
                    <line x1={0} y1={0} x2={18 * k} y2={0} stroke={STEEL} strokeWidth={2 * k} />
                    <circle cx={26 * k} cy={0} r={8 * k} fill={GLOW} opacity={0.85} />
                    <rect x={20 * k} y={-26 * k} width={12 * k} height={14 * k} fill="#1e3a8a" stroke={GLOW} strokeWidth={0.8 * k} />
                    <rect x={20 * k} y={12 * k} width={12 * k} height={14 * k} fill="#1e3a8a" stroke={GLOW} strokeWidth={0.8 * k} />
                </g>
            );
        default:
            return <rect x={0} y={-7 * k} width={22 * k} height={14 * k} fill="#475569" stroke={STEEL} strokeWidth={1.5 * k} />;
    }
}

export default function OrbitLayer({ planet, side, fleets, nowSeconds, isOwner, onOpenOrbit }: Props) {
    const slots: Slot[] = planet?.orbital?.slots ?? [];
    const queue: any[] = planet?.orbital?.buildQueue ?? [];
    const built = slots.filter(s => s.structureId && s.state !== 'empty');
    const core = built.find(s => ORBITAL_STRUCTURE_BY_ID[s.structureId!]?.category === 'station');
    const modules = built.filter(s => s !== core && s.state !== 'destroyed');
    const sockets = isOwner ? slots.filter(s => !s.structureId || s.state === 'empty' || s.state === 'destroyed').length : 0;
    const defence = modules.filter(s => s.structureId === 'orbital_defense_network' && s.state === 'active');
    const orbiting = fleets.filter(f => f.orbitingPlanetId === planet?.id
        || (planet?.siege && f.currentSystemId === planet.systemId && !f.destinationSystemId && f.factionId === planet.siege.attackerEmpireId));
    const anything = built.length || orbiting.length || sockets;
    if (!anything) return null;

    const [sx, sy] = pointAt(STATION_AT);
    const k = 1.45 + Math.min(0.35, modules.length * 0.04);
    const progress = (s: Slot) => {
        const order = queue.find(q => q.slotId === s.slotId);
        if (!order) return null;
        const total = Math.max(1, order.completesAtSeconds - order.startedAtSeconds);
        return Math.max(0, Math.min(1, (nowSeconds - order.startedAtSeconds) / total));
    };
    const stateStyle = (s: Slot): { opacity: number; filter?: string } =>
        s.state === 'under_construction' ? { opacity: 0.45 }
        : s.state === 'offline' ? { opacity: 0.35, filter: 'grayscale(1)' }
        : s.state === 'damaged' ? { opacity: 0.8 }
        : { opacity: 1 };

    if (side === 'back') {
        return (
            <g pointerEvents="none">
                <path d={arc(Math.PI, Math.PI * 2)} fill="none" stroke={GLOW} strokeWidth={1.4} strokeDasharray="6 10" opacity={0.25} />
                {/* Defence platforms on the far side, behind the globe */}
                {defence.flatMap((s, i) => [2.2 + i * 0.9, 4.1 + i * 0.7].filter(t => !near(t)).map((t, j) => {
                    const [x, y] = pointAt(t);
                    return <g key={`bp-${s.slotId}-${j}`} transform={`translate(${f1(x)} ${f1(y)}) scale(1.5)`} opacity={0.6}><Platform /></g>;
                }))}
            </g>
        );
    }

    // Modules (and the owner's empty sockets) fan evenly around the core.
    const all = [...modules.map(s => ({ kind: 'module' as const, s })), ...Array.from({ length: sockets }, (_, i) => ({ kind: 'socket' as const, i }))];
    const angles = all.map((_, i) => (i / all.length) * Math.PI * 2 - Math.PI / 2);
    const shield = modules.some(s => s.structureId === 'shield_projector_array' && s.state === 'active');
    const reach = (core?.structureId === 'fortress_station' ? 54 : 40) * k;

    return (
        <g>
            <path d={arc(0, Math.PI)} fill="none" stroke={GLOW} strokeWidth={1.6} strokeDasharray="6 10" opacity={0.4} className="orb-ring" />

            {/* Defence platforms riding the near side */}
            {defence.flatMap((s, i) => [0.9 + i * 0.6, 2.2 + i * 0.9, 4.1 + i * 0.7].filter(near).map((t, j) => {
                const [x, y] = pointAt(t);
                return <g key={`fp-${s.slotId}-${j}`} transform={`translate(${f1(x)} ${f1(y)}) scale(1.5)`} pointerEvents="none"><Platform /></g>;
            }))}

            {/* Fleets holding orbit, off the far left */}
            {orbiting.slice(0, 6).map((f, i) => {
                const [x, y] = pointAt(FLEETS_AT + (i - (Math.min(6, orbiting.length) - 1) / 2) * 0.13);
                const color = factionColor(f.factionId);
                const ships = Math.max(1, Math.min(4, Math.round(Object.values(f.composition ?? {}).reduce((a: number, n: any) => a + (Number(n) || 0), 0) / 2)));
                return (
                    <g key={`fl-${f.id}`} transform={`translate(${f1(x)} ${f1(y)}) scale(1.7)`} pointerEvents="none">
                        <title>{`${f.name ?? 'Fleet'} in orbit`}</title>
                        {Array.from({ length: ships }, (_, j) => (
                            <path key={j} d={`M ${f1(-10 + j * 9)} ${f1(-6 + (j % 2) * 9)} l 14 4 l -14 4 Z`} fill={color} stroke="#020617" strokeWidth={0.8} />
                        ))}
                    </g>
                );
            })}

            {/* The station */}
            <g transform={`translate(${f1(sx)} ${f1(sy)})`} className="orb-bob"
                style={{ cursor: onOpenOrbit ? 'pointer' : undefined }}
                onClick={onOpenOrbit} pointerEvents={onOpenOrbit ? 'auto' : 'none'}>
                <title>{core ? `${ORBITAL_STRUCTURE_BY_ID[core.structureId!]?.name ?? 'Station'} — ${modules.length} module${modules.length === 1 ? '' : 's'}${isOwner ? ' (click to build in orbit)' : ''}` : 'Orbital works'}</title>
                {/* hit area */}
                <circle r={reach + 60 * k} fill="transparent" />
                {shield && <ellipse rx={reach + 58 * k} ry={reach + 40 * k} fill="#a78bfa" fillOpacity={0.035} stroke="#a78bfa" strokeOpacity={0.45} strokeWidth={1.5} className="orb-shield" />}
                {all.map((m, i) => {
                    const a = angles[i];
                    const deg = (a * 180) / Math.PI;
                    const ox = Math.cos(a) * reach, oy = Math.sin(a) * reach;
                    if (m.kind === 'socket') {
                        return (
                            <g key={`sock-${m.i}`} transform={`translate(${f1(ox)} ${f1(oy)}) rotate(${f1(deg)})`}>
                                <line x1={-reach * 0.4} y1={0} x2={0} y2={0} stroke={STEEL} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
                                <rect x={0} y={-8} width={16} height={16} fill="none" stroke={GLOW} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.55} />
                            </g>
                        );
                    }
                    const s = m.s;
                    const p = progress(s);
                    const st = stateStyle(s);
                    return (
                        <g key={`mod-${s.slotId}`} transform={`translate(${f1(ox)} ${f1(oy)}) rotate(${f1(deg)})`}>
                            <title>{`${ORBITAL_STRUCTURE_BY_ID[s.structureId!]?.name ?? s.structureId}${s.state !== 'active' ? ` (${s.state.replace('_', ' ')})` : ''}`}</title>
                            <line x1={-reach * 0.45} y1={0} x2={0} y2={0} stroke={STEEL} strokeWidth={3} />
                            <g opacity={st.opacity} style={st.filter ? { filter: st.filter } : undefined}><Module id={s.structureId!} k={k} /></g>
                            {s.state === 'under_construction' && (
                                <g>
                                    <rect x={-2} y={-14 * k} width={64 * k} height={28 * k} fill="none" stroke="#fbbf24" strokeWidth={1.2} strokeDasharray="4 3" />
                                    {p !== null && <rect x={-2} y={16 * k} width={64 * k * p} height={3} fill="#fbbf24" />}
                                </g>
                            )}
                            {s.state === 'damaged' && <circle cx={14 * k} cy={-6 * k} r={3} fill="#fb923c" className="orb-blink" />}
                        </g>
                    );
                })}
                {core ? (
                    <g opacity={stateStyle(core).opacity}>
                        <Core id={core.structureId!} k={k} />
                        {core.state === 'under_construction' && <circle r={44 * k} fill="none" stroke="#fbbf24" strokeWidth={1.4} strokeDasharray="5 4" />}
                    </g>
                ) : (
                    // No station yet: the sockets wait around an empty berth.
                    <circle r={18 * k} fill="none" stroke={GLOW} strokeWidth={1.4} strokeDasharray="4 4" opacity={0.6} />
                )}
            </g>

            <style>{`
                .orb-blink { animation: orb-blink 2.2s ease-in-out infinite; }
                @keyframes orb-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
                .orb-bob { animation: orb-bob 9s ease-in-out infinite; }
                @keyframes orb-bob { 0%,100% { transform: translate(${f1(sx)}px, ${f1(sy)}px); } 50% { transform: translate(${f1(sx)}px, ${f1(sy - 5)}px); } }
                .orb-ring { animation: orb-ring 30s linear infinite; }
                @keyframes orb-ring { to { stroke-dashoffset: -160; } }
                .orb-shield { animation: orb-shield 4s ease-in-out infinite; }
                @keyframes orb-shield { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
                .orb-shuttle { animation: orb-blink 3s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) { .orb-blink, .orb-bob, .orb-ring, .orb-shield, .orb-shuttle { animation: none; } }
            `}</style>
        </g>
    );
}

/** A defence platform: a small armoured disc with twin guns. */
function Platform() {
    return (
        <g>
            <circle r={7} fill="#475569" stroke={STEEL} strokeWidth={1.4} />
            <line x1={4} y1={-2.5} x2={13} y2={-2.5} stroke="#f87171" strokeWidth={1.8} />
            <line x1={4} y1={2.5} x2={13} y2={2.5} stroke="#f87171" strokeWidth={1.8} />
            <circle r={2.2} fill={GLOW} className="orb-blink" />
        </g>
    );
}
