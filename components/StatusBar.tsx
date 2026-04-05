import { Coins, Hammer, FlaskConical, Wheat, Activity, Home } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { EconomyState } from '@/types';
import { useUIStore } from '@/lib/store/ui-store';

export default function StatusBar({ state }: { state: EconomyState }) {
    const { resources, income_rates, expenses, economic_health, last_updated } = state;
    const { playerFactionId, factions, planets, setFocusTarget } = useUIStore();

    // Fallback for safety if new fields aren't populated yet
    const stability = economic_health?.stability ?? 100;
    const currentExpenses = expenses?.credits ?? 0;
    const grossIncome = income_rates?.credits ?? 0;
    const netIncome = grossIncome - currentExpenses;

    const handleHomeClick = () => {
        if (!playerFactionId || !factions || !planets) return;
        const faction = factions[playerFactionId];
        if (faction && faction.capitalSystemId) {
            const capitalPlanet = planets.find(p => p.systemId === faction.capitalSystemId || p.id === `planet-${faction.capitalSystemId}`);
            if (capitalPlanet) {
                setFocusTarget({ x: capitalPlanet.x, y: capitalPlanet.y, zoom: 1.5 });
            }
        }
    };

    const getStabilityColor = (s: number) => {
        if (s > 80) return 'text-emerald-400';
        if (s > 50) return 'text-amber-400';
        return 'text-rose-500';
    };

    return (
        <div className="flex items-center justify-between px-6 py-2 bg-slate-900 border-b-2 border-amber-600 text-sm shadow-md z-50 relative w-full h-14">
            {/* Left: Resources (Yields) */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2" title={`Net Income: ${grossIncome} (Gross) - ${currentExpenses} (Upkeep)`}>
                    <div className="bg-amber-500 text-slate-900 rounded-full p-1"><Coins size={12} strokeWidth={3} /></div>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-amber-500 text-lg">{Math.floor(resources.credits || 0)}</span>
                        <div className="flex items-center gap-1">
                            <span className={`text-[10px] ${netIncome >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                                {netIncome >= 0 ? '+' : ''}{Math.floor(netIncome)}/h
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2" title="Metals">
                    <div className="bg-slate-500 text-white rounded-full p-1"><Hammer size={12} strokeWidth={3} /></div>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-slate-400 text-lg">{Math.floor(resources.metals || 0)}</span>
                        <span className="text-[10px] text-slate-500">+{Math.floor(income_rates?.metals || 0)}/h</span>
                    </div>
                </div>
                {/* ... (Other resources similar, can add upkeep if needed later) ... */}
                <div className="flex items-center gap-2" title="Chemicals">
                    <div className="bg-emerald-600 text-white rounded-full p-1"><FlaskConical size={12} strokeWidth={3} /></div>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-emerald-400 text-lg">{Math.floor(resources.chemicals || 0)}</span>
                        <span className="text-[10px] text-emerald-600">+{Math.floor(income_rates?.chemicals || 0)}/h</span>
                    </div>
                </div>
                <div className="flex items-center gap-2" title="Food">
                    <div className="bg-lime-600 text-white rounded-full p-1"><Wheat size={12} strokeWidth={3} /></div>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-lime-400 text-lg">{Math.floor(resources.food || 0)}</span>
                        <span className="text-[10px] text-lime-600">+{Math.floor(income_rates?.food || 0)}/h</span>
                    </div>
                </div>
            </div>

            {/* Center: Economic Health */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700" title="Stability">
                    <Activity size={14} className={getStabilityColor(stability)} />
                    <span className={`font-display font-bold ${getStabilityColor(stability)}`}>
                        {Math.floor(stability)}%
                    </span>
                </div>
                {economic_health?.status !== 'solvent' && (
                    <div className="text-xs font-bold text-rose-500 animate-pulse uppercase tracking-wider">
                        {economic_health?.status}
                    </div>
                )}
            </div>

            {/* Right: Date & Home */}
            <div className="flex items-center gap-6">
                <button 
                    onClick={handleHomeClick}
                    className="flex items-center gap-2 px-3 py-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-600/40 rounded text-[10px] text-amber-500 font-bold uppercase tracking-widest transition-all group"
                    title="Refocus on Capital"
                >
                    <Home size={12} className="group-hover:scale-110 transition-transform" />
                    <span>Home</span>
                </button>
                <div className="flex flex-col items-end leading-tight border-l border-slate-800 pl-4">
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">Date</span>
                    <span className="font-display font-bold text-lg text-slate-100">
                        {/* Use ClientComponent wrapper or simple hydration safe check */}
                        <ClientDate date={last_updated} />
                    </span>
                </div>
            </div>
        </div>
    );
}

function ClientDate({ date }: { date: string }) {
    const [d, setD] = React.useState<string>("");
    React.useEffect(() => {
        setD(new Date(date).toLocaleDateString());
    }, [date]);
    return <>{d}</>;
}
