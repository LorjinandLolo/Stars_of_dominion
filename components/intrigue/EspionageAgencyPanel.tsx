"use client";

import React, { useState, useTransition } from 'react';
import {
    Activity, AlertTriangle, CheckCircle, ChevronRight, DollarSign, Eye, Flame, Globe, Loader2, Lock, MapPin, Radio, RotateCcw, Search, Shield, Signal, Skull, Target, Unlock, UserPlus, XCircle, Zap
} from 'lucide-react';
import {
    launchCovertOpAction,
    recallAgentAction,
    getRecruitPoolAction,
    recruitAgentAction,
    getEspionageStateAction
} from '@/app/actions/espionage';
import type { SpyAgent, IntelNetwork, AgentTraitId, AgentStatus } from '@/lib/espionage/agent-types';
import { executePlayerAction } from '@/app/actions/registry-handler';
import Modal from '@/components/ui/Modal';

interface AgentTrait {
    id: AgentTraitId;
    label: string;
    color: string;
    icon: React.ReactNode;
}

const TRAITS: Record<AgentTraitId, AgentTrait> = {
    ghost: { id: 'ghost', label: 'Ghost', color: '#94a3b8', icon: <Eye size={10} /> },
    brutal: { id: 'brutal', label: 'Brutal', color: '#ef4444', icon: <Flame size={10} /> },
    seducer: { id: 'seducer', label: 'Seducer', color: '#a855f7', icon: <Activity size={10} /> },
    economist: { id: 'economist', label: 'Economist', color: '#22c55e', icon: <DollarSign size={10} /> },
    double_agent: { id: 'double_agent', label: 'Double Agent', color: '#f59e0b', icon: <Shield size={10} /> },
    veteran: { id: 'veteran', label: 'Veteran', color: '#60a5fa', icon: <Target size={10} /> },
    compromised: { id: 'compromised', label: 'COMPROMISED', color: '#ef4444', icon: <Flame size={10} /> },
};

function StatusBadge({ status }: { status: AgentStatus }) {
    const cfg: Record<AgentStatus, { label: string; color: string }> = {
        available: { label: 'AVAILABLE', color: '#22c55e' },
        deployed: { label: 'DEPLOYED', color: '#60a5fa' },
        on_cooldown: { label: 'COOLDOWN', color: '#f59e0b' },
        burned: { label: 'BURNED', color: '#6b7280' },
        captured: { label: 'CAPTURED', color: '#ef4444' },
        turned: { label: 'TURNED', color: '#a855f7' },
    };
    const { label, color } = cfg[status];
    return (
        <span className="text-[9px] font-display tracking-widest px-1.5 py-0.5 rounded border"
            style={{ color, borderColor: `${color}50`, backgroundColor: `${color}15` }}>
            {label}
        </span>
    );
}

function TraitChip({ traitId }: { traitId: AgentTraitId }) {
    const trait = TRAITS[traitId];
    if (!trait) return null;
    return (
        <span className="flex items-center gap-0.5 text-[9px] font-display px-1.5 py-0.5 rounded"
            style={{ color: trait.color, backgroundColor: `${trait.color}18`, border: `1px solid ${trait.color}30` }}>
            {trait.icon}{trait.label}
        </span>
    );
}

function StrengthBar({ value, color = '#60a5fa', label }: { value: number; color?: string; label: string }) {
    return (
        <div>
            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                <span>{label}</span>
                <span style={{ color }}>{Math.round(value * 100)}%</span>
            </div>
            <div className="h-1 rounded-full bg-slate-700/60 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function PenetrationBadge({ level }: { level: IntelNetwork['penetrationLevel'] }) {
    const cfg: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
        none: { label: 'NO SIGNAL', color: '#4b5563', icon: <Lock size={9} /> },
        rumor: { label: 'RUMOR', color: '#f59e0b', icon: <Radio size={9} /> },
        confirmed: { label: 'CONFIRMED', color: '#60a5fa', icon: <Eye size={9} /> },
        deep: { label: 'DEEP', color: '#a855f7', icon: <Unlock size={9} /> },
    };
    const { label, color, icon } = cfg[level || 'none'];
    return (
        <span className="flex items-center gap-1 text-[9px] font-display tracking-widest px-1.5 py-0.5 rounded border"
            style={{ color, borderColor: `${color}50`, backgroundColor: `${color}15` }}>
            {icon}{label}
        </span>
    );
}

// ─── Tab: Agent Roster ────────────────────────────────────────────────────────

interface RosterProps {
    agents: SpyAgent[];
    refresh: () => Promise<void>;
}

function AgentRosterTab({ agents, refresh }: RosterProps) {
    const [selected, setSelected] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [isPending, startTransition] = useTransition();
    const [recruitModalOpen, setRecruitModalOpen] = useState(false);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loadingRecruits, setLoadingRecruits] = useState(false);

    // Hardcoded mock to use since real GameWorldState is read-only right now in the generic Dashboard
    const agent = agents.find(a => a.id === selected) ?? null;

    const openRecruitModal = async () => {
        setRecruitModalOpen(true);
        setLoadingRecruits(true);
        try {
            const candidates = await getRecruitPoolAction('PLAYER_FACTION');
            if (candidates && candidates.length > 0) {
                setCandidates(candidates);
            } else {
                showToast('No recruits available', false);
            }
        } catch (e: any) {
            showToast(e.message, false);
        } finally {
            setLoadingRecruits(false);
        }
    };

    const handleHire = (c: any) => {
        startTransition(async () => {
            const res = await recruitAgentAction(c, 'PLAYER_FACTION');
            if (res.success) {
                showToast(`Recruited ${c.codename}`, true);
                setRecruitModalOpen(false);
                await refresh();
            } else {
                showToast(res.error || 'Failed to recruit', false);
            }
        });
    };

    function showToast(msg: string, ok: boolean) {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 4000);
    }

    function handleDeploy() {
        if (!agent) return;
        startTransition(async () => {
             const res = await executePlayerAction({
                id: `act_${Date.now()}`,
                actionId: 'ESP_ASSIGN_AGENT',
                issuerId: 'PLAYER_FACTION',
                targetId: 'sys-kerath-prime', // TODO: Let player choose system
                payload: { agentId: agent.id, systemId: 'sys-kerath-prime', domain: 'infrastructureSabotage' },
                timestamp: Math.floor(Date.now() / 1000)
            });
            if (res.success) {
                showToast('Agent deployed', true);
                await refresh();
            } else {
                showToast(res.error || 'Deploy failed', false);
            }
        });
    }

    function handleRecall() {
        if (!agent) return;
        startTransition(async () => {
            const res = await recallAgentAction(agent.id);
            if (res.success) {
                showToast('Agent recalled', true);
                await refresh();
            } else {
                showToast(res.error || 'Recall failed', false);
            }
        });
    }

    return (
        <div className="relative h-full">
            {/* Toast */}
            {toast && (
                <div className={`absolute bottom-3 left-3 right-3 z-10 px-3 py-2 rounded-lg flex items-center gap-2 text-xs ${toast.ok ? 'bg-green-950/80 border border-green-700/60 text-green-300' : 'bg-red-950/80 border border-red-700/60 text-red-300'}`}>
                    {toast.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {toast.msg}
                </div>
            )}
            <div className="flex h-full">
                {/* Agent list */}
                <div className="w-1/2 border-r border-slate-700/30 overflow-y-auto p-3 space-y-2">
                    {agents.map(a => (
                        <button key={a.id} onClick={() => setSelected(selected === a.id ? null : a.id)}
                            className={`w-full text-left rounded-lg border p-3 transition-all text-sm ${selected === a.id
                                ? 'bg-red-950/40 border-red-700/60'
                                : 'bg-slate-900/50 border-slate-700/30 hover:border-slate-600/40'}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                                <Eye size={12} className={a.status === 'burned' ? 'text-slate-600' : 'text-red-400'} />
                                <div className="flex-1">
                                    <div className="text-[10px] font-display tracking-widest text-slate-300">
                                        {a.codename}
                                    </div>
                                    <div className="text-[9px] text-slate-600">{a.name}</div>
                                </div>
                                <StatusBadge status={a.status} />
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {a.traitIds.map(t => <TraitChip key={t} traitId={t} />)}
                            </div>
                            {a.deployedToSystemId && (
                                <div className="mt-1.5 flex items-center gap-1 text-[9px] text-slate-500">
                                    <MapPin size={8} /> {a.deployedToSystemId} · {a.deployedDomain}
                                </div>
                            )}
                        </button>
                    ))}
                    {/* Recruit button */}
                    <button
                        onClick={openRecruitModal}
                        className="w-full text-left rounded-lg border border-dashed border-slate-700/50 p-3 text-[9px] text-slate-500 hover:border-emerald-700/50 hover:bg-emerald-950/20 hover:text-emerald-400 transition-colors flex items-center justify-center gap-2 font-display tracking-widest uppercase">
                        <UserPlus size={14} /> RECRUIT NEW AGENT
                    </button>
                </div>

                {/* Detail pane */}
                <div className="w-1/2 p-4 overflow-y-auto">
                    {agent ? (
                        <div className="space-y-4">
                            <div>
                                <div className="text-lg font-display text-slate-100">{agent.codename}</div>
                                <div className="text-[10px] text-slate-500">{agent.name} · {agent.operationsRun} ops run</div>
                            </div>
                            <StrengthBar value={agent.coverStrength} color={agent.coverStrength < 0.3 ? '#ef4444' : '#60a5fa'} label="COVER INTEGRITY" />
                            <StrengthBar value={agent.loyaltyRating} color={agent.loyaltyRating < 0.5 ? '#f97316' : '#22c55e'} label="LOYALTY RATING" />
                            <StrengthBar value={agent.experienceLevel / 100} color="#a855f7" label="EXPERIENCE" />
                            <div>
                                <div className="text-[9px] text-slate-500 mb-1.5">TRAITS</div>
                                <div className="flex flex-wrap gap-1">
                                    {agent.traitIds.map(t => <TraitChip key={t} traitId={t} />)}
                                </div>
                            </div>
                            {agent.status === 'available' && (
                                <button onClick={handleDeploy} disabled={isPending}
                                    className="w-full py-2 rounded border border-blue-700/50 text-[10px] font-display text-blue-400 hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                                    {isPending ? <Loader2 size={10} className="animate-spin" /> : <MapPin size={10} />}
                                    {isPending ? 'DEPLOYING...' : 'DEPLOY AGENT'}
                                </button>
                            )}
                            {agent.status === 'deployed' && (
                                <button onClick={handleRecall} disabled={isPending}
                                    className="w-full py-2 rounded border border-amber-700/50 text-[10px] font-display text-amber-400 hover:bg-amber-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50">
                                    {isPending ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                                    {isPending ? 'RECALLING...' : 'RECALL AGENT'}
                                </button>
                            )}
                            {agent.status === 'burned' && (
                                <div className="flex items-center gap-1 text-[10px] text-slate-600">
                                    <AlertTriangle size={10} /> Agent is burned — cannot be redeployed
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs">
                            <Eye size={24} className="mb-2 opacity-30" />
                            Select an agent to inspect
                        </div>
                    )}
                </div>
            </div>

            {/* Recruitment Modal */}
            <Modal isOpen={recruitModalOpen} onClose={() => setRecruitModalOpen(false)} title="AGENCY RECRUITMENT">
                <div className="w-[800px] h-[500px] bg-slate-900 flex flex-col items-center">
                    {loadingRecruits ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                            <Loader2 size={32} className="animate-spin mb-4 text-emerald-500" />
                            <div className="text-[10px] font-display tracking-widest text-slate-400">CONTACTING SHADOW BROKERS...</div>
                        </div>
                    ) : (
                        <div className="p-6 w-full h-full overflow-y-auto bg-slate-950/50">
                            <div className="text-xs text-slate-400 mb-6 font-display text-center relative">
                                <span className="bg-slate-950/50 px-4 relative z-10">AVAILABLE DOSSIERS (REFRESHES IN 24H)</span>
                                <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-800" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {candidates.map(c => (
                                    <div key={c.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col relative overflow-hidden group">

                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <div className="text-emerald-400 font-display text-lg tracking-wider mb-0.5">{c.codename}</div>
                                                <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                                                    <Lock size={10} /> IDENTITY: <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-700 text-slate-400 bg-slate-950 px-1 rounded block w-1/2 h-3 hover:bg-transparent">{c.name}</span>
                                                </div>
                                            </div>
                                            <div className="bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold">
                                                {c.recruitmentCost} INTEL
                                            </div>
                                        </div>

                                        <div className="space-y-3 flex-1 mb-6">
                                            <div>
                                                <div className="text-[8px] text-slate-600 mb-1.5 font-bold uppercase">PSYCHOLOGICAL PROFILE</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {c.traitIds.map((t: string) => <TraitChip key={t} traitId={t as any} />)}
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleHire(c)}
                                            disabled={isPending}
                                            className="w-full py-2.5 rounded border border-emerald-700/50 bg-emerald-950/20 text-[10px] font-display text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-500 transition-colors flex items-center justify-center gap-2 group-hover:shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]">
                                            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                                            {isPending ? 'AUTHORIZING...' : 'AUTHORIZE RECRUITMENT'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}

// ─── Tab: Intel Networks ──────────────────────────────────────────────────────

function IntelNetworksTab({ networks }: { networks: IntelNetwork[] }) {
    return (
        <div className="p-4 space-y-3">
            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-1">
                <Globe size={10} /> ACTIVE INTEL NETWORKS — Fog of War penetration by system
            </div>
            {networks.map(net => (
                <div key={net.id} className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3 hover:border-slate-600/40 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <div className="flex-1">
                            <div className="text-xs font-display text-slate-200">{net.systemId}</div>
                            <div className="text-[9px] text-slate-600 mt-0.5">
                                {net.agentIds.length} agent{net.agentIds.length !== 1 ? 's' : ''} assigned
                            </div>
                        </div>
                        <PenetrationBadge level={net.penetrationLevel as any} />
                    </div>
                    <StrengthBar
                        value={net.strength}
                        color={net.penetrationLevel === 'deep' ? '#a855f7' : net.penetrationLevel === 'confirmed' ? '#60a5fa' : net.penetrationLevel === 'rumor' ? '#f59e0b' : '#4b5563'}
                        label="NETWORK STRENGTH"
                    />
                    {net.agentIds.length === 0 && (
                        <div className="mt-2 text-[9px] text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={8} /> No agents — network is decaying
                        </div>
                    )}
                    {net.penetrationLevel === 'deep' && (
                        <div className="mt-2 text-[9px] text-purple-400 flex items-center gap-1">
                            <Unlock size={8} /> Full fleet visibility · Enemy attribution risk +20%
                        </div>
                    )}
                </div>
            ))}

            <div className="mt-4 bg-slate-900/30 border border-slate-700/20 rounded-lg p-3 text-[9px] text-slate-600 space-y-1">
                <div className="font-display text-slate-500 mb-1">FOG OF WAR LEGEND</div>
                <div className="flex items-center gap-2"><PenetrationBadge level="none" /> No visibility — enemy fleets hidden</div>
                <div className="flex items-center gap-2"><PenetrationBadge level="rumor" /> Fleet presence detected, not identified</div>
                <div className="flex items-center gap-2"><PenetrationBadge level="confirmed" /> Fleet count + faction owner revealed</div>
                <div className="flex items-center gap-2"><PenetrationBadge level="deep" /> Full composition, supply, and orders visible</div>
            </div>
        </div>
    );
}

// ─── Tab: Covert Ops ─────────────────────────────────────────────────────────

type DomainKey = 'infrastructureSabotage' | 'politicalSubversion' | 'shadowEconomy';

const OP_CARDS: { domain: DomainKey; label: string; desc: string; icon: React.ReactNode; baseSuccess: number; baseRisk: string; color: string }[] = [
    { domain: 'infrastructureSabotage', label: 'Sabotage Infrastructure', desc: 'Disrupt hyperlane gates, trade segments, or planetary installations. High damage, moderate exposure risk.', icon: <Zap size={16} />, baseSuccess: 0.55, baseRisk: 'MEDIUM', color: '#f59e0b' },
    { domain: 'politicalSubversion', label: 'Political Subversion', desc: "Inflame bloc dissatisfaction, spread war fatigue, destabilize frontier claims. Hard to detect.", icon: <Skull size={16} />, baseSuccess: 0.65, baseRisk: 'LOW', color: '#a855f7' },
    { domain: 'shadowEconomy', label: 'Shadow Economy', desc: 'Establish smuggling networks and piracy dens. Reduces trade efficiency and earns covert revenue.', icon: <DollarSign size={16} />, baseSuccess: 0.70, baseRisk: 'LOW', color: '#22c55e' },
];

function CovertOpsTab({ agents, refresh }: { agents: SpyAgent[]; refresh: () => Promise<void> }) {
    const [selectedDomain, setSelectedDomain] = useState<DomainKey | null>(null);
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
    const [risk, setRisk] = useState(0.4);
    const [invest, setInvest] = useState(0.6);
    const [toast, setToast] = useState<{ msg: string; ok: boolean; attribution?: string } | null>(null);
    const [isPending, startTransition] = useTransition();

    const deployedAgents = agents.filter(a => a.status === 'available' || a.status === 'deployed');
    const agent = deployedAgents.find(a => a.id === selectedAgent);
    const opCard = OP_CARDS.find(o => o.domain === selectedDomain);

    const estimatedSuccess = opCard
        ? Math.min(0.95, opCard.baseSuccess + invest * 0.25 - risk * 0.15 + (agent ? agent.experienceLevel / 100 * 0.15 : 0))
        : null;

    function showToast(msg: string, ok: boolean, attribution?: string) {
        setToast({ msg, ok, attribution });
        setTimeout(() => setToast(null), 5000);
    }

    function handleLaunch() {
        if (!selectedDomain || !selectedAgent) return;
        startTransition(async () => {
            const res = await launchCovertOpAction(
                'PLAYER_FACTION',
                'enemy-faction',
                'sys-kerath-prime',
                selectedDomain,
                invest,
                risk
            );

            if (res.success) {
                showToast('Operation Launched', true);
                setSelectedDomain(null);
                setSelectedAgent(null);
                await refresh();
            } else {
                showToast(res.error || 'Launch Failed', false);
            }
        });
    }

    return (
        <div className="p-4 space-y-5">
            {/* Op type selector */}
            <div>
                <div className="text-[10px] font-display tracking-widest text-slate-500 mb-2">SELECT OPERATION TYPE</div>
                <div className="grid grid-cols-3 gap-2">
                    {OP_CARDS.map(card => (
                        <button key={card.domain} onClick={() => setSelectedDomain(card.domain)}
                            className={`rounded-lg border p-3 text-left transition-all ${selectedDomain === card.domain
                                ? 'border-red-600/60 bg-red-950/40'
                                : 'border-slate-700/30 bg-slate-900/50 hover:border-slate-600/40'}`}>
                            <div style={{ color: card.color }} className="mb-2">{card.icon}</div>
                            <div className="text-[10px] font-display text-slate-200 mb-1">{card.label}</div>
                            <div className="text-[9px] text-slate-500 leading-tight">{card.desc}</div>
                            <div className="mt-2">
                                <span className={`text-[9px] font-display ${card.baseRisk === 'HIGH' ? 'text-red-400' : card.baseRisk === 'MEDIUM' ? 'text-amber-400' : 'text-green-400'}`}>
                                    {card.baseRisk} RISK
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Agent & parameter config */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-2">ASSIGN AGENT</div>
                    <div className="space-y-1.5">
                        {deployedAgents.map(a => (
                            <button key={a.id} onClick={() => setSelectedAgent(selectedAgent === a.id ? null : a.id)}
                                className={`w-full flex items-center gap-2 rounded border p-2 text-left transition-all ${selectedAgent === a.id ? 'border-blue-600/60 bg-blue-950/30' : 'border-slate-700/30 hover:border-slate-600/40'}`}>
                                <Eye size={10} className="text-slate-400 shrink-0" />
                                <div className="flex-1">
                                    <div className="text-[10px] text-slate-200">{a.codename}</div>
                                    <div className="text-[9px] text-slate-600">XP {a.experienceLevel}</div>
                                </div>
                                <div className="flex flex-wrap gap-0.5">
                                    {a.traitIds.slice(0, 2).map(t => <TraitChip key={t} traitId={t} />)}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-500 mb-1 flex justify-between">
                            <span>INVESTMENT</span> <span className="text-amber-400">{Math.round(invest * 100)}%</span>
                        </div>
                        <input type="range" min={10} max={100} value={Math.round(invest * 100)}
                            onChange={e => setInvest(Number(e.target.value) / 100)}
                            className="w-full accent-amber-500" />
                    </div>
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-500 mb-1 flex justify-between">
                            <span>RISK LEVEL</span> <span className="text-red-400">{Math.round(risk * 100)}%</span>
                        </div>
                        <input type="range" min={10} max={100} value={Math.round(risk * 100)}
                            onChange={e => setRisk(Number(e.target.value) / 100)}
                            className="w-full accent-red-500" />
                    </div>

                    {estimatedSuccess !== null && (
                        <div className="bg-slate-900/80 rounded-lg border border-slate-700/40 p-3">
                            <div className="text-[9px] text-slate-500 mb-1">ESTIMATED SUCCESS RATE</div>
                            <div className={`text-2xl font-mono font-bold ${estimatedSuccess > 0.7 ? 'text-green-400' : estimatedSuccess > 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                                {Math.round(estimatedSuccess * 100)}%
                            </div>
                            {agent && (
                                <div className="text-[9px] text-slate-600 mt-1 flex items-center gap-1">
                                    <ChevronRight size={8} /> +{Math.round(agent.experienceLevel / 100 * 15)}% from agent XP
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button
                onClick={handleLaunch}
                disabled={!selectedDomain || !selectedAgent || isPending}
                className="w-full py-3 rounded-lg border font-display text-sm tracking-widest transition-all
                    disabled:border-slate-800 disabled:text-slate-700 disabled:bg-transparent disabled:cursor-not-allowed
                    enabled:border-red-700 enabled:text-red-400 enabled:bg-red-950/30 enabled:hover:bg-red-950/50 flex items-center justify-center gap-2">
                {isPending ? <><Loader2 size={14} className="animate-spin" /> LAUNCHING...</> : !selectedDomain ? 'SELECT AN OPERATION TYPE' : !selectedAgent ? 'ASSIGN AN AGENT' : '⚡ LAUNCH OPERATION'}
            </button>

            {/* Toast */}
            {toast && (
                <div className={`px-3 py-2 rounded-lg flex items-center gap-2 text-xs ${toast.ok ? 'bg-green-950/80 border border-green-700/60 text-green-300' : 'bg-red-950/80 border border-red-700/60 text-red-300'}`}>
                    {toast.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    <div>
                        <div>{toast.msg}</div>
                        {toast.attribution && (
                            <div className="text-[9px] opacity-70 mt-0.5">Attribution risk: {toast.attribution.toUpperCase()}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

type Tab = 'roster' | 'networks' | 'ops';

export default function EspionageAgencyPanel() {
    const [tab, setTab] = useState<Tab>('roster');
    const [agents, setAgents] = useState<SpyAgent[]>([]);
    const [networks, setNetworks] = useState<IntelNetwork[]>([]);
    const [loading, setLoading] = useState(true);

    const loadState = async () => {
        setLoading(true);
        try {
            const state = await getEspionageStateAction('PLAYER_FACTION');
            setAgents(state.agents);
            setNetworks(state.networks);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadState();
    }, []);

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'roster', label: 'AGENT ROSTER', icon: <Eye size={11} /> },
        { id: 'networks', label: 'INTEL NETWORKS', icon: <Globe size={11} /> },
        { id: 'ops', label: 'COVERT OPS', icon: <Target size={11} /> },
    ];

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700/40 flex justify-between items-center">
                <div>
                    <h2 className="font-display text-sm tracking-widest text-red-400 flex items-center gap-2">
                        <Shield size={14} /> ESPIONAGE AGENCY
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Agent roster, intel networks &amp; covert operations command
                    </p>
                </div>
                {loading && <Loader2 size={16} className="animate-spin text-slate-500" />}
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-slate-700/40 px-6">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`py-2 px-3 text-[10px] font-display tracking-widest flex items-center gap-1.5 transition-colors border-b-2 -mb-px ${tab === t.id
                            ? 'text-red-400 border-red-500'
                            : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
                        {t.icon}{t.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
                {tab === 'roster' && <AgentRosterTab agents={agents} refresh={loadState} />}
                {tab === 'networks' && <IntelNetworksTab networks={networks} />}
                {tab === 'ops' && <CovertOpsTab agents={agents} refresh={loadState} />}
            </div>
        </div>
    );
}
