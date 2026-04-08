"use client";

import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Shield, 
    Sword, 
    Crosshair, 
    Zap, 
    Activity, 
    AlertTriangle, 
    ChevronRight, 
    Target,
    BarChart2,
    Skull,
    History
} from 'lucide-react';
import { selectCombatStanceAction, selectCombatDirectiveAction } from '@/app/actions/combat';
import { CombatStance, PostBattleDirective } from '@/lib/combat/combat-types';
import { getPredictionHints } from '@/lib/integration/doctrine-bias';
import { BrainCircuit, Sparkles } from 'lucide-react';

interface StanceOption {
    id: CombatStance;
    label: string;
    description: string;
    color: string;
}

const STANCES: StanceOption[] = [
    { id: 'blitz', label: 'BLITZ', description: 'Aggressive push, high damage but risky.', color: 'text-red-400' },
    { id: 'shock', label: 'SHOCK', description: 'Overwhelming force to break morale.', color: 'text-orange-400' },
    { id: 'feint', label: 'FEINT', description: 'Deceptive move to draw out the enemy.', color: 'text-blue-400' },
    { id: 'entrench', label: 'ENTRENCH', description: 'Defensive posture, lowering casualties.', color: 'text-green-400' },
    { id: 'sabotage', label: 'SABOTAGE', description: 'Target supply lines and infrastructure.', color: 'text-purple-400' },
    { id: 'withdraw', label: 'WITHDRAW', description: 'Orderly retreat to minimize losses.', color: 'text-slate-400' },
];

const DIRECTIVES: { id: PostBattleDirective; label: string }[] = [
    { id: 'consolidate', label: 'CONSOLIDATE' },
    { id: 'exploit', label: 'EXPLOIT' },
    { id: 'pillage', label: 'PILLAGE' },
    { id: 'pursue', label: 'PURSUE' },
    { id: 'orderly_retreat', label: 'ORDERLY RETREAT' },
];

export default function BattleCommandPanel() {
    const { activeCombats, playerState } = useUIStore();
    const [selectedCombatId, setSelectedCombatId] = useState<string | null>(activeCombats[0]?.id || null);
    const [loading, setLoading] = useState(false);
    const [predictedStance, setPredictedStance] = useState<string>('');

    const activeCombat = activeCombats.find(c => c.id === selectedCombatId);

    if (activeCombats.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
                    <Shield size={32} className="text-slate-600" />
                </div>
                <h2 className="font-display text-lg tracking-widest text-slate-400">NO ACTIVE ENGAGEMENTS</h2>
                <p className="text-sm text-slate-500 max-w-xs">Deployment of tactical overrides requires an ongoing combat engagement.</p>
            </div>
        );
    }

    const handleSetStance = async (stance: CombatStance) => {
        if (!selectedCombatId) return;
        setLoading(true);
        await selectCombatStanceAction(selectedCombatId, playerState.factionId, stance, predictedStance || undefined);
        setLoading(false);
    };

    const handleSetDirective = async (directive: PostBattleDirective) => {
        if (!selectedCombatId) return;
        setLoading(true);
        await selectCombatDirectiveAction(selectedCombatId, playerState.factionId, directive);
        setLoading(false);
    };

    const role = activeCombat?.attacker.factionId === playerState.factionId ? 'attacker' : 'defender';
    const mySide = role === 'attacker' ? activeCombat?.attacker : activeCombat?.defender;
    const enemySide = role === 'attacker' ? activeCombat?.defender : activeCombat?.attacker;

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700/40 flex justify-between items-center bg-slate-900/40">
                <div>
                    <h2 className="font-display text-sm tracking-widest text-red-500 flex items-center gap-2">
                        <Activity size={16} /> BATTLE COMMAND
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5 tracking-tighter">TACTICAL OVERRIDES & ENGAGEMENT MONITORING</p>
                </div>
                <div className="flex gap-2">
                    {activeCombats.map((c, i) => (
                        <button
                            key={c.id}
                            onClick={() => setSelectedCombatId(c.id)}
                            className={`w-8 h-8 rounded border flex items-center justify-center transition-all ${
                                selectedCombatId === c.id 
                                ? 'bg-red-600 border-red-500 shadow-[0_0_10px_rgba(220,38,38,0.4)]' 
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                            }`}
                        >
                            <span className="text-[10px] font-bold">{i + 1}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {activeCombat ? (
                    <>
                        {/* Status Overview */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                                <div className="text-[10px] font-display text-slate-500 mb-2 uppercase tracking-widest">Your Forces ({role})</div>
                                <div className="flex justify-between items-end">
                                    <div className="text-2xl font-mono font-bold text-slate-100">{Math.round(mySide?.baseForceCount || 0)}</div>
                                    <div className="text-xs text-red-400">-{Math.round(mySide?.casualties || 0)} losses</div>
                                </div>
                                <div className="mt-4 space-y-2">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500">MORALE</span>
                                        <span className="text-slate-300">{(mySide?.morale || 0) * 100}%</span>
                                    </div>
                                    <div className="h-1 bg-slate-800 rounded-full">
                                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(mySide?.morale || 0) * 100}%` }} />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4 relative overflow-hidden text-right">
                                <div className="absolute top-0 right-0 w-1 h-full bg-red-600" />
                                <div className="text-[10px] font-display text-slate-500 mb-2 uppercase tracking-widest">Opposing Force</div>
                                <div className="flex flex-row-reverse justify-between items-end">
                                    <div className="text-2xl font-mono font-bold text-slate-100">{Math.round(enemySide?.baseForceCount || 0)}</div>
                                    <div className="text-xs text-green-400">-{Math.round(enemySide?.casualties || 0)} losses</div>
                                </div>
                                <div className="mt-4 space-y-2 text-left">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-500 uppercase tracking-widest">MOMENTUM</span>
                                        <span className={`${activeCombat.momentum > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                            {activeCombat.momentum > 0 ? 'ATTACKER' : 'DEFENDER'} {Math.round(Math.abs(activeCombat.momentum) * 100)}%
                                        </span>
                                    </div>
                                    <div className="h-1 bg-slate-800 rounded-full relative">
                                        <div 
                                            className={`h-full absolute top-0 rounded-full transition-all ${activeCombat.momentum > 0 ? 'bg-red-600 right-1/2' : 'bg-blue-500 left-1/2'}`} 
                                            style={{ width: `${Math.abs(activeCombat.momentum) * 50}%` }} 
                                        />
                                        <div className="absolute top-0 left-1/2 w-0.5 h-full bg-slate-600 -translate-x-1/2" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stance Selection */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                                <Target size={10} /> TACTICAL STANCE SELECTION (ROUND {activeCombat.round})
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {STANCES.map(s => (
                                    <button
                                        key={s.id}
                                        disabled={loading}
                                        onClick={() => handleSetStance(s.id)}
                                        className={`p-3 rounded-lg border text-left transition-all ${
                                            mySide?.selectedStance === s.id
                                            ? 'bg-red-900/10 border-red-500 ring-1 ring-red-500/30'
                                            : 'bg-slate-900/40 border-slate-700/50 hover:border-slate-500'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold tracking-widest ${s.color}`}>{s.label}</span>
                                            {mySide?.selectedStance === s.id && <Zap size={10} className="text-amber-400 fill-amber-400" />}
                                        </div>
                                        <div className="text-[10px] text-slate-400 leading-tight">{s.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Prediction Selection */}
                        <div className="border-t border-white/5 pt-6">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                                <BrainCircuit size={10} /> PREDICT OPPONENT STANCE
                            </div>
                            <p className="text-[10px] text-slate-600 italic mb-4">
                                Correctly guessing the enemy's next move grants a tactical windfall (+100 credits).
                            </p>
                            
                            <div className="grid grid-cols-3 gap-2">
                                {getPredictionHints(null, STANCES.map(s => ({ id: s.id, name: s.label, description: s.description }))).map(hint => (
                                    <button
                                        key={hint.id}
                                        onClick={() => setPredictedStance(prev => prev === hint.id ? '' : hint.id)}
                                        className={`p-2 rounded border text-center transition-all ${
                                            predictedStance === hint.id
                                            ? 'bg-blue-900/20 border-blue-500 ring-1 ring-blue-500/50'
                                            : hint.weightHint === 'likely' 
                                                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' 
                                                : 'bg-slate-900/40 border-slate-700/50 text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        <div className="text-[9px] font-bold tracking-widest uppercase">{hint.label}</div>
                                        {hint.weightHint === 'likely' && <div className="text-[7px] text-emerald-600 mt-1 uppercase font-mono">Likely</div>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Post-Battle Directive */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                                <ChevronRight size={10} /> END-STATE DIRECTIVES
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {DIRECTIVES.map(d => (
                                    <button
                                        key={d.id}
                                        disabled={loading}
                                        onClick={() => handleSetDirective(d.id)}
                                        className={`px-3 py-1.5 rounded border text-[10px] font-display tracking-wider transition-all ${
                                            mySide?.selectedDirective === d.id
                                            ? 'bg-amber-600 border-amber-500 text-white'
                                            : 'bg-slate-900/40 border-slate-700/50 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {d.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Intelligence Tip */}
                        <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-3 flex gap-3">
                            <History className="text-blue-500 shrink-0" size={18} />
                            <div>
                                <div className="text-[10px] font-display font-bold text-blue-400 tracking-wider uppercase flex items-center gap-2">
                                    <Sparkles size={10} /> Tactical Intel Summary
                                </div>
                                <div className="text-[10px] text-slate-400 leading-relaxed mt-1">
                                    Current engagement level: <span className="text-blue-200 uppercase">{activeCombat.phase || 'ORBITAL'}</span>.
                                    The enemy is utilizing <span className="text-amber-400 font-bold">UNPREDICTABLE</span> doctrines. 
                                    Stance predictions: <span className="text-slate-300">Evaluating Tendencies...</span>
                                    {predictedStance && <div className="text-emerald-400 mt-1 font-mono uppercase">Prediction locked: {predictedStance}</div>}
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {/* Footer / Action */}
            <div className="p-6 border-t border-slate-700/40 bg-slate-900/20">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                    <div className="text-[10px] text-slate-500 italic">
                        Stance overrides are applied at the start of the next simulation round. Directives are executed upon battle resolution.
                    </div>
                </div>
            </div>
        </div>
    );
}
