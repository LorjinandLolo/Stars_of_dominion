'use client';

// components/construction/OrbitalLayerTab.tsx
// The layer above the surface: slots, what stands in them, and what can be laid
// down next. An invader has to break this before landing, so the slot grid leads
// with integrity rather than burying it.

import React, { useState } from 'react';
import {
    Satellite, ShieldAlert, Wrench, Trash2, Clock, AlertTriangle,
    Radar, Warehouse, FlaskConical, Anchor, Building2,
} from 'lucide-react';
import { ORBITAL_STRUCTURES, ORBITAL_STRUCTURE_BY_ID } from '@/data/orbital-structures';
import type { OrbitalCategory } from '@/lib/orbital/orbital-types';
import type { Planet } from '@/lib/construction/construction-types';

function formatDuration(seconds: number): string {
    if (seconds <= 0) return 'Immediate';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${Math.floor(seconds % 60)}s`;
}

const CATEGORY_ICON: Record<OrbitalCategory, React.ReactNode> = {
    station: <Building2 className="w-4 h-4" />,
    shipyard: <Anchor className="w-4 h-4" />,
    defense: <Radar className="w-4 h-4" />,
    logistics: <Warehouse className="w-4 h-4" />,
    research: <FlaskConical className="w-4 h-4" />,
};

const CATEGORY_ORDER: OrbitalCategory[] = ['station', 'shipyard', 'defense', 'logistics', 'research'];

interface Props {
    planet: Planet;
    layer: any;
    nowSeconds: number;
    actionLoading: boolean;
    onDispatch: (actionId: string, payload: Record<string, any>, label: string) => Promise<void>;
}

export function OrbitalLayerTab({ planet, layer, nowSeconds, actionLoading, onDispatch }: Props) {
    const [expandedCategory, setExpandedCategory] = useState<OrbitalCategory | null>('station');

    const slots = planet.orbital?.slots ?? [];
    const slotCount = layer?.orbital?.slotCount ?? slots.length;
    const ratings = layer?.orbital?.ratings;
    const orbitLost = planet.orbital?.orbitControlLost;

    const occupiedIds = new Set(
        slots.filter(s => s.structureId && s.state !== 'destroyed').map(s => s.structureId!)
    );
    const hasStation = Boolean(ratings?.hasStation);
    const freeSlots = slots.filter(s => s.state === 'empty' || s.state === 'destroyed').length;

    /** Why this structure cannot be laid down right now, or null if it can. */
    const blockedReason = (structureId: string): string | null => {
        const def = ORBITAL_STRUCTURE_BY_ID[structureId];
        if (!def) return 'Unknown structure';
        if ((planet.infrastructureLevel ?? 1) < def.infrastructureRequired) {
            return `Needs infrastructure ${def.infrastructureRequired}`;
        }
        if (def.upgradesFrom) {
            const source = slots.find(s =>
                s.structureId === def.upgradesFrom && (s.state === 'active' || s.state === 'damaged'));
            if (!source) {
                return `Needs an operational ${ORBITAL_STRUCTURE_BY_ID[def.upgradesFrom]?.name ?? def.upgradesFrom}`;
            }
            return null; // upgrades consume the slot they replace
        }
        if (def.requiresStation && !hasStation) return 'Needs an operational station';
        if (def.uniquePerPlanet && occupiedIds.has(structureId)) return 'Already in orbit';
        if (freeSlots === 0) return 'No free orbital slot';
        return null;
    };

    return (
        <div className="space-y-8">
            {/* Layer summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Slots', value: `${slots.filter(s => s.structureId && s.state !== 'destroyed').length} / ${slotCount}` },
                    { label: 'Defense', value: Math.round(ratings?.defensePower ?? 0) },
                    { label: 'Shields', value: Math.round(ratings?.shieldStrength ?? 0) },
                    { label: 'Yard Tier', value: ratings?.shipyardTier ?? 0 },
                    { label: 'Fleet Berths', value: Math.round(ratings?.fleetCapacity ?? 0) },
                    { label: 'Sensors', value: Math.round(ratings?.sensorStrength ?? 0) },
                ].map(stat => (
                    <div key={stat.label} className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{stat.label}</div>
                        <div className="text-lg font-mono text-slate-200">{stat.value}</div>
                    </div>
                ))}
            </div>

            {orbitLost && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 text-red-400">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold">ORBIT SUPPRESSED</p>
                        <p className="text-red-300/90">
                            Hostile forces control the approaches. Landings proceed unopposed until the
                            layer is rebuilt.
                        </p>
                    </div>
                </div>
            )}

            {/* Slot grid */}
            <div>
                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Satellite className="w-4 h-4 text-cyan-500" />
                    Orbital Slots
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {slots.map(slot => {
                        const def = slot.structureId ? ORBITAL_STRUCTURE_BY_ID[slot.structureId] : undefined;
                        const building = slot.state === 'under_construction';
                        const eta = building && slot.completesAt ? slot.completesAt - nowSeconds : 0;

                        const tone =
                            slot.state === 'destroyed' ? 'border-red-900/60 bg-red-950/20'
                                : slot.state === 'damaged' ? 'border-amber-800/60 bg-amber-950/10'
                                    : slot.state === 'active' ? 'border-slate-700 bg-slate-900'
                                        : building ? 'border-cyan-800/60 bg-cyan-950/10'
                                            : 'border-dashed border-slate-800 bg-slate-900/30';

                        return (
                            <div key={slot.slotId} className={`p-4 rounded-xl border ${tone} flex flex-col`}>
                                {!def ? (
                                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm py-6">
                                        Empty orbital slot
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
                                                {CATEGORY_ICON[def.category]}
                                                {def.name}
                                            </h4>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${slot.state === 'destroyed' ? 'bg-red-500/20 text-red-400'
                                                : slot.state === 'damaged' ? 'bg-amber-500/20 text-amber-400'
                                                    : building ? 'bg-cyan-500/20 text-cyan-400'
                                                        : 'bg-emerald-500/20 text-emerald-400'
                                                }`}>
                                                {slot.state.replace(/_/g, ' ')}
                                            </span>
                                        </div>

                                        {building ? (
                                            <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5 mb-3">
                                                <Clock className="w-3 h-3" /> ETA {formatDuration(eta)}
                                            </div>
                                        ) : (
                                            <div className="mb-3">
                                                <div className="flex justify-between text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                                                    <span>Integrity</span>
                                                    <span className="font-mono">{Math.round(slot.integrity)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${slot.integrity < 30 ? 'bg-red-500'
                                                            : slot.integrity < 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                                            }`}
                                                        style={{ width: `${Math.max(0, Math.min(100, slot.integrity))}%` }}
                                                    />
                                                </div>
                                                {slot.integrity < 100 && slot.state !== 'destroyed' && (
                                                    <p className="text-[10px] text-slate-500 mt-1">
                                                        Effects scale with integrity — repairs run automatically out of siege.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-auto flex gap-2">
                                            {building ? (
                                                <button
                                                    disabled={actionLoading}
                                                    onClick={() => onDispatch(
                                                        'ORBITAL_CANCEL',
                                                        { planetId: planet.id, slotId: slot.slotId },
                                                        `Halting ${def.name} construction`
                                                    )}
                                                    className="flex-1 py-1.5 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                                >
                                                    CANCEL BUILD
                                                </button>
                                            ) : (
                                                <button
                                                    disabled={actionLoading}
                                                    onClick={() => onDispatch(
                                                        'ORBITAL_DEMOLISH',
                                                        { planetId: planet.id, slotId: slot.slotId },
                                                        `Scrapping ${def.name}`
                                                    )}
                                                    className="flex-1 py-1.5 rounded text-xs font-bold bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-900/50 transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    <Trash2 className="w-3 h-3" /> SCRAP
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
                {slots.length === 0 && (
                    <div className="p-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500">
                        This world has no orbital layer yet. Raise planetary infrastructure to open slots.
                    </div>
                )}
            </div>

            {/* Catalog */}
            <div>
                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-fuchsia-500" />
                    Orbital Construction
                </h3>

                {!hasStation && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 text-amber-300 text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            The station is the berth, traffic control and administration everything else
                            in orbit hangs off. Build it first.
                        </span>
                    </div>
                )}

                <div className="space-y-3">
                    {CATEGORY_ORDER.map(cat => {
                        const entries = ORBITAL_STRUCTURES.filter(s => s.category === cat);
                        const open = expandedCategory === cat;
                        return (
                            <div key={cat} className="border border-slate-800 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setExpandedCategory(open ? null : cat)}
                                    className="w-full px-4 py-3 flex items-center justify-between bg-slate-900/60 hover:bg-slate-900 transition-colors"
                                >
                                    <span className="flex items-center gap-2 text-sm font-bold tracking-wide text-slate-300 uppercase">
                                        {CATEGORY_ICON[cat]} {cat}
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">{entries.length}</span>
                                </button>

                                {open && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950/40">
                                        {entries.map(def => {
                                            const blocked = blockedReason(def.id);
                                            return (
                                                <div
                                                    key={def.id}
                                                    className={`p-4 rounded-xl border flex flex-col ${blocked
                                                        ? 'bg-slate-900/40 border-slate-800/60 opacity-70'
                                                        : 'bg-slate-900 border-slate-700 hover:border-fuchsia-500/40'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="font-semibold text-slate-200">{def.name}</h4>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                            T{def.tier}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mb-3 flex-1">{def.description}</p>

                                                    <div className="flex flex-wrap gap-2 text-[11px] mb-2">
                                                        <span className="text-emerald-400">{def.cost.credits} Cr</span>
                                                        {def.cost.metals > 0 && <span className="text-slate-300">{def.cost.metals} Met</span>}
                                                        {def.cost.chemicals > 0 && <span className="text-amber-300">{def.cost.chemicals} Chm</span>}
                                                        {def.cost.manpower > 0 && <span className="text-blue-300">{def.cost.manpower} Man</span>}
                                                        {(def.cost.rares ?? 0) > 0 && <span className="text-fuchsia-300">{def.cost.rares} Rx</span>}
                                                        <span className="text-slate-500 flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />{formatDuration(def.buildTimeSeconds)}
                                                        </span>
                                                        <span className="text-slate-500">HULL {def.hullStrength}</span>
                                                    </div>

                                                    <div className="text-[11px] text-emerald-400/80 bg-emerald-500/5 px-2 py-1.5 rounded mb-3">
                                                        {def.effects.map((e, i) => (
                                                            <span key={i} className="mr-2">
                                                                {e.type.replace(/_/g, ' ')} +{e.value}
                                                                {e.target ? ` (${e.target})` : ''}
                                                            </span>
                                                        ))}
                                                    </div>

                                                    <button
                                                        disabled={Boolean(blocked) || actionLoading}
                                                        onClick={() => onDispatch(
                                                            'ORBITAL_CONSTRUCT',
                                                            { planetId: planet.id, structureId: def.id },
                                                            `Laying down ${def.name}`
                                                        )}
                                                        className={`w-full py-2 rounded-lg text-sm font-medium transition-all mt-auto ${blocked
                                                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                            : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-600/20'
                                                            }`}
                                                    >
                                                        {def.upgradesFrom ? 'UPGRADE IN PLACE' : 'LAY DOWN'}
                                                    </button>
                                                    {blocked && (
                                                        <div className="text-[10px] text-center text-amber-500/80 mt-1.5 uppercase tracking-wider">
                                                            {blocked}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default OrbitalLayerTab;
