'use client';

/**
 * Counter-intelligence: what you spend to defend your own house (item 11e).
 *
 *   Service budget   pulls counter-intelligence strength toward budget × 100.
 *                    Strength cuts every foreign operation's odds against you
 *                    and makes their reports on you likelier to be planted.
 *   System coverage  raises the chance an operation in that system is traced.
 *   Sweep            a one-off operation in one of your systems: breaks up
 *                    foreign networks there and loosens every rival's hold.
 *
 * Budget and coverage are paid every hour in Intel. The numbers here use the
 * worker's own functions (lib/espionage/counter-intel.ts), so the page and the
 * bill agree.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Lock, Save, ShieldCheck, Target } from 'lucide-react';
import type { FactionIntelState, SpyAgent } from '@/types/ui-state';
import {
    counterIntelUpkeepPerHour,
    MAX_COVERED_SYSTEMS,
} from '@/lib/espionage/counter-intel';
import { OPERATION_CATALOG_BY_ID, catalogOwnSideChance, clampSuccessChance } from '@/lib/espionage/operation-catalog';
import { agentSuccessModifier, AGENT_TRAITS } from '@/lib/espionage/agent-types';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';
import { formatSimDurationAsReal } from '@/lib/time/galactic-time';
import { visibleTraits } from './AgentCard';

/** Intel income per sim hour (tickFactionIntel). */
const INTEL_INCOME_PER_SIM_HOUR = 1.5;
/** Sim hours in one real hour. */
const SIM_HOURS_PER_REAL_HOUR = SIM_SECONDS_PER_REAL_SECOND;
const LEVELS = [0, 0.25, 0.5, 0.75, 1];

interface Props {
    intel: FactionIntelState | null;
    ownSystems: { id: string; name: string }[];
    agents: SpyAgent[];
    credits: number;
    techBonus: number;
    busy: boolean;
    onSavePlan: (budget: number, regions: Record<string, number>) => void;
    onSweep: (systemId: string, agentId: string | null) => void;
}

const perRealHour = (perSimHour: number) => perSimHour * SIM_HOURS_PER_REAL_HOUR;

export function CounterIntelTab({ intel, ownSystems, agents, credits, techBonus, busy, onSavePlan, onSweep }: Props) {
    const savedBudget = intel?.counterIntelBudget ?? 0;
    const savedRegional = useMemo(() => intel?.regionalCounterIntel ?? {}, [intel?.regionalCounterIntel]);
    const [budget, setBudget] = useState(savedBudget);
    const [regional, setRegional] = useState<Record<string, number>>(savedRegional);
    const [sweepSystem, setSweepSystem] = useState('');
    const [agentId, setAgentId] = useState('');

    // Follow the server when nothing is being edited.
    const dirty = budget !== savedBudget || JSON.stringify(regional) !== JSON.stringify(savedRegional);
    useEffect(() => {
        if (!dirty) { setBudget(savedBudget); setRegional(savedRegional); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedBudget, savedRegional]);

    const strength = intel?.counterIntelStrength ?? 0;
    const unpaid = !!intel?.counterIntelUnpaid;
    const upkeep = counterIntelUpkeepPerHour(budget, regional);
    const covered = Object.values(regional).filter(v => v > 0).length;
    const overBudget = upkeep > INTEL_INCOME_PER_SIM_HOUR;

    const setLevel = (systemId: string, level: number) => {
        setRegional(prev => {
            const next = { ...prev };
            if (level <= 0) delete next[systemId]; else next[systemId] = level;
            return next;
        });
    };

    // ── Sweep ───────────────────────────────────────────────────────────────
    const sweep = OPERATION_CATALOG_BY_ID.get('counterintel_sweep');
    const freeAgents = agents.filter(a => a.status === 'available');
    const agent = freeAgents.find(a => a.id === agentId) ?? null;
    const target = sweepSystem || ownSystems[0]?.id || '';
    const atCapacity = !!intel && intel.usedAgentCapacity >= intel.agentCapacity;
    const sweepBlocker = !sweep ? 'Unavailable'
        : !target ? 'You hold no system to sweep'
            : atCapacity ? 'All operation slots busy'
                : (intel?.intelPoints ?? 0) < sweep.intelCost ? `Needs ${sweep.intelCost} Intel`
                    : credits < sweep.creditsCost ? `Needs § ${sweep.creditsCost}`
                        : null;
    const sweepOdds = sweep
        ? clampSuccessChance(catalogOwnSideChance(sweep, {
            infiltration: strength,
            techBonus,
            agentModifier: agent ? agentSuccessModifier(visibleTraits(agent.traitIds), agent.experienceLevel, sweep.category) : 0,
        }))
        : 0;

    return (
        <div className="space-y-6">
            {/* Strength */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[10px] font-display tracking-widest text-emerald-400 uppercase flex items-center gap-2">
                        <ShieldCheck size={12} /> Counter-intelligence strength
                    </h3>
                    <span className="text-sm font-mono text-slate-200">{Math.round(strength)}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, strength)}%` }} />
                </div>
                <p className="text-[10px] text-slate-500">
                    Every point cuts foreign operations&apos; odds against you, and makes what their spies report about you likelier to be planted. Strength moves slowly toward what your budget pays for.
                </p>
                {unpaid && (
                    <div className="text-[10px] text-red-400 flex items-center gap-1.5">
                        <AlertTriangle size={11} /> Not enough Intel to pay upkeep. Coverage is down and strength is falling.
                    </div>
                )}
            </div>

            {/* Plan */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-4">
                <div>
                    <div className="text-[9px] font-bold tracking-widest text-slate-500 mb-1 flex justify-between uppercase">
                        <span>Service budget</span><span className="text-emerald-400">{Math.round(budget * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={Math.round(budget * 100)}
                        onChange={e => setBudget(Number(e.target.value) / 100)} className="w-full accent-emerald-500" />
                    <p className="text-[10px] text-slate-500 mt-1">Aims strength at {Math.round(budget * 100)}.</p>
                </div>

                <div>
                    <div className="text-[9px] font-bold tracking-widest text-slate-500 mb-2 uppercase flex justify-between">
                        <span>System coverage</span>
                        <span className={covered >= MAX_COVERED_SYSTEMS ? 'text-amber-400' : ''}>{covered}/{MAX_COVERED_SYSTEMS} covered</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2">Covered systems are watched: operations run there are likelier to be traced back to whoever sent them.</p>
                    {ownSystems.length === 0 ? (
                        <p className="text-[10px] text-slate-500">You hold no systems yet.</p>
                    ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                            {ownSystems.map(s => {
                                const level = regional[s.id] ?? 0;
                                return (
                                    <div key={s.id} className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-slate-300 truncate">{s.name}</span>
                                        <div className="flex gap-1 shrink-0">
                                            {LEVELS.map(l => {
                                                const blocked = l > 0 && level === 0 && covered >= MAX_COVERED_SYSTEMS;
                                                return (
                                                    <button key={l} disabled={blocked} onClick={() => setLevel(s.id, l)}
                                                        className={`min-w-[40px] px-1.5 py-1.5 rounded text-[10px] font-mono border ${level === l
                                                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                                                            : 'border-slate-800 text-slate-500 hover:border-slate-600'} disabled:opacity-30`}>
                                                        {l === 0 ? 'off' : `${l * 100}%`}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                    <div className={`text-[10px] font-mono ${overBudget ? 'text-red-400' : 'text-slate-400'}`}
                        title="Per real hour. Your Intel income covers this or the plan stops working.">
                        Upkeep {perRealHour(upkeep).toFixed(1)} Intel/h · income {perRealHour(INTEL_INCOME_PER_SIM_HOUR).toFixed(1)} Intel/h
                        {overBudget && ' · costs more than you earn'}
                    </div>
                    <button disabled={!dirty || busy} onClick={() => onSavePlan(budget, regional)}
                        className={`px-4 py-2 rounded uppercase font-display text-[10px] tracking-widest flex items-center gap-1.5 ${dirty && !busy
                            ? 'bg-emerald-600 text-slate-950 hover:bg-emerald-500'
                            : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'}`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        {dirty ? 'Save plan' : 'Saved'}
                    </button>
                </div>
            </div>

            {/* Sweep */}
            {sweep && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3">
                    <h3 className="text-[10px] font-display tracking-widest text-amber-500 uppercase flex items-center gap-2">
                        <Target size={12} /> {sweep.name}
                    </h3>
                    <p className="text-[10px] text-slate-500">
                        Audit one of your systems. Foreign networks found there are broken up, and every rival&apos;s infiltration of you drops. You will not know who is watching until you look.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select value={target} onChange={e => setSweepSystem(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 outline-none">
                            {ownSystems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select value={agent ? agent.id : ''} onChange={e => setAgentId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 outline-none">
                            <option value="">No agent</option>
                            {freeAgents.map(a => (
                                <option key={a.id} value={a.id}>
                                    {a.codename} · {visibleTraits(a.traitIds).map(t => AGENT_TRAITS[t]?.label ?? t).join(', ')}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400">
                        <span>{sweep.intelCost} Intel</span>
                        <span>§ {sweep.creditsCost}</span>
                        <span>{formatSimDurationAsReal(sweep.durationHoursMin * 3600)} to {formatSimDurationAsReal(sweep.durationHoursMax * 3600)}</span>
                        <span>~{Math.round(sweepOdds * 100)}% to succeed</span>
                    </div>
                    <button disabled={!!sweepBlocker || busy}
                        onClick={() => { onSweep(target, agent ? agent.id : null); setAgentId(''); }}
                        className={`w-full py-2 rounded uppercase font-display text-[10px] tracking-widest flex items-center justify-center gap-1.5 ${sweepBlocker || busy
                            ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                            : 'bg-amber-600 text-slate-950 hover:bg-amber-500'}`}>
                        {busy ? <Loader2 size={11} className="animate-spin" /> : sweepBlocker ? <Lock size={11} /> : <Target size={11} />}
                        {sweepBlocker ?? 'Launch sweep'}
                    </button>
                </div>
            )}
        </div>
    );
}
