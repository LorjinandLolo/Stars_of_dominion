'use client';

// components/panels/FactionPanel.tsx
//
// The faction saga: who you are, the edge your people bring, what your
// mechanics are doing right now, and what your empire has done.
//
// Deliberately a DUMB renderer. Every number, every open/closed window and
// every live/dormant verdict comes from lib/factions/saga.ts, which derives
// them through the same readers the engine uses — this component contains no
// game arithmetic at all, so it cannot disagree with the worker about anything.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Flame, ScrollText, ShieldAlert, CircleDot, Sparkles, Fingerprint, Sun } from 'lucide-react';
import type { SagaStatus, SagaEdge } from '@/lib/factions/saga';
import type { EnlightenmentView, EnlightenmentCondition } from '@/lib/victory/victory-service';

const TONE_STYLES: Record<SagaStatus['tone'], { dot: string; border: string; text: string }> = {
    active: { dot: 'bg-emerald-400', border: 'border-emerald-500/25', text: 'text-emerald-300' },
    warning: { dot: 'bg-amber-400 animate-pulse', border: 'border-amber-500/30', text: 'text-amber-300' },
    dormant: { dot: 'bg-slate-600', border: 'border-slate-700/40', text: 'text-slate-400' },
};

const EDGE_STYLES: Record<SagaEdge['tone'], { value: string; label: string; border: string }> = {
    active: { value: 'text-emerald-300', label: 'text-slate-200', border: 'border-slate-800/60' },
    dormant: { value: 'text-slate-500', label: 'text-slate-500', border: 'border-slate-800/30' },
};

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            {icon} {children}
        </div>
    );
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'weak' | 'aim' }) {
    const cls = tone === 'weak'
        ? 'bg-rose-950/30 text-rose-300/90 border-rose-800/30'
        : tone === 'aim'
            ? 'bg-sky-950/30 text-sky-300/90 border-sky-800/30'
            : 'bg-slate-900/60 text-slate-300 border-slate-700/50';
    return <span className={`text-[9px] px-1.5 py-0.5 rounded border tracking-wide ${cls}`}>{children}</span>;
}

export default function FactionPanel() {
    const saga = useUIStore(s => s.factionSaga);

    if (!saga) {
        return (
            <div className="p-6 text-xs font-mono text-slate-500 animate-pulse">
                READING THE LEDGERS…
            </div>
        );
    }

    const { identity } = saga;
    const liveEdges = saga.edges.filter(e => e.tone === 'active');
    const dormantEdges = saga.edges.filter(e => e.tone === 'dormant');
    const ledger = [...saga.records, ...saga.deeds];

    return (
        <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto bg-slate-950/95 text-slate-200">
            {/* ── Who you are ─────────────────────────────────────────────── */}
            <div className="border-b border-slate-800 pb-3">
                <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-display tracking-widest uppercase text-slate-100 truncate">{identity.name}</div>
                        {identity.tagline && (
                            <div className="text-[11px] text-slate-400 italic mt-0.5">“{identity.tagline}”</div>
                        )}
                    </div>
                    <Flame size={16} className="text-slate-600 shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] font-mono text-slate-500">
                    {identity.leader && <span>{identity.leader}</span>}
                    {identity.playstyle && <span className="text-slate-400">{identity.playstyle}</span>}
                    {identity.species && <span>{identity.species}</span>}
                    {identity.ideology && (
                        <span className="text-[var(--color-primary)] opacity-80" title={identity.ideology.description}>{identity.ideology.name}</span>
                    )}
                </div>
                {identity.description && (
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-2">{identity.description}</p>
                )}
                {(identity.traits.length > 0 || identity.weaknesses.length > 0 || identity.preferredVictories.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {identity.traits.map(t => <Chip key={`t-${t}`}>{t}</Chip>)}
                        {identity.weaknesses.map(w => <Chip key={`w-${w}`} tone="weak">{w}</Chip>)}
                        {identity.preferredVictories.map(v => <Chip key={`v-${v}`} tone="aim">{v} victory</Chip>)}
                    </div>
                )}
                {!saga.hasBespokeMechanics && (
                    <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                        No rite or clause of your own — the common rules are the whole game, and the ledger below is how you play them.
                    </div>
                )}
            </div>

            {/* ── The edge ────────────────────────────────────────────────── */}
            {saga.edges.length > 0 && (
                <div className="flex flex-col gap-1">
                    <SectionHeading icon={<Sparkles size={11} />}>The edge</SectionHeading>
                    {liveEdges.map(edge => <EdgeRow key={edge.id} edge={edge} />)}
                    {dormantEdges.length > 0 && (
                        <>
                            <div className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mt-1 px-1">
                                Dormant — authored, not yet in play
                            </div>
                            {dormantEdges.map(edge => <EdgeRow key={edge.id} edge={edge} />)}
                        </>
                    )}
                </div>
            )}

            {/* ── Live state (bespoke) ────────────────────────────────────── */}
            {saga.statuses.length > 0 && (
                <div className="flex flex-col gap-2">
                    <SectionHeading icon={<ShieldAlert size={11} />}>Current state</SectionHeading>
                    {saga.statuses.map(status => {
                        const tone = TONE_STYLES[status.tone];
                        return (
                            <div key={status.id} className={`rounded border ${tone.border} bg-slate-900/50 px-3 py-2`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                                        <span className="text-[11px] font-semibold uppercase tracking-wide truncate">{status.label}</span>
                                    </div>
                                    <span className={`text-[11px] font-mono text-right ${tone.text}`}>{status.value}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">{status.detail}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            <EnlightenmentSection view={saga.enlightenment} />

            {/* ── The saga — lifetime ledger ──────────────────────────────── */}
            <div className="flex flex-col gap-1">
                <SectionHeading icon={<ScrollText size={11} />}>The saga so far</SectionHeading>
                {ledger.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-1.5 rounded bg-slate-900/30 border border-slate-800/60">
                        <span className="text-[11px] text-slate-300 flex items-center gap-2">
                            <CircleDot size={9} className="text-slate-600" /> {r.label}
                        </span>
                        <span className="text-[11px] font-mono text-slate-100">{r.value.toLocaleString()}</span>
                    </div>
                ))}
                {ledger.length === 0 && (
                    <div className="text-[10px] text-slate-600 italic px-1 leading-relaxed">
                        The ledger is blank. Chart a system, settle a world, sign a treaty — it starts writing itself.
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-700 mt-auto pt-2">
                <Fingerprint size={9} /> {saga.civilizationId ?? 'unaligned'}
            </div>
        </div>
    );
}

const PHASE_COPY: Record<EnlightenmentView['phase'], { label: string; tone: string }> = {
    inactive: { label: 'Not qualifying', tone: 'text-slate-400' },
    qualifying: { label: 'Qualifying', tone: 'text-sky-300' },
    transcending: { label: 'Transcending — the galaxy knows', tone: 'text-amber-300' },
    complete: { label: 'Transcendence achieved', tone: 'text-emerald-300' },
};

const ARCHIVE_STATE_COPY: Record<NonNullable<EnlightenmentCondition['state']>, string> = {
    operational: 'standing',
    building: 'under construction',
    ruined: 'ruined — repair it',
    none: 'not built',
};

function formatCondition(value: number | null, unit: EnlightenmentCondition['unit']): string {
    if (value === null) return '—';
    return unit === 'percent' ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;
}

function ConditionReading({ c }: { c: EnlightenmentCondition }) {
    const tone = c.passing ? 'text-emerald-300' : 'text-rose-300';
    if (c.unit === 'state') {
        return <span className={tone}>{ARCHIVE_STATE_COPY[c.state ?? 'none']}</span>;
    }
    return (
        <>
            <span className={tone}>{formatCondition(c.value, c.unit)}</span>
            <span className="text-slate-600"> {c.bound === 'min' ? '≥' : '≤'} {formatCondition(c.target, c.unit)}</span>
        </>
    );
}

function EnlightenmentSection({ view }: { view: EnlightenmentView }) {
    const phase = PHASE_COPY[view.phase];
    const passing = view.conditions.filter(c => c.passing).length;
    const running = view.phase === 'qualifying' || view.phase === 'transcending';

    return (
        <div className="flex flex-col gap-1">
            <SectionHeading icon={<Sun size={11} />}>Road to Enlightenment</SectionHeading>
            <div className="rounded border border-slate-800/60 bg-slate-900/40 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${phase.tone}`}>{phase.label}</span>
                    <span className="text-[11px] font-mono text-slate-400">{passing} / {view.conditions.length} met</span>
                </div>
                {running && (
                    <>
                        <div className="h-1 mt-2 rounded bg-slate-800 overflow-hidden">
                            <div
                                className={`h-full ${view.phase === 'transcending' ? 'bg-amber-400' : 'bg-sky-400'}`}
                                style={{ width: `${Math.round(view.stageProgress * 100)}%` }}
                            />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                            {view.stageRemaining} left if every condition holds.{' '}
                            {view.phase === 'qualifying'
                                ? `While any condition fails, the progress drains ${view.decayRate}× as fast as it grew.`
                                : `While any condition fails the window stops and strain builds; ${view.graceLength} of it breaks the attempt.`}
                        </div>
                        {view.slipping && (
                            <div className="text-[10px] text-rose-300 mt-1">
                                {view.phase === 'qualifying' ? 'Slipping — a condition is failing and progress is draining.' : 'Faltering — a condition is failing.'}
                            </div>
                        )}
                        {view.phase === 'transcending' && view.strain > 0 && (
                            <div className="h-1 mt-1 rounded bg-slate-800 overflow-hidden" title="Strain: the attempt breaks when this fills">
                                <div className="h-full bg-rose-500" style={{ width: `${Math.round(view.strain * 100)}%` }} />
                            </div>
                        )}
                    </>
                )}
                {view.phase === 'inactive' && (
                    <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                        Meet every condition at once and hold them for {view.qualificationLength}; then Transcendence begins, announced to the galaxy, and you must hold them {view.transcendenceLength} more while every rival service works against you.
                    </div>
                )}
                {view.interrupted && view.phase !== 'complete' && (
                    <div className="text-[10px] text-amber-300/80 mt-1">Your last Transcendence was broken; {view.retainPercent}% of the qualifying progress was kept.</div>
                )}
                {view.phase === 'complete' && Object.keys(view.granted).length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1">
                        Permanent: {Object.entries(view.granted).map(([k, v]) => `${k.replace(/_/g, ' ')} +${v}`).join(', ')}.
                    </div>
                )}
            </div>
            {view.phase !== 'complete' && view.conditions.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded bg-slate-900/30 border border-slate-800/60">
                    <span className="text-[11px] text-slate-300 flex items-center gap-2 min-w-0">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${c.passing ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                        <span className="truncate">{c.label}</span>
                    </span>
                    <span className="text-[11px] font-mono shrink-0">
                        <ConditionReading c={c} />
                    </span>
                </div>
            ))}
            {(view.rivalsTranscending.length > 0 || view.rivalsComplete.length > 0) && (
                <div className="text-[10px] text-slate-500 px-1 leading-relaxed">
                    {view.rivalsTranscending.length > 0 && <div className="text-amber-300/90">Transcending now: {view.rivalsTranscending.join(', ')}</div>}
                    {view.rivalsComplete.length > 0 && <div>Already transcended: {view.rivalsComplete.join(', ')}</div>}
                </div>
            )}
        </div>
    );
}

function EdgeRow({ edge }: { edge: SagaEdge }) {
    const st = EDGE_STYLES[edge.tone];
    return (
        <div className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded bg-slate-900/30 border ${st.border}`} title={edge.detail}>
            <div className="min-w-0">
                <div className={`text-[11px] ${st.label}`}>{edge.label}</div>
                {edge.detail && <div className="text-[9px] text-slate-600 truncate">{edge.detail}</div>}
            </div>
            <span className={`text-[11px] font-mono shrink-0 ${st.value}`}>{edge.value}</span>
        </div>
    );
}
