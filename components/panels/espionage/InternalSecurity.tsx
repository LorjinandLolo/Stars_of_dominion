'use client';

/**
 * Internal security (Item 13a): the rebel cells our service has found on our
 * own worlds, and the restless worlds where more may be growing. A crackdown
 * hits every cell on a world, finds some, and costs us: the government's
 * reputation for oppression rises, and the world's unrest with it, which is
 * exactly what cells feed on.
 *
 * Browser-safe: types and constants from lib/rebellion/rebellion-types only.
 */

import React from 'react';
import { AlertTriangle, Flame, Loader2, ShieldAlert } from 'lucide-react';
import { CRACKDOWN_CAPITAL, type Crackdown, type RebelCell } from '@/lib/rebellion/rebellion-types';
import { formatGalacticDeadline } from '@/lib/time/galactic-time';

interface Props {
    cells: RebelCell[];
    crackdowns: Crackdown[];
    /** Our worlds, with their unrest. */
    worlds: { id: string; name: string; unrest: number }[];
    nowSeconds: number;
    busy: boolean;
    onCrackdown: (planetId: string) => void;
}

function strengthWord(s: number): { word: string; color: string } {
    if (s >= 60) return { word: 'dangerous', color: 'text-red-400' };
    if (s >= 30) return { word: 'organised', color: 'text-amber-400' };
    if (s >= 10) return { word: 'growing', color: 'text-amber-300' };
    return { word: 'small', color: 'text-slate-400' };
}

export function InternalSecurity({ cells, crackdowns, worlds, nowSeconds, busy, onCrackdown }: Props) {
    const active = cells.filter(c => c.status === 'active');
    const ended = cells.filter(c => c.status !== 'active');
    const restless = [...worlds].sort((a, b) => b.unrest - a.unrest).slice(0, 5);
    const worldName = (id: string) => worlds.find(w => w.id === id)?.name ?? 'an unknown world';
    const cooldown = (planetId: string) => {
        const c = crackdowns.find(x => x.planetId === planetId);
        return c && nowSeconds < c.untilSeconds ? c : null;
    };

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
            <h3 className="text-[10px] font-display tracking-widest text-rose-400 uppercase flex items-center gap-2">
                <ShieldAlert size={12} /> Internal security
            </h3>
            <p className="text-[10px] text-slate-500">
                Where worlds are restless, their unhappiest people organise. We see only the cells our service has found: sweeps and crackdowns turn them up.
            </p>

            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-wider text-slate-500">Known cells</div>
                {active.length === 0 ? (
                    <p className="text-[11px] text-slate-500">None found. That is not the same as none.</p>
                ) : active.map(c => {
                    const s = strengthWord(c.strength);
                    return (
                        <div key={c.id} className="border border-slate-800 rounded p-2 text-[11px]">
                            <div className="flex justify-between gap-2">
                                <span className="text-slate-200 capitalize">{c.name}</span>
                                <span className={s.color}>{s.word}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                                {worldName(c.planetId)} · about {c.members} members · for {c.cause}
                                {(c.actsCommitted ?? 0) > 0 && ` · ${c.actsCommitted} strike${c.actsCommitted === 1 ? "" : "s"}`}
                                {c.crackdownsSurvived > 0 && ` · survived ${c.crackdownsSurvived} crackdown${c.crackdownsSurvived === 1 ? '' : 's'}`}
                            </div>
                            {c.crisisId && (
                                <div className="text-[10px] text-red-400">In the open: a secession crisis carries its name. Answer it on the Government page, or crack down.</div>
                            )}
                            {(c.informedUntilSeconds ?? 0) > nowSeconds && (
                                <div className="text-[10px] text-emerald-400">We have an informant inside: a crackdown here knows where to look.</div>
                            )}
                        </div>
                    );
                })}
                {ended.length > 0 && (
                    <p className="text-[10px] text-slate-500">
                        Ended lately: {ended.map(c => `${c.name} (${c.status === 'crushed' ? 'crushed' : c.status === 'risen' ? 'rose as a state' : 'faded away'})`).join(', ')}.
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-wider text-slate-500">Restless worlds</div>
                {restless.length === 0 && <p className="text-[11px] text-slate-500">You hold no worlds.</p>}
                {restless.map(w => {
                    const cd = cooldown(w.id);
                    const knownHere = active.filter(c => c.planetId === w.id).length;
                    return (
                        <div key={w.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="text-[11px] text-slate-200 truncate">{w.name}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                    {w.unrest >= 50 && <AlertTriangle size={10} className="text-amber-400" />}
                                    Unrest {Math.round(w.unrest)}{knownHere ? ` · ${knownHere} known cell${knownHere > 1 ? 's' : ''}` : ''}
                                </div>
                            </div>
                            <button disabled={!!cd || busy} onClick={() => onCrackdown(w.id)}
                                title={`Hits every cell on ${w.name} and finds some. Costs ${CRACKDOWN_CAPITAL} political capital, raises our reputation for oppression and the world's unrest.`}
                                className={`shrink-0 min-h-[40px] px-3 rounded text-[10px] uppercase tracking-widest flex items-center gap-1.5 ${cd || busy
                                    ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                    : 'bg-rose-800/80 text-white hover:bg-rose-700'}`}>
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <Flame size={11} />}
                                {cd ? `Again ${formatGalacticDeadline(cd.untilSeconds, nowSeconds)}` : `Crack down · ${CRACKDOWN_CAPITAL} PC`}
                            </button>
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] text-slate-500">
                A crackdown works. It also makes the next cell easier to recruit for.
            </p>
        </div>
    );
}
