"use client";

import React, { useMemo, useState } from 'react';
import {
    Building2,
    TrendingUp,
    TrendingDown,
    Coins,
    Shield,
    AlertTriangle,
    Globe,
    Activity,
    Plus,
    X,
    Swords,
    Gavel,
    Landmark,
    Scale,
    Users,
    Ban,
    Hammer,
    Briefcase,
    Flame,
} from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { CharterPower } from '@/types/ui-state';
import type {
    CompanySnapshot,
    MarketTicker,
    CorporateDemand,
    CorporateCrisis,
    MegaprojectProposal,
    CorporateMission,
    CorporateRight,
    CorporateStanding,
    OperatingTerritory,
} from '@/types/ui-state';
import {
    MISSION_DEFS,
    TERRITORY_DEFS,
    RIGHT_DEFS,
    RIGHTS_BY_CATEGORY,
    PERSONALITY_DEFS,
} from '@/lib/economy/corporate/charter-catalog';
import { priceCharter, validateCharter, MIN_FOUNDING_CAPITAL } from '@/lib/economy/corporate/charter-service';
import {
    foundCharterAction,
    respondToDemandAction,
    respondToProposalAction,
    resolveCorporateCrisisAction,
    buySharesAction,
    sellSharesAction,
    hostileTakeoverAction,
    setHostPolicyAction,
    nationalizeCompanyAction,
    revokeCharterAction,
    grantRightAction,
    setProfitShareAction,
    subsidizeCompanyAction,
    commandPrivateersAction,
    taxColoniesAction,
} from '@/app/actions/company';

// ─── Shared presentation ──────────────────────────────────────────────────────

const STANDING_STYLE: Record<CorporateStanding, { label: string; color: string; blurb: string }> = {
    instrument: { label: 'STATE INSTRUMENT', color: '#64748b', blurb: 'Does as it is told.' },
    partner: { label: 'STRATEGIC PARTNER', color: '#22c55e', blurb: 'Profitable and cooperative.' },
    power: { label: 'POLITICAL POWER', color: '#f59e0b', blurb: 'Refusing it now costs something.' },
    rival: { label: 'RIVAL ACTOR', color: '#f97316', blurb: 'Pursuing its own foreign policy.' },
    rogue: { label: 'ROGUE CHARTER', color: '#ef4444', blurb: 'No longer recognises the charter.' },
};

function Bar({ label, value, color, max = 100 }: { label: string; value: number; color: string; max?: number }) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[9px] uppercase tracking-tighter">
                <span className="text-slate-500 font-display">{label}</span>
                <span className="font-mono" style={{ color }}>{Math.round(value)}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'rose' | 'emerald' | 'violet' }) {
    const tones: Record<string, string> = {
        slate: 'bg-slate-800/60 text-slate-300 border-slate-700',
        amber: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
        rose: 'bg-rose-950/40 text-rose-300 border-rose-700/50',
        emerald: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50',
        violet: 'bg-violet-950/40 text-violet-300 border-violet-700/50',
    };
    return (
        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-display tracking-wider uppercase ${tones[tone]}`}>
            {children}
        </span>
    );
}

function MarketRow({ m }: { m: MarketTicker }) {
    const pct = ((m.currentPrice - m.basePrice) / m.basePrice) * 100;
    const isUp = pct >= 0;
    const ratio = (m.demand / m.supply);

    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-950/10 border border-slate-700/30 hover:border-emerald-500/30 transition-colors">
            <div className="w-24 text-[10px] font-display tracking-widest text-slate-400">{m.resource}</div>
            <div className={`font-mono text-sm font-bold w-16 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {m.currentPrice.toFixed(1)}cr
            </div>
            <div className={`flex items-center gap-0.5 text-[10px] w-14 ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {isUp ? '+' : ''}{pct.toFixed(1)}%
            </div>
            <div className="flex-1 group relative">
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${ratio > 1.1 ? 'bg-rose-500' : ratio < 0.9 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                        style={{ width: `${Math.min(100, (m.supply / (m.supply + m.demand)) * 200)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Company list card ────────────────────────────────────────────────────────

function CompanyCard({ c, selected, onClick }: { c: CompanySnapshot; selected: boolean; onClick: () => void }) {
    const priceChange = c.sharePrice - c.sharePricePrev;
    const isUp = priceChange >= 0;
    const standing = STANDING_STYLE[c.standing] ?? STANDING_STYLE.instrument;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-lg border p-3 transition-all ${selected
                ? 'bg-amber-950/40 border-amber-600/60'
                : 'bg-slate-900/50 border-slate-700/30 hover:border-slate-600/50'
                }`}
        >
            <div className="flex items-start gap-2 mb-2">
                <Building2 size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-display text-slate-200 truncate uppercase">{c.fullName}</div>
                    <div className="text-[9px] uppercase tracking-tighter" style={{ color: standing.color }}>
                        {standing.label}
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-amber-400">{c.sharePrice.toFixed(2)}cr</div>
                    <div className={`text-[9px] flex items-center justify-end gap-0.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                        {isUp ? '+' : ''}{priceChange.toFixed(2)}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
                <Chip tone="violet">{MISSION_DEFS[c.mission]?.name ?? c.mission}</Chip>
                <Chip>{TERRITORY_DEFS[c.territory]?.name ?? c.territory}</Chip>
                <Chip tone={c.militaryTier >= 4 ? 'rose' : 'slate'}>{c.militaryLabel}</Chip>
                {c.nationalized && <Chip tone="emerald">Nationalised</Chip>}
                {c.hasGoneRogue && <Chip tone="rose">Rogue</Chip>}
            </div>

            <div className="grid grid-cols-4 gap-1 text-[9px]">
                <div><span className="text-slate-500 uppercase">CAP</span><br /><span className="font-mono text-slate-300">{(c.marketCap / 1000).toFixed(0)}K</span></div>
                <div><span className="text-slate-500 uppercase">INFL</span><br /><span className="font-mono text-slate-300">{c.influence}%</span></div>
                <div><span className="text-slate-500 uppercase">LOYAL</span><br /><span className="font-mono text-slate-300">{c.loyalty}%</span></div>
                <div><span className="text-slate-500 uppercase">ASSETS</span><br /><span className="font-mono text-slate-300">{c.assetCount}</span></div>
            </div>
        </button>
    );
}

// ─── Charter-writing wizard ───────────────────────────────────────────────────

const DEFAULT_OWNERSHIP = { government: 40, privateInvestors: 35, foreignInvestors: 15, publicShares: 10 };

function FoundCharterDialog({ onClose, playerFactionId, capitalSystemId, availableCredits, availableCapital }: {
    onClose: () => void;
    playerFactionId: string;
    capitalSystemId: string;
    availableCredits: number;
    availableCapital: number;
}) {
    const [name, setName] = useState('');
    const [mission, setMission] = useState<CorporateMission>('trade');
    const [territory, setTerritory] = useState<OperatingTerritory>('frontier');
    const [rights, setRights] = useState<CorporateRight[]>(['build_infrastructure', 'collect_fees']);
    const [ownership, setOwnership] = useState({ ...DEFAULT_OWNERSHIP });
    const [profitShare, setProfitShare] = useState(0.15);
    const [foundingCapital, setFoundingCapital] = useState(60_000);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const terms = useMemo(() => ({ mission, territory, rights, ownership, profitShareToState: profitShare }), [mission, territory, rights, ownership, profitShare]);
    const price = useMemo(() => priceCharter(terms, foundingCapital), [terms, foundingCapital]);
    const validation = useMemo(() => validateCharter(terms, name, foundingCapital), [terms, name, foundingCapital]);

    const ownershipTotal = ownership.government + ownership.privateInvestors + ownership.foreignInvestors + ownership.publicShares;

    const toggleRight = (r: CorporateRight) => {
        setRights(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
    };

    const setOwn = (key: keyof typeof ownership, value: number) => {
        setOwnership(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, Math.round(value))) }));
    };

    const blocked = validation
        ?? (price.stateCapital > availableCredits
            ? `The treasury cannot subscribe ${price.stateCapital.toLocaleString()}cr for the state's stake.`
            : price.politicalCapital > availableCapital
                ? `This charter costs ${price.politicalCapital} political capital; you have ${Math.floor(availableCapital)}.`
                : null);

    const handleFound = async () => {
        setBusy(true);
        setError(null);
        const result = await foundCharterAction(playerFactionId, name, capitalSystemId, terms, foundingCapital);
        setBusy(false);
        if (result.success) onClose();
        else setError(result.error ?? 'Charter refused.');
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-amber-600/50 rounded-xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
                <div className="px-6 py-4 border-b border-slate-800 bg-amber-950/20 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-display text-sm tracking-widest text-amber-400 uppercase">WRITE A CHARTER</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">You are creating something you will later have to negotiate with.</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">Charter base name</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Astral Frontier"
                            className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm text-slate-200 focus:border-amber-500/50 transition-colors outline-none"
                        />
                        <p className="text-[10px] text-slate-600 italic">Becomes &ldquo;{name || '…'} Charter Company&rdquo;</p>
                    </div>

                    {/* Mission */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">Clause I — Mission</label>
                        <div className="grid grid-cols-4 gap-2">
                            {(Object.values(MISSION_DEFS)).map(def => (
                                <button
                                    key={def.id}
                                    onClick={() => setMission(def.id)}
                                    className={`p-2 rounded-lg border text-left transition-all ${mission === def.id
                                        ? 'bg-violet-950/30 border-violet-500/60'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                                >
                                    <div className={`text-[10px] font-display uppercase ${mission === def.id ? 'text-violet-300' : 'text-slate-400'}`}>{def.name}</div>
                                    <div className="text-[9px] text-slate-600 mt-0.5">×{def.revenueMultiplier.toFixed(2)} revenue</div>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-500 italic">{MISSION_DEFS[mission].description}</p>
                    </div>

                    {/* Territory */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">Clause II — Operating territory</label>
                        <div className="grid grid-cols-5 gap-2">
                            {(Object.values(TERRITORY_DEFS)).map(def => (
                                <button
                                    key={def.id}
                                    onClick={() => setTerritory(def.id)}
                                    className={`p-2 rounded-lg border text-left transition-all ${territory === def.id
                                        ? 'bg-sky-950/30 border-sky-500/60'
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                                >
                                    <div className={`text-[10px] font-display uppercase ${territory === def.id ? 'text-sky-300' : 'text-slate-400'}`}>{def.name}</div>
                                    <div className="text-[9px] text-slate-600 mt-0.5">{def.reachCap} systems · {def.charterCost} PC</div>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-500 italic">{TERRITORY_DEFS[territory].description}</p>
                    </div>

                    {/* Ownership */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">
                            Clause III — Ownership
                            <span className={`ml-2 font-mono ${Math.abs(ownershipTotal - 100) < 0.01 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {ownershipTotal}%
                            </span>
                        </label>
                        <div className="space-y-2">
                            {([
                                ['government', 'Government', 'Control, and the dividends'],
                                ['privateInvestors', 'Private Investors', 'Domestic money; wants returns'],
                                ['foreignInvestors', 'Foreign Investors', 'Outside money; outside interests'],
                                ['publicShares', 'Public Shares', 'Freely traded on the exchange'],
                            ] as const).map(([key, label, hint]) => (
                                <div key={key} className="flex items-center gap-3">
                                    <div className="w-36 shrink-0">
                                        <div className="text-[10px] font-display text-slate-300 uppercase">{label}</div>
                                        <div className="text-[9px] text-slate-600">{hint}</div>
                                    </div>
                                    <input
                                        type="range" min={0} max={100} step={5}
                                        value={ownership[key]}
                                        onChange={e => setOwn(key, Number(e.target.value))}
                                        className="flex-1 accent-amber-500"
                                    />
                                    <div className="w-12 text-right font-mono text-xs text-amber-400">{ownership[key]}%</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rights */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">
                            Clause IV — Rights granted
                            <span className="ml-2 text-slate-600 normal-case tracking-normal italic">More rights, more capable — and more independent.</span>
                        </label>
                        {(['economic', 'military', 'political'] as const).map(category => (
                            <div key={category} className="space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[9px] font-display uppercase tracking-widest text-slate-500">
                                    {category === 'economic' && <Coins size={10} className="text-amber-400" />}
                                    {category === 'military' && <Swords size={10} className="text-rose-400" />}
                                    {category === 'political' && <Landmark size={10} className="text-sky-400" />}
                                    {category} rights
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {RIGHTS_BY_CATEGORY[category].map(rightId => {
                                        const def = RIGHT_DEFS[rightId];
                                        const on = rights.includes(rightId);
                                        return (
                                            <button
                                                key={rightId}
                                                onClick={() => toggleRight(rightId)}
                                                className={`px-2.5 py-2 rounded border text-left transition-all ${on
                                                    ? 'bg-amber-950/30 border-amber-600/50'
                                                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                                            >
                                                <div className="flex justify-between items-baseline gap-2">
                                                    <span className={`text-[10px] font-display uppercase ${on ? 'text-amber-300' : 'text-slate-400'}`}>{def.name}</span>
                                                    <span className="text-[9px] font-mono text-slate-500 shrink-0">{def.charterCost} PC</span>
                                                </div>
                                                <div className="text-[9px] text-slate-600 mt-0.5">{def.description}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Capital + profit share */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">Founding capital</label>
                            <input
                                type="number" min={MIN_FOUNDING_CAPITAL} step={5000}
                                value={foundingCapital}
                                onChange={e => setFoundingCapital(Math.max(0, Number(e.target.value) || 0))}
                                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-amber-500/50"
                            />
                            <p className="text-[9px] text-slate-600">
                                The treasury subscribes {ownership.government}% = <span className="font-mono text-amber-400">{price.stateCapital.toLocaleString()}cr</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-display text-slate-500 block uppercase tracking-widest">
                                Profit returned to the state — {(profitShare * 100).toFixed(0)}%
                            </label>
                            <input
                                type="range" min={0} max={60} step={5}
                                value={Math.round(profitShare * 100)}
                                onChange={e => setProfitShare(Number(e.target.value) / 100)}
                                className="w-full accent-emerald-500"
                            />
                            <p className="text-[9px] text-slate-600">Higher shares are harder to sell to investors, and to keep.</p>
                        </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-[10px] font-display uppercase tracking-widest text-slate-500">Cost to grant</div>
                        <div className="flex gap-4 text-xs font-mono">
                            <span className={price.stateCapital > availableCredits ? 'text-rose-400' : 'text-amber-400'}>
                                {price.stateCapital.toLocaleString()}cr
                            </span>
                            <span className={price.politicalCapital > availableCapital ? 'text-rose-400' : 'text-sky-400'}>
                                {price.politicalCapital} PC
                            </span>
                        </div>
                    </div>

                    {(blocked || error) && (
                        <div className="text-[10px] text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded px-3 py-2">
                            {error ?? blocked}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-800 shrink-0">
                    <button
                        onClick={handleFound}
                        disabled={busy || !!blocked}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-display text-xs tracking-widest py-3 rounded-lg transition-all shadow-lg shadow-amber-900/20"
                    >
                        {busy ? 'GRANTING CHARTER…' : 'GRANT THE CHARTER'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Company detail ───────────────────────────────────────────────────────────

function CompanyDetail({ c, playerFactionId, factionNames, onError }: {
    c: CompanySnapshot;
    playerFactionId: string;
    factionNames: Record<string, string>;
    onError: (msg: string | null) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [shareBlock, setShareBlock] = useState(10_000);
    const [subsidy, setSubsidy] = useState(20_000);
    const [profitShare, setProfitShare] = useState(Math.round((c.profitShareToState ?? 0) * 100));
    const isFounder = c.foundingFactionId === playerFactionId;
    const standing = STANDING_STYLE[c.standing] ?? STANDING_STYLE.instrument;
    const personality = PERSONALITY_DEFS[c.personality];

    const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
        setBusy(key);
        onError(null);
        const res = await fn();
        setBusy(null);
        if (!res.success) onError(res.error ?? 'Order refused.');
    };

    const holderLabel = (holderId: string) => {
        if (holderId === 'class:private_investors') return 'Private Investors';
        if (holderId === 'class:foreign_investors') return 'Foreign Investors';
        if (holderId === 'class:public_shares') return 'Public Float';
        return factionNames[holderId] ?? holderId;
    };

    const ungranted = (Object.values(RIGHT_DEFS)).filter(d => !c.rights.includes(d.id));

    return (
        <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">
            {/* Identity */}
            <div className="p-4 rounded-xl bg-amber-950/10 border border-amber-500/20">
                <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                        <div className="text-lg font-display text-slate-100 uppercase truncate">{c.fullName}</div>
                        <div className="text-[10px] mt-1 font-display tracking-widest uppercase" style={{ color: standing.color }}>
                            {standing.label} — {standing.blurb}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="font-mono text-lg text-amber-400">{c.sharePrice.toFixed(2)}cr</div>
                        <div className="text-[9px] text-slate-500 uppercase">share price</div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                    <Chip tone="violet">{MISSION_DEFS[c.mission]?.name}</Chip>
                    <Chip>{TERRITORY_DEFS[c.territory]?.name}</Chip>
                    <Chip tone="amber">{personality?.name ?? c.personality}</Chip>
                    <Chip tone={c.militaryTier >= 4 ? 'rose' : 'slate'}>Tier {c.militaryTier} · {c.militaryLabel}</Chip>
                </div>
                {personality && (
                    <p className="text-[10px] text-slate-500 italic mt-2">&ldquo;{personality.creed}&rdquo;</p>
                )}
            </div>

            {/* Vitals */}
            <div className="grid grid-cols-2 gap-3">
                {[
                    { label: 'TREASURY', val: `${(c.treasury / 1000).toFixed(1)}K cr`, icon: <Coins size={12} />, color: 'text-amber-400' },
                    { label: 'NET ASSETS', val: `${(c.netAssetValue / 1000).toFixed(1)}K cr`, icon: <Briefcase size={12} />, color: 'text-emerald-400' },
                    { label: 'HOLDINGS', val: `${c.assetCount} (+${c.assetIncomePerTick}/tick)`, icon: <Hammer size={12} />, color: 'text-sky-400' },
                    { label: 'TO THE STATE', val: `${(c.stateRemittanceTotal / 1000).toFixed(1)}K cr`, icon: <Landmark size={12} />, color: 'text-violet-400' },
                    { label: 'PRIVATE FLEET', val: `${c.privateFleetSize}/100`, icon: <Shield size={12} />, color: 'text-rose-400' },
                    { label: 'DEBT', val: `${(c.debt / 1000).toFixed(1)}K cr`, icon: <Scale size={12} />, color: c.debt > 0 ? 'text-orange-400' : 'text-slate-500' },
                ].map(stat => (
                    <div key={stat.label} className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                        <div className={`flex items-center gap-2 text-[10px] font-display uppercase tracking-widest mb-1 ${stat.color}`}>
                            {stat.icon} {stat.label}
                        </div>
                        <div className="text-sm font-mono text-slate-200">{stat.val}</div>
                    </div>
                ))}
            </div>

            {/* Political meters */}
            <div className="grid grid-cols-2 gap-4">
                <Bar label="Influence" value={c.influence} color="#a78bfa" />
                <Bar label="Loyalty" value={c.loyalty} color="#22c55e" />
                <Bar label="Autonomy" value={c.autonomyLevel} color="#f97316" />
                <Bar label="Corruption" value={c.corruptionIndex} color="#f43f5e" />
            </div>

            {/* Cap table */}
            <div className="space-y-2">
                <div className="text-[10px] font-display text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Users size={11} /> Shareholders
                    <span className="ml-auto normal-case tracking-normal text-slate-600">
                        Board: {holderLabel(c.boardHolderId)} {c.boardMajority ? '(majority)' : '(plurality)'}
                    </span>
                </div>
                <div className="space-y-1">
                    {c.ownership.map(row => (
                        <div key={row.holderId} className="flex items-center gap-2">
                            <div className="w-40 text-[10px] text-slate-400 truncate">{holderLabel(row.holderId)}</div>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full"
                                    style={{
                                        width: `${row.percent}%`,
                                        backgroundColor: row.kind === 'government' ? '#38bdf8' : row.kind === 'foreign' ? '#f97316' : '#64748b',
                                    }}
                                />
                            </div>
                            <div className="w-12 text-right font-mono text-[10px] text-slate-300">{row.percent.toFixed(1)}%</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Charter terms */}
            <div className="space-y-2">
                <div className="text-[10px] font-display text-slate-500 uppercase tracking-widest">Rights granted</div>
                <div className="flex flex-wrap gap-1">
                    {c.rights.length === 0 && <span className="text-[10px] text-slate-600 italic">None — a company in name only.</span>}
                    {c.rights.map(r => (
                        <Chip key={r} tone={RIGHT_DEFS[r]?.category === 'military' ? 'rose' : RIGHT_DEFS[r]?.category === 'political' ? 'violet' : 'amber'}>
                            {RIGHT_DEFS[r]?.name ?? r}
                        </Chip>
                    ))}
                </div>
            </div>

            {/* Autonomous decisions */}
            {c.recentActions.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[10px] font-display text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Activity size={11} /> What it did without asking
                    </div>
                    <div className="space-y-1">
                        {c.recentActions.map((a, i) => (
                            <div key={`${a.timestamp}-${i}`} className="text-[10px] text-slate-400 bg-slate-900/60 border border-slate-800 rounded px-2.5 py-1.5">
                                {a.summary}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Equity actions — available to any empire */}
            <div className="space-y-2">
                <div className="text-[10px] font-display text-slate-500 uppercase tracking-widest">Equity</div>
                <div className="flex items-center gap-2">
                    <input
                        type="number" min={0} step={1000} value={shareBlock}
                        onChange={e => setShareBlock(Math.max(0, Number(e.target.value) || 0))}
                        className="w-32 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500/50"
                    />
                    <button
                        onClick={() => run('buy', () => buySharesAction(playerFactionId, c.id, shareBlock))}
                        disabled={busy === 'buy' || c.availableFloat <= 0}
                        className="flex-1 px-3 py-1.5 rounded bg-emerald-950/30 border border-emerald-600/40 text-emerald-300 text-[10px] font-display tracking-widest uppercase hover:bg-emerald-950/50 disabled:opacity-40"
                    >
                        Buy ({c.availableFloat.toLocaleString()} on offer)
                    </button>
                    <button
                        onClick={() => run('sell', () => sellSharesAction(playerFactionId, c.id, shareBlock))}
                        disabled={busy === 'sell' || c.playerShares <= 0}
                        className="flex-1 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-display tracking-widest uppercase hover:border-slate-500 disabled:opacity-40"
                    >
                        Sell (hold {c.playerPercent.toFixed(1)}%)
                    </button>
                </div>
                <button
                    onClick={() => run('takeover', () => hostileTakeoverAction(playerFactionId, c.id))}
                    disabled={busy === 'takeover' || c.nationalized}
                    className="w-full px-3 py-2 rounded bg-rose-950/20 border border-rose-600/40 text-rose-300 text-[10px] font-display tracking-widest uppercase hover:bg-rose-950/40 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                    <Flame size={12} /> Hostile takeover — bid for control
                </button>
            </div>

            {/* Sovereign actions — founder only */}
            {isFounder && (
                <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="text-[10px] font-display text-slate-500 uppercase tracking-widest">Charter powers</div>

                    <div className="flex items-center gap-2">
                        <div className="w-40 text-[10px] text-slate-400 uppercase">State profit share</div>
                        <input
                            type="range" min={0} max={60} step={5} value={profitShare}
                            onChange={e => setProfitShare(Number(e.target.value))}
                            className="flex-1 accent-emerald-500"
                        />
                        <div className="w-10 text-right font-mono text-[10px] text-emerald-400">{profitShare}%</div>
                        <button
                            onClick={() => run('share', () => setProfitShareAction(playerFactionId, c.id, profitShare / 100))}
                            disabled={busy === 'share'}
                            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
                        >
                            Set
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="w-40 text-[10px] text-slate-400 uppercase">Subsidy</div>
                        <input
                            type="number" min={0} step={5000} value={subsidy}
                            onChange={e => setSubsidy(Math.max(0, Number(e.target.value) || 0))}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200 outline-none focus:border-amber-500/50"
                        />
                        <button
                            onClick={() => run('subsidy', () => subsidizeCompanyAction(playerFactionId, c.id, subsidy))}
                            disabled={busy === 'subsidy'}
                            className="px-2.5 py-1 rounded bg-emerald-950/30 border border-emerald-600/40 text-[10px] text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-40"
                        >
                            Pay
                        </button>
                    </div>

                    {ungranted.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[10px] text-slate-500 uppercase">Amend the charter — grant a right</div>
                            <div className="flex flex-wrap gap-1">
                                {ungranted.slice(0, 8).map(def => (
                                    <button
                                        key={def.id}
                                        onClick={() => run(`grant-${def.id}`, () => grantRightAction(playerFactionId, c.id, def.id))}
                                        disabled={busy === `grant-${def.id}`}
                                        className="px-2 py-1 rounded border border-slate-700 bg-slate-900 text-[9px] font-display uppercase tracking-wider text-slate-300 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-40"
                                    >
                                        + {def.name} <span className="text-slate-500">({def.charterCost} PC)</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        {c.powers.includes(CharterPower.PARAMILITARY) && (
                            <button
                                onClick={() => run('privateers', () => commandPrivateersAction(c.id, playerFactionId))}
                                disabled={busy === 'privateers'}
                                className="px-3 py-2 rounded bg-rose-950/20 border border-rose-500/30 text-rose-300 text-[10px] font-display uppercase tracking-wider hover:bg-rose-950/40 disabled:opacity-40"
                            >
                                Command privateers
                            </button>
                        )}
                        {c.powers.includes(CharterPower.GOVERNANCE) && (
                            <button
                                onClick={() => run('tax', () => taxColoniesAction(c.id, playerFactionId))}
                                disabled={busy === 'tax'}
                                className="px-3 py-2 rounded bg-blue-950/20 border border-blue-500/30 text-blue-300 text-[10px] font-display uppercase tracking-wider hover:bg-blue-950/40 disabled:opacity-40"
                            >
                                Tax corporate colonies
                            </button>
                        )}
                        <button
                            onClick={() => run('nationalize', () => nationalizeCompanyAction(playerFactionId, c.id))}
                            disabled={busy === 'nationalize' || c.nationalized}
                            className="px-3 py-2 rounded bg-violet-950/20 border border-violet-500/30 text-violet-300 text-[10px] font-display uppercase tracking-wider hover:bg-violet-950/40 disabled:opacity-40"
                        >
                            Nationalise
                        </button>
                        <button
                            onClick={() => run('revoke', () => revokeCharterAction(playerFactionId, c.id))}
                            disabled={busy === 'revoke' || c.charterRevocationPending}
                            className="px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-display uppercase tracking-wider hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40"
                        >
                            {c.charterRevocationPending ? 'Revocation pending' : 'Revoke charter'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Boardroom: demands, crises, megaprojects ─────────────────────────────────

function DemandCard({ d, companyName, playerFactionId, onError }: {
    d: CorporateDemand; companyName: string; playerFactionId: string; onError: (m: string | null) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const run = async (response: 'accept' | 'reject' | 'negotiate') => {
        setBusy(response);
        onError(null);
        const res = await respondToDemandAction(playerFactionId, d.id, response);
        setBusy(null);
        if (!res.success) onError(res.error ?? 'Response refused.');
    };
    return (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4 space-y-3">
            <div className="flex items-start gap-2">
                <Gavel size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <div className="text-[10px] font-display uppercase tracking-widest text-amber-400">{companyName}</div>
                    <p className="text-sm text-slate-200 italic mt-1">&ldquo;{d.text}&rdquo;</p>
                </div>
                <div className="ml-auto shrink-0">
                    <Chip tone={d.severity >= 3 ? 'rose' : d.severity === 2 ? 'amber' : 'slate'}>
                        {'★'.repeat(d.severity)}
                    </Chip>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-slate-950/60 border border-slate-800 rounded p-2">
                    <div className="text-emerald-500 font-display uppercase tracking-wider mb-0.5">If granted</div>
                    <div className="text-slate-400">{d.concession}</div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded p-2">
                    <div className="text-rose-500 font-display uppercase tracking-wider mb-0.5">If refused</div>
                    <div className="text-slate-400">{d.threat}</div>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <button onClick={() => run('accept')} disabled={!!busy}
                    className="px-3 py-2 rounded bg-emerald-950/30 border border-emerald-600/40 text-emerald-300 text-[10px] font-display uppercase tracking-widest hover:bg-emerald-950/50 disabled:opacity-40">
                    Grant
                </button>
                <button onClick={() => run('negotiate')} disabled={!!busy}
                    className="px-3 py-2 rounded bg-sky-950/30 border border-sky-600/40 text-sky-300 text-[10px] font-display uppercase tracking-widest hover:bg-sky-950/50 disabled:opacity-40">
                    Negotiate
                </button>
                <button onClick={() => run('reject')} disabled={!!busy}
                    className="px-3 py-2 rounded bg-rose-950/30 border border-rose-600/40 text-rose-300 text-[10px] font-display uppercase tracking-widest hover:bg-rose-950/50 disabled:opacity-40">
                    Refuse
                </button>
            </div>
        </div>
    );
}

function CrisisCard({ c, companyName, playerFactionId, onError }: {
    c: CorporateCrisis; companyName: string; playerFactionId: string; onError: (m: string | null) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const run = async (optionId: string) => {
        setBusy(optionId);
        onError(null);
        const res = await resolveCorporateCrisisAction(playerFactionId, c.id, optionId);
        setBusy(null);
        if (!res.success) onError(res.error ?? 'Response refused.');
    };
    return (
        <div className="rounded-lg border border-rose-700/40 bg-rose-950/10 p-4 space-y-3">
            <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-rose-400 mt-0.5 shrink-0" />
                <div>
                    <div className="text-[10px] font-display uppercase tracking-widest text-rose-400">{companyName}</div>
                    <div className="text-sm font-display text-slate-100 uppercase mt-0.5">{c.headline}</div>
                    <p className="text-[11px] text-slate-400 mt-1">{c.description}</p>
                </div>
            </div>
            <div className="space-y-1.5">
                {c.options.map(o => (
                    <button
                        key={o.id}
                        onClick={() => run(o.id)}
                        disabled={!!busy}
                        className="w-full text-left px-3 py-2 rounded bg-slate-950/60 border border-slate-800 hover:border-rose-500/40 transition-all disabled:opacity-40"
                    >
                        <div className="flex justify-between items-baseline gap-2">
                            <span className="text-[11px] font-display text-slate-200 uppercase tracking-wider">{o.label}</span>
                            <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                {o.creditCost ? `${o.creditCost.toLocaleString()}cr ` : ''}
                                {o.politicalCapitalCost ? `${o.politicalCapitalCost} PC` : ''}
                            </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{o.description}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function MegaprojectCard({ p, companyName, playerFactionId, onError }: {
    p: MegaprojectProposal; companyName: string; playerFactionId: string; onError: (m: string | null) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const run = async (response: 'approve' | 'delay' | 'modify' | 'reject') => {
        setBusy(response);
        onError(null);
        const res = await respondToProposalAction(playerFactionId, p.id, response);
        setBusy(null);
        if (!res.success) onError(res.error ?? 'Response refused.');
    };
    const stateCost = Math.round(p.totalCost * p.stateShare);
    const live = p.status === 'proposed' || p.status === 'delayed';

    return (
        <div className="rounded-lg border border-sky-700/40 bg-sky-950/10 p-4 space-y-3">
            <div className="flex items-start gap-2">
                <Hammer size={14} className="text-sky-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <div className="text-[10px] font-display uppercase tracking-widest text-sky-400">{companyName}</div>
                    <div className="text-sm font-display text-slate-100 uppercase mt-0.5">{p.name}</div>
                    <p className="text-[11px] text-slate-400 mt-1">{p.description}</p>
                    <p className="text-[10px] text-emerald-400/80 mt-1">{p.benefit}</p>
                </div>
                <div className="ml-auto text-right shrink-0">
                    <div className="font-mono text-xs text-amber-400">{(p.totalCost / 1000).toFixed(0)}K cr</div>
                    <div className="text-[9px] text-slate-500 uppercase">state share {(p.stateShare * 100).toFixed(0)}%</div>
                </div>
            </div>

            {p.status === 'building' && (
                <div className="space-y-1">
                    <div className="flex justify-between text-[9px] uppercase text-slate-500">
                        <span>Under construction</span>
                        <span className="font-mono text-sky-400">{Math.round(p.progress * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 transition-all duration-700" style={{ width: `${p.progress * 100}%` }} />
                    </div>
                </div>
            )}
            {p.status === 'complete' && (
                <div className="text-[10px] font-display uppercase tracking-widest text-emerald-400">Complete</div>
            )}

            {live && (
                <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => run('approve')} disabled={!!busy}
                        className="px-2 py-2 rounded bg-emerald-950/30 border border-emerald-600/40 text-emerald-300 text-[10px] font-display uppercase tracking-widest hover:bg-emerald-950/50 disabled:opacity-40">
                        Approve
                    </button>
                    <button onClick={() => run('modify')} disabled={!!busy}
                        className="px-2 py-2 rounded bg-amber-950/30 border border-amber-600/40 text-amber-300 text-[10px] font-display uppercase tracking-widest hover:bg-amber-950/50 disabled:opacity-40">
                        Modify
                    </button>
                    <button onClick={() => run('delay')} disabled={!!busy}
                        className="px-2 py-2 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[10px] font-display uppercase tracking-widest hover:border-slate-500 disabled:opacity-40">
                        Delay
                    </button>
                    <button onClick={() => run('reject')} disabled={!!busy}
                        className="px-2 py-2 rounded bg-rose-950/30 border border-rose-600/40 text-rose-300 text-[10px] font-display uppercase tracking-widest hover:bg-rose-950/50 disabled:opacity-40">
                        Reject
                    </button>
                </div>
            )}
            {live && (
                <p className="text-[9px] text-slate-600">
                    Approving costs the treasury {stateCost.toLocaleString()}cr. Modifying halves that and slows the build.
                </p>
            )}
        </div>
    );
}

// ─── Foreign operations ───────────────────────────────────────────────────────

function ForeignCompanyRow({ c, playerFactionId, stance, onError }: {
    c: CompanySnapshot; playerFactionId: string; stance: string | undefined; onError: (m: string | null) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const run = async (next: 'allowed' | 'restricted' | 'taxed' | 'banned' | 'nationalized') => {
        setBusy(next);
        onError(null);
        const res = await setHostPolicyAction(playerFactionId, c.id, next, next === 'taxed' ? 0.2 : 0);
        setBusy(null);
        if (!res.success) onError(res.error ?? 'Policy refused.');
    };
    return (
        <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
                <Globe size={13} className="text-orange-400 shrink-0" />
                <div className="min-w-0">
                    <div className="text-xs font-display text-slate-200 uppercase truncate">{c.fullName}</div>
                    <div className="text-[9px] text-slate-500 uppercase">
                        {MISSION_DEFS[c.mission]?.name} · influence {c.influence}% · {c.militaryLabel}
                    </div>
                </div>
                <div className="ml-auto shrink-0">
                    <Chip tone={stance === 'banned' || stance === 'nationalized' ? 'rose' : stance === 'taxed' ? 'amber' : 'slate'}>
                        {stance ?? 'allowed'}
                    </Chip>
                </div>
            </div>
            <div className="grid grid-cols-5 gap-1">
                {(['allowed', 'restricted', 'taxed', 'banned', 'nationalized'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => run(s)}
                        disabled={!!busy || stance === s}
                        className={`px-1.5 py-1.5 rounded border text-[9px] font-display uppercase tracking-wider transition-all disabled:opacity-40 ${
                            s === 'banned' || s === 'nationalized'
                                ? 'bg-rose-950/20 border-rose-700/40 text-rose-300 hover:bg-rose-950/40'
                                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                    >
                        {s === 'nationalized' ? 'Seize' : s}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

type Tab = 'market' | 'charters' | 'boardroom' | 'foreign';

export default function CorporateLedgerPanel() {
    const { corporateState, playerFactionId, factions, politicsState } = useUIStore();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('charters');
    const [showFoundDialog, setShowFoundDialog] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const companies = corporateState.companies;
    const selected = companies.find(c => c.id === selectedId) ?? null;
    const factionRecord = (factions as Record<string, any>) ?? {};
    const capitalSystemId = playerFactionId ? factionRecord[playerFactionId]?.capitalSystemId ?? '' : '';
    const factionNames = useMemo(() => {
        const out: Record<string, string> = {};
        for (const [id, f] of Object.entries(factionRecord)) out[id] = (f as any)?.name ?? id;
        return out;
    }, [factionRecord]);

    const companyName = (id: string) => companies.find(c => c.id === id)?.fullName ?? id;
    const inboxCount = corporateState.demands.length + corporateState.crises.length
        + corporateState.megaprojects.filter(p => p.status === 'proposed' || p.status === 'delayed').length;
    const foreign = companies.filter(c => corporateState.foreignCompanyIds.includes(c.id));
    const stanceFor = (companyId: string) =>
        corporateState.hostPolicies.find(p => p.companyId === companyId)?.stance;

    const availableCapital = politicsState?.government?.politicalCapital ?? 0;
    // Credits come off the synced faction record — the same source the top-bar
    // ledger reads. playerState.credits exists on the store but nothing ever
    // writes to it, so reading it here would price every charter as unaffordable.
    const availableCredits = playerFactionId
        ? ((factionRecord[playerFactionId] as any)?.reserves?.CREDITS ?? 0)
        : 0;

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/50 backdrop-blur-xl">
            {showFoundDialog && playerFactionId && (
                <FoundCharterDialog
                    onClose={() => setShowFoundDialog(false)}
                    playerFactionId={playerFactionId}
                    capitalSystemId={capitalSystemId}
                    availableCredits={availableCredits}
                    availableCapital={availableCapital}
                />
            )}

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700/40 flex justify-between items-center bg-slate-900/20 shrink-0">
                <div>
                    <h2 className="font-display text-sm tracking-widest text-amber-400 flex items-center gap-2 uppercase">
                        <Activity size={14} /> CHARTER CORPORATIONS
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tighter">
                        Remitted to the treasury: {corporateState.stateRemittanceTotal.toLocaleString()}cr ·
                        Portfolio {Math.round(corporateState.playerPortfolioValue).toLocaleString()}cr
                    </p>
                </div>
                <button
                    onClick={() => setShowFoundDialog(true)}
                    className="flex items-center gap-2 bg-amber-600/10 border border-amber-500/30 hover:bg-amber-600/20 px-4 py-2 rounded-lg text-amber-400 font-display text-[10px] tracking-widest transition-all"
                >
                    <Plus size={12} /> WRITE A CHARTER
                </button>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-slate-700/40 px-6 bg-slate-900/10 shrink-0">
                {([
                    ['charters', 'CHARTERED ENTITIES'],
                    ['boardroom', `BOARDROOM${inboxCount > 0 ? ` (${inboxCount})` : ''}`],
                    ['foreign', `FOREIGN OPERATIONS${foreign.length > 0 ? ` (${foreign.length})` : ''}`],
                    ['market', 'COMMODITY MARKET'],
                ] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id as Tab)}
                        className={`py-3 px-5 text-[10px] font-display tracking-widest transition-colors border-b-2 -mb-px uppercase ${tab === id
                            ? 'text-amber-400 border-amber-400'
                            : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mx-6 mt-3 text-[10px] text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded px-3 py-2 shrink-0">
                    {error}
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {tab === 'market' && (
                    <div className="p-6 space-y-3">
                        <div className="flex justify-between items-center mb-4">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-1 uppercase">
                                <Globe size={10} /> LIVE TICKER — AGGREGATED PRODUCTION FLOWS
                            </div>
                            <div className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/20">
                                DIVIDENDS: +{Math.round(corporateState.totalDividendsReceived).toLocaleString()}cr
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {corporateState.markets.map(m => <MarketRow key={m.resource} m={m} />)}
                        </div>
                    </div>
                )}

                {tab === 'charters' && (
                    <div className="flex gap-0 h-full">
                        <div className="w-1/2 border-r border-slate-800/80 p-4 space-y-3 overflow-y-auto custom-scrollbar">
                            {companies.length === 0 && (
                                <div className="text-center text-slate-600 text-[11px] py-12">
                                    No charters have been granted in this galaxy yet.
                                </div>
                            )}
                            {companies.map(c => (
                                <CompanyCard
                                    key={c.id}
                                    c={c}
                                    selected={selectedId === c.id}
                                    onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                                />
                            ))}
                        </div>

                        <div className="w-1/2 p-6 overflow-y-auto bg-slate-900/10">
                            {selected && playerFactionId ? (
                                <CompanyDetail
                                    c={selected}
                                    playerFactionId={playerFactionId}
                                    factionNames={factionNames}
                                    onError={setError}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs">
                                    <Activity size={32} className="mb-4 opacity-10 animate-pulse" />
                                    <div className="font-display tracking-widest uppercase opacity-40">AWAITING ENTITY SELECTION</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'boardroom' && playerFactionId && (
                    <div className="p-6 space-y-6">
                        {inboxCount === 0 && corporateState.megaprojects.length === 0 && (
                            <div className="text-center text-slate-600 text-[11px] py-12">
                                Nothing on the desk. Your charters are content — for now.
                            </div>
                        )}

                        {corporateState.crises.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-[10px] font-display uppercase tracking-widest text-rose-400">Crises</div>
                                {corporateState.crises.map(c => (
                                    <CrisisCard key={c.id} c={c} companyName={companyName(c.companyId)}
                                        playerFactionId={playerFactionId} onError={setError} />
                                ))}
                            </div>
                        )}

                        {corporateState.demands.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-[10px] font-display uppercase tracking-widest text-amber-400">Lobbying</div>
                                {corporateState.demands.map(d => (
                                    <DemandCard key={d.id} d={d} companyName={companyName(d.companyId)}
                                        playerFactionId={playerFactionId} onError={setError} />
                                ))}
                            </div>
                        )}

                        {corporateState.megaprojects.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-[10px] font-display uppercase tracking-widest text-sky-400">Megaprojects</div>
                                {corporateState.megaprojects.map(p => (
                                    <MegaprojectCard key={p.id} p={p} companyName={companyName(p.companyId)}
                                        playerFactionId={playerFactionId} onError={setError} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tab === 'foreign' && playerFactionId && (
                    <div className="p-6 space-y-4">
                        <p className="text-[10px] text-slate-500">
                            Companies chartered elsewhere that operate inside your borders. Taxing them earns credits;
                            banning or seizing them earns something else.
                        </p>
                        {foreign.length === 0 && (
                            <div className="text-center text-slate-600 text-[11px] py-12 flex flex-col items-center gap-3">
                                <Ban size={28} className="opacity-20" />
                                No foreign charter operates in your space.
                            </div>
                        )}
                        {foreign.map(c => (
                            <ForeignCompanyRow key={c.id} c={c} playerFactionId={playerFactionId}
                                stance={stanceFor(c.id)} onError={setError} />
                        ))}

                        {corporateState.rivalries.length > 0 && (
                            <div className="pt-4 border-t border-slate-800 space-y-2">
                                <div className="text-[10px] font-display uppercase tracking-widest text-slate-500">Commercial rivalries</div>
                                {corporateState.rivalries.map(r => (
                                    <div key={r.id} className="flex items-center gap-2 text-[10px] text-slate-400">
                                        <Swords size={11} className={r.priceWar ? 'text-rose-400' : 'text-slate-600'} />
                                        <span className="truncate">{companyName(r.companyAId)}</span>
                                        <span className="text-slate-600">vs</span>
                                        <span className="truncate">{companyName(r.companyBId)}</span>
                                        <span className="ml-auto font-mono" style={{ color: r.priceWar ? '#f43f5e' : '#94a3b8' }}>
                                            {r.intensity}%{r.priceWar ? ' · price war' : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
