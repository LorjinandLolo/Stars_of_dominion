'use client';

import React from 'react';
import { SpyAgent, AgentStatus } from '@/types/ui-state';
import { MapPin, Zap } from 'lucide-react';
import { AGENT_TRAITS, type AgentTraitId } from '@/lib/espionage/agent-types';
import { formatGalacticDeadline } from '@/lib/time/galactic-time';
import { speciesLabel } from '@/lib/espionage/dossier';

interface AgentCardProps {
    agent: SpyAgent;
    /** Display name of the system the agent is deployed to, if any. */
    systemName?: string | null;
    nowSeconds: number;
    /** Set when the empire cannot deploy agents yet (missing tech). */
    deployBlockedReason?: string | null;
    onDeploy?: (agentId: string) => void;
    onRecall?: (agentId: string) => void;
}

const STATUS: Record<AgentStatus, { label: string; color: string }> = {
    available: { label: 'AVAILABLE', color: '#10b981' },
    deployed: { label: 'DEPLOYED', color: '#3b82f6' },
    on_cooldown: { label: 'RESTING', color: '#f59e0b' },
    on_operation: { label: 'ON OPERATION', color: '#a855f7' },
    burned: { label: 'BURNED', color: '#ef4444' },
    captured: { label: 'CAPTURED', color: '#8b5cf6' },
    turned: { label: 'TRAITOR', color: '#dc2626' },
};

/**
 * Traits the owner is allowed to see. `compromised` is a hidden malus: the
 * trait definition says the owner is unaware of it unless counter-intelligence
 * finds it, so it is drawn only once the owner's service has outed them.
 */
export function visibleTraits(traitIds: AgentTraitId[], compromiseKnown = false): AgentTraitId[] {
    return compromiseKnown ? traitIds : traitIds.filter(t => t !== 'compromised');
}

export function TraitChip({ traitId }: { traitId: AgentTraitId }) {
    const trait = AGENT_TRAITS[traitId];
    if (!trait) return null;
    return (
        <span
            title={trait.description}
            className="text-[9px] bg-slate-800 text-slate-300 border border-slate-700/40 px-1.5 py-0.5 rounded uppercase tracking-tighter cursor-help"
        >
            {trait.label}
        </span>
    );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[9px] uppercase font-bold tracking-tight text-slate-500">
                <span>{label}</span>
                <span style={{ color }}>{pct}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, systemName, nowSeconds, deployBlockedReason, onDeploy, onRecall }) => {
    const sc = STATUS[agent.status];
    const coverColor = agent.coverStrength < 0.3 ? '#ef4444' : agent.coverStrength < 0.6 ? '#f59e0b' : '#3b82f6';
    const loyaltyColor = agent.loyaltyRating < 0.5 ? '#f97316' : '#22c55e';

    return (
        <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-lg overflow-hidden hover:border-slate-700 transition-colors flex flex-col">
            <div className="p-4 pb-2 border-b border-slate-800/40">
                <div className="flex justify-between items-start mb-1">
                    <div>
                        <div className="text-lg font-mono tracking-wider text-slate-100 uppercase leading-none">
                            {agent.codename}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tighter">
                            {agent.name}{agent.species ? ` · ${speciesLabel(agent.species)}` : ''} · {agent.operationsRun} op{agent.operationsRun === 1 ? '' : 's'}
                        </p>
                    </div>
                    <span
                        className="text-[9px] font-display px-1.5 py-0.5 rounded leading-none border"
                        style={{ color: sc.color, backgroundColor: `${sc.color}11`, borderColor: `${sc.color}33` }}
                    >
                        {sc.label}
                    </span>
                </div>
            </div>

            <div className="p-4 pt-3 flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/30 p-1.5 rounded border border-slate-700/20">
                        <Zap size={11} className="text-blue-400" />
                        <span className="font-mono">LVL {Math.floor(agent.experienceLevel / 10)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/30 p-1.5 rounded border border-slate-700/20 min-w-0">
                        <MapPin size={11} className="text-orange-400 shrink-0" />
                        <span className="truncate font-mono">{agent.deployedToSystemId ? (systemName ?? 'Unknown system') : 'At home'}</span>
                    </div>
                </div>

                <Bar label="Cover" value={agent.coverStrength} color={coverColor} />
                <Bar label="Loyalty" value={agent.loyaltyRating} color={loyaltyColor} />

                <div className="flex flex-wrap gap-1">
                    {visibleTraits(agent.traitIds, agent.compromiseKnown).map(t => <TraitChip key={t} traitId={t} />)}
                </div>

                <div className="pt-1">
                    {agent.status === 'available' && deployBlockedReason ? (
                        <div className="w-full bg-slate-900 text-slate-500 border border-slate-800 py-2 rounded text-[10px] text-center" title={deployBlockedReason}>
                            {deployBlockedReason}
                        </div>
                    ) : agent.status === 'available' ? (
                        <button
                            className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 py-2 rounded text-[10px] font-display tracking-widest transition-colors uppercase"
                            onClick={() => onDeploy?.(agent.id)}
                        >
                            Assign to a system
                        </button>
                    ) : agent.status === 'deployed' ? (
                        <button
                            className="w-full bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 border border-slate-600/30 py-2 rounded text-[10px] font-display tracking-widest transition-colors uppercase"
                            onClick={() => onRecall?.(agent.id)}
                        >
                            Recall
                        </button>
                    ) : (
                        <div className="w-full bg-slate-900 text-slate-500 border border-slate-800 py-2 rounded text-[10px] font-display tracking-widest uppercase text-center">
                            {agent.status === 'on_cooldown' && agent.cooldownUntil
                                ? `Ready ${formatGalacticDeadline(agent.cooldownUntil, nowSeconds)}`
                                : agent.status === 'on_operation' ? 'Running an operation'
                                : agent.status === 'burned' ? 'Cover blown' : 'Unavailable'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
