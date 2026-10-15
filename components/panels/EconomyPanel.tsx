"use client";

// components/panels/EconomyPanel.tsx
// Stars of Dominion — the empire's own economy.
//
// What the treasury took in last cycle and from where, what each world makes
// and what it is short of, and production focus: the one empire-wide
// economic lever that changes output. Built from the synced world
// (lib/economy/economy-view.ts); the old panel showed galaxy-wide trade
// figures nothing writes and tariff buttons that were never accepted.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { Zap, Coins, Package, AlertTriangle, Crosshair, ChevronRight, Info } from 'lucide-react';
import { getSyncedWorld } from '@/hooks/useGameSync';
import { buildEconomyView, FOCUS_OPTIONS, type EconomyView } from '@/lib/economy/economy-view';
import { dispatchOrder } from '@/lib/multiplayer/order-client';

const RESOURCE_LABEL: Record<string, string> = {
    CREDITS: 'Credits', METALS: 'Metals', CHEMICALS: 'Chemicals', FOOD: 'Food', ENERGY: 'Energy',
    RARES: 'Rares', AMMO: 'Ammo', MATERIEL: 'Materiel', CAPACOLA: 'Capacola', SACRED_FLORA: 'Sacred flora',
};
const label = (key: string) => RESOURCE_LABEL[key] ?? key.charAt(0) + key.slice(1).toLowerCase();

/** 12,345 → "12.3k"; small numbers keep one decimal. */
function compact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
    if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
    if (abs >= 10) return Math.round(n).toString();
    return n.toFixed(1);
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
    return (
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-display tracking-[0.2em] uppercase text-slate-500">{children}</h3>
            {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
        </div>
    );
}

export default function EconomyPanel() {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const setShowEconomicTerminal = useUIStore(s => s.setShowEconomicTerminal);
    // Recompute whenever a sync lands (the store's planet list is rebuilt each time).
    const syncTick = useUIStore(s => s.planets);
    const [view, setView] = React.useState<EconomyView | null>(null);
    const [pendingFocus, setPendingFocus] = React.useState<string | null | undefined>(undefined);

    React.useEffect(() => {
        const world = getSyncedWorld();
        if (world && playerFactionId) setView(buildEconomyView(world, playerFactionId));
    }, [syncTick, playerFactionId]);

    // The worker confirms the focus on the next sync; until then show the choice.
    const focus = pendingFocus !== undefined && pendingFocus !== view?.focus ? pendingFocus : view?.focus ?? null;
    React.useEffect(() => { if (pendingFocus !== undefined && pendingFocus === view?.focus) setPendingFocus(undefined); }, [view?.focus, pendingFocus]);

    const setFocus = async (resource: string | null) => {
        if (!playerFactionId) return;
        setPendingFocus(resource);
        await dispatchOrder({
            actionId: 'ECON_SET_FOCUS',
            factionId: playerFactionId,
            payload: { resource },
            label: resource ? `Production focus: ${label(resource)}` : 'Production focus cleared',
        });
    };

    const openWorld = (planetId: string, systemId: string) => {
        const store = useUIStore.getState();
        store.setActiveTab('galaxy' as any);
        store.setSystemView(null);
        store.setSelectedSystem(systemId);
        store.setConstructionPlanet(planetId);
    };

    if (!view) {
        return (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">Reading the treasury…</div>
        );
    }

    const income = view.income ?? {};
    const credits = income.CREDITS ?? 0;
    const goods = Object.entries(income).filter(([k, v]) => k !== 'CREDITS' && k !== 'AMMO' && k !== 'MATERIEL' && v > 0.05);
    const warGoods = Object.entries(income).filter(([k, v]) => (k === 'AMMO' || k === 'MATERIEL') && v > 0.05);
    const troubled = view.worlds.filter(w => w.problems.length > 0);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/40">
                <h2 className="font-display text-sm tracking-widest text-amber-400 flex items-center gap-2">
                    <Coins size={16} /> ECONOMY
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Your treasury, your worlds, and what they make. One cycle is 24 real minutes.</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Income */}
                <section>
                    <SectionTitle hint="last cycle">Income</SectionTitle>
                    {view.income === null ? (
                        <p className="text-xs text-slate-500">The first figures arrive after the next cycle.</p>
                    ) : (
                        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 space-y-3">
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Taxes</div>
                                    <div className="text-2xl font-mono font-bold text-amber-300">+{compact(credits)} <span className="text-xs text-slate-500 font-sans">credits</span></div>
                                </div>
                                <div className="text-right text-[10px] text-slate-500">
                                    Treasury <span className="font-mono text-slate-300">{compact(view.reserves.CREDITS ?? 0)}</span>
                                </div>
                            </div>
                            {goods.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Goods paid in kind</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {goods.map(([k, v]) => (
                                            <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200">
                                                +{compact(v)} {label(k)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {warGoods.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">War goods procured</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {warGoods.map(([k, v]) => (
                                            <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-200">
                                                +{compact(v)} {label(k)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Attention */}
                {troubled.length > 0 && (
                    <section>
                        <SectionTitle>Needs attention</SectionTitle>
                        <div className="space-y-1.5">
                            {troubled.map(w => (
                                <button
                                    key={w.planetId}
                                    onClick={() => openWorld(w.planetId, w.systemId)}
                                    className="w-full flex items-start gap-2 text-left rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 px-3 py-2 transition-colors"
                                >
                                    <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                                    <span className="text-xs text-slate-200 flex-1">
                                        <span className="font-semibold">{w.name}</span>
                                        <span className="text-amber-200/80"> · {w.problems.join(' · ')}</span>
                                    </span>
                                    <ChevronRight size={13} className="text-slate-500 mt-0.5 shrink-0" />
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Worlds */}
                <section>
                    <SectionTitle hint={`${view.worlds.length} ${view.worlds.length === 1 ? 'world' : 'worlds'}`}>Your worlds</SectionTitle>
                    <div className="space-y-2">
                        {view.worlds.map(w => (
                            <button
                                key={w.planetId}
                                onClick={() => openWorld(w.planetId, w.systemId)}
                                className="w-full text-left rounded-xl border border-slate-700/50 bg-slate-900/50 hover:border-slate-600 px-3 py-2.5 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-slate-100 truncate">
                                        {w.name}{w.isCapital && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-amber-400">capital</span>}
                                    </span>
                                    <span className="text-xs font-mono text-amber-300 shrink-0" title="Taxes last cycle">{view.income === null ? "—" : `+${compact(w.creditsLastCycle)} cr`}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-slate-500">
                                    <span>{w.population}M people</span>
                                    <span className={w.happiness < 40 ? 'text-red-400' : ''}>Happiness {w.happiness}%</span>
                                    {w.instability > 0 && <span className={w.instability >= 50 ? 'text-red-400' : ''}>Instability {w.instability}%</span>}
                                </div>
                                {w.topOutputs.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {w.topOutputs.map(o => (
                                            <span key={o.label} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                                {o.label} {compact(o.perCycle)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Production focus */}
                <section>
                    <SectionTitle>Production focus</SectionTitle>
                    <p className="text-[11px] text-slate-500 mb-2 flex items-start gap-1.5">
                        <Crosshair size={12} className="mt-0.5 shrink-0" />
                        Every world makes 25% more of the chosen resource and 10% less of everything else.
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                        <button
                            onClick={() => setFocus(null)}
                            className={`py-1.5 rounded-lg border text-[11px] transition-colors ${focus === null ? 'border-sky-400/60 bg-sky-500/15 text-sky-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                        >
                            Balanced
                        </button>
                        {FOCUS_OPTIONS.map(o => (
                            <button
                                key={o.resource}
                                onClick={() => setFocus(o.resource)}
                                className={`py-1.5 rounded-lg border text-[11px] transition-colors ${focus === o.resource ? 'border-amber-400/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Prices */}
                {view.prices.length > 0 && (
                    <section>
                        <SectionTitle hint="galactic market">Prices</SectionTitle>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {view.prices.map(p => {
                                const delta = p.basePrice ? (p.price - p.basePrice) / p.basePrice : 0;
                                return (
                                    <div key={p.resource} className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 px-2.5 py-1.5">
                                        <span className="text-[11px] text-slate-300 flex items-center gap-1"><Package size={11} className="text-slate-500" />{label(p.resource)}</span>
                                        <span className="text-[11px] font-mono text-slate-200">
                                            {p.price.toFixed(1)}
                                            {Math.abs(delta) >= 0.05 && (
                                                <span className={delta > 0 ? 'text-red-400 ml-1' : 'text-emerald-400 ml-1'}>
                                                    {delta > 0 ? '▲' : '▼'}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1">
                            <Info size={10} /> Taxes are paid at these prices; arrows compare with the normal price.
                        </p>
                    </section>
                )}
            </div>

            <div className="px-6 py-4 border-t border-slate-700/40">
                <button
                    onClick={() => setShowEconomicTerminal(true)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-display text-[10px] tracking-widest font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <Zap size={14} />
                    BUY &amp; SELL ON THE MARKET
                </button>
            </div>
        </div>
    );
}
