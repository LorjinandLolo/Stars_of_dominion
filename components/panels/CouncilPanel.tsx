"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Shield, AlertTriangle, Split, Users, Vote, Gavel, TrendingUp, DollarSign } from 'lucide-react';
import type { CouncilStatus } from '@/types/ui-state';
import { castCouncilVoteAction, supportBlocAction, lobbyCouncilAction } from '@/app/actions/politics';

const STATUS_CONFIG: Record<CouncilStatus, { label: string; color: string; description: string }> = {
    absent: { label: 'ABSENT', color: '#475569', description: 'No galactic institution exists.' },
    founded: { label: 'FOUNDED', color: '#22c55e', description: 'Council is active and functional.' },
    split: { label: 'SPLIT', color: '#f59e0b', description: 'Two blocs in open competition.' },
    collapsed: { label: 'COLLAPSED', color: '#ef4444', description: 'Council authority has dissolved.' },
};

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="font-display tracking-wide text-slate-400">{label}</span>
                <span className="font-mono" style={{ color }}>{value}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

export default function CouncilPanel() {
    const { councilState, updateCouncil } = useUIStore();
    const sc = STATUS_CONFIG[councilState.status];

    const handleVote = async (rid: string, vote: 'support' | 'oppose') => {
        const res = await castCouncilVoteAction(rid, vote);
        if (res.success) {
            // Optimistic update: increase legitimacy slightly on vote, shift polarization
            updateCouncil({
                legitimacy: Math.min(100, councilState.legitimacy + 1),
                polarization: vote === 'oppose' ? Math.min(100, councilState.polarization + 2) : Math.max(0, councilState.polarization - 1)
            });
        }
    };

    const handleSupportBloc = async (blocId: string) => {
        const res = await supportBlocAction(blocId);
        if (res.success) {
            const updatedBlocs = councilState.blocs?.map(b => 
                b.id === blocId ? { ...b, influenceScore: Math.min(100, b.influenceScore + 5) } : b
            );
            updateCouncil({ blocs: updatedBlocs });
        }
    };

    const handleLobby = async () => {
        const res = await lobbyCouncilAction();
        if (res.success) {
            updateCouncil({ 
                legitimacy: Math.min(100, councilState.legitimacy + 5),
                corruptionExposure: Math.min(100, councilState.corruptionExposure + 3)
            });
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/40">
                <div className="flex items-center gap-2 mb-0.5">
                    <Shield size={14} className="text-indigo-400" />
                    <h2 className="font-display text-sm tracking-widest text-amber-400 uppercase">Council Registry</h2>
                    <span
                        className="ml-auto text-[10px] font-display px-1.5 py-0.5 rounded"
                        style={{ color: sc.color, backgroundColor: `${sc.color}22`, border: `1px solid ${sc.color}44` }}
                    >
                        {sc.label}
                    </span>
                </div>
                <p className="text-xs text-slate-500">{sc.description}</p>
            </div>

            {/* Emergency session banner */}
            {councilState.emergencySession && (
                <div className="flex items-center gap-2 px-6 py-2 bg-red-950/40 border-b border-red-800/50 text-xs text-red-400 font-display animate-pulse">
                    <AlertTriangle size={11} />
                    EMERGENCY SESSION IN PROGRESS
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Institutional metrics */}
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 uppercase">Institutional Health</div>
                    <div className="space-y-3">
                        <StatRow label="LEGITIMACY" value={councilState.legitimacy} color="#6366f1" />
                        <StatRow label="COHESION" value={councilState.cohesion} color="#22c55e" />
                        <StatRow label="POLARIZATION" value={councilState.polarization} color="#ef4444" />
                        <StatRow label="ENFORCEMENT" value={councilState.enforcementCapacity} color="#f59e0b" />
                        <StatRow label="CORRUPTION EXPOSURE" value={councilState.corruptionExposure} color="#f97316" />
                    </div>
                    <button
                        onClick={handleLobby}
                        className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-display transition-colors"
                    >
                        <TrendingUp size={12} />
                        LOBBY COUNCIL (2500 CR)
                    </button>
                </div>

                {/* Blocs (split state) */}
                {councilState.status === 'split' && councilState.blocs && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                            <Split size={12} className="text-amber-500" /> COMPETITIVE BLOCS
                        </div>
                        <div className="space-y-3">
                            {councilState.blocs.map((bloc, idx) => (
                                <div key={bloc.id} className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-4 transition-all hover:bg-slate-900/60">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: idx === 0 ? '#3b82f6' : '#ef4444' }} />
                                            <span className="text-xs font-display text-slate-200 uppercase tracking-wide">{bloc.name}</span>
                                        </div>
                                        <span className="text-xs font-mono text-amber-500">{bloc.influenceScore}</span>
                                    </div>
                                    {/* Influence bar */}
                                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden mb-3">
                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bloc.influenceScore}%`, backgroundColor: idx === 0 ? '#3b82f6' : '#ef4444' }} />
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-1 mb-4">
                                        {bloc.memberFactionIds.map((fid) => (
                                            <span key={fid} className="text-[9px] font-display px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase tracking-tight">
                                                {fid.replace('faction-', '').toUpperCase()}
                                            </span>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => handleSupportBloc(bloc.id)}
                                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-[10px] font-display text-slate-300 rounded border border-slate-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Users size={12} className="text-indigo-400" />
                                        INJECT INFLUENCE
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Active resolutions */}
                {councilState.activeResolutionIds && councilState.activeResolutionIds.length > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                            <Gavel size={12} className="text-indigo-400" /> ACTIVE RESOLUTIONS
                        </div>
                        <div className="space-y-2">
                            {councilState.activeResolutionIds.map((rid) => (
                                <div key={rid} className="flex items-center gap-2 p-3 bg-slate-900/40 border border-slate-800/50 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-display tracking-wider text-slate-200 uppercase truncate">{rid.replace(/-/g, ' ')}</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tighter">VOTING PHASE ACTIVE</div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => handleVote(rid, 'support')}
                                            className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500 hover:text-black text-green-500 border border-green-500/30 rounded text-[10px] font-display transition-all"
                                        >
                                            YEA
                                        </button>
                                        <button
                                            onClick={() => handleVote(rid, 'oppose')}
                                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 hover:text-black text-red-500 border border-red-500/30 rounded text-[10px] font-display transition-all"
                                        >
                                            NAY
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
