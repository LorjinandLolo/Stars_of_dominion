"use client";

import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { BookOpen, Globe, Users, Filter, Clock, ChevronRight } from 'lucide-react';
import type { ChronicleEventType, IdeologyType } from '@/types/ui-state';

const IDEOLOGY_LABEL: Record<IdeologyType, string> = {
    imperial: 'Imperial Dominance',
    federalist: 'Federalist Order',
    mercantile: 'Mercantile Hegemony',
    anarchist: 'Anarchist Dissolution',
    technocrat: 'Technocratic Authority',
    theocratic: 'Theocratic Covenant',
};

const CHRONICLE_ICONS: Record<ChronicleEventType, string> = {
    region_formed: '🗺',
    region_dissolved: '💨',
    crisis_started: '⚠',
    crisis_resolved: '✅',
    council_founded: '🏛',
    council_split: '⚡',
    council_collapsed: '💥',
    faction_ascended: '👑',
    faction_fallen: '🔻',
    pirate_surge: '💀',
    season_locked: '🔒',
};

const OUTCOME_COLORS: Record<number, string> = { 0: '#3b82f6', 1: '#a855f7', 2: '#22c55e', 3: '#f59e0b' };

type FilterType = 'all' | ChronicleEventType;

export default function SeasonEndScreen() {
    const { regions, chronicle, civilizationalOutcomes, setShowSeasonEnd, seasonState } = useUIStore();
    const [activeSection, setActiveSection] = useState<'outcomes' | 'chronicle' | 'archive'>('outcomes');
    const [chronicleFilter, setChronicleFilter] = useState<FilterType>('all');

    // Dominant ideology from the stable/strongest region
    const strongestRegion = [...regions].sort((a, b) => b.metrics.strengthScore - a.metrics.strengthScore)[0];
    const dominantIdeology = strongestRegion?.metrics.dominantIdeology;

    const filteredChronicle = chronicle.filter((e) =>
        chronicleFilter === 'all' || e.type === chronicleFilter
    );

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/98 backdrop-blur-lg">
            {/* ── Header ───────────────────────────────────────────────────────────── */}
            <div className="flex-shrink-0 px-8 py-6 border-b border-slate-700/50 bg-gradient-to-r from-amber-950/20 to-transparent">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-display tracking-[4px] text-amber-500/60 mb-1">
                            SEASON {seasonState.season} — CONCLUDED
                        </div>
                        <h1 className="font-display text-2xl text-amber-400 tracking-widest">
                            GALACTIC CHRONICLE
                        </h1>
                    </div>
                    <button
                        onClick={() => setShowSeasonEnd(false)}
                        className="text-xs font-display tracking-widest text-slate-500 hover:text-slate-200 transition-colors px-3 py-1.5 border border-slate-700/50 rounded hover:border-slate-500"
                    >
                        RETURN TO GALAXY
                    </button>
                </div>

                {/* Section tabs */}
                <div className="flex items-center gap-1 mt-4">
                    {([
                        { id: 'outcomes', label: 'OUTCOMES', icon: <Users size={12} /> },
                        { id: 'chronicle', label: 'CHRONICLE', icon: <BookOpen size={12} /> },
                        { id: 'archive', label: 'ARCHIVE', icon: <Filter size={12} /> },
                    ] as const).map(({ id, label, icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveSection(id)}
                            className={[
                                'flex items-center gap-1.5 px-4 py-2 text-xs font-display tracking-widest rounded transition-all',
                                activeSection === id
                                    ? 'bg-amber-400/10 text-amber-400 border border-amber-400/30'
                                    : 'text-slate-500 hover:text-slate-200 border border-transparent',
                            ].join(' ')}
                        >
                            {icon} {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Main content ─────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
                {/* OUTCOMES section */}
                {activeSection === 'outcomes' && (
                    <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
                        {/* Regional macro-states */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3">REGIONAL MACRO-STATES</div>
                            <div className="grid grid-cols-3 gap-3">
                                {regions.map((r) => (
                                    <div
                                        key={r.id}
                                        className="bg-slate-900/60 border rounded-lg p-4 space-y-3"
                                        style={{ borderColor: `${r.color}44` }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                                            <span className="font-display text-xs text-slate-200">{r.name}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div>
                                                <div className="text-slate-500">STABILITY</div>
                                                <div className="font-mono" style={{ color: r.metrics.stabilityIndex > 50 ? '#22c55e' : '#ef4444' }}>
                                                    {r.metrics.stabilityIndex}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-slate-500">IDEOLOGY</div>
                                                <div className="font-display" style={{ color: r.color }}>
                                                    {r.metrics.dominantIdeology.toUpperCase()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-slate-500">STATUS</div>
                                                <div className="font-display" style={{ color: r.status === 'stable' ? '#22c55e' : r.status === 'emerging' ? '#a855f7' : '#f59e0b' }}>
                                                    {r.status.toUpperCase()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-slate-500">LOCK</div>
                                                <div className="font-mono text-slate-400">
                                                    {seasonState.regionalLocks[r.id]?.toUpperCase() ?? 'UNLOCKED'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Ideological dominance */}
                        {dominantIdeology && (
                            <div className="bg-amber-950/20 border border-amber-700/30 rounded-lg p-4">
                                <div className="text-[10px] font-display tracking-widest text-amber-500/60 mb-1">IDEOLOGICAL DOMINANCE</div>
                                <div className="font-display text-lg text-amber-400">
                                    {IDEOLOGY_LABEL[dominantIdeology]}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Prevailed in the largest and strongest surviving region — {strongestRegion.name}
                                </div>
                            </div>
                        )}

                        {/* Civilizational outcomes — no winner declaration */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3">CIVILIZATIONAL OUTCOMES</div>
                            <div className="grid grid-cols-2 gap-4">
                                {civilizationalOutcomes.map((outcome, idx) => (
                                    <div
                                        key={outcome.factionId}
                                        className="bg-slate-900/60 border rounded-lg p-5 space-y-3"
                                        style={{ borderColor: `${OUTCOME_COLORS[idx] ?? '#475569'}44` }}
                                    >
                                        <div>
                                            <div
                                                className="font-display text-xs tracking-widest mb-0.5"
                                                style={{ color: OUTCOME_COLORS[idx] ?? '#94a3b8' }}
                                            >
                                                {outcome.factionId.replace('faction-', '').toUpperCase()}
                                            </div>
                                            <div className="font-display text-sm text-slate-200">{outcome.title}</div>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed">{outcome.summary}</p>
                                        {/* Metrics snapshot */}
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {Object.entries(outcome.metricsSnapshot).map(([key, val]) => (
                                                <div key={key} className="bg-slate-800/50 rounded px-2 py-1">
                                                    <div className="text-[9px] text-slate-500">{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</div>
                                                    <div className="text-xs font-mono text-slate-200">{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Conflicts */}
                                        {outcome.conflictsWithOutcomeIds.length > 0 && (
                                            <div className="text-[10px] text-slate-500">
                                                Contested with: {outcome.conflictsWithOutcomeIds.map(id => id.replace('faction-', '')).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* CHRONICLE section */}
                {activeSection === 'chronicle' && (
                    <div className="max-w-3xl mx-auto px-8 py-8">
                        <div className="text-[10px] font-display tracking-widest text-slate-500 mb-4">
                            SEASON TIMELINE — {chronicle.length} EVENTS
                        </div>
                        <div className="relative">
                            {/* Timeline spine */}
                            <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-700/50" />

                            <div className="space-y-4">
                                {[...chronicle].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map((entry, idx) => (
                                    <div key={entry.id} className="flex gap-4 relative pl-12">
                                        {/* Timeline dot */}
                                        <div className="absolute left-3.5 top-2 w-3 h-3 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[8px]">
                                            {CHRONICLE_ICONS[entry.type] ?? '•'}
                                        </div>

                                        <div className="flex-1 bg-slate-900/50 border border-slate-700/30 rounded-lg p-3">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <span className="text-xs text-slate-200 font-display tracking-wide">{entry.headline}</span>
                                                <span className="text-[10px] font-mono text-slate-600 flex-shrink-0 flex items-center gap-1">
                                                    <Clock size={9} />
                                                    {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>
                                            {entry.detail && (
                                                <p className="text-[11px] text-slate-500 leading-relaxed">{entry.detail}</p>
                                            )}
                                            {entry.factionsInvolved.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {entry.factionsInvolved.map((fid) => (
                                                        <span key={fid} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                                            {fid.replace('faction-', '')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ARCHIVE section */}
                {activeSection === 'archive' && (
                    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3">FILTER BY EVENT TYPE</div>
                            <div className="flex flex-wrap gap-1.5">
                                {(['all', 'region_formed', 'crisis_started', 'council_founded', 'council_split', 'faction_ascended', 'faction_fallen', 'pirate_surge'] as FilterType[])
                                    .map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => setChronicleFilter(f)}
                                            className={[
                                                'text-[10px] font-display px-2 py-1 rounded border transition-all',
                                                chronicleFilter === f
                                                    ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                                                    : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300',
                                            ].join(' ')}
                                        >
                                            {f === 'all' ? 'ALL' : f.replace(/_/g, ' ').toUpperCase()}
                                        </button>
                                    ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {filteredChronicle.map((entry) => (
                                <div key={entry.id} className="flex items-start gap-3 px-4 py-3 bg-slate-900/40 border border-slate-700/30 rounded-lg">
                                    <span className="text-base">{CHRONICLE_ICONS[entry.type]}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-xs text-slate-200">{entry.headline}</span>
                                            <span className="text-[10px] font-mono text-slate-600 flex-shrink-0">
                                                {new Date(entry.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-0.5 font-display">
                                            {entry.type.replace(/_/g, ' ').toUpperCase()}
                                            {entry.regionId && ` · ${entry.regionId.replace(/-/g, ' ').toUpperCase()}`}
                                        </div>
                                    </div>
                                    <ChevronRight size={12} className="text-slate-600 flex-shrink-0 mt-0.5" />
                                </div>
                            ))}

                            {filteredChronicle.length === 0 && (
                                <div className="text-center py-8 text-slate-600 text-sm font-display">
                                    NO ENTRIES MATCH THIS FILTER
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
