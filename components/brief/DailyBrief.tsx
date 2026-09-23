"use client";

// components/brief/DailyBrief.tsx
// Stars of Dominion — the daily brief.
//
// The first thing a returning player sees: what happened, what is waiting on
// their answer, and one thing worth doing. It opens itself once per sign-in
// when it has something to say, and lives behind the BRIEF button in TopNav
// afterwards. The bell keeps the raw log; this is the readable version.
//
// The shaping is all server-side (lib/brief/daily-brief.ts). This component
// renders plain data and dispatches the orders the projection named — it never
// decides what counts as news.

import React from 'react';
import { X, ArrowRight, Clock, Check } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import type { NavTab } from '@/types/ui-state';
import type { BriefAction, BriefDecision, DailyBrief as DailyBriefData } from '@/lib/brief/brief-types';

/** Real seconds left, counted down from when the brief was built. */
function secondsLeft(brief: DailyBriefData, decision: BriefDecision): number | null {
    if (!decision.deadline) return null;
    const elapsed = (Date.now() - Date.parse(brief.generatedAt)) / 1000;
    return decision.deadline.realSecondsLeft - elapsed;
}

function countdown(seconds: number | null): string {
    if (seconds === null) return '';
    if (seconds <= 0) return 'expired';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return 'under a minute left';
    if (minutes < 60) return `${minutes}m left`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m left` : `${hours}h left`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day left' : `${days} days left`;
}

function whenLine(at: string): string {
    const delta = (Date.now() - Date.parse(at)) / 1000;
    if (delta < 3600) return `${Math.max(1, Math.floor(delta / 60))}m ago`;
    if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`;
    const days = Math.floor(delta / 86_400);
    return days === 1 ? 'yesterday' : `${days} days ago`;
}

const TONE_CLASS: Record<BriefAction['tone'], string> = {
    accept: 'bg-emerald-600/80 hover:bg-emerald-500/80 text-white border-emerald-400/30',
    decline: 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border-slate-600/40',
    open: 'bg-transparent hover:bg-sky-500/10 text-sky-300 border-sky-500/30',
};

export default function DailyBrief() {
    const briefOpen = useUIStore(s => s.briefOpen);
    const setBriefOpen = useUIStore(s => s.setBriefOpen);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const playerFactionId = useUIStore(s => s.playerFactionId);

    const [brief, setBrief] = React.useState<DailyBriefData | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [answered, setAnswered] = React.useState<Record<string, string>>({});
    const autoOpenedRef = React.useRef(false);
    // Re-render once a minute so the countdowns stay honest.
    const [, setPulse] = React.useState(0);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/game/brief', { cache: 'no-store' });
            const data = await res.json();
            if (data?.brief) setBrief(data.brief as DailyBriefData);
        } catch (e) {
            console.warn('[DailyBrief] could not load the brief:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // One fetch per sign-in. It opens itself only when there is something to
    // read or answer — a quiet galaxy should not interrupt anyone.
    React.useEffect(() => {
        if (!playerFactionId) return;
        load();
    }, [playerFactionId, load]);

    React.useEffect(() => {
        if (!brief || autoOpenedRef.current) return;
        autoOpenedRef.current = true;
        if (!brief.empty) setBriefOpen(true);
    }, [brief, setBriefOpen]);

    React.useEffect(() => {
        if (!briefOpen) return;
        const id = setInterval(() => setPulse(p => p + 1), 60_000);
        return () => clearInterval(id);
    }, [briefOpen]);

    // Opening it by hand always shows the latest.
    React.useEffect(() => {
        if (briefOpen && !loading && autoOpenedRef.current) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [briefOpen]);

    const runAction = async (key: string, action: BriefAction) => {
        if (action.openTab) {
            setActiveTab(action.openTab as NavTab);
            setBriefOpen(false);
            return;
        }
        if (!action.actionId || !playerFactionId) return;
        setAnswered(prev => ({ ...prev, [key]: action.label }));
        const result = await dispatchOrder({
            actionId: action.actionId,
            payload: action.payload ?? {},
            factionId: playerFactionId,
        });
        if (!result.success) {
            setAnswered(prev => ({ ...prev, [key]: `failed: ${result.error ?? 'refused'}` }));
        }
    };

    const close = async () => {
        setBriefOpen(false);
        try {
            await fetch('/api/game/brief', { method: 'POST' });
        } catch (e) {
            console.warn('[DailyBrief] could not mark the brief seen:', e);
        }
    };

    if (!briefOpen) return null;

    const nextTickMinutes = brief ? Math.max(1, Math.round(brief.nextTickInSeconds / 60)) : null;

    return (
        <div className="fixed inset-0 z-[9000] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-10 px-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-950/95 shadow-2xl shadow-black/60">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-800/80">
                    <div>
                        <p className="text-[10px] font-display uppercase tracking-[0.25em] text-sky-400 mb-1">Daily brief</p>
                        <h2 className="text-2xl font-display uppercase tracking-wider text-white leading-tight">
                            {brief?.empty ? 'Nothing needs you today' : 'While you were away'}
                        </h2>
                        {nextTickMinutes !== null && (
                            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                                <Clock size={11} /> Next cycle in {nextTickMinutes} minute{nextTickMinutes === 1 ? '' : 's'}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={close}
                        className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
                        title="Close the brief"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loading && !brief && (
                    <div className="px-6 py-10 text-center text-xs font-mono text-slate-500 animate-pulse">
                        READING THE DISPATCHES...
                    </div>
                )}

                {brief && (
                    <div className="px-6 py-5 space-y-7">
                        {/* ── What happened ─────────────────────────────── */}
                        {brief.happened.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-slate-500 mb-3">
                                    What happened
                                </h3>
                                <ul className="space-y-2">
                                    {brief.happened.map(line => (
                                        <li key={line.id} className="flex gap-3 text-sm text-slate-200 leading-relaxed">
                                            <span
                                                className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                                    line.urgent ? 'bg-red-500' : line.source === 'headline' ? 'bg-amber-400' : 'bg-slate-600'
                                                }`}
                                            />
                                            <span className="flex-1">
                                                {line.text}
                                                <span className="text-[10px] text-slate-600 ml-2 font-mono">{whenLine(line.at)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* ── Decisions waiting ─────────────────────────── */}
                        {brief.decisions.length > 0 && (
                            <section>
                                <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-slate-500 mb-3">
                                    Decisions waiting ({brief.decisions.length})
                                </h3>
                                <div className="space-y-3">
                                    {brief.decisions.map(decision => {
                                        const left = secondsLeft(brief, decision);
                                        const urgent = left !== null && left < 3600;
                                        return (
                                            <div
                                                key={decision.id}
                                                className={`rounded-xl border p-4 ${
                                                    urgent ? 'border-red-500/40 bg-red-950/20' : 'border-slate-700/60 bg-slate-900/60'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3 mb-1.5">
                                                    <p className="text-sm font-semibold text-white leading-snug">{decision.title}</p>
                                                    {left !== null && (
                                                        <span className={`text-[10px] font-mono whitespace-nowrap ${urgent ? 'text-red-400' : 'text-slate-500'}`}>
                                                            {countdown(left)}
                                                        </span>
                                                    )}
                                                </div>
                                                {decision.detail && (
                                                    <p className="text-xs text-slate-400 leading-relaxed mb-3">{decision.detail}</p>
                                                )}
                                                {answered[decision.id] ? (
                                                    <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                                                        <Check size={12} /> {answered[decision.id]}
                                                    </p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2">
                                                        {decision.actions.map((action, i) => (
                                                            <button
                                                                key={`${decision.id}-${i}`}
                                                                onClick={() => runAction(decision.id, action)}
                                                                className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${TONE_CLASS[action.tone]}`}
                                                            >
                                                                {action.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* ── One suggested move ────────────────────────── */}
                        {brief.suggestion && (
                            <section>
                                <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-slate-500 mb-3">
                                    One thing worth doing
                                </h3>
                                <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
                                    <p className="text-sm font-semibold text-white mb-1">{brief.suggestion.title}</p>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-3">{brief.suggestion.detail}</p>
                                    {answered['suggestion'] ? (
                                        <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                                            <Check size={12} /> {answered['suggestion']}
                                        </p>
                                    ) : (
                                        <button
                                            onClick={() => runAction('suggestion', brief.suggestion!.action)}
                                            className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${TONE_CLASS[brief.suggestion.action.tone]}`}
                                        >
                                            {brief.suggestion.action.label}
                                        </button>
                                    )}
                                </div>
                            </section>
                        )}

                        {brief.empty && (
                            <p className="text-sm text-slate-400 leading-relaxed">
                                The galaxy kept turning without you and nothing needs an answer. Your empire keeps
                                producing, building and researching while you are away.
                            </p>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800/80">
                    <p className="text-[10px] text-slate-600 font-mono">
                        {brief?.since ? `Since ${new Date(brief.since).toLocaleString()}` : 'Your first brief'}
                    </p>
                    <button
                        onClick={close}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-bold transition-colors"
                    >
                        Done <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
