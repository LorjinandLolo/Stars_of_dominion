"use client";

// components/panels/OutpostsPanel.tsx
// Stars of Dominion — every outpost you run, worst news first: open crises,
// sieges, empty domes, then the rest. Open takes you to its screen
// (components/outpost/OutpostView.tsx).

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import type { OutpostState } from '@/lib/outposts/outpost-types';
import { CHARTERS, TIERS } from '@/lib/outposts/outpost-catalog';
import { computeBalance } from '@/lib/outposts/outpost-sim';
import { Home, AlertTriangle, Skull, Users, Smile, Utensils, Wind, Package, ChevronRight } from 'lucide-react';

interface Row {
    id: string;
    name: string;
    state: OutpostState;
    besieged: boolean;
    rank: number;
}

export default function OutpostsPanel() {
    const planets = useUIStore(s => s.planets);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const setOutpostPlanet = useUIStore(s => s.setOutpostPlanet);

    const rows = React.useMemo<Row[]>(() => (planets as any[])
        .filter(p => p.ownerId === playerFactionId && p.outpost)
        .map(p => {
            const state: OutpostState = p.outpost;
            const besieged = !!p.siege && !!p.siege.attackerEmpireId && p.siege.attackerEmpireId !== p.ownerId && !p.siege.winner;
            const rank = besieged ? 0 : state.crises.length ? 1 : state.colonists <= 0 && !state.graduated ? 2 : state.graduated ? 4 : 3;
            return { id: p.id, name: p.name ?? p.id, state, besieged, rank };
        })
        .sort((a, b) => a.rank - b.rank || b.state.crises.length - a.state.crises.length || a.name.localeCompare(b.name)),
    [planets, playerFactionId]);

    const crises = rows.reduce((s, r) => s + r.state.crises.length, 0);

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            <div>
                <h2 className="text-lg font-display font-bold text-slate-100 flex items-center gap-2"><Home size={18} className="text-emerald-400" /> Outposts</h2>
                <p className="text-xs text-slate-400">Every outpost you run, the ones that need you first. {crises > 0 && <span className="text-amber-300">{crises} crisis{crises === 1 ? '' : 'es'} waiting.</span>}</p>
            </div>

            {rows.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
                    No outposts yet. Lay down a Builder Ship at a shipyard, fly it to a surveyed system, and spend it on an empty world from the system panel.
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.map(({ id, name, state, besieged }) => {
                    const b = computeBalance(state);
                    const foodFlow = b.foodMade - b.foodUsed;
                    const airFlow = b.airMade - b.airUsed;
                    const empty = state.colonists <= 0 && !state.graduated;
                    const border = besieged ? 'border-red-500/50' : state.crises.length ? 'border-amber-500/50' : empty ? 'border-red-500/30' : 'border-slate-800';
                    const held = Object.values(state.warehouse).reduce((s, n) => s + n, 0);
                    return (
                        <button key={id} onClick={() => setOutpostPlanet(id)} className={`text-left rounded-xl border ${border} bg-slate-900/60 hover:bg-slate-900 p-3 space-y-2 transition-colors`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-semibold text-slate-100 truncate">{name}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{state.graduated ? 'Colony' : TIERS[state.tier].name} · {CHARTERS[state.charter].name}</div>
                                </div>
                                <ChevronRight size={16} className="text-slate-500 shrink-0 mt-1" />
                            </div>
                            {besieged && <div className="text-[11px] text-red-300 flex items-center gap-1"><Skull size={11} /> Under siege</div>}
                            {state.crises.map(c => (
                                <div key={c.id} className="text-[11px] text-amber-200 flex items-center gap-1">
                                    <AlertTriangle size={11} /> {c.title} <span className="text-amber-300/70">· {Math.max(0, c.deadlineShift - state.shift)} shift{c.deadlineShift - state.shift === 1 ? '' : 's'} left</span>
                                </div>
                            ))}
                            {empty && <div className="text-[11px] text-red-300">Empty. Land a new crew to restart it.</div>}
                            {!state.graduated && !empty && (
                                <div className="grid grid-cols-4 gap-2 text-[11px] text-slate-300">
                                    <span className="flex items-center gap-1" title="Colonists / room"><Users size={11} className="text-sky-400" />{state.colonists}/{b.housing}</span>
                                    <span className="flex items-center gap-1" title="Morale"><Smile size={11} className="text-pink-400" />{state.morale}</span>
                                    <span className={`flex items-center gap-1 ${foodFlow < 0 ? 'text-red-300' : ''}`} title="Food, change a shift"><Utensils size={11} className="text-green-400" />{state.food} {foodFlow >= 0 ? `+${foodFlow}` : foodFlow}</span>
                                    <span className={`flex items-center gap-1 ${airFlow < 0 ? 'text-red-300' : ''}`} title="Air reserve, change a shift"><Wind size={11} className="text-cyan-300" />{state.air} {airFlow >= 0 ? `+${airFlow}` : airFlow}</span>
                                </div>
                            )}
                            {held > 0 && <div className="text-[11px] text-orange-300 flex items-center gap-1"><Package size={11} /> {Math.round(held)} waiting for the next shipment</div>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
