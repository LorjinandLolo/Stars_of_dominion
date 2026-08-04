"use client";

// components/shell/TopNav.tsx
// Stars of Dominion — HOI4-style command information strip.
// No navigation lives here anymore: the Command Dock at the bottom owns all
// navigation. This bar answers, at a glance: what do I have, what day is it,
// and is anything on fire.

import * as React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import {
    Coins,
    Hammer,
    FlaskConical,
    Wheat,
    Zap,
    Gem,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    CalendarDays,
} from 'lucide-react';
import { Resource } from '@/lib/trade-system/types';
import { CivilizationIdentity } from '../civilization/CivilizationIdentity';
import IdentityBadge from './IdentityBadge';

interface ResourceChipProps {
    icon: React.ReactNode;
    label: string;
    value: number;
    rate: number;
    className?: string;
}

function ResourceChip({ icon, label, value, rate, className = '' }: ResourceChipProps) {
    return (
        <div className={`flex items-center gap-2 px-3 h-full border-r border-slate-800/40 last:border-r-0 group ${className}`} title={label}>
            <span className="text-slate-500 group-hover:text-slate-300 transition-colors">{icon}</span>
            <div className="flex flex-col leading-none">
                <span className="text-[12px] font-mono font-bold text-slate-100 tracking-tight">
                    {Math.floor(value).toLocaleString()}
                </span>
                <span className={`text-[8px] font-mono flex items-center gap-0.5 mt-0.5 ${rate >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {rate >= 0 ? <TrendingUp size={7} /> : <TrendingDown size={7} />}
                    {Math.abs(rate).toFixed(1)}
                </span>
            </div>
        </div>
    );
}

export default function TopNav() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const factions = useUIStore(s => s.factions);
    const crisisWindows = useUIStore(s => s.crisisWindows);
    const councilState = useUIStore(s => s.councilState);
    const nowSeconds = useUIStore(s => s.nowSeconds);

    const faction = playerFactionId ? factions[playerFactionId] : null;
    const reserves = (faction as any)?.reserves || {};
    const production = (faction as any)?.production || {};
    const stability = (faction as any)?.stability || 0;

    const activeCrises = crisisWindows.filter(w => w.phase !== 'warning');
    const emergency = councilState.emergencySession && councilState.status !== 'absent';

    // Galactic calendar: 90-day seasons driven by the authoritative clock.
    const dayOfSeason = Math.floor(nowSeconds / 86400) + 1;
    const season = Math.floor(dayOfSeason / 90) + 1;
    const relativeDay = ((dayOfSeason - 1) % 90) + 1;

    const res = (r: Resource) => ({ value: reserves[r] || 0, rate: production[r] || 0 });

    return (
        <nav className="relative z-50 flex items-stretch justify-between h-12 border-b border-slate-700/60 bg-slate-950/95 backdrop-blur-md select-none">
            {/* Gloss */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />

            {/* ── Left: brand + civilization ──────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 min-w-0">
                <div className="w-6 h-6 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-slate-950 font-black text-xs font-display flex-shrink-0">
                    S
                </div>
                <span className="font-display text-[11px] tracking-[0.25em] text-[var(--color-primary)] hidden 2xl:block whitespace-nowrap">
                    STARS OF DOMINION
                </span>
                <div className="hidden md:block">
                    <CivilizationIdentity />
                </div>
            </div>

            {/* ── Center: the empire's ledger ─────────────────────────────── */}
            <div className="flex items-stretch flex-1 justify-center max-w-fit mx-auto min-w-0 overflow-hidden">
                <ResourceChip icon={<Coins size={13} className="text-amber-400" />} label="Credits" {...res(Resource.CREDITS)} />
                <ResourceChip icon={<Hammer size={13} className="text-slate-400" />} label="Metals" {...res(Resource.METALS)} />
                <ResourceChip icon={<FlaskConical size={13} className="text-emerald-400" />} label="Chemicals" {...res(Resource.CHEMICALS)} />
                <ResourceChip icon={<Wheat size={13} className="text-lime-400" />} label="Food" {...res(Resource.FOOD)} />
                <ResourceChip icon={<Zap size={13} className="text-sky-400" />} label="Energy" {...res(Resource.ENERGY)} className="hidden xl:flex" />
                <ResourceChip icon={<Gem size={13} className="text-fuchsia-400" />} label="Rares" {...res(Resource.RARES)} className="hidden xl:flex" />
            </div>

            {/* ── Right: stability, date, alerts, identity ────────────────── */}
            <div className="flex items-center gap-3 px-4 flex-shrink-0">
                {/* Stability */}
                <div className="hidden lg:flex flex-col items-end leading-none" title="Empire stability">
                    <span className="text-[7px] font-display text-slate-500 uppercase tracking-widest mb-1">Stability</span>
                    <div className="flex items-center gap-1.5">
                        <div className="h-1 w-16 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div
                                className={`h-full transition-all duration-1000 ${stability > 50 ? 'bg-emerald-500' : stability > 25 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${stability}%` }}
                            />
                        </div>
                        <span className="text-[9px] font-mono font-bold text-slate-300">{stability}%</span>
                    </div>
                </div>

                <div className="h-6 w-px bg-slate-800/60" />

                {/* Galactic date */}
                <div className="flex items-center gap-2" title="Galactic calendar">
                    <CalendarDays size={13} className="text-slate-500" />
                    <div className="flex flex-col leading-none">
                        <span className="text-[11px] font-mono font-bold text-slate-200">
                            S{season} · D{relativeDay}
                        </span>
                        <span className="text-[7px] font-display text-slate-500 uppercase tracking-widest mt-0.5">
                            Tick {Math.floor(nowSeconds / 10)}
                        </span>
                    </div>
                </div>

                {/* Alerts */}
                {(activeCrises.length > 0 || emergency) && (
                    <>
                        <div className="h-6 w-px bg-slate-800/60" />
                        <div className="flex items-center gap-2">
                            {emergency && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-sm bg-red-500/10 border border-red-500/40 text-[8px] font-display tracking-widest text-red-400 animate-pulse">
                                    <AlertTriangle size={10} />
                                    <span className="hidden xl:inline">EMERGENCY</span>
                                </span>
                            )}
                            {activeCrises.length > 0 && (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-sm bg-amber-500/10 border border-amber-500/40 text-[8px] font-display tracking-widest text-amber-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    {activeCrises.length} <span className="hidden xl:inline">CRISES</span>
                                </span>
                            )}
                        </div>
                    </>
                )}

                <div className="h-6 w-px bg-slate-800/60" />
                <IdentityBadge />
            </div>
        </nav>
    );
}
