"use client";

// components/tech/PathSheet.tsx
// Stars of Dominion — Pick a path.
//
// A fork of no return used to be decided from the inspector, one option at a
// time: the player saw what THIS choice closed, never the others beside it.
// The sheet lays every option of one fork side by side — what it does, what
// it leads to, what it closes, how long it takes, whether it is open yet —
// and commits only after a second, explicit click. Opened from the Forks bar
// and from a fork card's button. Pure view over what the Research panel
// already knows; the order is the panel's own handleResearch.

import React, { useEffect, useMemo, useState } from 'react';
import { X, Signpost, Hourglass, Check, Ban, ArrowRight, Clock, AlertTriangle } from 'lucide-react';
import type { Tech } from '@/lib/tech/types';
import { closedTechIds, descendantsOf, forkCost, forkLabel, forkReadiness, type Fork } from '@/lib/tech/forks';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';
import type { TechNodeStatus } from './TechNode';

interface PathSheetProps {
    fork: Fork;
    allTechs: readonly Tech[];
    unlockedIds: ReadonlySet<string>;
    lockedIds: ReadonlySet<string>;
    /** The option already committed to, if the fork is decided. */
    chosen: Tech | null;
    statusOf: (techId: string) => TechNodeStatus | undefined;
    slotsFull: boolean;
    busy: boolean;
    error: string | null;
    onCommit: (techId: string) => void;
    onShow: (techId: string) => void;
    onClose: () => void;
}

/** Real hours a project takes with nothing speeding it up, rounded for people. */
function realHours(simHours: number): string {
    const h = simHours / SIM_SECONDS_PER_REAL_SECOND;
    if (h < 1) return 'under an hour';
    return `about ${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
}

/** How many payoff techs to name per option. */
const LEADS_NAMED = 3;

export default function PathSheet({
    fork, allTechs, unlockedIds, lockedIds, chosen, statusOf, slotsFull, busy, error, onCommit, onShow, onClose,
}: PathSheetProps) {
    const [confirming, setConfirming] = useState<string | null>(null);

    // Esc closes the sheet first; the panel's selection handler must not also fire.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.preventDefault();
            e.stopPropagation();
            if (confirming) setConfirming(null);
            else onClose();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [confirming, onClose]);

    const options = useMemo(() => fork.options.map(o => {
        // Prerequisites are all-of: a tech that also needs a rival option is
        // closed by this choice, so it is not somewhere this path leads.
        const closedIfChosen = closedTechIds(allTechs, [...lockedIds, ...fork.options.filter(r => r.id !== o.id).map(r => r.id)]);
        const leads = descendantsOf(allTechs, o.id).filter(t => !closedIfChosen.has(t.id));
        // The payoff is at the far end of the road: name the highest tiers.
        const payoff = [...leads].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)).slice(0, LEADS_NAMED);
        const cost = chosen ? null : forkCost(allTechs, o.id, lockedIds);
        const ready = forkReadiness(allTechs, unlockedIds, o);
        const missingPrereqs = (o.prerequisites ?? []).filter(p => !unlockedIds.has(p))
            .map(p => allTechs.find(t => t.id === p)).filter((t): t is Tech => !!t);
        return { tech: o, leads, payoff, cost, ready, missingPrereqs, status: statusOf(o.id) };
    }), [fork, allTechs, lockedIds, unlockedIds, chosen, statusOf]);

    const confirmingOpt = confirming ? options.find(o => o.tech.id === confirming) ?? null : null;
    const held = options[0]?.ready.missing ?? [];

    return (
        <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="path-sheet-title"
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-5xl max-h-full overflow-y-auto custom-scrollbar rounded-2xl border border-amber-400/30 bg-slate-950/95 shadow-2xl">
                <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-white/5">
                    <div>
                        <p className="flex items-center gap-1.5 text-[9px] font-display uppercase tracking-[0.25em] text-amber-300">
                            <Signpost size={12} /> {forkLabel(fork)} · {fork.tree}
                        </p>
                        <h2 id="path-sheet-title" className="text-lg font-display uppercase tracking-wider text-white mt-1">
                            {chosen ? `You chose ${chosen.name}` : 'Pick a path'}
                        </h2>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
                            {chosen
                                ? 'This fork is decided for the season. The paths you did not take, and everything that needs them, stay closed.'
                                : 'You can only ever hold one of these. Starting one closes the others for the season, and every technology that needs them. Read them side by side, then choose.'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5">
                        <X size={16} />
                    </button>
                </header>

                {!chosen && held.length > 0 && (
                    <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2">
                        <Hourglass size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-amber-100/90 leading-relaxed">
                            This fork opens when the {fork.tree} tree&apos;s tier I is finished: {held.length} left.{' '}
                            {held.slice(0, 4).map((t, i) => (
                                <React.Fragment key={t.id}>
                                    {i > 0 && ', '}
                                    <button type="button" onClick={() => onShow(t.id)} className="underline decoration-dotted hover:text-white">{t.name}</button>
                                </React.Fragment>
                            ))}
                            {held.length > 4 && ` and ${held.length - 4} more`}. Read the paths now; choose when it opens.
                        </div>
                    </div>
                )}

                <div className={`grid gap-3 p-5 ${options.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                    {options.map(o => {
                        const isChosen = chosen?.id === o.tech.id;
                        const isClosed = !!chosen && !isChosen;
                        const canChoose = !chosen && o.status === 'available' && !slotsFull && !busy;
                        const why = chosen ? null
                            : !o.ready.open ? 'Opens after tier I'
                            : o.missingPrereqs.length ? `Needs ${o.missingPrereqs.map(t => t.name).join(' and ')} first`
                            : o.status === 'researching' || o.status === 'pending' ? 'Starting…'
                            : slotsFull ? 'All research slots busy'
                            : null;
                        return (
                            <section
                                key={o.tech.id}
                                className={`flex flex-col rounded-xl border p-4 ${
                                    isChosen ? 'border-indigo-400/60 bg-indigo-950/30'
                                    : isClosed ? 'border-red-900/40 bg-red-950/10 opacity-70'
                                    : 'border-amber-500/30 bg-amber-950/10'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className={`text-sm font-display uppercase tracking-wide leading-snug ${isClosed ? 'text-slate-400 line-through decoration-red-700/60' : 'text-white'}`}>
                                        {o.tech.name}
                                    </h3>
                                    {isChosen && <span className="shrink-0 flex items-center gap-1 text-[9px] uppercase tracking-widest text-indigo-300"><Check size={11} /> Chosen</span>}
                                    {isClosed && <span className="shrink-0 flex items-center gap-1 text-[9px] uppercase tracking-widest text-red-400"><Ban size={11} /> Closed</span>}
                                </div>
                                <p className="mt-2 text-[11px] text-slate-300 leading-relaxed">{o.tech.mechanicalEffect ?? o.tech.description}</p>

                                <div className="mt-3">
                                    <p className="text-[8px] font-display uppercase tracking-[0.25em] text-slate-500 mb-1">Leads to · {o.leads.length} technolog{o.leads.length === 1 ? 'y' : 'ies'}</p>
                                    <ul className="space-y-0.5">
                                        {o.payoff.map(t => (
                                            <li key={t.id}>
                                                <button type="button" onClick={() => onShow(t.id)} className="flex items-center gap-1.5 text-[10px] text-slate-200 hover:text-white text-left">
                                                    <ArrowRight size={10} className="text-slate-500 shrink-0" />
                                                    <span className="truncate">{t.name}</span>
                                                    <span className="text-[8px] font-mono text-slate-500">T{t.tier}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {o.cost && (
                                    <div className="mt-3">
                                        <p className="text-[8px] font-display uppercase tracking-[0.25em] text-slate-500 mb-1">Closes for the season</p>
                                        <p className="text-[10px] text-amber-100/80 leading-relaxed">
                                            {o.cost.rivals.map(r => r.name).join(' and ')}
                                            {o.cost.downstream.length > 0 && `, and ${o.cost.downstream.length} technolog${o.cost.downstream.length === 1 ? 'y' : 'ies'} that need ${o.cost.rivals.length === 1 ? 'it' : 'them'}`}.
                                        </p>
                                    </div>
                                )}

                                <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <Clock size={11} className="text-slate-500" /> {realHours(o.tech.researchCost)}
                                </p>

                                <div className="mt-auto pt-4 flex flex-col gap-1.5">
                                    {!chosen && (
                                        <button
                                            type="button"
                                            disabled={!canChoose}
                                            onClick={() => setConfirming(o.tech.id)}
                                            className={`w-full py-2 rounded-lg text-[10px] font-display uppercase tracking-[0.2em] border transition-colors ${
                                                canChoose
                                                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25'
                                                    : 'border-white/10 text-slate-500 cursor-not-allowed'
                                            }`}
                                        >
                                            {canChoose ? 'Choose this path' : why ?? 'Not available'}
                                        </button>
                                    )}
                                    <button type="button" onClick={() => onShow(o.tech.id)} className="text-[10px] text-slate-400 hover:text-slate-200">
                                        Show it on the tree
                                    </button>
                                </div>
                            </section>
                        );
                    })}
                </div>

                {confirmingOpt && (
                    <div className="mx-5 mb-5 rounded-xl border border-amber-400/50 bg-amber-950/30 p-4">
                        <p className="flex items-start gap-2 text-[12px] text-amber-50 leading-relaxed">
                            <AlertTriangle size={14} className="text-amber-300 shrink-0 mt-0.5" />
                            <span>
                                Commit to <strong>{confirmingOpt.tech.name}</strong> for the rest of the season?
                                {confirmingOpt.cost && <> This closes {confirmingOpt.cost.rivals.map(r => r.name).join(' and ')}
                                {confirmingOpt.cost.downstream.length > 0 && ` and ${confirmingOpt.cost.downstream.length} technolog${confirmingOpt.cost.downstream.length === 1 ? 'y' : 'ies'}`}. Research cannot be cancelled.</>}
                            </span>
                        </p>
                        <div className="mt-3 flex gap-2 justify-end">
                            <button type="button" onClick={() => setConfirming(null)} className="px-4 py-2 rounded-lg text-[10px] font-display uppercase tracking-[0.2em] border border-white/10 text-slate-300 hover:bg-white/5">
                                Not yet
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => { const id = confirmingOpt.tech.id; setConfirming(null); onCommit(id); }}
                                className="px-4 py-2 rounded-lg text-[10px] font-display uppercase tracking-[0.2em] border border-amber-400/80 bg-amber-500/25 text-amber-50 hover:bg-amber-500/35"
                            >
                                Commit to {confirmingOpt.tech.name}
                            </button>
                        </div>
                    </div>
                )}

                {error && <p role="alert" className="mx-5 mb-5 text-[11px] text-red-300">{error}</p>}
            </div>
        </div>
    );
}
