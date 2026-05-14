"use client";

import React, { useState, useEffect, startTransition } from 'react';
import { 
    Settings, 
    FastForward, 
    Calendar, 
    Coins, 
    Zap, 
    AlertCircle, 
    X,
    Terminal,
    ChevronRight,
    RefreshCw,
    Shield
} from 'lucide-react';
// import { triggerTickAction, forceEndSeasonAction, injectResourcesAction, pingAction } from '@/app/actions/debug';
import { useUIStore } from '@/lib/store/ui-store';

export default function DevToolbox() {
    const [isOpen, setIsOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const { playerState } = useUIStore();

    // Toggle with Ctrl+D
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const callDebugApi = async (action: string, payload: any = {}) => {
        setIsProcessing(true);
        try {
            const res = await fetch('/api/debug', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload })
            });
            const data = await res.json();
            if (data.success) {
                window.location.reload();
            } else {
                alert(`Debug API error: ${data.error}`);
            }
        } catch (err) {
            console.error("Debug API failed:", err);
            alert("Debug API failed. Check console.");
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return (
        <button 
            onClick={() => setIsOpen(true)}
            className="fixed bottom-4 right-4 w-10 h-10 bg-slate-900 border border-white/10 rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 transition-all z-[200] group shadow-xl"
        >
            <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
            <div className="absolute right-12 px-2 py-1 bg-slate-900 border border-white/10 rounded text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity uppercase tracking-widest whitespace-nowrap">
                Debug Terminal (Ctrl+D)
            </div>
        </button>
    );

    return (
        <div className="fixed bottom-4 right-4 w-80 bg-slate-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[200] animate-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-indigo-400" />
                    <h3 className="text-xs font-display text-white uppercase tracking-widest">Simulation Override</h3>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                    <X size={16} />
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Ping Test */}
                <button 
                    disabled={isProcessing}
                    onClick={() => callDebugApi('ping')}
                    className="w-full py-1 border border-white/5 rounded text-[8px] font-mono text-slate-600 hover:bg-white/5 transition-all"
                >
                    [ TEST API PING ]
                </button>
                {/* Time Control */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                        <RefreshCw size={10} /> Temporal Distortion
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            disabled={isProcessing}
                            onClick={() => callDebugApi('tick', { hours: 1 })}
                            className="flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-display text-slate-300 hover:bg-white/10 transition-all disabled:opacity-50"
                        >
                            <FastForward size={12} /> +1 HOUR
                        </button>
                        <button 
                            disabled={isProcessing}
                            onClick={() => callDebugApi('tick', { hours: 24 })}
                            className="flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-display text-slate-300 hover:bg-white/10 transition-all disabled:opacity-50"
                        >
                            <Calendar size={12} /> +1 DAY
                        </button>
                    </div>
                </div>

                {/* Season Control */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                        <Zap size={10} className="text-amber-400" /> Macro Cycle
                    </div>
                    <button 
                        disabled={isProcessing}
                        onClick={() => callDebugApi('endSeason')}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[10px] font-display text-amber-500 hover:bg-amber-500/20 transition-all disabled:opacity-50"
                    >
                        FORCE END SEASON
                    </button>
                </div>

                {/* Combat Test */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                        <Shield size={10} className="text-rose-400" /> Tactical Engagement
                    </div>
                    <button 
                        disabled={isProcessing}
                        onClick={() => callDebugApi('triggerCombat')}
                        className="w-full py-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[10px] font-display text-rose-500 hover:bg-rose-500/20 transition-all disabled:opacity-50"
                    >
                        FORCE COMBAT SCENARIO
                    </button>
                </div>

                {/* Resource Injection */}
                <div className="space-y-2">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter flex items-center gap-2">
                        <Coins size={10} className="text-emerald-400" /> Resource Injection
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            disabled={isProcessing}
                            onClick={() => callDebugApi('inject', { factionId: useUIStore.getState().playerFactionId || '', resources: { CREDITS: 10000 } })}
                            className="py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-[10px] font-display text-emerald-500 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                        >
                            +10K CREDITS
                        </button>
                        <button 
                            disabled={isProcessing}
                            onClick={() => callDebugApi('inject', { factionId: useUIStore.getState().playerFactionId || '', resources: { ENERGY: 5000 } })}
                            className="py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-[10px] font-display text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-50"
                        >
                            +5K ENERGY
                        </button>
                    </div>
                </div>

                {/* Status Indicator */}
                <div className="pt-2 flex items-center justify-between border-t border-white/5">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={10} className="text-rose-500" />
                        <span className="text-[8px] font-mono text-rose-500 uppercase tracking-widest">Auth: Root Admin</span>
                    </div>
                    {isProcessing && (
                        <div className="flex items-center gap-1">
                            <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                            <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
