"use client";

// components/units/ShipDesignPicker.tsx
//
// The "which ship?" control every recruit surface shares. Lists the player's
// own designs and the standard patterns, grouped by hull, priced and powered
// from the same registry math the worker charges with. Designs the faction
// cannot build yet — tech-locked modules, or a hull the local shipyard cannot
// lay down — render locked rather than vanish, so the player can see what
// research or yard would unlock them.

import React, { useMemo } from 'react';
import { Lock, Clock, Zap, Coins, Loader2, Anchor } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import UnitIcon from '@/components/units/UnitIcon';
import { DEFAULT_DESIGNS, SHIP_HULLS, getHull, summarizeDesign } from '@/lib/combat/ship-registry';
import type { DesignSummary, ShipDesign } from '@/lib/combat/ship-types';
import {
    checkShipyardGate,
    hullsBuildableAt,
    nextHullAfter,
    systemYardFor,
    yardLockReason,
    type YardAnchor,
    type YardSource,
} from '@/lib/combat/shipyard-gate';

export interface ShipDesignPickerProps {
    onCommission: (design: ShipDesign, summary: DesignSummary) => void;
    /** 'row' = wide cards in a horizontal strip; 'grid' = compact two-column list. */
    layout?: 'row' | 'grid';
    disabled?: boolean;
    /**
     * Where the ships would be laid down. When given, the picker mirrors the
     * worker's shipyard gate (lib/combat/shipyard-gate.ts): hulls the yard in
     * that system cannot lay are locked with the same reason the server would
     * send. When omitted, no yard check is shown.
     */
    yardAnchor?: YardAnchor;
}

export function formatCredits(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(Math.round(n));
}

export function formatBuildTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface PickerEntry {
    design: ShipDesign;
    summary: DesignSummary;
    own: boolean;
}

/** Own designs first, then the standard pattern, hull order corvette → battleship. */
export function usePickerEntries(): PickerEntry[] {
    const shipDesigns = useUIStore(s => s.shipDesigns);
    const unlockedTechIds = useUIStore(s => s.techState.unlockedTechIds);

    return useMemo(() => {
        const unlocked = new Set(unlockedTechIds ?? []);
        const out: PickerEntry[] = [];
        for (const hull of SHIP_HULLS) {
            const own = shipDesigns
                .filter(d => d.hullId === hull.id)
                .sort((a, b) => a.name.localeCompare(b.name));
            for (const design of own) {
                out.push({ design, summary: summarizeDesign(design, unlocked), own: true });
            }
            const standard = DEFAULT_DESIGNS.find(d => d.hullId === hull.id);
            if (standard) out.push({ design: standard, summary: summarizeDesign(standard, null), own: false });
        }
        return out;
    }, [shipDesigns, unlockedTechIds]);
}

/** The yard the anchor system offers this player, from the synced planet list. */
export function useYardAt(anchor: YardAnchor | undefined): YardSource | null {
    const planets = useUIStore(s => s.planets);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    return useMemo(() => {
        if (!anchor || !playerFactionId) return null;
        return systemYardFor(planets as any[], playerFactionId, anchor.systemId);
    }, [anchor?.systemId, anchor?.holding, planets, playerFactionId]);
}

function hullNames(ids: string[]): string {
    return ids.map(id => getHull(id)?.name?.toLowerCase() ?? id).join(', ');
}

function YardHeader({ anchor, yard }: { anchor: YardAnchor; yard: YardSource }) {
    const sys = anchor.systemName ?? anchor.systemId ?? 'this system';
    if (!anchor.holding) {
        return (
            <div className="w-full mb-3 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-300 flex items-center gap-2">
                <Anchor size={11} className="shrink-0" />
                Fleet under way — commission ships once it holds in a system with your shipyard.
            </div>
        );
    }
    if (yard.tier < 1) {
        return (
            <div className="w-full mb-3 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-[10px] text-red-300 flex items-center gap-2">
                <Anchor size={11} className="shrink-0" />
                No shipyard in {sys} — build an Orbital Shipyard on a world you own here, or move the fleet to a yard system.
            </div>
        );
    }
    const next = nextHullAfter(yard.tier);
    return (
        <div className="w-full mb-3 px-3 py-2 rounded-lg border border-white/5 bg-black/30 text-[10px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Anchor size={11} className="shrink-0 text-indigo-300" />
            <span>
                <span className="text-slate-200">Shipyard tier {yard.tier}</span> in {sys}
                {yard.structureName && yard.planetName ? <> — {yard.structureName} at {yard.planetName}</> : null}.
                {' '}Lays {hullNames(hullsBuildableAt(yard.tier))}.
            </span>
            {next
                ? <span className="text-amber-300/90">Next: {next.yardName} → {getHull(next.hull)?.name.toLowerCase() ?? next.hull}s.</span>
                : <span className="text-emerald-300/90">Lays every hull.</span>}
        </div>
    );
}

export default function ShipDesignPicker({ onCommission, layout = 'row', disabled = false, yardAnchor }: ShipDesignPickerProps) {
    const entries = usePickerEntries();
    const yard = useYardAt(yardAnchor);
    const planets = useUIStore(s => s.planets);
    const playerFactionId = useUIStore(s => s.playerFactionId);

    const wrapClass = layout === 'row'
        ? 'flex gap-3 overflow-x-auto pb-1 custom-scrollbar w-full max-w-full'
        : 'grid grid-cols-2 gap-2 w-full';

    return (
        <div className="w-full flex flex-col items-center">
            {yardAnchor && yard && <YardHeader anchor={yardAnchor} yard={yard} />}
            <div className={wrapClass}>
                {entries.map(({ design, summary, own }) => {
                    const researchLocked = !summary.valid;
                    const yardLock = yardAnchor && yard ? yardLockReason(yard, yardAnchor, design.hullId) : null;
                    const pending = !!design.pending;
                    const isDisabled = disabled || researchLocked || !!yardLock || pending;
                    const hull = SHIP_HULLS.find(h => h.id === design.hullId);
                    const footer = researchLocked
                        ? (summary.lockedComponentIds.length > 0 ? 'Research required' : 'Not buildable')
                        : yardLock;
                    const tooltip = researchLocked
                        ? summary.issues.join(' ')
                        : yardLock && yardAnchor && playerFactionId
                            ? (() => {
                                const g = checkShipyardGate(planets as any[], playerFactionId, yardAnchor, design.hullId);
                                return g.ok ? design.name : g.reason;
                            })()
                            : `${design.name} — ${hull?.name ?? design.hullId}`;
                    return (
                        <button
                            key={design.id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => onCommission(design, summary)}
                            title={tooltip}
                            className={`${layout === 'row' ? 'w-36 shrink-0 py-3 px-2' : 'w-full py-2 px-2'} rounded-xl border text-left group transition-all flex flex-col items-center
                                ${isDisabled
                                    ? 'bg-slate-900/60 border-slate-800 opacity-60 cursor-not-allowed'
                                    : 'bg-slate-900 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800'}`}
                        >
                            <span className={`mb-1.5 p-2 rounded-lg border transition-all relative
                                ${own ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10'}
                                ${isDisabled ? '' : 'group-hover:scale-110 group-hover:text-amber-300 group-hover:border-amber-500/40'}`}>
                                <UnitIcon type={design.hullId.toUpperCase() as any} size={layout === 'row' ? 26 : 20} />
                                {(researchLocked || yardLock) && <Lock size={10} className="absolute -top-1 -right-1 text-red-300" />}
                                {pending && <Loader2 size={10} className="absolute -top-1 -right-1 text-amber-300 animate-spin" />}
                            </span>
                            <div className="text-[10px] font-bold text-slate-200 group-hover:text-amber-300 text-center leading-tight truncate w-full">
                                {design.name}
                            </div>
                            <div className="text-[8px] uppercase tracking-widest text-slate-500 mt-0.5">
                                {hull?.name ?? design.hullId}{own ? '' : ' · standard'}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                                <span className="flex items-center gap-0.5" title={summary.brownoutPenalty > 0 ? `Combat power ${summary.power} (rated ${summary.ratedPower}; brownout -${Math.round(summary.brownoutPenalty * 100)}%)` : 'Combat power'}>
                                    <Zap size={9} className={summary.brownoutPenalty > 0 ? 'text-orange-400' : 'text-amber-400'} />{summary.power}
                                    {summary.brownoutPenalty > 0 && <span className="text-orange-300">-{Math.round(summary.brownoutPenalty * 100)}%</span>}
                                </span>
                                <span className="flex items-center gap-0.5" title="Build time"><Clock size={9} className="text-slate-500" />{formatBuildTime(summary.buildTime)}</span>
                            </div>
                            <div className="text-[8px] text-slate-500 mt-0.5 flex items-center gap-1 font-mono">
                                <Coins size={8} className="text-emerald-500" />
                                {formatCredits(summary.cost.CREDITS)} cr · {formatCredits(summary.cost.METALS)} mt
                            </div>
                            {footer && (
                                <div className="text-[8px] text-red-400/80 mt-1 text-center leading-tight">
                                    {footer}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
