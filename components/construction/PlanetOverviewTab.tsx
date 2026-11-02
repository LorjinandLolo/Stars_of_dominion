'use client';

// components/construction/PlanetOverviewTab.tsx
// The Planet Screen's first page: read a world at a glance. What it makes, who
// lives there, what defends it, what is being built, and anything wrong,
// without opening another tab. Reads only what the client already syncs.

import React from 'react';
import { AlertTriangle, Clock, Factory, Hammer, Rocket, Shield, Swords, Users } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { getSyncedWorld } from '@/hooks/useGameSync';
import { surfaceGuns } from '@/lib/combat/surface-guns';
import { formatSimAsClock } from '@/lib/time/galactic-time';
import { BUILDINGS } from '@/data/buildings';
import { SIM_SECONDS_PER_REAL_SECOND } from '@/lib/time/time-config';
import QuickBuildMenu from './QuickBuildMenu';

const RATE_LABEL: Array<[string, string]> = [
    ['metals', 'Metals'], ['food', 'Food'], ['energy', 'Energy'], ['chemicals', 'Chemicals'],
    ['research', 'Research'], ['ammo', 'Ammo'], ['military', 'Materiel'], ['luxury', 'Luxury'], ['rare', 'Rare'],
];

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 min-w-0">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-2">{icon}{title}</h3>
            {children}
        </div>
    );
}

function Row({ label, value, tone = 'text-slate-200' }: { label: string; value: React.ReactNode; tone?: string }) {
    return (
        <div className="flex justify-between gap-2 text-xs py-0.5">
            <span className="text-slate-500">{label}</span>
            <span className={`font-mono ${tone}`}>{value}</span>
        </div>
    );
}

export default function PlanetOverviewTab({ planet, layer, queue, spaceQueue, nowSeconds, onOpenBuild }: {
    planet: any; layer: any; queue: any[]; spaceQueue: any[]; nowSeconds: number; onOpenBuild: () => void;
}) {
    const fleets = useUIStore(s => s.fleets) as any[];
    const jobs = useUIStore(s => s.recruitmentJobs) as any[];
    const playerFactionId = useUIStore(s => s.playerFactionId);
    useUIStore(s => s.planets); // repaint on every sync: the rates below are read from the synced world

    const econ: any = getSyncedWorld()?.economy?.planets?.get?.(planet.id);
    // Per real minute: the rates are per sim second.
    const rates = RATE_LABEL
        .map(([key, label]) => ({ label, perMin: (Number(econ?.currentRates?.[key]) || 0) * SIM_SECONDS_PER_REAL_SECOND * 60 }))
        .filter(r => r.perMin > 0.05);

    const garrison = planet.garrison;
    const guns = surfaceGuns(planet);
    const rating = layer?.orbital?.ratings;
    const here = (fleets ?? []).filter(f => f.currentSystemId === planet.systemId);
    const mine = here.filter(f => f.factionId === playerFactionId);
    const hostile = here.filter(f => f.factionId !== playerFactionId);
    const myJobs = (jobs ?? []).filter(j => j.planetId === planet.id || mine.some(f => f.id === j.targetFormationId));
    const building = (id: string) => BUILDINGS.find(b => b.id === id)?.name ?? id.replace(/_/g, ' ');

    const alerts: string[] = [];
    if (planet.siege) alerts.push('This world is under siege.');
    if (planet.camp?.revolt) alerts.push('The camp is in revolt.');
    if (planet.glassing) alerts.push(`Being burned to glass: ${Math.round((planet.glassing.progress ?? 0) * 100)}%`);
    if (planet.orbital?.orbitControlLost) alerts.push('The orbit is lost.');
    if (layer?.blockade?.active) alerts.push('Blockaded: supply is not getting through.');
    if ((planet.unrest ?? 0) > 50) alerts.push(`Unrest is high (${Math.round(planet.unrest)}).`);

    const nothingBuilding = queue.length + spaceQueue.length + myJobs.length === 0;

    return (
        <div className="space-y-3">
            {alerts.map(a => (
                <div key={a} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {a}
                </div>
            ))}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <Card icon={<Factory className="w-3 h-3 text-amber-400" />} title="Output per minute">
                    {rates.length === 0
                        ? <p className="text-xs text-slate-500">Nothing yet. A new colony starts producing as it grows.</p>
                        : rates.map(r => <Row key={r.label} label={r.label} value={r.perMin >= 10 ? Math.round(r.perMin).toLocaleString() : r.perMin.toFixed(1)} />)}
                </Card>

                <Card icon={<Users className="w-3 h-3 text-blue-400" />} title="People">
                    <Row label="Population" value={`${Math.round(planet.population ?? 0)} / ${planet.popCapacity ?? 0}`} />
                    <Row label="Stability" value={Math.round(planet.stability ?? 0)} tone={(planet.stability ?? 0) < 40 ? 'text-red-400' : 'text-slate-200'} />
                    <Row label="Happiness" value={Math.round(planet.happiness ?? 0)} />
                    <Row label="Unrest" value={Math.round(planet.unrest ?? 0)} tone={(planet.unrest ?? 0) > 50 ? 'text-red-400' : 'text-slate-200'} />
                </Card>

                <Card icon={<Shield className="w-3 h-3 text-cyan-400" />} title="Defences">
                    <Row label="Troops on the ground" value={(garrison?.garrisonTroops ?? 0).toLocaleString()} />
                    <Row label="Fortification" value={garrison?.fortificationLevel ?? 0} />
                    <Row label="Orbital defence" value={Math.round(rating?.defensePower ?? 0)} />
                    <Row label="Surface guns" value={guns.power} />
                    <Row label="Fleets in orbit" value={mine.length} />
                    {hostile.length > 0 && <Row label="Others in orbit" value={hostile.length} tone="text-red-400" />}
                </Card>

                <Card icon={<Hammer className="w-3 h-3 text-indigo-400" />} title="In progress">
                    {nothingBuilding ? (
                        <>
                            <p className="text-xs text-slate-500 mb-2">Nothing is being built here.</p>
                            <button onClick={onOpenBuild} className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Build something</button>
                        </>
                    ) : (
                        <div className="space-y-1">
                            {queue.map(o => (
                                <div key={o.orderId} className="flex justify-between gap-2 text-xs">
                                    <span className="text-slate-300 truncate">{building(o.buildingId)}</span>
                                    <span className="font-mono text-cyan-300 flex items-center gap-1 shrink-0">
                                        <Clock className="w-3 h-3" />{o.queued ? 'waiting' : formatSimAsClock(o.completesAtSeconds - nowSeconds)}
                                    </span>
                                </div>
                            ))}
                            {spaceQueue.map(o => (
                                <div key={o.orderId} className="flex justify-between gap-2 text-xs">
                                    <span className="text-slate-300 truncate capitalize">{String(o.shipType).replace(/_/g, ' ')}</span>
                                    <span className="font-mono text-fuchsia-300 shrink-0">{formatSimAsClock(o.completesAtSeconds - nowSeconds)}</span>
                                </div>
                            ))}
                            {myJobs.map(j => (
                                <div key={j.id} className="flex justify-between gap-2 text-xs">
                                    <span className="text-slate-300 truncate flex items-center gap-1">
                                        {j.isFleet ? <Rocket className="w-3 h-3 text-fuchsia-400" /> : <Swords className="w-3 h-3 text-amber-400" />}
                                        {j.count}× {String(j.designName ?? j.unitType).replace(/_/g, ' ').toLowerCase()}
                                    </span>
                                    <span className="font-mono text-amber-300 shrink-0">{formatSimAsClock(j.completesAt - nowSeconds)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            <QuickBuildMenu planetId={planet.id} />
        </div>
    );
}
