"use client";

// components/planet/WarHud.tsx
// Command bar for a planet under invasion: who is winning, what the front is
// doing, and the stance/prediction orders for the next tactical cycle.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import type { PlanetSurface } from '@/lib/planet-surface/types';
import { occupationShare } from '@/lib/combat/siege/district-front';
import { Swords, Shield, Wind, ScrollText, LogOut, Crosshair, Users } from 'lucide-react';
import PrisonerPanel from './PrisonerPanel';

const STANCES = [
    { id: 'AGGRESSIVE_ASSAULT', label: 'ASSAULT', icon: <Swords size={12} />, beats: 'HOLD', color: '#f87171' },
    { id: 'DEFENSIVE_HOLD', label: 'HOLD', icon: <Shield size={12} />, beats: 'AMBUSH', color: '#60a5fa' },
    { id: 'MANEUVER_AMBUSH', label: 'AMBUSH', icon: <Wind size={12} />, beats: 'ASSAULT', color: '#4ade80' },
] as const;

interface WarHudProps {
    planet: any;
    surface: PlanetSurface;
}

export default function WarHud({ planet, surface }: WarHudProps) {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const factions = useUIStore(s => s.factions);
    const prisoners = useUIStore(s => s.prisoners);
    const [logOpen, setLogOpen] = React.useState(false);
    const [powOpen, setPowOpen] = React.useState(false);

    const heldPrisoners = React.useMemo(
        () => (prisoners ?? [])
            .filter((g: any) => !g.resolved && g.captorEmpireId === playerFactionId)
            .reduce((s: number, g: any) => s + g.count, 0),
        [prisoners, playerFactionId]
    );

    const siege = planet.siege;
    if (!siege) return null;

    const isAttacker = siege.attackerEmpireId === playerFactionId;
    const isDefender = siege.defenderEmpireId === playerFactionId;
    const side = isAttacker ? siege.attackerState : siege.defenderState;
    const foe = isAttacker ? siege.defenderState : siege.attackerState;
    const war = siege.districts;

    const share = war ? occupationShare(surface, war) : (siege.defenderState.occupationProgress ?? 0);
    const myTactic = isAttacker ? siege.attackerState.activeAttackerTactic : siege.defenderState.activeDefenderTactic;
    const myPrediction = isAttacker ? siege.attackerState.attackerPrediction : siege.defenderState.defenderPrediction;

    const nameOf = (id: string) =>
        (factions[id] as any)?.name ?? String(id).replace(/^faction-/, '').replace(/[-_]/g, ' ');

    const order = (actionId: string, payload: Record<string, any>, label: string) => {
        dispatchOrder({ actionId, factionId: playerFactionId || 'PLAYER_FACTION', payload, label });
    };

    const log = (siege.battleLog ?? []).slice(-6).reverse();
    const cycleTicks = siege.cycleLengthTicks || 4;
    const untilCycle = cycleTicks - (siege.tickCount % cycleTicks);

    return (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 z-20 w-[min(92%,760px)] rounded-lg border border-red-500/40 bg-slate-950/92 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.6)]">
            {/* Status strip */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-800/70">
                <span className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.2em] text-red-300">
                    <Swords size={13} className="animate-pulse" /> GROUND WAR
                </span>
                <span className="text-[9px] font-display tracking-[0.15em] text-slate-500 uppercase">{siege.phase}</span>
                <span className="text-[9px] font-mono text-slate-500">CYCLE {siege.cycleCount} · next in {untilCycle}t</span>

                {/* Territory bar: attacker share of the surface */}
                <div className="flex-1 min-w-[90px] flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-sky-500/25 overflow-hidden border border-slate-700/60">
                        <div className="h-full bg-red-500/80 transition-[width] duration-700" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-[9px] font-mono text-slate-300">{share}%</span>
                </div>

                <span className="hidden sm:block text-[8px] font-display tracking-[0.15em] uppercase text-slate-400 truncate max-w-[170px]">
                    {nameOf(siege.attackerEmpireId)} vs {nameOf(siege.defenderEmpireId)}
                </span>

                {heldPrisoners > 0 && (
                    <button
                        onClick={() => setPowOpen(true)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[9px] font-display tracking-[0.12em] hover:bg-amber-500/20 transition-colors animate-pulse"
                        title="Prisoners await your judgement"
                    >
                        <Users size={11} /> {heldPrisoners} POW
                    </button>
                )}

                <button
                    onClick={() => setLogOpen(o => !o)}
                    className={`p-1.5 rounded transition-colors ${logOpen ? 'text-amber-300 bg-amber-500/10' : 'text-slate-500 hover:text-slate-200 hover:bg-white/10'}`}
                    title="Battle log"
                >
                    <ScrollText size={13} />
                </button>
            </div>

            {powOpen && <PrisonerPanel onClose={() => setPowOpen(false)} />}

            {/* Force condition */}
            <div className="flex items-center gap-4 px-3 py-1.5 border-b border-slate-900/80 text-[8px] font-display tracking-[0.12em] uppercase text-slate-500">
                {([['Troops', isAttacker ? side.totalLandedTroops : side.garrisonTroops, '#e2e8f0'],
                   ['Morale', Math.round(side.morale), '#4ade80'],
                   ['Supply', Math.round(side.supply), '#38bdf8'],
                   ['Cohesion', Math.round(side.cohesion), '#a78bfa']] as const).map(([label, value, color]) => (
                    <span key={label} className="flex items-center gap-1.5">
                        {label}
                        <span className="font-mono text-[10px]" style={{ color }}>{Math.round(Number(value) || 0).toLocaleString()}</span>
                    </span>
                ))}
                <span className="ml-auto flex items-center gap-1.5">
                    Enemy troops
                    <span className="font-mono text-[10px] text-rose-300">
                        {Math.round((isAttacker ? foe.garrisonTroops : foe.totalLandedTroops) || 0).toLocaleString()}
                    </span>
                </span>
            </div>

            {/* Orders for the next cycle */}
            {(isAttacker || isDefender) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-display tracking-[0.18em] text-slate-500 uppercase mr-1">Stance</span>
                        {STANCES.map(s => {
                            const active = myTactic === s.id;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => order('MIL_SET_GROUND_TACTIC', { planetId: planet.id, tacticId: s.id }, `${s.label} on ${planet.name}`)}
                                    title={`${s.label} — beats ${s.beats}`}
                                    className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-display tracking-[0.1em] border transition-all"
                                    style={active
                                        ? { color: '#020617', backgroundColor: s.color, borderColor: s.color }
                                        : { color: s.color, backgroundColor: `${s.color}18`, borderColor: `${s.color}55` }}
                                >
                                    {s.icon}{s.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-display tracking-[0.18em] text-slate-500 uppercase mr-1 flex items-center gap-1">
                            <Crosshair size={9} /> Read
                        </span>
                        {STANCES.map(s => {
                            const active = myPrediction === s.id;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => order('MIL_SET_GROUND_PREDICTION', { planetId: planet.id, tacticId: s.id }, `Predicting ${s.label} on ${planet.name}`)}
                                    title={`Guess the enemy will ${s.label}: right = ×1.3 damage, wrong = ×0.85`}
                                    className={[
                                        'px-2 py-1 rounded text-[9px] font-display tracking-[0.1em] border transition-all',
                                        active
                                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                                            : 'text-slate-400 border-slate-700/60 hover:border-amber-500/50 hover:text-amber-300',
                                    ].join(' ')}
                                >
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>

                    {isAttacker && (
                        <button
                            onClick={() => order('MIL_LEAVE_SIEGE', { planetId: planet.id }, `Withdrawing from ${planet.name}`)}
                            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700/60 text-[9px] font-display tracking-[0.12em] text-slate-400 hover:text-rose-300 hover:border-rose-500/50 transition-colors"
                        >
                            <LogOut size={11} /> WITHDRAW
                        </button>
                    )}
                </div>
            )}

            {/* Battle log */}
            {logOpen && (
                <div className="px-3 py-2 border-t border-slate-800/70 max-h-32 overflow-y-auto space-y-1">
                    {log.length === 0 && <div className="text-[9px] text-slate-600">No engagements resolved yet.</div>}
                    {log.map((entry: any, i: number) => (
                        <div key={i} className="flex gap-2 text-[9px]">
                            <span className="font-mono text-slate-600 flex-shrink-0">C{entry.cycle}</span>
                            <span className={
                                entry.event === 'BREAKTHROUGH' || entry.event === 'ADVANCE' ? 'text-red-300'
                                : entry.event === 'AMBUSH' || entry.event === 'COUNTERATTACK' ? 'text-emerald-300'
                                : 'text-slate-400'
                            }>
                                {entry.message}
                                {entry.attackerLosses != null && (
                                    <span className="text-slate-600 font-mono"> — losses A {entry.attackerLosses} / D {entry.defenderLosses}</span>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
