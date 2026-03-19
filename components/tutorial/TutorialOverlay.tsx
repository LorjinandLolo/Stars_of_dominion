'use client';
// components/tutorial/TutorialOverlay.tsx
// Stars of Dominion — Tutorial Spotlight Overlay
// Renders a backdrop with a spotlight cutout over the target element.

import React, { useEffect, useState, useCallback } from 'react';
import { useTutorialStore } from '@/lib/tutorial/tutorial-store';
import { useUIStore } from '@/lib/store/ui-store';
import { TUTORIAL_STEPS } from '@/lib/tutorial/tutorial-data';
import type { NavTab } from '@/types/ui-state';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface SpotlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

const CATEGORY_COLORS: Record<string, string> = {
    navigation: 'from-blue-600/80 to-blue-800/80',
    galaxy:     'from-indigo-600/80 to-indigo-800/80',
    economy:    'from-amber-600/80 to-amber-800/80',
    research:   'from-cyan-600/80 to-cyan-800/80',
    diplomacy:  'from-green-600/80 to-green-800/80',
    espionage:  'from-purple-600/80 to-purple-800/80',
    crisis:     'from-red-600/80 to-red-800/80',
    time:       'from-sky-600/80 to-sky-800/80',
    victory:    'from-yellow-600/80 to-yellow-800/80',
};

export default function TutorialOverlay() {
    const {
        isActive, currentStepIndex, totalSteps,
        next, prev, skip, isLastStep, currentStep, hasEverStarted
    } = useTutorialStore();
    const setActiveTab = useUIStore(s => s.setActiveTab);

    const [rect, setRect] = useState<SpotlightRect | null>(null);
    const step = currentStep();

    // Switch to required tab when step changes
    useEffect(() => {
        if (step?.requiredTab) {
            setActiveTab(step.requiredTab as NavTab);
        }
    }, [step?.id, setActiveTab]);

    // Find and track target element
    const updateRect = useCallback(() => {
        if (!step?.targetElementId) {
            setRect(null);
            return;
        }
        const el = document.getElementById(step.targetElementId);
        if (!el) { setRect(null); return; }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    }, [step?.targetElementId]);

    useEffect(() => {
        updateRect();
        const id = setInterval(updateRect, 300);
        window.addEventListener('resize', updateRect);
        return () => { clearInterval(id); window.removeEventListener('resize', updateRect); };
    }, [updateRect]);

    if (!isActive || !step) return null;

    const colorClass = CATEGORY_COLORS[step.category] ?? 'from-blue-600/80 to-blue-800/80';

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* Dark overlay */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-[1px] pointer-events-auto"
                onClick={skip}
            />

            {/* Spotlight cutout */}
            {rect && (
                <div
                    className="absolute rounded-xl ring-2 ring-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] transition-all duration-300 pointer-events-none"
                    style={{
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                    }}
                />
            )}

            {/* Tooltip Card */}
            <div
                className="absolute pointer-events-auto"
                style={getTooltipPosition(rect)}
            >
                <div className={`w-80 rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-black/80 bg-slate-950`}>
                    {/* Gradient header */}
                    <div className={`bg-gradient-to-r ${colorClass} px-5 py-4`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[9px] font-mono text-white/60 uppercase tracking-widest mb-1">
                                    Step {currentStepIndex + 1} of {totalSteps} · {step.category}
                                </p>
                                <h3 className="text-base font-display uppercase tracking-wider text-white">
                                    {step.title}
                                </h3>
                            </div>
                            <button
                                onClick={skip}
                                className="p-1.5 rounded-lg hover:bg-white/20 text-white/70 hover:text-white transition-colors"
                                title="Skip tutorial"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="px-5 py-4">
                        <p className="text-sm text-slate-300 leading-relaxed">{step.body}</p>
                    </div>

                    {/* Progress bar */}
                    <div className="px-5 pb-2">
                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
                        <button
                            onClick={prev}
                            disabled={currentStepIndex === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-display text-slate-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" /> Back
                        </button>

                        <button
                            onClick={skip}
                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                        >
                            Skip tutorial
                        </button>

                        <button
                            onClick={next}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-display bg-blue-600 hover:bg-blue-500 text-white transition-all"
                        >
                            {isLastStep() ? 'Finish' : 'Next'} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function getTooltipPosition(rect: SpotlightRect | null): React.CSSProperties {
    if (!rect) {
        // Center screen
        return {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
        };
    }

    const CARD_WIDTH  = 320;
    const CARD_HEIGHT = 280;
    const MARGIN      = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Try below
    if (rect.top + rect.height + CARD_HEIGHT + MARGIN < vh) {
        return { top: rect.top + rect.height + MARGIN, left: Math.min(rect.left, vw - CARD_WIDTH - MARGIN) };
    }
    // Try above
    if (rect.top - CARD_HEIGHT - MARGIN > 0) {
        return { top: rect.top - CARD_HEIGHT - MARGIN, left: Math.min(rect.left, vw - CARD_WIDTH - MARGIN) };
    }
    // Try right
    if (rect.left + rect.width + CARD_WIDTH + MARGIN < vw) {
        return { top: Math.max(MARGIN, rect.top), left: rect.left + rect.width + MARGIN };
    }
    // Fallback: left side
    return { top: Math.max(MARGIN, rect.top), left: Math.max(MARGIN, rect.left - CARD_WIDTH - MARGIN) };
}
