"use client";

// components/government/LoyaltyDeskCard.tsx
// Stars of Dominion — the ruler's loyalty desk.
//
// What loyal servants reported about being sounded out (lib/government/
// plots.ts, gov.loyaltyReports): the ruler's only window into a plot before
// it strikes. A report may name the plotter or not; dismissing a minister on
// suspicion costs political capital (GOV_DISMISS_MINISTER, in the cabinet
// list below). Shown to the ruler only.

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { getSyncedWorld } from '@/hooks/useGameSync';
import { formatGalacticDeadline } from '@/lib/time/galactic-time';

export default function LoyaltyDeskCard() {
    const seat = useUIStore(s => s.ministerSeat);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const tick = useUIStore(s => s.politicsState);
    void tick;
    const world: any = getSyncedWorld();
    if (seat || !playerFactionId || !world) return null;
    const gov = world.government?.get?.(playerFactionId);
    const reports: any[] = Array.isArray(gov?.loyaltyReports) ? [...gov.loyaltyReports].reverse() : [];
    // Personas that fell: a seated minister exposed as another empire's ruler.
    const exposed: any[] = (world.seats ?? []).filter((s: any) => s.factionId === playerFactionId && s.exposed && s.exposedAs);
    if (reports.length === 0 && exposed.length === 0) return null;
    const now = Number(world.nowSeconds ?? 0);
    const nameOf = (id: string) => world.factionNames?.[id] ?? world.economy?.factions?.get?.(id)?.name ?? id;

    return (
        <div className="bg-slate-900/60 border border-red-500/30 rounded-lg p-4 space-y-3">
            <div className="text-[10px] font-display tracking-widest text-red-300 uppercase flex items-center gap-1.5"><ShieldAlert size={11} /> Loyalty desk</div>
            {exposed.length > 0 && (
                <ul className="space-y-1">
                    {exposed.map(s => (
                        <li key={s.id} className="text-xs text-red-200">
                            <span className="font-semibold">{s.persona}</span>, your Minister of <span className="capitalize">{s.portfolio}</span>, is the ruler of <span className="font-semibold">{nameOf(s.exposedAs)}</span>.
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-slate-400 leading-relaxed">
                Someone in your cabinet is sounding people out. These are the ones who refused and said so. Dismiss on suspicion, or watch.
            </p>
            <ul className="space-y-1.5">
                {reports.slice(0, 6).map(r => (
                    <li key={r.id} className="text-xs text-slate-200 leading-relaxed">
                        {r.text}
                        <span className="text-[10px] text-slate-600 ml-2 font-mono">{formatGalacticDeadline(r.atSeconds, now)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
