"use client";

// components/government/CrisisCard.tsx
// Stars of Dominion — the crisis window, for both sides.
//
// A plot has struck (lib/government/crisis.ts). The card shows every actor
// of the state and where they stand, who holds the capital, the deadline,
// and the verbs this account has: the ruler secures (political capital),
// arrests, flees; the plotter secures (favours) and seizes the capital; a
// human minister who is neither picks a side. The crisis is public, so the
// same card renders for everyone in the court; the buttons differ.

import React from 'react';
import { Swords, ShieldAlert, Flag, Anchor } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { getSyncedWorld } from '@/hooks/useGameSync';
import { tally, openCrisisOf, canSeizeCapital, SECURE_COST_PC, ARREST_COST_PC, type CoupCrisis, type CrisisActor } from '@/lib/government/crisis-view';
import { formatGalacticDeadline } from '@/lib/time/galactic-time';

const SIDE_CLASS: Record<CrisisActor['side'], string> = {
    ruler: 'text-sky-300', plotter: 'text-red-300', undecided: 'text-slate-400',
};
const SIDE_LABEL: Record<CrisisActor['side'], string> = { ruler: 'for the throne', plotter: 'for the plot', undecided: 'undecided' };

export default function CrisisCard() {
    const seat = useUIStore(s => s.ministerSeat);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const tick = useUIStore(s => s.politicsState);
    const [busy, setBusy] = React.useState<string | null>(null);
    void tick;
    const world: any = getSyncedWorld();
    if (!playerFactionId || !world) return null;
    const crisis: CoupCrisis | undefined = openCrisisOf(world.coupCrises?.values?.() ?? [], playerFactionId)
        ?? [...(world.coupCrises?.values?.() ?? [])].filter((c: CoupCrisis) => c.factionId === playerFactionId && c.status === 'resolved').sort((a: CoupCrisis, b: CoupCrisis) => (b.resolvedAtSeconds ?? 0) - (a.resolvedAtSeconds ?? 0))[0];
    if (!crisis) return null;
    const now = Number(world.nowSeconds ?? 0);
    // Only the latest resolved crisis, and only for a day after.
    if (crisis.status === 'resolved' && now - (crisis.resolvedAtSeconds ?? 0) > 86400) return null;

    const role: 'ruler' | 'plotter' | 'minister' = !seat ? 'ruler' : seat.seatId === crisis.plotterSeatId ? 'plotter' : 'minister';
    const t = tally(crisis);
    const me = role === 'minister' ? crisis.actors.find(a => a.humanSeatId === seat!.seatId) : undefined;

    const order = async (key: string, actionId: string, payload: Record<string, unknown>, label: string) => {
        setBusy(key);
        try { await dispatchOrder({ actionId, payload, factionId: playerFactionId, label }); }
        finally { setTimeout(() => setBusy(null), 1500); }
    };

    return (
        <div className="bg-red-950/30 border border-red-500/40 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[10px] font-display tracking-widest text-red-300 uppercase flex items-center gap-1.5"><Swords size={11} /> {crisis.status === 'open' ? 'Coup in progress' : 'The crisis is over'}</div>
                    <p className="text-sm text-slate-100 mt-1">
                        <span className="font-semibold">{crisis.plotterName}</span> against <span className="font-semibold">{crisis.rulerName}</span>
                        {crisis.status === 'resolved' && crisis.outcome && (
                            <span className="ml-2 text-xs text-slate-300">· {crisis.outcome === 'ruler_holds' ? 'the throne held' : crisis.outcome === 'plotter_wins' ? 'the throne changed hands' : 'the empire split'}</span>
                        )}
                    </p>
                </div>
                {crisis.status === 'open' && (
                    <div className="text-right text-[10px] font-mono text-slate-400 whitespace-nowrap">
                        <div>decides {formatGalacticDeadline(crisis.deadlineSeconds, now)}</div>
                        <div>capital: <span className={crisis.capitalHeldBy === 'ruler' ? 'text-sky-300' : 'text-red-300'}>{crisis.capitalHeldBy === 'ruler' ? 'the throne' : 'the plot'}</span></div>
                        {role === 'plotter' && <div>favours: {crisis.favours}</div>}
                    </div>
                )}
            </div>

            <div className="flex gap-1 h-2 rounded overflow-hidden bg-slate-800" title={`throne ${t.ruler} · plot ${t.plotter} · undecided ${t.undecided}`}>
                <div className="bg-sky-500" style={{ width: `${t.rulerShare * 100}%` }} />
                <div className="bg-slate-600" style={{ width: `${(t.undecided / t.total) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${t.plotterShare * 100}%` }} />
            </div>

            {crisis.status === 'open' && (
                <div className="flex flex-wrap gap-2">
                    {role === 'ruler' && (
                        <button disabled={busy !== null || crisis.rulerFled} onClick={() => order('flee', 'CRISIS_FLEE', {}, 'Take the throne to the fleet')}
                            className="min-h-[36px] px-3 rounded-lg border border-sky-500/40 bg-sky-900/30 text-sky-100 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5">
                            <Anchor size={12} /> {crisis.rulerFled ? 'With the fleet' : 'Flee to the fleet'}
                        </button>
                    )}
                    {role === 'plotter' && (
                        <button disabled={busy !== null || !canSeizeCapital(crisis)} onClick={() => order('seize', 'CRISIS_SEIZE', {}, 'Seize the capital')}
                            className="min-h-[36px] px-3 rounded-lg border border-red-500/40 bg-red-900/30 text-red-100 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
                            title={canSeizeCapital(crisis) ? 'Take the palace' : 'You need the larger weight first'}>
                            <Flag size={12} /> {crisis.capitalHeldBy === 'plotter' ? 'Capital held' : 'Seize the capital'}
                        </button>
                    )}
                    {role === 'minister' && me && me.side === 'undecided' && (
                        <>
                            <button disabled={busy !== null} onClick={() => order('side-ruler', 'CRISIS_SIDE', { side: 'ruler' }, 'Stand with the throne')} className="min-h-[36px] px-3 rounded-lg border border-sky-500/40 bg-sky-900/30 text-sky-100 text-xs font-semibold">Stand with the throne</button>
                            <button disabled={busy !== null} onClick={() => order('side-plot', 'CRISIS_SIDE', { side: 'plotter' }, 'Stand with the plot')} className="min-h-[36px] px-3 rounded-lg border border-red-500/40 bg-red-900/30 text-red-100 text-xs font-semibold">Stand with the plot</button>
                        </>
                    )}
                </div>
            )}

            <ul className="space-y-1.5">
                {crisis.actors.map(a => (
                    <li key={a.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0">
                            <span className="text-slate-100">{a.name}</span>
                            <span className="text-slate-500 ml-2">{a.kind === 'officers' ? 'the general staff' : a.holds ?? a.kind}{a.weight !== 1 ? ` · ×${a.weight}` : ''}</span>
                        </span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                            <span className={`text-[10px] font-mono ${SIDE_CLASS[a.side]}`}>{a.locked ? `${SIDE_LABEL[a.side]} (settled)` : SIDE_LABEL[a.side]}</span>
                            {crisis.status === 'open' && !a.locked && a.side === 'undecided' && a.kind !== 'human' && (role === 'ruler' || role === 'plotter') && (
                                <button disabled={busy !== null || (role === 'plotter' && crisis.favours <= 0)} onClick={() => order(`secure-${a.id}`, 'CRISIS_SECURE', { actorId: a.id }, `Secure ${a.name}`)}
                                    className="min-h-[28px] px-2 rounded border border-slate-600/50 bg-slate-800/60 text-slate-200 text-[10px] font-semibold disabled:opacity-40"
                                    title={role === 'ruler' ? `${SECURE_COST_PC} political capital` : 'one favour'}>
                                    secure
                                </button>
                            )}
                            {crisis.status === 'open' && !a.locked && a.side === 'plotter' && role === 'ruler' && a.kind !== 'officers' && a.kind !== 'human' && a.id !== crisis.plotterLeaderId && (
                                <button disabled={busy !== null} onClick={() => order(`arrest-${a.id}`, 'CRISIS_ARREST', { actorId: a.id }, `Arrest ${a.name}`)}
                                    className="min-h-[28px] px-2 rounded border border-red-500/40 bg-red-900/30 text-red-100 text-[10px] font-semibold disabled:opacity-40"
                                    title={`${ARREST_COST_PC} political capital; may fail`}>
                                    <ShieldAlert size={10} className="inline mr-1" />arrest
                                </button>
                            )}
                        </span>
                    </li>
                ))}
            </ul>

            {crisis.log.length > 0 && (
                <ul className="space-y-0.5 border-t border-red-500/20 pt-2">
                    {crisis.log.slice(-4).map((l, i) => <li key={i} className="text-[11px] text-slate-400">{l.text}</li>)}
                </ul>
            )}
        </div>
    );
}
