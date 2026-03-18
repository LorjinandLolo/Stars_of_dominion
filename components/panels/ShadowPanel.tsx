"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Skull, Flame, Network, ShoppingBag, Users, Eye, Map } from 'lucide-react';
import type { OverlayType } from '@/types/ui-state';

const SHADOW_OVERLAYS: { type: OverlayType; label: string; icon: React.ReactNode }[] = [
    { type: 'tradeHeat', label: 'Smuggling Density', icon: <ShoppingBag size={12} /> },
    { type: 'instability', label: 'Trade Vulnerability', icon: <Eye size={12} /> },
    { type: 'deepSpace', label: 'Deep Space Lanes', icon: <Map size={12} /> },
];

function StatBar({ value, color = '#a855f7' }: { value: number; color?: string }) {
    return (
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
        </div>
    );
}

export default function ShadowPanel() {
    const { playerState, activeOverlay, toggleOverlay } = useUIStore();

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header — dark purple */}
            <div className="px-6 py-4 border-b border-purple-900/60 bg-gradient-to-r from-purple-950/40 to-transparent">
                <div className="flex items-center gap-2 mb-0.5">
                    <Skull size={14} className="text-purple-400" />
                    <h2 className="font-display text-sm tracking-widest text-purple-400">SHADOW OPERATIONS</h2>
                </div>
                <p className="text-xs text-slate-500">Black market network · Infamy · Underground routes</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Role badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700/40 rounded text-xs font-display text-purple-300">
                    <Skull size={11} />
                    ROLE: {playerState.role.toUpperCase()}
                    &nbsp;·&nbsp;
                    PIRATE SCORE: {playerState.pirateInvolvementScore}
                </div>

                {/* Shadow metrics */}
                <div className="space-y-4">
                    {[
                        { label: 'INFAMY', value: playerState.infamy, color: '#ef4444', icon: <Flame size={12} /> },
                        { label: 'HEAT', value: playerState.heat, color: '#f97316', icon: <Flame size={12} /> },
                        { label: 'NETWORK CONTROL', value: playerState.networkControl, color: '#a855f7', icon: <Network size={12} /> },
                        { label: 'BLACK MARKET LIQUIDITY', value: playerState.blackMarketLiquidity, color: '#f59e0b', icon: <ShoppingBag size={12} /> },
                        { label: 'CREW LOYALTY', value: playerState.crewLoyalty, color: '#22c55e', icon: <Users size={12} /> },
                    ].map(({ label, value, color, icon }) => (
                        <div key={label} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 font-display tracking-wide" style={{ color }}>
                                    {icon} {label}
                                </div>
                                <span className="font-mono text-slate-300">{value}<span className="text-slate-600">/100</span></span>
                            </div>
                            <StatBar value={value} color={color} />
                        </div>
                    ))}
                </div>

                {/* Shadow overlay sub-options */}
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-2">SHADOW OVERLAYS</div>
                    <div className="space-y-1">
                        {SHADOW_OVERLAYS.map(({ type, label, icon }) => {
                            const isActive = activeOverlay === type;
                            return (
                                <button
                                    key={type}
                                    onClick={() => toggleOverlay(type)}
                                    className={[
                                        'w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-display tracking-wide transition-all border',
                                        isActive
                                            ? 'border-purple-500/60 bg-purple-900/30 text-purple-300'
                                            : 'border-slate-700/40 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200',
                                    ].join(' ')}
                                >
                                    {icon} {label}
                                    {isActive && <span className="ml-auto text-[9px] text-purple-400">ACTIVE</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Exposure warning */}
                {playerState.heat > 60 && (
                    <div className="px-3 py-2 bg-red-950/40 border border-red-800/50 rounded text-xs text-red-400 font-display">
                        ⚠ HIGH HEAT — Reduce activity or risk exposure
                    </div>
                )}
            </div>
        </div>
    );
}
