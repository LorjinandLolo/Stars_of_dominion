"use client";

import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Radio, MapPin, AlertTriangle, Users, Target, Search, Info, Shield, Layers } from 'lucide-react';
import { AgentCard } from '@/components/panels/espionage/AgentCard';
import { 
    recruitAgentAction, 
    recallAgentAction, 
    assignAgentAction, 
    launchCovertOpAction 
} from '@/app/actions/espionage';
import type { OperationDomain } from '@/lib/espionage/espionage-types';

type TabType = 'operations' | 'agents' | 'recruitment';

export default function IntelligencePanel() {
    const { regions, espionageState, updateEspionage } = useUIStore();
    const [activeTab, setActiveTab] = useState<TabType>('operations');
    
    // Deployment Selection State
    const [deployingAgentId, setDeployingAgentId] = useState<string | null>(null);
    const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
    const [selectedDomain, setSelectedDomain] = useState<OperationDomain>('infrastructureSabotage');

    const handleDeploy = (agentId: string) => {
        setDeployingAgentId(agentId);
        setActiveTab('operations'); // Switch to operations/network view to pick a target
    };

    const confirmDeployment = async () => {
        if (!deployingAgentId || !selectedSystemId) return;
        
        const result = await assignAgentAction(deployingAgentId, selectedSystemId, selectedDomain);
        if (result.success) {
            updateEspionage({
                agents: espionageState.agents.map(a => 
                    a.id === deployingAgentId ? { 
                        ...a, 
                        status: 'deployed', 
                        deployedToSystemId: selectedSystemId,
                        deployedDomain: selectedDomain 
                    } : a
                )
            });
            setDeployingAgentId(null);
            setSelectedSystemId(null);
        }
    };

    const handleRecall = async (agentId: string) => {
        const result = await recallAgentAction(agentId);
        if (result.success) {
            // Optimistic / Local State Update
            updateEspionage({
                agents: espionageState.agents.map(a => 
                    a.id === agentId ? { ...a, status: 'available', deployedToSystemId: null } : a
                )
            });
        }
    };

    const handleRecruit = async (candidateId: string) => {
        const candidate = espionageState.candidates.find(c => c.id === candidateId);
        if (!candidate) return;

        // In the real app, we use our mocked faction info
        const factionId = 'player-faction'; 
        
        const result = await recruitAgentAction(candidate as any, factionId);
        if (result.success && result.data) {
            updateEspionage({
                agents: [...espionageState.agents, result.data],
                candidates: espionageState.candidates.filter(c => c.id !== candidateId),
            });
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/40">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800/60 backdrop-blur-md bg-slate-900/40">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="font-display text-sm tracking-widest text-amber-500 uppercase">Intelligence Agency</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tight">Clandestine Network & Field Ops</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 border border-slate-700 rounded text-slate-400 bg-slate-800/30">
                        OPSEC LEVEL 4
                    </span>
                </div>
            </div>

            {/* Global Metrics */}
            <div className="px-6 py-3 border-b border-slate-800/40 bg-slate-900/20">
                <div className="flex justify-between text-[10px] font-display tracking-widest text-slate-500 mb-1.5 uppercase">
                    <span>Empire-Wide Exposure</span>
                    <span className={espionageState.exposureRisk > 50 ? 'text-red-400' : 'text-amber-400'}>
                        {espionageState.exposureRisk}%
                    </span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full rounded-full transition-all duration-700" 
                        style={{ 
                            width: `${espionageState.exposureRisk}%`,
                            backgroundColor: espionageState.exposureRisk > 70 ? '#ef4444' : espionageState.exposureRisk > 40 ? '#f59e0b' : '#10b981'
                        }} 
                    />
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 bg-slate-900/10 border-b border-slate-800/40">
                <div className="flex gap-6">
                    {(['operations', 'agents', 'recruitment'] as TabType[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-3 text-[10px] font-display tracking-widest uppercase transition-all border-b-2 relative ${
                                activeTab === tab 
                                    ? 'text-amber-400 border-amber-500' 
                                    : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                {tab === 'operations' && <Target size={12} />}
                                {tab === 'agents' && <Users size={12} />}
                                {tab === 'recruitment' && <Search size={12} />}
                                {tab}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                {activeTab === 'operations' && (
                    <div className="space-y-6">
                        {/* Launch Operation Form */}
                        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-5">
                            <h3 className="text-[10px] font-display tracking-widest text-amber-500 uppercase mb-4 flex items-center gap-2">
                                <Search size={12} /> Launch New Operation
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Target Region</label>
                                    <select 
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[10px] text-slate-300 font-mono focus:border-amber-500/50 outline-none"
                                        onChange={(e) => setSelectedSystemId(e.target.value)}
                                        value={selectedSystemId || ''}
                                    >
                                        <option value="">-- SELECT TARGET --</option>
                                        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Domain</label>
                                    <select 
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[10px] text-slate-300 font-mono focus:border-amber-500/50 outline-none"
                                        onChange={(e) => setSelectedDomain(e.target.value as OperationDomain)}
                                        value={selectedDomain}
                                    >
                                        <option value="infrastructureSabotage">INFRA SABOTAGE</option>
                                        <option value="politicalSubversion">POL SUBVERSION</option>
                                        <option value="shadowEconomy">SHADOW ECONOMY</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button 
                                        disabled={!selectedSystemId}
                                        onClick={async () => {
                                            if (!selectedSystemId) return;
                                            const res = await launchCovertOpAction('player-faction', 'enemy-faction', selectedSystemId, selectedDomain, 0.5, 0.2);
                                            if (res.success) {
                                                // Success: could add local notification or refresh here
                                            }
                                        }}
                                        className={`w-full py-1.5 rounded uppercase font-display text-[10px] tracking-widest transition-all ${
                                            selectedSystemId 
                                                ? 'bg-amber-600 text-slate-950 hover:bg-amber-500' 
                                                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                        }`}
                                    >
                                        Deploy Operation
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Operations List */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 uppercase flex items-center gap-2">
                                <Target size={10} /> Active Operations
                            </div>
                            <div className="space-y-3">
                                {espionageState.operations.map((op) => {
                                    const region = regions.find((r) => r.id === op.targetRegionId);
                                    return (
                                        <div key={op.id} className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-4 hover:border-slate-700/80 transition-colors">
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <div className="text-xs font-mono tracking-wider text-slate-200 uppercase">
                                                        {op.domain.replace(/([A-Z])/g, ' $1')}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                                                        <MapPin size={10} className="text-slate-600" />
                                                        <span className="uppercase tracking-tighter">Target: {region?.name || 'External'}</span>
                                                    </div>
                                                </div>
                                                <span className="text-[9px] font-display px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10 uppercase">
                                                    {op.status}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold tracking-tighter">
                                                    <span>Investment Progress</span>
                                                    <span className="text-blue-400 font-mono">{Math.round(op.investmentLevel * 100)}%</span>
                                                </div>
                                                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: `${op.investmentLevel * 100}%` }} />
                                                </div>
                                                <div className="flex justify-end pt-1">
                                                    <span className="text-[9px] text-slate-600 font-mono uppercase">
                                                        ETA: {new Date(op.completesAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {espionageState.operations.length === 0 && (
                                    <div className="py-12 border border-dashed border-slate-800/50 rounded-lg flex flex-col items-center justify-center text-slate-600">
                                        <Target size={24} className="mb-2 opacity-20" />
                                        <p className="text-[10px] uppercase tracking-widest font-display">No active operations</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Network Coverage */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 uppercase flex items-center gap-2">
                                <Radio size={10} /> Intelligence Network Coverage
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {regions.map((region) => {
                                    const network = espionageState.networks.find(n => n.systemId === region.id);
                                    const isSelected = selectedSystemId === region.id;
                                    const isDeploymentMode = !!deployingAgentId;

                                    return (
                                        <div 
                                            key={region.id} 
                                            onClick={() => isDeploymentMode && setSelectedSystemId(region.id)}
                                            className={`flex items-center gap-3 px-3 py-3 border rounded-lg transition-all cursor-pointer ${
                                                isSelected 
                                                    ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/20' 
                                                    : isDeploymentMode
                                                        ? 'bg-slate-900/40 border-slate-700/50 hover:border-amber-500/30'
                                                        : 'bg-slate-900/30 border-slate-800/40 hover:bg-slate-900/50'
                                            }`}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_4px_currentColor]" style={{ color: region.color, backgroundColor: region.color }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] text-slate-300 truncate font-medium uppercase tracking-tight">{region.name}</div>
                                                <div className="text-[9px] text-slate-500 flex items-center gap-1.5 mt-0.5 uppercase">
                                                    {network ? (
                                                        <span className="flex items-center gap-1 text-emerald-400/80">
                                                            Str: {Math.round(network.strength * 100)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-700">Blind Domain</span>
                                                    )}
                                                </div>
                                            </div>
                                            {network && (
                                                <span className="text-[8px] px-1.5 py-0.5 border border-slate-800 rounded uppercase text-slate-500 font-mono">
                                                    {network.penetrationLevel}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Deployment Tool */}
                        {deployingAgentId && (
                            <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-5 shadow-[0_0_30px_rgba(245,158,11,0.05)] animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                        <Users size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-display tracking-widest text-amber-500 uppercase">Field Deployment Protocol</div>
                                        <div className="text-xs text-slate-300 font-mono">AGENT: {espionageState.agents.find(a => a.id === deployingAgentId)?.codename}</div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Operation Domain</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['infrastructureSabotage', 'politicalSubversion', 'shadowEconomy'] as OperationDomain[]).map((dom) => (
                                                <button
                                                    key={dom}
                                                    onClick={() => setSelectedDomain(dom)}
                                                    className={`px-3 py-2 rounded text-[9px] font-display uppercase tracking-widest border transition-all ${
                                                        selectedDomain === dom
                                                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                                                            : 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                                                    }`}
                                                >
                                                    {dom === 'infrastructureSabotage' && <Shield size={10} className="mb-1 mx-auto" />}
                                                    {dom === 'politicalSubversion' && <Users size={10} className="mb-1 mx-auto" />}
                                                    {dom === 'shadowEconomy' && <Layers size={10} className="mb-1 mx-auto" />}
                                                    <span className="block truncate">{dom.replace('infrastructure', '').replace('political', '').replace('shadow', '')}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button 
                                            onClick={() => setDeployingAgentId(null)}
                                            className="flex-1 px-4 py-2 border border-slate-700 text-slate-500 rounded uppercase font-display text-[10px] tracking-widest hover:bg-slate-800 transition-colors"
                                        >
                                            Abort
                                        </button>
                                        <button 
                                            disabled={!selectedSystemId}
                                            onClick={confirmDeployment}
                                            className={`flex-1 px-4 py-2 rounded uppercase font-display text-[10px] tracking-widest transition-all ${
                                                selectedSystemId
                                                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                                                    : 'bg-slate-800 text-slate-600 grayscale cursor-not-allowed opacity-50'
                                            }`}
                                        >
                                            Confirm Insertion
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'agents' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {espionageState.agents.map((agent) => (
                            <AgentCard 
                                key={agent.id} 
                                agent={agent} 
                                onDeploy={handleDeploy}
                                onRecall={handleRecall}
                            />
                        ))}
                        {espionageState.agents.length === 0 && (
                            <div className="col-span-full py-20 flex flex-col items-center text-slate-600">
                                <Users size={48} className="mb-4 opacity-10" />
                                <h3 className="font-display text-xs tracking-widest uppercase">No Active Assets</h3>
                                <p className="text-[10px] uppercase tracking-tighter mt-2">Intelligence network is currently unstaffed.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'recruitment' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {espionageState.candidates.map((candidate) => (
                            <div key={candidate.id} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden flex flex-col group hover:border-amber-500/30 transition-all duration-300">
                                <div className="p-4 bg-slate-900/80 border-b border-slate-800/40">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-base font-mono tracking-widest text-slate-100 uppercase leading-none">{candidate.codename}</div>
                                            <p className="text-[10px] text-slate-500 font-medium mt-1.5 uppercase tracking-tighter">{candidate.name}</p>
                                        </div>
                                        <div className="text-[10px] font-mono text-amber-500 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/20">
                                            § {candidate.recruitmentCost}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 flex-1 space-y-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {candidate.traitIds.map((trait) => (
                                            <span key={trait} className="text-[9px] bg-slate-800/80 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded uppercase tracking-tighter">
                                                {trait}
                                            </span>
                                        ))}
                                    </div>
                                    <button 
                                        className="w-full bg-slate-100 hover:bg-white text-slate-950 font-display text-[10px] py-2 rounded uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)] hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95"
                                        onClick={() => handleRecruit(candidate.id)}
                                    >
                                        Initiate Onboarding
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="px-6 py-2 border-t border-slate-800/40 bg-slate-900/40 flex items-center gap-2">
                <Info size={10} className="text-slate-500" />
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-medium italic">
                    All communications encrypted. Shadow protocol alpha engaged.
                </span>
            </div>
        </div>
    );
}
