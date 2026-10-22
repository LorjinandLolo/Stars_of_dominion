"use client";

// components/galaxy/DoomsdayPanel.tsx
// Bombarding a world to oblivion, on the planet card (lib/combat/planet-ruin.ts):
// terror bombing and glassing from a fleet over an enemy world, the World
// Breaker's charge, building one at a tier-3 yard, and the warnings a victim
// sees while it is happening to them.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { planetYardTier, MAX_YARD_TIER } from '@/lib/combat/shipyard-gate';
import { BREAKER_COST, BREAKER_BUILD_SIM_SECONDS, CRACK_CHARGE_SIM_SECONDS, GLASS_MIN_POWER } from '@/lib/combat/planet-ruin';

export default function DoomsdayPanel({ planet }: { planet: any }) {
    const pf = useUIStore(s => s.playerFactionId);
    const fleets = useUIStore(s => s.fleets) as any[];
    const nowSeconds = useUIStore(s => s.nowSeconds);
    const [confirm, setConfirm] = React.useState<string | null>(null);
    if (!pf || planet.destroyed) return null;

    const mine = planet.ownerId === pf;
    const here = (fleets ?? []).filter(f => f.factionId === pf && f.currentSystemId === planet.systemId && !f.destinationSystemId);
    const power = here.reduce((s, f) => s + (Number(f.basePower) || 0) * Math.min(1, Number(f.strength ?? 1)), 0);
    const warship = here.filter(f => !f.worldBreaker).sort((a, b) => (b.basePower ?? 0) - (a.basePower ?? 0))[0];
    const breaker = here.find(f => f.worldBreaker);
    const chargingOver = (fleets ?? []).find(f => f.crackCharge?.planetId === planet.id);
    const g = planet.glassing;
    const order = (actionId: string, payload: any, label: string) => {
        setConfirm(null);
        dispatchOrder({ actionId, factionId: pf, payload, label });
    };
    const btn = 'px-2 py-1 rounded border text-[9px] font-bold tracking-wider transition-colors disabled:opacity-40';
    const Confirmable = ({ id, label, title, onGo, tone }: { id: string; label: string; title: string; onGo: () => void; tone: string }) => confirm === id
        ? <button onClick={(e) => { e.stopPropagation(); onGo(); }} className={`${btn} bg-red-600/50 border-red-300 text-white animate-pulse`}>CONFIRM {label}</button>
        : <button title={title} onClick={(e) => { e.stopPropagation(); setConfirm(id); }} className={`${btn} ${tone}`}>{label}</button>;

    // What is happening to this world, for anyone looking.
    const warnings: string[] = [];
    if (g) warnings.push(`Being burned to glass: ${Math.round((g.progress ?? 0) * 100)}%${g.paused ? ' (paused, orbit contested)' : ''}`);
    if (chargingOver) {
        const left = Math.max(0, CRACK_CHARGE_SIM_SECONDS - (nowSeconds - chargingOver.crackCharge.startedAt));
        warnings.push(`A World Breaker is charging over it: about ${Math.ceil(left / 15 / 60)} min`);
    }
    const project = planet.worldBreakerProject;

    // Our own world: build a World Breaker at its yard.
    if (mine) {
        const tier = planetYardTier(planet, nowSeconds);
        if (!project && tier < MAX_YARD_TIER && !warnings.length) return null;
        return (
            <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                {warnings.map(w => <div key={w} className="text-[9px] font-bold text-red-400 animate-pulse">{w}</div>)}
                {project && (
                    <div className="text-[9px] text-orange-300">
                        World Breaker in the yards: {Math.min(100, Math.round(((nowSeconds - project.startedAt) / BREAKER_BUILD_SIM_SECONDS) * 100))}%
                    </div>
                )}
                {!project && tier >= MAX_YARD_TIER && (
                    <Confirmable id="breaker" label={`BUILD WORLD BREAKER · ${(BREAKER_COST.CREDITS / 1000).toFixed(0)}k`}
                        title={`A ship that destroys worlds. ${Object.entries(BREAKER_COST).map(([k, v]) => `${v.toLocaleString()} ${k.toLowerCase()}`).join(', ')}; three real days in the yards.`}
                        tone="bg-orange-900/30 border-orange-500/50 text-orange-300 hover:bg-orange-800/40"
                        onGo={() => order('MIL_BUILD_WORLDBREAKER', { planetId: planet.id }, `World Breaker at ${planet.name}`)} />
                )}
            </div>
        );
    }

    if (!here.length && !warnings.length) return null;
    return (
        <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/30 p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            {warnings.map(w => <div key={w} className="text-[9px] font-bold text-red-300">{w}</div>)}
            {here.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {warship && (
                        <button onClick={(e) => { e.stopPropagation(); order('MIL_BOMBARD_PLANET', { fleetId: warship.id, targetId: planet.id, mode: 'TERROR' }, `Terror bombing of ${planet.name}`); }}
                            title="Bomb the cities, not the forts: kills a share of the people and burns districts every volley. Infamy."
                            className={`${btn} bg-red-900/30 border-red-600/50 text-red-300 hover:bg-red-800/40`}>TERROR BOMB</button>
                    )}
                    {g?.factionId === pf ? (
                        <button onClick={(e) => { e.stopPropagation(); order('MIL_GLASS_PLANET', { planetId: planet.id, stop: true }, `Stop glassing ${planet.name}`); }}
                            className={`${btn} bg-slate-800/40 border-slate-500/50 text-slate-300`}>STOP GLASSING</button>
                    ) : !g && (
                        <Confirmable id="glass" label="GLASS IT"
                            title={`Burn the whole surface to glass: about two real hours with ${GLASS_MIN_POWER} power (we have ${Math.round(power)}), holding the orbit. Everyone dies; the galaxy will never forget it.`}
                            tone="bg-red-800/40 border-red-500/60 text-red-200 hover:bg-red-700/50"
                            onGo={() => order('MIL_GLASS_PLANET', { planetId: planet.id }, `Glassing ${planet.name}`)} />
                    )}
                    {breaker && !breaker.crackCharge && (
                        <Confirmable id="crack" label="CRACK THE WORLD"
                            title={(breaker.breakerReadyAt ?? 0) > nowSeconds ? 'The World Breaker is recharging.' : 'Charge the World Breaker: hold the orbit for about thirty minutes and the world is gone.'}
                            tone="bg-orange-800/40 border-orange-400/60 text-orange-200 hover:bg-orange-700/50"
                            onGo={() => order('MIL_CRACK_PLANET', { fleetId: breaker.id, planetId: planet.id }, `World Breaker charging over ${planet.name}`)} />
                    )}
                </div>
            )}
        </div>
    );
}
