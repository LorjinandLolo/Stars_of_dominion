"use client";

// components/shell/LockedDockHint.tsx
// Stars of Dominion — the dock's "more to come" button.
//
// A new player's dock shows six buttons; the rest arrive with the first-week
// goals. This small lock button says how many are still to come, lists what
// each one waits on, and carries the "Show everything" switch for a player who
// would rather have every lever now.

import React from 'react';
import { Lock } from 'lucide-react';
import type { DockUnlock } from '@/lib/goals/dock-unlocks';
import { FIRST_WEEK_GOALS } from '@/lib/goals/first-week-goals';
import { patchUiPrefs } from '@/lib/player/use-ui-prefs';

const GOAL_TITLE = Object.fromEntries(FIRST_WEEK_GOALS.map((g, i) => [g.id, `Goal ${i + 1}: ${g.title}`]));

export default function LockedDockHint({ locked }: { locked: DockUnlock[] }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener('mousedown', close);
        return () => window.removeEventListener('mousedown', close);
    }, [open]);

    return (
        <div ref={ref} className="md:relative flex items-stretch shrink-0">
            <button
                id="dock-locked-hint"
                onClick={() => setOpen(o => !o)}
                className="relative flex flex-col items-center justify-center gap-1 px-3 lg:px-4 min-w-[52px] text-slate-500 hover:text-slate-200 transition-colors"
                title={`${locked.length} more to unlock as you play`}
            >
                <Lock size={16} />
                <span className="hidden lg:block text-[9px] font-display tracking-[0.18em]">+{locked.length}</span>
            </button>

            {/* On a phone the dock's category row scrolls sideways, and a
                scroller clips anything positioned inside it — so there the
                list is pinned above the dock, full width, instead of hanging
                off the button. 4.5rem clears the 4rem dock either way the
                browser resolves `fixed` under the dock's backdrop filter. */}
            {open && (
                <div className="fixed bottom-[4.5rem] inset-x-2 md:absolute md:bottom-full md:inset-x-auto md:mb-2 md:right-0 md:w-72 rounded-xl border border-slate-700/70 bg-slate-950/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-3 space-y-3">
                    <div>
                        <p className="text-[10px] font-display tracking-[0.2em] uppercase text-slate-400">More as you play</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Until then your advisors run these for you.
                        </p>
                    </div>
                    <ul className="space-y-1.5">
                        {locked.map(item => (
                            <li key={item.id} className="flex items-baseline justify-between gap-3">
                                <span className="text-[11px] font-semibold text-slate-200">{item.label}</span>
                                <span className="text-[10px] text-slate-500 text-right">{GOAL_TITLE[item.unlockedBy]}</span>
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={() => { void patchUiPrefs({ showEverything: true }); setOpen(false); }}
                        className="w-full min-h-[40px] rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 text-[11px] font-semibold transition-colors"
                    >
                        Show everything now
                    </button>
                </div>
            )}
        </div>
    );
}
