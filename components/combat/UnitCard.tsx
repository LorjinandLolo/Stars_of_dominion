"use client";

import React from 'react';
import { GroundUnitType } from '@/lib/combat/siege/siege-types';

interface UnitCardProps {
    type: GroundUnitType;
    icon: React.ReactNode;
    name: string;
    currentHealth: number;
    maxHealth: number;
    ammo: number; // 0-100 derived from supply
    experience: number; // 0-100 derived from morale/cohesion
    isSelected?: boolean;
    theme?: 'ground' | 'space';
    onClick?: () => void;
}

export function UnitCard({
    type,
    icon,
    name,
    currentHealth,
    maxHealth,
    ammo,
    experience,
    isSelected,
    theme = 'ground',
    onClick,
}: UnitCardProps) {
    const healthPercent = Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100));
    
    // Determine status colors
    const healthColor = healthPercent > 50 ? 'bg-emerald-500' : healthPercent > 25 ? 'bg-amber-500' : 'bg-red-500';
    const ammoColor = ammo > 50 ? 'bg-sky-400' : ammo > 20 ? 'bg-orange-400' : 'bg-red-600';
    const expColor = experience > 80 ? 'text-amber-400' : experience > 50 ? 'text-slate-300' : 'text-slate-500';

    const isSpace = theme === 'space';

    return (
        <div 
            onClick={onClick}
            className={`
                relative w-24 h-36 flex-shrink-0 rounded-md border overflow-hidden cursor-pointer transition-all group
                ${isSelected 
                    ? isSpace ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)] bg-indigo-900' : 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)] bg-slate-800' 
                    : isSpace ? 'border-indigo-700/60 bg-indigo-950/80 hover:border-indigo-400/60 hover:bg-indigo-900/80' : 'border-slate-700 bg-slate-900/80 hover:border-slate-500 hover:bg-slate-800'
                }
            `}
        >
            {/* Background Texture/Gradient */}
            <div className={`absolute inset-0 bg-gradient-to-b ${isSpace ? 'from-indigo-900/40 to-black/90' : 'from-slate-800/40 to-slate-950/90'}`} />
            
            {/* Top Bar: Exp and Type */}
            <div className="absolute top-1 left-1 right-1 flex justify-between items-center z-10">
                <span className={`text-[10px] font-bold ${expColor}`} title={`Experience / Cohesion: ${Math.round(experience)}%`}>
                    {experience > 80 ? '★★★' : experience > 50 ? '★★' : '★'}
                </span>
                <span className="text-[8px] text-slate-500 uppercase tracking-tighter bg-slate-950/80 px-1 rounded-sm border border-slate-800">
                    {type.substring(0, 3)}
                </span>
            </div>

            {/* Central Icon */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none pb-4">
                <div className={`text-3xl transition-transform group-hover:scale-110 ${
                    isSelected 
                        ? isSpace ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' 
                        : 'text-slate-300 drop-shadow-md'
                }`}>
                    {icon}
                </div>
                <div className={`text-[9px] font-display font-bold text-center mt-2 tracking-widest uppercase px-1 ${isSpace ? 'text-cyan-100/70' : 'text-slate-200'}`}>
                    {name}
                </div>
            </div>

            {/* Bottom Info Bars */}
            <div className="absolute bottom-1 left-1 right-1 space-y-1 z-10">
                {/* Health Bar & Text */}
                <div className="flex justify-between items-end mb-0.5 px-0.5">
                    <span className="text-[7px] text-slate-400 font-mono">{Math.ceil(currentHealth)}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-950 rounded-sm overflow-hidden border border-slate-800">
                    <div className={`h-full ${healthColor} transition-all`} style={{ width: `${healthPercent}%` }} />
                </div>
                
                {/* Ammo Indicator (Logistics) */}
                <div className="flex gap-0.5 h-1 px-0.5 opacity-80" title={`Logistics/Ammo: ${Math.round(ammo)}%`}>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex-1 bg-slate-950 rounded-sm overflow-hidden">
                            <div className={`h-full ${ammoColor} transition-all`} style={{ width: ammo > i * 20 ? '100%' : '0%' }} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
