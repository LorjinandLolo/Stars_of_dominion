"use client";

// components/tutorial/PanelTip.tsx
// Stars of Dominion — the first-visit tip for a big panel.
//
// A small card in the lower right the first time a player opens Government,
// Espionage, Economy, the War Room, Diplomacy, Saga or the Ship Designer
// (lib/tutorial/panel-tips.ts). "Got it" remembers it in the player's prefs,
// so it never comes back on any device. Waits while the guided tour runs, and
// sits beneath the first-open advisor prompt, so only one thing talks at once.

import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { useTutorialStore } from '@/lib/tutorial/tutorial-store';
import { patchUiPrefs } from '@/lib/player/use-ui-prefs';
import { panelTipFor, panelTipPrefId } from '@/lib/tutorial/panel-tips';

export default function PanelTip() {
    const activeTab = useUIStore(s => s.activeTab);
    const uiPrefs = useUIStore(s => s.uiPrefs);
    const observer = useUIStore(s => s.observer);
    const tourActive = useTutorialStore(s => s.isActive);

    const tip = panelTipFor(activeTab);
    // Prefs not loaded yet: say nothing rather than flash a tip already dismissed.
    if (!tip || !uiPrefs || observer || tourActive) return null;
    const prefId = panelTipPrefId(tip.tab);
    if (uiPrefs.opened.includes(prefId)) return null;

    const dismiss = () => { void patchUiPrefs({ opened: [prefId] }); };

    return (
        <div
            id="panel-tip"
            role="note"
            className="fixed right-2 left-2 sm:left-auto sm:right-4 bottom-[4.5rem] sm:bottom-20 z-[60] sm:w-[22rem] rounded-xl border border-amber-400/40 bg-slate-950/95 backdrop-blur-md shadow-xl shadow-black/60"
        >
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                <span className="flex items-center gap-1.5 text-[10px] font-display uppercase tracking-[0.2em] text-amber-300">
                    <Lightbulb size={12} /> First time here · {tip.title}
                </span>
                <button onClick={dismiss} aria-label="Dismiss tip" className="text-slate-500 hover:text-slate-200 transition-colors">
                    <X size={14} />
                </button>
            </div>
            <ul className="px-3 pt-2 pb-1 space-y-1.5">
                {tip.lines.map((line, i) => (
                    <li key={i} className="text-[11px] text-slate-300 leading-relaxed">{line}</li>
                ))}
            </ul>
            <div className="px-3 pb-3 pt-1 flex gap-2">
                <button
                    onClick={() => { const s = useUIStore.getState(); s.setActiveManualSection(tip.manual); s.setShowManual(true); }}
                    className="flex-1 min-h-[36px] rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 text-[11px] font-semibold transition-colors"
                >
                    Read more
                </button>
                <button
                    onClick={dismiss}
                    className="flex-1 min-h-[36px] rounded-lg border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-[11px] font-semibold transition-colors"
                >
                    Got it
                </button>
            </div>
        </div>
    );
}
