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
    Globe,
    Eye
} from 'lucide-react';
import { TechTreeType, TechTier } from '@/lib/tech/types';
import { registry } from '@/lib/tech/engine';
import { startResearchAction, getPlayerTechStateAction } from '@/app/actions/tech';
import '@/lib/tech/techData';
import TechNode from '../tech/TechNode';
import TechConnectors from '../tech/TechConnectors';

export default function ResearchPanel() {
    const { techState, playerState, updateTech, nowSeconds } = useUIStore();
    const [scale, setScale] = React.useState(1);
    const [activeBranch, setActiveBranch] = React.useState<TechTreeType>(TechTreeType.ESPIONAGE);
    
    const allTechs = useMemo(() => registry.getAll(), []);
    const filteredTechs = useMemo(() => 
        allTechs.filter(t => t.tree === activeBranch),
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
        { id: TechTreeType.ESPIONAGE, label: 'Espionage', icon: Eye, color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
        { id: TechTreeType.MILITARY, label: 'Military', icon: Shield, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
        { id: TechTreeType.ECONOMY, label: 'Economy', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
        { id: TechTreeType.DIPLOMACY, label: 'Diplomacy', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
        { id: TechTreeType.INFRASTRUCTURE, label: 'Infrastructure', icon: Atom, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
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

            <div className="flex-1 overflow-auto custom-scrollbar relative bg-[url('/grid-dark.svg')] bg-repeat">
                <div 
                    className="relative p-20 min-w-[6000px] min-h-[3000px]"
                    style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
                >
                    <TechConnectors 
                        techs={filteredTechs} 
                        unlockedTechIds={techState.unlockedTechIds} 
                        scale={1} 
                        offsetX={offsetX}
                        offsetY={offsetY}
                    />

                    {/* Tier Backgrounds (Horizontal Bands based on Y coordinate) */}
                    <div className="absolute inset-0 pointer-events-none opacity-20">
                        {/* Tier 1 - Expansion (Y: 0-2) */}
                        <div className="absolute top-[0px] left-0 right-0 h-[250px] border-b border-indigo-500/20 bg-gradient-to-b from-transparent to-indigo-900/10 flex items-end p-4">
                            <span className="text-xl font-display uppercase tracking-[0.5em] text-indigo-300 opacity-50">Tier I: Expansion</span>
                        </div>
                        {/* Tier 2 - Specialization (Y: 3-5) */}
                        <div className="absolute top-[300px] left-0 right-0 h-[300px] border-b border-purple-500/20 bg-gradient-to-b from-transparent to-purple-900/10 flex items-end p-4">
                            <span className="text-xl font-display uppercase tracking-[0.5em] text-purple-300 opacity-50">Tier II: Specialization</span>
                        </div>
                        {/* Tier 3 - Dominance (Y: 6-8) */}
                        <div className="absolute top-[600px] left-0 right-0 h-[300px] border-b border-red-500/20 bg-gradient-to-b from-transparent to-red-900/10 flex items-end p-4">
                            <span className="text-xl font-display uppercase tracking-[0.5em] text-red-300 opacity-50">Tier III: Dominance</span>
                        </div>
                        {/* Tier 4 - Transformation (Y: 9+) */}
                        <div className="absolute top-[900px] left-0 right-0 h-[400px] border-b border-amber-500/20 bg-gradient-to-b from-transparent to-amber-900/10 flex items-end p-4">
                            <span className="text-xl font-display uppercase tracking-[0.5em] text-amber-300 opacity-50">Tier IV: Transformation</span>
                        </div>
                    </div>

                    {filteredTechs.map(tech => {
                        const isUnlocked = unlockedSet.has(tech.id);
                        const isLocked = lockedSet.has(tech.id);
                        const slot = techState.activeSlots?.find(s => s.techId === tech.id);
                        const isResearching = !!slot;
                        const prereqsMet = (tech.prerequisites || []).every(pid => unlockedSet.has(pid));
                        const isAvailable = !isUnlocked && !isLocked && !isResearching && prereqsMet;

                        let progress = 0;
                        if (isResearching && slot) {
                            const elapsed = nowSeconds - (slot.startTime || 0);
                            const total = tech.researchCost;
                            progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
                        }

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

            <div className="p-4 bg-slate-900/60 border-t border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-6 max-w-5xl mx-auto italic">
                    <div className="flex items-center gap-2">
                        <Activity size={14} className="text-indigo-500" />
                        <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Archive Sync Status:</span>
                        <span className="text-[10px] font-mono text-green-400 uppercase">Synchronized</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
