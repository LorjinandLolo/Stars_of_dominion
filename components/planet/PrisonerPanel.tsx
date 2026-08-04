"use client";

// components/planet/PrisonerPanel.tsx
// What becomes of the men who surrendered. Five choices, none of them free:
// ransom fills the treasury, labour fills the yards, recruitment fills the
// ranks, imprisonment buys leverage, execution buys terror — and a reputation.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { resolveDisposition, type PrisonerDisposition, type PrisonerGroup } from '@/lib/combat/siege/prisoners';
import { Coins, Hammer, UserPlus, Lock, Skull, Users, X } from 'lucide-react';

const OPTIONS: Array<{
    id: PrisonerDisposition;
    label: string;
    icon: React.ReactNode;
    color: string;
    blurb: string;
}> = [
    { id: 'ransom',   label: 'RANSOM',   icon: <Coins size={12} />,    color: '#fbbf24', blurb: 'Sell them back. Credits now, and the war cools a little.' },
    { id: 'labour',   label: 'LABOUR',   icon: <Hammer size={12} />,   color: '#f97316', blurb: 'Work them. Metals, unrest, and a reputation for it.' },
    { id: 'recruit',  label: 'RECRUIT',  icon: <UserPlus size={12} />, color: '#4ade80', blurb: 'Turn the willing into militia. The rest are interned.' },
    { id: 'imprison', label: 'IMPRISON', icon: <Lock size={12} />,     color: '#60a5fa', blurb: 'Hold them as leverage. Costs credits to feed.' },
    { id: 'execute',  label: 'EXECUTE',  icon: <Skull size={12} />,    color: '#ef4444', blurb: 'Kill them. Terror, fury, and infamy that follows you.' },
];

export default function PrisonerPanel({ onClose }: { onClose: () => void }) {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const prisoners = useUIStore(s => s.prisoners);
    const factions = useUIStore(s => s.factions);
    const [confirming, setConfirming] = React.useState<string | null>(null);

    const mine: PrisonerGroup[] = React.useMemo(
        () => (prisoners ?? []).filter((g: any) => !g.resolved && g.captorEmpireId === playerFactionId),
        [prisoners, playerFactionId]
    );
    const lostToEnemy = React.useMemo(
        () => (prisoners ?? []).filter((g: any) => !g.resolved && g.ownerEmpireId === playerFactionId),
        [prisoners, playerFactionId]
    );

    const nameOf = (id: string) =>
        (factions[id] as any)?.name ?? String(id).replace(/^faction-/, '').replace(/[-_]/g, ' ');

    const dispose = (group: PrisonerGroup, disposition: PrisonerDisposition) => {
        dispatchOrder({
            actionId: 'POW_DISPOSE',
            factionId: playerFactionId || 'PLAYER_FACTION',
            payload: { groupId: group.id, disposition },
            label: `${disposition.toUpperCase()} — ${group.count} prisoners from ${group.planetName}`,
        });
        setConfirming(null);
    };

    const heldTotal = mine.reduce((s, g) => s + g.count, 0);
    const lostTotal = lostToEnemy.reduce((s, g) => s + g.count, 0);

    return (
        <div className="absolute inset-x-0 bottom-0 z-30 max-h-[62%] flex flex-col rounded-t-lg border-t border-amber-500/40 bg-slate-950/96 backdrop-blur-md shadow-[0_-12px_40px_rgba(0,0,0,0.7)]">
            <div className="flex items-center gap-3 px-4 h-11 border-b border-slate-800/70 flex-shrink-0">
                <span className="flex items-center gap-2 text-[11px] font-display tracking-[0.22em] text-amber-300">
                    <Users size={14} /> PRISONERS OF WAR
                </span>
                <span className="text-[9px] font-mono text-slate-400">{heldTotal.toLocaleString()} held</span>
                {lostTotal > 0 && (
                    <span className="text-[9px] font-mono text-rose-400">{lostTotal.toLocaleString()} of ours in enemy hands</span>
                )}
                <button onClick={onClose} className="ml-auto p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10">
                    <X size={14} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {mine.length === 0 && (
                    <div className="text-[10px] text-slate-500 text-center py-6">
                        No prisoners in your hands. They are taken when an enemy force breaks in the field.
                    </div>
                )}

                {mine.map(group => {
                    const open = confirming === group.id;
                    return (
                        <div key={group.id} className="rounded border border-slate-700/60 bg-slate-900/60 p-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-display tracking-wider text-slate-100">
                                    {group.count.toLocaleString()} × {group.unitType.replace(/_/g, ' ')}
                                </span>
                                <span className="text-[9px] text-slate-500">
                                    of {nameOf(group.ownerEmpireId)} · taken on {group.planetName}
                                </span>
                                <button
                                    onClick={() => setConfirming(open ? null : group.id)}
                                    className="ml-auto px-2.5 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[9px] font-display tracking-[0.15em] hover:bg-amber-500/20 transition-colors"
                                >
                                    {open ? 'CANCEL' : 'DECIDE THEIR FATE'}
                                </button>
                            </div>

                            {open && (
                                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                                    {OPTIONS.map(opt => {
                                        const outcome = resolveDisposition(group, opt.id);
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => dispose(group, opt.id)}
                                                className="text-left p-2 rounded border transition-all hover:brightness-125"
                                                style={{ borderColor: `${opt.color}55`, backgroundColor: `${opt.color}12` }}
                                            >
                                                <span className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.12em]" style={{ color: opt.color }}>
                                                    {opt.icon}{opt.label}
                                                </span>
                                                <span className="block text-[8px] text-slate-400 mt-1 leading-relaxed">{opt.blurb}</span>
                                                <span className="flex flex-wrap gap-x-2 mt-1 text-[8px] font-mono">
                                                    {!!outcome.credits && (
                                                        <span className={outcome.credits > 0 ? 'text-amber-400' : 'text-rose-400'}>
                                                            {outcome.credits > 0 ? '+' : ''}{outcome.credits} cr
                                                        </span>
                                                    )}
                                                    {!!outcome.metals && <span className="text-slate-300">+{outcome.metals} metals</span>}
                                                    {!!outcome.recruits && <span className="text-emerald-400">+{outcome.recruits} militia</span>}
                                                    {!!outcome.unrest && <span className="text-orange-400">+{outcome.unrest} unrest</span>}
                                                    {!!outcome.stability && <span className="text-emerald-400">+{outcome.stability} stability</span>}
                                                    {!!outcome.rivalry && (
                                                        <span className={outcome.rivalry > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                                            {outcome.rivalry > 0 ? '+' : ''}{outcome.rivalry} tension
                                                        </span>
                                                    )}
                                                    {!!outcome.infamy && <span className="text-purple-400">+{outcome.infamy} infamy</span>}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {lostToEnemy.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-slate-800/70">
                        <div className="text-[8px] font-display tracking-[0.22em] text-slate-500 uppercase mb-1.5">Our people, in their hands</div>
                        {lostToEnemy.map((g: any) => (
                            <div key={g.id} className="flex items-center gap-2 text-[9px] text-slate-400 py-0.5">
                                <span className="font-mono text-rose-300">{g.count}</span>
                                <span>× {String(g.unitType).replace(/_/g, ' ')}</span>
                                <span className="text-slate-600">held by {nameOf(g.captorEmpireId)} · {g.planetName}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
