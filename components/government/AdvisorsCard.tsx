"use client";

// components/government/AdvisorsCard.tsx
// Stars of Dominion — the Advisors card.
//
// One switch per system a player can leave to their staff. Most are delegated
// until the player says otherwise: an empire that is ignored for a week should
// be slower, never wounded. Turning a switch off takes that system back and
// restores the old behaviour for it, penalties included. Below the switches:
// the standing orders — advice the player answered Always to in the brief.

import React from 'react';
import { ShieldCheck, Hand } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { DELEGATED_SYSTEMS, DELEGATION_LABELS, defaultDelegation, type DelegatedSystem } from '@/lib/delegation/delegation-types';

export default function AdvisorsCard() {
    const delegation = useUIStore(s => s.delegation);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    // Delegation is the ruler's to set; a seated minister sees no switches.
    const ministerSeat = useUIStore(s => s.ministerSeat);
    // No record means nothing has been taken back yet.
    const state = { ...defaultDelegation(), ...(delegation ?? {}) };

    // The worker is authoritative; show the flip immediately and let the next
    // sync confirm it.
    const [optimistic, setOptimistic] = React.useState<Partial<Record<DelegatedSystem, boolean>>>({});
    const valueFor = (system: DelegatedSystem) => optimistic[system] ?? state[system];

    const toggle = async (system: DelegatedSystem) => {
        if (!playerFactionId) return;
        const next = !valueFor(system);
        setOptimistic(prev => ({ ...prev, [system]: next }));
        const result = await dispatchOrder({
            actionId: 'GOV_SET_DELEGATION',
            payload: { system, enabled: next },
            factionId: playerFactionId,
            label: next ? `Delegate ${system}` : `Take back ${system}`,
        });
        if (!result.success) setOptimistic(prev => ({ ...prev, [system]: !next }));
    };

    const delegatedCount = DELEGATED_SYSTEMS.filter(s => valueFor(s)).length;
    if (ministerSeat) return null;

    const advisorStanding = useUIStore(s => s.advisorStanding);
    const [revoked, setRevoked] = React.useState<string[]>([]);
    const standing = advisorStanding.filter(id => !revoked.includes(id));
    const revoke = async (id: string) => {
        if (!playerFactionId) return;
        setRevoked(prev => [...prev, id]);
        const result = await dispatchOrder({
            actionId: 'ADV_REVOKE_ALWAYS',
            payload: { actionId: id },
            factionId: playerFactionId,
            label: `Ask again before ${actionLabel(id).toLowerCase()}`,
        });
        if (!result.success) setRevoked(prev => prev.filter(x => x !== id));
    };

    return (
        <div className="bg-slate-900/60 border border-sky-500/25 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase">Advisors</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                        Anything left to your advisors keeps running while you are away — cautiously, never
                        ambitiously. Take a system back and it is yours alone again, consequences included.
                    </p>
                </div>
                <div className="text-[10px] font-mono text-sky-300 whitespace-nowrap">
                    {delegatedCount}/{DELEGATED_SYSTEMS.length} delegated
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                {DELEGATED_SYSTEMS.map(system => {
                    const on = valueFor(system);
                    const label = DELEGATION_LABELS[system];
                    return (
                        <button
                            key={system}
                            onClick={() => toggle(system)}
                            className={`text-left rounded-lg border p-3 transition-colors ${
                                on
                                    ? 'border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10'
                                    : 'border-slate-700/60 bg-slate-950/40 hover:bg-slate-900/60'
                            }`}
                            title={on ? 'Take this system back' : 'Leave this system to your advisors'}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-xs font-semibold text-slate-100">{label.title}</span>
                                <span
                                    className={`flex items-center gap-1 text-[9px] font-display tracking-widest uppercase ${
                                        on ? 'text-sky-300' : 'text-slate-500'
                                    }`}
                                >
                                    {on ? <ShieldCheck size={11} /> : <Hand size={11} />}
                                    {on ? 'Advisors' : 'You'}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">{label.detail}</p>
                        </button>
                    );
                })}
            </div>

            {/* Standing orders: what the player answered Always to in the brief. */}
            {standing.length > 0 && (
                <div className="border-t border-slate-800 pt-3">
                    <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase mb-1">Standing orders</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                        Advice you approved for good: your advisors carry these out without asking. Take one back and they ask again.
                    </p>
                    <ul className="space-y-1.5">
                        {standing.map(id => (
                            <li key={id} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-slate-200">{actionLabel(id)}</span>
                                <button
                                    onClick={() => revoke(id)}
                                    className="text-[10px] font-mono text-sky-300 hover:text-sky-200 underline-offset-2 hover:underline"
                                >
                                    ask me again
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** "DIP_DECLARE_WAR" → "Declare war". */
function actionLabel(actionId: string): string {
    const words = actionId.replace(/^[A-Z]+_/, '').toLowerCase().split('_');
    return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
