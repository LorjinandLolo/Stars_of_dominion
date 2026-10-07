'use client';

/**
 * Lines of inquiry on an open case file (spec item 12b-3). The player picks
 * one, pays Intel, and a finding comes back some hours later: or nothing, or a
 * lie. One lead per file at a time. The page shows the same costs and
 * requirements the worker enforces (lib/espionage/dossier.ts); the worker
 * re-checks everything and is the authority.
 */

import React, { useState } from 'react';
import { Loader2, Lock, Search } from 'lucide-react';
import type { CovertCase, FactionIntelState } from '@/types/ui-state';
import {
    LEADS, LEAD_BY_KIND, leadCost, leadDurationSeconds, hasOperativeTrace, SOURCES_LEAD_MIN_INFILTRATION, type LeadKind,
} from '@/lib/espionage/dossier';
import { formatGalacticDeadline, formatSimDurationAsReal } from '@/lib/time/galactic-time';

interface Props {
    kase: CovertCase;
    intel: FactionIntelState | null;
    factionName: (id: string) => string;
    nowSeconds: number;
    busy: boolean;
    onLead: (caseId: string, kind: LeadKind, targetFactionId: string | null) => void;
}

export function CaseLeads({ kase, intel, factionName, nowSeconds, busy, onLead }: Props) {
    const ci = intel?.counterIntelStrength ?? 0;
    const points = intel?.intelPoints ?? 0;
    const withSources = kase.suspectIds.filter(id => (intel?.infiltrationLevels?.[id] ?? 0) >= SOURCES_LEAD_MIN_INFILTRATION);
    const [sourcesTarget, setSourcesTarget] = useState<string>('');
    const target = withSources.includes(sourcesTarget) ? sourcesTarget : (withSources[0] ?? '');

    if (kase.lead) {
        const def = LEAD_BY_KIND[kase.lead.kind as LeadKind];
        return (
            <div className="bg-slate-900/60 border border-sky-800/50 rounded-lg p-3 text-[11px] text-sky-300 flex items-center gap-2">
                <Loader2 size={12} className="animate-spin shrink-0" />
                <span>
                    {def?.label ?? 'A lead'}{kase.lead.targetFactionId ? ` (${factionName(kase.lead.targetFactionId)})` : ''}: reports back {formatGalacticDeadline(kase.lead.dueAt, nowSeconds)}.
                </span>
            </div>
        );
    }

    /** Why a lead is not available, mirroring the worker's leadBlocker. */
    const blocker = (kind: LeadKind): string | null => {
        if (kind === 'sources' && withSources.length === 0) return `Needs an Embedded Network inside a person of interest`;
        if (kind === 'prisoner' && (intel?.prisoners ?? []).length === 0) return 'We hold no prisoners';
        if (kind === 'operative' && !hasOperativeTrace(kase.clues)) return 'Nobody has described the operative yet';
        const cost = leadCost(kind, ci);
        if (points < cost) return `Needs ${cost} Intel`;
        return null;
    };

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
                <Search size={11} /> Lines of inquiry
            </div>
            <p className="text-[10px] text-slate-500">One at a time. Findings, not proof: a lead can come back empty, or point at the wrong door.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {LEADS.filter(l => !l.cellOnly || !!kase.cellId).map(l => {
                    const why = blocker(l.kind);
                    return (
                        <div key={l.kind} className="border border-slate-800 rounded p-2 flex flex-col gap-1.5">
                            <div className="text-[11px] text-slate-200">{l.label}</div>
                            <div className="text-[10px] text-slate-500 leading-snug">{l.description}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                                {leadCost(l.kind, ci)} Intel · {formatSimDurationAsReal(leadDurationSeconds(l.kind, ci))}
                            </div>
                            {l.needsTarget && withSources.length > 0 && (
                                <select value={target} onChange={e => setSourcesTarget(e.target.value)}
                                    className="w-full min-h-[40px] bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 outline-none">
                                    {withSources.map(id => <option key={id} value={id}>{factionName(id)}</option>)}
                                </select>
                            )}
                            <button disabled={!!why || busy}
                                onClick={() => onLead(kase.id, l.kind, l.needsTarget ? target : null)}
                                className={`mt-auto min-h-[40px] py-2 rounded uppercase font-display text-[10px] tracking-widest flex items-center justify-center gap-1.5 ${why || busy
                                    ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                    : 'bg-sky-700 text-white hover:bg-sky-600'}`}>
                                {why ? <Lock size={11} /> : <Search size={11} />}
                                {why ?? 'Pursue'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
