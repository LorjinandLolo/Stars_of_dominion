"use client";

// components/units/FleetRefitPanel.tsx
//
// The "By design" block of a fleet's dossier, with a REFIT control per row.
// A refit converts ships already in the fleet to another pattern of the SAME
// hull at a shipyard (order MIL_REFIT_FLEET). Everything shown here comes from
// the same pure functions the worker uses: rosterByHull / refittable for what
// is free to convert, quoteRefit for the price. The worker re-checks all of it.

import React, { useMemo, useState } from 'react';
import { Wrench, X, AlertOctagon } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { REFIT_MAX_PER_ORDER, getComponent, getHull, quoteRefit, resolveDesign } from '@/lib/combat/ship-registry';
import { reconcileBooks, rosterByHull, refittable } from '@/lib/combat/fleet-roster';
import { isSystemContested } from '@/lib/combat/war-status';
import { yardLockReason, type YardAnchor } from '@/lib/combat/shipyard-gate';
import { formatBuildTime, formatCredits, usePickerEntries, useYardAt } from '@/components/units/ShipDesignPicker';
import type { ShipClassId } from '@/lib/combat/ship-types';

interface Row {
    key: string;
    hullId: ShipClassId;
    fromDesignId: string | null;
    name: string;
    count: number;
}

function moduleList(ids: string[]): string {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, n]) => `${n > 1 ? `${n}× ` : ''}${getComponent(id)?.name ?? id}`).join(', ');
}

export default function FleetRefitPanel({ fleet, yardAnchor }: { fleet: any; yardAnchor: YardAnchor }) {
    const shipDesigns = useUIStore(s => s.shipDesigns);
    const unlockedTechIds = useUIStore(s => s.techState.unlockedTechIds);
    const recruitmentJobs = useUIStore(s => s.recruitmentJobs);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const allFleets = useUIStore(s => s.fleets);
    const rivalries = useUIStore(s => s.diplomacyState?.rivalries);
    const entries = usePickerEntries();
    const yard = useYardAt(yardAnchor);

    const [openKey, setOpenKey] = useState<string | null>(null);
    const [targetId, setTargetId] = useState<string>('');
    const [count, setCount] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lookup = useMemo(
        () => (id: string) => resolveDesign(id, playerFactionId ?? '', shipDesigns),
        [shipDesigns, playerFactionId],
    );
    const unlocked = useMemo(() => new Set(unlockedTechIds ?? []), [unlockedTechIds]);
    // The worker shrinks over-claiming books (old saves) to the hulls that
    // exist before it prices a refit; show the same view it will act on.
    const books = useMemo(() => {
        const copy = { ...fleet };
        reconcileBooks(copy, lookup);
        return copy;
    }, [fleet, lookup]);
    const roster = useMemo(() => rosterByHull(books, lookup), [books, lookup]);
    // Same rule as the worker (lib/combat/war-status.ts): no refit under fire.
    const underFire = useMemo(() => isSystemContested(
        {
            rivalries: new Map((rivalries ?? []).map((r: any) => [r.id, r])),
            movement: { fleets: { values: () => allFleets } },
        },
        fleet.currentSystemId,
        playerFactionId ?? '',
    ), [rivalries, allFleets, fleet.currentSystemId, playerFactionId]);

    const rows: Row[] = useMemo(() => {
        const out: Row[] = [];
        for (const [hullId, hull] of Object.entries(roster.hulls)) {
            for (const [designId, n] of Object.entries(hull.byDesign)) {
                out.push({ key: designId, hullId: hullId as ShipClassId, fromDesignId: designId, name: lookup(designId)?.name ?? designId, count: n });
            }
            if (hull.unregistered > 0) {
                out.push({ key: `unregistered:${hullId}`, hullId: hullId as ShipClassId, fromDesignId: null, name: `Unregistered ${getHull(hullId)?.name?.toLowerCase() ?? hullId}`, count: hull.unregistered });
            }
        }
        return out;
    }, [roster, lookup]);

    if (fleet.factionId !== playerFactionId) return null;
    if (rows.length === 0 && roster.orphanIds.length === 0) return null;

    const booksUnclear = roster.orphanIds.length > 0 || Object.values(roster.hulls).some(h => h.inconsistent);

    const open = (row: Row, available: number) => {
        setOpenKey(row.key);
        setTargetId('');
        setCount(Math.max(1, available));
        setError(null);
    };

    const submit = async (row: Row, available: number) => {
        const target = entries.find(e => e.design.id === targetId);
        if (!target || busy) return;
        setBusy(true);
        setError(null);
        // dispatchOrder, like the recruit control beside this one: the order
        // shows in the pending HUD and a worker refusal marks it failed.
        const res = await dispatchOrder({
            actionId: 'MIL_REFIT_FLEET',
            factionId: playerFactionId || '',
            payload: {
                fleetId: fleet.id,
                fromDesignId: row.fromDesignId,
                toDesignId: target.design.id,
                count: Math.max(1, Math.min(available, count)),
                fromDesignName: row.name,
                toDesignName: target.design.name,
            },
        });
        setBusy(false);
        if (!res.success) setError(res.error || 'The yard refused the order.');
        else setOpenKey(null);
    };

    return (
        <div className="pt-2 border-t border-slate-800 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-slate-500">By design</div>
            {rows.map(row => {
                const { available: free, reserved } = refittable(books, row.fromDesignId, row.hullId, lookup, recruitmentJobs as any[]);
                // One order carries at most REFIT_MAX_PER_ORDER ships; the rest go in the next.
                const available = Math.min(free, REFIT_MAX_PER_ORDER);
                const yardLock = yard ? yardLockReason(yard, yardAnchor, row.hullId) : 'No shipyard here';
                const recordsLock = row.fromDesignId === null && booksUnclear ? 'Fleet records incomplete' : null;
                const lock = yardLock ?? (underFire ? 'Under fire' : null) ?? recordsLock ?? (available <= 0 ? (reserved > 0 ? 'All in refit' : 'None free') : null);
                const isOpen = openKey === row.key;
                const fromDesign = row.fromDesignId ? lookup(row.fromDesignId) ?? null : null;
                const targets = entries.filter(e => e.design.hullId === row.hullId && e.design.id !== row.fromDesignId);
                const target = targets.find(e => e.design.id === targetId);
                const quote = target ? quoteRefit(fromDesign, target.design, unlocked) : null;
                const n = Math.max(1, Math.min(available, count));

                return (
                    <div key={row.key} className="text-[11px] font-mono">
                        <div className="flex justify-between items-center gap-2">
                            <span className={`truncate ${row.fromDesignId ? 'text-slate-300' : 'text-slate-400 italic'}`}>{row.name}</span>
                            <span className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-400">×{row.count}{reserved > 0 ? ` (${reserved} in refit)` : ''}</span>
                                <button
                                    type="button"
                                    disabled={!!lock}
                                    title={lock ?? `Convert these ships to another ${getHull(row.hullId)?.name?.toLowerCase() ?? row.hullId} pattern at this yard`}
                                    onClick={() => (isOpen ? setOpenKey(null) : open(row, available))}
                                    className={`px-1.5 py-0.5 rounded border text-[9px] tracking-widest flex items-center gap-1 ${lock
                                        ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                                        : 'border-cyan-700 text-cyan-300 hover:bg-cyan-900/30'}`}
                                >
                                    <Wrench size={9} /> {lock ?? 'REFIT'}
                                </button>
                            </span>
                        </div>

                        {isOpen && !lock && (
                            <div className="mt-1.5 mb-2 p-2 rounded border border-cyan-900/60 bg-slate-950/60 space-y-2">
                                <div className="flex items-center gap-2">
                                    <select
                                        value={targetId}
                                        onChange={e => setTargetId(e.target.value)}
                                        className="flex-1 min-w-0 bg-slate-800 border border-slate-700 p-1 rounded text-[11px] text-slate-200"
                                    >
                                        <option value="" disabled>Refit to…</option>
                                        {targets.map(e => (
                                            <option key={e.design.id} value={e.design.id} disabled={!e.summary.valid || !!(e.design as any).pending}>
                                                {e.design.name} · {e.summary.power}{(e.design as any).pending ? ' — syncing with yard…' : e.summary.valid ? '' : ` — ${e.summary.issues[0] ?? 'not buildable'}`}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="number" min={1} max={available} value={n}
                                        onChange={e => setCount(Math.floor(Number(e.target.value) || 1))}
                                        className="w-14 bg-slate-800 border border-slate-700 p-1 rounded text-[11px] text-slate-200"
                                        title={free > available ? `1 to ${available} per order (${free} free)` : `1 to ${available}`}
                                    />
                                    <button type="button" onClick={() => setOpenKey(null)} className="text-slate-500 hover:text-slate-300" title="Close"><X size={12} /></button>
                                </div>

                                {targets.length === 0 && (
                                    <div className="text-[10px] text-slate-500">No other {getHull(row.hullId)?.name?.toLowerCase() ?? row.hullId} pattern on file. Draw one up in the Ship Designer.</div>
                                )}

                                {quote && !quote.ok && (
                                    <div className="text-[10px] text-red-300 flex gap-1.5"><AlertOctagon size={11} className="shrink-0 mt-0.5" />{quote.reason}</div>
                                )}

                                {quote && quote.ok && (
                                    <div className="text-[10px] leading-relaxed text-slate-300 space-y-0.5">
                                        <div>
                                            {n}× {row.name} → {target!.design.name} · <span className="text-amber-300">{formatCredits(quote.perShipCost.CREDITS * n)} cr / {formatCredits(quote.perShipCost.METALS * n)} mt</span> · {formatBuildTime(quote.perShipSeconds * n)} · rating <span className={quote.powerDelta >= 0 ? 'text-emerald-300' : 'text-amber-300'}>{quote.powerDelta * n >= 0 ? '+' : ''}{quote.powerDelta * n}</span>
                                        </div>
                                        {quote.addedModuleIds.length > 0 && <div className="text-slate-400">Adds {moduleList(quote.addedModuleIds)}.</div>}
                                        {quote.removedModuleIds.length > 0 && <div className="text-slate-500">Scraps {moduleList(quote.removedModuleIds)} (no refund).</div>}
                                        {quote.to.brownoutPenalty > 0 && <div className="text-orange-300">Target browns out: -{Math.round(quote.to.brownoutPenalty * 100)}% power, already in the rating.</div>}
                                        <div className="text-slate-500">Ships fight with the old fit until the work is done. The fleet may sail; the refit still lands.</div>
                                    </div>
                                )}

                                {error && <div className="text-[10px] text-red-300">{error}</div>}

                                <button
                                    type="button"
                                    disabled={!quote?.ok || busy}
                                    onClick={() => submit(row, available)}
                                    className={`w-full py-1 rounded border text-[10px] tracking-widest ${quote?.ok && !busy
                                        ? 'border-cyan-600 text-cyan-200 hover:bg-cyan-900/40'
                                        : 'border-slate-700 text-slate-600 cursor-not-allowed'}`}
                                >
                                    {busy ? 'SENDING…' : 'ORDER REFIT'}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
            {roster.orphanIds.length > 0 && (
                <div className="text-[10px] text-slate-500">
                    {roster.orphanIds.length} retired pattern{roster.orphanIds.length === 1 ? '' : 's'} still on the books; those ships cannot be priced for refit.
                </div>
            )}
        </div>
    );
}
