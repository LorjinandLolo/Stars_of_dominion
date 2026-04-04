"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { AlertTriangle, Flame, Wind, Swords, Crown, ChevronDown, ChevronUp, Activity, Terminal } from 'lucide-react';
import type { CrisisKind, CrisisPhase } from '@/types/ui-state';

const KIND_CONFIG: Record<CrisisKind, { label: string; icon: any; color: string; bg: string }> = {
    order: { label: 'ORDER', icon: AlertTriangle, color: '#f87171', bg: 'bg-red-500/10' },
    ash: { label: 'ASH', icon: Flame, color: '#fb923c', bg: 'bg-orange-500/10' },
    coldWar: { label: 'COLD WAR', icon: Wind, color: '#22d3ee', bg: 'bg-cyan-500/10' },
    imperial: { label: 'IMPERIAL', icon: Crown, color: '#c084fc', bg: 'bg-purple-500/10' },
};

const PHASE_CONFIG: Record<CrisisPhase, { label: string; color: string; glow: string }> = {
    warning: { label: 'WARNING', color: '#fbbf24', glow: 'shadow-[0_0_10px_rgba(251,191,36,0.2)]' },
    active: { label: 'ACTIVE', color: '#f87171', glow: 'shadow-[0_0_15px_rgba(248,113,113,0.3)]' },
    nearLock: { label: 'NEAR LOCK', color: '#ef4444', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.5)]' },
};

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function CrisisBottomTray() {
    const { crisisWindows, regions, crisisWindowMinimized, toggleCrisisWindowMinimized } = useUIStore();

    if (crisisWindows.length === 0) return null;

    return (
        <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none p-6 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none" />
            
            {/* Tray container */}
            <div className="pointer-events-auto flex items-end gap-4 overflow-x-auto custom-scrollbar-h pb-2 mask-linear-right">
                {crisisWindows.map((cw) => {
                    const region = regions.find((r) => r.id === cw.regionId);
                    const kind = KIND_CONFIG[cw.kind];
                    const phase = PHASE_CONFIG[cw.phase];
                    const isMinimized = crisisWindowMinimized[cw.id];
                    const Icon = kind.icon;

                    return (
                        <div
                            key={cw.id}
                            className={`flex-shrink-0 w-64 glass-panel rounded-2xl border transition-all duration-500 overflow-hidden group ${
                                isMinimized ? 'h-11' : 'h-auto'
                            } ${cw.phase === 'nearLock' ? 'animate-pulse' : ''}`}
                            style={{ 
                                borderColor: isMinimized ? `${phase.color}33` : `${phase.color}66`,
                                boxShadow: cw.phase === 'nearLock' ? `0 0 20px ${phase.color}22` : 'none'
                             }}
                        >
                            <div className="absolute inset-0 scanline-overlay pointer-events-none opacity-[0.03]" />

                            {/* Card header */}
                            <button
                                onClick={() => toggleCrisisWindowMinimized(cw.id)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${
                                    isMinimized ? 'hover:bg-white/5' : 'bg-white/[0.02] border-b border-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-1.5 rounded-lg ${kind.bg} border border-white/5 shadow-inner`}>
                                        <Icon size={12} style={{ color: kind.color }} />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="text-[9px] font-display tracking-[0.2em]" style={{ color: kind.color }}>
                                            {kind.label}
                                        </span>
                                        <span className="text-[8px] font-mono opacity-40 uppercase tracking-tighter">Event ID: {cw.id.slice(0, 8)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${phase.glow}`} style={{ 
                                        color: phase.color, 
                                        backgroundColor: `${phase.color}11`,
                                        borderColor: `${phase.color}33`
                                    }}>
                                        {phase.label}
                                    </span>
                                    <div className="text-slate-500 hover:text-white transition-colors">
                                        {isMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </div>
                                </div>
                            </button>

                            {/* Card body */}
                            {!isMinimized && (
                                <div className="p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                                    {/* Region info */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: region?.color || phase.color }} />
                                            <span className="text-[10px] text-white font-display uppercase tracking-widest">
                                                {region?.name || 'Unknown Sector'}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-mono text-slate-500">{(cw.intensity).toFixed(1)}% SEVERITY</span>
                                    </div>

                                    {/* Intensity bar */}
                                    <div className="space-y-1.5">
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_var(--glow-color)]"
                                                style={{ 
                                                    width: `${cw.intensity}%`, 
                                                    backgroundColor: phase.color,
                                                    '--glow-color': phase.color 
                                                } as React.CSSProperties}
                                            />
                                        </div>
                                    </div>

                                    {/* System metadata */}
                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-slate-600 uppercase tracking-tighter">Signal Sync</span>
                                            <span className="text-[9px] font-mono text-slate-400">{formatTime(cw.startedAt)}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-[8px] text-slate-600 uppercase tracking-tighter">Projected Lock</span>
                                            <span className="text-[9px] font-mono text-rose-400">{cw.endsAt ? formatTime(cw.endsAt) : '---'}</span>
                                        </div>
                                    </div>

                                    {/* Critical Action Warning */}
                                    {cw.phase === 'nearLock' && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-pulse">
                                            <Terminal size={12} className="text-rose-400" />
                                            <span className="text-[8px] font-display text-rose-400 uppercase tracking-widest">Immediate Response Required</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

