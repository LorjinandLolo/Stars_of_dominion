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
import { X, ArrowRight, Clock, Check, Share2 } from 'lucide-react';
import { shareCardText, type ShareCard } from '@/lib/gazette/public-gazette';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import type { NavTab } from '@/types/ui-state';
import type { BriefAction, BriefDecision, DailyBrief as DailyBriefData } from '@/lib/brief/brief-types';
import { formatRealAgo, formatRealDeadline } from '@/lib/time/galactic-time';
import { followGoalLink } from '@/lib/goals/follow-goal-link';
import { useTutorialStore } from '@/lib/tutorial/tutorial-store';

/** Real seconds left, counted down from when the brief was built. */
function secondsLeft(brief: DailyBriefData, decision: BriefDecision): number | null {
    if (!decision.deadline) return null;
    const elapsed = (Date.now() - Date.parse(brief.generatedAt)) / 1000;
    return decision.deadline.realSecondsLeft - elapsed;
}

/** "closes today at 18:40" / "closes tomorrow at 09:15" / "closes in 3 days". */
function countdown(seconds: number | null): string {
    if (seconds === null) return '';
    const label = formatRealDeadline(seconds);
    return label === 'expired' ? 'expired' : `closes ${label}`;
}

/** "today, 14:05" / "yesterday" / "3 days ago" — the player's calendar, never cycles. */
function whenLine(at: string): string {
    const words = formatRealAgo(at);
    if (words !== 'today') return words;
    const clock = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `today, ${clock}`;
}

/** Every button that answers something: 40 px tall, a thumb's width apart. */
const ACTION_BUTTON = 'min-h-[40px] px-4 rounded-lg border text-xs font-semibold transition-colors';

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
    const setDiplomacyFocusId = useUIStore(s => s.setDiplomacyFocusId);

    const [brief, setBrief] = React.useState<DailyBriefData | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [answered, setAnswered] = React.useState<Record<string, string>>({});
    // "Share today": the public card the server built, and the text last copied.
    const [share, setShare] = React.useState<ShareCard | null>(null);
    const [shared, setShared] = React.useState<{ text: string; copied: boolean } | null>(null);
    const autoOpenedRef = React.useRef(false);
    const tutorialActive = useTutorialStore(s => s.isActive);
    const tutorialEverStarted = useTutorialStore(s => s.hasEverStarted);
    // Re-render once a minute so the countdowns stay honest.
    const [, setPulse] = React.useState(0);

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/game/brief', { cache: 'no-store' });
            const data = await res.json();
            if (data?.brief) setBrief(data.brief as DailyBriefData);
            setShare((data?.share as ShareCard | null) ?? null);
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
        // A first-time player gets the three-step tour first (it auto-starts
        // 1.5 s after login and ends by pointing at the BRIEF button); the
        // brief waits for it instead of opening underneath it.
        if (tutorialActive || !tutorialEverStarted) return;
        autoOpenedRef.current = true;
        if (!brief.empty) setBriefOpen(true);
    }, [brief, setBriefOpen, tutorialActive, tutorialEverStarted]);

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
        if (action.deepLink) {
            followGoalLink(action.deepLink);
            setBriefOpen(false);
            return;
        }
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

    /** Open DIPLOMACY on the empire that wrote, where the message box is. */
    const replyTo = (factionId: string) => {
        setDiplomacyFocusId(factionId);
        setActiveTab('diplomacy' as NavTab);
        setBriefOpen(false);
    };

    /**
     * Copy the public card: season, day, one published headline about the
     * player's empire, and a link to its page in the open gazette. The text is
     * shown as well, so a browser that refuses the clipboard still leaves
     * something to select.
     */
    const shareToday = async () => {
        if (!share) return;
        const text = shareCardText(share, window.location.origin);
        let copied = false;
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch {
            // navigator.clipboard only exists on https and localhost; a LAN
            // playtest over plain http lands here. The old way still works.
            try {
                const area = document.createElement('textarea');
                area.value = text;
                area.setAttribute('readonly', '');
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                copied = document.execCommand('copy');
                document.body.removeChild(area);
            } catch {
                copied = false;
            }
        }
        setShared({ text, copied });
    };

    const close = async () => {
        setShared(null);
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
        <div id="daily-brief" className="fixed inset-0 z-[9000] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto overflow-x-hidden py-3 px-2 sm:py-10 sm:px-4">
            <div className="w-full max-w-2xl min-w-0 rounded-2xl border border-slate-700/60 bg-slate-950/95 shadow-2xl shadow-black/60">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800/80">
                    <div className="min-w-0">
                        <p className="text-[10px] font-display uppercase tracking-[0.25em] text-sky-400 mb-1">Daily brief</p>
                        <h2 className="text-lg sm:text-2xl font-display uppercase tracking-wider text-white leading-tight">
                            {brief?.empty ? 'Nothing needs you today' : 'While you were away'}
                        </h2>
                        {nextTickMinutes !== null && (
                            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                                <Clock size={11} /> Next cycle in {nextTickMinutes} minute{nextTickMinutes === 1 ? '' : 's'}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {share && (
                            <button
                                id="share-today"
                                onClick={shareToday}
                                title="Copy a card for your friends: the season, the day and a headline about your empire"
                                className="flex items-center gap-2 min-h-[40px] px-3 rounded-lg border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 text-xs font-bold transition-colors whitespace-nowrap"
                            >
                                <Share2 size={14} />
                                <span className="sm:hidden">Share</span>
                                <span className="hidden sm:inline">Share today</span>
                            </button>
                        )}
                        <button
                            onClick={close}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/60 transition-colors"
                            title="Close the brief"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* What "Share today" copied — public gazette material only. */}
                {shared && (
                    <div id="share-card" className="mx-4 sm:mx-6 mt-5 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
                        <p className="text-[10px] font-mono text-emerald-400 mb-2 flex items-center gap-1.5">
                            <Check size={12} />
                            {shared.copied ? 'Copied. Paste it anywhere.' : 'Select and copy:'}
                        </p>
                        <pre className="text-xs text-slate-200 whitespace-pre-wrap break-words font-sans select-all">{shared.text}</pre>
                    </div>
                )}

                {loading && !brief && (
                    <div className="px-6 py-10 text-center text-xs font-mono text-slate-500 animate-pulse">
                        READING THE DISPATCHES...
                    </div>
                )}

                {brief && (
                    <div className="px-4 sm:px-6 py-5 space-y-7">
                        {/* ── Messages from other players ───────────────── */}
                        {(brief.messages?.length ?? 0) > 0 && (
                            <section id="brief-messages">
                                <h3 className="text-[10px] font-display uppercase tracking-[0.2em] text-slate-500 mb-3">
                                    Messages ({brief.messages.length})
                                </h3>
                                <div className="space-y-3">
                                    {brief.messages.map(message => (
                                        <div key={message.id} className="brief-message rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4">
                                            <div className="flex items-start justify-between gap-3 mb-1.5">
                                                <p className="text-[10px] font-mono text-emerald-300/90">{message.from}</p>
                                                <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">{whenLine(message.at)}</span>
                                            </div>
                                            {/* A text node: whatever was typed is shown as typed. */}
                                            <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap break-words mb-3">
                                                {message.body}
                                            </p>
                                            {message.earlier > 0 && (
                                                <p className="text-[10px] font-mono text-slate-500 -mt-2 mb-3">
                                                    and {message.earlier} earlier message{message.earlier === 1 ? '' : 's'}
                                                </p>
                                            )}
                                            <button
                                                onClick={() => replyTo(message.fromFactionId)}
                                                className={`${ACTION_BUTTON} ${TONE_CLASS.open}`}
                                            >
                                                Reply
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

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
                                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 mb-1.5">
                                                    <p className="text-sm font-semibold text-white leading-snug break-words min-w-0">{decision.title}</p>
                                                    {left !== null && (
                                                        <span className={`text-[10px] font-mono whitespace-nowrap ${urgent ? 'text-red-400' : 'text-slate-500'}`}>
                                                            {countdown(left)}
                                                        </span>
                                                    )}
                                                </div>
                                                {decision.counterparts && decision.counterparts.length > 0 && (
                                                    <p className="decision-counterparts text-[10px] font-mono text-slate-500 mb-1.5">
                                                        {decision.counterparts.join('  vs  ')}
                                                    </p>
                                                )}
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
                                                                className={`${ACTION_BUTTON} ${TONE_CLASS[action.tone]}`}
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
                                    {brief.suggestion.goal
                                        ? `First-week goal ${brief.suggestion.goal.number} of ${brief.suggestion.goal.total}`
                                        : 'One thing worth doing'}
                                </h3>
                                <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
                                    <div className="flex items-baseline justify-between gap-3 mb-1">
                                        <p className="text-sm font-semibold text-white">{brief.suggestion.title}</p>
                                        {brief.suggestion.goal && brief.suggestion.goal.target > 1 && (
                                            <span className="text-[10px] font-mono text-sky-300 whitespace-nowrap">
                                                {brief.suggestion.goal.progress}/{brief.suggestion.goal.target}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-3">{brief.suggestion.detail}</p>
                                    {answered['suggestion'] ? (
                                        <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                                            <Check size={12} /> {answered['suggestion']}
                                        </p>
                                    ) : (
                                        <button
                                            onClick={() => runAction('suggestion', brief.suggestion!.action)}
                                            className={`${ACTION_BUTTON} ${TONE_CLASS[brief.suggestion.action.tone]}`}
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
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-800/80">
                    <p className="text-[10px] text-slate-600 font-mono min-w-0">
                        {brief?.since ? `Since ${new Date(brief.since).toLocaleString()}` : 'Your first brief'}
                    </p>
                    <button
                        onClick={close}
                        className="flex items-center gap-2 min-h-[40px] px-4 shrink-0 rounded-lg bg-sky-600/80 hover:bg-sky-500/80 text-white text-xs font-bold transition-colors"
                    >
                        Done <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
