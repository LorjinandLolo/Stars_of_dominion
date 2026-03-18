"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { X, Tag, Shield, TrendingUp, Zap, Users, Navigation, Search, Sparkles } from 'lucide-react';
import { surveySystemAction } from '@/app/actions/exploration';
import { calculateBiosphereModifiers } from '@/lib/economy/biosphere-traits';
import { ResourceId } from '@/lib/economy/economy-types';
import { executePlayerAction } from '@/app/actions/registry-handler';
import { getSystemBuildingsAction } from '@/app/actions/construction-sim';
import { LayoutGrid } from 'lucide-react';

function StatBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
            />
        </div>
    );
}

function StatRow({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
    const pct = (value / max) * 100;
    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-display tracking-wide">{label}</span>
                <span className="font-mono" style={{ color }}>{value}</span>
            </div>
            <StatBar value={pct} color={color} />
        </div>
    );
}

export default function SystemContextPanel() {
    const { 
        selectedSystemId, 
        systems, 
        regions, 
        setSelectedSystem, 
        selectedFleetId,
        setSelectedFleetId,
        setSelectedPlanet,
    } = useUIStore();
    const [moving, setMoving] = React.useState(false);
    const [surveying, setSurveying] = React.useState(false);
    const [planets, setPlanets] = React.useState<any[]>([]);
    const [loadingPlanets, setLoadingPlanets] = React.useState(false);

    React.useEffect(() => {
        if (selectedSystemId) {
            setLoadingPlanets(true);
            getSystemBuildingsAction(selectedSystemId)
                .then(res => {
                    if (res.success && res.data) {
                        setPlanets(res.data.planets);
                    }
                })
                .finally(() => setLoadingPlanets(false));
        }
    }, [selectedSystemId]);

    const system = systems.find((s) => s.id === selectedSystemId);
    if (!system) return null;

    const region = regions.find((r) => r.systemIds.includes(system.id));

    const statusColor = (v: number) =>
        v < 33 ? '#22c55e' : v < 66 ? '#f59e0b' : '#ef4444';

    const modifiers = calculateBiosphereModifiers(system.tags);
    const hasActiveModifiers = Object.values(modifiers).some(m => m !== 1.0 && m !== undefined);

    return (
        <div className="absolute top-4 right-4 z-30 w-72 pointer-events-auto">
            <div className="bg-slate-950/95 backdrop-blur-md border border-slate-700/60 rounded-lg shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-start justify-between px-4 py-3 border-b border-slate-700/60">
                    <div>
                        <h3 className="font-display text-sm text-amber-400 tracking-widest truncate">{system.name}</h3>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                            [{system.q}, {system.r}]
                        </div>
                    </div>
                    <button
                        onClick={() => setSelectedSystem(null)}
                        className="text-slate-500 hover:text-slate-200 transition-colors mt-0.5"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 py-3 space-y-4">
                    {/* Region badge */}
                    {region && (
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: region.color }}
                            />
                            <span className="text-xs text-slate-300 font-display tracking-wide">{region.name}</span>
                            <span
                                className="ml-auto text-[10px] font-display px-1.5 py-0.5 rounded"
                                style={{
                                    color: region.color,
                                    backgroundColor: `${region.color}22`,
                                    border: `1px solid ${region.color}44`,
                                }}
                            >
                                {region.status.toUpperCase()}
                            </span>
                        </div>
                    )}

                    {/* Owner */}
                    {system.ownerId && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Users size={12} className="text-slate-500" />
                            <span className="text-slate-300">{system.ownerId.replace('faction-', '').toUpperCase()}</span>
                        </div>
                    )}

                    {/* Tags */}
                    {system.tags.length > 0 && system.isSurveyed !== false && (
                        <div className="flex flex-wrap gap-1">
                            {system.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="flex items-center gap-1 text-[10px] font-display px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700"
                                >
                                    <Tag size={9} />
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Anomaly Discovery */}
                    {system.anomaly && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
                            <div className="flex items-center gap-2 text-amber-400">
                                <Sparkles size={14} />
                                <span className="text-[10px] font-display tracking-widest uppercase">{system.anomaly.name}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-tight">{system.anomaly.description}</p>
                            {system.anomaly.bonus && (
                                <div className="flex gap-2">
                                    {Object.entries(system.anomaly.bonus).map(([k, v]) => (
                                        <span key={k} className="text-[9px] font-mono text-amber-500/80 uppercase">
                                            {k}: +{v}%
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Survey Button */}
                    {system.isSurveyed === false && (
                        <div className="py-2">
                            <button
                                disabled={surveying}
                                onClick={async () => {
                                    setSurveying(true);
                                    const res = await surveySystemAction(system.id);
                                    if (res.success) {
                                        useUIStore.getState().updateSystem(system.id, {
                                            isSurveyed: true,
                                            anomaly: res.anomaly as any
                                        });
                                    }
                                    setSurveying(false);
                                }}
                                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-slate-950 font-display text-[10px] tracking-[0.2em] rounded flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                            >
                                <Search size={14} />
                                {surveying ? 'ANALYZING SPECTRUM...' : 'SURVEY SYSTEM'}
                            </button>
                            <p className="text-[9px] text-slate-500 mt-2 text-center italic">
                                Scanners restricted. Full data unavailable until surveyed.
                            </p>
                        </div>
                    )}

                    {/* Resource Biosphere Modifiers */}
                    {hasActiveModifiers && system.isSurveyed !== false && (
                        <div className="mt-3 pt-3 border-t border-slate-700/60">
                            <span className="text-[10px] text-slate-500 font-display tracking-widest mb-1.5 block">PLANETARY OUTPUT</span>
                            <div className="grid grid-cols-2 gap-2">
                                {(['metals', 'chemicals', 'energy', 'food', 'rare'] as ResourceId[]).map(res => {
                                    const mod = modifiers[res];
                                    if (mod === undefined || mod === 1.0) return null;
                                    const isPositive = mod > 1.0;
                                    return (
                                        <div key={res} className="flex justify-between items-center text-[10px] bg-slate-800/50 px-2 py-1.5 rounded border border-slate-700/50">
                                            <span className="text-slate-400 capitalize">{res.replace('_', ' ')}</span>
                                            <span className={isPositive ? 'text-green-400 font-mono font-bold' : 'text-red-400 font-mono font-bold'}>
                                                {isPositive ? '+' : ''}{Math.round(mod)}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    {system.isSurveyed !== false ? (
                        <div className="space-y-2.5">
                            <StatRow label="SECURITY" value={system.security} color={statusColor(100 - system.security)} />
                            <StatRow label="TRADE VALUE" value={system.tradeValue} color="#f59e0b" />
                            <StatRow label="INSTABILITY" value={system.instability} color={statusColor(system.instability)} />
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-display tracking-wide flex items-center gap-1">
                                        <Zap size={10} /> ESCALATION
                                    </span>
                                    <span className="font-mono text-orange-400">{system.escalationLevel}/10</span>
                                </div>
                                <div className="flex gap-0.5">
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <div
                                            key={i}
                                            className="h-2 flex-1 rounded-sm"
                                            style={{
                                                backgroundColor:
                                                    i < system.escalationLevel
                                                        ? i < 4 ? '#22c55e' : i < 7 ? '#f59e0b' : '#ef4444'
                                                        : '#1e293b',
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 py-4 opacity-30 pointer-events-none grayscale">
                             <div className="h-2 bg-slate-800 rounded w-full animate-pulse" />
                             <div className="h-2 bg-slate-800 rounded w-full animate-pulse" />
                             <div className="h-2 bg-slate-800 rounded w-full animate-pulse" />
                        </div>
                    )}

                    {/* Planets / Construction */}
                    {planets.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-700/60">
                            <span className="text-[10px] text-slate-500 font-display tracking-widest mb-2 block uppercase">Planetary Assets</span>
                            <div className="space-y-2">
                                {planets.map(planet => (
                                    <div key={planet.id} className="bg-slate-900/40 border border-slate-800 rounded p-2 flex items-center justify-between">
                                        <div>
                                            <div className="text-xs font-medium text-slate-200">{planet.name}</div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <div className="text-[10px] text-slate-500 uppercase">{planet.planetType}</div>
                                                {planet.tags && planet.tags.length > 0 && (
                                                    <>
                                                        <span className="w-0.5 h-0.5 rounded-full bg-slate-700" />
                                                        <div className="text-[10px] text-amber-500/80 font-display tracking-wider uppercase">{planet.tags[0]}</div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedPlanet(planet.id)}
                                            className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 rounded text-[10px] text-emerald-400 font-bold transition-all flex items-center gap-1"
                                        >
                                            <LayoutGrid size={10} />
                                            CONSTRUCT
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fleet Deployment Controls */}
                    {selectedFleetId && (
                        <div className="mt-4 pt-4 border-t border-slate-700/60">
                            <button
                                disabled={moving}
                                onClick={async () => {
                                    setMoving(true);
                                    try {
                                        const res = await executePlayerAction({
                                            id: `act_${Date.now()}`,
                                            actionId: 'MIL_MOVE_FLEET',
                                            issuerId: 'PLAYER_FACTION', // TODO: Get from store
                                            targetId: system.id,
                                            payload: { fleetId: selectedFleetId, destinationId: system.id },
                                            timestamp: Math.floor(Date.now() / 1000)
                                        });
                                        if (res.success) {
                                            setSelectedFleetId(null);
                                            setSelectedSystem(null);
                                        } else {
                                            console.error("Move failed:", res.error);
                                        }
                                    } finally {
                                        setMoving(false);
                                    }
                                }}
                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs tracking-wider font-bold transition-all shadow-lg flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Navigation className="w-4 h-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                                {moving ? 'PLOTTING COURSE...' : 'DEPLOY FLEET HERE'}
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
