"use client";

/**
 * components/panels/diplomacy/SanctuaryDesk.tsx
 * Item 14f: fallen governments asking us for shelter, the ones we shelter,
 * the conqueror's demands to hand them over, and (as a conqueror) the
 * shelters we know hide our enemies. Reads the view the worker builds for our
 * shard (lib/fallen/sanctuary-view.ts); every button queues an order the
 * worker re-checks. Browser-safe: types and the server-action module only.
 */

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { sanctuaryOrderAction } from '@/app/actions/espionage';
import { formatGalacticDeadline } from '@/lib/time/galactic-time';
import type { SanctuaryDeskEntry } from '@/lib/rebellion/rebellion-types';

const BTN = 'min-h-[40px] px-3 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

type Answer = 'open' | 'quiet' | 'refuse' | 'end' | 'refuse_demand' | 'hand_over';

export default function SanctuaryDesk() {
    const factionId = useUIStore(s => s.playerState.factionId);
    const entries = useUIStore(s => (s.espionageState as any)?.sanctuaries as SanctuaryDeskEntry[] | undefined) ?? [];
    const nowSeconds = useUIStore(s => s.nowSeconds);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    if (entries.length === 0) return null;

    const send = async (e: SanctuaryDeskEntry, actionId: 'REB_SANCTUARY_ANSWER' | 'REB_SANCTUARY_DEMAND', answer?: Answer, confirmText?: string) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(e.id);
        const res = await sanctuaryOrderAction(factionId, actionId, e.id, answer);
        setBusy(null);
        setNote(res.success ? 'Sent. It takes effect within a minute.' : (res.error ?? 'That did not go through.'));
        setTimeout(() => setNote(null), 5000);
    };

    return (
        <div className="space-y-4">
            <h3 className="text-[11px] font-display text-sky-300 uppercase tracking-[0.2em] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Governments in exile
            </h3>
            {note && <p className="text-xs text-slate-400">{note}</p>}
            {entries.map(e => {
                const cap = e.exileName.charAt(0).toUpperCase() + e.exileName.slice(1);
                const off = busy === e.id;
                return (
                    <div key={e.id} className="p-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 space-y-2">
                        {e.role === 'host' && e.status === 'asked' && (
                            <>
                                <p className="text-sm text-slate-200">
                                    {e.leaderName ?? 'A fallen leader'}, of {e.exileName}, asks us for sanctuary from {e.conquerorName}.
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    Openly, {e.conquerorName} is told at once and our relations suffer. Quietly, nobody knows until they find out, and then it costs more.
                                    Either way their people rest on our capital, safe from {e.conquerorName}'s security.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <button disabled={off} onClick={() => send(e, 'REB_SANCTUARY_ANSWER', 'open')} className={`${BTN} bg-sky-700/70 hover:bg-sky-600/70 text-white`}>Take them in openly</button>
                                    <button disabled={off} onClick={() => send(e, 'REB_SANCTUARY_ANSWER', 'quiet')} className={`${BTN} bg-slate-800 hover:bg-slate-700 text-sky-200`}>Take them in quietly</button>
                                    <button disabled={off} onClick={() => send(e, 'REB_SANCTUARY_ANSWER', 'refuse')} className={`${BTN} border border-slate-700 text-slate-400`}>Refuse</button>
                                </div>
                            </>
                        )}
                        {e.role === 'host' && e.status === 'given' && (
                            <>
                                <p className="text-sm text-slate-200">
                                    We shelter {e.exileName}{e.leaderName ? `, led by ${e.leaderName}` : ''}, on {e.planetName ?? 'our capital'}, {e.mode === 'open' ? 'openly' : 'quietly'}.
                                </p>
                                {e.exposure && <p className="text-[11px] text-slate-400">What {e.conquerorName} knows: {e.exposure}.</p>}
                                {e.demandUntilSeconds ? (
                                    <>
                                        <p className="text-[11px] text-red-300">
                                            {e.conquerorName} demands we hand them over. Answer {formatGalacticDeadline(e.demandUntilSeconds, nowSeconds)}; silence counts as no.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <button disabled={off} onClick={() => send(e, 'REB_SANCTUARY_ANSWER', 'refuse_demand')} className={`${BTN} bg-sky-700/70 hover:bg-sky-600/70 text-white`}>Refuse</button>
                                            <button disabled={off} onClick={() => send(e, 'REB_SANCTUARY_ANSWER', 'hand_over', `Hand ${e.exileName} over? Everyone sheltering with us goes to ${e.conquerorName}'s prisons.`)}
                                                className={`${BTN} border border-red-800 text-red-300`}>Hand them over</button>
                                        </div>
                                    </>
                                ) : (
                                    <button disabled={off} onClick={() => send(e, 'REB_SANCTUARY_ANSWER', 'end', `Ask ${e.exileName} to leave? Their people go home, where ${e.conquerorName} can take them.`)}
                                        className={`${BTN} border border-slate-700 text-slate-400`}>Ask them to leave</button>
                                )}
                            </>
                        )}
                        {e.role === 'conqueror' && (
                            <>
                                <p className="text-sm text-slate-200">{cap} shelters on {e.hostName}'s soil{e.planetName ? `, on ${e.planetName}` : ''}.</p>
                                {e.demandUntilSeconds
                                    ? <p className="text-[11px] text-slate-400">We have demanded {e.hostName} hand them over. They must answer {formatGalacticDeadline(e.demandUntilSeconds, nowSeconds)}.</p>
                                    : <button disabled={off || !e.canDemand?.open} onClick={() => send(e, 'REB_SANCTUARY_DEMAND')}
                                        className={`${BTN} w-full bg-slate-800 hover:bg-slate-700 text-amber-200`}>{e.canDemand?.open ? `Demand ${e.hostName} hand them over` : e.canDemand?.why}</button>}
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
