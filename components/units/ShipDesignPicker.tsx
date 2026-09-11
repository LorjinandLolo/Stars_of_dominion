"use client";

// components/units/ShipDesignPicker.tsx
//
// The "which ship?" control every recruit surface shares. Lists the player's
// own designs and the standard patterns, grouped by hull, priced and powered
// from the same registry math the worker charges with. Designs the faction
// cannot build yet (tech-locked modules) render locked rather than vanish, so
// the player can see what research would unlock.

import React, { useMemo } from 'react';
import { Lock, Clock, Zap, Coins, Loader2 } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import UnitIcon from '@/components/units/UnitIcon';
import { DEFAULT_DESIGNS, SHIP_HULLS, summarizeDesign } from '@/lib/combat/ship-registry';
import type { DesignSummary, ShipDesign } from '@/lib/combat/ship-types';

export interface ShipDesignPickerProps {
    onCommission: (design: ShipDesign, summary: DesignSummary) => void;
    /** 'row' = wide cards in a horizontal strip; 'grid' = compact two-column list. */
    layout?: 'row' | 'grid';
    disabled?: boolean;
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

export default function ShipDesignPicker({ onCommission, layout = 'row', disabled = false }: ShipDesignPickerProps) {
    const entries = usePickerEntries();

    const wrapClass = layout === 'row'
        ? 'flex gap-3 overflow-x-auto pb-1 custom-scrollbar max-w-full'
        : 'grid grid-cols-2 gap-2';

    return (
        <div className={wrapClass}>
            {entries.map(({ design, summary, own }) => {
                const locked = !summary.valid;
                const pending = !!design.pending;
                const isDisabled = disabled || locked || pending;
                const hull = SHIP_HULLS.find(h => h.id === design.hullId);
                return (
                    <button
                        key={design.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => onCommission(design, summary)}
                        title={locked ? summary.issues.join(' ') : `${design.name} — ${hull?.name ?? design.hullId}`}
                        className={`${layout === 'row' ? 'w-36 shrink-0 py-3 px-2' : 'w-full py-2 px-2'} rounded-xl border text-left group transition-all flex flex-col items-center
                            ${isDisabled
                                ? 'bg-slate-900/60 border-slate-800 opacity-60 cursor-not-allowed'
                                : 'bg-slate-900 border-slate-700 hover:border-amber-500/50 hover:bg-slate-800'}`}
                    >
                        <span className={`mb-1.5 p-2 rounded-lg border transition-all relative
                            ${own ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10'}
                            ${isDisabled ? '' : 'group-hover:scale-110 group-hover:text-amber-300 group-hover:border-amber-500/40'}`}>
                            <UnitIcon type={design.hullId.toUpperCase() as any} size={layout === 'row' ? 26 : 20} />
                            {locked && <Lock size={10} className="absolute -top-1 -right-1 text-red-300" />}
                            {pending && <Loader2 size={10} className="absolute -top-1 -right-1 text-amber-300 animate-spin" />}
                        </span>
                        <div className="text-[10px] font-bold text-slate-200 group-hover:text-amber-300 text-center leading-tight truncate w-full">
                            {design.name}
                        </div>
                        <div className="text-[8px] uppercase tracking-widest text-slate-500 mt-0.5">
                            {hull?.name ?? design.hullId}{own ? '' : ' · standard'}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-2 font-mono">
                            <span className="flex items-center gap-0.5" title="Combat power"><Zap size={9} className="text-amber-400" />{summary.power}</span>
                            <span className="flex items-center gap-0.5" title="Build time"><Clock size={9} className="text-slate-500" />{formatBuildTime(summary.buildTime)}</span>
                        </div>
                        <div className="text-[8px] text-slate-500 mt-0.5 flex items-center gap-1 font-mono">
                            <Coins size={8} className="text-emerald-500" />
                            {formatCredits(summary.cost.CREDITS)} cr · {formatCredits(summary.cost.METALS)} mt
                        </div>
                        {locked && (
                            <div className="text-[8px] text-red-400/80 mt-1 text-center leading-tight">
                                {summary.lockedComponentIds.length > 0 ? 'Research required' : 'Not buildable'}
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
