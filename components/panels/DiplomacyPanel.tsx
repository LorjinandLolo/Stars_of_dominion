"use client";

import React, { useMemo, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Users, Shield, Target, Globe, BookOpen, Fingerprint, 
    Send, Skull, Heart, Activity, Flame, Zap, 
    FileText, Gavel, TrendingUp, Handshake, Scroll,
    AlertTriangle, ShieldCheck, DollarSign, Info, Eye
} from 'lucide-react';
import { 
    sendEnvoyAction, 
    declareWarAction, 
    offerPeaceAction,
    proposeTreatyAction,
    demandTributeAction,
    negotiateTradePactAction
} from '@/app/actions/politics';
import { sponsorProxyAction } from '@/app/actions/proxy';
import { TreatyType } from '@/lib/politics/cold-war-types';
import { buildReputationProfile } from '@/lib/integration/reputation-vm';
import type { ReputationSignal } from '@/lib/integration/types';

const FACTIONS = [
    {
        id: 'faction-aurelian',
        name: 'Aurelian Combine',
        color: '#3b82f6',
        description: 'A centralized industrial hegemony focused on order, expansion, and technological superiority.',
        alignment: 'Imperial / Order',
        strength: 'High',
        leader: 'Archon Valerius',
        traits: ['Industrial Powerhouse', 'Strict Hierarchy', 'Technological Zeal'],
    },
    {
        id: 'faction-vektori',
        name: 'Vektori Directorate',
        color: '#ef4444',
        description: 'A ruthless corporate-military conglomerate that prioritizes efficiency and profit above all else.',
        alignment: 'Mercantile / Authoritarian',
        strength: 'Moderate',
        leader: 'Director Kaelen',
        traits: ['Market Manipulation', 'Private Military', 'Resource Efficient'],
    },
    {
        id: 'faction-null-syndicate',
        name: 'Null Syndicate',
        color: '#a855f7',
        description: 'A shadowy network of hackers, smugglers, and information brokers operating from the deep space fringes.',
        alignment: 'Shadow / Subversive',
        strength: 'Variable',
        leader: 'The Whisper',
        traits: ['Information Warfare', 'Black Market Access', 'Untraceable'],
    },
    {
        id: 'faction-covenant',
        name: 'Covenant of Shogor',
        color: '#22c55e',
        description: 'A religious federation of worlds united by an ancient spiritual mandate.',
        alignment: 'Federalist / Spiritual',
        strength: 'Moderate',
        leader: 'High Priestess Elara',
        traits: ['Cultural Influence', 'Diplomatic Weight', 'Ancient Wisdom'],
    },
];

const TREATY_TYPES: { type: TreatyType, label: string, icon: any }[] = [
    { type: 'non_aggression', label: 'Non-Aggression Pact', icon: ShieldCheck },
    { type: 'mutual_defense', label: 'Mutual Defense Treaty', icon: Shield },
    { type: 'research_share', label: 'Research Sharing Agreement', icon: Zap },
    { type: 'intelligence_pact', label: 'Intelligence Cooperation', icon: Fingerprint },
    { type: 'open_borders', label: 'Open Borders Access', icon: Globe },
];

export default function DiplomacyPanel() {
    const { playerState, diplomacyState, politicsState, empireIdentity, updateDiplomacy } = useUIStore();
    const [activeTab, setActiveTab] = useState<'intel' | 'statecraft'>('statecraft');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    const liveFactions = useMemo(() => {
        return (politicsState.allFactions || []).filter(f => f.id !== playerState.factionId).map(f => {
            const mock = FACTIONS.find(m => m.id === f.id);
            return {
                id: f.id,
                name: f.name || mock?.name || f.id,
                color: mock?.color || '#94a3b8',
                description: mock?.description || 'Data on this faction is restricted or unavailable.',
                traits: mock?.traits || ['Sovereign State'],
                ...f
            };
        });
    }, [politicsState.allFactions, playerState.factionId]);

    const [selectedFactionId, setSelectedFactionId] = useState(liveFactions[0]?.id || '');
    const selectedFaction = liveFactions.find(f => f.id === selectedFactionId) || liveFactions[0];
    
    if (!selectedFaction) {
        return (
            <div className="flex flex-col h-full items-center justify-center text-slate-500 bg-slate-950/80 backdrop-blur-xl">
                <Globe className="w-12 h-12 mb-4 opacity-10 animate-pulse" />
                <span className="text-[10px] font-display tracking-[0.3em] uppercase">No External Factions Detected</span>
            </div>
        );
    }

    const rivalry = (diplomacyState.rivalries || []).find(r => 
        (r.empireAId === playerState.factionId && r.empireBId === selectedFactionId) ||
        (r.empireBId === playerState.factionId && r.empireAId === selectedFactionId)
    );

    const activeTreaties = (diplomacyState.treaties || []).filter(t => t.signatories.includes(selectedFactionId));

    const handleAction = async (actionId: string, promise: Promise<any>) => {
        setIsProcessing(actionId);
        try { await promise; } finally { setIsProcessing(null); }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/80 backdrop-blur-xl border-l border-white/5 text-slate-200 overflow-hidden relative">
            <div className="absolute inset-0 scanline-overlay pointer-events-none opacity-[0.03]" />

            {/* Header */}
            <div className="p-8 border-b border-white/5 bg-gradient-to-r from-indigo-500/10 via-transparent to-rose-500/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                            <Handshake className="w-7 h-7 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-display tracking-[0.2em] uppercase text-white">Neural Statecraft</h1>
                            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.3em] mt-1">Sovereign Diplomatic Uplink // Protocol 1.0</p>
                        </div>
                    </div>
                    
                    <div className="flex bg-black/60 p-1.5 rounded-xl border border-white/10 shadow-inner">
                        {(['statecraft', 'intel'] as const).map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2 rounded-lg text-[10px] font-display tracking-widest transition-all duration-300 ${
                                    activeTab === tab 
                                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]' 
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {tab.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Faction Selector Sidebar */}
                <div className="w-24 border-r border-white/5 flex flex-col gap-8 py-8 items-center bg-black/20 overflow-y-auto custom-scrollbar">
                    {liveFactions.map((faction) => (
                        <button
                            key={faction.id}
                            onClick={() => setSelectedFactionId(faction.id)}
                            className={`group relative w-14 h-14 rounded-2xl border transition-all duration-500 flex items-center justify-center overflow-hidden ${
                                selectedFactionId === faction.id 
                                ? 'border-indigo-500 shadow-[0_0_25px_rgba(99,102,241,0.3)] bg-indigo-500/20' 
                                : 'border-white/5 hover:border-white/20 grayscale opacity-40 hover:opacity-100 hover:grayscale-0 bg-white/5'
                            }`}
                        >
                            <Shield className="w-7 h-7" style={{ color: faction.color }} />
                            {selectedFactionId === faction.id && (
                                <div className="absolute left-0 top-0 w-1 h-full bg-indigo-500 shadow-[0_0_10px_indigo]" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>

                {/* Main Action Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-[url('/grid-dark.svg')] bg-repeat">
                    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
                        
                        {/* Profile Header */}
                        <div className="flex items-end justify-between border-b border-white/5 pb-8">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: selectedFaction.color }} />
                                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.4em]">Active Contact // {selectedFaction.id}</span>
                                </div>
                                <h2 className="text-5xl font-display uppercase tracking-[0.1em] text-white drop-shadow-2xl">{selectedFaction.name}</h2>
                                <div className="flex gap-2 pt-2">
                                    {selectedFaction.traits.map((trait: string) => (
                                        <span key={trait} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400 uppercase tracking-tighter">{trait}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="text-right glass-panel p-4 rounded-2xl border-white/10 group cursor-help transition-all hover:bg-white/5">
                                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Influence Rating</span>
                                <div className="flex items-center gap-3 justify-end">
                                    <div className="text-3xl font-mono text-white tracking-tighter">{(rivalry?.rivalryScore || 45.2).toFixed(1)}</div>
                                    <TrendingUp className="w-5 h-5 text-emerald-400 animate-bounce" />
                                </div>
                            </div>
                        </div>

                        {activeTab === 'statecraft' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                {/* Treaties & Accords */}
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[11px] font-display text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Scroll className="w-4 h-4" /> Sovereign Accords
                                        </h3>
                                        <span className="text-[9px] text-slate-500 font-mono italic">Multiplayer Synchronized</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {TREATY_TYPES.map(treaty => {
                                            const Icon = treaty.icon;
                                            const isActive = activeTreaties.some(t => t.type === treaty.type);
                                            return (
                                                <button
                                                    key={treaty.type}
                                                    onClick={() => handleAction(`treaty-${treaty.type}`, proposeTreatyAction(treaty.type, [playerState.factionId, selectedFactionId]))}
                                                    disabled={isActive || !!isProcessing}
                                                    className={`group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                                                        isActive 
                                                        ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400' 
                                                        : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-4 relative z-10">
                                                        <div className={`p-3 rounded-xl transition-colors ${isActive ? 'bg-emerald-500/20' : 'bg-black/60 border border-white/5 group-hover:border-indigo-500/50'}`}>
                                                            <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-indigo-400'}`} />
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-bold uppercase tracking-widest block">{treaty.label}</span>
                                                            <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Requires Mutual Consensus</span>
                                                        </div>
                                                    </div>
                                                    {isActive && <ShieldCheck className="w-5 h-5 opacity-50" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Aggressive Postures */}
                                <div className="space-y-6">
                                    <h3 className="text-[11px] font-display text-rose-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Skull className="w-4 h-4" /> Escalation Triggers
                                    </h3>
                                    <div className="glass-panel p-6 rounded-3xl border-white/5 space-y-6 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
                                        
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-end">
                                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Hostility Level</span>
                                                <span className="text-sm font-mono text-rose-400">CRITICAL</span>
                                            </div>
                                            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-orange-500 to-rose-600 rounded-full shadow-[0_0_15px_rgba(225,29,72,0.5)] transition-all duration-1000"
                                                    style={{ width: `${(rivalry?.escalationLevel || 4) * 14.28}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 pt-4">
                                            <button 
                                                onClick={() => handleAction('war', declareWarAction(playerState.factionId, selectedFactionId))}
                                                className="w-full py-4 rounded-xl bg-rose-600/10 border border-rose-600/30 text-rose-500 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-rose-600 hover:text-white transition-all duration-300 shadow-lg shadow-rose-900/10"
                                            >
                                                Unilateral Hostility Declaration
                                            </button>
                                            <div className="flex items-start gap-3 p-4 bg-black/40 rounded-xl border border-white/5">
                                                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-slate-500 leading-relaxed italic uppercase font-mono tracking-tighter">
                                                    Declaring war suspends all active trade pacts and treaties. Infamy penalty of +15.2 accumulation expected.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                                {/* Reputation Assessment */}
                                <ReputationAssessment
                                    factionId={selectedFactionId}
                                    repData={empireIdentity.reputation[selectedFactionId]}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer / Status Bar */}
            <div className="p-4 bg-black/40 border-t border-white/5 flex items-center justify-between px-10">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Archive Link: STABLE</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-white/10 pl-6">
                        <Activity className="w-3 h-3 text-slate-500" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Protocol Sync Latency: 14ms</span>
                    </div>
                </div>
                <div className="text-[9px] font-mono text-slate-600 uppercase">Sovereign OS v1.0.4 r75</div>
            </div>
        </div>
    );
}

// ── Reputation Assessment Sub-Component ──────────────────────────────────────

const CERTAINTY_CONFIG = {
    confirmed: { label: 'CONFIRMED', color: 'text-emerald-400', dot: 'bg-emerald-500 shadow-[0_0_6px_#10b981]' },
    suspected: { label: 'SUSPECTED', color: 'text-amber-400',   dot: 'bg-amber-500 shadow-[0_0_6px_#f59e0b]'  },
    unknown:   { label: 'UNKNOWN',   color: 'text-slate-500',    dot: 'bg-slate-600'                            },
};

function ReputationAssessment({ factionId, repData }: { factionId: string; repData: any }) {
    if (!repData) {
        return (
            <div className="glass-panel p-16 rounded-3xl border-dashed border-white/10 flex flex-col items-center gap-5">
                <Eye className="w-10 h-10 text-slate-700 animate-pulse" />
                <div className="text-center">
                    <span className="text-[10px] font-display text-slate-500 uppercase tracking-[0.3em] block">Intelligence Insufficient</span>
                    <p className="text-[9px] text-slate-600 mt-2 max-w-xs mx-auto">
                        No actionable data on this faction. Expand your espionage network to reveal behavioral patterns.
                    </p>
                </div>
            </div>
        );
    }

    const profile = buildReputationProfile(repData);

    return (
        <div className="space-y-7">
            {/* Assessment header */}
            <div>
                <div className="text-[9px] font-mono text-slate-500 uppercase tracking-[0.3em] mb-2">
                    Intelligence Assessment // Intel Quality: {profile.intelQuality}%
                </div>
                <p className="text-sm text-slate-300 leading-relaxed italic">{profile.tendencyDescription}</p>
            </div>

            {/* Trait signals */}
            {profile.knownTraits.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-[10px] font-display text-slate-400 uppercase tracking-[0.2em]">Known Behavioral Traits</h4>
                    {profile.knownTraits.map((signal: ReputationSignal, i: number) => {
                        const cert = CERTAINTY_CONFIG[signal.certainty];
                        return (
                            <div key={i} className="flex items-start justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${cert.dot}`} />
                                    <div>
                                        <div className="text-xs font-display text-white uppercase tracking-wide">{signal.label}</div>
                                        {signal.source && (
                                            <div className="text-[9px] text-slate-500 mt-0.5">{signal.source}</div>
                                        )}
                                    </div>
                                </div>
                                <span className={`text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-black/40 ${cert.color}`}>
                                    {cert.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Recent actions */}
            {profile.recentActions && profile.recentActions.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-[10px] font-display text-slate-400 uppercase tracking-[0.2em]">Recent Activity Log</h4>
                    <div className="space-y-1.5">
                        {profile.recentActions.map((a: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-[9px] py-2 border-b border-white/5 last:border-0">
                                <span className="text-slate-400 uppercase tracking-wide">{a.action.replace(/_/g, ' ')}</span>
                                <span className="text-slate-600 font-mono">{a.effect}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="text-[9px] text-slate-600 italic">
                ⚠ This assessment reflects intercepted patterns, not confirmed intelligence. Estimates may be inaccurate.
            </div>
        </div>
    );
}
