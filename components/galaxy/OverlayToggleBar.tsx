"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import type { OverlayType } from '@/types/ui-state';
import { Flame, Activity, Landmark, Zap, Globe, Telescope } from 'lucide-react';

const OVERLAYS: { type: OverlayType; label: string; icon: React.ReactNode; color: string }[] = [
    { type: 'tradeHeat', label: 'Trade Heat', icon: <Flame size={13} />, color: '#f59e0b' },
    { type: 'instability', label: 'Instability', icon: <Activity size={13} />, color: '#ef4444' },
    { type: 'institutionalAlignment', label: 'Institutional', icon: <Landmark size={13} />, color: '#6366f1' },
    { type: 'escalation', label: 'Escalation', icon: <Zap size={13} />, color: '#f97316' },
    { type: 'regionalStability', label: 'Regional Stability', icon: <Globe size={13} />, color: '#22c55e' },
    { type: 'deepSpace', label: 'Deep Space', icon: <Telescope size={13} />, color: '#06b6d4' },
];

export default function OverlayToggleBar() {
    const { activeOverlay, toggleOverlay } = useUIStore();

    return (
        <div className="absolute top-4 left-4 z-30 flex flex-col gap-1.5 pointer-events-auto">
            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-1 px-1">OVERLAYS</div>
            {OVERLAYS.map(({ type, label, icon, color }) => {
                const isActive = activeOverlay === type;
                return (
                    <button
                        key={type}
                        onClick={() => toggleOverlay(type)}
                        style={isActive ? { borderColor: color, color, backgroundColor: `${color}18` } : {}}
                        className={[
                            'flex items-center gap-2 px-3 py-1.5 rounded text-xs font-display tracking-wide transition-all duration-150',
                            'border backdrop-blur-md',
                            isActive
                                ? 'shadow-lg'
                                : 'border-slate-700/50 text-slate-400 bg-slate-950/70 hover:bg-slate-800/60 hover:text-slate-200 hover:border-slate-500',
                        ].join(' ')}
                    >
                        <span>{icon}</span>
                        <span className="hidden xl:inline">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
