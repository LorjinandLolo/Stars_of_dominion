"use client";

// components/government/PlotCard.tsx
// Stars of Dominion — a seated minister's plot, and the invitations they got.
//
// Shown only to a minister (store.ministerSeat), inside the Government panel
// of the court they sit in. Reads the plot the sync route handed this seat
// (lib/persistence/shard-privacy.ts gives a minister their own plot and
// their invitations, the ruler none), and the worker's private notes to this
// seat. Every button is a PLOT_* order through the seat
// (lib/government/plots.ts). The ruler never sees this card.

import React from 'react';
import { EyeOff, Users, Flag, XCircle } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { getSyncedWorld } from '@/hooks/useGameSync';
import {
    plotActorsView, strikeReadinessView, seatLeaderIdOf, SOUND_OUT_EVERY_SECONDS,
    type Plot, type PlotActor, type SeatNote,
} from '@/lib/government/plot-view';

const STATE_LABEL: Record<NonNullable<PlotActor['state']>, string> = {
    joined: 'with you', refused: 'refused', reported: 'reported you', invited: 'asked', declined: 'declined',
};

export default function PlotCard() {
    const seat = useUIStore(s => s.ministerSeat);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    // Re-render on every sync: the government slice is rewritten each snapshot.
    const tick = useUIStore(s => s.politicsState);
    const [busy, setBusy] = React.useState<string | null>(null);
    void tick;

    const world: any = getSyncedWorld();
    if (!seat || !playerFactionId || !world) return null;

    const seatId = seat.seatId;
    const me = seatLeaderIdOf(seatId);
    const plots: Plot[] = [...(world.plots?.values?.() ?? [])].filter((p: Plot) => p.factionId === playerFactionId);
    const mine = plots.find(p => p.plotterSeatId === seatId && p.status === 'preparing');
    const invitations = plots.filter(p => p.plotterSeatId !== seatId && p.recruits?.[me] === 'invited');
    const note: SeatNote | undefined = world.seatNotes?.get?.(seatId) ?? world.seatNotes?.[seatId];
    const gov = world.government?.get?.(playerFactionId);
    const actors = plotActorsView(world, playerFactionId, mine);
    const readiness = mine ? strikeReadinessView(gov, mine) : null;
    const nextApproachIn = mine ? Math.max(0, mine.lastSoundOutSeconds + SOUND_OUT_EVERY_SECONDS - Number(world.nowSeconds ?? 0)) : 0;

    const order = async (key: string, actionId: string, payload: Record<string, unknown>, label: string) => {
        setBusy(key);
        try { await dispatchOrder({ actionId, payload, factionId: playerFactionId, label }); }
        finally { setTimeout(() => setBusy(null), 1500); }
    };

    return (
        <div className="bg-slate-950/70 border border-violet-500/30 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[10px] font-display tracking-widest text-violet-300 uppercase flex items-center gap-1.5"><EyeOff size={11} /> Your own counsel</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                        What is said here never reaches the ruler. Sound out one person a day; the disloyal join, the loyal report you.
                        A plot can only strike once the empire is already rotten.
                    </p>
                </div>
            </div>

            {note && (
                <p className={`text-[11px] font-mono ${note.ok ? 'text-violet-200' : 'text-amber-300'}`}>{note.text}</p>
            )}

            {invitations.length > 0 && (
                <div className="space-y-2">
                    {invitations.map(p => (
                        <div key={p.id} className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                            <p className="text-xs text-slate-200">
                                <span className="font-semibold">{world.leadership?.leaders?.get?.(p.plotterLeaderId)?.name ?? 'A colleague'}</span> has sounded you out about{' '}
                                {p.kind === 'coup' ? 'moving against the ruler' : 'taking a province out'}.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {(['join', 'decline', 'report'] as const).map(answer => (
                                    <button
                                        key={answer}
                                        disabled={busy !== null}
                                        onClick={() => order(`ans-${p.id}-${answer}`, 'PLOT_ANSWER', { plotId: p.id, answer }, `${answer} the plot`)}
                                        className={`min-h-[36px] px-3 rounded-lg border text-xs font-semibold capitalize ${
                                            answer === 'join' ? 'border-violet-400/40 bg-violet-700/40 text-violet-100'
                                            : answer === 'report' ? 'border-red-400/40 bg-red-900/30 text-red-200'
                                            : 'border-slate-600/40 bg-slate-800/60 text-slate-200'
                                        } disabled:opacity-50`}
                                    >
                                        {answer}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!mine ? (
                <div className="flex flex-wrap gap-2">
                    <button
                        disabled={busy !== null}
                        onClick={() => order('start-coup', 'PLOT_START', { kind: 'coup' }, 'Begin a plot')}
                        className="min-h-[40px] px-4 rounded-lg border border-violet-500/40 bg-violet-900/30 hover:bg-violet-800/40 text-violet-100 text-xs font-semibold disabled:opacity-50 flex items-center gap-2"
                    >
                        <Flag size={13} /> Plot for the throne
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
                            <Users size={11} /> {mine.kind === 'coup' ? 'The throne' : 'A province'} · {readiness?.recruits ?? 0} inside
                        </div>
                        <button
                            disabled={busy !== null}
                            onClick={() => { if (window.confirm('Burn the plot? Those who joined keep their silence.')) order('abandon', 'PLOT_ABANDON', {}, 'Abandon the plot'); }}
                            className="text-[10px] font-mono text-slate-500 hover:text-slate-300 flex items-center gap-1"
                        >
                            <XCircle size={11} /> burn it
                        </button>
                    </div>

                    {readiness && (
                        <div className="flex items-center justify-between gap-3">
                            <p className={`text-[11px] ${readiness.ok ? 'text-emerald-300' : 'text-slate-400'}`}>
                                {readiness.ok ? 'The hour is right.' : readiness.reasons.join(' ')}
                            </p>
                            {readiness.ok && (
                                <button
                                    disabled={busy !== null}
                                    onClick={() => { if (window.confirm('Strike now? The court will know within the hour, and there is no taking it back.')) order('strike', 'PLOT_STRIKE', {}, 'Strike for the throne'); }}
                                    className="min-h-[36px] px-4 rounded-lg border border-red-500/50 bg-red-800/50 hover:bg-red-700/60 text-red-50 text-xs font-bold whitespace-nowrap disabled:opacity-50"
                                >
                                    Strike
                                </button>
                            )}
                        </div>
                    )}

                    {mine.warnings.length > 0 && (
                        <ul className="space-y-1">
                            {mine.warnings.slice(-3).map((w, i) => (
                                <li key={i} className="text-[11px] text-amber-200/90">{w.text}</li>
                            ))}
                        </ul>
                    )}

                    <ul className="space-y-1.5">
                        {actors.map(a => (
                            <li key={a.id} className="flex items-center justify-between gap-3 text-xs">
                                <span className="min-w-0">
                                    <span className="text-slate-100">{a.name}</span>
                                    <span className="text-slate-500 ml-2">{a.detail}</span>
                                </span>
                                {a.state ? (
                                    <span className={`text-[10px] font-mono whitespace-nowrap ${a.state === 'joined' ? 'text-violet-300' : a.state === 'reported' ? 'text-red-300' : 'text-slate-500'}`}>
                                        {STATE_LABEL[a.state]}
                                    </span>
                                ) : (
                                    <button
                                        disabled={busy !== null || nextApproachIn > 0}
                                        onClick={() => order(`sound-${a.id}`, 'PLOT_SOUND_OUT', { actorId: a.id }, `Sound out ${a.name}`)}
                                        className="min-h-[32px] px-3 rounded-lg border border-violet-500/30 bg-violet-900/20 hover:bg-violet-800/30 text-violet-200 text-[11px] font-semibold disabled:opacity-40 whitespace-nowrap"
                                        title={nextApproachIn > 0 ? 'One approach a day' : 'Sound them out'}
                                    >
                                        sound out
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    {nextApproachIn > 0 && (
                        <p className="text-[10px] font-mono text-slate-500">next approach in about {Math.ceil(nextApproachIn / 3600)} sim hours</p>
                    )}
                </div>
            )}
        </div>
    );
}
