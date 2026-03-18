import * as React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Scale, Users, Globe, CheckCircle, XCircle, TrendingUp, Zap, AlertCircle, FileText, MessageSquare } from 'lucide-react';
import { enactPolicyAction } from '@/app/actions/politics';

const GOV_TYPES: Record<string, { label: string; color: string }> = {
    'faction-aurelian': { label: 'Imperial Directorate', color: '#3b82f6' },
    'faction-vektori': { label: 'Federated Republic', color: '#ef4444' },
    'faction-null-syndicate': { label: 'Oligarchic Syndicate', color: '#a855f7' },
    'faction-covenant': { label: 'Theocratic Council', color: '#22c55e' },
};

const POLICIES = [
    { id: 'militarize', name: 'Militarize Production', description: 'Increased output for shipyards, favors Military bloc.', icon: <Zap size={14} /> },
    { id: 'open_trade', name: 'Open Trade Corridors', description: 'Boosts trade efficiency, favors mercantile interests.', icon: <Globe size={14} /> },
    { id: 'research_push', name: 'Technological Push', description: 'Accelerates innovation, favors the Science bloc.', icon: <FileText size={14} /> },
    { id: 'expand_frontier', name: 'Frontier Subsidies', description: 'Supports outward expansion and frontier stability.', icon: <TrendingUp size={14} /> },
];

export default function GovernmentPanel() {
    const { playerState, regions, politicsState, updatePolitics, setActiveTab, updateDiscourse } = useUIStore();
    const govType = GOV_TYPES[playerState.factionId] ?? { label: 'Unknown', color: '#94a3b8' };

    const controlledSystems = regions.flatMap(r => r.systemIds).length;

    const handleEnactPolicy = async (policyId: string) => {
        const res = await enactPolicyAction(playerState.factionId, policyId);
        if (res.success) {
            // Optimistic update
            const updatedPolicies = politicsState.activePolicies.includes(policyId)
                ? politicsState.activePolicies
                : [...politicsState.activePolicies, policyId];
            
            updatePolitics({ activePolicies: updatedPolicies });
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/40">
                <h2 className="font-display text-sm tracking-widest text-amber-400 uppercase">Government Domain</h2>
                <p className="text-xs text-slate-500 mt-0.5">Internal stability & institutional power blocs</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Government type & Crisis Status */}
                <div className="space-y-3">
                    <div className="bg-slate-900/60 border rounded-lg p-4 space-y-3" style={{ borderColor: politicsState.crisisConditionMet ? '#ef4444' : `${govType.color}44` }}>
                        <div className="flex justify-between items-start">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase">Current Administration</div>
                            {politicsState.crisisConditionMet && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-[9px] font-display animate-pulse uppercase">
                                    <AlertCircle size={10} /> Domestic Crisis
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                                <Scale size={20} style={{ color: govType.color }} />
                            </div>
                            <div>
                                <div className="font-display text-sm" style={{ color: govType.color }}>{govType.label}</div>
                                <div className="text-xs text-slate-400 mt-0.5 capitalize tracking-tight font-medium">
                                    {playerState.role} ROLE · {playerState.factionId.replace('faction-', '').toUpperCase()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {politicsState.activeIndicators.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {politicsState.activeIndicators.map(indicator => (
                                <span key={indicator} className="text-[9px] font-display px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded uppercase tracking-wider">
                                    {indicator.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Power Blocs */}
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <Users size={12} className="text-indigo-400" /> INSTITUTIONAL POWER BLOCS
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {politicsState.blocs.map((bloc) => (
                            <div key={bloc.id} className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 transition-all hover:bg-slate-900/60 group">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="text-xs font-display text-slate-200 uppercase tracking-wide group-hover:text-amber-400 transition-colors">{bloc.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">INFLUENCE: {bloc.influence}%</div>
                                    </div>
                                    <div className={`text-[10px] font-mono font-bold ${bloc.satisfaction > 70 ? 'text-green-400' : bloc.satisfaction < 40 ? 'text-red-400' : 'text-amber-400'}`}>
                                        {bloc.satisfaction}% SATISFIED
                                    </div>
                                </div>
                                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden flex gap-0.5">
                                    <div 
                                        className={`h-full transition-all duration-700 ${bloc.satisfaction > 70 ? 'bg-green-500' : bloc.satisfaction < 40 ? 'bg-red-500' : 'bg-amber-500'}`} 
                                        style={{ width: `${bloc.satisfaction}%` }} 
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        updateDiscourse({ activeFactionId: bloc.id });
                                        setActiveTab('discourse');
                                    }}
                                    className="mt-3 w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 rounded text-[9px] font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageSquare size={10} /> Open Direct Discourse
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Policy Enactment */}
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <Zap size={12} className="text-amber-400" /> GOVERNMENT DOCTRINE & POLICIES
                    </div>
                    <div className="space-y-2">
                        {POLICIES.map((policy) => {
                            const isActive = politicsState.activePolicies.includes(policy.id);
                            return (
                                <div key={policy.id} className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${isActive ? 'bg-blue-900/10 border-blue-500/30' : 'bg-slate-900/30 border-slate-800/40 hover:border-slate-700'}`}>
                                    <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-500'}`}>
                                        {policy.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-display tracking-wide uppercase ${isActive ? 'text-blue-400' : 'text-slate-300'}`}>{policy.name}</div>
                                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{policy.description}</div>
                                    </div>
                                    <button
                                        onClick={() => handleEnactPolicy(policy.id)}
                                        className={`px-3 py-1.5 rounded text-[10px] font-display transition-all ${
                                            isActive 
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-default' 
                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                        }`}
                                    >
                                        {isActive ? 'ACTIVE' : 'ENACT'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
