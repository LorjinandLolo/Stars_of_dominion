"use client";

import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Newspaper, 
    TrendingUp, 
    TrendingDown, 
    Activity, 
    ShieldAlert, 
    ZapOff, 
    Radio, 
    Map as MapIcon,
    AlertCircle,
    Globe,
    Shield
} from 'lucide-react';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { CampaignObjective, CrisisChoice, InvestigationStage } from '@/lib/press-system/types';

const STAGE_SEQUENCE = [
    InvestigationStage.RUMOUR,
    InvestigationStage.INQUIRY,
    InvestigationStage.EVIDENCE,
    InvestigationStage.PUBLICATION,
    InvestigationStage.SCANDAL,
];

const TONE_CONFIG: Record<string, { color: string; label: string }> = {
    neutral: { color: '#94a3b8', label: 'NEUTRAL' },
    state: { color: '#3b82f6', label: 'STATE' },
    rebel: { color: '#ef4444', label: 'REBEL' },
    sensational: { color: '#f59e0b', label: 'SENSATIONAL' },
};

export default function PressPanel() {
    const {
        regions,
        systems,
        pressState,
        selectedSystemId,
        playerFactionId,
        factions,
        updatePress
    } = useUIStore();
    const [campaignTarget, setCampaignTarget] = useState<string>('');
    const [campaignObjective, setCampaignObjective] = useState<CampaignObjective>(CampaignObjective.UNDERMINE_TRUST);
    
    const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
        pressState.publishedStories[0]?.id || null
    );

    // Filter systems for the viral map based on intensity
    const activeStory = pressState.publishedStories.find(s => s.id === selectedStoryId);
    const hotspots = activeStory?.transmissionMap || new Map<string, number>();

    const avgInstability = regions.reduce((s, r) => s + (100 - r.metrics.stabilityIndex), 0) / regions.length;
    const isHighTension = avgInstability > 50;

    const handleSeed = async (publishedId: string) => {
        if (!selectedSystemId || !playerFactionId) return;
        // selectedStoryId tracks a PublishedStory; the worker looks the seed up in
        // activeStories, so send the underlying story id, not the publication id.
        const pub = pressState.publishedStories.find(p => p.id === publishedId);
        if (!pub) return;
        await dispatchOrder({
            actionId: 'PRESS_SEED_STORY',
            payload: { storyId: pub.storyId, systemId: selectedSystemId },
            factionId: playerFactionId,
            label: 'Seed story',
        });
    };

    const handleQuarantine = async (systemId: string) => {
        if (!playerFactionId) return;
        const res = await dispatchOrder({
            actionId: 'PRESS_TOGGLE_QUARANTINE',
            payload: { systemId },
            factionId: playerFactionId,
            label: 'Toggle quarantine',
        });
        if (res.success) {
            // Worker keys press planets as planet_${systemId}.
            const key = `planet_${systemId}`;
            const next = new Set(pressState.quarantinedPlanets);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            updatePress({ quarantinedPlanets: next });
        }
    };

    const handleJam = async (systemId: string) => {
        if (!playerFactionId) return;
        const res = await dispatchOrder({
            actionId: 'PRESS_TOGGLE_JAM',
            payload: { systemId },
            factionId: playerFactionId,
            label: 'Toggle signal jam',
        });
        if (res.success) {
            const next = new Set(pressState.jammedSystems);
            if (next.has(systemId)) next.delete(systemId);
            else next.add(systemId);
            updatePress({ jammedSystems: next });
        }
    };

    const handleCounterNarrative = async (systemId: string) => {
        if (!playerFactionId) return;
        const res = await dispatchOrder({
            actionId: 'PRESS_DEPLOY_COUNTER_NARRATIVE',
            payload: { systemId },
            factionId: playerFactionId,
            label: 'Deploy counter-narrative',
        });
        if (res.success) {
            const next = new Map(pressState.counterNarratives);
            next.set(systemId, 100);
            updatePress({ counterNarratives: next });
        }
    };

    const handleCampaignOrder = async (actionId: string, payload: Record<string, any>, label: string) => {
        if (!playerFactionId) return;
        await dispatchOrder({ actionId, payload, factionId: playerFactionId, label });
    };

    const handleInvestigationResponse = async (investigationId: string, actionId: string) => {
        if (!playerFactionId) return;
        const res = await dispatchOrder({
            actionId,
            payload: { investigationId },
            factionId: playerFactionId,
            label: `Investigation: ${actionId.replace('PRESS_INV_', '').toLowerCase()}`,
        });
        if (res.success && actionId !== 'PRESS_INV_OBSTRUCT') {
            // Terminal responses optimistically close the card; obstruct keeps
            // digging and its outcome only shows after the worker rolls it.
            const next = new Map(pressState.investigations);
            const inv = next.get(investigationId);
            if (inv) next.set(investigationId, { ...inv, resolved: true });
            updatePress({ investigations: next });
        }
    };

    const handleResolveCrisis = async (crisisId: string, choice: CrisisChoice) => {
        if (!playerFactionId) return;
        const res = await dispatchOrder({
            actionId: 'PRESS_RESOLVE_CRISIS',
            payload: { crisisId, choice },
            factionId: playerFactionId,
            label: `Crisis response: ${choice}`,
        });
        if (res.success) {
            // Optimistically hide the crisis; the worker's outcome arrives on next sync.
            const next = new Map(pressState.crises);
            const c = next.get(crisisId);
            if (c) next.set(crisisId, { ...c, resolved: true, choiceMade: choice });
            updatePress({ crises: next });
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/40">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700/40" style={{
                background: isHighTension
                    ? 'linear-gradient(to right, rgba(127,29,29,0.3), transparent)'
                    : undefined
            }}>
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="font-display text-sm tracking-widest text-amber-400">VIRAL PRESS SYSTEM</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tighter">
                            Plague-News Model · Real-time Contagion
                        </p>
                    </div>
                    {isHighTension && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-[9px] font-bold animate-pulse">
                            <AlertCircle size={10} />
                            HIGHTENED STATE
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                
                {/* Viral Spread Map (Topological) */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-2">
                            <MapIcon size={12} className="text-amber-500" /> INFODEMIC HOTZONES
                        </div>
                        {selectedStoryId && (
                            <div className="text-[9px] font-mono text-amber-400 opacity-60">
                                ACTIVE: {selectedStoryId.slice(0, 8)}
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900/80 border border-slate-700/40 rounded-xl p-4 relative min-h-[160px]">
                        {!selectedStoryId ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40">
                                <Radio size={32} className="mb-2 animate-bounce" />
                                <span className="text-[10px] font-display">NO ACTIVE INFODEMIC</span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {Array.from(hotspots.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([pid, intensity]) => {
                                    const sysId = pid.startsWith('planet_') ? pid.replace('planet_', '') : pid;
                                    const plant = systems.find(s => s.id === sysId);
                                    return (
                                        <div key={pid} className="flex flex-col gap-1">
                                            <div className="flex justify-between text-[10px] items-center">
                                                <span className="text-slate-300 flex items-center gap-1">
                                                    <Globe size={10} className="text-slate-500" />
                                                    {plant?.name || sysId.slice(0, 8)}
                                                </span>
                                                <span className="font-mono" style={{ color: intensity > 70 ? '#ef4444' : intensity > 40 ? '#f59e0b' : '#22c55e' }}>
                                                    {intensity.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full transition-all duration-700" 
                                                    style={{ 
                                                        width: `${intensity}%`, 
                                                        backgroundColor: intensity > 70 ? '#ef4444' : intensity > 40 ? '#f59e0b' : '#22c55e',
                                                        boxShadow: intensity > 80 ? '0 0 8px rgba(239, 68, 68, 0.4)' : 'none'
                                                    }} 
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {hotspots.size > 5 && (
                                    <div className="text-center text-[9px] text-slate-600 mt-2 italic">
                                        + {hotspots.size - 5} other systems infected
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* Player Tools */}
                <section>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                        <Activity size={12} className="text-cyan-500" /> MANIPULATION TOOLS
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => selectedSystemId && handleJam(selectedSystemId)}
                            disabled={!selectedSystemId}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all ${
                                selectedSystemId && pressState.jammedSystems?.has?.(selectedSystemId)
                                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                            } disabled:opacity-30`}
                        >
                            <ZapOff size={20} className="mb-2" />
                            <span className="text-[10px] font-display">SIGNAL JAM</span>
                        </button>
                        <button 
                            onClick={() => selectedSystemId && handleQuarantine(selectedSystemId)}
                            disabled={!selectedSystemId}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all ${
                                selectedSystemId && pressState.quarantinedPlanets?.has?.(`planet_${selectedSystemId}`)
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                            } disabled:opacity-30`}
                        >
                            <ShieldAlert size={20} className="mb-2" />
                            <span className="text-[10px] font-display">QUARANTINE</span>
                        </button>
                        <button 
                            onClick={() => selectedSystemId && handleCounterNarrative(selectedSystemId)}
                            disabled={!selectedSystemId}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all col-span-2 ${
                                selectedSystemId && pressState.counterNarratives.has(selectedSystemId)
                                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600'
                            } disabled:opacity-30`}
                        >
                            <Shield size={20} className="mb-2" />
                            <span className="text-[10px] font-display">
                                {selectedSystemId && pressState.counterNarratives.has(selectedSystemId) 
                                    ? `RESISTANCE: ${Math.round(pressState.counterNarratives.get(selectedSystemId) || 0)}%` 
                                    : 'DEPLOY COUNTER-NARRATIVE'}
                            </span>
                        </button>
                    </div>
                    <div className="mt-3 p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
                        <div className="text-[9px] text-slate-500 mb-2 uppercase tracking-widest">Selected System Action</div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => selectedStoryId && handleSeed(selectedStoryId)}
                                disabled={!selectedSystemId || !selectedStoryId}
                                className="flex-1 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 rounded text-[10px] font-display text-cyan-400 disabled:opacity-20"
                            >
                                SEED CURRENT STORY
                            </button>
                        </div>
                    </div>
                </section>

                {/* Active Crises */}
                {(() => {
                    const myCrises = Array.from(pressState.crises.values())
                        .filter(c => !c.resolved && c.targetEmpireId === playerFactionId);
                    if (myCrises.length === 0) return null;
                    return (
                        <section className="bg-red-950/20 border border-red-500/20 rounded-xl p-4 space-y-4">
                            <div className="text-[10px] font-display tracking-widest text-red-400 flex items-center gap-2">
                                <ShieldAlert size={12} /> ACTIVE MEDIA CRISES
                            </div>
                            {myCrises.map(crisis => {
                                const story = pressState.activeStories?.get?.(crisis.storyId);
                                return (
                                    <div key={crisis.id} className="space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div className="text-xs text-slate-200 font-bold uppercase tracking-tight">
                                                {story?.subject ?? crisis.storyId}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[9px] font-mono text-red-500 animate-pulse">
                                                    SEVERITY: {crisis.severity.toFixed(0)}
                                                </div>
                                                {story && (
                                                    <div className="text-[9px] font-mono text-slate-500">
                                                        EVIDENCE: {story.evidenceStrength ?? '??'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: CrisisChoice.SUPPRESS, label: "SUPPRESS", color: "bg-red-600/20 text-red-400" },
                                                { id: CrisisChoice.ADMIT_REFORM, label: "REFORM", color: "bg-green-600/20 text-green-400" },
                                                { id: CrisisChoice.BLAME_FOREIGN, label: "DEFLECT", color: "bg-amber-600/20 text-amber-400" },
                                                { id: CrisisChoice.DENY, label: "DENY", color: "bg-purple-600/20 text-purple-400" },
                                                { id: CrisisChoice.DISTRACT, label: "DISTRACT", color: "bg-cyan-600/20 text-cyan-400" },
                                                { id: CrisisChoice.IGNORE, label: "IGNORE", color: "bg-slate-700/20 text-slate-400" }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => handleResolveCrisis(crisis.id, opt.id as any)}
                                                    className={`py-2 rounded text-[9px] font-display border border-white/5 hover:border-white/20 transition-all ${opt.color}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    );
                })()}

                {/* Active Investigations */}
                {(() => {
                    const myInvestigations = Array.from(pressState.investigations?.values?.() ?? [])
                        .filter(i => !i.resolved && i.targetEmpireId === playerFactionId);
                    if (myInvestigations.length === 0) return null;
                    return (
                        <section className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4 space-y-4">
                            <div className="text-[10px] font-display tracking-widest text-amber-400 flex items-center gap-2">
                                <Activity size={12} /> ACTIVE INVESTIGATIONS
                            </div>
                            {myInvestigations.map(inv => {
                                const stageIdx = STAGE_SEQUENCE.indexOf(inv.stage);
                                return (
                                    <div key={inv.id} className="space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-xs text-slate-200 font-bold uppercase tracking-tight">
                                                    {inv.subject}
                                                </div>
                                                <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                                                    {inv.investigatorId === 'free_signal' ? 'UNDERGROUND PRESS' : 'INDEPENDENT PRESS'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[9px] font-mono text-amber-400">{inv.stage}</div>
                                                <div className="text-[9px] font-mono text-slate-500">EVIDENCE: {Math.round(inv.evidence)}</div>
                                            </div>
                                        </div>
                                        {/* Stage track */}
                                        <div className="flex gap-1">
                                            {STAGE_SEQUENCE.map((s, i) => (
                                                <div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-slate-800">
                                                    <div
                                                        className={i < stageIdx ? 'h-full w-full bg-amber-500' : i === stageIdx ? 'h-full bg-amber-500/70' : 'h-full w-0'}
                                                        style={i === stageIdx ? { width: `${Math.min(100, inv.progress)}%` } : undefined}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'PRESS_INV_COOPERATE', label: 'COOPERATE', color: 'bg-green-600/20 text-green-400' },
                                                { id: 'PRESS_INV_OBSTRUCT', label: 'OBSTRUCT', color: 'bg-red-600/20 text-red-400' },
                                                { id: 'PRESS_INV_SACRIFICE_OFFICIAL', label: 'SACRIFICE OFFICIAL', color: 'bg-amber-600/20 text-amber-400' },
                                                { id: 'PRESS_INV_PUBLISH_FIRST', label: 'PUBLISH FIRST', color: 'bg-cyan-600/20 text-cyan-400' },
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => handleInvestigationResponse(inv.id, opt.id)}
                                                    className={`py-2 rounded text-[9px] font-display border border-white/5 hover:border-white/20 transition-all ${opt.color}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    );
                })()}

                {/* Information Warfare — foreign campaigns */}
                {(() => {
                    const allCampaigns = Array.from(pressState.campaigns?.values?.() ?? []);
                    const mine = allCampaigns.filter(c => c.attackerId === playerFactionId && c.active);
                    // Covert until signaled: the target only learns of a campaign once exposure crosses the threshold.
                    const againstMe = allCampaigns.filter(c => c.targetEmpireId === playerFactionId && c.active && c.signaled);
                    const rivals = Object.values(factions ?? {}).filter((f: any) => f.id && f.id !== playerFactionId);
                    return (
                        <section>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                                <Radio size={12} className="text-purple-500" /> INFORMATION WARFARE
                            </div>
                            <div className="space-y-3">
                                {againstMe.map(c => (
                                    <div key={c.id} className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg space-y-2">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-red-400 font-display">
                                                FOREIGN CAMPAIGN DETECTED
                                                {c.discoveredBy ? ` — ORIGIN: ${c.attackerId.replace('faction-', '').toUpperCase()}` : ''}
                                            </span>
                                            <span className="font-mono text-slate-500">STR {Math.round(c.strength)} · EXP {Math.round(c.exposure)}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleCampaignOrder('PRESS_COUNTER_CAMPAIGN', { campaignId: c.id }, 'Counter campaign')}
                                                className="flex-1 py-1.5 rounded text-[9px] font-display bg-cyan-600/20 text-cyan-400 border border-white/5 hover:border-white/20">
                                                COUNTER
                                            </button>
                                            {!c.discoveredBy && (
                                                <button onClick={() => handleCampaignOrder('PRESS_TRACE_CAMPAIGN', { campaignId: c.id }, 'Trace campaign')}
                                                    className="flex-1 py-1.5 rounded text-[9px] font-display bg-amber-600/20 text-amber-400 border border-white/5 hover:border-white/20">
                                                    TRACE
                                                </button>
                                            )}
                                            {c.discoveredBy && (
                                                <button onClick={() => handleCampaignOrder('PRESS_ACCUSE_CAMPAIGN', { campaignId: c.id, suspectFactionId: c.attackerId }, 'Public accusation')}
                                                    className="flex-1 py-1.5 rounded text-[9px] font-display bg-red-600/20 text-red-400 border border-white/5 hover:border-white/20">
                                                    ACCUSE PUBLICLY
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {mine.map(c => (
                                    <div key={c.id} className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-lg space-y-2">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-purple-400 font-display">
                                                {c.objective.replace(/_/g, ' ')} → {c.targetEmpireId.replace('faction-', '').toUpperCase()}
                                            </span>
                                            <span className="font-mono text-slate-500">STR {Math.round(c.strength)} · EXP {Math.round(c.exposure)}</span>
                                        </div>
                                        <button onClick={() => handleCampaignOrder('PRESS_CANCEL_CAMPAIGN', { campaignId: c.id }, 'Wind down campaign')}
                                            className="w-full py-1.5 rounded text-[9px] font-display bg-slate-700/20 text-slate-400 border border-white/5 hover:border-white/20">
                                            WIND DOWN
                                        </button>
                                    </div>
                                ))}
                                <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg space-y-2">
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Launch Campaign (15 influence)</div>
                                    <select value={campaignTarget} onChange={e => setCampaignTarget(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-300">
                                        <option value="">Select target empire…</option>
                                        {rivals.map((f: any) => (
                                            <option key={f.id} value={f.id}>{f.name ?? f.id}</option>
                                        ))}
                                    </select>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: CampaignObjective.UNDERMINE_TRUST, label: 'TRUST' },
                                            { id: CampaignObjective.DAMAGE_CREDIBILITY, label: 'CREDIBILITY' },
                                            { id: CampaignObjective.STOKE_UNREST, label: 'UNREST' },
                                        ].map(o => (
                                            <button key={o.id} onClick={() => setCampaignObjective(o.id)}
                                                className={`py-1.5 rounded text-[9px] font-display border ${campaignObjective === o.id
                                                    ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                                                    : 'bg-slate-900/60 text-slate-500 border-slate-800'}`}>
                                                {o.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button disabled={!campaignTarget}
                                        onClick={() => handleCampaignOrder('PRESS_LAUNCH_CAMPAIGN', { targetFactionId: campaignTarget, objective: campaignObjective }, 'Launch info campaign')}
                                        className="w-full py-1.5 rounded text-[10px] font-display bg-purple-600/20 text-purple-400 border border-purple-500/40 hover:bg-purple-600/40 disabled:opacity-30">
                                        LAUNCH COVERT CAMPAIGN
                                    </button>
                                </div>
                            </div>
                        </section>
                    );
                })()}

                {/* Foreign Crises — react + predict */}
                {(() => {
                    const foreign = Array.from(pressState.crises?.values?.() ?? [])
                        .filter(c => !c.resolved && c.targetEmpireId !== playerFactionId);
                    if (foreign.length === 0 || !playerFactionId) return null;
                    return (
                        <section className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 space-y-4">
                            <div className="text-[10px] font-display tracking-widest text-indigo-400 flex items-center gap-2">
                                <Globe size={12} /> FOREIGN CRISES
                            </div>
                            {foreign.map(crisis => {
                                const myReaction = crisis.reactions?.[playerFactionId];
                                const myPrediction = crisis.predictions?.[playerFactionId];
                                return (
                                    <div key={crisis.id} className="space-y-2">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-200 font-bold uppercase">
                                                {crisis.targetEmpireId.replace('faction-', '').toUpperCase()} UNDER PRESSURE
                                            </span>
                                            <span className="font-mono text-indigo-400">SEVERITY {crisis.severity.toFixed(0)}</span>
                                        </div>
                                        {myReaction ? (
                                            <div className="text-[9px] font-mono text-slate-500">STANCE: {myReaction}</div>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-2">
                                                {(['AMPLIFY', 'DEFEND', 'NEUTRAL'] as const).map(r => (
                                                    <button key={r}
                                                        onClick={() => handleCampaignOrder('PRESS_CRISIS_REACT', { crisisId: crisis.id, reaction: r }, `Crisis stance: ${r}`)}
                                                        className={`py-1.5 rounded text-[9px] font-display border border-white/5 hover:border-white/20 ${
                                                            r === 'AMPLIFY' ? 'bg-red-600/20 text-red-400'
                                                            : r === 'DEFEND' ? 'bg-green-600/20 text-green-400'
                                                            : 'bg-slate-700/20 text-slate-400'}`}>
                                                        {r}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {myPrediction ? (
                                            <div className="text-[9px] font-mono text-slate-500">PREDICTION LOCKED: {myPrediction}</div>
                                        ) : (
                                            <div className="space-y-1">
                                                <div className="text-[9px] text-slate-500 uppercase tracking-widest">Predict their response</div>
                                                <div className="grid grid-cols-3 gap-1">
                                                    {[CrisisChoice.SUPPRESS, CrisisChoice.ADMIT_REFORM, CrisisChoice.BLAME_FOREIGN,
                                                      CrisisChoice.DENY, CrisisChoice.DISTRACT, CrisisChoice.IGNORE].map(ch => (
                                                        <button key={ch}
                                                            onClick={() => handleCampaignOrder('PRESS_CRISIS_PREDICT', { crisisId: crisis.id, choice: ch }, `Predict: ${ch}`)}
                                                            className="py-1 rounded text-[8px] font-display bg-indigo-600/10 text-indigo-300 border border-white/5 hover:border-white/20">
                                                            {ch.replace(/_/g, ' ')}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </section>
                    );
                })()}

                {/* Viral Log */}
                <section>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                        <Newspaper size={12} className="text-slate-500" /> INFORMATION STREAM
                    </div>
                    <div className="space-y-2">
                        {pressState.publishedStories.slice().reverse().map(pub => {
                            const tc = TONE_CONFIG['neutral']; // Mock tone for now
                            return (
                                <div 
                                    key={pub.id}
                                    onClick={() => setSelectedStoryId(pub.id)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                        selectedStoryId === pub.id 
                                            ? 'bg-slate-800/80 border-slate-500 shadow-lg' 
                                            : 'bg-slate-900/40 border-slate-800/60 grayscale-[0.5] opacity-80'
                                    }`}
                                >
                                    <div className="flex justify-between items-start gap-2 mb-1.5">
                                        <div className="text-[11px] text-slate-200 leading-tight font-medium">
                                            {pressState.activeStories?.get?.(pub.storyId)?.subject ?? pub.storyId}
                                        </div>
                                        <div className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono">
                                            T{pub.tickPublished}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-[9px] font-mono text-slate-500">
                                            Epicenter: {pub.originPlanetId?.startsWith('planet_') ? pub.originPlanetId.replace('planet_', '').slice(0, 8) : pub.originPlanetId?.slice(0, 8) || 'Global'}
                                        </div>
                                        <div className="text-[9px] font-mono text-cyan-400/80">
                                            Viral: {(pub.viralFactor * 100).toFixed(0)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}
