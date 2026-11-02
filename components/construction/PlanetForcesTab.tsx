'use client';

// components/construction/PlanetForcesTab.tsx
// The Planet Screen's Forces page: everything of yours at this world, split the
// way the world is. Ships are in orbit, troops are on the ground. New units wait
// in the reserve; Muster picks from it and names a task force. Task forces split,
// merge, rename and stand down here, on one screen.

import React, { useMemo, useState } from 'react';
import { Anchor, Minus, Plus, Shield, Swords } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { reserveFleets, shipCapacity, shipsHeld, troopCapacity, troopsHeld } from '@/lib/military/reserve';

const unitLabel = (k: string) => k.replace(/_/g, ' ').toLowerCase();
const listUnits = (comp: Record<string, number> | undefined) =>
    Object.entries(comp ?? {}).filter(([, n]) => Number(n) > 0)
        .map(([k, n]) => `${Number(n).toLocaleString()} ${unitLabel(k)}`).join(', ');
const total = (comp: Record<string, number> | undefined) => Object.values(comp ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

function Stepper({ label, have, step, value, onChange }: { label: string; have: number; step: number; value: number; onChange: (n: number) => void }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="flex-1 min-w-0 truncate text-slate-300 capitalize">{label}</span>
            <span className="font-mono text-[10px] text-slate-500">{have.toLocaleString()} ready</span>
            <button aria-label={`Fewer ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - step))} className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-30"><Minus className="w-3 h-3" /></button>
            <span className="w-9 text-center font-mono text-slate-100">{value}</span>
            <button aria-label={`More ${label}`} disabled={value >= have} onClick={() => onChange(Math.min(have, value + step))} className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
            <button disabled={value >= have} onClick={() => onChange(have)} className="px-1.5 py-0.5 rounded text-[10px] text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-30">All</button>
        </div>
    );
}

function CapacityBar({ held, capacity, tone }: { held: number; capacity: number; tone: string }) {
    const pct = capacity > 0 ? Math.min(100, (held / capacity) * 100) : 0;
    return (
        <div className="mb-2">
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5"><span>Reserve</span><span className="font-mono">{held.toLocaleString()} / {capacity.toLocaleString()}</span></div>
            <div className="h-1 rounded bg-slate-800 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
        </div>
    );
}

export default function PlanetForcesTab({ planet, onOpenBuild, onClose }: { planet: any; onOpenBuild: () => void; onClose: () => void }) {
    const playerFactionId = useUIStore(s => s.playerFactionId) ?? '';
    const fleets = useUIStore(s => s.fleets) as any[];
    const armies = useUIStore(s => s.armies) as any[];
    const jobs = useUIStore(s => s.recruitmentJobs) as any[];
    const setSelectedFleetId = useUIStore(s => s.setSelectedFleetId);
    const setSelectedSystem = useUIStore(s => s.setSelectedSystem);

    const factionId = playerFactionId || 'PLAYER_FACTION';
    const order = (actionId: string, payload: Record<string, any>, label: string) => dispatchOrder({ actionId: actionId as any, factionId, payload, label });

    const orbit = (fleets ?? []).filter(f => f.factionId === playerFactionId && f.currentSystemId === planet.systemId);
    const reserve = reserveFleets(orbit, planet, playerFactionId)[0];
    const taskForces = orbit.filter(f => f.id !== reserve?.id);
    const ground = (armies ?? []).filter(a => a.factionId === playerFactionId && a.currentPlanetId === planet.id && !a.transportFleetId);
    const garrison = planet.garrison;
    const canCarry = orbit.filter(f => !f.destinationSystemId);

    const shipRoom = shipCapacity(planet);
    const troopRoom = troopCapacity(planet);
    const shipsNow = shipsHeld(orbit, jobs ?? [], planet, playerFactionId);
    const troopsNow = troopsHeld(planet, jobs ?? []);

    // What the player has picked to send. Clamped by what is really there at dispatch.
    const [pickShips, setPickShips] = useState<Record<string, number>>({});
    const [pickTroops, setPickTroops] = useState<Record<string, number>>({});
    const [name, setName] = useState('');
    const [splitting, setSplitting] = useState<string | null>(null);
    const [splitPick, setSplitPick] = useState<Record<string, number>>({});
    const [splitName, setSplitName] = useState('');

    const reserveShips: Record<string, number> = useMemo(() => reserve?.composition ?? {}, [reserve?.composition]);
    const garrisonTroops: Record<string, number> = garrison?.unitComposition ?? {};
    const shipCount = total(pickShips);
    const troopCount = total(pickTroops);

    const muster = async () => {
        const label = name.trim() || 'Task Force';
        let carrierId: string | undefined;
        if (reserve && shipCount > 0) {
            if (shipCount >= total(reserveShips)) {
                await order('MIL_SET_RESERVE', { fleetId: reserve.id, name: label }, `Mustering ${label}`);
                carrierId = reserve.id;
            } else {
                carrierId = `fleet-${playerFactionId}-${Date.now()}`;
                await order('MIL_SPLIT_FLEET', { fleetId: reserve.id, composition: pickShips, name: label, newFleetId: carrierId }, `Mustering ${label}`);
            }
        }
        if (troopCount > 0) {
            await order('MIL_MUSTER_ARMY', { planetId: planet.id, composition: pickTroops, name: `${label} Army`, embarkFleetId: carrierId }, `Mustering ${label} Army`);
        }
        setPickShips({});
        setPickTroops({});
        setName('');
    };

    const standDown = (fleet: any) => reserve
        ? order('MIL_MERGE_FLEETS', { sourceFleetId: fleet.id, targetFleetId: reserve.id }, `${fleet.name} standing down`)
        : order('MIL_SET_RESERVE', { fleetId: fleet.id, planetId: planet.id }, `${fleet.name} standing down`);

    const split = async (fleet: any) => {
        await order('MIL_SPLIT_FLEET', { fleetId: fleet.id, composition: splitPick, name: splitName.trim() || undefined }, `Splitting ${fleet.name}`);
        setSplitting(null);
        setSplitPick({});
        setSplitName('');
    };

    const rename = (formationId: string, current: string) => {
        const next = window.prompt('New name', current)?.trim();
        if (next && next !== current) order('MIL_RENAME_FORMATION', { formationId, name: next }, `Renaming ${current}`);
    };

    const command = (fleetId: string) => {
        setSelectedSystem(planet.systemId);
        setSelectedFleetId(fleetId);
        onClose();
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="p-3 rounded-xl border border-indigo-900/50 bg-indigo-950/20 min-w-0">
                    <h3 className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">
                        <Anchor className="w-3 h-3" /> In orbit
                    </h3>
                    {shipRoom > 0
                        ? <CapacityBar held={shipsNow} capacity={shipRoom} tone="bg-indigo-400" />
                        : <p className="text-[11px] text-amber-300 mb-2">No yard here, so no ships can wait in reserve.</p>}
                    {total(reserveShips) === 0
                        ? <p className="text-xs text-slate-500 mb-2">{shipsNow > 0 ? 'Ships are on the slip.' : 'No ships in reserve.'}</p>
                        : <div className="space-y-1 mb-2">
                            {Object.entries(reserveShips).filter(([, n]) => Number(n) > 0).map(([k, n]) => (
                                <Stepper key={k} label={unitLabel(k)} have={Number(n)} step={1} value={pickShips[k] ?? 0} onChange={v => setPickShips(p => ({ ...p, [k]: v }))} />
                            ))}
                        </div>}
                    <button onClick={onOpenBuild} className="text-[11px] text-indigo-300 hover:text-indigo-200">Build ships →</button>
                </section>

                <section className="p-3 rounded-xl border border-amber-900/40 bg-amber-950/10 min-w-0">
                    <h3 className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-amber-300 mb-2">
                        <Swords className="w-3 h-3" /> On the ground
                    </h3>
                    <CapacityBar held={troopsNow} capacity={troopRoom} tone="bg-amber-400" />
                    {total(garrisonTroops) === 0
                        ? <p className="text-xs text-slate-500 mb-2">{(garrison?.garrisonTroops ?? 0) > 0 ? `${garrison.garrisonTroops.toLocaleString()} militia hold the world.` : 'No troops in the garrison.'}</p>
                        : <div className="space-y-1 mb-2">
                            {Object.entries(garrisonTroops).filter(([, n]) => Number(n) > 0).map(([k, n]) => (
                                <Stepper key={k} label={unitLabel(k)} have={Number(n)} step={10} value={pickTroops[k] ?? 0} onChange={v => setPickTroops(p => ({ ...p, [k]: v }))} />
                            ))}
                        </div>}
                    <div className="flex items-center justify-between gap-2">
                        <button onClick={onOpenBuild} className="text-[11px] text-amber-300 hover:text-amber-200">Recruit troops →</button>
                        <button
                            onClick={() => order('MIL_ESTABLISH_GARRISON', { targetId: planet.id, unitCount: 100 }, `Garrisoning ${planet.name}`)}
                            title="Station 100 troops: +15 stability, −10 unrest (200 credits, 100 manpower)"
                            className="px-2 py-1 rounded border border-amber-500/40 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20">
                            <Shield className="w-3 h-3 inline mr-1" />STATION +100
                        </button>
                    </div>
                </section>
            </div>

            <section className="p-3 rounded-xl border border-slate-700 bg-slate-900/60 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Muster</span>
                <span className="text-xs text-slate-400">{shipCount} ships, {troopCount} troops{shipCount > 0 && troopCount > 0 ? ' aboard' : ''}</span>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Name the task force"
                    className="flex-1 min-w-[10rem] bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                <button disabled={shipCount + troopCount === 0} onClick={muster}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-800 disabled:text-slate-500">
                    Form task force
                </button>
            </section>

            {taskForces.length > 0 && (
                <section className="space-y-1.5">
                    <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Task forces here</h3>
                    {taskForces.map(f => {
                        const parked = !f.destinationSystemId;
                        const others = taskForces.filter(o => o.id !== f.id && !o.destinationSystemId);
                        return (
                            <div key={f.id} className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <button onClick={() => rename(f.id, f.name)} title="Rename" className="text-xs font-semibold text-slate-200 truncate hover:text-white">{f.name || 'Fleet'}</button>
                                        <div className="text-[10px] text-slate-500 truncate">
                                            {listUnits(f.composition) || 'empty'} · power {Math.round((f.basePower ?? 0) * Math.min(1, f.strength ?? 1))}
                                            {(f.transportedArmyIds?.length ?? 0) > 0 ? ` · ${f.transportedArmyIds.length} aboard` : ''}
                                            {parked ? '' : ' · leaving'}
                                        </div>
                                    </div>
                                    {parked && total(f.composition) > 1 && (
                                        <button onClick={() => { setSplitting(splitting === f.id ? null : f.id); setSplitPick({}); }} className="px-2 py-1 rounded border border-slate-600 text-[10px] font-bold text-slate-300 hover:bg-slate-700/50">SPLIT</button>
                                    )}
                                    {parked && others.length > 0 && (
                                        <select value="" aria-label={`Merge ${f.name}`}
                                            onChange={e => e.target.value && order('MIL_MERGE_FLEETS', { sourceFleetId: f.id, targetFleetId: e.target.value }, `Merging ${f.name}`)}
                                            className="max-w-[8rem] bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-300">
                                            <option value="" disabled>Merge into…</option>
                                            {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                    )}
                                    {parked && shipRoom > 0 && (
                                        <button onClick={() => standDown(f)} title="Back into this world's reserve" className="px-2 py-1 rounded border border-slate-600 text-[10px] font-bold text-slate-300 hover:bg-slate-700/50">STAND DOWN</button>
                                    )}
                                    <button onClick={() => command(f.id)} title="Select this fleet on the map to give it orders"
                                        className="px-2 py-1 rounded border border-indigo-500/40 text-[10px] font-bold text-indigo-300 hover:bg-indigo-500/20">
                                        COMMAND
                                    </button>
                                </div>
                                {splitting === f.id && (
                                    <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                                        {Object.entries(f.composition ?? {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => (
                                            <Stepper key={k} label={unitLabel(k)} have={Number(n)} step={1} value={splitPick[k] ?? 0} onChange={v => setSplitPick(p => ({ ...p, [k]: v }))} />
                                        ))}
                                        <div className="flex gap-2 pt-1">
                                            <input value={splitName} onChange={e => setSplitName(e.target.value)} maxLength={40} placeholder="Name the detachment"
                                                className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
                                            <button disabled={total(splitPick) === 0 || total(splitPick) >= total(f.composition)} onClick={() => split(f)}
                                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-slate-800 disabled:text-slate-500">
                                                Detach
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </section>
            )}

            {ground.length > 0 && (
                <section className="space-y-1.5">
                    <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Armies here</h3>
                    {ground.map(a => (
                        <div key={a.id} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800">
                            <div className="min-w-0 flex-1">
                                <button onClick={() => rename(a.id, a.name)} title="Rename" className="text-xs font-semibold text-slate-200 truncate hover:text-white">{a.name || 'Army'}</button>
                                <div className="text-[10px] text-slate-500 truncate">{listUnits(a.composition) || 'empty'}</div>
                            </div>
                            {canCarry.length > 0 ? (
                                <select value="" aria-label={`Board ${a.name}`}
                                    onChange={e => e.target.value && order('MIL_EMBARK_ARMY', { armyId: a.id, fleetId: e.target.value }, 'Army boarding transport')}
                                    className="max-w-[9rem] bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-300">
                                    <option value="" disabled>Board a fleet…</option>
                                    {canCarry.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            ) : <span className="text-[10px] text-slate-600">No fleet in orbit</span>}
                            <button onClick={() => order('MIL_STAND_DOWN_ARMY', { armyId: a.id }, `${a.name} standing down`)} title="Back into the garrison"
                                className="px-2 py-1 rounded border border-slate-600 text-[10px] font-bold text-slate-300 hover:bg-slate-700/50">STAND DOWN</button>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}
