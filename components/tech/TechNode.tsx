"use client";

import React from 'react';
import { Lock, CheckCircle2, FlaskConical, Circle, CircleDashed, Loader2 } from 'lucide-react';
import type { Tech } from '@/lib/tech/types';
import type { Rect } from './layout';

/**
 * 'pending' is client-only: the research order was accepted by the server but
 * the worker has not yet reported a slot for it through the sync poll. It
 * exists so the node does not snap back to Available for the seconds in between.
 */
export type TechNodeStatus = 'unlocked' | 'researching' | 'pending' | 'available' | 'locked' | 'unavailable';
export type TechNodeEmphasis = 'normal' | 'highlight' | 'dim';

interface StatusMeta {
    label: string;
    /** Small square used by the legend and the inspector pill. */
    swatch: string;
    card: string;
    title: string;
    /** Resting opacity; locked/unavailable sit back even when nothing is selected. */
    opacity: number;
}

export const STATUS_META: Record<TechNodeStatus, StatusMeta> = {
    unlocked: {
        label: 'Researched',
        swatch: 'bg-indigo-500 border-indigo-300',
        card: 'bg-indigo-950/70 border-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.3)]',
        title: 'text-indigo-100',
        opacity: 1,
    },
    researching: {
        label: 'Researching',
        swatch: 'bg-amber-500 border-amber-300',
        card: 'bg-amber-950/40 border-amber-500/80 animate-tech-researching',
        title: 'text-amber-100',
        opacity: 1,
    },
    pending: {
        label: 'Authorizing',
        swatch: 'bg-amber-900 border-amber-400 border-dashed',
        // Dashed and glow-less on purpose: it must read as "not yet" next to a
        // researching card, not as a second one.
        card: 'bg-amber-950/30 border-dashed border-amber-400/70 animate-tech-pending',
        title: 'text-amber-100/90',
        opacity: 1,
    },
    available: {
        label: 'Available',
        swatch: 'bg-slate-900 border-slate-200',
        card: 'bg-slate-900 border-slate-300/80 hover:border-indigo-300 hover:bg-slate-800 cursor-pointer shadow-[0_0_10px_rgba(203,213,225,0.15)]',
        title: 'text-slate-100',
        opacity: 1,
    },
    locked: {
        label: 'Locked out',
        swatch: 'bg-red-950 border-red-800',
        card: 'bg-red-950/30 border-red-900/50',
        title: 'text-red-200/70',
        opacity: 0.65,
    },
    unavailable: {
        label: 'Prerequisites missing',
        swatch: 'bg-slate-950 border-slate-700',
        card: 'bg-slate-950/80 border-slate-800',
        title: 'text-slate-400',
        opacity: 0.7,
    },
};

/** Legend order. 'pending' is deliberately absent: it lasts a few seconds and the inspector names it. */
export const STATUS_ORDER: TechNodeStatus[] = ['available', 'researching', 'unlocked', 'unavailable', 'locked'];

const DIM_OPACITY = 0.35;

function StatusIcon({ status }: { status: TechNodeStatus }) {
    switch (status) {
        case 'unlocked': return <CheckCircle2 size={13} className="text-indigo-300 shrink-0" />;
        case 'researching': return <FlaskConical size={13} className="text-amber-300 shrink-0" />;
        case 'pending': return <Loader2 size={13} className="text-amber-300 shrink-0 animate-spin motion-reduce:animate-none" />;
        case 'available': return <Circle size={13} className="text-slate-200 shrink-0" />;
        case 'locked': return <Lock size={13} className="text-red-400 shrink-0" />;
        default: return <CircleDashed size={13} className="text-slate-600 shrink-0" />;
    }
}

interface TechNodeProps {
    tech: Tech;
    rect: Rect;
    status: TechNodeStatus;
    progress?: number;
    selected: boolean;
    emphasis: TechNodeEmphasis;
    onSelect: (techId: string) => void;
}

export default function TechNode({
    tech,
    rect,
    status,
    progress = 0,
    selected,
    emphasis,
    onSelect,
}: TechNodeProps) {
    const meta = STATUS_META[status];
    const opacity = emphasis === 'dim' ? DIM_OPACITY : meta.opacity;

    // Selected sits above its highlighted chain, which sits above the rest, so
    // the ring and glow are never clipped by a neighbouring card.
    const layer = selected ? 'z-30' : emphasis === 'highlight' ? 'z-20' : 'z-10';

    return (
        <button
            type="button"
            data-tech-id={tech.id}
            aria-pressed={selected}
            aria-label={`${tech.name}, tier ${tech.tier}, ${meta.label}`}
            onClick={() => onSelect(tech.id)}
            className={`
                absolute text-left rounded-lg border-2 overflow-hidden select-none cursor-pointer
                transition-[opacity,box-shadow,border-color,background-color] duration-300
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
                ${meta.card} ${layer}
                ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''}
            `}
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                opacity,
                outline: !selected && emphasis === 'highlight' ? '1px solid rgba(165,180,252,0.6)' : undefined,
                outlineOffset: 2,
            }}
        >
            <div className="flex h-full flex-col justify-between p-2.5">
                <div className="flex items-start gap-2">
                    <h3 className={`flex-1 text-[10px] font-display uppercase tracking-wider leading-tight line-clamp-2 ${meta.title}`}>
                        {tech.name}
                    </h3>
                    <StatusIcon status={status} />
                </div>

                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 text-[8px] font-mono px-1 rounded border border-white/10 bg-black/30 text-slate-300">
                        T{tech.tier}
                    </span>
                    {tech.branch && (
                        <span className="truncate text-[8px] font-mono lowercase px-1 rounded bg-white/5 text-slate-400">
                            {tech.branch.replace(/_/g, ' ')}
                        </span>
                    )}
                </div>
            </div>

            {status === 'researching' && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                    <div
                        className="h-full bg-amber-400 transition-[width] duration-1000"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                </div>
            )}
        </button>
    );
}
