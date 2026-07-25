"use client";

import React, { useMemo, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Users, Shield, Target, Globe, BookOpen, Fingerprint, 
    Send, Skull, Heart, Activity, Flame, Zap, 
    FileText, Gavel, TrendingUp, Handshake, Scroll,
    AlertTriangle, ShieldCheck, DollarSign, Info, Eye
} from 'lucide-react';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { sponsorProxyAction } from '@/app/actions/proxy';
import { TreatyType } from '@/lib/politics/cold-war-types';
import { buildReputationProfile } from '@/lib/integration/reputation-vm';
import { ReputationSignal } from '@/lib/integration/types';
import DiscourseTerminal from '../politics/DiscourseTerminal';
import { MessageSquare } from 'lucide-react';

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

const ESCALATION_LABELS: Record<number, string> = {
    0: 'CALM',
    1: 'RIVALRY',
    2: 'TENSE',
    3: 'CONFRONTATION',
    4: 'COVERT WAR',
    5: 'COLD WAR',
    6: 'NEAR-HOT',
    7: 'AT WAR',
};

const GAMBIT_META: Record<string, { label: string; desc: string; responses: { id: string; label: string }[] }> = {
    ultimatum: {
        label: 'Ultimatum',
        desc: 'Demand credits under threat. Requires escalation ≥ 2.',
        responses: [
            { id: 'concede', label: 'Concede' },
            { id: 'reject', label: 'Reject' },
            { id: 'stall', label: 'Stall' },
        ],
    },
    espionage_accusation: {
        label: 'Public Accusation',
        desc: 'Accuse them of espionage. Backfires without evidence.',
        responses: [
            { id: 'admit', label: 'Admit' },
            { id: 'deny', label: 'Deny' },
        ],
    },
    show_of_force: {
        label: 'Show of Force',
        desc: 'Military posturing. Bluffs can be called.',
        responses: [
            { id: 'submit', label: 'Submit' },
            { id: 'defy', label: 'Defy' },
        ],
    },
};

function describeGambit(g: import('@/types/ui-state').DiplomaticGambitView): string {
    const base = GAMBIT_META[g.kind]?.label ?? g.kind;
    return g.kind === 'ultimatum' && g.demandCredits ? `${base} — ${g.demandCredits} credits` : base;
}

function describeOffer(offer: import('@/types/ui-state').DiplomaticOfferView): string {
    switch (offer.kind) {
        case 'treaty': return `${String(offer.treatyType ?? 'treaty').replace(/_/g, ' ')} treaty`;
        case 'trade_pact': return `Trade pact — ${offer.volumePerHour}/hr ${offer.resource}`;
        case 'tribute_demand': return `Tribute demand — ${offer.tributeAmountPerTick} ${offer.tributeResourceType}/tick`;
        case 'peace_offer': return 'Peace offer';
        default: return 'Proposal';
    }
}

const TREATY_TYPES: { type: TreatyType, label: string, icon: any }[] = [
    { type: 'non_aggression', label: 'Non-Aggression Pact', icon: ShieldCheck },
    { type: 'mutual_defense', label: 'Mutual Defense Treaty', icon: Shield },
    { type: 'research_share', label: 'Research Sharing Agreement', icon: Zap },
    { type: 'intelligence_pact', label: 'Intelligence Cooperation', icon: Fingerprint },
    { type: 'open_borders', label: 'Open Borders Access', icon: Globe },
];

export default function DiplomacyPanel() {
    const { playerState, diplomacyState, politicsState, empireIdentity, updateDiplomacy, espionageState, planets } = useUIStore();
    const [activeTab, setActiveTab] = useState<'intel' | 'statecraft' | 'economy' | 'intrigue'>('statecraft');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [showDiscourse, setShowDiscourse] = useState(false);
    const [gambitKind, setGambitKind] = useState<'ultimatum' | 'espionage_accusation' | 'show_of_force'>('show_of_force');
    const [gambitPrediction, setGambitPrediction] = useState<string>('');
    const [gambitDemand, setGambitDemand] = useState<number>(500);

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

    const activeTreaties = (diplomacyState.treaties || []).filter(t =>
        t.status === 'active' &&
        t.signatories.includes(playerState.factionId) &&
        t.signatories.includes(selectedFactionId)
    );

    // Bilateral offers with the selected faction (either direction).
    const pairOffers = (diplomacyState.offers || []).filter(o =>
        (o.fromFactionId === playerState.factionId && o.toFactionId === selectedFactionId) ||
        (o.toFactionId === playerState.factionId && o.fromFactionId === selectedFactionId)
    );
    const pendingOffers = pairOffers.filter(o => o.status === 'pending');
    const isAtWar = (rivalry?.escalationLevel ?? 0) >= 7;

    const pairGambits = (diplomacyState.gambits || []).filter(g =>
        (g.initiatorId === playerState.factionId && g.targetId === selectedFactionId) ||
        (g.targetId === playerState.factionId && g.initiatorId === selectedFactionId)
    );
    const pendingGambits = pairGambits.filter(g => g.status === 'pending');
    const recentGambits = pairGambits.filter(g => g.status !== 'pending').slice(0, 3);
    const leverageHeld = diplomacyState.leverage?.[`${playerState.factionId}|${selectedFactionId}`] ?? 0;
    const leverageAgainst = diplomacyState.leverage?.[`${selectedFactionId}|${playerState.factionId}`] ?? 0;

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
                        {(['statecraft', 'economy', 'intrigue', 'intel'] as const).map(tab => (
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
                                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Tension Index</span>
                                <div className="flex items-center gap-3 justify-end">
                                    <div className="text-3xl font-mono text-white tracking-tighter">
                                        {rivalry ? rivalry.rivalryScore.toFixed(0) : '—'}
                                    </div>
                                    <Activity className={`w-5 h-5 ${(rivalry?.rivalryScore ?? 0) >= 70 ? 'text-rose-400' : 'text-emerald-400'}`} />
                                </div>
                                {(leverageHeld > 0 || leverageAgainst > 0) && (
                                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-2">
                                        Leverage <span className="text-emerald-400">{leverageHeld}</span> held
                                        {' / '}<span className="text-rose-400">{leverageAgainst}</span> against
                                    </div>
                                )}
                            </div>
                            
                            <button 
                                onClick={() => setShowDiscourse(true)}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-display tracking-[0.2em] uppercase flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all hover:scale-105 active:scale-95"
                            >
                                <MessageSquare size={16} />
                                Initiate Direct Discourse
                            </button>
                        </div>

                        {activeTab === 'statecraft' ? (
                            <div className="space-y-10">
                            {/* Pending bilateral offers — the consent loop */}
                            {pendingOffers.length > 0 && (
                                <div className="space-y-4">
                                    <h3 className="text-[11px] font-display text-amber-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Send className="w-4 h-4" /> Pending Proposals
                                    </h3>
                                    {pendingOffers.map(offer => {
                                        const incoming = offer.toFactionId === playerState.factionId;
                                        return (
                                            <div key={offer.id} className="flex items-center justify-between p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                                                <div>
                                                    <span className="text-xs font-bold text-white uppercase tracking-widest block">
                                                        {describeOffer(offer)}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500 uppercase tracking-tighter">
                                                        {incoming ? `Proposed by ${selectedFaction.name}` : 'Awaiting their response'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-3">
                                                    {incoming ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleAction(`accept-${offer.id}`, dispatchOrder({
                                                                    actionId: 'DIP_RESPOND_OFFER',
                                                                    factionId: playerState.factionId,
                                                                    payload: { offerId: offer.id, response: 'accept' },
                                                                    label: 'Accepting proposal',
                                                                }))}
                                                                disabled={!!isProcessing}
                                                                className="px-5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-emerald-600 hover:text-white transition-all"
                                                            >
                                                                Accept
                                                            </button>
                                                            <button
                                                                onClick={() => handleAction(`reject-${offer.id}`, dispatchOrder({
                                                                    actionId: 'DIP_RESPOND_OFFER',
                                                                    factionId: playerState.factionId,
                                                                    payload: { offerId: offer.id, response: 'reject' },
                                                                    label: 'Rejecting proposal',
                                                                }))}
                                                                disabled={!!isProcessing}
                                                                className="px-5 py-2 rounded-xl bg-rose-600/10 border border-rose-500/30 text-rose-400 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-rose-600 hover:text-white transition-all"
                                                            >
                                                                Reject
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleAction(`withdraw-${offer.id}`, dispatchOrder({
                                                                actionId: 'DIP_WITHDRAW_OFFER',
                                                                factionId: playerState.factionId,
                                                                payload: { offerId: offer.id },
                                                                label: 'Withdrawing proposal',
                                                            }))}
                                                            disabled={!!isProcessing}
                                                            className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-white/10 transition-all"
                                                        >
                                                            Withdraw
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Confrontations — gambits with a prediction layer */}
                            {(pendingGambits.length > 0 || recentGambits.length > 0) && (
                                <div className="space-y-4">
                                    <h3 className="text-[11px] font-display text-rose-300 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Target className="w-4 h-4" /> Confrontations
                                    </h3>
                                    {pendingGambits.map(g => {
                                        const incoming = g.targetId === playerState.factionId;
                                        return (
                                            <div key={g.id} className="p-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="text-xs font-bold text-white uppercase tracking-widest block">{describeGambit(g)}</span>
                                                        <span className="text-[9px] text-slate-500 uppercase tracking-tighter">
                                                            {incoming
                                                                ? `Issued by ${selectedFaction.name} — respond or your doctrine decides for you`
                                                                : 'Awaiting their move — your prediction is sealed'}
                                                        </span>
                                                    </div>
                                                    {!incoming && g.prediction && (
                                                        <span className="text-[9px] font-mono text-amber-400 uppercase px-2 py-1 rounded bg-black/40 border border-amber-500/20">
                                                            Predicted: {g.prediction}
                                                        </span>
                                                    )}
                                                </div>
                                                {incoming && (
                                                    <div className="flex gap-3">
                                                        {(GAMBIT_META[g.kind]?.responses ?? []).map(r => (
                                                            <button
                                                                key={r.id}
                                                                onClick={() => handleAction(`gambit-${g.id}-${r.id}`, dispatchOrder({
                                                                    actionId: 'DIP_RESPOND_GAMBIT',
                                                                    factionId: playerState.factionId,
                                                                    payload: { gambitId: g.id, response: r.id },
                                                                    label: `Responding: ${r.label.toLowerCase()}`,
                                                                }))}
                                                                disabled={!!isProcessing}
                                                                className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-indigo-600 hover:text-white transition-all"
                                                            >
                                                                {r.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {recentGambits.map(g => (
                                        <div key={g.id} className="p-4 rounded-2xl border border-white/5 bg-black/30 flex items-center justify-between">
                                            <div>
                                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block">
                                                    {describeGambit(g)} — {g.response}{g.autoResolved ? ' (auto)' : ''}
                                                </span>
                                                <span className="text-[9px] text-slate-500 italic">{g.outcome}</span>
                                            </div>
                                            {g.prediction && (
                                                <span className={`text-[9px] font-mono uppercase px-2 py-1 rounded bg-black/40 ${g.predictionMatched ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {g.predictionMatched ? 'Prediction hit' : 'Prediction missed'}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

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
                                            const activeTreaty = activeTreaties.find(t => t.type === treaty.type);
                                            const isActive = !!activeTreaty;
                                            const isPendingOut = pendingOffers.some(o =>
                                                o.kind === 'treaty' && o.treatyType === treaty.type && o.fromFactionId === playerState.factionId);
                                            return (
                                                <div
                                                    key={treaty.type}
                                                    className={`group flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
                                                        isActive
                                                        ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-400'
                                                        : isPendingOut
                                                        ? 'bg-amber-500/5 border-amber-500/30 text-amber-400'
                                                        : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'
                                                    }`}
                                                >
                                                    <button
                                                        onClick={() => handleAction(`treaty-${treaty.type}`, dispatchOrder({
                                                            actionId: 'DIP_PROPOSE_TREATY',
                                                            factionId: playerState.factionId,
                                                            payload: { targetFactionId: selectedFactionId, treatyType: treaty.type },
                                                            label: `Proposing ${String(treaty.type).replace(/_/g, ' ').toLowerCase()}`,
                                                        }))}
                                                        disabled={isActive || isPendingOut || !!isProcessing}
                                                        className="flex items-center gap-4 relative z-10 text-left disabled:cursor-default"
                                                    >
                                                        <div className={`p-3 rounded-xl transition-colors ${isActive ? 'bg-emerald-500/20' : 'bg-black/60 border border-white/5 group-hover:border-indigo-500/50'}`}>
                                                            <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : isPendingOut ? 'text-amber-400' : 'text-slate-400 group-hover:text-indigo-400'}`} />
                                                        </div>
                                                        <div>
                                                            <span className="text-xs font-bold uppercase tracking-widest block">{treaty.label}</span>
                                                            <span className="text-[9px] text-slate-500 uppercase tracking-tighter">
                                                                {isActive ? 'In Force' : isPendingOut ? 'Awaiting Their Response' : 'Requires Mutual Consensus'}
                                                            </span>
                                                        </div>
                                                    </button>
                                                    {isActive && (
                                                        <button
                                                            onClick={() => handleAction(`break-${activeTreaty!.id}`, dispatchOrder({
                                                                actionId: 'DIP_BREAK_TREATY',
                                                                factionId: playerState.factionId,
                                                                payload: { treatyId: activeTreaty!.id },
                                                                label: `Repudiating ${treaty.label.toLowerCase()}`,
                                                            }))}
                                                            disabled={!!isProcessing}
                                                            className="px-3 py-1.5 rounded-lg bg-rose-600/10 border border-rose-500/30 text-rose-400 text-[9px] font-display tracking-widest uppercase hover:bg-rose-600 hover:text-white transition-all relative z-10"
                                                            title="Repudiating a treaty damages reliability and raises tension"
                                                        >
                                                            Break
                                                        </button>
                                                    )}
                                                </div>
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
                                                <span className={`text-sm font-mono ${(rivalry?.escalationLevel ?? 0) >= 5 ? 'text-rose-400' : (rivalry?.escalationLevel ?? 0) >= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                    {ESCALATION_LABELS[rivalry?.escalationLevel ?? 0]}
                                                </span>
                                            </div>
                                            <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-orange-500 to-rose-600 rounded-full shadow-[0_0_15px_rgba(225,29,72,0.5)] transition-all duration-1000"
                                                    style={{ width: `${(rivalry?.escalationLevel ?? 0) * 14.28}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 pt-4">
                                            {isAtWar ? (
                                                <button
                                                    onClick={() => handleAction('peace', dispatchOrder({
                                                        actionId: 'DIP_OFFER_PEACE',
                                                        factionId: playerState.factionId,
                                                        payload: { targetFactionId: selectedFactionId },
                                                        label: 'Suing for peace',
                                                    }))}
                                                    disabled={!!isProcessing || pendingOffers.some(o => o.kind === 'peace_offer')}
                                                    className="w-full py-4 rounded-xl bg-emerald-600/10 border border-emerald-600/30 text-emerald-400 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-emerald-600 hover:text-white transition-all duration-300 shadow-lg shadow-emerald-900/10 disabled:opacity-40"
                                                >
                                                    {pendingOffers.some(o => o.kind === 'peace_offer') ? 'Peace Talks Underway' : 'Sue For Peace'}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleAction('war', dispatchOrder({
                                                        actionId: 'DIP_DECLARE_WAR',
                                                        factionId: playerState.factionId,
                                                        payload: { targetFactionId: selectedFactionId },
                                                        label: 'Declaration of war',
                                                    }))}
                                                    disabled={!!isProcessing}
                                                    className="w-full py-4 rounded-xl bg-rose-600/10 border border-rose-600/30 text-rose-500 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-rose-600 hover:text-white transition-all duration-300 shadow-lg shadow-rose-900/10"
                                                >
                                                    Unilateral Hostility Declaration
                                                </button>
                                            )}
                                            <div className="flex items-start gap-3 p-4 bg-black/40 rounded-xl border border-white/5">
                                                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-slate-500 leading-relaxed italic uppercase font-mono tracking-tighter">
                                                    {isAtWar
                                                        ? 'Peace requires the enemy to accept your offer. Rejection hardens their resolve.'
                                                        : 'Declaring war collapses all treaties and trade pacts. Attacking through a non-aggression pact brands you an oathbreaker. Mutual-defense allies of the target will join the war.'}
                                                </p>
                                            </div>

                                            {/* Gambit launcher */}
                                            {!isAtWar && (
                                                <div className="space-y-3 pt-2 border-t border-white/5">
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono block pt-2">Launch Gambit</span>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {(Object.keys(GAMBIT_META) as Array<typeof gambitKind>).map(k => (
                                                            <button
                                                                key={k}
                                                                onClick={() => { setGambitKind(k); setGambitPrediction(''); }}
                                                                className={`px-2 py-2 rounded-lg text-[9px] font-display tracking-widest uppercase border transition-all ${
                                                                    gambitKind === k
                                                                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                                                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                                                                }`}
                                                            >
                                                                {GAMBIT_META[k].label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p className="text-[9px] text-slate-500 italic">{GAMBIT_META[gambitKind].desc}</p>
                                                    {gambitKind === 'ultimatum' && (
                                                        <input
                                                            type="number"
                                                            value={gambitDemand}
                                                            min={1}
                                                            onChange={e => setGambitDemand(Math.max(1, Number(e.target.value) || 1))}
                                                            className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white"
                                                            placeholder="Credits demanded"
                                                        />
                                                    )}
                                                    <div className="flex gap-2 items-center">
                                                        <select
                                                            value={gambitPrediction}
                                                            onChange={e => setGambitPrediction(e.target.value)}
                                                            className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-200 uppercase"
                                                        >
                                                            <option value="">No prediction (safe)</option>
                                                            {GAMBIT_META[gambitKind].responses.map(r => (
                                                                <option key={r.id} value={r.id}>Predict: {r.label}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={() => handleAction('gambit-launch', dispatchOrder({
                                                                actionId: 'DIP_LAUNCH_GAMBIT',
                                                                factionId: playerState.factionId,
                                                                payload: {
                                                                    targetFactionId: selectedFactionId,
                                                                    kind: gambitKind,
                                                                    prediction: gambitPrediction || undefined,
                                                                    demandCredits: gambitKind === 'ultimatum' ? gambitDemand : undefined,
                                                                },
                                                                label: `Launching ${GAMBIT_META[gambitKind].label.toLowerCase()}`,
                                                            }))}
                                                            disabled={!!isProcessing || pendingGambits.some(g => g.initiatorId === playerState.factionId)}
                                                            className="px-5 py-2 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-300 text-[10px] font-display tracking-[0.2em] uppercase hover:bg-rose-600 hover:text-white transition-all disabled:opacity-40"
                                                        >
                                                            Launch
                                                        </button>
                                                    </div>
                                                    <p className="text-[9px] text-slate-600 italic">
                                                        Correct predictions amplify your gains ×1.35. Wrong ones hand them the initiative.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </div>
                        ) : activeTab === 'economy' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <h3 className="text-[11px] font-display text-green-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4" /> Mercantile Synergies
                                    </h3>
                                    <button 
                                        onClick={() => handleAction('trade-pact', dispatchOrder({
                                            actionId: 'DIP_TRADE_PACT',
                                            factionId: playerState.factionId,
                                            payload: { targetFactionId: selectedFactionId, resource: 'credits', volume: 100 },
                                            label: 'Negotiating trade pact',
                                        }))}
                                        className="w-full p-6 bg-green-500/5 border border-green-500/20 rounded-2xl hover:bg-green-500/10 transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="p-3 bg-green-500/20 rounded-xl">
                                                <DollarSign className="w-5 h-5 text-green-400" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-white uppercase tracking-widest block">Establish Trade Pact</span>
                                                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Mutual Resource Multiplier</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">Increases trade efficiency by +10% in shared hexes.</p>
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-[11px] font-display text-amber-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Gavel className="w-4 h-4" /> Economic Leverage
                                    </h3>
                                    <button 
                                        onClick={() => handleAction('tribute', dispatchOrder({
                                            actionId: 'DIP_DEMAND_TRIBUTE',
                                            factionId: playerState.factionId,
                                            payload: { targetFactionId: selectedFactionId, amount: 500 },
                                            label: 'Demanding tribute',
                                        }))}
                                        className="w-full p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl hover:bg-amber-500/10 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="p-3 bg-amber-500/20 rounded-xl">
                                                <Flame className="w-5 h-5 text-amber-400" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-white uppercase tracking-widest block">Demand Sovereign Tribute</span>
                                                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">One-way resource transfer</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">Requires significant military superiority or leverage.</p>
                                    </button>
                                </div>
                            </div>
                        ) : activeTab === 'intrigue' ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                    <h3 className="text-[11px] font-display text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Fingerprint className="w-4 h-4" /> Subversive Operations
                                    </h3>
                                    <button 
                                        onClick={() => handleAction('proxy', sponsorProxyAction(selectedFactionId, 'rebel-cell-alpha', 500))}
                                        className="w-full p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl hover:bg-purple-500/10 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="p-3 bg-purple-500/20 rounded-xl">
                                                <Skull className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-white uppercase tracking-widest block">Sponsor Proxy Conflict</span>
                                                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Covert destabilization</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">Increases unrest in target systems. High blowback risk.</p>
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-[11px] font-display text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Activity className="w-4 h-4" /> Perception Management
                                    </h3>
                                    <button 
                                        className="w-full p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl hover:bg-blue-500/10 transition-all text-left opacity-50 cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="p-3 bg-blue-500/20 rounded-xl">
                                                <FileText className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-white uppercase tracking-widest block">Propaganda Campaign</span>
                                                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Ideological saturation</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 italic">Slowly shifts local population alignment towards your ideology.</p>
                                    </button>
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

            {/* Discourse Terminal Modal */}
            {showDiscourse && (
                <DiscourseTerminal 
                    factionId={selectedFactionId} 
                    onClose={() => setShowDiscourse(false)} 
                />
            )}
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
    const { espionageState, planets, playerState } = useUIStore();

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

    // Calculate dynamic intel Quality based on espionage networks in target's systems
    const targetSystemIds = planets.filter(p => p.ownerId === factionId).map(p => p.systemId);
    const playerNetworks = espionageState.networks.filter(n => 
        n.ownerFactionId === playerState.factionId && targetSystemIds.includes(n.systemId)
    );
    
    let intelQuality = 10; // Base minimal intel
    if (playerNetworks.length > 0) {
        const maxStrength = Math.max(...playerNetworks.map(n => n.strength));
        intelQuality = Math.round(maxStrength * 100);
    }

    const profile = buildReputationProfile(repData, intelQuality);

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
