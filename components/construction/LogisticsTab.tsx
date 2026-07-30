'use client';

// components/construction/LogisticsTab.tsx
// Storage, haulage, blockade and the world's declared role — the four things
// that decide whether what a planet produces ever reaches anything.

import React from 'react';
import {
    Warehouse, Truck, ShieldAlert, Target, AlertTriangle, Check, Clock, Trash2,
} from 'lucide-react';
import { LOGISTICS_PRIORITIES } from '@/lib/logistics/distribution-types';
import type { LogisticsPriority } from '@/lib/logistics/distribution-types';
import { STORABLE_RESOURCES } from '@/lib/logistics/storage-types';
import { SPECIALIZATIONS, SPECIALIZATION_BY_ID } from '@/data/specializations';
import type { Planet } from '@/lib/construction/construction-types';

function formatDuration(seconds: number): string {
    if (seconds <= 0) return 'now';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function compact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toFixed(0);
}

const PRIORITY_BLURB: Record<LogisticsPriority, string> = {
    balanced: 'Every consumer served alike.',
    military: 'War materiel first. Consumer chains and the build queue give way.',
    construction: 'The build queue first. Manufacturing gives way.',
    civilian: 'Consumer goods first. War materiel gives way.',
};

interface Props {
    planet: Planet;
    layer: any;
    nowSeconds: number;
    actionLoading: boolean;
    onDispatch: (actionId: string, payload: Record<string, any>, label: string) => Promise<void>;
}

export function LogisticsTab({ planet, layer, nowSeconds, actionLoading, onDispatch }: Props) {
    const storage = layer?.storage;
    const stockpile = layer?.stockpile as Record<string, number> | null | undefined;
    const logistics = layer?.logistics;
    const blockade = layer?.blockade;
    const priority: LogisticsPriority = layer?.logisticsPriority ?? 'balanced';
    const specOptions: Array<{ id: string; qualification: { qualified: boolean; missing: string[] } }> =
        layer?.specialization?.options ?? [];
    const suggestion: string | null = layer?.specialization?.suggestion ?? null;

    const declared = planet.specializationState;
    const declaredDef = declared ? SPECIALIZATION_BY_ID[declared.id] : undefined;
    const retooling = declared?.transitionEndsAtSeconds
        ? nowSeconds < declared.transitionEndsAtSeconds
        : false;
    const locked = declared ? nowSeconds < declared.lockedUntilSeconds : false;

    return (
        <div className="space-y-8">
            {/* Blockade banner */}
            {blockade?.active && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 text-red-400">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm space-y-1">
                        <p className="font-bold">
                            BLOCKADED — cordon {(blockade.severity * 100).toFixed(0)}%
                            {blockade.starving ? ' · STARVING' : ''}
                        </p>
                        <p className="text-red-300/90">
                            {blockade.importsCut
                                ? 'Imports severed and this world is cut out of in-system pooling.'
                                : 'Trade throttled proportionally; imports still arriving.'}
                            {blockade.orbitalStoresCut && ' Orbital warehouses are unreachable from the surface.'}
                        </p>
                        {Number.isFinite(blockade.hoursOfCover) && (
                            <p className="text-red-300/90 font-mono text-xs">
                                Essential stores last ~{blockade.hoursOfCover.toFixed(1)}h at current draw.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Haulage */}
            <div>
                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-500" />
                    Distribution Network
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    {[
                        { label: 'Haulage', value: Math.round(logistics?.capacity ?? 0) },
                        { label: 'Demand', value: Math.round(logistics?.demand ?? 0) },
                        { label: 'Coverage', value: `${((logistics?.coverageRatio ?? 0) * 100).toFixed(0)}%` },
                        { label: 'Efficiency', value: `×${(logistics?.efficiency ?? 1).toFixed(2)}` },
                    ].map(stat => (
                        <div key={stat.label} className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{stat.label}</div>
                            <div className="text-lg font-mono text-slate-200">{stat.value}</div>
                        </div>
                    ))}
                </div>

                {logistics?.congested && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 text-amber-300 text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            Congested. Goods are sitting in stores the depot network cannot move fast
                            enough — build depots, or freight terminals under Infrastructure.
                        </span>
                    </div>
                )}

                {/* Priority selector */}
                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">
                        Haulage Priority
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {LOGISTICS_PRIORITIES.map(p => {
                            const active = priority === p;
                            return (
                                <button
                                    key={p}
                                    disabled={actionLoading || active}
                                    onClick={() => onDispatch(
                                        'PLANET_SET_LOGISTICS_PRIORITY',
                                        { planetId: planet.id, priority: p },
                                        `Haulage priority: ${p}`
                                    )}
                                    className={`p-3 rounded-lg text-left border transition-all ${active
                                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-amber-500/30 hover:text-slate-200'
                                        }`}
                                >
                                    <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
                                        {active && <Check className="w-3 h-3" />}
                                        {p}
                                    </div>
                                    <div className="text-[10px] mt-1 leading-snug opacity-80">{PRIORITY_BLURB[p]}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Storage */}
            <div>
                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-emerald-500" />
                    Planetary Storage
                </h3>

                {!storage ? (
                    <div className="p-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500">
                        No storage report yet — the economy tick has not run for this world.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {STORABLE_RESOURCES.map(res => {
                            const cap = storage.capacity?.[res] ?? 0;
                            const held = stockpile?.[res] ?? 0;
                            const wasted = storage.wastedLastTick?.[res] ?? 0;
                            const pressured = (storage.pressuredResources ?? []).includes(res);
                            // Fill can exceed 100% on a save that predates storage, or after a
                            // warehouse is lost — that excess drains rather than vanishing, so
                            // show the overfill instead of clamping it out of sight.
                            const fill = cap > 0 ? (held / cap) * 100 : 0;
                            const overfull = fill > 100;
                            return (
                                <div key={res} className="flex items-center gap-3 px-3 py-2 bg-slate-900/40 border border-slate-800 rounded-lg">
                                    <div className="w-20 text-xs font-bold uppercase tracking-wider text-slate-400">{res}</div>
                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${overfull ? 'bg-red-500' : pressured ? 'bg-amber-500' : 'bg-emerald-600'
                                                }`}
                                            style={{ width: `${Math.max(0, Math.min(100, fill))}%` }}
                                        />
                                    </div>
                                    <div className="w-32 text-right font-mono text-xs text-slate-300">
                                        {compact(held)} / {compact(cap)}
                                        <span className={`ml-1.5 ${overfull ? 'text-red-400' : 'text-slate-500'}`}>
                                            {fill.toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="w-28 text-right font-mono text-xs">
                                        {wasted > 0
                                            ? <span className="text-red-400">−{compact(wasted)} wasted</span>
                                            : <span className="text-slate-600">no overflow</span>}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2">
                            <span>Warehouse handling rating: <span className="font-mono text-slate-300">{Math.round(storage.throughput ?? 0)}</span></span>
                            <span>Fullest resource at <span className="font-mono text-slate-300">{((storage.peakUtilization ?? 0) * 100).toFixed(0)}%</span></span>
                        </div>
                        {(storage.pressuredResources ?? []).length > 0 && (
                            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 text-amber-300 text-xs">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                    At capacity: {(storage.pressuredResources ?? []).join(', ')}. Everything
                                    produced past the cap is being wasted — build silos, warehouses or an
                                    orbital warehouse.
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Specialization */}
            <div>
                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-500" />
                    Planetary Role
                </h3>

                {declared && declaredDef ? (
                    <div className="p-4 mb-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-indigo-300 text-lg">{declaredDef.name}</h4>
                                <p className="text-xs text-slate-400 mt-1">{declaredDef.tradeoff}</p>
                            </div>
                            <button
                                disabled={actionLoading || locked}
                                onClick={() => onDispatch(
                                    'PLANET_CLEAR_SPECIALIZATION',
                                    { planetId: planet.id },
                                    `Abandoning ${declaredDef.name} role`
                                )}
                                className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors flex items-center gap-1.5 ${locked
                                    ? 'bg-slate-800/50 text-slate-600 border-slate-800 cursor-not-allowed'
                                    : 'bg-red-950/40 hover:bg-red-900/50 text-red-300 border-red-900/50'
                                    }`}
                            >
                                <Trash2 className="w-3 h-3" /> ABANDON
                            </button>
                        </div>
                        {retooling && (
                            <div className="mt-3 text-xs font-mono text-amber-400 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                RETOOLING — effects at half strength, stability penalty active.
                                Settles in {formatDuration((declared.transitionEndsAtSeconds ?? 0) - nowSeconds)}.
                            </div>
                        )}
                        {locked && !retooling && (
                            <div className="mt-3 text-xs font-mono text-slate-500 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                Locked for another {formatDuration(declared.lockedUntilSeconds - nowSeconds)} before the role can change.
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-4 mb-4 bg-slate-900/50 border border-slate-800 rounded-xl text-sm text-slate-400">
                        This world has no declared role. Roles are chosen, not inferred — pick one and the
                        world retools into it.
                        {suggestion && SPECIALIZATION_BY_ID[suggestion] && (
                            <span className="text-indigo-300">
                                {' '}What has been built here looks like a {SPECIALIZATION_BY_ID[suggestion].name}.
                            </span>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {SPECIALIZATIONS.map(def => {
                        const option = specOptions.find(o => o.id === def.id);
                        const qualified = option?.qualification?.qualified ?? false;
                        const missing = option?.qualification?.missing ?? [];
                        const isCurrent = declared?.id === def.id;
                        const isSwitch = Boolean(declared) && !isCurrent;
                        const cost = def.declareCost * (isSwitch ? 2 : 1);
                        const blocked = isCurrent || locked || !qualified;

                        return (
                            <div
                                key={def.id}
                                className={`p-4 rounded-xl border flex flex-col ${isCurrent
                                    ? 'bg-indigo-500/10 border-indigo-500/40'
                                    : qualified
                                        ? 'bg-slate-900 border-slate-700 hover:border-indigo-500/40'
                                        : 'bg-slate-900/40 border-slate-800/60 opacity-70'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-semibold text-slate-200">{def.name}</h4>
                                    {def.uniquePerEmpire && (
                                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                            One per empire
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 mb-2">{def.description}</p>
                                <p className="text-[11px] text-amber-400/80 italic mb-3">{def.tradeoff}</p>

                                <div className="text-[11px] bg-slate-950/50 rounded p-2 mb-3 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                    {Object.entries(def.effects).map(([key, value]) => {
                                        const flat = ['stability', 'happiness', 'espionageResistance'].includes(key);
                                        const good = flat ? (value as number) > 0 : (value as number) > 1;
                                        return (
                                            <div key={key} className="flex justify-between">
                                                <span className="text-slate-500 truncate">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                                                <span className={good ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                                                    {flat ? `${(value as number) > 0 ? '+' : ''}${value}` : `×${value}`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button
                                    disabled={blocked || actionLoading}
                                    onClick={() => onDispatch(
                                        'PLANET_SET_SPECIALIZATION',
                                        { planetId: planet.id, specializationId: def.id },
                                        `Declaring ${def.name}`
                                    )}
                                    className={`w-full py-2 rounded-lg text-sm font-medium transition-all mt-auto ${blocked
                                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                                        }`}
                                >
                                    {isCurrent ? 'CURRENT ROLE' : `DECLARE — ${cost} Cr${isSwitch ? ' (retool)' : ''}`}
                                </button>

                                {!qualified && missing.length > 0 && (
                                    <div className="text-[10px] text-amber-500/80 mt-1.5 leading-snug">
                                        Needs: {missing.join('; ')}
                                    </div>
                                )}
                                {qualified && locked && !isCurrent && (
                                    <div className="text-[10px] text-center text-slate-500 mt-1.5 uppercase tracking-wider">
                                        Retooling lockout active
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

export default LogisticsTab;
