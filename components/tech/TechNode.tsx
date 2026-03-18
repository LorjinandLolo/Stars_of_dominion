"use client";

import React from 'react';
import { Lock, CheckCircle2, FlaskConical, AlertCircle, Dna } from 'lucide-react';
import { Tech, Tier } from '@/lib/tech/types';

interface TechNodeProps {
    tech: Tech;
    isUnlocked: boolean;
    isLocked: boolean;
    isAvailable: boolean;
    isResearching?: boolean;
    progress?: number;
    onClick: (techId: string) => void;
    scale?: number;
}

export default function TechNode({ 
    tech, 
    isUnlocked, 
    isLocked, 
    isAvailable, 
    isResearching,
    progress = 0,
    onClick,
    scale = 1,
    offsetX = 0,
    offsetY = 0
}: TechNodeProps & { offsetX?: number, offsetY?: number }) {
    const x = (tech.position.x - offsetX) * 120 * scale;
    const y = (tech.position.y - offsetY) * 100 * scale;

    return (
        <div 
            className={`
                absolute transition-all duration-500 group select-none
                ${isUnlocked ? 'z-20' : 'z-10'}
            `}
            style={{ 
                left: `${x}px`, 
                top: `${y}px`,
                width: `${160 * scale}px`
            }}
        >
            <div 
                onClick={() => (isAvailable || isResearching) && onClick(tech.id)}
                className={`
                    relative p-3 rounded-lg border-2 transition-all duration-300
                    ${isUnlocked ? 'bg-indigo-950/40 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 
                      isResearching ? 'bg-amber-950/20 border-amber-500/60 animate-pulse' :
                      isAvailable ? 'bg-slate-900 border-slate-700 hover:border-indigo-400 hover:bg-slate-800 cursor-pointer' :
                      isLocked ? 'bg-slate-950 border-red-900/30 opacity-40 grayscale' :
                      'bg-slate-950 border-slate-800/50 opacity-50 grayscale'}
                `}
            >
                {/* Header */}
                <div className="flex justify-between items-start mb-1 gap-2">
                    <h3 className={`text-[10px] font-display uppercase tracking-wider truncate flex-1 ${isUnlocked ? 'text-indigo-200' : 'text-slate-200'}`}>
                        {tech.name}
                    </h3>
                    {isUnlocked ? (
                        <CheckCircle2 size={12} className="text-indigo-400 shrink-0" />
                    ) : isLocked ? (
                        <Lock size={12} className="text-red-500 shrink-0" />
                    ) : isResearching ? (
                        <FlaskConical size={12} className="text-amber-400 shrink-0 spin-slow" />
                    ) : null}
                </div>

                {/* Sub-branch / Info */}
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[8px] font-mono text-slate-500 uppercase">TIER {tech.tier}</span>
                    {tech.subBranch && (
                        <span className="text-[8px] font-mono text-slate-400 px-1 bg-white/5 rounded lowercase">
                            {tech.subBranch}
                        </span>
                    )}
                </div>

                {/* Progress Bar (if researching) */}
                {isResearching && (
                    <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden mb-2 border border-white/5">
                        <div 
                            className="h-full bg-amber-500 transition-all duration-1000"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {/* Effects Preview (Compact) */}
                <div className="flex flex-wrap gap-1 mt-1">
                    {tech.effects.slice(0, 2).map((eff, i) => (
                        <div key={i} className="flex items-center gap-1 opacity-60">
                            <Dna size={8} className="text-amber-500" />
                            <span className="text-[7px] text-slate-400 truncate max-w-[60px] uppercase">
                                {eff.target.replace(/_/g, ' ')}
                            </span>
                        </div>
                    ))}
                    {tech.effects.length > 2 && <span className="text-[7px] text-slate-600">+{tech.effects.length - 2}</span>}
                </div>

                {/* Hover Details */}
                <div className="absolute top-full left-0 mt-2 w-64 p-4 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all z-50">
                    <p className="text-[10px] text-slate-300 mb-3 leading-relaxed">
                        {tech.description}
                    </p>
                    
                    <div className="space-y-2 border-t border-slate-800 pt-3">
                        <span className="text-[8px] font-display text-slate-500 uppercase tracking-widest block mb-1">Impact Analysis</span>
                        {tech.effects.map((eff, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[9px]">
                                <span className="text-slate-400 lowercase">{eff.target.replace(/_/g, ' ')}</span>
                                <span className={eff.value > 0 ? 'text-green-400' : 'text-red-400'}>
                                    {eff.value > 0 ? '+' : ''}{eff.value * 100}%
                                </span>
                            </div>
                        ))}
                    </div>

                    {tech.mutuallyExclusiveWith && tech.mutuallyExclusiveWith.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-red-900/30">
                            <span className="text-[8px] font-display text-red-400 uppercase tracking-widest block mb-1">Mutual Exclusion</span>
                            <div className="text-[8px] text-red-300">Researched this will lock {tech.mutuallyExclusiveWith.length} other path(s).</div>
                        </div>
                    )}
                    
                    {isAvailable && !isResearching && (
                        <div className="mt-4 py-2 text-center bg-indigo-500/20 border border-indigo-500/40 rounded text-[9px] font-display text-indigo-300 uppercase animate-pulse">
                            Click to Authorize Research
                        </div>
                    )}
                </div>
            </div>
            
            {/* Connection Point Indicators (Decorative) */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full border border-slate-700 bg-slate-900 group-hover:border-indigo-400 transition-colors" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full border border-slate-700 bg-slate-900 group-hover:border-indigo-400 transition-colors" />
        </div>
    );
}
