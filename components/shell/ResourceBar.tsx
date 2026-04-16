"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Coins, 
    Hammer, 
    FlaskConical, 
    Wheat, 
    Home, 
    TrendingUp, 
    TrendingDown,
    Zap
} from 'lucide-react';
import { Resource } from '@/lib/trade-system/types';

export default function ResourceBar() {
    const { playerFactionId, factions, setFocusTarget, planets, systems } = useUIStore();
    
    const faction = playerFactionId ? factions[playerFactionId] : null;
    const reserves = faction?.reserves || {};
    const production = (faction as any)?.production || {}; // Use production if available, fallback to 0

    const handleHomeClick = () => {
        if (!faction) return;
        
        // Find the system coordinates or default to the first known system
        const system = systems.find(s => s.id === faction.capitalSystemId) || systems[0];
        if (system) {
            setFocusTarget({ x: system.q, y: system.r, zoom: 2 });
        }
    };

    const ResourceItem = ({ 
        icon: Icon, 
        label, 
        value, 
        rate, 
        color, 
        accent 
    }: { 
        icon: any, 
        label: string, 
        value: number, 
        rate: number, 
        color: string, 
        accent: string 
    }) => (
        <div className="flex items-center gap-3 px-4 py-1.5 border-r border-slate-800/50 last:border-r-0 group">
            <div className={`p-1.5 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-${accent}/30 transition-colors shadow-inner`}>
                <Icon size={14} className={color} />
            </div>
            <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-mono font-bold text-slate-100 tracking-tight">
                        {Math.floor(value).toLocaleString()}
                    </span>
                    <span className={`text-[9px] font-bold font-display tracking-tight flex items-center gap-0.5 ${rate >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {rate >= 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                        {Math.abs(rate).toFixed(1)}/t
                    </span>
                </div>
                <span className="text-[8px] font-display text-slate-500 uppercase tracking-[0.15em]">{label}</span>
            </div>
        </div>
    );

    return (
        <div className="relative z-40 flex items-center justify-between bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/40 h-14 px-6 shadow-2xl overflow-hidden">
            {/* Gloss Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            
            {/* Left Section: Core Resources */}
            <div className="flex items-center h-full">
                <ResourceItem 
                    icon={Coins} 
                    label="Credits" 
                    value={reserves[Resource.CREDITS] || 0} 
                    rate={production[Resource.CREDITS] || 0}
                    color="text-amber-400"
                    accent="amber-400"
                />
                <ResourceItem 
                    icon={Hammer} 
                    label="Metals" 
                    value={reserves[Resource.METALS] || 0} 
                    rate={production[Resource.METALS] || 0}
                    color="text-slate-400"
                    accent="slate-400"
                />
                <ResourceItem 
                    icon={FlaskConical} 
                    label="Chemicals" 
                    value={reserves[Resource.CHEMICALS] || 0} 
                    rate={production[Resource.CHEMICALS] || 0}
                    color="text-emerald-400"
                    accent="emerald-400"
                />
                <ResourceItem 
                    icon={Wheat} 
                    label="Food" 
                    value={reserves[Resource.FOOD] || 0} 
                    rate={production[Resource.FOOD] || 0}
                    color="text-lime-400"
                    accent="lime-400"
                />
            </div>

            {/* Right Section: Home & Status */}
            <div className="flex items-center gap-4">
                <div className="h-8 w-px bg-slate-800/50 mx-2" />
                
                <button 
                    onClick={handleHomeClick}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-400 rounded-lg transition-all group shadow-lg shadow-sky-950/20"
                >
                    <Home size={14} className="text-sky-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-display font-bold text-sky-400 tracking-[0.2em] uppercase">Focus Capital</span>
                </button>

                <div className="flex flex-col items-end px-2">
                    <span className="text-[8px] font-display text-slate-500 uppercase tracking-widest">Sector Stability</span>
                    <div className="flex items-center gap-2 mt-0.5">
                        <div className="h-1 w-24 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div 
                                className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-1000" 
                                style={{ width: `${faction?.stability || 0}%` }} 
                            />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-400">{faction?.stability || 0}%</span>
                    </div>
                </div>
            </div>

            {/* Subtle light leak effect */}
            <div className="absolute -bottom-px left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
        </div>
    );
}
