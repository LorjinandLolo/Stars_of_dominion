"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { AlertTriangle, Flame, Wind, Swords, Crown, ChevronDown, ChevronUp } from 'lucide-react';
import type { CrisisKind, CrisisPhase } from '@/types/ui-state';

const KIND_CONFIG: Record<CrisisKind, { label: string; icon: React.ReactNode; color: string }> = {
    order: { label: 'ORDER', icon: <AlertTriangle size={12} />, color: '#ef4444' },
    ash: { label: 'ASH', icon: <Flame size={12} />, color: '#f97316' },
    coldWar: { label: 'COLD WAR', icon: <Wind size={12} />, color: '#06b6d4' },
    imperial: { label: 'IMPERIAL', icon: <Crown size={12} />, color: '#a855f7' },
};

const PHASE_CONFIG: Record<CrisisPhase, { label: string; color: string; glow: boolean }> = {
    warning: { label: 'WARNING', color: '#f59e0b', glow: false },
    active: { label: 'ACTIVE', color: '#f97316', glow: false },
    nearLock: { label: 'NEAR LOCK', color: '#ef4444', glow: true },
};

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CrisisBottomTray() {
    const { crisisWindows, regions, crisisWindowMinimized, toggleCrisisWindowMinimized } =
        useUIStore();

    if (crisisWindows.length === 0) return null;

    return (
        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
            {/* Tray container */}
            <div className="pointer-events-auto flex items-end gap-2 px-4 pb-3 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
                {crisisWindows.map((cw) => {
                    const region = regions.find((r) => r.id === cw.regionId);
                    const kind = KIND_CONFIG[cw.kind];
                    const phase = PHASE_CONFIG[cw.phase];
                    const isMinimized = crisisWindowMinimized[cw.id];

                    return (
                        <div
                            key={cw.id}
                            className={[
                                'flex-shrink-0 w-52 rounded-t-lg border border-b-0 overflow-hidden',
                                'bg-slate-950/95 backdrop-blur-md shadow-xl',
                                phase.glow ? 'animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]' : '',
                            ].join(' ')}
                            style={{ borderColor: `${phase.color}55` }}
                        >
                            {/* Card header — always visible */}
                            <button
                                onClick={() => toggleCrisisWindowMinimized(cw.id)}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/40 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span style={{ color: kind.color }}>{kind.icon}</span>
                                    <span
                                        className="text-[10px] font-display tracking-widest"
                                        style={{ color: kind.color }}
                                    >
                                        {kind.label}
                                    </span>
                                    <span
                                        className="text-[9px] font-display px-1 rounded"
                                        style={{
                                            color: phase.color,
                                            backgroundColor: `${phase.color}22`,
                                            border: `1px solid ${phase.color}44`,
                                        }}
                                    >
                                        {phase.label}
                                    </span>
                                </div>
                                <span className="text-slate-500 flex-shrink-0">
                                    {isMinimized ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </span>
                            </button>

                            {/* Card body — collapsible */}
                            {!isMinimized && (
                                <div className="px-3 pb-3 space-y-2 border-t border-slate-800/60">
                                    {/* Region name */}
                                    {region && (
                                        <div className="flex items-center gap-1.5 pt-2">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ backgroundColor: region.color }}
                                            />
                                            <span className="text-xs text-slate-300 font-display tracking-wide">
                                                {region.name}
                                            </span>
                                        </div>
                                    )}

                                    {/* Intensity bar */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-slate-500">
                                            <span>INTENSITY</span>
                                            <span className="font-mono" style={{ color: phase.color }}>{cw.intensity}</span>
                                        </div>
                                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${cw.intensity}%`, backgroundColor: phase.color }}
                                            />
                                        </div>
                                    </div>

                                    {/* Timestamps */}
                                    <div className="text-[10px] font-mono text-slate-600 space-y-0.5">
                                        <div>Started: {formatTime(cw.startedAt)}</div>
                                        {cw.endsAt && <div>Deadline: {formatTime(cw.endsAt)}</div>}
                                    </div>

                                    {/* Near-lock message — no percentage */}
                                    {cw.phase === 'nearLock' && (
                                        <div
                                            className="text-[10px] font-display tracking-wide px-2 py-1 rounded"
                                            style={{
                                                color: '#ef4444',
                                                backgroundColor: '#ef444422',
                                                border: '1px solid #ef444444',
                                            }}
                                        >
                                            Regional Stability Strong and Sustained
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
