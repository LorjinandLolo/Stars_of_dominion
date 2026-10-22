"use client";

// components/galaxy/CampPanel.tsx
// A camp world on the planet card (lib/camps/labour-camp.ts): designate one,
// run it (mode, inmates, guards, breakout risk, penal battalions), and from
// any of our other worlds send its dissidents or conquered people there.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import {
    CAMP_MODES, DESIGNATE_COST, breakoutChance, riskWord, INMATES_PER_GUARD, type CampMode, type CampState,
} from '@/lib/camps/labour-camp';

const MODE_LABEL: Record<CampMode, string> = { labour: 'LABOUR', experiments: 'EXPERIMENTS', forge: 'FORGE' };
const MODE_HINT: Record<CampMode, string> = {
    labour: 'Mines, foundries and arsenals: metals, materiel and ammo every tick; this world builds its districts and ships faster.',
    experiments: 'Research from testing on the inmates. They die fast, and the galaxy hears of it.',
    forge: 'The harshest survivors become elite soldiers (Special Ops) who muster here. Harsher worlds forge better.',
};

export default function CampPanel({ planet }: { planet: any }) {
    const pf = useUIStore(s => s.playerFactionId);
    const planets = useUIStore(s => s.planets) as any[];
    const armies = useUIStore(s => s.armies) as any[];
    const [busy, setBusy] = React.useState<string | null>(null);
    if (!pf || planet.ownerId !== pf) return null;

    const camp: CampState | undefined = planet.camp;
    const myCamps = planets.filter(p => p.ownerId === pf && p.camp);
    const order = async (key: string, payload: Record<string, any>, label: string) => {
        setBusy(key);
        try { await dispatchOrder({ actionId: 'CAMP_ORDER', factionId: pf, payload, label }); } finally { setBusy(null); }
    };
    const btn = 'px-2 py-1 rounded border text-[9px] font-bold tracking-wider transition-colors disabled:opacity-40';

    // Not a camp: offer to make it one, or to send people to ours.
    if (!camp) {
        const isCapital = planet.planetType === 'capital' || planet.isCapital;
        return (
            <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                {myCamps.length > 0 && (
                    <button disabled={busy === 'purge'} onClick={() => order('purge', { action: 'purge', planetId: myCamps[0].id, fromPlanetId: planet.id }, `Purge of ${planet.name}`)}
                        title={`Round up the malcontents of ${planet.name} and send them to ${myCamps[0].name}: unrest falls, infamy rises. Once a day.`}
                        className={`${btn} bg-stone-700/20 border-stone-500/40 text-stone-300 hover:bg-stone-600/30`}>PURGE TO CAMP</button>
                )}
                {myCamps.length > 0 && planet.conqueredFrom && (
                    <button disabled={busy === 'deport'} onClick={() => order('deport', { action: 'deport', planetId: myCamps[0].id, fromPlanetId: planet.id }, `Deportation from ${planet.name}`)}
                        title={`Deport part of ${planet.name}'s conquered people to ${myCamps[0].name}. Great unrest there, and infamy.`}
                        className={`${btn} bg-rose-800/20 border-rose-500/40 text-rose-300 hover:bg-rose-700/30`}>DEPORT TO CAMP</button>
                )}
                {!isCapital && !(planet.outpost && !planet.outpost.graduated) && (
                    <button disabled={busy === 'designate'} onClick={() => order('designate', { action: 'designate', planetId: planet.id }, `${planet.name} becomes a camp world`)}
                        title="Turn this world into a camp world: prisoners, dissidents, deportees and beaten peoples work its mines, are experimented on, or are forged into soldiers. Guard it well."
                        className={`${btn} bg-stone-800/30 border-stone-500/40 text-stone-400 hover:bg-stone-700/30`}>MAKE CAMP WORLD · {DESIGNATE_COST.CREDITS.toLocaleString()}</button>
                )}
            </div>
        );
    }

    let guards = Number(planet.garrison?.garrisonTroops) || 0;
    for (const a of armies ?? []) {
        if (a.currentPlanetId === planet.id && !a.transportFleetId && a.factionId === pf) {
            guards += Object.values(a.composition ?? {}).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
        }
    }
    const risk = breakoutChance(camp.inmates, guards);
    const o = camp.byOrigin;
    return (
        <div className="mt-2 rounded-lg border border-stone-500/40 bg-stone-900/40 p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold text-stone-200 tracking-wide">CAMP WORLD</span>
                <span className={`text-[9px] ${camp.revolt ? 'text-rose-400 animate-pulse' : risk >= 0.08 ? 'text-amber-300' : 'text-stone-400'}`}>
                    {camp.revolt ? 'IN REVOLT' : riskWord(risk)}
                </span>
            </div>
            <div className="text-[9px] text-stone-400">
                {camp.inmates.toLocaleString()} inmates ({o.pow.toLocaleString()} POWs · {o.dissidents.toLocaleString()} dissidents · {o.conquered.toLocaleString()} deportees · {o.natives.toLocaleString()} natives sent in all)
            </div>
            <div className="text-[9px] text-stone-500" title={`One guard can hold about ${INMATES_PER_GUARD} inmates; past that, breakouts.`}>
                {guards.toLocaleString()} guards · breakout risk {(risk * 100).toFixed(1)}% a tick{camp.breakouts ? ` · ${camp.breakouts} breakouts so far` : ''}
            </div>
            <div className="flex flex-wrap gap-1">
                {CAMP_MODES.map(m => (
                    <button key={m} disabled={busy === m || camp.mode === m} title={MODE_HINT[m]}
                        onClick={() => order(m, { action: 'mode', planetId: planet.id, mode: m }, `${planet.name}: ${MODE_LABEL[m].toLowerCase()}`)}
                        className={`${btn} ${camp.mode === m ? 'bg-stone-500/40 border-stone-300/60 text-white' : 'bg-stone-800/30 border-stone-600/40 text-stone-300 hover:bg-stone-700/40'}`}>
                        {MODE_LABEL[m]}
                    </button>
                ))}
                <button disabled={busy === 'draft' || camp.inmates < 200 || camp.revolt} onClick={() => order('draft', { action: 'draft', planetId: planet.id }, `Penal battalions from ${planet.name}`)}
                    title="Hand rifles to up to half the inmates (2,000 at most): a militia army stands on this world, ready to ship out."
                    className={`${btn} bg-amber-800/20 border-amber-500/40 text-amber-300 hover:bg-amber-700/30`}>DRAFT PENAL BATTALION</button>
            </div>
            <div className="text-[8px] text-stone-500">{MODE_HINT[camp.mode]}</div>
        </div>
    );
}
