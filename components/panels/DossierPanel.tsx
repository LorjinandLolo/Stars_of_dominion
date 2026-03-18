"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Users, Shield, Target, Globe, BookOpen, Fingerprint, Send, Skull, Heart, Activity, Flame, Zap } from 'lucide-react';
import { sendEnvoyAction, declareWarAction, offerPeaceAction } from '@/app/actions/politics';
import { sponsorProxyAction } from '@/app/actions/proxy';

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

export default function DossierPanel() {
    const { playerState, diplomacyState, updateDiplomacy } = useUIStore();
    const [isFunding, setIsFunding] = React.useState<string | null>(null);
    const [selectedFactionId, setSelectedFactionId] = React.useState(FACTIONS[0].id);
    const selectedFaction = FACTIONS.find(f => f.id === selectedFactionId) || FACTIONS[0];
    
    // Find real rivalry state for this faction
    const rivalry = diplomacyState.rivalries.find(r => 
        (r.empireAId === playerState.factionId && r.empireBId === selectedFactionId) ||
        (r.empireBId === playerState.factionId && r.empireAId === selectedFactionId)
    );

    const handleSendEnvoy = async () => {
        const res = await sendEnvoyAction(playerState.factionId, selectedFactionId);
        if (res.success) {
            // Optimistic update
            const updatedRivalries = diplomacyState.rivalries.map(r => {
                if (r.id === rivalry?.id) {
                    const newScore = Math.max(0, r.rivalryScore - 10);
                    return { ...r, rivalryScore: newScore, escalationLevel: Math.floor(newScore / 14) };
                }
                return r;
            });
            updateDiplomacy({ rivalries: updatedRivalries });
        }
    };

    const handleDeclareWar = async () => {
        const res = await declareWarAction(playerState.factionId, selectedFactionId);
        if (res.success) {
            const updatedRivalries = diplomacyState.rivalries.map(r => {
                if (r.id === rivalry?.id) {
                    return { ...r, rivalryScore: 100, escalationLevel: 7 };
                }
                return r;
            });
            updateDiplomacy({ rivalries: updatedRivalries });
        }
    };

    const handleSponsorProxy = async (conflictId: string) => {
        setIsFunding(conflictId);
        const res = await sponsorProxyAction(playerState.factionId, conflictId, 500);
        if (res.success && res.data) {
            const updatedProxy = res.data;
            const updatedConflicts = diplomacyState.proxyConflicts.map(p => 
                p.id === updatedProxy.id ? updatedProxy : p
            );
            updateDiplomacy({ proxyConflicts: updatedConflicts });
        }
        setIsFunding(null);
    };

    const activeConflicts = diplomacyState.proxyConflicts.filter(p => p.targetEmpireId === selectedFactionId);

    return (
        <div className="flex flex-col h-full bg-slate-900/40 backdrop-blur-md border-l border-slate-700/50 text-slate-200">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
                <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    <h1 className="text-xl font-display tracking-widest uppercase">Galactic Dossier</h1>
                </div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-tighter">Diplomatic Intel & Strategic Rivalries</p>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Faction List (Left) */}
                <div className="w-24 border-r border-white/5 flex flex-col gap-4 p-4 items-center bg-black/20">
                    {FACTIONS.map((faction) => (
                        <button
                            key={faction.id}
                            onClick={() => setSelectedFactionId(faction.id)}
                            className={`group relative w-12 h-12 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                selectedFactionId === faction.id 
                                ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] scale-110' 
                                : 'border-white/10 hover:border-white/30 grayscale opacity-60 hover:opacity-100 hover:grayscale-0'
                            }`}
                            style={{ backgroundColor: `${faction.color}22` }}
                        >
                            <Shield className="w-6 h-6" style={{ color: faction.color }} />
                            {selectedFactionId === faction.id && (
                                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Faction Details (Right) */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* Faction Name & ID */}
                        <div>
                            <div className="flex items-center gap-4 mb-2">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">{selectedFaction.id}</span>
                                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
                            </div>
                            <h2 className="text-3xl font-display text-center uppercase tracking-widest text-white drop-shadow-md">
                                {selectedFaction.name}
                            </h2>
                        </div>

                        {/* Diplomacy Overlay */}
                        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl">
                            <div className="px-6 py-4 border-b border-slate-700/30 bg-slate-800/20 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Activity size={14} className="text-amber-500" />
                                    <span className="text-xs font-display tracking-widest text-slate-400">ESCALATION LADDER</span>
                                </div>
                                <span className="text-[10px] font-mono text-amber-500 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 uppercase">
                                    {rivalry ? ESCALATION_LABELS[rivalry.escalationLevel] : 'NEUTRAL'}
                                </span>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Escalation Ladder Visual */}
                                <div className="flex gap-1 h-3">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((lvl) => (
                                        <div 
                                            key={lvl}
                                            className={`flex-1 rounded-sm transition-all duration-500 ${
                                                rivalry && lvl <= rivalry.escalationLevel 
                                                ? (lvl < 2 ? 'bg-blue-500' : lvl < 5 ? 'bg-amber-500' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]')
                                                : 'bg-slate-800'
                                            }`}
                                        />
                                    ))}
                                </div>

                                <div className="flex justify-between items-end">
                                    <div>
                                        <span className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Rivalry Score</span>
                                        <span className="text-2xl font-mono font-bold text-white leading-none">
                                            {rivalry?.rivalryScore ?? 0}<span className="text-xs text-slate-600 ml-1">/ 100</span>
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Status</span>
                                        <span className={`text-xs font-display ${rivalry?.detenteActive ? 'text-green-400' : 'text-slate-400'}`}>
                                            {rivalry?.detenteActive ? 'DETENTE ACTIVE' : 'ACTIVE COMPETITION'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Diplomatic Actions Grid */}
                            <div className="grid grid-cols-3 border-t border-slate-700/30">
                                <button 
                                    onClick={handleSendEnvoy}
                                    className="p-4 flex flex-col items-center gap-2 hover:bg-blue-500/10 transition-colors group border-r border-slate-700/30"
                                >
                                    <Send size={18} className="text-blue-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-display text-slate-400">SEND ENVOY</span>
                                </button>
                                <button 
                                    onClick={() => offerPeaceAction(playerState.factionId, selectedFactionId)}
                                    className="p-4 flex flex-col items-center gap-2 hover:bg-green-500/10 transition-colors group border-r border-slate-700/30"
                                >
                                    <Heart size={18} className="text-green-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-display text-slate-400">OFFER PEACE</span>
                                </button>
                                <button 
                                    onClick={handleDeclareWar}
                                    className="p-4 flex flex-col items-center gap-2 hover:bg-red-500/10 transition-colors group"
                                >
                                    <Skull size={18} className="text-red-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-display text-slate-400">DECLARE WAR</span>
                                </button>
                            </div>
                        </div>

                        {/* Proxy Conflicts Section */}
                        {activeConflicts.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <Flame className="w-3 h-3 text-orange-500" /> Covert Proxy Conflicts
                                </h3>
                                <div className="space-y-3">
                                    {activeConflicts.map(conflict => (
                                        <div key={conflict.id} className="bg-slate-900/40 border border-orange-500/20 rounded-lg p-4 relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="text-sm font-display text-white uppercase tracking-wider">{conflict.rebelFactionId.replace(/-/g, ' ')}</h4>
                                                    <p className="text-[10px] text-slate-500 uppercase">Status: Active Insurgency</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] text-slate-500 block uppercase">Blowback Risk</span>
                                                    <span className={`text-xs font-mono ${conflict.blowbackRisk > 50 ? 'text-red-400' : 'text-orange-400'}`}>
                                                        {conflict.blowbackRisk.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-[10px] uppercase text-slate-400">
                                                    <span>Intensity</span>
                                                    <span>{conflict.intensity.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-orange-600 to-red-500 transition-all duration-1000"
                                                        style={{ width: `${conflict.intensity}%` }}
                                                    />
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => handleSponsorProxy(conflict.id)}
                                                disabled={isFunding === conflict.id}
                                                className="mt-4 w-full py-2 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/30 text-orange-400 rounded text-[10px] font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isFunding === conflict.id ? 'Processing...' : (
                                                    <><Zap size={12} /> Increase Funding (500 Energy)</>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Description Box */}
                        <div className="relative p-6 rounded-lg bg-black/30 border border-white/5 shadow-inner">
                            <Fingerprint className="absolute -top-3 -right-3 w-8 h-8 text-white/5" />
                            <p className="text-sm leading-relaxed text-slate-300 italic">
                                "{selectedFaction.description}"
                            </p>
                        </div>

                        {/* Traits Section */}
                        <div className="space-y-4">
                            <h3 className="text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Target className="w-3 h-3" /> Faction Traits & Doctrine
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {selectedFaction.traits.map(trait => (
                                    <span key={trait} className="px-3 py-1 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[10px] uppercase tracking-wide text-blue-400">
                                        {trait}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
