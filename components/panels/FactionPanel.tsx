'use client';

// components/panels/FactionPanel.tsx
//
// The faction saga: who you are, what your mechanics are doing right now, and
// what your empire has done with them.
//
// Deliberately a DUMB renderer. Every number and every open/closed window comes
// from lib/factions/saga.ts, which derives them through the same readers the
// engine uses — this component contains no game arithmetic at all, so it cannot
// disagree with the worker about anything.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Flame, ScrollText, ShieldAlert, CircleDot } from 'lucide-react';
import type { SagaStatus } from '@/lib/factions/saga';

const TONE_STYLES: Record<SagaStatus['tone'], { dot: string; border: string; text: string }> = {
    active: { dot: 'bg-emerald-400', border: 'border-emerald-500/25', text: 'text-emerald-300' },
    warning: { dot: 'bg-amber-400 animate-pulse', border: 'border-amber-500/30', text: 'text-amber-300' },
    dormant: { dot: 'bg-slate-600', border: 'border-slate-700/40', text: 'text-slate-400' },
};

export default function FactionPanel() {
    const saga = useUIStore(s => s.factionSaga);
    const factions = useUIStore(s => s.factions);

    if (!saga) {
        return (
            <div className="p-6 text-xs font-mono text-slate-500 animate-pulse">
                READING THE LEDGERS…
            </div>
        );
    }

    const faction: any = (factions as any)?.[saga.factionId];
    const name = faction?.name ?? saga.factionId;

    return (
        <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto bg-slate-950/95 text-slate-200">
            {/* Identity */}
            <div className="flex items-baseline justify-between border-b border-slate-800 pb-2">
                <div>
                    <div className="text-sm font-display tracking-widest uppercase text-slate-100">{name}</div>
                    <div className="text-[10px] font-mono text-slate-500">{saga.civilizationId ?? 'unaligned'}</div>
                </div>
                <Flame size={16} className="text-slate-600" />
            </div>

            {!saga.hasBespokeMechanics && (
                <div className="text-[11px] text-slate-500 leading-relaxed border border-slate-800 rounded p-3">
                    This civilization runs on the common rules of the galaxy — no bespoke
                    mechanics are attached to it. The ten player-authored powers each carry
                    their own; claim one to see its saga here.
                </div>
            )}

            {/* Live state */}
            {saga.statuses.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                        <ShieldAlert size={11} /> Current state
                    </div>
                    {saga.statuses.map(status => {
                        const tone = TONE_STYLES[status.tone];
                        return (
                            <div key={status.id} className={`rounded border ${tone.border} bg-slate-900/50 px-3 py-2`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                                        <span className="text-[11px] font-semibold uppercase tracking-wide truncate">{status.label}</span>
                                    </div>
                                    <span className={`text-[11px] font-mono text-right ${tone.text}`}>{status.value}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{status.detail}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* The saga — lifetime ledger */}
            {saga.records.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-1">
                        <ScrollText size={11} /> The saga so far
                    </div>
                    {saga.records.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-3 py-1.5 rounded bg-slate-900/30 border border-slate-800/60">
                            <span className="text-[11px] text-slate-300 flex items-center gap-2">
                                <CircleDot size={9} className="text-slate-600" /> {r.label}
                            </span>
                            <span className="text-[11px] font-mono text-slate-100">{r.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            )}

            {saga.hasBespokeMechanics && saga.records.length === 0 && (
                <div className="text-[10px] text-slate-600 italic px-1">
                    The ledger is blank. Nothing has been done yet worth recording — that
                    changes the moment you use what makes your people who they are.
                </div>
            )}
        </div>
    );
}
