'use client';
// components/tutorial/TutorialLauncher.tsx
// Stars of Dominion — the ? button in the top bar.
// Auto-starts the "Your screen" tour on first login; afterwards it opens a
// small menu: any tour (lib/tutorial/tutorial-data.ts TOURS), this panel's
// tip again, or the guidebook.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Check, BookOpen, Lightbulb } from 'lucide-react';
import { useTutorialStore } from '@/lib/tutorial/tutorial-store';
import { TOURS, TOUR_IDS } from '@/lib/tutorial/tutorial-data';
import { panelTipFor } from '@/lib/tutorial/panel-tips';
import { useUIStore } from '@/lib/store/ui-store';

export default function TutorialLauncher() {
    const { start, startTour, hasEverStarted, isActive, finishedTours, replayTip } = useTutorialStore();
    const activeTab = useUIStore(s => s.activeTab);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    // The top bar is its own stacking context, under the map's overlay bar: the
    // menu goes to <body>, pinned under the button.
    const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

    // Auto-start on first ever launch
    useEffect(() => {
        if (!hasEverStarted) {
            // Small delay so the UI settles first
            const t = setTimeout(() => start(), 1500);
            return () => clearTimeout(t);
        }
    }, [hasEverStarted, start]);

    // A click anywhere else closes the menu.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
        };
        window.addEventListener('mousedown', onDown);
        return () => window.removeEventListener('mousedown', onDown);
    }, [open]);

    const tip = panelTipFor(activeTab);
    const item = 'w-full flex items-start gap-2 px-3 py-2 text-left rounded-lg hover:bg-white/5 transition-colors';

    return (
        <div ref={ref} className="relative">
            <button
                id="tutorial-launcher"
                onClick={() => {
                    if (isActive) return;
                    const r = ref.current?.getBoundingClientRect();
                    if (r) setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
                    setOpen(o => !o);
                }}
                title="Tours and help"
                className={`relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-300 ${
                    isActive || open
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                        : 'bg-white/5 border-white/10 hover:border-white/30 text-slate-500 hover:text-white'
                }`}
            >
                <HelpCircle className="w-4 h-4" />
                {/* A dot while there is a tour the player has not finished. */}
                {TOUR_IDS.some(id => !finishedTours?.includes(id)) && !isActive && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400" />
                )}
            </button>
            {open && anchor && createPortal(
                <div ref={menuRef} style={{ top: anchor.top, right: anchor.right }} className="fixed z-[9000] w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/70 p-1.5">
                    <div className="px-3 pt-1.5 pb-1 text-[9px] font-display uppercase tracking-[0.2em] text-slate-500">Guided tours</div>
                    {TOUR_IDS.map(id => (
                        <button key={id} className={item} onClick={() => { setOpen(false); startTour(id); }}>
                            <span className="mt-0.5 w-3.5 shrink-0 text-emerald-400">{finishedTours?.includes(id) && <Check className="w-3.5 h-3.5" />}</span>
                            <span>
                                <span className="block text-xs font-semibold text-slate-100">{TOURS[id].title}</span>
                                <span className="block text-[11px] text-slate-400">{TOURS[id].blurb}</span>
                            </span>
                        </button>
                    ))}
                    <div className="my-1 h-px bg-slate-800" />
                    {tip && (
                        <button className={item} onClick={() => { setOpen(false); replayTip(tip.tab); }}>
                            <Lightbulb className="mt-0.5 w-3.5 h-3.5 shrink-0 text-amber-300" />
                            <span className="text-xs text-slate-200">About this panel: {tip.title}</span>
                        </button>
                    )}
                    <button className={item} onClick={() => { setOpen(false); useUIStore.getState().setShowManual(true); }}>
                        <BookOpen className="mt-0.5 w-3.5 h-3.5 shrink-0 text-sky-300" />
                        <span className="text-xs text-slate-200">Open the guidebook</span>
                    </button>
                </div>,
                document.body,
            )}
        </div>
    );
}
