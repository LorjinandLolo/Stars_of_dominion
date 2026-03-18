"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Users, Shield, Target, Globe, BookOpen, Fingerprint, 
    Send, Skull, Heart, Activity, Flame, Zap, 
    FileText, Gavel, TrendingUp, Handshake, Scroll,
    AlertTriangle, ShieldCheck, DollarSign
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

const ESCALATION_LABELS = [
    'Calm Competition',
    'Hostile Messaging',
    'Sanctions & Propaganda',
    'Proxy Intervention',
    'Major Covert War',
    'Sustained Cold War',
    'Near-Hot War',
    'DIRECT WAR RISK'
];

const TREATY_TYPES: { type: TreatyType, label: string, icon: any }[] = [
    { type: 'non_aggression', label: 'Non-Aggression Pact', icon: ShieldCheck },
    { type: 'mutual_defense', label: 'Mutual Defense Treaty', icon: Shield },
    { type: 'research_share', label: 'Research Sharing Agreement', icon: Zap },
    { type: 'intelligence_pact', label: 'Intelligence Cooperation', icon: Fingerprint },
    { type: 'open_borders', label: 'Open Borders Access', icon: Globe },
];

export default function DiplomacyPanel() {
    const { playerState, diplomacyState, updateDiplomacy } = useUIStore();
    const [activeTab, setActiveTab] = React.useState<'intel' | 'statecraft'>('statecraft');
    const [selectedFactionId, setSelectedFactionId] = React.useState(FACTIONS[0].id);
    const [isProcessing, setIsProcessing] = React.useState<string | null>(null);

    const selectedFaction = FACTIONS.find(f => f.id === selectedFactionId) || FACTIONS[0];
    
    // Find real rivalry state for this faction
    const rivalry = diplomacyState.rivalries.find(r => 
        (r.empireAId === playerState.factionId && r.empireBId === selectedFactionId) ||
        (r.empireBId === playerState.factionId && r.empireAId === selectedFactionId)
    );

    const activeTreaties = diplomacyState.treaties.filter(t => t.signatories.includes(selectedFactionId));
    const activePacts = diplomacyState.tradePacts.filter(p => 
        (p.empireAId === selectedFactionId || p.empireBId === selectedFactionId)
    );
    const activeTributes = diplomacyState.tributes.filter(t => t.vassalId === selectedFactionId || t.overlordId === selectedFactionId);

    const handleAction = async (actionId: string, promise: Promise<any>) => {
        setIsProcessing(actionId);
        try {
            const res = await promise;
            if (res.success) {
                // For a real app, the server action would revalidate or return fresh data
                // For this demo, we assume the world state is updated on the next tick or via optimistic store updates if we wanted to add them.
            }
        } finally {
            setIsProcessing(null);
        }
    };

    const handleProposeTreaty = (type: TreatyType) => {
        handleAction(`treaty-${type}`, proposeTreatyAction(type, [playerState.factionId, selectedFactionId]));
    };

    const handleDemandTribute = () => {
        handleAction('tribute', demandTributeAction(selectedFactionId, playerState.factionId, 'energy', 100));
    };

    const handleNegotiateTrade = () => {
        handleAction('trade', negotiateTradePactAction(playerState.factionId, selectedFactionId, { 'energy': 1.05 }, true));
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/80 backdrop-blur-xl border-l border-white/5 text-slate-200">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-gradient-to-r from-blue-500/10 via-transparent to-red-500/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Handshake className="w-6 h-6 text-blue-400" />
                        <div>
                            <h1 className="text-xl font-display tracking-[0.2em] uppercase text-white">Advanced Statecraft</h1>
                            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-1">Sovereign Diplomatic Terminal</p>
                        </div>
                    </div>
                    
                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                        <button 
                            onClick={() => setActiveTab('statecraft')}
                            className={`px-4 py-1.5 rounded text-[10px] font-display transition-all ${activeTab === 'statecraft' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-white'}`}
                        >
                            STATECRAFT
                        </button>
                        <button 
                            onClick={() => setActiveTab('intel')}
                            className={`px-4 py-1.5 rounded text-[10px] font-display transition-all ${activeTab === 'intel' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-white'}`}
                        >
                            INTELLIGENCE
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Faction List (Left) */}
                <div className="w-20 border-r border-white/5 flex flex-col gap-6 p-4 items-center bg-black/40">
                    {FACTIONS.map((faction) => (
                        <button
                            key={faction.id}
                            onClick={() => setSelectedFactionId(faction.id)}
                            className={`group relative w-12 h-12 rounded-xl border transition-all duration-300 flex items-center justify-center ${
                                selectedFactionId === faction.id 
                                ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-blue-500/10' 
                                : 'border-white/5 hover:border-white/20 grayscale opacity-40 hover:opacity-100 hover:grayscale-0 bg-white/5'
                            }`}
                        >
                            <Shield className="w-6 h-6" style={{ color: faction.color }} />
                            {selectedFactionId === faction.id && (
                                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-1 h-4 bg-blue-500 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Main Content (Right) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
                        
                        {/* Faction Profile Bar */}
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em] block mb-2">Target Profile: {selectedFaction.id}</span>
                                <h2 className="text-4xl font-display uppercase tracking-widest text-white">{selectedFaction.name}</h2>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Diplomatic Weight</span>
                                <div className="flex items-center gap-2">
                                    <div className="text-2xl font-mono text-white">88.4</div>
                                    <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] rounded uppercase font-bold tracking-tighter">Rising</div>
                                </div>
                            </div>
                        </div>

                        {activeTab === 'statecraft' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Left Column: Proposals & Treaties */}
                                <div className="space-y-8">
                                    <section className="space-y-4">
                                        <h3 className="text-xs font-display text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                            <Scroll className="w-3 h-3" /> Propose Formal Treaties
                                        </h3>
                                        <div className="grid grid-cols-1 gap-2">
                                            {TREATY_TYPES.map(treaty => {
                                                const Icon = treaty.icon;
                                                const isActive = activeTreaties.some(t => t.type === treaty.type);
                                                return (
                                                    <button
                                                        key={treaty.type}
                                                        onClick={() => handleProposeTreaty(treaty.type)}
                                                        disabled={isActive || isProcessing === `treaty-${treaty.type}`}
                                                        className={`flex items-center justify-between p-4 rounded-xl border transition-all text-left group ${
                                                            isActive 
                                                            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' 
                                                            : 'bg-white/5 border-white/10 hover:border-white/30 text-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-500/20' : 'bg-black/40 border border-white/5'}`}>
                                                                <Icon className="w-4 h-4" />
                                                            </div>
                                                            <span className="text-xs font-display uppercase tracking-wide">{treaty.label}</span>
                                                        </div>
                                                        {isActive ? (
                                                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                                                        ) : (
                                                            <Send className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>

                                    <section className="space-y-4">
                                        <h3 className="text-xs font-display text-red-400 uppercase tracking-widest flex items-center gap-2">
                                            <Skull className="w-3 h-3" /> Hostile Interventions
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => handleDemandTribute()}
                                                disabled={isProcessing === 'tribute'}
                                                className="flex flex-col items-center gap-3 p-6 rounded-xl bg-red-950/20 border border-red-900/40 hover:bg-red-900/30 transition-all text-center group"
                                            >
                                                <DollarSign className="w-6 h-6 text-red-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-[10px] font-display text-white uppercase tracking-widest">Demand Tribute</span>
                                            </button>
                                            <button 
                                                onClick={() => handleAction('embargo', declareWarAction(playerState.factionId, selectedFactionId))}
                                                disabled={isProcessing === 'embargo'}
                                                className="flex flex-col items-center gap-3 p-6 rounded-xl bg-orange-950/20 border border-orange-900/40 hover:bg-orange-900/30 transition-all text-center group"
                                            >
                                                <AlertTriangle className="w-6 h-6 text-orange-500 group-hover:scale-110 transition-transform" />
                                                <span className="text-[10px] font-display text-white uppercase tracking-widest">Total Embargo</span>
                                            </button>
                                        </div>
                                    </section>
                                </div>

                                {/* Right Column: Active Agreements & Economic Pacts */}
                                <div className="space-y-8">
                                    <section className="space-y-4">
                                        <h3 className="text-xs font-display text-green-400 uppercase tracking-widest flex items-center gap-2">
                                            <TrendingUp className="w-3 h-3" /> Commercial Synergies
                                        </h3>
                                        <div className="p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/20 space-y-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="text-sm font-display text-white uppercase">Inter-Empire Trade Pact</h4>
                                                    <p className="text-[10px] text-slate-500 uppercase mt-1 italic">Mutual tariff exemption and supply priority.</p>
                                                </div>
                                                <div className="p-2 rounded-lg bg-green-500/20">
                                                    <Globe className="w-4 h-4 text-green-400" />
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase block mb-1">Efficiency Bonus</span>
                                                    <span className="text-lg font-mono text-white">+12.5%</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-500 uppercase block mb-1">Status</span>
                                                    <span className="text-xs font-mono text-green-400 uppercase">Profitable</span>
                                                </div>
                                            </div>

                                            <button 
                                                onClick={handleNegotiateTrade}
                                                disabled={isProcessing === 'trade'}
                                                className="w-full py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-xs font-display uppercase tracking-widest transition-all"
                                            >
                                                Establish Major Trade Pact
                                            </button>
                                        </div>
                                    </section>

                                    <section className="space-y-4">
                                        <h3 className="text-xs font-display text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="w-3 h-3" /> Active Protocol Ledger
                                        </h3>
                                        <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                                            {activeTreaties.length === 0 && activePacts.length === 0 && activeTributes.length === 0 ? (
                                                <div className="p-8 text-center bg-white/5 rounded-xl border border-dashed border-white/10">
                                                    <span className="text-[10px] font-mono text-slate-600 uppercase">No active protocols detected.</span>
                                                </div>
                                            ) : (
                                                <>
                                                    {activeTreaties.map(t => (
                                                        <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                                                            <div className="flex items-center gap-3">
                                                                <ShieldCheck size={14} className="text-blue-400" />
                                                                <span className="text-[10px] font-display uppercase">{t.type.replace(/_/g, ' ')}</span>
                                                            </div>
                                                            <span className="text-[9px] font-mono text-blue-400/60 uppercase">Active</span>
                                                        </div>
                                                    ))}
                                                    {activePacts.map(p => (
                                                        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                                                            <div className="flex items-center gap-3">
                                                                <TrendingUp size={14} className="text-green-400" />
                                                                <span className="text-[10px] font-display uppercase">Trade Pact - {p.empireAId === selectedFactionId ? p.empireBId : p.empireAId}</span>
                                                            </div>
                                                            <span className="text-[9px] font-mono text-green-400/60 uppercase">Profitable</span>
                                                        </div>
                                                    ))}
                                                    {activeTributes.map(t => (
                                                        <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-white/10 border border-red-500/30">
                                                            <div className="flex items-center gap-3">
                                                                <DollarSign size={14} className="text-red-400" />
                                                                <span className="text-[10px] font-display uppercase">Tribute: {t.vassalId === selectedFactionId ? 'Vassal' : 'Overlord'}</span>
                                                            </div>
                                                            <span className="text-[9px] font-mono text-red-500/60 uppercase">{t.amountPerTick}/tick</span>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        ) : (
                            /* Intelligence Tab Content (Original Dossier Logic) */
                            <div className="space-y-8 animate-in fade-in duration-500">
                                {/* Escalation & Rivalry Section */}
                                <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="px-6 py-4 border-b border-slate-700/30 bg-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Activity size={14} className="text-amber-500" />
                                            <span className="text-xs font-display tracking-widest text-slate-400">ESCALATION LADDER</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-amber-500 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 uppercase">
                                            {rivalry ? ESCALATION_LABELS[rivalry.escalationLevel] : 'NEUTRAL'}
                                        </span>
                                    </div>

                                    <div className="p-8 space-y-6">
                                        <div className="flex gap-1.5 h-4">
                                            {[0, 1, 2, 3, 4, 5, 6, 7].map((lvl) => (
                                                <div 
                                                    key={lvl}
                                                    className={`flex-1 rounded transition-all duration-700 ${
                                                        rivalry && lvl <= rivalry.escalationLevel 
                                                        ? (lvl < 2 ? 'bg-blue-500' : lvl < 5 ? 'bg-amber-500' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]')
                                                        : 'bg-slate-800'
                                                    }`}
                                                />
                                            ))}
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div>
                                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Rivalry Score</span>
                                                <span className="text-4xl font-mono font-bold text-white leading-none">
                                                    {rivalry?.rivalryScore ?? 0}<span className="text-sm text-slate-600 ml-1">/ 100</span>
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">System Status</span>
                                                <span className={`text-xs font-display ${rivalry?.detenteActive ? 'text-green-400' : 'text-slate-400'}`}>
                                                    {rivalry?.detenteActive ? 'DETENTE ACTIVE - RELATION DECAY' : 'ACTIVE STRATEGIC COMPETITION'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 border-t border-slate-700/30 bg-black/20">
                                        <button 
                                            onClick={() => handleAction('envoy', sendEnvoyAction(playerState.factionId, selectedFactionId))}
                                            disabled={isProcessing === 'envoy'}
                                            className="p-6 flex flex-col items-center gap-2 hover:bg-blue-500/10 transition-colors group border-r border-slate-700/30"
                                        >
                                            <Send size={20} className="text-blue-400 group-hover:scale-110 transition-transform" />
                                            <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Send Envoy</span>
                                        </button>
                                        <button 
                                            onClick={() => handleAction('peace', offerPeaceAction(playerState.factionId, selectedFactionId))}
                                            disabled={isProcessing === 'peace'}
                                            className="p-6 flex flex-col items-center gap-2 hover:bg-green-500/10 transition-colors group border-r border-slate-700/30"
                                        >
                                            <Heart size={20} className="text-green-400 group-hover:scale-110 transition-transform" />
                                            <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Offer Peace</span>
                                        </button>
                                        <button 
                                            onClick={() => handleAction('war', declareWarAction(playerState.factionId, selectedFactionId))}
                                            disabled={isProcessing === 'war'}
                                            className="p-6 flex flex-col items-center gap-2 hover:bg-red-500/10 transition-colors group"
                                        >
                                            <Skull size={20} className="text-red-400 group-hover:scale-110 transition-transform" />
                                            <span className="text-[10px] font-display text-slate-400 uppercase tracking-widest">Declare War</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Proxy Conflicts Section */}
                                {diplomacyState.proxyConflicts.filter(p => p.targetEmpireId === selectedFactionId).length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Flame className="w-3 h-3 text-orange-500" /> Active Shadow Conflicts
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {diplomacyState.proxyConflicts.filter(p => p.targetEmpireId === selectedFactionId).map(conflict => (
                                                <div key={conflict.id} className="bg-slate-900/40 border border-orange-500/20 rounded-xl p-5 relative overflow-hidden">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <h4 className="text-sm font-display text-white uppercase tracking-wider">{conflict.rebelFactionId.replace(/-/g, ' ')}</h4>
                                                            <p className="text-[10px] text-slate-500 uppercase">System: {conflict.systemId}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[9px] text-slate-500 block uppercase">Blowback</span>
                                                            <span className={`text-xs font-mono font-bold ${conflict.blowbackRisk > 50 ? 'text-red-400' : 'text-orange-400'}`}>
                                                                {conflict.blowbackRisk.toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-[9px] uppercase text-slate-400 font-mono">
                                                            <span>Conflict Intensity</span>
                                                            <span>{conflict.intensity.toFixed(0)}%</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-white/5">
                                                            <div 
                                                                className="h-full bg-gradient-to-r from-orange-600 via-orange-400 to-red-500 rounded-full transition-all duration-1000"
                                                                style={{ width: `${conflict.intensity}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <button 
                                                        onClick={() => handleAction(conflict.id, sponsorProxyAction(playerState.factionId, conflict.id, 500))}
                                                        disabled={isProcessing === conflict.id}
                                                        className="mt-6 w-full py-2.5 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/30 text-orange-400 rounded-lg text-[10px] font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                                    >
                                                        {isProcessing === conflict.id ? 'Channeling Funds...' : (
                                                            <><Zap size={14} /> Increase Funding (500 Energy)</>
                                                        )}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Faction Description Footer */}
                        <div className="pt-10 border-t border-white/5 flex gap-8">
                            <div className="flex-1 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <BookOpen className="w-3 h-3" /> Faction Manifesto
                                </h3>
                                <div className="p-6 rounded-xl bg-white/5 border border-white/5 italic text-sm text-slate-400 leading-relaxed shadow-inner">
                                    "{selectedFaction.description}"
                                </div>
                            </div>
                            <div className="w-64 space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <Target className="w-3 h-3" /> Doctrine Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {selectedFaction.traits.map(trait => (
                                        <span key={trait} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] uppercase tracking-wide text-slate-300 font-mono">
                                            {trait}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
