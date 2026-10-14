"use client";

// components/goals/GoalCard.tsx
// Stars of Dominion — the first-week goal, on the map.
//
// A small card above the Command Dock: which of the first-week goals the
// player is on, how far along, one line of hint, how long it takes, and a
// button that opens the panel that does it. Once the goal's work is under way
// (warships on the slip, a survey running, a station in orbit) the card counts
// it down and says what is worth doing meanwhile, because builds take real
// time. It collapses to a pill and remembers that per browser. Gone once every
// goal is done — depth players never see it again.

import React from 'react';
import { Target, ChevronDown, ChevronUp, Check, Hourglass, Clock } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { followGoalLink } from '@/lib/goals/follow-goal-link';
import { unlocksForGoal } from '@/lib/goals/dock-unlocks';
import { formatSimAsClock } from '@/lib/time/galactic-time';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';

/**
 * The sim clock, moving between syncs. The store's nowSeconds only changes
 * when a snapshot lands, so a countdown read from it jumps in 15x steps; this
 * runs it forward from the moment the snapshot arrived, once a second, and
 * only while something is being counted down.
 */
function useLiveSimNow(active: boolean): number {
    const synced = useUIStore(s => s.nowSeconds);
    const [receivedAt, setReceivedAt] = React.useState(() => Date.now());
    const [, setTick] = React.useState(0);
    React.useEffect(() => { setReceivedAt(Date.now()); }, [synced]);
    React.useEffect(() => {
        if (!active) return;
        const id = window.setInterval(() => setTick(t => t + 1), 1000);
        return () => window.clearInterval(id);
    }, [active]);
    return synced + ((Date.now() - receivedAt) / 1000) * SIM_SECONDS_PER_REAL_SECOND;
}

const COLLAPSE_KEY = 'sod-goal-card-collapsed';

function readCollapsed(): boolean {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(value: boolean): void {
    try { window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch { /* private window */ }
}

export default function GoalCard() {
    const current = useUIStore(s => s.firstWeekGoal);
    const activeTab = useUIStore(s => s.activeTab);
    const briefOpen = useUIStore(s => s.briefOpen);
    // The selected-system panel and the build panel both occupy the left edge
    // the card sits on; while either is open it IS where the goal gets done.
    const systemPanelOpen = useUIStore(s => !!(s.selectedSystemId || s.systemViewId || s.constructionPlanetId));
    const showEverything = useUIStore(s => s.uiPrefs?.showEverything ?? true);
    const nowSeconds = useLiveSimNow(!!current?.waiting);
    const [collapsed, setCollapsed] = React.useState(false);

    React.useEffect(() => { setCollapsed(readCollapsed()); }, []);

    // Only over the open map: every panel already has the player's attention.
    if (!current || activeTab !== 'galaxy' || briefOpen || systemPanelOpen) return null;

    const { goal, number, total, progress, deepLink, waiting } = current;
    const remaining = waiting ? formatSimAsClock(waiting.completesAt - nowSeconds, 'any moment') : null;
    // What finishing it adds to the dock — shown only while it is still locked.
    const unlocks = showEverything ? [] : unlocksForGoal(goal.id);
    const toggle = () => {
        setCollapsed(prev => {
            writeCollapsed(!prev);
            return !prev;
        });
    };

    return (
        // Phone: full width above the dock. Wider: a 20rem card in the corner.
        <div id="goal-card" className="fixed left-2 right-2 sm:left-4 sm:right-auto bottom-[4.5rem] sm:bottom-20 z-40 sm:w-[20rem]">
            <div className="rounded-xl border border-sky-500/30 bg-slate-950/90 backdrop-blur-md shadow-xl shadow-black/50">
                <button
                    onClick={toggle}
                    className="w-full min-h-[40px] flex items-center justify-between gap-2 px-3 py-2 text-left"
                    title={collapsed ? 'Show this goal' : 'Tuck it away'}
                >
                    <span className="flex items-center gap-2 min-w-0">
                        <Target size={13} className="text-sky-400 shrink-0" />
                        <span className="text-[9px] font-display tracking-[0.18em] uppercase text-sky-300 shrink-0">
                            Goal {number}/{total}
                        </span>
                        {collapsed && (
                            <span className="text-[11px] text-slate-200 truncate">
                                {waiting ? `${waiting.label} · ${remaining}` : goal.title}
                            </span>
                        )}
                    </span>
                    {collapsed ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </button>

                {!collapsed && (
                    <div className="px-3 pb-3 space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-white leading-snug">{goal.title}</p>
                            {goal.target > 1 && (
                                <span className="text-[10px] font-mono text-sky-300 whitespace-nowrap">{progress}/{goal.target}</span>
                            )}
                        </div>
                        {/* One pip per goal: done, current, ahead. */}
                        <div className="flex gap-1" aria-label={`Goal ${number} of ${total}`}>
                            {Array.from({ length: total }, (_, i) => (
                                <span
                                    key={i}
                                    className={`h-1 flex-1 rounded-full ${
                                        i < number - 1 ? 'bg-emerald-500' : i === number - 1 ? 'bg-sky-400' : 'bg-slate-700'
                                    }`}
                                />
                            ))}
                        </div>
                        {waiting ? (
                            // Under way: the countdown replaces the instructions, and
                            // "meanwhile" says what to do instead of watching it.
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 space-y-1">
                                <p className="flex items-center justify-between gap-2 text-[11px] text-amber-100">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                        <Hourglass size={12} className="text-amber-300 shrink-0" />
                                        <span className="truncate">{waiting.label}</span>
                                    </span>
                                    <span className="font-mono text-amber-300 whitespace-nowrap">{remaining}</span>
                                </p>
                                <p className="text-[11px] text-slate-300 leading-relaxed">
                                    <span className="text-amber-300/90 font-semibold">Meanwhile: </span>{goal.meanwhile}
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-[11px] text-slate-400 leading-relaxed">{goal.hint}</p>
                                <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <Clock size={11} className="shrink-0" /> {goal.takes}
                                </p>
                            </>
                        )}
                        {unlocks.length > 0 && (
                            <p className="text-[10px] font-mono text-amber-300/90">
                                Unlocks {unlocks.map(u => u.label).join(' + ')}
                            </p>
                        )}
                        <button
                            onClick={() => followGoalLink(deepLink)}
                            className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5"
                        >
                            {number > 1 && <Check size={12} className="text-emerald-400" />}
                            {deepLink.label}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
