"use client";

import React from 'react';
import { CheckCircle, XCircle, Zap, Target } from 'lucide-react';
import type { ResolutionSummary } from '@/lib/integration/types';

interface ResolutionSummaryCardProps {
    summary: ResolutionSummary;
    onClose?: () => void;
}

const WINNER_CONFIG = {
    defender: { label: 'DEFENSE HELD', color: 'text-blue-400', glow: 'shadow-[0_0_30px_rgba(59,130,246,0.2)]' },
    attacker: { label: 'SECTOR LOST',  color: 'text-red-400',  glow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]'  },
    draw:     { label: 'STALEMATE',    color: 'text-amber-400', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.2)]' },
};

export default function ResolutionSummaryCard({ summary, onClose }: ResolutionSummaryCardProps) {
    const cfg = WINNER_CONFIG[summary.winner];

    return (
        <div className={`bg-slate-950/98 border border-white/10 rounded-2xl p-8 max-w-lg w-full ${cfg.glow} animate-in slide-in-from-bottom-4 duration-500`}>

            {/* Outcome header */}
            <div className="text-center mb-8">
                <div className={`text-3xl font-display tracking-[0.3em] uppercase mb-3 ${cfg.color}`}>
                    {cfg.label}
                </div>
                <p className="text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">{summary.message}</p>
            </div>

            {/* Actions breakdown */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/20">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Target size={10} /> Your Action
                    </div>
                    <div className="text-sm font-display text-blue-400 font-bold uppercase tracking-wide">
                        {summary.yourActionLabel}
                    </div>
                </div>
                <div className="p-4 bg-red-500/5 rounded-xl border border-red-500/20">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Target size={10} /> Opponent Action
                    </div>
                    <div className="text-sm font-display text-red-400 font-bold uppercase tracking-wide">
                        {summary.opponentActionLabel}
                    </div>
                </div>
            </div>

            {/* Prediction result */}
            {summary.prediction && (
                <div className={`p-4 rounded-xl border mb-4 flex items-center gap-4 ${
                    summary.prediction.correct
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : 'bg-slate-800/40 border-white/5'
                }`}>
                    {summary.prediction.correct
                        ? <CheckCircle className="text-emerald-400 shrink-0" size={20} />
                        : <XCircle className="text-slate-500 shrink-0" size={20} />
                    }
                    <div>
                        <div className={`text-xs font-display uppercase tracking-widest ${
                            summary.prediction.correct ? 'text-emerald-400' : 'text-slate-500'
                        }`}>
                            Prediction {summary.prediction.correct ? 'Correct' : 'Incorrect'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                            You predicted: <span className="text-slate-300">{summary.prediction.predictedActionId.replace(/_/g, ' ')}</span>
                            {summary.prediction.bonusApplied && (
                                <span className="text-emerald-400 ml-2">→ {summary.prediction.bonusApplied}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Doctrine effects */}
            {summary.doctrineEffectsApplied.length > 0 && (
                <div className="mb-4 space-y-1">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                        <Zap size={10} /> Doctrine Effects
                    </div>
                    {summary.doctrineEffectsApplied.map((effect, i) => (
                        <div key={i} className="text-[10px] text-violet-400 py-0.5">{effect}</div>
                    ))}
                </div>
            )}

            {/* Reputation signals */}
            {summary.reputationSignals.length > 0 && (
                <div className="mb-6 space-y-1">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Intel Updated</div>
                    {summary.reputationSignals.map((sig, i) => (
                        <div key={i} className="text-[10px] text-cyan-400 py-0.5">{sig}</div>
                    ))}
                </div>
            )}

            {onClose && (
                <button
                    onClick={onClose}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-display uppercase tracking-widest text-slate-400 transition-all mt-2"
                >
                    Close Report
                </button>
            )}
        </div>
    );
}
