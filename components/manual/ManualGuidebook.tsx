// components/manual/ManualGuidebook.tsx
'use client';

import React, { useRef, useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { MANUAL_DATA } from '@/lib/manual/manual-data';
import ManualSidebar from './ManualSidebar';
import ManualContentBlockRenderer from './ManualContentRenderer';
import { X, ChevronRight, Share2, Printer, Bookmark } from 'lucide-react';

export default function ManualGuidebook() {
    const { showManual, setShowManual, activeManualSectionId } = useUIStore();
    const contentRef = useRef<HTMLDivElement>(null);

    // Scroll to top when section changes
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [activeManualSectionId]);

    if (!showManual) return null;

    const section = MANUAL_DATA.find(s => s.id === activeManualSectionId);
    if (!section) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            {/* Backdrop close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setShowManual(false)} />

            {/* Main Window */}
            <div 
                className="relative w-full max-w-6xl h-full max-h-[85vh] bg-slate-950 border border-slate-800 rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Bar */}
                <div className="h-16 px-8 flex items-center justify-between bg-slate-900 border-b border-white/5 relative z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-slate-500">
                            <span className="text-[10px] font-mono tracking-widest uppercase">Archive</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-[10px] font-mono tracking-widest uppercase text-blue-400">Tactical Manual</span>
                        </div>
                        <div className="h-4 w-px bg-slate-700/50 mx-2" />
                        <h1 className="text-sm font-display uppercase tracking-[0.2em] text-white font-bold">
                            Stars of Dominion — Strategic Guidebook
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex gap-2 mr-4 border-r border-slate-700/50 pr-4">
                            <button className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Bookmark Section">
                                <Bookmark className="w-4 h-4" />
                            </button>
                            <button className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Share Transmission">
                                <Share2 className="w-4 h-4" />
                            </button>
                            <button className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all" title="Print Archive">
                                <Printer className="w-4 h-4" />
                            </button>
                        </div>
                        <button 
                            onClick={() => setShowManual(false)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-white transition-all group"
                        >
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                {/* Body Layout */}
                <div className="flex-1 flex overflow-hidden">
                    <ManualSidebar />

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-[#0a0c10]">
                        <div 
                            ref={contentRef}
                            className="flex-1 overflow-y-auto px-12 py-10 custom-scrollbar-rich scroll-smooth"
                        >
                            {/* Section Header */}
                            <div className="mb-12 border-b border-white/5 pb-8">
                                <div className="text-[10px] font-mono text-blue-500 uppercase tracking-[0.5em] mb-3">
                                    Strategic Node: {section.id.toUpperCase()}
                                </div>
                                <h2 className="text-4xl font-display uppercase tracking-tight text-white mb-4 bg-gradient-to-r from-white to-slate-500 bg-clip-text text-transparent">
                                    {section.title}
                                </h2>
                                {section.introduction && (
                                    <p className="text-lg text-slate-400 leading-relaxed font-light max-w-3xl border-l-2 border-blue-600/30 pl-6 py-2">
                                        {section.introduction}
                                    </p>
                                )}
                            </div>

                            {/* Subsections */}
                            <div className="space-y-16 pb-20">
                                {section.subsections.map((sub) => (
                                    <div key={sub.id} className="relative">
                                        <h3 className="text-lg font-display uppercase tracking-widest text-blue-200 mb-8 flex items-center gap-4 group">
                                            <div className="w-8 h-px bg-blue-600/30 group-hover:w-12 transition-all duration-300" />
                                            {sub.title}
                                        </h3>
                                        <div className="max-w-3xl space-y-2">
                                            {sub.blocks.map((block, i) => (
                                                <ManualContentBlockRenderer key={i} block={block} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer Info */}
                        <div className="h-10 px-8 flex items-center justify-between bg-slate-950/80 border-t border-white/5 text-[9px] font-mono text-slate-600 uppercase tracking-widest">
                            <div className="flex items-center gap-4">
                                <span>Status: ONLINE</span>
                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                <span className="opacity-50">Local Access Only</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span>Page: {MANUAL_DATA.indexOf(section) + 1} / {MANUAL_DATA.length}</span>
                                <span className="opacity-50">End Transmission</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
