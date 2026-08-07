import * as React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Scale, Users, CheckCircle, Zap, AlertCircle, FileText, MessageSquare, Landmark, Coins, ShieldCheck, Leaf, Briefcase, Trophy, Compass, Link2, Flag, Globe } from 'lucide-react';
import {
    enactPolicyAction,
    repealPolicyAction,
    getPolicyCatalogAction,
    dismissMinisterAction,
    lobbyPartyAction,
    purgeOfficersAction,
    answerDefianceAction,
    grantConcessionAction,
    suppressSecessionAction,
    recognizeBreakawayAction,
    guaranteeBreakawayAction,
} from '@/app/actions/politics';
import type { PolicyOption } from '@/types/ui-state';

const CATEGORY_ICON: Record<string, React.ReactNode> = {
    military: <ShieldCheck size={14} />,
    economy: <Coins size={14} />,
    social: <Users size={14} />,
    state: <Landmark size={14} />,
    environment: <Leaf size={14} />,
};

/** Effect keys the government system actually consumes, with readable labels. */
const EFFECT_LABELS: Record<string, string> = {
    production: 'Production',
    tax_income: 'Tax income',
    upkeep: 'Upkeep',
    pop_growth: 'Population growth',
    approval: 'Approval',
    legitimacy_drift: 'Legitimacy/day',
};

/** Mirrors SECESSION_DEMANDS in lib/government/secession-types (worker-side). */
const SECESSION_TERMS = [
    { id: 'tax_relief', label: 'Lower Tax', pc: 10, hint: 'They keep more of what they earn', price: 'permanent revenue loss' },
    { id: 'resource_rights', label: 'Resource Rights', pc: 15, hint: 'Local ownership of local ground', price: 'permanent production loss' },
    { id: 'military_exemption', label: 'No Conscription', pc: 15, hint: 'No more levies from these worlds', price: 'the officer corps takes it personally' },
    { id: 'local_parliament', label: 'Local Parliament', pc: 25, hint: 'A chamber answerable to them', price: 'the centre governs less of its empire' },
    { id: 'autonomy', label: 'Autonomy', pc: 30, hint: 'Self-rule in all but name', price: 'permanent revenue loss and a looser grip' },
];
const SUPPRESS_COST = 40;
/** Mirrors RECOGNIZE_COST / GUARANTEE_COST in foreign-interference-service. */
const RECOGNISE_COST = 15;
const GUARANTEE_COST = 35;

/** Mirrors DEFIANCE_OPTIONS in lib/government/defiance-types (worker-side). */
const DEFIANCE_CHOICES = [
    { response: 'negotiate', label: 'Negotiate', pc: 15, credits: 0, hint: 'Grant autonomy — permanent revenue cost' },
    { response: 'bribe', label: 'Bribe', pc: 5, credits: 4000, hint: 'Fund local projects — teaches the frontier that defiance pays' },
    { response: 'threaten', label: 'Threaten', pc: 8, credits: 0, hint: 'Demand compliance — may be called' },
    { response: 'replace_governor', label: 'Replace', pc: 12, credits: 0, hint: 'Install someone loyal — a popular governor has supporters' },
    { response: 'send_military', label: 'Send Military', pc: 25, credits: 0, hint: 'Force — every other world is watching' },
];

/** Cohesion stage colours: integrated → strained → defiant → separatist. */
function cohesionColor(cohesion: number): string {
    if (cohesion >= 60) return '#22d3ee';
    if (cohesion >= 40) return '#f59e0b';
    if (cohesion >= 20) return '#f97316';
    return '#ef4444';
}

/** [axis, label at -100, label at +100] — sign convention from IdeologyProfile. */
const IDEOLOGY_AXES: Array<[string, string, string]> = [
    ['authoritarianism_liberty', 'LIBERTY', 'AUTHORITY'],
    ['militarism_pacifism', 'PACIFISM', 'MILITARISM'],
    ['tradition_progress', 'PROGRESS', 'TRADITION'],
    ['collectivism_individualism', 'INDIVIDUAL', 'COLLECTIVE'],
    ['expansionism_isolationism', 'ISOLATION', 'EXPANSION'],
    ['centralization_autonomy', 'AUTONOMY', 'CENTRAL'],
    ['order_chaos', 'CHAOS', 'ORDER'],
];

/** Mirror the worker-side costs (lib/government/*-service). */
const DISMISS_COST = 10;
const LOBBY_COST = 8;
const PURGE_COST = 20;

function formatEffect(key: string, value: number): string {
    const label = EFFECT_LABELS[key] ?? key;
    // approval and legitimacy_drift are flat points; the rest are percentages.
    const flat = key === 'approval' || key === 'legitimacy_drift';
    const shown = flat ? value.toFixed(1) : `${(value * 100).toFixed(0)}%`;
    return `${label} ${value >= 0 ? '+' : ''}${shown}`;
}

function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return (
        <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-[9px] font-display tracking-widest text-slate-500 uppercase">{label}</span>
                <span className="text-[10px] font-mono" style={{ color }}>{Math.round(value)}{max === 100 ? '%' : ` / ${Math.round(max)}`}</span>
            </div>
            <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

export default function GovernmentPanel() {
    const { playerState, politicsState, updatePolitics, setActiveTab, updateDiscourse } = useUIStore();
    const gov = politicsState?.government;
    const catalog = politicsState?.policyCatalog;
    const [pending, setPending] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    // The catalog lives in data/policies (fs-backed registry), so it comes from
    // the server once rather than riding every sync poll.
    React.useEffect(() => {
        if (catalog) return;
        let cancelled = false;
        getPolicyCatalogAction().then(res => {
            if (cancelled || !res.success || !res.data) return;
            updatePolitics({ policyCatalog: res.data });
        });
        return () => { cancelled = true; };
    }, [catalog, updatePolitics]);

    const activePolicies = gov?.activePolicies ?? politicsState?.activePolicies ?? [];
    const capital = gov?.politicalCapital ?? 0;
    // Defiance deadlines are sim-clock seconds; the authoritative clock is the
    // tick timestamp the worker last wrote.
    const nowSeconds = Math.floor(Date.now() / 1000);

    const runRecognise = async (rebelFactionId: string) => {
        setPending(`${rebelFactionId}:recognise`);
        setError(null);
        const res = await recognizeBreakawayAction(playerState.factionId, rebelFactionId);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Recognition rejected.');
    };

    const runGuarantee = async (rebelFactionId: string) => {
        setPending(`${rebelFactionId}:guarantee`);
        setError(null);
        const res = await guaranteeBreakawayAction(playerState.factionId, rebelFactionId);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Guarantee rejected.');
    };

    const runConcession = async (crisisId: string, demandId: string) => {
        setPending(`${crisisId}:${demandId}`);
        setError(null);
        const res = await grantConcessionAction(playerState.factionId, crisisId, demandId);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Concession rejected.');
    };

    const runSuppress = async (crisisId: string) => {
        setPending(`${crisisId}:suppress`);
        setError(null);
        const res = await suppressSecessionAction(playerState.factionId, crisisId);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Suppression rejected.');
    };

    const runDefiance = async (eventId: string, response: string) => {
        setPending(`${eventId}:${response}`);
        setError(null);
        const res = await answerDefianceAction(playerState.factionId, eventId, response);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Response rejected.');
    };

    const runLobby = async (billId: string, partyId: string) => {
        setPending(`${billId}:${partyId}`);
        setError(null);
        const res = await lobbyPartyAction(playerState.factionId, billId, partyId);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Lobbying rejected.');
    };

    const runPurge = async () => {
        setPending('purge');
        setError(null);
        const res = await purgeOfficersAction(playerState.factionId);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Purge rejected.');
    };

    const runDismiss = async (portfolio: string) => {
        setPending(portfolio);
        setError(null);
        const res = await dismissMinisterAction(playerState.factionId, portfolio);
        setPending(null);
        if (!res.success) setError(res.error ?? 'Dismissal rejected.');
    };

    const runPolicyOrder = async (policy: PolicyOption, repeal: boolean) => {
        setPending(policy.id);
        setError(null);
        const res = repeal
            ? await repealPolicyAction(playerState.factionId, policy.id)
            : await enactPolicyAction(playerState.factionId, policy.id);
        setPending(null);
        if (!res.success) {
            setError(res.error ?? 'Order rejected.');
            return;
        }
        // The worker is authoritative — it charges the capital and the next sync
        // brings the real active list back. Show intent immediately.
        updatePolitics({
            activePolicies: repeal
                ? activePolicies.filter(id => id !== policy.id)
                : [...activePolicies, policy.id],
        });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/40">
                <h2 className="font-display text-sm tracking-widest text-amber-400 uppercase">Government Domain</h2>
                <p className="text-xs text-slate-500 mt-0.5">Political capital, institutional power blocs & policy</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Administration + political standing */}
                <div className="space-y-3">
                    <div className="bg-slate-900/60 border rounded-lg p-4 space-y-4" style={{ borderColor: politicsState?.crisisConditionMet ? '#ef4444' : '#f59e0b44' }}>
                        <div className="flex justify-between items-start">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 uppercase">Current Administration</div>
                            {politicsState?.crisisConditionMet && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-[9px] font-display animate-pulse uppercase">
                                    <AlertCircle size={10} /> Domestic Crisis
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                                <Scale size={20} className="text-amber-400" />
                            </div>
                            <div className="min-w-0">
                                <div className="font-display text-sm text-amber-400 truncate">{gov?.institutionName ?? 'Provisional Authority'}</div>
                                <div className="text-xs text-slate-400 mt-0.5 capitalize tracking-tight font-medium truncate">
                                    {playerState.role} ROLE · {playerState.factionId.replace('faction-', '').toUpperCase()}
                                </div>
                            </div>
                        </div>

                        {gov?.headOfState && (
                            <div className="border-t border-slate-800 pt-3 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[9px] font-display tracking-widest text-slate-500 uppercase">{gov.headOfState.title}</div>
                                        <div className="text-sm font-display text-slate-200 truncate">{gov.headOfState.name}</div>
                                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                            AGE {gov.headOfState.age} · {gov.headOfState.yearsInOffice}Y IN OFFICE
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] font-mono shrink-0 leading-relaxed">
                                        <div className={gov.headOfState.health < 30 ? 'text-red-400' : 'text-slate-400'}>
                                            HEALTH {gov.headOfState.health}
                                        </div>
                                        <div className="text-slate-400">POPULARITY {gov.headOfState.popularity}</div>
                                        <div className="text-slate-400">SKILL {gov.headOfState.politicalSkill}</div>
                                    </div>
                                </div>
                                {gov.headOfState.traits.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {gov.headOfState.traits.map(trait => (
                                            <span key={trait} className="text-[9px] font-display px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded uppercase tracking-wider">
                                                {trait.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {gov.headOfState.health < 30 && (
                                    <div className="text-[10px] text-red-400 font-mono">Failing health — prepare for succession.</div>
                                )}
                            </div>
                        )}

                        {gov && (
                            <>
                                <div className="flex gap-4">
                                    <Meter label="Approval" value={gov.approval} max={100} color={gov.approval < 30 ? '#ef4444' : gov.approval > 60 ? '#22c55e' : '#f59e0b'} />
                                    <Meter label="Legitimacy" value={gov.legitimacy} max={100} color={gov.legitimacy < 30 ? '#ef4444' : '#818cf8'} />
                                </div>
                                <div className="flex gap-4 items-end">
                                    <Meter label="Political Capital" value={gov.politicalCapital} max={gov.politicalCapitalCap} color="#38bdf8" />
                                    <div className="text-[9px] font-mono text-slate-500 shrink-0 text-right leading-relaxed">
                                        SENATE {Math.round(gov.senatePower)}<br />
                                        EXEC {Math.round(gov.executivePower)}
                                    </div>
                                </div>
                                {gov.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {gov.tags.map(tag => (
                                            <span key={tag} className="text-[9px] font-display px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded uppercase tracking-wider">
                                                {tag.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {(politicsState?.activeIndicators?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {politicsState.activeIndicators.map(indicator => (
                                <span key={indicator} className="text-[9px] font-display px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded uppercase tracking-wider">
                                    {indicator.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Breakaway states — ours to reconquer, theirs to recognise */}
                {(gov?.breakaways?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                            <Globe size={12} className="text-orange-400" /> BREAKAWAY STATES
                        </div>
                        <div className="space-y-2">
                            {gov!.breakaways.map(state => (
                                <div
                                    key={state.factionId}
                                    className={`rounded-lg border p-3 ${state.isOurRebel ? 'bg-rose-950/20 border-rose-500/30' : 'bg-slate-900/40 border-slate-800/60'}`}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <div className="text-xs text-slate-200 truncate">{state.name}</div>
                                            <div className="text-[9px] font-mono text-slate-600 mt-0.5">
                                                {state.worlds} worlds · legitimacy {Math.round(state.legitimacy)} · recognised by {state.recognisedByCount}
                                            </div>
                                        </div>
                                        {state.isOurRebel && (
                                            <span className="text-[9px] font-display text-rose-400 uppercase tracking-wider shrink-0">
                                                Broke from us
                                            </span>
                                        )}
                                    </div>

                                    {!state.isOurRebel && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            <button
                                                onClick={() => runRecognise(state.factionId)}
                                                disabled={state.recognisedByUs || capital < RECOGNISE_COST || pending === `${state.factionId}:recognise`}
                                                title="Recognise their independence — the empire they left will not forget it"
                                                className={`text-[9px] font-display px-2 py-1 rounded border uppercase tracking-wider transition-all ${
                                                    state.recognisedByUs
                                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 cursor-default'
                                                        : capital < RECOGNISE_COST
                                                            ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                                }`}
                                            >
                                                {state.recognisedByUs ? '✓ Recognised' : `Recognise · ${RECOGNISE_COST} PC`}
                                            </button>
                                            <button
                                                onClick={() => runGuarantee(state.factionId)}
                                                disabled={state.guaranteedByUs || capital < GUARANTEE_COST || pending === `${state.factionId}:guarantee`}
                                                title="Guarantee their independence — a promise the parent reads as a threat"
                                                className={`text-[9px] font-display px-2 py-1 rounded border uppercase tracking-wider transition-all ${
                                                    state.guaranteedByUs
                                                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 cursor-default'
                                                        : capital < GUARANTEE_COST
                                                            ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                                                            : 'bg-amber-600/10 hover:bg-amber-600/25 text-amber-400 border border-amber-500/30'
                                                }`}
                                            >
                                                {state.guaranteedByUs ? '✓ Guaranteed' : `Guarantee · ${GUARANTEE_COST} PC`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Secession crises — a region, not a planet */}
                {(gov?.secession?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                            <Flag size={12} className="text-red-500 animate-pulse" /> SECESSION CRISES
                        </div>
                        <div className="space-y-3">
                            {gov!.secession.map(crisis => {
                                const daysLeft = Math.max(0, (crisis.deadlineSeconds - nowSeconds) / 86400);
                                return (
                                    <div key={crisis.id} className="bg-red-950/30 border border-red-500/40 rounded-lg p-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="font-display text-xs text-red-300 uppercase tracking-wider">{crisis.name}</div>
                                            <span className="text-[9px] font-mono text-amber-400 shrink-0">
                                                {daysLeft < 0.05 ? 'PATIENCE SPENT' : `${daysLeft.toFixed(1)}d`}
                                            </span>
                                        </div>

                                        <div className="text-[10px] text-slate-400 mt-1">
                                            {crisis.planetNames.length} worlds demand greater autonomy
                                            {crisis.leaderName ? ` · led by Governor ${crisis.leaderName}` : ''}
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mt-3 text-[9px] font-mono">
                                            <div>
                                                <div className="text-slate-600">INDEPENDENCE</div>
                                                <div className={crisis.independenceSupport > 60 ? 'text-red-400' : 'text-amber-400'}>
                                                    {Math.round(crisis.independenceSupport)}%
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-slate-600">GOV. LOYALTY</div>
                                                <div className={crisis.governorLoyalty < 30 ? 'text-red-400' : 'text-slate-300'}>
                                                    {Math.round(crisis.governorLoyalty)}%
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-slate-600">MILITARY</div>
                                                <div className={crisis.militaryLoyalty < 50 ? 'text-amber-400' : 'text-slate-300'}>
                                                    {crisis.militaryLoyalty < 50 ? 'UNCERTAIN' : `${Math.round(crisis.militaryLoyalty)}%`}
                                                </div>
                                            </div>
                                        </div>

                                        {crisis.causes.length > 0 && (
                                            <div className="text-[9px] font-mono text-slate-600 mt-2">
                                                BECAUSE: {crisis.causes.join(' · ')}
                                            </div>
                                        )}

                                        {crisis.exposedSponsors.length > 0 && (
                                            <div className="text-[9px] font-mono text-orange-400 mt-1">
                                                FOREIGN HANDS: {crisis.exposedSponsors.join(' · ')}
                                            </div>
                                        )}

                                        <div className="text-[9px] font-display tracking-widest text-slate-600 uppercase mt-3 mb-1.5">
                                            Terms they will accept
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {SECESSION_TERMS.map(term => {
                                                const already = crisis.granted.includes(term.id);
                                                const asked = crisis.demands.includes(term.id);
                                                const affordable = capital >= term.pc;
                                                const busy = pending === `${crisis.id}:${term.id}`;
                                                return (
                                                    <button
                                                        key={term.id}
                                                        onClick={() => runConcession(crisis.id, term.id)}
                                                        disabled={already || !affordable || busy}
                                                        title={`${term.hint} — ${term.price}${asked ? '' : ' (not one of their demands: less effective)'}`}
                                                        className={`text-[9px] font-display px-2 py-1 rounded border uppercase tracking-wider transition-all ${
                                                            already
                                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 cursor-default'
                                                                : !affordable
                                                                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                                                                    : asked
                                                                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                                                                        : 'bg-slate-900 hover:bg-slate-800 text-slate-500 border-slate-800'
                                                        }`}
                                                    >
                                                        {already ? `✓ ${term.label}` : busy ? '…' : `${term.label} · ${term.pc} PC`}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <button
                                            onClick={() => runSuppress(crisis.id)}
                                            disabled={capital < SUPPRESS_COST || pending === `${crisis.id}:suppress`}
                                            title={`Answer with force — the garrison may refuse${capital >= SUPPRESS_COST ? '' : `; needs ${SUPPRESS_COST} political capital`}`}
                                            className={`mt-3 w-full py-1.5 rounded text-[9px] font-display uppercase tracking-widest transition-all ${
                                                capital < SUPPRESS_COST
                                                    ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                                    : 'bg-red-600/10 hover:bg-red-600/25 text-red-400 border border-red-500/30'
                                            }`}
                                        >
                                            {pending === `${crisis.id}:suppress` ? '…' : `Send in the fleet · ${SUPPRESS_COST} PC`}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(gov?.recentSecession?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                        {gov!.recentSecession.map(crisis => (
                            <div key={crisis.id} className="text-[10px] flex gap-2">
                                <span className={crisis.status === 'settled' ? 'text-emerald-500' : 'text-rose-500'}>
                                    {crisis.name}
                                </span>
                                <span className="text-slate-600 truncate">{crisis.outcome}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Open defiance — the escalation ladder's active stage */}
                {(gov?.defiance?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                            <AlertCircle size={12} className="text-red-400 animate-pulse" /> WORLDS IN OPEN DEFIANCE
                        </div>
                        <div className="space-y-3">
                            {gov!.defiance.map(crisis => {
                                const daysLeft = Math.max(0, (crisis.expiresAtSeconds - nowSeconds) / 86400);
                                return (
                                    <div key={crisis.id} className="bg-red-950/20 border border-red-500/30 rounded-lg p-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <div className="text-[9px] font-display tracking-widest text-red-400/80 uppercase">
                                                    {crisis.kindLabel} · {crisis.planetName}
                                                </div>
                                                <div className="text-xs text-slate-200 mt-0.5">{crisis.title}</div>
                                            </div>
                                            <span className="text-[9px] font-mono text-amber-400 shrink-0">
                                                {daysLeft < 0.05 ? 'CLOSING' : `${daysLeft.toFixed(1)}d LEFT`}
                                            </span>
                                        </div>

                                        <p className="text-[11px] text-slate-400 italic mt-2">“{crisis.demand}”</p>

                                        {crisis.causes.length > 0 && (
                                            <div className="text-[9px] font-mono text-slate-600 mt-2">
                                                BECAUSE: {crisis.causes.join(' · ')}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {DEFIANCE_CHOICES.map(choice => {
                                                const affordable = capital >= choice.pc;
                                                const busy = pending === `${crisis.id}:${choice.response}`;
                                                return (
                                                    <button
                                                        key={choice.response}
                                                        onClick={() => runDefiance(crisis.id, choice.response)}
                                                        disabled={!affordable || busy}
                                                        title={`${choice.hint}${affordable ? '' : ` — needs ${choice.pc} political capital`}`}
                                                        className={`text-[9px] font-display px-2 py-1 rounded border uppercase tracking-wider transition-all ${
                                                            !affordable
                                                                ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                                                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                                        }`}
                                                    >
                                                        {busy ? '…' : `${choice.label} · ${choice.pc} PC${choice.credits ? ` + ${choice.credits / 1000}k` : ''}`}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="text-[9px] text-slate-600 mt-2">
                                            Saying nothing is also an answer — and the worst one.
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(gov?.recentDefiance?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[9px] font-display tracking-widest text-slate-600 uppercase mb-2">
                            Recently decided
                        </div>
                        <div className="space-y-1">
                            {gov!.recentDefiance.map(crisis => (
                                <div key={crisis.id} className="text-[10px] text-slate-500 flex gap-2">
                                    <span className={crisis.status === 'ignored' ? 'text-rose-500' : 'text-slate-400'}>
                                        {crisis.planetName}
                                    </span>
                                    <span className="text-slate-600 truncate">{crisis.outcome}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empire cohesion */}
                {gov && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Link2 size={12} className="text-cyan-400" /> EMPIRE COHESION
                            </span>
                            <span
                                className="font-mono"
                                style={{ color: cohesionColor(gov.cohesion) }}
                                title="Do people still believe this empire should exist? Not the same as approval."
                            >
                                {Math.round(gov.cohesion)}
                                <span className="text-slate-600 ml-2">
                                    {gov.cohesionTrend >= 0 ? '+' : ''}{gov.cohesionTrend.toFixed(1)}/day
                                </span>
                            </span>
                        </div>

                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden mb-3">
                            <div
                                className="h-full transition-all duration-700"
                                style={{ width: `${gov.cohesion}%`, backgroundColor: cohesionColor(gov.cohesion) }}
                            />
                        </div>

                        {gov.cohesionDrivers.length > 0 && (
                            <div className="space-y-1 mb-3">
                                {gov.cohesionDrivers.map(driver => (
                                    <div key={driver.id} className="flex items-center justify-between text-[10px]">
                                        <span className="text-slate-500">{driver.label}</span>
                                        <span className={`font-mono ${driver.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {driver.delta >= 0 ? '+' : ''}{driver.delta.toFixed(1)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {gov.weakestWorlds.length > 0 && (
                            <>
                                <div className="text-[9px] font-display tracking-widest text-slate-600 uppercase mb-2">
                                    Worlds furthest from the centre
                                </div>
                                <div className="space-y-1.5">
                                    {gov.weakestWorlds.map(planet => (
                                        <div key={planet.planetId} className="bg-slate-900/40 border border-slate-800/50 rounded p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] text-slate-300 truncate">{planet.planetName}</span>
                                                <span className="flex items-center gap-2 shrink-0">
                                                    <span
                                                        className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border"
                                                        style={{
                                                            color: cohesionColor(planet.cohesion),
                                                            borderColor: `${cohesionColor(planet.cohesion)}55`,
                                                        }}
                                                    >
                                                        {planet.stageLabel}
                                                    </span>
                                                    <span className="text-[10px] font-mono" style={{ color: cohesionColor(planet.cohesion) }}>
                                                        {Math.round(planet.cohesion)}
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="text-[9px] font-mono text-slate-600 mt-1">
                                                {planet.distanceFromCapital >= 0 ? `${planet.distanceFromCapital} jumps` : 'unreachable'}
                                                {' · heading for '}
                                                <span className={planet.target < planet.cohesion ? 'text-rose-500' : 'text-emerald-600'}>
                                                    {Math.round(planet.target)}
                                                </span>
                                            </div>
                                            {planet.drivers.length > 0 && (
                                                <div className="text-[9px] text-slate-600 mt-1 truncate">
                                                    {planet.drivers[0].label}
                                                    {planet.drivers.length > 1 ? ` · ${planet.drivers[1].label}` : ''}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Political identity */}
                {gov?.ideology && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Compass size={12} className="text-fuchsia-400" /> POLITICAL IDENTITY
                            </span>
                            <span className="font-display text-fuchsia-400">{gov.ideology.label}</span>
                        </div>
                        <div className="space-y-1.5">
                            {IDEOLOGY_AXES.map(([axis, negative, positive]) => {
                                const value = gov.ideology!.axes[axis] ?? 0;
                                return (
                                    <div key={axis} className="flex items-center gap-2">
                                        <span className="text-[9px] font-mono text-slate-600 w-24 text-right shrink-0">{negative}</span>
                                        <div className="flex-1 h-1 bg-slate-950 rounded-full relative">
                                            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700" />
                                            <div
                                                className="absolute inset-y-0 bg-fuchsia-500 rounded-full"
                                                style={{
                                                    left: value >= 0 ? '50%' : `${50 + value / 2}%`,
                                                    width: `${Math.abs(value) / 2}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-[9px] font-mono text-slate-600 w-24 shrink-0">{positive}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Legislature */}
                {(gov?.parties?.length ?? 0) > 0 && (gov!.senatePower ?? 0) >= 40 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                            <Landmark size={12} className="text-indigo-400" /> {gov!.institutionName.toUpperCase()}
                        </div>

                        <div className="flex h-2 rounded-full overflow-hidden mb-3">
                            {gov!.parties.map(party => (
                                <div
                                    key={party.id}
                                    title={`${party.name}: ${party.seats.toFixed(0)}% of seats, stance ${party.stance.toFixed(2)}`}
                                    style={{ width: `${party.seats}%` }}
                                    className={party.stance > 0.2 ? 'bg-emerald-500' : party.stance < -0.2 ? 'bg-rose-500' : 'bg-slate-600'}
                                />
                            ))}
                        </div>

                        {(gov!.bills?.filter(b => b.status === 'pending').length ?? 0) === 0 && (
                            <div className="text-[10px] text-slate-600 font-mono">No legislation before the chamber.</div>
                        )}

                        <div className="space-y-2">
                            {gov!.bills?.filter(b => b.status === 'pending').map(bill => (
                                <div key={bill.id} className="bg-slate-900/30 border border-slate-800/40 rounded-lg p-3">
                                    <div className="flex justify-between items-baseline gap-2">
                                        <span className="text-xs font-display text-slate-200 uppercase tracking-wide">{bill.policyName}</span>
                                        <span className={`text-[10px] font-mono ${bill.projectedSupport >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {Math.round(bill.projectedSupport)}% PROJECTED
                                        </span>
                                    </div>
                                    <div className="h-1 bg-slate-950 rounded-full overflow-hidden mt-2 relative">
                                        <div
                                            className={`h-full ${bill.projectedSupport >= 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                            style={{ width: `${Math.min(100, bill.projectedSupport)}%` }}
                                        />
                                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400/60" />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {gov!.parties.map(party => (
                                            <button
                                                key={party.id}
                                                onClick={() => runLobby(bill.id, party.id)}
                                                disabled={bill.lobbied.includes(party.id) || capital < LOBBY_COST || pending === `${bill.id}:${party.id}`}
                                                title={bill.lobbied.includes(party.id) ? 'Already whipped' : `Whip ${party.name} for ${LOBBY_COST} PC`}
                                                className={`text-[9px] font-display px-2 py-0.5 rounded border uppercase tracking-wider transition-all ${
                                                    bill.lobbied.includes(party.id)
                                                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 cursor-default'
                                                        : capital < LOBBY_COST
                                                            ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                                }`}
                                            >
                                                {party.name} · {party.seats.toFixed(0)}%
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Officer corps */}
                {gov && gov.coupPressure > 15 && (
                    <div className={`rounded-lg border p-4 ${gov.coupPressure >= 80 ? 'border-red-500/50 bg-red-500/5' : gov.coupPressure >= 50 ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900/30'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-display tracking-widest text-slate-300 uppercase flex items-center gap-2">
                                <ShieldCheck size={12} className={gov.coupPressure >= 50 ? 'text-red-400' : 'text-slate-500'} /> Officer Corps
                            </span>
                            <span className={`text-[10px] font-mono ${gov.coupPressure >= 50 ? 'text-red-400' : 'text-slate-500'}`}>
                                COUP PRESSURE {Math.round(gov.coupPressure)}/100
                            </span>
                        </div>
                        <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-700 ${gov.coupPressure >= 80 ? 'bg-red-500' : gov.coupPressure >= 50 ? 'bg-amber-500' : 'bg-slate-600'}`}
                                style={{ width: `${gov.coupPressure}%` }}
                            />
                        </div>
                        <button
                            onClick={runPurge}
                            disabled={capital < PURGE_COST || pending === 'purge'}
                            title={capital >= PURGE_COST ? undefined : `Requires ${PURGE_COST} political capital`}
                            className={`mt-3 w-full py-1.5 rounded text-[9px] font-display uppercase tracking-widest transition-all ${
                                capital < PURGE_COST
                                    ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                    : 'bg-red-600/10 hover:bg-red-600/25 text-red-400 border border-red-500/30'
                            }`}
                        >
                            {pending === 'purge' ? '…' : `Purge suspect commanders · ${PURGE_COST} PC`}
                        </button>
                    </div>
                )}

                {/* Cabinet */}
                {(gov?.cabinet?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Briefcase size={12} className="text-emerald-400" /> CABINET
                            </span>
                            <span className="font-mono text-slate-500">CORRUPTION {Math.round(gov!.corruption)}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {gov!.cabinet.map(minister => (
                                <div key={minister.portfolio} className="bg-slate-900/40 border border-slate-800/60 rounded-lg p-3">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[9px] font-display tracking-widest text-slate-500 uppercase">{minister.portfolioLabel}</div>
                                            <div className="text-xs text-slate-200 truncate">{minister.name}</div>
                                        </div>
                                        <div className="text-[9px] font-mono text-right shrink-0 leading-relaxed">
                                            <span className={minister.competence > 65 ? 'text-emerald-400' : minister.competence < 35 ? 'text-rose-400' : 'text-slate-400'}>
                                                COMP {minister.competence}
                                            </span>
                                            <br />
                                            <span className={minister.loyalty < 30 ? 'text-rose-400' : 'text-slate-400'}>LOY {minister.loyalty}</span>
                                            <br />
                                            <span className={minister.corruption > 50 ? 'text-amber-400' : 'text-slate-600'}>CORR {minister.corruption}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => runDismiss(minister.portfolio)}
                                        disabled={pending === minister.portfolio || capital < DISMISS_COST}
                                        title={capital >= DISMISS_COST ? undefined : `Requires ${DISMISS_COST} political capital`}
                                        className={`mt-2 w-full py-1 rounded text-[9px] font-display uppercase tracking-widest transition-all ${
                                            capital < DISMISS_COST
                                                ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                                : 'bg-rose-600/10 hover:bg-rose-600/25 text-rose-400 border border-rose-500/30'
                                        }`}
                                    >
                                        {pending === minister.portfolio ? '…' : `Dismiss · ${DISMISS_COST} PC`}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Cabinet debate */}
                {(gov?.cabinetAdvice?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                            <MessageSquare size={12} className="text-sky-400" /> CABINET DEBATE
                        </div>
                        <div className="space-y-2">
                            {gov!.cabinetAdvice.map(entry => (
                                <div key={entry.portfolio} className="bg-slate-900/30 border-l-2 border-slate-700 pl-3 py-2">
                                    <div className="flex justify-between items-baseline gap-2">
                                        <span className="text-[10px] font-display text-slate-300 uppercase tracking-wide">
                                            {entry.portfolioLabel} — {entry.ministerName}
                                        </span>
                                        <span
                                            className={`text-[9px] font-mono shrink-0 ${entry.reliability < 40 ? 'text-amber-500' : 'text-slate-600'}`}
                                            title="Competence tempered by what this minister personally stands to gain"
                                        >
                                            RELIABILITY {entry.reliability}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 italic mt-1">“{entry.advice}”</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ambitions & legacy */}
                {(gov?.ambitions?.length ?? 0) > 0 && (
                    <div>
                        <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Trophy size={12} className="text-amber-400" /> AMBITIONS
                            </span>
                            <span className="font-mono text-amber-400">{gov!.legacy?.prestige ?? 0} PRESTIGE</span>
                        </div>
                        <div className="space-y-2">
                            {gov!.ambitions.map(ambition => (
                                <div key={ambition.id} className={`p-3 rounded-lg border ${ambition.completed ? 'bg-amber-900/10 border-amber-500/30' : 'bg-slate-900/30 border-slate-800/40'}`}>
                                    <div className="flex justify-between items-baseline gap-2">
                                        <span className={`text-xs font-display uppercase tracking-wide ${ambition.completed ? 'text-amber-400' : 'text-slate-300'}`}>
                                            {ambition.name}
                                        </span>
                                        <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                            {ambition.completed ? `+${ambition.prestige} PRESTIGE` : `${Math.round(ambition.progress * 100)}%`}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{ambition.description}</p>
                                    <div className="h-1 bg-slate-950 rounded-full overflow-hidden mt-2">
                                        <div
                                            className={`h-full transition-all duration-700 ${ambition.completed ? 'bg-amber-500' : 'bg-slate-600'}`}
                                            style={{ width: `${Math.min(100, ambition.progress * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {Object.keys(gov!.legacy?.bonuses ?? {}).length > 0 && (
                            <div className="mt-3 text-[9px] font-mono text-emerald-600 flex flex-wrap gap-x-3">
                                {Object.entries(gov!.legacy.bonuses).map(([key, value]) => (
                                    <span key={key}>LEGACY {formatEffect(key, value)}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Power Blocs */}
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                        <Users size={12} className="text-indigo-400" /> INSTITUTIONAL POWER BLOCS
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {politicsState?.blocs?.map((bloc) => (
                            <div key={bloc.id} className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 transition-all hover:bg-slate-900/60 group">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="text-xs font-display text-slate-200 uppercase tracking-wide group-hover:text-amber-400 transition-colors">{bloc.name}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">INFLUENCE: {bloc.influence.toFixed(0)}%</div>
                                    </div>
                                    <div className={`text-[10px] font-mono font-bold ${bloc.satisfaction > 70 ? 'text-green-400' : bloc.satisfaction < 40 ? 'text-red-400' : 'text-amber-400'}`}>
                                        {bloc.satisfaction.toFixed(0)}% SATISFIED
                                    </div>
                                </div>
                                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden flex gap-0.5">
                                    <div
                                        className={`h-full transition-all duration-700 ${bloc.satisfaction > 70 ? 'bg-green-500' : bloc.satisfaction < 40 ? 'bg-red-500' : 'bg-amber-500'}`}
                                        style={{ width: `${bloc.satisfaction}%` }}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        updateDiscourse({ activeFactionId: bloc.id });
                                        setActiveTab('discourse');
                                    }}
                                    className="mt-3 w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 rounded text-[9px] font-display uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageSquare size={10} /> Open Direct Discourse
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Policy Enactment */}
                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-400 mb-4 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Zap size={12} className="text-amber-400" /> GOVERNMENT POLICY
                        </span>
                        <span className="font-mono text-sky-400">{Math.floor(capital)} PC AVAILABLE</span>
                    </div>

                    {error && (
                        <div className="mb-3 px-3 py-2 rounded border border-red-500/30 bg-red-500/10 text-[10px] text-red-400 font-mono">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        {(catalog ?? []).map((policy) => {
                            const isActive = activePolicies.includes(policy.id);
                            const cost = isActive ? policy.repealCost : policy.cost;
                            const affordable = capital >= cost;
                            const busy = pending === policy.id;
                            return (
                                <div key={policy.id} className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${isActive ? 'bg-blue-900/10 border-blue-500/30' : 'bg-slate-900/30 border-slate-800/40 hover:border-slate-700'}`}>
                                    <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-500'}`}>
                                        {CATEGORY_ICON[policy.category] ?? <FileText size={14} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-display tracking-wide uppercase flex items-center gap-2 ${isActive ? 'text-blue-400' : 'text-slate-300'}`}>
                                            {policy.name}
                                            {isActive && <CheckCircle size={11} className="text-blue-400" />}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-0.5">{policy.description}</div>
                                        <div className="text-[9px] font-mono text-slate-600 mt-1 flex flex-wrap gap-x-3">
                                            {Object.entries(policy.effects)
                                                .filter(([key]) => key in EFFECT_LABELS)
                                                .map(([key, value]) => (
                                                    <span key={key} className={value >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                                        {formatEffect(key, value)}
                                                    </span>
                                                ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => runPolicyOrder(policy, isActive)}
                                        disabled={busy || !affordable}
                                        title={affordable ? undefined : `Requires ${cost} political capital`}
                                        className={`px-3 py-1.5 rounded text-[10px] font-display transition-all whitespace-nowrap ${
                                            !affordable
                                                ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                                                : isActive
                                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                                        }`}
                                    >
                                        {busy ? '…' : `${isActive ? 'REPEAL' : 'ENACT'} · ${cost} PC`}
                                    </button>
                                </div>
                            );
                        })}
                        {!catalog && (
                            <div className="text-[10px] text-slate-600 font-mono">Loading policy catalog…</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
