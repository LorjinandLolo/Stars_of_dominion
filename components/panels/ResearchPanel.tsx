"use client";

import * as React from 'react';
import { useMemo } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Zap, 
    Activity,
    Atom,
    Shield,
    TrendingUp,
    Globe
} from 'lucide-react';
import { Domain, Tier } from '@/lib/tech/types';
import { registry } from '@/lib/tech/engine';
import { startResearchAction, getPlayerTechStateAction } from '@/app/actions/tech';
import '@/lib/tech/techData';



export default function ResearchPanel() {
    const { techState, playerState, updateTech } = useUIStore();
    const [scale, setScale] = React.useState(1);
    const [activeBranch, setActiveBranch] = React.useState<Domain>(Domain.MILITARY);
    
    const allTechs = useMemo(() => registry.getAll(), []);
    const filteredTechs = useMemo(() => 
        allTechs.filter(t => t.branch === activeBranch),
    [allTechs, activeBranch]);

    const { offsetX, offsetY } = useMemo(() => {
        if (filteredTechs.length === 0) return { offsetX: 0, offsetY: 0 };
        const minX = Math.min(...filteredTechs.map(t => t.position?.x ?? 0));
        const minY = Math.min(...filteredTechs.map(t => t.position?.y ?? 0));
        return { offsetX: minX, offsetY: minY };
    }, [filteredTechs]);
    
    const handleResearch = async (techId: string) => {
        const res = await startResearchAction(playerState.factionId, techId);
        if (res.success) {
            const newState = await getPlayerTechStateAction(playerState.factionId);
            updateTech(newState as any);
        }
    };

    const unlockedSet = new Set(techState.unlockedTechIds);
    const lockedSet = new Set(techState.lockedTechIds || []);

    const branches = [
        { id: Domain.MILITARY, label: 'Military', icon: Shield, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
        { id: Domain.ECONOMIC, label: 'Economic', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
        { id: Domain.DIPLOMATIC, label: 'Diplomatic', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
        { id: Domain.CULTURAL, label: 'Cultural', icon: Atom, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
    ];

    return (
        <div className="h-full flex flex-col bg-slate-950/80 backdrop-blur-xl overflow-hidden border-l border-white/5">
            {/* Header */}
            <div className="px-6 pt-6 pb-2 border-b border-white/5 bg-gradient-to-r from-indigo-500/10 via-transparent to-transparent">
                <div className="flex items-center justify-between font-display mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <Zap size={20} className="text-indigo-400" />
                            <h2 className="text-xl tracking-[0.2em] text-white uppercase">Neural Archive</h2>
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Planetary Scientific Convergence Terminal</p>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-black/40 p-2 rounded-lg border border-white/10">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] text-slate-500 uppercase">Research Slots</span>
                            <span className="text-xs font-mono text-indigo-400">
                                {techState.activeSlots?.filter(s => s.techId).length || 0} / {techState.activeSlots?.length || 0}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <button 
                            onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                            className="text-slate-500 hover:text-white transition-colors"
                        >
                            <span className="text-lg">-</span>
                        </button>
                        <span className="text-[10px] font-mono text-slate-400 w-8 text-center">{Math.round(scale * 100)}%</span>
                        <button 
                            onClick={() => setScale(s => Math.min(1.5, s + 0.1))}
                            className="text-slate-500 hover:text-white transition-colors"
                        >
                            <span className="text-lg">+</span>
                        </button>
                    </div>
                </div>

                {/* Branch Tabs */}
                <div className="flex gap-1">
                    {branches.map(branch => {
                        const isActive = activeBranch === branch.id;
                        const Icon = branch.icon;
                        return (
                            <button
                                key={branch.id}
                                onClick={() => setActiveBranch(branch.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-x border-t transition-all duration-200 ${
                                    isActive 
                                        ? `${branch.bg} ${branch.border} ${branch.color} border-white/10` 
                                        : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <Icon size={14} />
                                <span className="text-[10px] uppercase tracking-widest font-bold">{branch.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tree Canvas */}
            <div className="flex-1 overflow-auto custom-scrollbar relative bg-[url('/grid-dark.svg')] bg-repeat">
                <div 
                    className="relative p-20 min-w-[6000px] min-h-[3000px]"
                    style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
                >
                    {/* SVG Connections Layer */}
                    <TechConnectors 
                        techs={filteredTechs} 
                        unlockedTechIds={techState.unlockedTechIds} 
                        scale={1} 
                        offsetX={offsetX}
                        offsetY={offsetY}
                    />

                    {/* Nodes Layer */}
                    {filteredTechs.map(tech => {
                        const isUnlocked = unlockedSet.has(tech.id);
                        const isLocked = lockedSet.has(tech.id);
                        const slot = techState.activeSlots?.find(s => s.techId === tech.id);
                        const isResearching = !!slot;
                        
                        // Availability logic: not unlocked, not locked, and all prereqs met
                        const prereqsMet = (tech.prerequisites || []).every(pid => unlockedSet.has(pid));
                        const isAvailable = !isUnlocked && !isLocked && !isResearching && prereqsMet;

                        // Mock progress for visualization if researching
                        const progress = isResearching ? 45 : 0; 

                        return (
                            <TechNode
                                key={tech.id}
                                tech={tech}
                                isUnlocked={isUnlocked}
                                isLocked={isLocked}
                                isAvailable={isAvailable}
                                isResearching={isResearching}
                                progress={progress}
                                onClick={handleResearch}
                                scale={1}
                                offsetX={offsetX}
                                offsetY={offsetY}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Footer / Telemetry */}
            <div className="p-4 bg-slate-900/60 border-t border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-6 max-w-5xl mx-auto italic">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-indigo-500" />
                        <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Archive Sync Status:</span>
                        <span className="text-[10px] font-mono text-green-400 uppercase">Synchronized</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Atom size={14} className="text-purple-500" />
                        <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Theoretical Cap:</span>
                        <span className="text-[10px] font-mono text-slate-200">Tier VI Singular</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

import TechNode from '../tech/TechNode';
import TechConnectors from '../tech/TechConnectors';
