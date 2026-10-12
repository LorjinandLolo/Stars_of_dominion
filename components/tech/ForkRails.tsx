"use client";

// components/tech/ForkRails.tsx
// Draws each fork of no return on the canvas: a rail above the options' row
// with a drop to every option and a label at its start. Options of one fork
// sit on one row but far apart, with ordinary cards between them, so a box
// around them would swallow unrelated cards; a rail only touches the options.

import React from 'react';
import type { Tech } from '@/lib/tech/types';
import { forkLabel, type Fork } from '@/lib/tech/forks';
import { NODE_W, nodeRect, type GridOffset } from './layout';

interface ForkRailsProps {
    forks: Fork[];
    offset: GridOffset;
    /** The option an empire committed to, per fork group. */
    choices: ReadonlyMap<string, Tech>;
    width: number;
    height: number;
}

const RAIL_ABOVE = 18;

export default function ForkRails({ forks, offset, choices, width, height }: ForkRailsProps) {
    return (
        <>
            <svg className="absolute inset-0 pointer-events-none" width={width} height={height} aria-hidden="true">
                {forks.map(fork => {
                    const chosen = choices.get(fork.group);
                    const rects = fork.options.map(o => ({ option: o, rect: nodeRect(o, offset) }));
                    const top = Math.min(...rects.map(r => r.rect.y));
                    const railY = top - RAIL_ABOVE;
                    const xs = rects.map(r => r.rect.x + NODE_W / 2);
                    const stroke = chosen ? 'rgba(148,163,184,0.45)' : 'rgba(251,191,36,0.85)';
                    return (
                        <g key={fork.group}>
                            <line
                                x1={Math.min(...xs)} x2={Math.max(...xs)} y1={railY} y2={railY}
                                stroke={stroke} strokeWidth={2} strokeDasharray={chosen ? undefined : '8 6'}
                            />
                            {rects.map(({ option, rect }) => {
                                const taken = chosen?.id === option.id;
                                const lost = !!chosen && !taken;
                                return (
                                    <line
                                        key={option.id}
                                        x1={rect.x + NODE_W / 2} x2={rect.x + NODE_W / 2} y1={railY} y2={rect.y}
                                        stroke={lost ? 'rgba(127,29,29,0.6)' : taken ? 'rgba(129,140,248,0.9)' : stroke}
                                        strokeWidth={taken ? 3 : 2}
                                        strokeDasharray={lost ? '3 5' : undefined}
                                    />
                                );
                            })}
                        </g>
                    );
                })}
            </svg>
            {forks.map(fork => {
                const chosen = choices.get(fork.group);
                const rects = fork.options.map(o => nodeRect(o, offset));
                const top = Math.min(...rects.map(r => r.y));
                const left = Math.min(...rects.map(r => r.x));
                return (
                    <div
                        key={fork.group}
                        className={`absolute z-[5] pointer-events-none whitespace-nowrap px-2 py-0.5 rounded-full border text-[9px] font-display uppercase tracking-[0.18em] ${
                            chosen
                                ? 'bg-slate-950/90 border-white/10 text-slate-400'
                                : 'bg-amber-950/90 border-amber-400/60 text-amber-200'
                        }`}
                        style={{ left, top: top - RAIL_ABOVE - 22 }}
                    >
                        {chosen
                            ? `${forkLabel(fork)} · chose ${chosen.name}`
                            : `${forkLabel(fork)} · choose one of ${fork.options.length} · permanent`}
                    </div>
                );
            })}
        </>
    );
}
