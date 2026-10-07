'use client';

/**
 * Movements abroad (Item 13b): rebel cells our service can see in other
 * empires' territory, and the ones we pay. Sponsoring a cell feeds it money
 * (and, armed, weapons); it acts more often, and every cycle and every act
 * leaves evidence that can expose us. A cutout costs more and halves the
 * evidence, and a captured member cannot name who paid them.
 *
 * Browser-safe: types and constants from lib/rebellion/rebellion-types only.
 */

import React, { useState } from 'react';
import { Coins, Loader2, Scissors, Users } from 'lucide-react';
import { sponsorshipCostPerTick, type CellSponsorship, type ForeignCellView } from '@/lib/rebellion/rebellion-types';
import type { SpyAgent } from '@/lib/espionage/agent-types';

interface Props {
    cells: ForeignCellView[];
    sponsorships: CellSponsorship[];
    agents: SpyAgent[];
    credits: number;
    factionName: (id: string | null | undefined) => string;
    busy: boolean;
    onSponsor: (cellId: string, opts: { armed: boolean; cutout: boolean; agentId: string | null }) => void;
    onCut: (sponsorshipId: string) => void;
}

/** Evidence against us, in words: the same ladder the press uses. */
function evidenceWord(e: number): { word: string; color: string } {
    if (e >= 0.85) return { word: 'exposed', color: 'text-red-400' };
    if (e >= 0.55) return { word: 'attributed', color: 'text-amber-400' };
    if (e >= 0.25) return { word: 'suspected', color: 'text-amber-300' };
    return { word: 'unseen', color: 'text-emerald-400' };
}

function strengthWord(s: number): string {
    if (s >= 60) return 'dangerous';
    if (s >= 30) return 'organised';
    if (s >= 10) return 'growing';
    return 'small';
}

function SponsorForm({ cell, agents, credits, busy, onSponsor }: {
    cell: ForeignCellView; agents: SpyAgent[]; credits: number; busy: boolean;
    onSponsor: Props['onSponsor'];
}) {
    const [armed, setArmed] = useState(false);
    const [cutout, setCutout] = useState(false);
    const [agentId, setAgentId] = useState('');
    const cost = sponsorshipCostPerTick(armed, cutout);
    const free = agents.filter(a => a.status === 'available');
    const short = credits < cost;
    return (
        <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
                <label className="flex items-center gap-1.5 min-h-[32px]">
                    <input type="checkbox" checked={armed} onChange={e => setArmed(e.target.checked)} /> Arm them
                </label>
                <label className="flex items-center gap-1.5 min-h-[32px]" title="Costs more. Evidence builds at half speed, and a captured member cannot name us.">
                    <input type="checkbox" checked={cutout} onChange={e => setCutout(e.target.checked)} /> Through a cutout
                </label>
            </div>
            <select value={agentId} onChange={e => setAgentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 min-h-[36px] text-[11px] text-slate-200">
                <option value="">No agent seconded</option>
                {free.map(a => <option key={a.id} value={a.id}>Second {a.codename}</option>)}
            </select>
            <button disabled={busy || short} onClick={() => onSponsor(cell.id, { armed, cutout, agentId: agentId || null })}
                className={`w-full min-h-[40px] rounded text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 ${busy || short
                    ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                    : 'bg-amber-700/80 text-white hover:bg-amber-600'}`}>
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                Pay them · {cost} credits a cycle
            </button>
            <p className="text-[10px] text-slate-500">
                {armed ? 'Weapons make their strikes hurt, and leave a trail faster. ' : ''}
                Every cycle and every strike adds to the evidence. Exposed, we answer for it.
            </p>
        </div>
    );
}

export function ForeignCells({ cells, sponsorships, agents, credits, factionName, busy, onSponsor, onCut }: Props) {
    const [openId, setOpenId] = useState<string | null>(null);
    const active = sponsorships.filter(s => !s.endedAtSeconds);
    const ended = sponsorships.filter(s => s.endedAtSeconds).slice(-3);
    const paidCellIds = new Set(active.map(s => s.cellId));
    const cellName = (id: string) => cells.find(c => c.id === id)?.name ?? 'a cell we lost sight of';

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
            <h3 className="text-[10px] font-display tracking-widest text-amber-400 uppercase flex items-center gap-2">
                <Users size={12} /> Movements abroad
            </h3>
            <p className="text-[10px] text-slate-500">
                Rebels in other empires, where our networks or deep infiltration let us see them. We can pay them. They will not ask why.
            </p>

            {active.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">On our payroll</div>
                    {active.map(s => {
                        const e = evidenceWord(s.evidence);
                        return (
                            <div key={s.id} className="border border-slate-800 rounded p-2 text-[11px] flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-slate-200 capitalize truncate">{cellName(s.cellId)}</div>
                                    <div className="text-[10px] text-slate-500">
                                        Against {factionName(s.targetFactionId)} · {sponsorshipCostPerTick(s.armed, s.cutout)} a cycle
                                        {s.armed ? ' · armed' : ''}{s.cutout ? ' · via cutout' : ''}
                                        {s.cutReceived > 0 ? ` · our cut so far ${Math.round(s.cutReceived)}` : ''}
                                    </div>
                                    <div className={`text-[10px] ${e.color}`}>Our hand: {e.word}</div>
                                </div>
                                <button disabled={busy} onClick={() => onCut(s.id)}
                                    title="Stop paying them. Evidence already gathered stays."
                                    className="shrink-0 min-h-[40px] px-3 rounded text-[10px] uppercase tracking-widest flex items-center gap-1.5 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                                    <Scissors size={11} /> Cut
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-wider text-slate-500">Cells we can see</div>
                {cells.filter(c => !paidCellIds.has(c.id)).length === 0 && (
                    <p className="text-[11px] text-slate-500">
                        {cells.length === 0 ? 'None. Build networks in rival systems, or infiltrate an empire deeply, to find their malcontents.' : 'We pay every cell we can see.'}
                    </p>
                )}
                {cells.filter(c => !paidCellIds.has(c.id)).map(c => (
                    <div key={c.id} className="border border-slate-800 rounded p-2 text-[11px]">
                        <div className="flex justify-between gap-2">
                            <span className="text-slate-200 capitalize">{c.name}</span>
                            <span className={c.movement ? "text-red-400" : "text-slate-400"}>{c.movement ? "in the open" : strengthWord(c.strength)}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                            {c.planetName} · {factionName(c.hostFactionId)} · about {c.members} members · for {c.cause}
                            {c.actsCommitted > 0 ? ` · ${c.actsCommitted} strike${c.actsCommitted === 1 ? '' : 's'}` : ''}
                        </div>
                        {openId === c.id ? (
                            <SponsorForm cell={c} agents={agents} credits={credits} busy={busy}
                                onSponsor={(id, o) => { onSponsor(id, o); setOpenId(null); }} />
                        ) : (
                            <button onClick={() => setOpenId(c.id)}
                                className="mt-2 min-h-[36px] px-3 rounded text-[10px] uppercase tracking-widest bg-slate-800 text-amber-300 hover:bg-slate-700">
                                Consider sponsoring
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {ended.length > 0 && (
                <p className="text-[10px] text-slate-500">
                    Ended: {ended.map(s => `${cellName(s.cellId)} (${s.endReason === 'cut' ? 'we cut them off' : s.endReason === 'cell_ended' ? 'the cell is gone' : 'lapsed'})`).join(', ')}.
                </p>
            )}
        </div>
    );
}
