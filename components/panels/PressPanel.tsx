"use client";

import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Newspaper, 
    TrendingUp, 
    TrendingDown, 
    Activity, 
    ShieldAlert, 
    ZapOff, 
    Radio, 
    Map as MapIcon,
    AlertCircle,
    Globe,
    Shield
} from 'lucide-react';
import { 
    seedStoryAction, 
    toggleQuarantineAction, 
    toggleSignalJamAction,
    deployCounterNarrativeAction,
    resolveCrisisAction
} from '@/app/actions/press-actions';
import { CrisisChoice } from '@/lib/press-system/types';

const TONE_CONFIG: Record<string, { color: string; label: string }> = {
    neutral: { color: '#94a3b8', label: 'NEUTRAL' },
    state: { color: '#3b82f6', label: 'STATE' },
    rebel: { color: '#ef4444', label: 'REBEL' },
    sensational: { color: '#f59e0b', label: 'SENSATIONAL' },
};

export default function PressPanel() {
    const { 
        regions, 
        systems, 
        pressState, 
        selectedSystemId,
        updatePress 
    } = useUIStore();
    
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
        pressState.publishedStories[0]?.id || null
    );

    // Filter systems for the viral map based on intensity
    const activeStory = pressState.publishedStories.find(s => s.id === selectedStoryId);
    const hotspots = activeStory?.transmissionMap || new Map<string, number>();

    const avgInstability = regions.reduce((s, r) => s + (100 - r.metrics.stabilityIndex), 0) / regions.length;
    const isHighTension = avgInstability > 50;

    const handleSeed = async (storyId: string) => {
        if (!selectedSystemId) return;
        const res = await seedStoryAction(storyId, selectedSystemId);
        if (res.success) {
            // Optimistic update or wait for revalidate
        }
    };

    const handleQuarantine = async (planetId: string) => {
        const res = await toggleQuarantineAction(planetId);
        if (res.success) {
            const next = new Set(pressState.quarantinedPlanets);
            if (next.has(planetId)) next.delete(planetId);
            else next.add(planetId);
            updatePress({ quarantinedPlanets: next });
        }
    };

    const handleJam = async (systemId: string) => {
        const res = await toggleSignalJamAction(systemId);
        if (res.success) {
            const next = new Set(pressState.jammedSystems);
            if (next.has(systemId)) next.delete(systemId);
            else next.add(systemId);
            updatePress({ jammedSystems: next });
        }
    };

    const handleCounterNarrative = async (systemId: string) => {
        const res = await deployCounterNarrativeAction(systemId);
        if (res.success) {
            const next = new Map(pressState.counterNarratives);
            next.set(systemId, 100);
            updatePress({ counterNarratives: next });
        }
    };

    const handleResolveCrisis = async (crisisId: string, choice: CrisisChoice) => {
        const res = await resolveCrisisAction(crisisId, choice);
        if (res.success) {
            // Revalidation will handle it, but we can also manually update if needed
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/40">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700/40" style={{
                background: isHighTension
                    ? 'linear-gradient(to right, rgba(127,29,29,0.3), transparent)'
                    : undefined
            }}>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="font-display text-sm tracking-widest text-amber-400">VIRAL PRESS SYSTEM</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tighter">
                            Plague-News Model · Real-time Contagion
                        </p>
                    </div>
                    {isHighTension && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-[9px] font-bold animate-pulse">
                            <AlertCircle size={10} />
                            HIGHTENED STATE
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                
                {/* Viral Spread Map (Topological) */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-2">
                            <MapIcon size={12} className="text-amber-500" /> INFODEMIC HOTZONES
                        </div>
                        {selectedStoryId && (
                            <div className="text-[9px] font-mono text-amber-400 opacity-60">
                                ACTIVE: {selectedStoryId.slice(0, 8)}
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900/80 border border-slate-700/40 rounded-xl p-4 relative min-h-[160px]">
                        {!selectedStoryId ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
                                <Radio size={32} className="mb-2 animate-bounce" />
                                <span className="text-[10px] font-display">NO ACTIVE INFODEMIC</span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {Array.from(hotspots.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([pid, intensity]) => {
                                    const sysId = pid.startsWith('planet_') ? pid.replace('planet_', '') : pid;
                                    const plant = systems.find(s => s.id === sysId);
                                    return (
                                        <div key={pid} className="flex flex-col gap-1">
                                            <div className="flex justify-between text-[10px] items-center">
                                                <span className="text-slate-300 flex items-center gap-1">
                                                    <Globe size={10} className="text-slate-500" />
                                                    {plant?.name || sysId.slice(0, 8)}
                                                </span>
                                                <span className="font-mono" style={{ color: intensity > 70 ? '#ef4444' : intensity > 40 ? '#f59e0b' : '#22c55e' }}>
                                                    {intensity.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full transition-all duration-700" 
                                                    style={{ 
                                                        width: `${intensity}%`, 
                                                        backgroundColor: intensity > 70 ? '#ef4444' : intensity > 40 ? '#f59e0b' : '#22c55e',
                                                        boxShadow: intensity > 80 ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none'
                                                    }} 
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {hotspots.size > 5 && (
                                    <div className="text-center text-[9px] text-slate-600 mt-2 italic">
                                        + {hotspots.size - 5} other systems infected
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* Player Tools */}
                <section>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                        <Activity size={12} className="text-cyan-500" /> MANIPULATION TOOLS
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => selectedSystemId && handleJam(selectedSystemId)}
                            disabled={!selectedSystemId}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all ${
                                selectedSystemId && pressState.jammedSystems.has(selectedSystemId)
                                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                            } disabled:opacity-30`}
                        >
                            <ZapOff size={20} className="mb-2" />
                            <span className="text-[10px] font-display">SIGNAL JAM</span>
                        </button>
                        <button 
                            onClick={() => selectedSystemId && handleQuarantine(selectedSystemId)}
                            disabled={!selectedSystemId}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all ${
                                selectedSystemId && pressState.quarantinedPlanets.has(selectedSystemId)
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                            } disabled:opacity-30`}
                        >
                            <ShieldAlert size={20} className="mb-2" />
                            <span className="text-[10px] font-display">QUARANTINE</span>
                        </button>
                        <button 
                            onClick={() => selectedSystemId && handleCounterNarrative(selectedSystemId)}
                            disabled={!selectedSystemId}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all col-span-2 ${
                                selectedSystemId && pressState.counterNarratives.has(selectedSystemId)
                                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                            } disabled:opacity-30`}
                        >
                            <Shield size={20} className="mb-2" />
                            <span className="text-[10px] font-display">
                                {selectedSystemId && pressState.counterNarratives.has(selectedSystemId) 
                                    ? `RESISTANCE: ${Math.round(pressState.counterNarratives.get(selectedSystemId) || 0)}%` 
                                    : 'DEPLOY COUNTER-NARRATIVE'}
                            </span>
                        </button>
                    </div>
                    <div className="mt-3 p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
                        <div className="text-[9px] text-slate-500 mb-2 uppercase tracking-widest">Selected System Action</div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => selectedStoryId && handleSeed(selectedStoryId)}
                                disabled={!selectedSystemId || !selectedStoryId}
                                className="flex-1 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 rounded text-[10px] font-display text-cyan-400 disabled:opacity-20"
                            >
                                SEED CURRENT STORY
                            </button>
                        </div>
                    </div>
                </section>

                {/* Active Crises */}
                {Array.from(pressState.crises.values()).length > 0 && (
                    <section className="bg-red-950/20 border border-red-500/20 rounded-xl p-4 space-y-4">
                        <div className="text-[10px] font-display tracking-widest text-red-400 flex items-center gap-2">
                            <ShieldAlert size={12} /> ACTIVE MEDIA CRISES
                        </div>
                        {Array.from(pressState.crises.values()).map(crisis => (
                            <div key={crisis.id} className="space-y-3">
                                <div className="flex justify-between items-start">
                                    <div className="text-xs text-slate-200 font-bold uppercase tracking-tight">
                                        {crisis.storyId}
                                    </div>
                                    <div className="text-[9px] font-mono text-red-500 animate-pulse">
                                        SEVERITY: {crisis.severity.toFixed(0)}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: CrisisChoice.SUPPRESS, label: "SUPPRESS", color: "bg-red-600/20 text-red-400" },
                                        { id: CrisisChoice.ADMIT_REFORM, label: "REFORM", color: "bg-green-600/20 text-green-400" },
                                        { id: CrisisChoice.BLAME_FOREIGN, label: "DEFLECT", color: "bg-amber-600/20 text-amber-400" },
                                        { id: CrisisChoice.IGNORE, label: "IGNORE", color: "bg-slate-700/20 text-slate-400" }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => handleResolveCrisis(crisis.id, opt.id as any)}
                                            className={`py-2 rounded text-[9px] font-display border border-white/5 hover:border-white/20 transition-all ${opt.color}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {/* Viral Log */}
                <section>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                        <Newspaper size={12} className="text-slate-500" /> INFORMATION STREAM
                    </div>
                    <div className="space-y-2">
                        {pressState.publishedStories.slice().reverse().map(pub => {
                            const tc = TONE_CONFIG['neutral']; // Mock tone for now
                            return (
                                <div 
                                    key={pub.id}
                                    onClick={() => setSelectedStoryId(pub.id)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                        selectedStoryId === pub.id 
                                            ? 'bg-slate-800/80 border-slate-500 shadow-lg' 
                                            : 'bg-slate-900/40 border-slate-800/60 grayscale-[0.5] opacity-80'
                                    }`}
                                >
                                    <div className="flex justify-between items-start gap-2 mb-1.5">
                                        <div className="text-[11px] text-slate-200 leading-tight font-medium">
                                            {pub.storyId} {/* In real app we'd resolve story object */}
                                        </div>
                                        <div className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono">
                                            T{pub.tickPublished}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-[9px] font-mono text-slate-500">
                                            Epicenter: {pub.originPlanetId?.startsWith('planet_') ? pub.originPlanetId.replace('planet_', '').slice(0, 8) : pub.originPlanetId?.slice(0, 8) || 'Global'}
                                        </div>
                                        <div className="text-[9px] font-mono text-cyan-400/80">
                                            Viral: {(pub.viralFactor * 100).toFixed(0)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}
