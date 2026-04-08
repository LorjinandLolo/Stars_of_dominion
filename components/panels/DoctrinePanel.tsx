"use client";

import React, { useState, useMemo } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Shield, TrendingUp, Eye, CheckCircle, Lock, BookOpen, Zap, Activity, ChevronRight } from 'lucide-react';
import type { DoctrineDomain, DoctrineDefinition } from '@/lib/doctrine/types';
import { setDoctrineAction } from '@/app/actions/doctrine';

// Load definitions via require so JSON-extended fields survive TypeScript
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ALL_DOCTRINES: DoctrineDefinition[] = require('@/lib/doctrine/data/doctrine-definitions.json');

const COOLDOWN_SECONDS = 3600 * 24;

// ── Domain config ─────────────────────────────────────────────────────────────

const DOMAIN_CONFIG = {
    military: {
        label: 'Military',
        Icon: Shield,
        color: 'text-red-400',
        activeBg: 'bg-red-500/10',
        activeBorder: 'border-red-500/40',
        tabActive: 'text-red-400 border-red-500',
        gradient: 'from-red-500/10',
    },
    economic: {
        label: 'Economic',
        Icon: TrendingUp,
        color: 'text-emerald-400',
        activeBg: 'bg-emerald-500/10',
        activeBorder: 'border-emerald-500/40',
        tabActive: 'text-emerald-400 border-emerald-500',
        gradient: 'from-emerald-500/10',
    },
    intelligence: {
        label: 'Intelligence',
        Icon: Eye,
        color: 'text-purple-400',
        activeBg: 'bg-purple-500/10',
        activeBorder: 'border-purple-500/40',
        tabActive: 'text-purple-400 border-purple-500',
        gradient: 'from-purple-500/10',
    },
} as const;

// ── Modifier labels ───────────────────────────────────────────────────────────

const MODIFIER_LABELS: Record<string, string> = {
    fleetSpeed:               'Fleet Speed',
    offensiveDamage:          'Offensive Damage',
    survivalPower:            'Survival Power',
    defensiveStrength:        'Defensive Strength',
    unrestRate:               'Unrest Rate',
    popGrowth:                'Population Growth',
    infraCost:                'Infrastructure Cost',
    taxationRate:             'Taxation Rate',
    productionCoordination:   'Production Coordination',
    intelPointsGen:           'Intel Generation',
    sabotageSuccess:          'Sabotage Success',
    counterIntelStrength:     'Counter-Intel Strength',
    internalSecurity:         'Internal Security',
};

const BIAS_LABELS: Record<string, string> = {
    crisisResponseBias: 'Crisis Response Lean',
    diplomaticBias:     'Diplomatic Tendency',
    combatStanceBias:   'Combat Stance Lean',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function DoctrinePanel() {
    const { empireIdentity, updateEmpireIdentity, nowSeconds, playerState } = useUIStore();
    const [activeDomain, setActiveDomain]       = useState<DoctrineDomain>('military');
    const [selectedId, setSelectedId]           = useState<string | null>(null);
    const [isAdopting, setIsAdopting]           = useState(false);
    const [adoptError, setAdoptError]           = useState<string | null>(null);

    const domainDoctrines = useMemo(
        () => ALL_DOCTRINES.filter(d => d.domain === activeDomain),
        [activeDomain]
    );

    const activeDoctrineId   = empireIdentity.doctrines.activeDoctrines[activeDomain];
    const lastChange         = empireIdentity.doctrines.lastChangeTimestamps[activeDomain] ?? 0;
    const cooldownRemaining  = Math.max(0, COOLDOWN_SECONDS - (nowSeconds - lastChange));
    const onCooldown         = cooldownRemaining > 0 && lastChange > 0;

    // Default: show active doctrine details or first in list
    const viewId       = selectedId ?? activeDoctrineId ?? domainDoctrines[0]?.id;
    const viewDoctrine = ALL_DOCTRINES.find(d => d.id === viewId);
    const cfg          = DOMAIN_CONFIG[activeDomain];

    const handleAdopt = async () => {
        if (!viewId || onCooldown || viewId === activeDoctrineId) return;
        setIsAdopting(true);
        setAdoptError(null);
        const res = await setDoctrineAction(playerState.factionId, activeDomain, viewId);
        if (res.success) {
            updateEmpireIdentity({
                doctrines: {
                    ...empireIdentity.doctrines,
                    activeDoctrines:        { ...empireIdentity.doctrines.activeDoctrines,        [activeDomain]: viewId },
                    lastChangeTimestamps:   { ...empireIdentity.doctrines.lastChangeTimestamps,   [activeDomain]: nowSeconds },
                },
            });
        } else {
            setAdoptError(res.error ?? 'Failed to adopt doctrine.');
        }
        setIsAdopting(false);
    };

    return (
        <div className="flex flex-col h-full bg-slate-950/80 backdrop-blur-xl text-slate-200 overflow-hidden">

            {/* ── Header ── */}
            <div className={`p-6 border-b border-white/5 bg-gradient-to-r ${cfg.gradient} via-transparent to-transparent`}>
                <div className="flex items-center gap-4">
                    <div className={`p-3 ${cfg.activeBg} rounded-xl border ${cfg.activeBorder}`}>
                        <BookOpen className={`w-6 h-6 ${cfg.color}`} />
                    </div>
                    <div>
                        <h1 className="text-xl font-display tracking-[0.2em] uppercase text-white">Empire Doctrine</h1>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.3em] mt-1">
                            Strategic Posture Configuration
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Domain Tabs ── */}
            <div className="flex border-b border-white/5 bg-black/30">
                {(Object.entries(DOMAIN_CONFIG) as [DoctrineDomain, typeof cfg][]).map(([domain, dc]) => {
                    const { Icon } = dc;
                    const isActive   = activeDomain === domain;
                    const hasActive  = !!empireIdentity.doctrines.activeDoctrines[domain];
                    return (
                        <button
                            key={domain}
                            onClick={() => { setActiveDomain(domain); setSelectedId(null); setAdoptError(null); }}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-4 transition-all border-b-2 text-[9px] uppercase tracking-[0.2em] font-display ${
                                isActive ? `${dc.tabActive} bg-white/5` : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                        >
                            <Icon size={15} />
                            {dc.label}
                            {hasActive && (
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Two-pane layout ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Left: Doctrine list */}
                <div className="w-52 border-r border-white/5 bg-black/20 overflow-y-auto p-3 space-y-2 flex-shrink-0">
                    {domainDoctrines.map(doc => {
                        const isActive   = doc.id === activeDoctrineId;
                        const isSelected = doc.id === viewId;
                        return (
                            <button
                                key={doc.id}
                                onClick={() => setSelectedId(doc.id)}
                                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                                    isActive
                                        ? `${cfg.activeBg} ${cfg.activeBorder} border text-white`
                                        : isSelected
                                        ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-display uppercase tracking-wider leading-tight">
                                        {doc.name}
                                    </span>
                                    {isActive && <CheckCircle size={11} className="text-emerald-400 shrink-0" />}
                                </div>
                                <div className="text-[9px] text-slate-600 uppercase tracking-widest">
                                    {Object.keys(doc.modifiers).length} modifiers
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right: Detail pane */}
                <div className="flex-1 overflow-y-auto p-8 space-y-7 custom-scrollbar">
                    {viewDoctrine ? (
                        <>
                            {/* Doctrine name & status */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-2xl font-display uppercase tracking-[0.15em] text-white">
                                        {viewDoctrine.name}
                                    </h2>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                                        {viewDoctrine.domain} doctrine
                                    </p>
                                </div>
                                {viewDoctrine.id === activeDoctrineId && (
                                    <span className="px-3 py-1 rounded-full text-[9px] font-display uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0 mt-1">
                                        Active
                                    </span>
                                )}
                            </div>

                            <p className="text-sm text-slate-400 leading-relaxed -mt-3">
                                {viewDoctrine.description}
                            </p>

                            {/* Modifiers */}
                            <div>
                                <h3 className="text-[10px] font-display text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                    <Zap size={11} /> Doctrine Modifiers
                                </h3>
                                <div className="space-y-2">
                                    {Object.entries(viewDoctrine.modifiers).map(([key, val]) => (
                                        <div
                                            key={key}
                                            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5"
                                        >
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                                                {MODIFIER_LABELS[key] ?? key}
                                            </span>
                                            <span className={`text-sm font-mono font-bold ${val > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {val > 0 ? '+' : ''}{Math.round(val * 100)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Behavior Bias */}
                            {(viewDoctrine as any).behaviorBias && (
                                <div>
                                    <h3 className="text-[10px] font-display text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mb-3">
                                        <Activity size={11} /> Strategic Tendency
                                    </h3>
                                    <div className="p-5 bg-violet-500/5 rounded-xl border border-violet-500/15 space-y-3">
                                        <p className="text-[9px] text-slate-500 italic leading-relaxed">
                                            Operating under this doctrine shapes behavioral patterns visible to opposing intelligence networks. These are tendencies — not certainties.
                                        </p>
                                        {Object.entries((viewDoctrine as any).behaviorBias)
                                            .filter(([k]) => k in BIAS_LABELS)
                                            .map(([k, v]) => (
                                                <div key={k} className="flex items-center justify-between">
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">
                                                        {BIAS_LABELS[k]}
                                                    </span>
                                                    <span className="text-[10px] text-violet-300 uppercase font-mono font-bold">
                                                        {String(v).replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                            ))}
                                        <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Bias Strength</span>
                                            <span className="text-[10px] text-amber-400 uppercase font-mono font-bold">
                                                {(viewDoctrine as any).behaviorBias.biasStrength}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {adoptError && (
                                <p className="text-xs text-rose-400 px-1">{adoptError}</p>
                            )}

                            {/* Adopt / Cooldown / Active */}
                            <div className="pt-2 border-t border-white/5">
                                {onCooldown && viewDoctrine.id !== activeDoctrineId ? (
                                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center gap-3">
                                        <Lock size={15} className="text-amber-400 shrink-0" />
                                        <div>
                                            <span className="text-[10px] text-amber-400 font-display uppercase tracking-widest block">
                                                Transition in Progress
                                            </span>
                                            <span className="text-[9px] text-slate-500">
                                                Available in ~{Math.ceil(cooldownRemaining / 3600)}h
                                            </span>
                                        </div>
                                    </div>
                                ) : viewDoctrine.id === activeDoctrineId ? (
                                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
                                        <span className="text-[10px] text-emerald-400 font-display uppercase tracking-widest">
                                            Current Active Doctrine
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleAdopt}
                                        disabled={isAdopting}
                                        className={`w-full py-3 rounded-xl font-display text-xs tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-2 border ${cfg.activeBg} ${cfg.activeBorder} ${cfg.color} hover:brightness-125 disabled:opacity-50`}
                                    >
                                        <ChevronRight size={14} />
                                        {isAdopting ? 'Restructuring...' : `Adopt ${viewDoctrine.name}`}
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                            <BookOpen size={32} className="mb-3 opacity-30" />
                            <span className="text-[10px] uppercase tracking-widest">Select a doctrine to view</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
