"use client";

/**
 * The one espionage page. It used to share the job with a second "Agency"
 * panel; both had a roster, a recruit flow and a launcher, and they disagreed
 * (one charged "INTEL" for recruits the worker billed in credits, one sent an
 * agent the server never received). Everything lives here now:
 *
 *   Board       time-limited opportunities and threats
 *   Networks    infiltration per empire and the system networks agents build
 *   Operations  launch and follow covert operations
 *   Reports     what successful intelligence work delivered
 *   Agents      roster, deployment and recruitment
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import {
    AlertTriangle, Briefcase, CheckCircle, Eye, FileText, Globe, Loader2, Lock, MapPin, Radio,
    Shield, ShieldCheck, Target, Unlock, UserPlus, Users, XCircle,
} from 'lucide-react';
import { AgentCard, TraitChip, visibleTraits } from '@/components/panels/espionage/AgentCard';
import { CatalogLauncher } from '@/components/panels/espionage/CatalogLauncher';
import { CounterIntelTab } from '@/components/panels/espionage/CounterIntelTab';
import { CaseBoardTab } from '@/components/panels/espionage/CaseBoardTab';
import { InternalSecurity } from '@/components/panels/espionage/InternalSecurity';
import {
    recruitAgentAction,
    recallAgentAction,
    assignAgentAction,
    launchCatalogOpAction,
    getRecruitPoolAction,
    seizeOpportunityAction,
    setCounterIntelAction,
    fileAccusationAction,
    leakCaseAction,
    pursueLeadAction,
    crackdownAction,
} from '@/app/actions/espionage';
import type { OperationDomain } from '@/lib/espionage/espionage-types';
import { OPERATION_CATALOG_BY_ID, type OperationDefinition } from '@/lib/espionage/operation-catalog';
import type { IntelNetwork } from '@/types/ui-state';
import { stageForInfiltration, stageInfo, nextStage } from '@/lib/espionage/network-stages';
import { formatGalacticDeadline, formatRealAgo, realSecondsUntil } from '@/lib/time/galactic-time';
import { checkOrderTechGate } from '@/lib/tech/order-gates';
import { speciesLabel } from '@/lib/espionage/dossier';
import { AFTER_ACTION_DOMAIN, INCOMING_DOMAIN } from '@/lib/espionage/op-aftermath';

type TabType = 'board' | 'cases' | 'networks' | 'operations' | 'reports' | 'agents' | 'defence';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'board', label: 'Board', icon: <Radio size={12} /> },
    { id: 'cases', label: 'Case files', icon: <Briefcase size={12} /> },
    { id: 'networks', label: 'Networks', icon: <Globe size={12} /> },
    { id: 'operations', label: 'Operations', icon: <Target size={12} /> },
    { id: 'reports', label: 'Reports', icon: <FileText size={12} /> },
    { id: 'agents', label: 'Agents', icon: <Users size={12} /> },
    { id: 'defence', label: 'Counter-intel', icon: <ShieldCheck size={12} /> },
];

/** Names for operations launched before the catalog (old snapshots). */
const DOMAIN_LABEL: Record<OperationDomain, string> = {
    infrastructureSabotage: 'Sabotage',
    politicalSubversion: 'Political subversion',
    shadowEconomy: 'Shadow economy',
};

/** How each kind of entry reads in the Reports tab. */
const REPORT_KIND: Record<string, string> = {
    [AFTER_ACTION_DOMAIN]: 'After action',
    [INCOMING_DOMAIN]: 'Against us',
    // case-board's MOLE_REPORT_DOMAIN, written out: the page must never import case-board.
    mole: 'From our mole',
    military: 'Military',
    political: 'Political',
    scientific: 'Scientific',
    counterintel: 'Counter-intelligence',
};

function operationName(op: { definitionId?: string; domain: OperationDomain }): string {
    return (op.definitionId && OPERATION_CATALOG_BY_ID.get(op.definitionId)?.name) || DOMAIN_LABEL[op.domain] || 'Operation';
}

const PENETRATION: Record<IntelNetwork['penetrationLevel'], { label: string; color: string; icon: React.ReactNode; meaning: string }> = {
    none: { label: 'No signal', color: '#64748b', icon: <Lock size={9} />, meaning: 'No visibility. Enemy fleets hidden.' },
    rumor: { label: 'Rumor', color: '#f59e0b', icon: <Radio size={9} />, meaning: 'Fleet presence detected, not identified.' },
    confirmed: { label: 'Confirmed', color: '#60a5fa', icon: <Eye size={9} />, meaning: 'Fleet count and owner revealed.' },
    deep: { label: 'Deep', color: '#a855f7', icon: <Unlock size={9} />, meaning: 'Full composition, supply and orders visible.' },
};

function PenetrationBadge({ level }: { level: IntelNetwork['penetrationLevel'] }) {
    const p = PENETRATION[level] ?? PENETRATION.none;
    return (
        <span className="flex items-center gap-1 text-[9px] font-display tracking-widest px-1.5 py-0.5 rounded border uppercase shrink-0"
            style={{ color: p.color, borderColor: `${p.color}50`, backgroundColor: `${p.color}15` }}>
            {p.icon}{p.label}
        </span>
    );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
    return (
        <div className="py-12 border border-dashed border-slate-800/50 rounded-lg flex flex-col items-center justify-center text-slate-600 text-center px-4">
            <div className="mb-2 opacity-30">{icon}</div>
            <p className="text-[10px] uppercase tracking-widest font-display">{title}</p>
            {hint && <p className="text-[10px] mt-1 text-slate-500">{hint}</p>}
        </div>
    );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="text-[10px] font-display tracking-widest text-slate-500 mb-3 uppercase flex items-center gap-2">
            {icon}{children}
        </div>
    );
}

/** Board deadlines are sim-clock; show them in the player's calendar words. */
function expiryCountdown(nowSeconds: number, expiresAt: number): string {
    if (expiresAt <= nowSeconds) return 'Expired';
    return `Until ${formatGalacticDeadline(expiresAt, nowSeconds)}`;
}

/** Report age from sim-clock seconds, in the player's days ("today", "yesterday"). */
function reportAge(nowSeconds: number, createdAt: number): string {
    const realSecondsAgo = Math.max(0, -realSecondsUntil(createdAt, nowSeconds));
    if (realSecondsAgo < 3600) return 'Fresh';
    return formatRealAgo(new Date(Date.now() - realSecondsAgo * 1000));
}

/** Operations carry ISO timestamps on the sim clock. */
function isoToSim(iso: string): number {
    return new Date(iso).getTime() / 1000;
}

function outcomeLine(op: { succeeded?: boolean; attributionState: string }): { text: string; color: string } {
    const caught = op.attributionState === 'exposed' ? 'exposed' : op.attributionState === 'suspected' ? 'suspected' : 'undetected';
    if (op.succeeded) {
        return { text: `Succeeded · ${caught}`, color: caught === 'undetected' ? '#10b981' : '#f59e0b' };
    }
    return { text: `Failed · ${caught}`, color: '#ef4444' };
}

export default function IntelligencePanel() {
    const { systems, espionageState, updateEspionage, playerFactionId, factions, nowSeconds, techState, diplomacyState, planets } = useUIStore();
    const [activeTab, setActiveTab] = useState<TabType>('board');
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [busy, setBusy] = useState(false);

    // Agents tab
    const [deployingAgentId, setDeployingAgentId] = useState<string | null>(null);
    const [deployTargetId, setDeployTargetId] = useState('');
    const [recruitOpen, setRecruitOpen] = useState(false);
    const [loadingRecruits, setLoadingRecruits] = useState(false);

    const systemName = (id: string | null | undefined) =>
        (id && systems.find(s => s.id === id)?.name) || 'Unknown system';
    const factionName = (id: string | null | undefined) =>
        (id && factions[id]?.name) || 'Unknown empire';
    const ownerOf = (systemId: string) => {
        const s: any = systems.find(x => x.id === systemId);
        return (s?.ownerFactionId ?? s?.ownerId ?? null) as string | null;
    };

    /** Systems held by someone else, grouped by owner, for both target pickers. */
    const rivalSystems = useMemo(() => {
        const groups = new Map<string, { id: string; name: string }[]>();
        for (const s of systems as any[]) {
            const owner = s.ownerFactionId ?? s.ownerId;
            if (!owner || owner === playerFactionId) continue;
            if (!groups.has(owner)) groups.set(owner, []);
            groups.get(owner)!.push({ id: s.id, name: s.name });
        }
        return [...groups.entries()]
            .map(([owner, list]) => ({ owner, name: factions[owner]?.name ?? 'Unknown empire', systems: list.sort((a, b) => a.name.localeCompare(b.name)) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [systems, factions, playerFactionId]);

    function showToast(msg: string, ok: boolean) {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 4000);
    }

    // Load a recruit pool the first time recruitment is opened.
    useEffect(() => {
        if (!recruitOpen || !playerFactionId) return;
        if (espionageState.candidates.length > 0) return;
        setLoadingRecruits(true);
        // Our species, and the others a recruiter might find: every empire's
        // civilization is public. The worker prices the hire from these.
        const ownSpecies = (factions[playerFactionId] as any)?.civilizationId ?? null;
        const others = [...new Set(Object.values(factions).map((f: any) => f?.civilizationId).filter((s: any) => s && s !== ownSpecies))] as string[];
        getRecruitPoolAction(playerFactionId, ownSpecies, others)
            .then(candidates => updateEspionage({ candidates }))
            .catch(() => showToast('Could not reach the recruiters. Try again shortly.', false))
            .finally(() => setLoadingRecruits(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recruitOpen, playerFactionId]);

    const confirmDeployment = async () => {
        if (!deployingAgentId || !deployTargetId || !playerFactionId) return;
        setBusy(true);
        const agent = espionageState.agents.find(a => a.id === deployingAgentId);
        const result = await assignAgentAction(playerFactionId, deployingAgentId, deployTargetId);
        setBusy(false);
        if (!result.success) {
            showToast(result.error || 'Deployment refused.', false);
            return;
        }
        updateEspionage({
            agents: espionageState.agents.map(a =>
                a.id === deployingAgentId
                    ? { ...a, status: 'deployed', deployedToSystemId: deployTargetId }
                    : a
            ),
        });
        showToast(`${agent?.codename ?? 'Agent'} is on the way to ${systemName(deployTargetId)}.`, true);
        setDeployingAgentId(null);
        setDeployTargetId('');
    };

    const handleRecall = async (agentId: string) => {
        if (!playerFactionId) return;
        const result = await recallAgentAction(playerFactionId, agentId);
        if (!result.success) {
            showToast(result.error || 'Recall refused.', false);
            return;
        }
        updateEspionage({
            agents: espionageState.agents.map(a =>
                a.id === agentId ? { ...a, status: 'on_cooldown', deployedToSystemId: null } : a
            ),
        });
        showToast('Agent recalled. Their network will start to fade.', true);
    };

    const handleSeize = async (opportunityId: string) => {
        if (!playerFactionId) return;
        const result = await seizeOpportunityAction(playerFactionId, opportunityId);
        if (!result.success) {
            showToast(result.error || 'Could not act on that.', false);
            return;
        }
        // Optimistic: authoritative state arrives via shard sync.
        updateEspionage({
            board: espionageState.board.map(o =>
                o.id === opportunityId ? { ...o, status: 'seized' as const } : o
            ),
        });
    };

    const handleRecruit = async (candidateId: string) => {
        const candidate = espionageState.candidates.find(c => c.id === candidateId);
        if (!candidate || !playerFactionId) return;
        setBusy(true);
        const result = await recruitAgentAction(candidate, playerFactionId);
        setBusy(false);
        if (!result.success) {
            showToast(result.error || 'Recruitment refused.', false);
            return;
        }
        // The new agent arrives with the next sync; drop the candidate so it
        // cannot be hired twice.
        updateEspionage({ candidates: espionageState.candidates.filter(c => c.id !== candidateId) });
        showToast(`${candidate.codename} accepted. They report for duty shortly.`, true);
    };

    const handleLaunch = async (targetFactionId: string, systemId: string, def: OperationDefinition, agentId: string | null, falseFlagFactionId: string | null = null) => {
        if (!playerFactionId || !targetFactionId || targetFactionId === playerFactionId) return;
        setBusy(true);
        const result = await launchCatalogOpAction(playerFactionId, targetFactionId, systemId, def.id, agentId, falseFlagFactionId);
        setBusy(false);
        if (!result.success) {
            showToast(result.error || 'Operation refused.', false);
            return;
        }
        // Queued, not launched: the worker re-checks stage, slots, Intel and
        // credits, and a refusal arrives as a notification.
        if (agentId) {
            // Optimistic, so the same agent cannot be picked twice before the
            // next sync; the worker is the authority.
            updateEspionage({
                agents: espionageState.agents.map(a => a.id === agentId ? { ...a, status: 'on_operation' } : a),
            });
        }
        showToast(`${def.name} ordered against ${factionName(targetFactionId)} at ${systemName(systemId)}.`, true);
    };

    const rivalSystemSelect = (value: string, onChange: (v: string) => void) => (
        <select
            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-2 text-[11px] text-slate-300 focus:border-amber-500/50 outline-none"
            value={value}
            onChange={e => onChange(e.target.value)}
        >
            <option value="">Choose a system held by another empire</option>
            {rivalSystems.map(g => (
                <optgroup key={g.owner} label={g.name}>
                    {g.systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
            ))}
        </select>
    );

    const activeOps = espionageState.operations
        .filter(op => op.status === 'active' || op.status === 'pending')
        .sort((a, b) => a.completesAt.localeCompare(b.completesAt));
    const concludedOps = espionageState.operations
        .filter(op => op.status === 'resolved' || op.status === 'failed')
        .sort((a, b) => b.completesAt.localeCompare(a.completesAt));
    const infiltration = Object.entries(espionageState.intel?.infiltrationLevels ?? {})
        .filter(([, level]) => level > 0)
        .sort(([, a], [, b]) => b - a);
    const liveAgents = espionageState.agents.filter(a => a.status !== 'burned');
    const credits = Number((playerFactionId && (factions[playerFactionId] as any)?.reserves?.CREDITS) || 0);
    const ownSystems = (systems as any[])
        .filter(s => playerFactionId && (s.ownerFactionId ?? s.ownerId) === playerFactionId)
        .map(s => ({ id: s.id as string, name: s.name as string }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const handleSavePlan = async (budget: number, regions: Record<string, number>) => {
        if (!playerFactionId) return;
        setBusy(true);
        const result = await setCounterIntelAction(playerFactionId, budget, regions);
        setBusy(false);
        if (!result.success) { showToast(result.error || 'Plan refused.', false); return; }
        showToast('Counter-intelligence plan sent. Upkeep starts with the next hour.', true);
    };

    const cases = espionageState.cases ?? [];
    const openCases = cases.filter(c => c.status === 'open').length;

    const handleAccuse = async (caseId: string, suspectId: string, motive: string | null = null) => {
        if (!playerFactionId) return;
        setBusy(true);
        const result = await fileAccusationAction(playerFactionId, caseId, suspectId, motive);
        setBusy(false);
        if (!result.success) { showToast(result.error || 'Accusation refused.', false); return; }
        showToast(`Accusation against ${factionName(suspectId)} filed. The verdict arrives with the next update.`, true);
    };

    const handleLead = async (caseId: string, kind: string, targetFactionId: string | null) => {
        if (!playerFactionId) return;
        setBusy(true);
        const result = await pursueLeadAction(playerFactionId, caseId, kind, targetFactionId);
        setBusy(false);
        if (!result.success) { showToast(result.error || 'Lead refused.', false); return; }
        showToast('Lead ordered. Our service reports back when it has something.', true);
    };

    const handleLeak = async (caseId: string, suspectId: string) => {
        if (!playerFactionId) return;
        setBusy(true);
        const result = await leakCaseAction(playerFactionId, caseId, suspectId);
        setBusy(false);
        if (!result.success) { showToast(result.error || 'Leak refused.', false); return; }
        showToast(`The story naming ${factionName(suspectId)} is on its way to the press.`, true);
    };

    const handleCrackdown = async (planetId: string) => {
        if (!playerFactionId) return;
        setBusy(true);
        const result = await crackdownAction(playerFactionId, planetId);
        setBusy(false);
        if (!result.success) { showToast(result.error || 'Crackdown refused.', false); return; }
        showToast('Crackdown ordered. Security reports with the next update.', true);
    };

    const handleSweep = async (systemId: string, agentId: string | null) => {
        if (!playerFactionId) return;
        setBusy(true);
        const result = await launchCatalogOpAction(playerFactionId, playerFactionId, systemId, 'counterintel_sweep', agentId);
        setBusy(false);
        if (!result.success) { showToast(result.error || 'Sweep refused.', false); return; }
        showToast(`Counter-Intel Sweep ordered at ${systemName(systemId)}.`, true);
    };
    // The worker refuses recruiting and deploying without Spy Deployment
    // Protocols (lib/tech/order-gates.ts). Same table here, so the page says
    // so up front instead of taking the order and failing it a tick later.
    const techWorld = { tech: new Map([[playerFactionId ?? '', { unlockedTechIds: techState?.unlockedTechIds ?? [] } as any]]) };
    const recruitGate = checkOrderTechGate(techWorld, playerFactionId ?? '', 'ESP_RECRUIT_AGENT');
    const deployGate = checkOrderTechGate(techWorld, playerFactionId ?? '', 'ESP_ASSIGN_AGENT');
    const pressure = espionageState.exposureRisk;

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/40">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-800/60 backdrop-blur-md bg-slate-900/40">
                <div className="flex justify-between items-center gap-3">
                    <div>
                        <h2 className="font-display text-sm tracking-widest text-amber-500 uppercase">Intelligence</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5">Agents, networks and covert operations</p>
                    </div>
                    <span
                        title="Intel accrues over time and from the board. Operations will spend it."
                        className="text-[10px] font-mono px-2 py-0.5 border border-amber-500/30 rounded text-amber-400 bg-amber-500/5 shrink-0"
                    >
                        INTEL {Math.floor(espionageState.intel?.intelPoints ?? 0)}
                    </span>
                </div>
            </div>

            {/* Pressure on us */}
            <div className="px-4 sm:px-6 py-3 border-b border-slate-800/40 bg-slate-900/20"
                title="How hard foreign services are working on your empire. High pressure erodes your interest groups.">
                <div className="flex justify-between text-[10px] font-display tracking-widest text-slate-500 mb-1.5 uppercase">
                    <span>Foreign pressure on your empire</span>
                    <span className={pressure > 50 ? 'text-red-400' : 'text-amber-400'}>{pressure}%</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width: `${pressure}%`,
                            backgroundColor: pressure > 70 ? '#ef4444' : pressure > 40 ? '#f59e0b' : '#10b981',
                        }}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="px-4 sm:px-6 bg-slate-900/10 border-b border-slate-800/40 overflow-x-auto">
                <div className="flex gap-5">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-3 text-[10px] font-display tracking-widest uppercase transition-all border-b-2 shrink-0 ${activeTab === tab.id
                                ? 'text-amber-400 border-amber-500'
                                : 'text-slate-500 border-transparent hover:text-slate-300'
                                }`}
                        >
                            <span className="flex items-center gap-2">{tab.icon}{tab.label}
                                {tab.id === 'cases' && openCases > 0 && (
                                    <span className="ml-0.5 px-1.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-mono">{openCases}</span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {toast && (
                <div className={`mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-xs ${toast.ok
                    ? 'bg-green-950/80 border border-green-700/60 text-green-300'
                    : 'bg-red-950/80 border border-red-700/60 text-red-300'}`}>
                    {toast.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {toast.msg}
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-hide">
                {/* ── Board ───────────────────────────────────────────── */}
                {activeTab === 'board' && (
                    <div className="space-y-3">
                        {espionageState.board.map(opp => {
                            const isThreat = opp.kind === 'threat';
                            const expired = opp.status === 'expired' || nowSeconds >= opp.expiresAt;
                            const seized = opp.status === 'seized';
                            const accent = isThreat ? '#ef4444' : '#f59e0b';
                            const costParts = [
                                opp.cost.intelPoints ? `${opp.cost.intelPoints} Intel` : null,
                                opp.cost.credits ? `§ ${opp.cost.credits}` : null,
                            ].filter(Boolean).join(' + ') || 'Free';
                            return (
                                <div
                                    key={opp.id}
                                    className={`bg-slate-900/50 border rounded-lg p-4 transition-colors ${seized || expired ? 'border-slate-800/40 opacity-50' : 'border-slate-800/60 hover:border-slate-700/80'}`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className="text-[9px] font-display px-1.5 py-0.5 rounded border uppercase tracking-widest"
                                                style={{ color: accent, borderColor: `${accent}50`, backgroundColor: `${accent}15` }}
                                            >
                                                {isThreat ? 'Threat' : 'Opportunity'}
                                            </span>
                                            <span className="text-xs font-mono tracking-wider text-slate-200 uppercase">{opp.title}</span>
                                        </div>
                                        <span className={`text-[9px] font-mono uppercase shrink-0 ${expired ? 'text-slate-600' : seized ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {seized ? 'Seized' : expired ? 'Expired' : expiryCountdown(nowSeconds, opp.expiresAt)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{opp.description}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-tighter">Cost: {costParts}</span>
                                        {!seized && !expired && (
                                            <button
                                                onClick={() => handleSeize(opp.id)}
                                                className="px-4 py-2 rounded uppercase font-display text-[10px] tracking-widest transition-all text-slate-950 hover:brightness-110 active:scale-95"
                                                style={{ backgroundColor: accent }}
                                            >
                                                {isThreat ? 'Respond' : 'Seize'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {espionageState.board.length === 0 && (
                            <EmptyState icon={<Radio size={24} />} title="Board quiet" hint="Field stations post opportunities and threats here as they develop." />
                        )}
                    </div>
                )}

                {/* ── Networks ────────────────────────────────────────── */}
                {activeTab === 'networks' && (
                    <div className="space-y-6">
                        <div>
                            <SectionTitle icon={<Shield size={10} />}>Infiltration by empire</SectionTitle>
                            <div className="space-y-2">
                                {infiltration.map(([targetId, level]) => {
                                    const stage = stageForInfiltration(level);
                                    const info = stageInfo(stage);
                                    const next = nextStage(stage);
                                    const progressPct = next
                                        ? ((level - info.minInfiltration) / (next.minInfiltration - info.minInfiltration)) * 100
                                        : 100;
                                    return (
                                        <div key={targetId} className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-3">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-[11px] text-slate-300 uppercase tracking-tight font-medium">{factionName(targetId)}</span>
                                                <span className="text-[9px] font-display px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-300 bg-purple-500/10 uppercase tracking-widest shrink-0">
                                                    {info.label}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mb-2">{info.description}</p>
                                            <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold tracking-tighter mb-1">
                                                <span>Infiltration {Math.floor(level)}/100</span>
                                                <span>{next ? `${next.label} at ${next.minInfiltration}` : 'Maximum reach'}</span>
                                            </div>
                                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, Math.max(3, progressPct))}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                {infiltration.length === 0 && (
                                    <EmptyState icon={<Shield size={20} />} title="No foreign networks yet"
                                        hint="Assign an agent to a system another empire holds. A staffed network raises your infiltration of its owner." />
                                )}
                            </div>
                        </div>

                        <div>
                            <SectionTitle icon={<MapPin size={10} />}>System networks</SectionTitle>
                            <div className="space-y-2">
                                {espionageState.networks.map(net => {
                                    const owner = ownerOf(net.systemId);
                                    const color = (PENETRATION[net.penetrationLevel] ?? PENETRATION.none).color;
                                    const staff = net.agentIds
                                        .map(id => espionageState.agents.find(a => a.id === id)?.codename)
                                        .filter(Boolean);
                                    return (
                                        <div key={net.id} className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-3">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs text-slate-200 truncate">{systemName(net.systemId)}</div>
                                                    <div className="text-[10px] text-slate-500 truncate">
                                                        {owner ? (owner === playerFactionId ? 'Your system' : factionName(owner)) : 'Unclaimed'}
                                                        {' · '}
                                                        {staff.length > 0 ? staff.join(', ') : 'no agents'}
                                                    </div>
                                                </div>
                                                <PenetrationBadge level={net.penetrationLevel} />
                                            </div>
                                            <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                                                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(net.strength * 100)}%`, backgroundColor: color }} />
                                            </div>
                                            {net.agentIds.length === 0 && (
                                                <div className="mt-2 text-[10px] text-amber-500 flex items-center gap-1">
                                                    <AlertTriangle size={10} /> Unstaffed. This network is fading.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {espionageState.networks.length === 0 && (
                                    <EmptyState icon={<Globe size={20} />} title="No system networks" hint="Agents build a network in the system you send them to." />
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900/30 border border-slate-800/40 rounded-lg p-3 space-y-1.5">
                            <div className="text-[9px] font-display tracking-widest text-slate-500 uppercase mb-1">What a network shows you</div>
                            {(Object.keys(PENETRATION) as IntelNetwork['penetrationLevel'][]).map(level => (
                                <div key={level} className="flex items-center gap-2 text-[10px] text-slate-500">
                                    <PenetrationBadge level={level} /> {PENETRATION[level].meaning}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Operations ──────────────────────────────────────── */}
                {activeTab === 'operations' && (
                    <div className="space-y-6">
                        <CatalogLauncher
                            rivals={rivalSystems}
                            infiltrationLevels={espionageState.intel?.infiltrationLevels ?? {}}
                            intelPoints={espionageState.intel?.intelPoints ?? 0}
                            credits={credits}
                            capacity={espionageState.intel
                                ? { used: espionageState.intel.usedAgentCapacity, max: espionageState.intel.agentCapacity }
                                : null}
                            techBonus={espionageState.opSuccessBonus ?? 0}
                            unlockedTechIds={techState?.unlockedTechIds ?? []}
                            agents={espionageState.agents}
                            busy={busy}
                            onLaunch={handleLaunch}
                        />

                        <div>
                            <SectionTitle icon={<Target size={10} />}>Under way</SectionTitle>
                            <div className="space-y-3">
                                {activeOps.map(op => {
                                    const start = isoToSim(op.startedAt);
                                    const end = isoToSim(op.completesAt);
                                    const pct = end > start ? Math.min(100, Math.max(0, ((nowSeconds - start) / (end - start)) * 100)) : 100;
                                    return (
                                        <div key={op.id} className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-4">
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-mono tracking-wider text-slate-200 uppercase">{operationName(op)}</div>
                                                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 truncate">
                                                        <MapPin size={10} className="text-slate-600 shrink-0" />
                                                        {systemName(op.targetRegionId)} · {factionName(op.targetFactionId)}{op.agentId ? ` · ${espionageState.agents.find(a => a.id === op.agentId)?.codename ?? 'agent'}` : ''}
                                                    </div>
                                                </div>
                                                <span className="text-[9px] font-mono text-amber-400 uppercase shrink-0">
                                                    Resolves {formatGalacticDeadline(end, nowSeconds)}
                                                </span>
                                            </div>
                                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                {activeOps.length === 0 && (
                                    <EmptyState icon={<Target size={24} />} title="No operations under way" />
                                )}
                            </div>
                        </div>

                        {concludedOps.length > 0 && (
                            <div>
                                <SectionTitle icon={<FileText size={10} />}>Recently concluded</SectionTitle>
                                <div className="space-y-2">
                                    {concludedOps.map(op => {
                                        const outcome = outcomeLine(op);
                                        return (
                                            <div key={op.id} className="bg-slate-900/30 border border-slate-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-[11px] text-slate-300 truncate">
                                                        {operationName(op)} · {systemName(op.targetRegionId)}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 truncate">{factionName(op.targetFactionId)}</div>
                                                </div>
                                                <span className="text-[10px] font-mono shrink-0" style={{ color: outcome.color }}>{outcome.text}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Reports ─────────────────────────────────────────── */}
                {activeTab === 'reports' && (
                    <div className="space-y-3">
                        {espionageState.reports.map(report => {
                            const confPct = Math.round(report.confidence * 100);
                            const confColor = confPct >= 75 ? '#10b981' : confPct >= 55 ? '#f59e0b' : '#ef4444';
                            // Our own after-action entries are facts, not estimates: badge the
                            // outcome. Incoming entries are what our service caught.
                            const isAfterAction = report.domain === AFTER_ACTION_DOMAIN;
                            const isIncoming = report.domain === INCOMING_DOMAIN;
                            const succeeded = isAfterAction && /succeeded$/.test(report.title);
                            const badge = isAfterAction
                                ? { text: succeeded ? 'Succeeded' : 'Failed', color: succeeded ? '#10b981' : '#ef4444' }
                                : isIncoming && confPct >= 100
                                    ? { text: 'Caught', color: '#ef4444' }
                                    : { text: `${confPct}% confidence`, color: confColor };
                            return (
                                <div key={report.id} className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="min-w-0">
                                            <div className="text-xs font-mono tracking-wider text-slate-200 uppercase">{report.title}</div>
                                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 flex-wrap">
                                                <span>{factionName(report.targetFactionId)}</span>
                                                <span className="text-slate-700">•</span>
                                                <span className="uppercase">{REPORT_KIND[report.domain] ?? report.domain}</span>
                                                <span className="text-slate-700">•</span>
                                                <span>{reportAge(nowSeconds, report.createdAt)}</span>
                                            </div>
                                        </div>
                                        <span
                                            className="text-[9px] font-display px-1.5 py-0.5 rounded border uppercase tracking-widest shrink-0"
                                            style={{ color: badge.color, borderColor: `${badge.color}50`, backgroundColor: `${badge.color}15` }}
                                        >
                                            {badge.text}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">{report.body}</p>
                                </div>
                            );
                        })}
                        {espionageState.reports.length === 0 && (
                            <EmptyState icon={<FileText size={24} />} title="No intelligence on file" hint="Findings from your operations, how each one went, and the foreign operations your service catches land here." />
                        )}
                        {espionageState.reports.length > 0 && (
                            <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-500 italic">
                                <AlertTriangle size={10} />
                                Confidence is an estimate. Reports may be outdated, incomplete, or planted.
                            </div>
                        )}
                    </div>
                )}

                {/* ── Agents ──────────────────────────────────────────── */}
                {/* ── Case board ──────────────────────────────────────── */}
                {activeTab === 'cases' && (
                    <CaseBoardTab
                        cases={cases}
                        factionName={factionName}
                        nowSeconds={nowSeconds}
                        busy={busy}
                        onAccuse={handleAccuse}
                        onLeak={handleLeak}
                        onLead={handleLead}
                        dossier={{
                            playerFactionId,
                            factions: factions as any,
                            rivalries: diplomacyState?.rivalries ?? [],
                            treaties: (diplomacyState?.treaties ?? []) as any,
                            intel: espionageState.intel,
                        }}
                    />
                )}

                {/* ── Counter-intelligence ────────────────────────────── */}
                {activeTab === 'defence' && (
                    <div className="space-y-6">
                        <CounterIntelTab
                            intel={espionageState.intel}
                            ownSystems={ownSystems}
                            agents={espionageState.agents}
                            credits={credits}
                            techBonus={espionageState.opSuccessBonus ?? 0}
                            busy={busy}
                            onSavePlan={handleSavePlan}
                            onSweep={handleSweep}
                        />
                        <InternalSecurity
                            cells={espionageState.rebelCells ?? []}
                            crackdowns={espionageState.rebelCrackdowns ?? []}
                            worlds={(planets as any[]).filter(p => p.ownerId === playerFactionId).map(p => ({ id: p.id, name: p.name, unrest: Number(p.unrest ?? 0) }))}
                            nowSeconds={nowSeconds}
                            busy={busy}
                            onCrackdown={handleCrackdown}
                        />
                    </div>
                )}

                {activeTab === 'agents' && (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] text-slate-500">
                                {liveAgents.length} agent{liveAgents.length === 1 ? '' : 's'} ·{' '}
                                {liveAgents.filter(a => a.status === 'deployed').length} in the field
                            </div>
                            {recruitGate.allowed ? (
                                <button
                                    onClick={() => setRecruitOpen(o => !o)}
                                    className="px-3 py-2 rounded border border-emerald-700/50 text-emerald-400 text-[10px] font-display tracking-widest uppercase hover:bg-emerald-900/20 flex items-center gap-1.5"
                                >
                                    <UserPlus size={12} /> {recruitOpen ? 'Hide recruits' : 'Recruit'}
                                </button>
                            ) : (
                                <span className="px-3 py-2 rounded border border-slate-800 text-slate-500 text-[10px] flex items-center gap-1.5" title={recruitGate.reason}>
                                    <Lock size={12} /> {recruitGate.reason}
                                </span>
                            )}
                        </div>

                        {deployingAgentId && (
                            <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-4 space-y-3">
                                <div className="text-[10px] font-display tracking-widest text-amber-500 uppercase">
                                    Send {espionageState.agents.find(a => a.id === deployingAgentId)?.codename} to
                                </div>
                                {rivalSystemSelect(deployTargetId, setDeployTargetId)}
                                <p className="text-[10px] text-slate-500">
                                    The agent builds a network there. It reveals fleets in that system and raises your infiltration of its owner.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setDeployingAgentId(null); setDeployTargetId(''); }}
                                        className="flex-1 px-4 py-2 border border-slate-700 text-slate-400 rounded uppercase font-display text-[10px] tracking-widest hover:bg-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        disabled={!deployTargetId || busy}
                                        onClick={confirmDeployment}
                                        className={`flex-1 px-4 py-2 rounded uppercase font-display text-[10px] tracking-widest ${deployTargetId && !busy
                                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                            : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                                    >
                                        Send agent
                                    </button>
                                </div>
                            </div>
                        )}

                        {recruitOpen && (
                            <div className="space-y-3">
                                <SectionTitle icon={<UserPlus size={10} />}>Candidates · paid in credits</SectionTitle>
                                {loadingRecruits && (
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500"><Loader2 size={12} className="animate-spin" /> Contacting recruiters…</div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {espionageState.candidates.map(candidate => (
                                        <div key={candidate.id} className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
                                            <div className="flex justify-between items-start gap-2">
                                                <div>
                                                    <div className="text-base font-mono tracking-widest text-slate-100 uppercase leading-none">{candidate.codename}</div>
                                                    <p className="text-[10px] text-slate-500 mt-1.5">{candidate.name}{candidate.species ? ` · ${speciesLabel(candidate.species)}` : ''}</p>
                                                    {candidate.foreign && (
                                                        <p className="text-[10px] text-amber-400 mt-1" title="A hired foreigner leaves their own species behind at the scene, not ours. Dearer, and worth it.">
                                                            Foreign hire: a witness would point at their people, not ours.
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-[10px] font-mono text-amber-500 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/20 shrink-0">
                                                    § {candidate.recruitmentCost}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {visibleTraits(candidate.traitIds).map(t => <TraitChip key={t} traitId={t} />)}
                                            </div>
                                            <button
                                                disabled={busy}
                                                className="w-full bg-slate-100 hover:bg-white text-slate-950 font-display text-[10px] py-2 rounded uppercase tracking-widest disabled:opacity-50"
                                                onClick={() => handleRecruit(candidate.id)}
                                            >
                                                Hire
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {!loadingRecruits && espionageState.candidates.length === 0 && (
                                    <p className="text-[10px] text-slate-500">No candidates right now.</p>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {espionageState.agents.map(agent => (
                                <AgentCard
                                    key={agent.id}
                                    agent={agent}
                                    systemName={agent.deployedToSystemId ? systemName(agent.deployedToSystemId) : null}
                                    nowSeconds={nowSeconds}
                                    deployBlockedReason={deployGate.allowed ? null : deployGate.reason}
                                    onDeploy={id => { setDeployingAgentId(id); setDeployTargetId(''); }}
                                    onRecall={handleRecall}
                                />
                            ))}
                        </div>
                        {espionageState.agents.length === 0 && !recruitOpen && (
                            <EmptyState icon={<Users size={32} />} title="No agents" hint="Recruit an agent, then send them to a rival system to start a network." />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
