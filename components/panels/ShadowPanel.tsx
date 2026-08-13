"use client";

// components/panels/ShadowPanel.tsx
// The underworld, from wherever the player is standing in it.
//
// Two panels in one, because there are two ways to be involved: an empire that
// deals with bands (buys silence, buys violence, buys stolen cargo, and worries
// about being caught at it), and a player who IS a band. The data comes from
// lib/piracy/pirate-view.ts, built server-side per faction — this component
// renders only what the faction was entitled to receive.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import {
    Skull, Flame, Network, ShoppingBag, Users, Eye, Map, Anchor,
    Coins, HandCoins, ShieldAlert, Crosshair, Radio,
} from 'lucide-react';
import type { OverlayType } from '@/types/ui-state';

const SHADOW_OVERLAYS: { type: OverlayType; label: string; icon: React.ReactNode }[] = [
    { type: 'tradeHeat', label: 'Smuggling Density', icon: <ShoppingBag size={12} /> },
    { type: 'instability', label: 'Trade Vulnerability', icon: <Eye size={12} /> },
    { type: 'deepSpace', label: 'Deep Space Lanes', icon: <Map size={12} /> },
];

/** The four rungs, in the order an investigation walks them. */
const EXPOSURE_STEPS = ['invisible', 'suspected', 'attributed', 'exposed'] as const;

const EXPOSURE_COLOR: Record<string, string> = {
    invisible: '#22c55e',
    suspected: '#eab308',
    attributed: '#f97316',
    exposed: '#ef4444',
};

const STAGE_NAME: Record<number, string> = {
    1: 'Gang', 2: 'Fleet', 3: 'Corsair Network', 4: 'Confederacy', 5: 'Pirate State',
};

function StatBar({ value, color = '#a855f7' }: { value: number; color?: string }) {
    return (
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
            />
        </div>
    );
}

function Metric({ label, value, color, icon, suffix = '/100' }: {
    label: string; value: number; color: string; icon: React.ReactNode; suffix?: string;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-display tracking-wide" style={{ color }}>
                    {icon} {label}
                </div>
                <span className="font-mono text-slate-300">
                    {Math.round(value)}<span className="text-slate-600">{suffix}</span>
                </span>
            </div>
            <StatBar value={value} color={color} />
        </div>
    );
}

function Section({ title, count, children }: {
    title: string; count?: number; children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-display tracking-widest text-slate-500">{title}</span>
                {count !== undefined && (
                    <span className="text-[10px] font-mono text-slate-600">{count}</span>
                )}
            </div>
            {children}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <div className="text-xs text-slate-600 italic px-3 py-2">{children}</div>;
}

/** The exposure ladder as a four-rung track — the sponsor's tension surface. */
function ExposureLadder({ step, evidence }: { step: string; evidence?: number }) {
    return (
        <div className="flex items-center gap-1">
            {EXPOSURE_STEPS.map((rung, i) => {
                const reached = EXPOSURE_STEPS.indexOf(step as typeof EXPOSURE_STEPS[number]) >= i;
                return (
                    <div
                        key={rung}
                        title={rung}
                        className="h-1.5 flex-1 rounded-full transition-all"
                        style={{ backgroundColor: reached ? EXPOSURE_COLOR[rung] : '#1e293b' }}
                    />
                );
            })}
            <span
                className="ml-2 text-[10px] font-display tracking-wide w-20 text-right"
                style={{ color: EXPOSURE_COLOR[step] ?? '#94a3b8' }}
            >
                {step.toUpperCase()}
                {evidence !== undefined && (
                    <span className="text-slate-600 font-mono"> {Math.round(evidence * 100)}%</span>
                )}
            </span>
        </div>
    );
}

// ─── The band's own dashboard ────────────────────────────────────────────────

function BandDashboard({ dashboard }: { dashboard: NonNullable<ReturnType<typeof useDashboard>> }) {
    const overExtended = dashboard.fleets > dashboard.supportableFleets;

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700/40 rounded text-xs font-display text-purple-300">
                    <Skull size={11} />
                    {dashboard.name.toUpperCase()}
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded text-xs font-display text-slate-300">
                    STAGE {dashboard.stage} · {STAGE_NAME[dashboard.stage] ?? '—'}
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded text-xs font-display text-slate-400">
                    {dashboard.doctrine.toUpperCase()} WING
                </div>
            </div>

            {dashboard.inSuccession && (
                <div className="px-3 py-2 bg-amber-950/40 border border-amber-800/50 rounded text-xs text-amber-400 font-display">
                    ⚠ NO ONE IN COMMAND — the wings are fighting over the chair
                </div>
            )}

            {/* The five metrics. There is deliberately no territory count. */}
            <div className="space-y-4">
                <Metric label="INFAMY" value={dashboard.infamy} color="#ef4444" icon={<Flame size={12} />} />
                <Metric label="HEAT" value={dashboard.heat} color="#f97316" icon={<Crosshair size={12} />} />
                <Metric label="NETWORK CONTROL" value={dashboard.networkControl} color="#a855f7" icon={<Network size={12} />} />
                <Metric label="CREW LOYALTY" value={dashboard.crewLoyalty} color="#22c55e" icon={<Users size={12} />} />
                <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5 font-display tracking-wide text-amber-500">
                        <ShoppingBag size={12} /> GREY THROUGHPUT
                    </div>
                    <span className="font-mono text-slate-300">
                        {dashboard.blackMarketLiquidity.toLocaleString()}<span className="text-slate-600">cr/hr</span>
                    </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-display tracking-wide text-emerald-500">
                        <Coins size={12} /> TREASURY
                    </div>
                    <span className="font-mono text-slate-300">{dashboard.treasury.toLocaleString()}cr</span>
                </div>
            </div>

            <Section title="WINGS">
                <div className="space-y-2">
                    {dashboard.wings
                        .slice()
                        .sort((a, b) => b.pressure - a.pressure)
                        .map(wing => (
                            <div key={wing.doctrine} className="space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-display tracking-wide text-slate-300">
                                        {wing.doctrine.toUpperCase()}
                                        {wing.doctrine === dashboard.doctrine && (
                                            <span className="ml-1.5 text-[9px] text-purple-400">IN CHARGE</span>
                                        )}
                                    </span>
                                    <span className="font-mono text-slate-500">
                                        {wing.pressure}% · mood {wing.satisfaction}
                                    </span>
                                </div>
                                <StatBar
                                    value={wing.pressure}
                                    color={wing.satisfaction < 35 ? '#ef4444' : '#64748b'}
                                />
                            </div>
                        ))}
                </div>
            </Section>

            <Section title="FLEET CAPACITY">
                <div className={[
                    'px-3 py-2 rounded border text-xs font-mono',
                    overExtended
                        ? 'bg-red-950/40 border-red-800/50 text-red-400'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-300',
                ].join(' ')}>
                    {dashboard.fleets} raider(s) · {dashboard.supportableFleets} berth(s)
                    {overExtended && (
                        <span className="block mt-1 font-display tracking-wide">
                            OVER-EXTENDED — crews are being paid in promises
                        </span>
                    )}
                </div>
            </Section>

            <Section title="BASE NETWORK" count={dashboard.bases.length}>
                {dashboard.bases.length === 0 ? (
                    <Empty>Nowhere to hide, nowhere to repair.</Empty>
                ) : (
                    <div className="space-y-1">
                        {dashboard.bases.map(base => (
                            <div
                                key={base.id}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded text-xs"
                            >
                                <Anchor size={11} className="text-purple-400 shrink-0" />
                                <span className="font-display tracking-wide text-slate-300">
                                    {base.kind.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <span className="text-slate-600 font-mono">{base.systemId}</span>
                                <span className="ml-auto font-mono text-slate-500">
                                    {base.ready
                                        ? `cover ${Math.round(base.concealment * 100)}%`
                                        : 'BUILDING'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="PATRONS" count={dashboard.sponsors.length}>
                {dashboard.sponsors.length === 0 ? (
                    <Empty>Nobody owns us.</Empty>
                ) : (
                    <div className="space-y-2">
                        {dashboard.sponsors.map(sponsor => (
                            <div key={sponsor.id} className="px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-display tracking-wide text-slate-300">
                                        {sponsor.sponsorFactionId}
                                    </span>
                                    <span className="font-mono text-slate-500">{sponsor.intensity}</span>
                                </div>
                                <ExposureLadder step={sponsor.exposure} />
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="CLIENTS" count={dashboard.contracts.length}>
                {dashboard.contracts.length === 0 ? (
                    <Empty>Nobody is paying us to leave them alone. Yet.</Empty>
                ) : (
                    <div className="space-y-1">
                        {dashboard.contracts.map(contract => (
                            <div
                                key={contract.id}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded text-xs"
                            >
                                <HandCoins size={11} className="text-emerald-400 shrink-0" />
                                <span className="text-slate-300">{contract.payerId}</span>
                                <span className="text-slate-600 font-mono">
                                    {contract.routeIds.length} lane(s)
                                </span>
                                <span className="ml-auto font-mono text-emerald-400">
                                    {Math.round(contract.feePerHour).toLocaleString()}cr/hr
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {dashboard.bountiesOnUs.length > 0 && (
                <div className="px-3 py-2 bg-red-950/40 border border-red-800/50 rounded text-xs text-red-400 font-display">
                    ⚠ {dashboard.bountiesOnUs.length} BOUNTY(S) ON THIS BAND —{' '}
                    {dashboard.bountiesOnUs
                        .reduce((sum, b) => sum + b.credits, 0)
                        .toLocaleString()}cr on offer
                </div>
            )}
        </>
    );
}

// ─── The empire's view of the underworld ─────────────────────────────────────

function EmpireShadowView({ view, infamy }: {
    view: NonNullable<ReturnType<typeof useView>>;
    infamy: number;
}) {
    return (
        <>
            <div className="space-y-4">
                <Metric
                    label="OUR INFAMY"
                    value={infamy}
                    color="#a855f7"
                    icon={<Skull size={12} />}
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    How compromised this empire is: black-market purchases, smuggling contracts and
                    the bands we quietly fund. Mostly private — until somebody proves it.
                </p>
            </div>

            <Section title="BANDS WE KNOW OF" count={view.organizations.length}>
                {view.organizations.length === 0 ? (
                    <Empty>No contact with the underworld. That is worth something.</Empty>
                ) : (
                    <div className="space-y-1">
                        {view.organizations.map(org => (
                            <div
                                key={org.id}
                                className="px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded space-y-1"
                            >
                                <div className="flex items-center gap-2 text-xs">
                                    <Skull size={11} className="text-purple-400 shrink-0" />
                                    <span className="font-display tracking-wide text-slate-200">
                                        {org.name}
                                    </span>
                                    {org.dissolved && (
                                        <span className="text-[9px] text-slate-600">DISSOLVED</span>
                                    )}
                                    <span className="ml-auto font-mono text-slate-500">
                                        {org.stage !== null
                                            ? `${STAGE_NAME[org.stage] ?? `stage ${org.stage}`}`
                                            : 'UNASSESSED'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                                    <span>infamy {org.infamy}</span>
                                    <span>we hunt {org.heatToward}</span>
                                    {org.networkControl !== null && <span>control {org.networkControl}</span>}
                                    {org.standing !== null && <span>standing {org.standing}</span>}
                                    <span className="ml-auto">{org.knownBaseCount} base(s) located</span>
                                </div>
                                {org.ourAgreements.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {org.ourAgreements.map(agreement => (
                                            <span
                                                key={agreement}
                                                className="px-1.5 py-0.5 bg-purple-900/30 border border-purple-700/40 rounded text-[9px] font-display text-purple-300"
                                            >
                                                {agreement}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="OUR ARRANGEMENTS" count={view.ownSponsorships.length}>
                {view.ownSponsorships.length === 0 ? (
                    <Empty>We are not funding anybody. Officially or otherwise.</Empty>
                ) : (
                    <div className="space-y-2">
                        {view.ownSponsorships.map(sponsorship => (
                            <div
                                key={sponsorship.id}
                                className="px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded space-y-1.5"
                            >
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-display tracking-wide text-slate-300">
                                        {sponsorship.organizationId.replace(/^porg-/, '')}
                                    </span>
                                    <span className="font-mono text-slate-500">
                                        {sponsorship.covert ? 'COVERT' : 'LETTER OF MARQUE'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                                    <span>{sponsorship.intensity}</span>
                                    {sponsorship.targetFactionId && (
                                        <span>vs {sponsorship.targetFactionId}</span>
                                    )}
                                    <span className="ml-auto">
                                        {Math.round(sponsorship.fundingPerHour).toLocaleString()}cr/hr
                                    </span>
                                </div>
                                {sponsorship.covert && (
                                    <ExposureLadder
                                        step={sponsorship.exposure}
                                        evidence={sponsorship.evidence}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="SUSPICIONS" count={view.suspectedSponsorships.length}>
                {view.suspectedSponsorships.length === 0 ? (
                    <Empty>Nobody else has been caught at anything.</Empty>
                ) : (
                    <div className="space-y-2">
                        {view.suspectedSponsorships.map((suspicion, i) => (
                            <div
                                key={`${suspicion.organizationId}-${i}`}
                                className="px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded space-y-1.5"
                            >
                                <div className="flex items-center gap-2 text-xs">
                                    <ShieldAlert size={11} className="text-amber-400 shrink-0" />
                                    <span className="text-slate-300">
                                        {suspicion.organizationId.replace(/^porg-/, '')}
                                    </span>
                                    <span className="ml-auto font-display tracking-wide text-slate-400">
                                        {suspicion.suspectedFactionId ?? 'SPONSOR UNKNOWN'}
                                    </span>
                                </div>
                                <ExposureLadder step={suspicion.step} />
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="BASES WE HAVE LOCATED" count={view.bases.length}>
                {view.bases.length === 0 ? (
                    <Empty>We have never found one. They have to be somewhere.</Empty>
                ) : (
                    <div className="space-y-1">
                        {view.bases.map(base => (
                            <div
                                key={base.id}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded text-xs"
                            >
                                <Anchor size={11} className="text-purple-400 shrink-0" />
                                <span className="font-display tracking-wide text-slate-300">
                                    {base.kind.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <span className="text-slate-600 font-mono">{base.systemId}</span>
                                {base.compromisedByUs && (
                                    <span className="ml-auto flex items-center gap-1 text-[9px] font-display text-emerald-400">
                                        <Radio size={9} /> WE ARE INSIDE
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section title="PROTECTION WE PAY FOR" count={view.contracts.length}>
                {view.contracts.length === 0 ? (
                    <Empty>We escort our own shipping.</Empty>
                ) : (
                    <div className="space-y-1">
                        {view.contracts.map(contract => (
                            <div
                                key={contract.id}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded text-xs"
                            >
                                <HandCoins size={11} className="text-amber-400 shrink-0" />
                                <span className="text-slate-300">
                                    {contract.organizationId.replace(/^porg-/, '')}
                                </span>
                                <span className="text-slate-600 font-mono">
                                    {contract.routeIds.length} lane(s)
                                </span>
                                <span className="ml-auto font-mono text-amber-400">
                                    {Math.round(contract.feePerHour).toLocaleString()}cr/hr
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {view.bounties.length > 0 && (
                <Section title="OPEN BOUNTIES" count={view.bounties.length}>
                    <div className="space-y-1">
                        {view.bounties.map(bounty => (
                            <div
                                key={bounty.id}
                                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/40 rounded text-xs"
                            >
                                <Crosshair size={11} className="text-red-400 shrink-0" />
                                <span className="text-slate-300">
                                    {(bounty.targetOrganizationId ?? bounty.targetLeaderId ?? bounty.targetBaseId ?? '—')
                                        .replace(/^porg-/, '')}
                                </span>
                                <span className="text-slate-600 font-mono">
                                    by {bounty.postedByFactionId}
                                </span>
                                <span className="ml-auto font-mono text-red-400">
                                    {bounty.credits.toLocaleString()}cr
                                </span>
                            </div>
                        ))}
                    </div>
                </Section>
            )}
        </>
    );
}

// Type helpers so the sub-components can take exactly what the store holds.
function useView() {
    return useUIStore(state => state.piracyState.view);
}
function useDashboard() {
    return useUIStore(state => state.piracyState.dashboard);
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function ShadowPanel() {
    const { playerState, activeOverlay, toggleOverlay, piracyState } = useUIStore();
    const { view, dashboard } = piracyState;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-purple-900/60 bg-gradient-to-r from-purple-950/40 to-transparent">
                <div className="flex items-center gap-2 mb-0.5">
                    <Skull size={14} className="text-purple-400" />
                    <h2 className="font-display text-sm tracking-widest text-purple-400">
                        {dashboard ? 'THE ORGANIZATION' : 'SHADOW OPERATIONS'}
                    </h2>
                </div>
                <p className="text-xs text-slate-500">
                    {dashboard
                        ? 'Ships · bases · contracts · the people who want you dead'
                        : 'Who is out there · what we pay them · how close we are to being caught'}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {dashboard ? (
                    <BandDashboard dashboard={dashboard} />
                ) : view ? (
                    <EmpireShadowView view={view} infamy={playerState.infamy} />
                ) : (
                    <Empty>Waiting for the next report from the frontier.</Empty>
                )}

                <div>
                    <div className="text-[10px] font-display tracking-widest text-slate-500 mb-2">
                        SHADOW OVERLAYS
                    </div>
                    <div className="space-y-1">
                        {SHADOW_OVERLAYS.map(({ type, label, icon }) => {
                            const isActive = activeOverlay === type;
                            return (
                                <button
                                    key={type}
                                    onClick={() => toggleOverlay(type)}
                                    className={[
                                        'w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-display tracking-wide transition-all border',
                                        isActive
                                            ? 'border-purple-500/60 bg-purple-900/30 text-purple-300'
                                            : 'border-slate-700/40 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200',
                                    ].join(' ')}
                                >
                                    {icon} {label}
                                    {isActive && <span className="ml-auto text-[9px] text-purple-400">ACTIVE</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {dashboard && dashboard.heat > 60 && (
                    <div className="px-3 py-2 bg-red-950/40 border border-red-800/50 rounded text-xs text-red-400 font-display">
                        ⚠ HIGH HEAT — lie low or lose the fleet
                    </div>
                )}
                {!dashboard && view?.ownSponsorships.some(s => s.covert && s.exposure !== 'invisible') && (
                    <div className="px-3 py-2 bg-amber-950/40 border border-amber-800/50 rounded text-xs text-amber-400 font-display">
                        ⚠ A TRAIL IS FORMING — cutting funding lets it go cold
                    </div>
                )}
            </div>
        </div>
    );
}
