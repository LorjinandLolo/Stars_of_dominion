'use client';

/**
 * The player's operation picker: the same catalog the AI runs
 * (lib/espionage/operation-catalog.ts), gated by the same network stages.
 *
 * Pick an empire, then a system of theirs, then an operation. Locked
 * operations stay visible and say what unlocks them, so the network stages
 * read as a ladder rather than a wall. The odds shown are the actor's half of
 * the worker's own formula (catalogOwnSideChance): the target's
 * counter-intelligence is their secret and is subtracted at resolution.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, Lock, Search, Target } from 'lucide-react';
import {
    OPERATION_CATALOG,
    OFFENSIVE_CATEGORIES,
    CATEGORY_LABELS,
    catalogOwnSideChance,
    clampSuccessChance,
    type OperationDefinition,
} from '@/lib/espionage/operation-catalog';
import { canLaunchCategory, stageForInfiltration, stageInfo, MIN_STAGE_FOR_CATEGORY } from '@/lib/espionage/network-stages';
import { techIdsHaveFlag } from '@/lib/tech/flags';
import { formatSimDurationAsReal } from '@/lib/time/galactic-time';
import { agentSuccessModifier, agentAttributionAvoidance, AGENT_TRAITS } from '@/lib/espionage/agent-types';
import type { SpyAgent } from '@/types/ui-state';
import { visibleTraits } from './AgentCard';

export interface RivalGroup {
    owner: string;
    name: string;
    systems: { id: string; name: string }[];
}

interface Props {
    rivals: RivalGroup[];
    infiltrationLevels: Record<string, number>;
    intelPoints: number;
    credits: number;
    capacity: { used: number; max: number } | null;
    techBonus: number;
    unlockedTechIds: string[];
    /** The player's agents; only available ones can be put on an operation. */
    agents: SpyAgent[];
    busy: boolean;
    onLaunch: (targetFactionId: string, systemId: string, def: OperationDefinition, agentId: string | null, falseFlagFactionId?: string | null) => void;
}

const RISK_COLOR: Record<OperationDefinition['risk'], string> = {
    low: '#10b981',
    medium: '#f59e0b',
    high: '#f97316',
    extreme: '#ef4444',
};

function durationLabel(def: OperationDefinition): string {
    const lo = formatSimDurationAsReal(def.durationHoursMin * 3600);
    const hi = formatSimDurationAsReal(def.durationHoursMax * 3600);
    return lo === hi ? lo : `${lo} to ${hi}`;
}

export function CatalogLauncher({
    rivals, infiltrationLevels, intelPoints, credits, capacity, techBonus, unlockedTechIds, agents, busy, onLaunch,
}: Props) {
    const [targetId, setTargetId] = useState('');
    const [systemId, setSystemId] = useState('');
    const [agentId, setAgentId] = useState('');
    /** Who a false-flag operation is dressed up as, per operation. */
    const [frames, setFrames] = useState<Record<string, string>>({});

    const freeAgents = agents.filter(a => a.status === 'available');
    // Drop a pick whose agent got busy (or burned) since it was chosen.
    const agent = freeAgents.find(a => a.id === agentId) ?? null;
    // What the player knows about their agent: hidden traits never count here.
    const knownTraits = agent ? visibleTraits(agent.traitIds) : [];
    const avoidance = agent ? agentAttributionAvoidance(knownTraits) : 0;

    const target = rivals.find(r => r.owner === targetId) ?? null;
    const infiltration = targetId ? (infiltrationLevels[targetId] ?? 0) : 0;
    const stage = stageInfo(stageForInfiltration(infiltration));
    const hasBlackMarket = useMemo(() => techIdsHaveFlag(unlockedTechIds, 'ENABLE_SHADOW_ECONOMY'), [unlockedTechIds]);
    const atCapacity = !!capacity && capacity.used >= capacity.max;

    const pickTarget = (owner: string) => {
        setTargetId(owner);
        const group = rivals.find(r => r.owner === owner);
        setSystemId(group?.systems[0]?.id ?? '');
    };

    /** Why this operation cannot be launched right now, or null when it can. */
    const blocker = (def: OperationDefinition): string | null => {
        const gate = canLaunchCategory(infiltration, def.category);
        if (!gate.allowed) {
            const need = stageInfo(MIN_STAGE_FOR_CATEGORY[def.category]);
            return `Needs ${need.label} (infiltration ${need.minInfiltration})`;
        }
        if (def.category === 'economic' && !hasBlackMarket) return 'Needs Black Market Operations';
        if (atCapacity) return 'All operation slots busy';
        if (intelPoints < def.intelCost) return `Needs ${def.intelCost} Intel`;
        if (credits < def.creditsCost) return `Needs § ${def.creditsCost}`;
        return null;
    };

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-display tracking-widest text-amber-500 uppercase flex items-center gap-2">
                    <Search size={12} /> New operation
                </h3>
                {capacity && (
                    <span className={`text-[10px] font-mono ${atCapacity ? 'text-red-400' : 'text-slate-400'}`}
                        title="How many operations your service can run at once.">
                        Slots {capacity.used}/{capacity.max}
                    </span>
                )}
            </div>

            {rivals.length === 0 ? (
                <p className="text-[11px] text-slate-500">You have not found another empire's system yet. Survey further out.</p>
            ) : (
                <>
                    <div>
                        <label className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Target empire</label>
                        <div className="flex flex-wrap gap-2">
                            {rivals.map(r => {
                                const lvl = infiltrationLevels[r.owner] ?? 0;
                                return (
                                    <button
                                        key={r.owner}
                                        onClick={() => pickTarget(r.owner)}
                                        className={`px-3 py-2 rounded border text-left transition-all ${targetId === r.owner
                                            ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                                            : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600'}`}
                                    >
                                        <div className="text-[11px]">{r.name}</div>
                                        <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                                            {stageInfo(stageForInfiltration(lvl)).label} · {Math.floor(lvl)}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {target && (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Where</label>
                                    <select
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 focus:border-amber-500/50 outline-none"
                                        value={systemId}
                                        onChange={e => setSystemId(e.target.value)}
                                    >
                                        {target.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="text-[10px] text-slate-400 bg-slate-950/40 border border-slate-800 rounded px-3 py-2">
                                    <span className="text-purple-300">{stage.label}</span> · {stage.description}
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] text-slate-500 uppercase tracking-widest block mb-2 font-bold">Agent (optional)</label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 focus:border-amber-500/50 outline-none"
                                    value={agent ? agent.id : ''}
                                    onChange={e => setAgentId(e.target.value)}
                                >
                                    <option value="">No agent: the service runs it</option>
                                    {freeAgents.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.codename} · level {Math.floor(a.experienceLevel / 10)} · {visibleTraits(a.traitIds).map(t => AGENT_TRAITS[t]?.label ?? t).join(', ')}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-500 mt-1">
                                    {agent
                                        ? `${agent.codename}'s traits shift the odds below. They gain experience and spend cover, more if they are caught, and rest afterwards.${avoidance > 0 ? ' Harder to trace back to you.' : avoidance < 0 ? ' Easier to trace back to you.' : ''}`
                                        : agents.length === 0
                                            ? 'You have no agents yet. Recruit one on the Agents tab.'
                                        : freeAgents.length === 0
                                            ? 'No agent is free. Agents in the field, resting or on another operation cannot take one.'
                                            : 'An agent adds their skills to the operation, and risks their cover.'}
                                </p>
                            </div>

                            <div className="space-y-4">
                                {OFFENSIVE_CATEGORIES.map(category => {
                                    const defs = OPERATION_CATALOG.filter(d => d.category === category);
                                    if (defs.length === 0) return null;
                                    const unlocked = canLaunchCategory(infiltration, category).allowed;
                                    return (
                                        <div key={category}>
                                            <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase mb-2 flex items-center gap-2">
                                                {!unlocked && <Lock size={10} />}
                                                {CATEGORY_LABELS[category]}
                                                {!unlocked && (
                                                    <span className="normal-case tracking-normal text-slate-600">
                                                        · opens at {stageInfo(MIN_STAGE_FOR_CATEGORY[category]).label}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {defs.map(def => {
                                                    const why = blocker(def);
                                                    const agentModifier = agent ? agentSuccessModifier(knownTraits, agent.experienceLevel, def.category) : 0;
                                                    const odds = clampSuccessChance(catalogOwnSideChance(def, { infiltration, techBonus, agentModifier }));
                                                    return (
                                                        <div key={def.id}
                                                            className={`rounded-lg border p-3 flex flex-col gap-2 ${unlocked ? 'border-slate-800 bg-slate-950/40' : 'border-slate-800/50 bg-slate-950/20 opacity-60'}`}>
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="text-[12px] text-slate-200">{def.name}</div>
                                                                <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color: RISK_COLOR[def.risk] }}>
                                                                    {def.risk} risk
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 leading-snug">{def.description}</div>
                                                            {def.falseFlag && (
                                                                <select value={frames[def.id] ?? ''} onChange={e => setFrames(f => ({ ...f, [def.id]: e.target.value }))}
                                                                    className="w-full min-h-[40px] bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 outline-none"
                                                                    title="Their codes at the scene: the victim's file fills with evidence against them, and the victim's anger goes their way.">
                                                                    <option value="">Dress it up as: nobody (no frame)</option>
                                                                    {rivals.filter(r => r.owner !== target.owner).map(r => <option key={r.owner} value={r.owner}>Dress it up as: {r.name}</option>)}
                                                                </select>
                                                            )}
                                                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400">
                                                                <span>{def.intelCost} Intel</span>
                                                                <span>§ {def.creditsCost}</span>
                                                                <span>{durationLabel(def)}</span>
                                                                <span title="Your side of the odds. Their counter-intelligence and security are subtracted when it resolves.">
                                                                    ~{Math.round(odds * 100)}% before their defences
                                                                    {agent && agentModifier !== 0 && ` (${agentModifier > 0 ? '+' : ''}${Math.round(agentModifier * 100)} from ${agent.codename})`}
                                                                </span>
                                                            </div>
                                                            <button
                                                                disabled={!!why || busy || !systemId}
                                                                onClick={() => { onLaunch(target.owner, systemId, def, agent ? agent.id : null, frames[def.id] || null); setAgentId(''); }}
                                                                className={`mt-auto py-2 rounded uppercase font-display text-[10px] tracking-widest flex items-center justify-center gap-1.5 ${why || busy
                                                                    ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                                                    : 'bg-amber-600 text-slate-950 hover:bg-amber-500'}`}
                                                            >
                                                                {busy ? <Loader2 size={11} className="animate-spin" /> : why ? <Lock size={11} /> : <Target size={11} />}
                                                                {why ?? 'Launch'}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
