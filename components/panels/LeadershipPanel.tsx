"use client";

// components/panels/LeadershipPanel.tsx
// Stars of Dominion — the people who run the empire.
//
// Head of state, the six cabinet ministers, each world's governor, and the
// bench of candidates they are drawn from (lib/leadership/leadership-view.ts,
// built from the synced world). Every one of them is a character: a career
// they came up through, a temperament, a skill tier from Novice to Legendary
// and a potential they grow toward in office (lib/leadership/character.ts).
// Ministers and governors can be replaced from the bench and ministers
// dismissed, through the worker's own orders (GOV_APPOINT_MINISTER,
// GOV_DISMISS_MINISTER, GOV_APPOINT_GOVERNOR), which charge political capital.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Crown, Globe, UserPlus, X, Landmark, Users, TrendingUp, Star, Check } from 'lucide-react';
import { getSyncedWorld } from '@/hooks/useGameSync';
import {
    buildLeadershipView, traitLabel, LEADERSHIP_COSTS, SEAT_FIT_BONUS,
    type LeadershipView, type PersonView,
} from '@/lib/leadership/leadership-view';
import { skillTier } from '@/lib/leadership/character';
import { dispatchOrder } from '@/lib/multiplayer/order-client';

type Picking = { kind: 'minister'; portfolio: string; label: string } | { kind: 'governor'; planetId: string; label: string } | null;

// ─── Small pieces ────────────────────────────────────────────────────────────

/** A stable colour per person, for the portrait. */
function portraitHue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
}

function Portrait({ p, size = 44 }: { p: PersonView; size?: number }) {
    const hue = portraitHue(p.id);
    return (
        <div
            className="relative shrink-0 rounded-xl flex items-center justify-center font-display text-white/90 border border-white/10"
            style={{
                width: size, height: size, fontSize: size * 0.34,
                background: `linear-gradient(145deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 16%))`,
            }}
            aria-hidden="true"
        >
            {p.initials}
        </div>
    );
}

const TIER_STYLE: Record<number, string> = {
    1: 'text-slate-400 border-slate-600/60 bg-slate-800/60',
    2: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
    3: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
    4: 'text-violet-300 border-violet-500/40 bg-violet-500/10',
    5: 'text-amber-300 border-amber-400/60 bg-amber-500/15',
};

function TierBadge({ rank, label, title }: { rank: number; label: string; title?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${TIER_STYLE[rank]}`} title={title}>
            <span className="flex">
                {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={8} className={i < rank ? 'fill-current' : 'opacity-25'} />
                ))}
            </span>
            {label}
        </span>
    );
}

const TONE: Record<string, string> = {
    good: 'text-emerald-300 bg-emerald-500/10',
    neutral: 'text-slate-300 bg-slate-700/50',
    risk: 'text-red-300 bg-red-500/10',
};

function Meter({ label, value, good = 'high' }: { label: string; value: number; good?: 'high' | 'low' }) {
    const score = good === 'high' ? value : 100 - value;
    const color = score >= 65 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="min-w-0" title={`${label} ${value}`}>
            <div className="flex justify-between text-[9px] uppercase tracking-wider text-slate-500">
                <span>{label}</span>
                <span className="font-mono text-slate-300">{value}</span>
            </div>
            <div className="h-1 rounded-full bg-slate-800 overflow-hidden mt-0.5">
                <div className={`h-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
            </div>
        </div>
    );
}

/** One person: portrait, tier, career, temperament, growth, loyalty and honesty. */
function PersonCard({ p, fitNote, compact = false }: { p: PersonView; fitNote?: string | null; compact?: boolean }) {
    const growing = p.potentialTier.rank > p.tier.rank;
    return (
        <div className="space-y-2">
            <div className="flex items-start gap-3">
                <Portrait p={p} size={compact ? 36 : 44} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-100 truncate">{p.name}</span>
                        <TierBadge rank={p.tier.rank} label={p.tier.label} title={`Skill ${p.competence}`} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-slate-400">{p.background.label}</span>
                        <span className={`text-[10px] px-1.5 py-px rounded ${TONE[p.temperament.tone]}`} title={p.temperament.line}>
                            {p.temperament.label}
                        </span>
                    </div>
                    {!compact && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{p.bio} {p.temperament.line}</p>}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                {growing ? (
                    <span className="flex items-center gap-1 text-emerald-300/90">
                        <TrendingUp size={11} /> Growing in office · can reach {p.potentialTier.label}
                    </span>
                ) : (
                    <span className="text-slate-500">At their peak</span>
                )}
                {fitNote && (
                    <span className="flex items-center gap-1 text-sky-300/90">
                        <Check size={11} /> {fitNote}
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Meter label="Loyalty" value={p.loyalty} />
                <Meter label="Corruption" value={p.corruption} good="low" />
            </div>
            {p.traits.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {p.traits.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{traitLabel(t)}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.2em] uppercase text-slate-500">{icon}{title}</h3>
                {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
            </div>
            {children}
        </section>
    );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function LeadershipPanel() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const syncTick = useUIStore(s => s.planets);
    const [view, setView] = React.useState<LeadershipView | null>(null);
    const [picking, setPicking] = React.useState<Picking>(null);
    const [busy, setBusy] = React.useState<string | null>(null);

    React.useEffect(() => {
        const world = getSyncedWorld();
        if (world && playerFactionId) setView(buildLeadershipView(world, playerFactionId));
    }, [syncTick, playerFactionId]);

    const order = async (key: string, actionId: string, payload: Record<string, unknown>, label: string) => {
        if (!playerFactionId) return;
        setBusy(key);
        try {
            await dispatchOrder({ actionId, factionId: playerFactionId, payload, label });
            setPicking(null);
        } finally {
            setBusy(null);
        }
    };

    if (!view) {
        return <div className="h-full flex items-center justify-center text-xs text-slate-500">Reading the court…</div>;
    }

    const pc = view.politicalCapital;

    /** Whether a candidate's career suits what they are being picked for. */
    const suits = (c: PersonView): boolean => !!picking && (picking.kind === 'minister'
        ? c.background.fits.includes(picking.portfolio)
        : c.background.governs);

    const Picker = () => {
        if (!picking) return null;
        const cost = picking.kind === 'minister' ? LEADERSHIP_COSTS.appointMinister : LEADERSHIP_COSTS.appointGovernor;
        // Best for THIS post first: a fitting career, then the higher tier.
        const ranked = [...view.candidates].sort((a, b) =>
            Number(suits(b)) - Number(suits(a)) || b.competence - a.competence);
        return (
            <div className="mt-2 rounded-lg border border-sky-500/30 bg-slate-950/80 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-sky-200">Who takes {picking.label}? · {cost} political capital</span>
                    <button onClick={() => setPicking(null)} aria-label="Cancel" className="text-slate-500 hover:text-slate-200"><X size={13} /></button>
                </div>
                {ranked.length === 0 && <p className="text-[11px] text-slate-500">Nobody is waiting on the bench right now.</p>}
                {ranked.map(c => (
                    <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 space-y-2">
                        <PersonCard
                            p={c}
                            compact
                            fitNote={suits(c) ? (picking.kind === 'minister' ? `Career fits the seat · +${SEAT_FIT_BONUS} skill` : 'Has run a world before') : null}
                        />
                        <button
                            disabled={busy !== null || pc < cost}
                            onClick={() => picking.kind === 'minister'
                                ? order(`appoint-${c.id}`, 'GOV_APPOINT_MINISTER', { portfolio: picking.portfolio, leaderId: c.id }, `Appointing ${c.name} to ${picking.label}`)
                                : order(`appoint-${c.id}`, 'GOV_APPOINT_GOVERNOR', { planetId: picking.planetId, leaderId: c.id }, `Appointing ${c.name} governor of ${picking.label}`)}
                            className="w-full py-1.5 rounded-md bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-[11px] text-sky-100 font-semibold disabled:opacity-40"
                        >
                            {busy === `appoint-${c.id}` ? 'Appointing…' : pc < cost ? `Needs ${cost} political capital` : `Appoint ${c.name.split(' ')[0]}`}
                        </button>
                    </div>
                ))}
            </div>
        );
    };

    const hos = view.headOfState;
    const statecraft = hos ? skillTier(hos.politicalSkill ?? 50) : null;

    return (
        <div className="flex flex-col h-full text-slate-200">
            <div className="px-6 py-4 border-b border-white/5">
                <h2 className="font-display text-sm tracking-widest text-indigo-300 flex items-center gap-2">
                    <Users size={16} /> LEADERSHIP
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                    The people who run your empire. They grow into their posts over time, up to what they have in them.
                    Appointments cost political capital; you have <span className="font-mono text-slate-300">{pc}</span>.
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map(rank => {
                        const t = skillTier([0, 0, 35, 55, 70, 85][rank]);
                        return <TierBadge key={rank} rank={t.rank} label={t.label} />;
                    })}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Head of state */}
                {hos && statecraft && (
                    <Section icon={<Crown size={11} />} title="Head of state">
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
                            <div className="flex items-start gap-3">
                                <Portrait p={hos} size={52} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[10px] uppercase tracking-wider text-amber-400/80">{hos.title ?? 'Head of State'}</div>
                                    <div className="text-base font-semibold text-white truncate">{hos.name}</div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <TierBadge rank={statecraft.rank} label={`${statecraft.label} statesman`} title={`Political skill ${hos.politicalSkill}`} />
                                        <span className={`text-[10px] px-1.5 py-px rounded ${TONE[hos.temperament.tone]}`}>{hos.temperament.label}</span>
                                    </div>
                                </div>
                                <div className="text-right text-[10px] text-slate-500 shrink-0">
                                    <div>{hos.yearsInOffice} {hos.yearsInOffice === 1 ? 'year' : 'years'} in office</div>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">{hos.bio}</p>
                            <div className="grid grid-cols-3 gap-2">
                                <Meter label="Popularity" value={hos.popularity ?? 50} />
                                <Meter label="Politics" value={hos.politicalSkill ?? 50} />
                                <Meter label="Health" value={hos.health ?? 100} />
                            </div>
                            {hos.traits.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {hos.traits.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{traitLabel(t)}</span>)}
                                </div>
                            )}
                            <p className="text-[10px] text-slate-500">Political skill sets how fast political capital refills. Health falls with age; a head of state can die in office.</p>
                        </div>
                    </Section>
                )}

                {/* Cabinet */}
                <Section icon={<Landmark size={11} />} title="Cabinet" hint={`dismiss ${LEADERSHIP_COSTS.dismissMinister} PC · appoint ${LEADERSHIP_COSTS.appointMinister} PC`}>
                    <div className="space-y-2">
                        {view.cabinet.map(seat => (
                            <div key={seat.portfolio} className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                                        {seat.label} <span className="normal-case tracking-normal text-slate-600">· {seat.drives}</span>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button
                                            disabled={busy !== null}
                                            onClick={() => setPicking(p => p?.kind === 'minister' && p.portfolio === seat.portfolio ? null : { kind: 'minister', portfolio: seat.portfolio, label: `the ${seat.label} seat` })}
                                            className="px-2 py-1 rounded-md border border-slate-700 text-[10px] text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40"
                                        >
                                            Replace
                                        </button>
                                        {seat.minister && (
                                            <button
                                                disabled={busy !== null || pc < LEADERSHIP_COSTS.dismissMinister}
                                                onClick={() => order(`dismiss-${seat.portfolio}`, 'GOV_DISMISS_MINISTER', { portfolio: seat.portfolio }, `Dismissing the ${seat.label} minister`)}
                                                title="Their loyalty drops sharply; the best candidate on the bench takes the seat."
                                                className="px-2 py-1 rounded-md border border-red-500/30 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                                            >
                                                {busy === `dismiss-${seat.portfolio}` ? '…' : 'Dismiss'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {seat.minister
                                    ? <PersonCard p={seat.minister} fitNote={seat.fits ? `Career fits the seat · +${SEAT_FIT_BONUS} skill` : null} />
                                    : <p className="text-xs text-slate-500">Vacant</p>}
                                {picking?.kind === 'minister' && picking.portfolio === seat.portfolio && <Picker />}
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Governors */}
                <Section icon={<Globe size={11} />} title="Governors" hint={`replace ${LEADERSHIP_COSTS.appointGovernor} PC`}>
                    <div className="space-y-2">
                        {view.governors.map(g => (
                            <div key={g.planetId} className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-3 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                                        {g.planetName} <span className="normal-case tracking-normal text-slate-600">· {g.population}M people</span>
                                    </div>
                                    <button
                                        disabled={busy !== null}
                                        onClick={() => setPicking(p => p?.kind === 'governor' && p.planetId === g.planetId ? null : { kind: 'governor', planetId: g.planetId, label: g.planetName })}
                                        className="shrink-0 px-2 py-1 rounded-md border border-slate-700 text-[10px] text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-40"
                                    >
                                        {g.governor ? 'Replace' : 'Appoint'}
                                    </button>
                                </div>
                                {g.governor
                                    ? <PersonCard p={g.governor} compact fitNote={g.governor.background.governs ? 'Has run a world before' : null} />
                                    : <p className="text-xs text-slate-500">No governor yet</p>}
                                {picking?.kind === 'governor' && picking.planetId === g.planetId && <Picker />}
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Bench */}
                <Section icon={<UserPlus size={11} />} title="On the bench" hint={`${view.candidates.length} waiting`}>
                    <p className="text-[11px] text-slate-500">Candidates for any post. Use Replace on a seat or a world above to bring one in.</p>
                    <div className="space-y-1.5">
                        {view.candidates.map(c => (
                            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                                <PersonCard p={c} compact />
                            </div>
                        ))}
                    </div>
                </Section>
            </div>
        </div>
    );
}
