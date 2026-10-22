"use client";

// components/planet/BattlePlayback.tsx
// The last cycle's fighting, replayed on the board: shells falling, assaults
// crossing from the district they came from, tracer, routs, white flags, the
// dead counted off in floating numbers — each beat at its moment in the
// replay (playbackClock.ts). Also the standing markers between cycles:
// incoming call-ins and the districts where a decision waits.
// Everything drawn here happened (lib/combat/siege/battle-beats.ts).

import React from 'react';
import type { DistrictWarState } from '@/lib/combat/siege/siege-types';
import type { BattleBeat } from '@/lib/combat/siege/battle-beats';
import { controllerOf } from '@/lib/combat/siege/district-front';
import type { SurfaceGeometry, Pt } from './surfaceGeometry';
import { reportKey, usePlayback } from './playbackClock';

interface Props {
    geo: SurfaceGeometry;
    war: DistrictWarState;
    attackerColor: string;
    defenderColor: string;
    /** The viewer's side, for the moment markers. */
    playerSide: 'attacker' | 'defender' | null;
}

/** How long one beat's effect stays on screen, as a share of the replay. */
const BEAT_SPAN = 0.07;

/** Deterministic jitter so a district's shells land in the same places on replay. */
const jitter = (seed: number, i: number): Pt => {
    const a = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const b = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345;
    return [((a - Math.floor(a)) - 0.5) * 2, ((b - Math.floor(b)) - 0.5) * 2];
};

export default function BattlePlayback({ geo, war, attackerColor, defenderColor, playerSide }: Props) {
    const report = war.lastReport;
    const key = reportKey(report);
    const p = usePlayback(key);
    const color = (side: 'attacker' | 'defender') => side === 'attacker' ? attackerColor : defenderColor;

    // Where an assault came from: a neighbour the acting side held, else just off-centre.
    const origin = (b: BattleBeat): Pt => {
        const [x, y] = geo.centroids[b.sector];
        const from = geo.cellNeighbors[b.sector].find(n => controllerOf(war, n) === b.side && n !== b.sector);
        if (from != null) {
            const [fx, fy] = geo.centroids[from];
            return [x + (fx - x) * 0.6, y + (fy - y) * 0.6];
        }
        return [x - 22, y + 14];
    };

    const live = p == null || !report ? [] : report.districts.flatMap(d => d.beats
        .map((b, i) => ({ b, i, age: (p - Math.min(0.97, b.t + (d.sector % 5) * 0.012)) / BEAT_SPAN }))
        .filter(x => x.age >= 0 && x.age <= 1));

    return (
        <g pointerEvents="none">
            {/* Incoming call-ins: a reticle over the target until the next cycle lands it */}
            {(war.callIns ?? []).filter(c => c.sector >= 0).map(c => {
                const [x, y] = geo.centroids[c.sector];
                const mine = c.side === playerSide;
                const stroke = c.kind === 'smoke' ? '#cbd5e1' : mine ? '#fbbf24' : '#f87171';
                return (
                    <g key={`ci-${c.kind}-${c.side}-${c.sector}`} className="bp-reticle" style={{ transformOrigin: `${x}px ${y}px` }}>
                        <circle cx={x} cy={y} r={18} fill="none" stroke={stroke} strokeWidth={1.6} strokeDasharray="4 3" />
                        <path d={`M ${x - 24} ${y} h 9 M ${x + 15} ${y} h 9 M ${x} ${y - 24} v 9 M ${x} ${y + 15} v 9`} stroke={stroke} strokeWidth={1.6} />
                    </g>
                );
            })}

            {/* Roads blown and not yet repaired */}
            {Object.keys(war.roadsCut ?? {}).map(k => {
                const [a, b] = k.split('-').map(Number);
                const p = geo.centroids[a], q = geo.centroids[b];
                if (!p || !q) return null;
                const x = (p[0] + q[0]) / 2, y = (p[1] + q[1]) / 2;
                return (
                    <g key={`cut-${k}`} opacity={0.9}>
                        <title>Road demolished</title>
                        <path d={`M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`}
                            stroke="#020617" strokeWidth={4} strokeLinecap="round" />
                        <path d={`M ${x - 5} ${y - 5} L ${x + 5} ${y + 5} M ${x + 5} ${y - 5} L ${x - 5} ${y + 5}`}
                            stroke="#f97316" strokeWidth={2} strokeLinecap="round" />
                    </g>
                );
            })}

            {/* Decisions waiting on the viewer */}
            {(war.moments ?? []).filter(m => !m.resolved && m.side === playerSide).map(m => {
                const [x, y] = geo.centroids[m.sector];
                return (
                    <g key={`mo-${m.id}`} transform={`translate(${x + 14}, ${y - 18})`} className="bp-moment">
                        <circle r={8} fill="#f59e0b" stroke="#020617" strokeWidth={1} />
                        <text y={3.5} textAnchor="middle" fontSize={11} fontWeight={800} fill="#020617">!</text>
                    </g>
                );
            })}

            {live.map(({ b, i, age }) => {
                const [x, y] = geo.centroids[b.sector];
                const k = `bp-${b.sector}-${i}`;
                const fade = 1 - age;
                const c = color(b.side);
                const seed = b.sector * 31 + i;
                let fx: React.ReactNode = null;
                switch (b.kind) {
                    case 'barrage':
                    case 'titan':
                    case 'detonation':
                        fx = [0, 1, 2, 3].map(n => {
                            const [jx, jy] = jitter(seed, n);
                            const local = Math.max(0, Math.min(1, age * 1.6 - n * 0.15));
                            if (local <= 0) return null;
                            return <circle key={n} cx={x + jx * 16} cy={y + jy * 12} r={3 + local * 10}
                                fill={b.kind === 'detonation' ? '#fb923c' : '#fde68a'} fillOpacity={0.55 * (1 - local)}
                                stroke="#f97316" strokeOpacity={1 - local} strokeWidth={1.2} />;
                        });
                        break;
                    case 'charge':
                    case 'armor':
                    case 'breakthrough':
                    case 'river':
                    case 'drop': {
                        const [ox, oy] = origin(b);
                        const reach = Math.min(1, age * 1.8);
                        const tx = ox + (x - ox) * reach, ty = oy + (y - oy) * reach;
                        fx = (
                            <g opacity={fade}>
                                <line x1={ox} y1={oy} x2={tx} y2={ty} stroke={c} strokeWidth={b.kind === 'armor' || b.kind === 'breakthrough' ? 4 : 2.5} strokeLinecap="round" />
                                <circle cx={tx} cy={ty} r={4} fill={c} stroke="#020617" strokeWidth={0.8} />
                            </g>
                        );
                        break;
                    }
                    case 'firefight':
                    case 'ambush':
                    case 'dug_in':
                    case 'pocket':
                    case 'last_stand':
                    case 'line_holds':
                        fx = [0, 1, 2].map(n => {
                            const [ax, ay] = jitter(seed, n);
                            const [bx, by] = jitter(seed, n + 7);
                            const blink = Math.sin((age * 6 + n) * Math.PI) > 0;
                            return blink ? <line key={n} x1={x + ax * 14} y1={y + ay * 10} x2={x + bx * 14} y2={y + by * 10}
                                stroke={c} strokeOpacity={0.9 * fade} strokeWidth={1.4} strokeLinecap="round" /> : null;
                        });
                        break;
                    case 'rout': {
                        const [ox, oy] = origin(b);
                        fx = <line x1={x} y1={y} x2={x + (x - ox) * age * 0.5} y2={y + (y - oy) * age * 0.5}
                            stroke={c} strokeOpacity={fade} strokeWidth={2} strokeDasharray="3 3" />;
                        break;
                    }
                    case 'surrender':
                        fx = (
                            <g transform={`translate(${x}, ${y - 10 - age * 8})`} opacity={fade}>
                                <line x1={0} y1={0} x2={0} y2={14} stroke="#e2e8f0" strokeWidth={1.4} />
                                <path d="M 0 0 h 9 v 6 h -9 Z" fill="#f8fafc" />
                            </g>
                        );
                        break;
                }
                return (
                    <g key={k}>
                        {fx}
                        {b.killed > 0 && (
                            <text x={x + 10} y={y - 6 - age * 14} fontSize={9} fontFamily="monospace" fontWeight={700}
                                fill={color(b.side === 'attacker' ? 'defender' : 'attacker')} opacity={fade}
                                stroke="#020617" strokeWidth={2.4} paintOrder="stroke">
                                −{b.killed}
                            </text>
                        )}
                    </g>
                );
            })}

            <style>{`
                .bp-reticle { animation: bp-reticle 1.4s ease-in-out infinite; }
                @keyframes bp-reticle { 0%,100% { transform: scale(0.9) rotate(0deg); } 50% { transform: scale(1.08) rotate(45deg); } }
                .bp-moment { animation: bp-moment 0.9s ease-in-out infinite; }
                @keyframes bp-moment { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
                @media (prefers-reduced-motion: reduce) { .bp-reticle, .bp-moment { animation: none; } }
            `}</style>
        </g>
    );
}
