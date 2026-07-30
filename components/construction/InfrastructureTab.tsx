'use client';

// components/construction/InfrastructureTab.tsx
// The five engineering tracks under the buildings. Levels, integrity, what each
// one is currently buying, and what the next level costs.

import React from 'react';
import { Route, Zap, Radio, Droplets, Container, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { INFRASTRUCTURE_TRACKS } from '@/data/infrastructure-tracks';
import {
    INFRASTRUCTURE_TRACK_IDS,
    MAX_TRACK_LEVEL,
    TRACK_EFFECTS,
} from '@/lib/infrastructure/infrastructure-types';
import type { InfrastructureTrackId } from '@/lib/infrastructure/infrastructure-types';
import { upgradeCost, upgradeDuration } from '@/lib/infrastructure/infrastructure-service';
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

const TRACK_ICON: Record<InfrastructureTrackId, React.ReactNode> = {
    transit: <Route className="w-4 h-4" />,
    power_grid: <Zap className="w-4 h-4" />,
    comms: <Radio className="w-4 h-4" />,
    water: <Droplets className="w-4 h-4" />,
    freight: <Container className="w-4 h-4" />,
};

/** Human phrasing for what a track buys, per level. */
const EFFECT_LABEL: Record<string, string> = {
    constructionSpeed: 'construction speed',
    productionEfficiency: 'production efficiency',
    haulageBonus: 'haulage',
    storageThroughputBonus: 'warehouse handling',
    foodOutput: 'food output',
    populationGrowth: 'population growth',
    stability: 'stability',
    unrestRecovery: 'unrest recovery',
    militaryMovement: 'troop redeployment',
    tradeThroughput: 'trade throughput',
};

const FLAT_EFFECTS = new Set(['haulageBonus', 'storageThroughputBonus', 'stability']);

interface Props {
    planet: Planet;
    layer: any;
    nowSeconds: number;
    actionLoading: boolean;
    onDispatch: (actionId: string, payload: Record<string, any>, label: string) => Promise<void>;
}

export function InfrastructureTab({ planet, layer, nowSeconds, actionLoading, onDispatch }: Props) {
    const network = planet.infrastructure;
    const effects = layer?.infrastructure?.effects;
    const upkeep = layer?.infrastructure?.upkeepPerHour;
    const unpaid = network?.unpaidTicks ?? 0;

    return (
        <div className="space-y-8">
            {/* Network summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Derived Level</div>
                    <div className="text-lg font-mono text-slate-200">{planet.infrastructureLevel ?? 1} / {MAX_TRACK_LEVEL}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">mean of the five tracks</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Upkeep / hr</div>
                    <div className="text-lg font-mono text-slate-200">{Math.round(upkeep?.credits ?? 0)} Cr</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                        + {Math.round(upkeep?.energy ?? 0)} Nrg, {Math.round(upkeep?.metals ?? 0)} Met
                    </div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Build Speed</div>
                    <div className="text-lg font-mono text-emerald-400">×{(effects?.constructionSpeed ?? 1).toFixed(2)}</div>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Production</div>
                    <div className="text-lg font-mono text-emerald-400">×{(effects?.productionEfficiency ?? 1).toFixed(2)}</div>
                </div>
            </div>

            {unpaid > 0 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3 text-amber-300">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold">UPKEEP UNPAID ({unpaid} ticks)</p>
                        <p className="text-amber-200/80">
                            Credits come from the treasury; energy and metals come off this planet's own
                            stockpile. Sustained shortfall eats the network's integrity.
                        </p>
                    </div>
                </div>
            )}

            {/* Tracks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {INFRASTRUCTURE_TRACK_IDS.map(trackId => {
                    const def = INFRASTRUCTURE_TRACKS.find(t => t.id === trackId)!;
                    const track = network?.tracks?.[trackId];
                    const level = track?.level ?? 0;
                    const integrity = track?.integrity ?? 100;
                    const upgrading = Boolean(track?.upgrade);
                    const maxed = level >= MAX_TRACK_LEVEL;

                    const cost = maxed ? undefined : upgradeCost(trackId, level);
                    const duration = maxed ? 0 : upgradeDuration(trackId, level);
                    const eta = upgrading && track?.upgrade
                        ? track.upgrade.completesAtSeconds - nowSeconds
                        : 0;

                    const contributions = TRACK_EFFECTS[trackId];
                    const effectiveLevel = level * (integrity / 100);

                    return (
                        <div key={trackId} className="p-5 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col">
                            <div className="flex justify-between items-start mb-3">
                                <h4 className="font-bold text-slate-200 flex items-center gap-2">
                                    <span className="text-cyan-400">{TRACK_ICON[trackId]}</span>
                                    {def.name}
                                </h4>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: MAX_TRACK_LEVEL }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-2.5 h-5 rounded-sm ${i < level ? 'bg-cyan-500' : 'bg-slate-800'}`}
                                        />
                                    ))}
                                    <span className="ml-2 font-mono text-sm text-slate-300">{level}</span>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 mb-4">{def.description}</p>

                            {/* Integrity */}
                            <div className="mb-4">
                                <div className="flex justify-between text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">
                                    <span>Integrity</span>
                                    <span className="font-mono">{Math.round(integrity)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 ${integrity < 40 ? 'bg-red-500' : integrity < 80 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`}
                                        style={{ width: `${Math.max(0, Math.min(100, integrity))}%` }}
                                    />
                                </div>
                                {integrity < 100 && (
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Performing as level {effectiveLevel.toFixed(1)} — damage scales the contribution down.
                                    </p>
                                )}
                            </div>

                            {/* What it buys */}
                            <div className="text-[11px] bg-slate-950/50 rounded p-2 mb-4 space-y-1">
                                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                                    Currently providing
                                </div>
                                {Object.entries(contributions).map(([key, perLevel]) => {
                                    const total = (perLevel ?? 0) * effectiveLevel;
                                    const flat = FLAT_EFFECTS.has(key);
                                    return (
                                        <div key={key} className="flex justify-between">
                                            <span className="text-slate-500 capitalize">{EFFECT_LABEL[key] ?? key}</span>
                                            <span className={total > 0 ? 'text-emerald-400 font-mono' : 'text-slate-600 font-mono'}>
                                                {flat ? `+${total.toFixed(1)}` : `+${(total * 100).toFixed(0)}%`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Upgrade */}
                            <div className="mt-auto">
                                {upgrading ? (
                                    <>
                                        <div className="text-xs font-mono text-cyan-400 flex items-center gap-1.5 mb-2">
                                            <Clock className="w-3 h-3" />
                                            Upgrading to {track?.upgrade?.targetLevel} — ETA {formatDuration(eta)}
                                        </div>
                                        <button
                                            disabled={actionLoading}
                                            onClick={() => onDispatch(
                                                'INFRA_CANCEL_TRACK',
                                                { planetId: planet.id, trackId },
                                                `Abandoning ${def.name} upgrade`
                                            )}
                                            className="w-full py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                        >
                                            ABANDON (no refund)
                                        </button>
                                    </>
                                ) : maxed ? (
                                    <div className="w-full py-2 rounded-lg text-xs font-bold text-center bg-slate-800/50 text-slate-500 border border-slate-800">
                                        MAXIMUM LEVEL
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap gap-2 text-[11px] mb-2">
                                            <span className="text-emerald-400">{cost?.credits} Cr</span>
                                            {(cost?.metals ?? 0) > 0 && <span className="text-slate-300">{cost?.metals} Met</span>}
                                            {(cost?.chemicals ?? 0) > 0 && <span className="text-amber-300">{cost?.chemicals} Chm</span>}
                                            {(cost?.manpower ?? 0) > 0 && <span className="text-blue-300">{cost?.manpower} Man</span>}
                                            <span className="text-slate-500 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />{formatDuration(duration)}
                                            </span>
                                        </div>
                                        <button
                                            disabled={actionLoading}
                                            onClick={() => onDispatch(
                                                'INFRA_UPGRADE_TRACK',
                                                { planetId: planet.id, trackId },
                                                `Expanding ${def.name}`
                                            )}
                                            className="w-full py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition-all flex items-center justify-center gap-2"
                                        >
                                            <TrendingUp className="w-4 h-4" />
                                            EXPAND TO LEVEL {level + 1}
                                        </button>
                                        <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                                            Materials come off this planet's stockpile, not the empire pool.
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default InfrastructureTab;
