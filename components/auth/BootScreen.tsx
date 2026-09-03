"use client";

// components/auth/BootScreen.tsx
// The full-screen "you're in, hold on" overlay between login and the galaxy.
//
// Login → lobby → game used to be three silent page swaps: click, dark
// screen, map. Players read the dark screen as "did it take?". This shows the
// same checklist on every hop — identity verified, faction registered,
// galaxy synchronizing, uplink live — with one line per step so the player
// sees the claim landed before the map paints.

import React, { useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle, Circle } from 'lucide-react';

export type BootStepState = 'done' | 'active' | 'pending' | 'error';

export interface BootStep {
    label: string;
    state: BootStepState;
    /** One short line under the label — the faction name, a count, an error. */
    detail?: string;
}

export default function BootScreen({
    visible, title = 'Entering the galaxy', subtitle, steps, accent = '#f59e0b',
}: {
    visible: boolean;
    title?: string;
    subtitle?: string;
    steps: BootStep[];
    /** Faction colour once known; amber before that. */
    accent?: string;
}) {
    // Keep it mounted for the fade-out, then drop it so it can't eat clicks.
    // `closed` flips true 450ms after `visible` goes false; a re-show resets
    // it during render (the sanctioned "adjust state from props" pattern).
    const [closed, setClosed] = useState(!visible);
    if (visible && closed) setClosed(false);
    useEffect(() => {
        if (visible) return;
        const t = setTimeout(() => setClosed(true), 450);
        return () => clearTimeout(t);
    }, [visible]);
    if (!visible && closed) return null;

    const done = steps.filter(s => s.state === 'done').length;
    const errored = steps.find(s => s.state === 'error');
    const progress = steps.length ? Math.round((done / steps.length) * 100) : 0;

    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy={!errored && progress < 100}
            className={`fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {/* backdrop */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[38rem] h-[38rem] rounded-full blur-3xl opacity-20" style={{ background: accent }} />
                <div className="absolute inset-0 bg-[url('/grid-dark.svg')] bg-repeat opacity-30" />
                <div className="absolute inset-0 scanline-overlay opacity-[0.04]" />
            </div>

            <div className="relative w-full max-w-md mx-6">
                <div className="text-center mb-8">
                    <div className="text-[10px] font-mono uppercase tracking-[0.45em] text-slate-500 mb-3">Stars of Dominion</div>
                    <h1 className="text-2xl md:text-3xl font-display uppercase tracking-[0.18em] text-white">{title}</h1>
                    {subtitle && <p className="text-xs text-slate-400 mt-2">{subtitle}</p>}
                </div>

                <ol className="space-y-3">
                    {steps.map((step, i) => (
                        <li
                            key={i}
                            className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-all duration-500 ${
                                step.state === 'active' ? 'bg-white/[0.04] border-white/15'
                                : step.state === 'error' ? 'bg-rose-500/10 border-rose-500/40'
                                : step.state === 'done' ? 'bg-black/30 border-white/5'
                                : 'bg-black/20 border-white/5 opacity-50'
                            }`}
                            style={step.state === 'active' ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
                        >
                            <span className="mt-0.5 shrink-0">
                                {step.state === 'done' && <Check size={16} className="text-emerald-400" />}
                                {step.state === 'active' && <Loader2 size={16} className="animate-spin" style={{ color: accent }} />}
                                {step.state === 'pending' && <Circle size={14} className="text-slate-600 mt-0.5" />}
                                {step.state === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
                            </span>
                            <span className="min-w-0">
                                <span className={`block text-[11px] font-display uppercase tracking-[0.2em] ${
                                    step.state === 'done' ? 'text-slate-300' : step.state === 'error' ? 'text-rose-300' : step.state === 'active' ? 'text-white' : 'text-slate-500'
                                }`}>
                                    {step.label}
                                </span>
                                {step.detail && (
                                    <span className={`block text-[10px] mt-0.5 truncate ${step.state === 'error' ? 'text-rose-300/80' : 'text-slate-400'}`}>
                                        {step.detail}
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ol>

                <div className="mt-6 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progress}%`, background: errored ? '#f43f5e' : accent, boxShadow: `0 0 10px ${errored ? '#f43f5e' : accent}` }}
                    />
                </div>
                <div className="mt-2 flex justify-between text-[9px] font-mono uppercase tracking-widest text-slate-600">
                    <span>{errored ? 'Uplink fault' : progress >= 100 ? 'Uplink established' : 'Establishing uplink'}</span>
                    <span>{progress}%</span>
                </div>
            </div>
        </div>
    );
}
