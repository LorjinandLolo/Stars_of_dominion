"use client";

import React from 'react';
import { Check, X, AlertTriangle, Clock, Sparkles, MousePointerClick, ArrowUpRight } from 'lucide-react';
import type { Tech, TechEffect } from '@/lib/tech/types';
import { STATUS_META, type TechNodeStatus } from './TechNode';
import { TIER_NAMES, TIER_NUMERALS } from './layout';

interface TechInspectorProps {
    tech: Tech | null;
    status: TechNodeStatus | null;
    /** 0-100 while researching. */
    progress: number;
    byId: ReadonlyMap<string, Tech>;
    unlockedIds: ReadonlySet<string>;
    /** Techs that list the selected tech as a prerequisite. */
    unlocks: Tech[];
    slotsFull: boolean;
    busy: boolean;
    error: string | null;
    onSelect: (techId: string) => void;
    onResearch: (techId: string) => void;
}

const humanize = (s: string) => s.replace(/_/g, ' ');

function formatEffect(eff: TechEffect): { label: string; value: string | null; positive: boolean } {
    const label = humanize(eff.modifierKey || eff.target || eff.type);
    if (eff.value === undefined || eff.value === null) return { label, value: null, positive: true };
    // Values are authored as fractions; one decimal keeps 0.075 from printing as 7.500000000000001.
    const pct = Math.round(eff.value * 1000) / 10;
    return { label, value: `${pct > 0 ? '+' : ''}${pct}%`, positive: pct >= 0 };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-[8px] font-display text-slate-500 uppercase tracking-[0.25em] mb-1.5">
            {children}
        </h3>
    );
}

function TechLink({ tech, met, onSelect }: { tech: Tech | undefined; met?: boolean; onSelect: (id: string) => void }) {
    if (!tech) return null;
    return (
        <button
            type="button"
            onClick={() => onSelect(tech.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-white/5 bg-white/[0.03] hover:bg-indigo-500/10 hover:border-indigo-500/30 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
        >
            {met !== undefined && (
                met
                    ? <Check size={11} className="text-green-400 shrink-0" />
                    : <X size={11} className="text-red-400 shrink-0" />
            )}
            <span className="flex-1 truncate text-[10px] text-slate-200">{tech.name}</span>
            <span className="text-[8px] font-mono text-slate-500">T{tech.tier}</span>
            <ArrowUpRight size={10} className="text-slate-600 shrink-0" />
        </button>
    );
}

export default function TechInspector({
    tech,
    status,
    progress,
    byId,
    unlockedIds,
    unlocks,
    slotsFull,
    busy,
    error,
    onSelect,
    onResearch,
}: TechInspectorProps) {
    if (!tech || !status) {
        return (
            <aside
                aria-label="Technology details"
                className="w-80 shrink-0 h-full border-l border-white/5 bg-slate-950/70 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-6 text-center"
            >
                <MousePointerClick size={22} className="text-slate-600" />
                <h2 className="text-xs font-display uppercase tracking-[0.25em] text-slate-400">Select a technology</h2>
                <p className="text-[10px] text-slate-600 leading-relaxed">
                    Click a node to read its effects, trace its prerequisites and authorize research.
                </p>
            </aside>
        );
    }

    const meta = STATUS_META[status];
    const action = (() => {
        switch (status) {
            case 'available':
                if (slotsFull) return { label: 'All research slots busy', enabled: false };
                return { label: busy ? 'Authorizing…' : 'Authorize Research', enabled: !busy };
            case 'researching': return { label: `In progress ${Math.round(progress)}%`, enabled: false };
            case 'pending': return { label: 'Authorizing — awaiting the worker', enabled: false };
            // The order is queued for the worker; the next sync poll turns this into a slot.
            case 'pending': return { label: 'Order lodged · awaiting archive sync', enabled: false };
            case 'unlocked': return { label: 'Already researched', enabled: false };
            case 'locked': return { label: 'Locked by an exclusive choice', enabled: false };
            default: return { label: 'Prerequisites not met', enabled: false };
        }
    })();

    const prerequisites = tech.prerequisites ?? [];
    const scoreTags = tech.seasonScoreTags ?? [];

    return (
        <aside
            aria-label="Technology details"
            className="w-80 shrink-0 h-full border-l border-white/5 bg-slate-950/70 backdrop-blur-md flex flex-col min-h-0"
        >
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
                <header>
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <h2 className="text-sm font-display uppercase tracking-wider text-white leading-snug">{tech.name}</h2>
                        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-display uppercase tracking-widest ${meta.swatch} bg-opacity-20 text-slate-100`}>
                            {meta.label}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-mono uppercase">
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">{tech.tree}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">
                            Tier {TIER_NUMERALS[tech.tier]} · {TIER_NAMES[tech.tier]}
                        </span>
                        {tech.branch && (
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400 lowercase">{humanize(tech.branch)}</span>
                        )}
                    </div>
                </header>

                {status === 'researching' && (
                    <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden border border-amber-500/20">
                        <div className="h-full bg-amber-400 transition-[width] duration-1000" style={{ width: `${progress}%` }} />
                    </div>
                )}

                <section>
                    <SectionHeading>Description</SectionHeading>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{tech.description}</p>
                </section>

                {tech.mechanicalEffect && (
                    <section>
                        <SectionHeading>Mechanical Effect</SectionHeading>
                        <p className="text-[10px] text-slate-300 leading-relaxed border-l-2 border-indigo-500/40 pl-2">
                            {tech.mechanicalEffect}
                        </p>
                    </section>
                )}

                {tech.effects.length > 0 && (
                    <section>
                        <SectionHeading>Stat Adjustments</SectionHeading>
                        <ul className="space-y-1">
                            {tech.effects.map((eff, idx) => {
                                const f = formatEffect(eff);
                                return (
                                    <li key={idx} className="flex items-center justify-between gap-2 text-[10px]">
                                        <span className="text-slate-400 lowercase truncate">{f.label}</span>
                                        {f.value === null ? (
                                            <span className="text-indigo-300 font-mono shrink-0">unlock</span>
                                        ) : (
                                            <span className={`font-mono shrink-0 ${f.positive ? 'text-green-400' : 'text-red-400'}`}>{f.value}</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                <section>
                    <SectionHeading>Prerequisites</SectionHeading>
                    {prerequisites.length === 0 ? (
                        <p className="text-[10px] text-slate-600 italic">None — a root technology.</p>
                    ) : (
                        <ul className="space-y-1">
                            {prerequisites.map(pid => (
                                <li key={pid}>
                                    <TechLink tech={byId.get(pid)} met={unlockedIds.has(pid)} onSelect={onSelect} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <SectionHeading>Unlocks</SectionHeading>
                    {unlocks.length === 0 ? (
                        <p className="text-[10px] text-slate-600 italic">Nothing further depends on this.</p>
                    ) : (
                        <ul className="space-y-1">
                            {unlocks.map(child => (
                                <li key={child.id}>
                                    <TechLink tech={child} onSelect={onSelect} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {tech.mutuallyExclusiveGroup && (
                    <section className="rounded border border-red-900/40 bg-red-950/20 p-2.5">
                        <h3 className="flex items-center gap-1.5 text-[8px] font-display text-red-400 uppercase tracking-[0.25em] mb-1">
                            <AlertTriangle size={11} /> Mutually Exclusive
                        </h3>
                        <p className="text-[10px] text-red-200/80 leading-relaxed">
                            Researching this locks out the other paths in group <span className="font-mono">{tech.mutuallyExclusiveGroup}</span>.
                        </p>
                    </section>
                )}

                <section className="grid grid-cols-2 gap-3">
                    <div>
                        <SectionHeading>Research Cost</SectionHeading>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-200">
                            <Clock size={11} className="text-slate-500" /> {tech.researchCost} h
                        </span>
                    </div>
                    {scoreTags.length > 0 && (
                        <div>
                            <SectionHeading>Season Score</SectionHeading>
                            <div className="flex flex-wrap gap-1">
                                {scoreTags.map(tag => (
                                    <span key={tag} className="text-[7px] font-display text-indigo-300 uppercase bg-indigo-500/10 px-1 py-0.5 rounded border border-indigo-500/20">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <div className="p-4 border-t border-white/5 bg-slate-950/60">
                <button
                    type="button"
                    disabled={!action.enabled}
                    onClick={() => onResearch(tech.id)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded text-[10px] font-display uppercase tracking-[0.2em] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                        action.enabled
                            ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-200 hover:bg-indigo-500/30 hover:border-indigo-300'
                            : 'bg-white/[0.02] border-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                >
                    <Sparkles size={12} /> {action.label}
                </button>
                {error && (
                    <p role="alert" className="mt-2 text-[10px] text-red-300 leading-snug">{error}</p>
                )}
            </div>
        </aside>
    );
}
