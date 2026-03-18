import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { TrendingUp, TrendingDown, Package, Zap, AlertCircle, Shield, Gavel, Globe, Truck } from 'lucide-react';
import { updateEconomicPolicyAction } from '@/app/actions/economy';
import { Resource } from '@/types/ui-state';

function MetricCard({
    label, value, unit = '', trend, color = '#f59e0b'
}: { label: string; value: number | string; unit?: string; trend?: 'up' | 'down'; color?: string }) {
    return (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3">
            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-1">{label}</div>
            <div className="flex items-end gap-1">
                <span className="text-xl font-mono font-bold" style={{ color }}>{value}</span>
                {unit && <span className="text-xs text-slate-500 mb-0.5">{unit}</span>}
                {trend === 'up' && <TrendingUp size={14} className="text-green-400 mb-0.5 ml-auto" />}
                {trend === 'down' && <TrendingDown size={14} className="text-red-400 mb-0.5 ml-auto" />}
            </div>
        </div>
    );
}

function PolicyBureau() {
    const { corporateState } = useUIStore();
    const [loading, setLoading] = useState(false);

    const handleUpdateTariff = async (res: Resource, value: number) => {
        setLoading(true);
        await updateEconomicPolicyAction({ tariffs: [{ resource: res, value }] });
        setLoading(false);
    };

    const handleUpdateSubsidy = async (res: Resource, value: number) => {
        setLoading(true);
        await updateEconomicPolicyAction({ subsidies: [{ resource: res, value }] });
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-3">
                <Gavel className="text-amber-500 shrink-0" size={18} />
                <div>
                    <div className="text-[10px] font-display font-bold text-amber-500 tracking-wider">FISCAL SOVEREIGNTY</div>
                    <div className="text-[10px] text-slate-400 leading-relaxed mt-1">
                        Adjust tariffs to tax imports or subsidize critical goods to maintain supply.
                    </div>
                </div>
            </div>

            {/* Tariffs & Subsidies */}
            <div className="space-y-3">
                <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-2">
                    <Truck size={10} /> RESOURCE POLICIES
                </div>
                {corporateState.markets.map(m => (
                    <div key={m.resource} className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1 bg-slate-800 rounded">
                                    <Package size={12} className="text-blue-400" />
                                </div>
                                <span className="text-xs font-bold text-slate-200">{m.resource}</span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">{m.currentPrice} MC/u</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-[9px] text-slate-500 mb-1 flex justify-between">
                                    <span>TARIFF RATE</span>
                                    <span className="text-amber-400">15%</span>
                                </div>
                                <div className="flex gap-1">
                                    {[0, 0.1, 0.25, 0.5].map(v => (
                                        <button 
                                            key={v}
                                            disabled={loading}
                                            onClick={() => handleUpdateTariff(m.resource, v)}
                                            className="flex-1 bg-slate-800 hover:bg-amber-600/20 border border-slate-700 text-[9px] py-1 rounded transition-colors"
                                        >
                                            {v * 100}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-500 mb-1 flex justify-between">
                                    <span>SUBSIDY</span>
                                    <span className="text-green-400">2.5c</span>
                                </div>
                                <div className="flex gap-1">
                                    {[0, 2, 5, 10].map(v => (
                                        <button 
                                            key={v}
                                            disabled={loading}
                                            onClick={() => handleUpdateSubsidy(m.resource, v)}
                                            className="flex-1 bg-slate-800 hover:bg-green-600/20 border border-slate-700 text-[9px] py-1 rounded transition-colors"
                                        >
                                            {v}c
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Embargoes */}
            <div>
                <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-2 mb-2">
                    <Shield size={10} /> SANCTIONS & EMBARGOES
                </div>
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-4 text-center">
                    <AlertCircle size={20} className="mx-auto text-slate-600 mb-2" />
                    <div className="text-xs text-slate-400 mb-3">No active embargoes against foreign factions.</div>
                    <button className="text-[10px] font-display tracking-widest text-blue-400 p-2 hover:bg-blue-400/10 rounded-lg border border-blue-400/30 transition-all">
                        ISSUE NEW TRADE EMBARGO
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function EconomyPanel() {
    const { regions, crisisEvents, setShowEconomicTerminal } = useUIStore();
    const [tab, setTab] = useState<'metrics' | 'policy'>('metrics');

    const totalVolume = regions.reduce((s, r) => s + r.metrics.tradeVolume, 0);
    const avgStability = Math.round(regions.reduce((s, r) => s + r.metrics.stabilityIndex, 0) / regions.length);
    const tradeEvents = crisisEvents.filter((e) => e.type === 'trade_war' && !e.resolved);

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/40 flex justify-between items-center">
                <div>
                    <h2 className="font-display text-sm tracking-widest text-amber-400 flex items-center gap-2">
                        {tab === 'metrics' ? <Globe size={16} /> : <Gavel size={16} />}
                        {tab === 'metrics' ? 'ECONOMY' : 'POLICY BUREAU'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {tab === 'metrics' ? 'Trade flows & regional volumes' : 'Fiscal tools & strategic trade control'}
                    </p>
                </div>
                <div className="flex bg-slate-900/80 p-1 rounded-lg border border-slate-700/50">
                    <button 
                        onClick={() => setTab('metrics')}
                        className={`px-3 py-1 text-[10px] font-display tracking-wider rounded transition-all ${tab === 'metrics' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        METRICS
                    </button>
                    <button 
                        onClick={() => setTab('policy')}
                        className={`px-3 py-1 text-[10px] font-display tracking-wider rounded transition-all ${tab === 'policy' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        POLICY
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {tab === 'metrics' ? (
                    <>
                        {/* Global metrics */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-2">GLOBAL INDICATORS</div>
                            <div className="grid grid-cols-2 gap-2">
                                <MetricCard label="TOTAL TRADE VOLUME" value={totalVolume.toLocaleString()} unit="units" trend="up" />
                                <MetricCard label="AVG STABILITY" value={avgStability} unit="/ 100" color="#22c55e" />
                                <MetricCard label="ACTIVE TRADE WARS" value={tradeEvents.length} color={tradeEvents.length > 0 ? '#ef4444' : '#22c55e'} />
                                <MetricCard label="TRADE ROUTES" value={220} />
                            </div>
                        </div>

                        {/* Regional breakdown */}
                        <div>
                            <div className="text-[10px] font-display tracking-widest text-slate-500 mb-2">REGIONAL TRADE</div>
                            <div className="space-y-2">
                                {regions.map((r) => (
                                    <div key={r.id} className="bg-slate-900/50 border border-slate-700/30 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                                                <span className="text-xs font-display text-slate-200">{r.name}</span>
                                            </div>
                                            <span className="text-[10px] font-display px-1.5 py-0.5 rounded"
                                                style={{
                                                    color: r.status === 'stable' ? '#22c55e' : r.status === 'emerging' ? '#a855f7' : '#f59e0b',
                                                    backgroundColor: r.status === 'stable' ? '#22c55e18' : r.status === 'emerging' ? '#a855f718' : '#f59e0b18',
                                                }}
                                            >
                                                {r.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                                            <div>
                                                <div className="text-slate-500">VOLUME</div>
                                                <div className="font-mono text-amber-400">{r.metrics.tradeVolume.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <div className="text-slate-500">PIRATE%</div>
                                                <div className="font-mono text-red-400">{Math.round(r.metrics.pirateShare * 100)}%</div>
                                            </div>
                                            <div>
                                                <div className="text-slate-500">STRENGTH</div>
                                                <div className="font-mono text-slate-300">{r.metrics.strengthScore}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Active trade crises */}
                        {tradeEvents.length > 0 && (
                            <div>
                                <div className="text-[10px] font-display tracking-widest text-red-400 mb-2 flex items-center gap-1">
                                    <AlertCircle size={10} /> ACTIVE TRADE DISPUTES
                                </div>
                                {tradeEvents.map((e) => (
                                    <div key={e.id} className="bg-red-950/30 border border-red-800/40 rounded p-2 text-xs text-slate-300 mb-1">
                                        <span className="font-display text-red-400">{e.type.replace('_', ' ').toUpperCase()}</span>
                                        &nbsp;· {e.targetFactionId.replace('faction-', '')} · {e.severity}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <PolicyBureau />
                )}
            </div>

            {/* Terminal Entry Point */}
            <div className="p-6 border-t border-slate-700/40">
                <button 
                    onClick={() => setShowEconomicTerminal(true)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-display text-[10px] tracking-widest font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.2)]"
                >
                    <Zap size={14} />
                    OPEN GLOBAL MARKET FEED
                </button>
            </div>
        </div>
    );
}
