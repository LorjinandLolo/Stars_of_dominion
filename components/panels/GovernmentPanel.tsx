import * as React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Scale, Users, CheckCircle, Zap, AlertCircle, FileText, MessageSquare, Landmark, Coins, ShieldCheck, Leaf, Briefcase, Trophy, Compass } from 'lucide-react';
import {
    enactPolicyAction,
    repealPolicyAction,
    getPolicyCatalogAction,
    dismissMinisterAction,
    lobbyPartyAction,
    purgeOfficersAction,
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
