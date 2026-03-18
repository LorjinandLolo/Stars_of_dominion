'use client';

import React, { useState } from 'react';
import { 
    BarChart3, 
    Handshake, 
    ShieldAlert, 
    Map as MapIcon, 
    ArrowUpRight, 
    ArrowDownLeft, 
    TrendingUp, 
    TrendingDown,
    Globe,
    Lock,
    Unlock,
    Settings,
    ShieldOff as ShieldSlash
} from 'lucide-react';
import { Resource, Market, TradeAgreement, TradeRoute, Faction } from '@/lib/trade-system/types';
import { proposeTradeAgreementAction, updateEconomicPolicyAction, updateProductionFocusAction } from '@/app/actions/economy';
import { Zap, Factory, Shield, Atom, Users, Landmark, AlertTriangle } from 'lucide-react';

interface EconomicTerminalProps {
    markets: Market[];
    agreements: TradeAgreement[];
    routes: TradeRoute[];
    factions: Faction[];
    playerFactionId: string;
    currentPolicies?: any;
}

type Tab = 'market' | 'agreements' | 'warfare' | 'routes';

export default function EconomicTerminal({ 
    markets, 
    agreements, 
    routes, 
    factions,
    playerFactionId,
    currentPolicies
}: EconomicTerminalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('market');
    const [selectedFactionId, setSelectedFactionId] = useState<string>('');
    const [agreementResource, setAgreementResource] = useState<Resource>(Resource.METALS);
    const [agreementVolume, setAgreementVolume] = useState<number>(100);

    const getFactionName = (id: string) => factions.find(f => f.id === id)?.name || id;

    return (
        <div className="flex h-[700px] w-[1100px] bg-[#0a0c10] border border-[#1e293b] rounded-xl overflow-hidden shadow-2xl font-sans text-slate-200">
            {/* Sidebar */}
            <div className="w-64 bg-[#0f172a] border-r border-[#1e293b] flex flex-col">
                <div className="p-6 border-b border-[#1e293b]">
                    <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                        <Globe className="text-blue-400" size={20} />
                        ECON TERMINAL
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">Galactic Commerce Hub</p>
                </div>
                
                <nav className="flex-1 p-4 space-y-2">
                    <TabButton 
                        active={activeTab === 'market'} 
                        onClick={() => setActiveTab('market')}
                        icon={<BarChart3 size={18} />}
                        label="Market Dashboard"
                    />
                    <TabButton 
                        active={activeTab === 'agreements'} 
                        onClick={() => setActiveTab('agreements')}
                        icon={<Handshake size={18} />}
                        label="Trade Agreements"
                    />
                    <TabButton 
                        active={activeTab === 'warfare'} 
                        onClick={() => setActiveTab('warfare')}
                        icon={<ShieldAlert size={18} />}
                        label="Economic Warfare"
                    />
                    <TabButton 
                        active={activeTab === 'routes'} 
                        onClick={() => setActiveTab('routes')}
                        icon={<MapIcon size={18} />}
                        label="Route Navigator"
                    />
                </nav>

                <div className="p-4 border-t border-[#1e293b] bg-[#0a0c10]/50">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span>Trade Efficiency</span>
                        <span className="text-blue-400 font-bold">84%</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[84%] shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,#1e293b22,transparent)]">
                {/* Header Bar */}
                <div className="h-14 bg-[#0f172a]/80 backdrop-blur-md border-b border-[#1e293b] px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 font-mono uppercase tracking-tighter">Status://Live_Feed</span>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] text-green-500 font-bold uppercase">Exchange Connected</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-6 px-4 py-1.5 bg-black/20 rounded-lg border border-slate-800/50">
                            <div className="flex items-center gap-2">
                                <Landmark className="text-amber-400" size={12} />
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Stability</span>
                                <span className={`text-[11px] font-mono font-bold ${factions.find(f => f.id === playerFactionId)?.metrics.confidenceIndex || 100 > 70 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {(factions.find(f => f.id === playerFactionId)?.metrics.confidenceIndex || 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="w-px h-4 bg-slate-800/50"></div>
                            <div className="flex items-center gap-2">
                                <Zap className="text-blue-400" size={12} />
                                <span className="text-[10px] text-slate-500 font-bold uppercase">Energy</span>
                                <span className="text-[11px] font-mono font-bold text-blue-400">
                                    {(factions.find(f => f.id === playerFactionId)?.metrics.energyLoad || 0).toLocaleString()} / {(factions.find(f => f.id === playerFactionId)?.metrics.energyLoad || 100).toLocaleString()} u
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">Credits</span>
                            <span className="text-amber-400 font-mono font-bold">{(factions.find(f => f.id === playerFactionId)?.creditSupply || 0).toLocaleString()}</span>
                        </div>
                        <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
                            <Settings size={16} />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    {activeTab === 'market' && (
                        <MarketDashboard 
                            markets={markets} 
                            factions={factions}
                            playerFactionId={playerFactionId}
                            policies={currentPolicies}
                        />
                    )}
                    {activeTab === 'agreements' && (
                        <AgreementsPanel 
                            agreements={agreements} 
                            factions={factions}
                            playerFactionId={playerFactionId}
                            onPropose={proposeTradeAgreementAction}
                        />
                    )}
                    {activeTab === 'warfare' && (
                        <WarfarePanel 
                            factions={factions} 
                            onUpdatePolicy={updateEconomicPolicyAction}
                        />
                    )}
                    {activeTab === 'routes' && <RoutesPanel routes={routes} />}
                </div>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button 
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                active 
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
        >
            <span className={active ? 'text-blue-400' : 'text-slate-600'}>{icon}</span>
            {label}
        </button>
    );
}

function MarketDashboard({ 
    markets, 
    factions, 
    playerFactionId, 
    policies 
}: { 
    markets: Market[]; 
    factions: Faction[]; 
    playerFactionId: string; 
    policies: any; 
}) {
    const playerFaction = factions.find(f => f.id === playerFactionId);
    const playerPolicy = Array.isArray(policies) 
        ? policies.find(([id]: [string, any]) => id === playerFactionId)?.[1] 
        : null;

    const handleFocusChange = async (res: Resource | null) => {
        await updateProductionFocusAction(res);
    };

    return (
        <div className="space-y-6">
            {/* Top Metrics: Backing & Stability */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Landmark size={12} className="text-amber-400" /> Credit Backing Health
                    </p>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-2xl font-bold text-slate-200">
                            {((playerFaction?.metrics.energyBackingRatio || 1) > 0 ? 94.2 : 10).toFixed(1)}%
                        </span>
                        <span className="text-[10px] font-bold text-green-500 uppercase">Stable</span>
                    </div>
                    <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[94%]" />
                    </div>
                </div>
                
                <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={12} className="text-red-400" /> Inflation Pressure
                    </p>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-2xl font-bold text-slate-200">
                            {(playerFaction?.metrics.inflationRate || 0 * 100).toFixed(1)}%
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Controlled</span>
                    </div>
                </div>

                <div className="bg-[#0f172a] border border-blue-500/20 p-5 rounded-xl bg-blue-500/5">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Zap size={12} /> Energy Surplus
                    </p>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-2xl font-bold text-blue-100">+242u</span>
                        <span className="text-[10px] font-bold text-blue-400 uppercase">Optimal</span>
                    </div>
                </div>
            </div>

            {/* Derived Capacities Layer */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Derived Empire Capacities</h3>
                <div className="grid grid-cols-4 gap-4">
                    <CapacityCard 
                        icon={<Factory size={16} className="text-orange-400" />} 
                        label="Construction" 
                        value="450" 
                        unit="MW" 
                        color="orange" 
                    />
                    <CapacityCard 
                        icon={<Shield size={16} className="text-red-400" />} 
                        label="Military" 
                        value="120" 
                        unit="TR" 
                        color="red" 
                    />
                    <CapacityCard 
                        icon={<Atom size={16} className="text-cyan-400" />} 
                        label="Research" 
                        value="85" 
                        unit="RP" 
                        color="cyan" 
                    />
                    <CapacityCard 
                        icon={<Users size={16} className="text-purple-400" />} 
                        label="Cultural" 
                        value="32" 
                        unit="IP" 
                        color="purple" 
                    />
                </div>
            </div>

            {/* Production Focus Selector */}
            <div className="bg-[#0f172a] border border-blue-900/20 rounded-xl p-5 border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Industrial Prioritization</h3>
                        <p className="text-xs text-slate-500 mt-1">Assign specialized focus to a trade resource (+25% yield, -10% others).</p>
                    </div>
                    <div className="flex gap-2">
                        {[Resource.METALS, Resource.CHEMICALS, Resource.AMMO, Resource.RARES].map(res => (
                            <button
                                key={res}
                                onClick={() => handleFocusChange(playerPolicy?.productionFocus === res ? null : res)}
                                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${
                                    playerPolicy?.productionFocus === res 
                                        ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                                }`}
                            >
                                {res}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#0a0c10] text-[10px] text-slate-500 font-bold uppercase tracking-widest border-b border-[#1e293b]">
                        <tr>
                            <th className="px-6 py-4">Commodity</th>
                            <th className="px-6 py-4 text-right">Price (Cr)</th>
                            <th className="px-6 py-4 text-right">Supply</th>
                            <th className="px-6 py-4 text-right">Demand</th>
                            <th className="px-6 py-4">Activity</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]">
                        {markets
                            .filter(m => ![
                                Resource.CONSTRUCTION, 
                                Resource.MILITARY_CAP, 
                                Resource.RESEARCH_CAP, 
                                Resource.CULTURAL_CAP
                            ].includes(m.resource))
                            .map((m, i) => (
                                <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${m.resource === playerPolicy?.productionFocus ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-600'}`}></div>
                                        <span className={`font-bold uppercase ${m.resource === playerPolicy?.productionFocus ? 'text-blue-400' : 'text-slate-200'}`}>
                                            {m.resource}
                                            {m.resource === playerPolicy?.productionFocus && <span className="ml-2 text-[8px] bg-blue-500/20 px-1 rounded">FOCUS</span>}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-mono text-amber-400">{m.currentPrice.toFixed(2)}</td>
                                <td className="px-6 py-4 text-right text-slate-400">{m.supply.toLocaleString()}</td>
                                <td className="px-6 py-4 text-right text-slate-400">{m.demand.toLocaleString()}</td>
                                <td className="px-6 py-4">
                                    <div className="w-24 h-6 flex items-end gap-0.5">
                                        {[...Array(12)].map((_, j) => (
                                            <div 
                                                key={j} 
                                                className={`w-1.5 rounded-t-sm ${m.resource === playerPolicy?.productionFocus ? 'bg-blue-500/50' : 'bg-slate-700/50'}`} 
                                                style={{ height: `${20 + Math.random() * 80}%` }}
                                            ></div>
                                        ))}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function CapacityCard({ icon, label, value, unit, color }: { icon: React.ReactNode, label: string, value: string, unit: string, color: string }) {
    const colors = {
        orange: 'group-hover:text-orange-400',
        red: 'group-hover:text-red-400',
        cyan: 'group-hover:text-cyan-400',
        purple: 'group-hover:text-purple-400'
    };
    
    return (
        <div className="bg-[#0a0c10] border border-slate-800 p-4 rounded-lg group hover:border-slate-600 transition-all">
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-slate-200">{value}</span>
                <span className="text-[10px] text-slate-600 font-bold">{unit}</span>
            </div>
        </div>
    )
}

function MarketStatCard({ label, value, trend, up }: { label: string, value: string, trend: string, up: boolean }) {
    return (
        <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-xl hover:border-slate-600 transition-colors">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{label}</p>
            <div className="flex items-end justify-between mt-2">
                <span className="text-2xl font-bold text-slate-200">{value}</span>
                <div className={`flex items-center gap-1 text-xs font-bold ${up ? 'text-green-500' : 'text-red-500'}`}>
                    {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {trend}
                </div>
            </div>
        </div>
    );
}

function AgreementsPanel({ 
    agreements, 
    factions, 
    playerFactionId,
    onPropose 
}: { 
    agreements: TradeAgreement[], 
    factions: Faction[],
    playerFactionId: string,
    onPropose: any
}) {
    const [targetId, setTargetId] = useState('');
    const [res, setRes] = useState<Resource>(Resource.METALS);
    const [vol, setVol] = useState(100);

    const handlePropose = async () => {
        if (!targetId) return;
        await onPropose(targetId, res, vol);
    };

    return (
        <div className="space-y-6">
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
                <h3 className="text-sm font-bold uppercase text-blue-400 mb-4 tracking-wider">New Agreement Proposal</h3>
                <div className="grid grid-cols-4 gap-4 items-end">
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Target Entity</label>
                        <select 
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            className="w-full bg-[#0a0c10] border border-[#1e293b] rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        >
                            <option value="">Select Faction...</option>
                            {factions.filter(f => f.id !== playerFactionId).map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Resource</label>
                        <select 
                            value={res}
                            onChange={(e) => setRes(e.target.value as Resource)}
                            className="w-full bg-[#0a0c10] border border-[#1e293b] rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        >
                            {Object.values(Resource).map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Volume/Hr</label>
                        <input 
                            type="number" 
                            value={vol}
                            onChange={(e) => setVol(Number(e.target.value))}
                            className="w-full bg-[#0a0c10] border border-[#1e293b] rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <button 
                        onClick={handlePropose}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-sm transition-all shadow-[0_4px_12px_rgba(37,99,235,0.3)] hover:translate-y-[-1px]"
                    >
                        Propose Agreement
                    </button>
                </div>
            </div>

            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[#1e293b] flex justify-between items-center bg-[#0a0c10]/30">
                    <h3 className="text-sm font-bold uppercase text-slate-400">Ledger of Active Agreements</h3>
                    <span className="text-xs text-slate-500">{agreements.length} Active Contracts</span>
                </div>
                <div className="divide-y divide-[#1e293b]">
                    {agreements.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 italic">No active agreements recorded.</div>
                    ) : (
                        agreements.map((ag, i) => (
                            <div key={i} className="px-6 py-5 flex items-center justify-between hover:bg-slate-800/20 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                                        <Handshake size={20} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-200 text-lg uppercase flex items-center gap-2">
                                            {ag.resource}
                                            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500">v{ag.volumePerHour}u/hr</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            Partner: <span className="text-slate-300">{factions.find(f => f.id === (ag.aFactionId === playerFactionId ? ag.bFactionId : ag.aFactionId))?.name}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-amber-500 font-mono">
                                        {ag.priceFormula === 'market' ? 'MARKET' : `${ag.fixedPrice} Cr`}
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-bold uppercase mt-1 tracking-tighter">Agreement ID: {ag.id}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function WarfarePanel({ factions, onUpdatePolicy }: { factions: Faction[], onUpdatePolicy: any }) {
    const [selectedFaction, setSelectedFaction] = useState(factions[0]?.id || '');

    return (
        <div className="space-y-6">
            <div className="flex gap-4">
                <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 flex-1">
                    <h3 className="text-sm font-bold uppercase text-red-400 mb-6 tracking-wider flex items-center gap-2">
                        <ShieldAlert size={18} /> Directive: Sanctions & Embargoes
                    </h3>
                    
                    <div className="space-y-4">
                        {factions.filter(f => f.id !== 'faction-aurelian').map(f => (
                            <div key={f.id} className="flex items-center justify-between p-4 bg-[#0a0c10] border border-[#1e293b] rounded-xl group hover:border-red-500/50 transition-all">
                                <span className="font-bold text-slate-300">{f.name}</span>
                                <div className="flex gap-2">
                                    <ActionButton 
                                        icon={<Lock size={14} />} 
                                        label="Embargo" 
                                        color="red" 
                                        onClick={() => onUpdatePolicy({ embargoes: [{ factionId: f.id, resources: [Resource.METALS] }] })} 
                                    />
                                    <ActionButton 
                                        icon={<ShieldSlash size={14} />} 
                                        label="Sanction" 
                                        color="amber" 
                                        onClick={() => onUpdatePolicy({ sanctions: [f.id] })} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-80 space-y-4">
                    <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-xl">
                        <h4 className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2">Escalation Warning</h4>
                        <p className="text-xs text-slate-400 leading-relaxed italic">
                            Applying direct sanctions against major factions will increase galactic tension and may lead to formal conflict or blockade retaliation.
                        </p>
                    </div>
                    <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-xl">
                        <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4 border-b border-[#1e293b] pb-2">Tariff Schedule</h4>
                        <div className="space-y-3">
                            {Object.values(Resource)
                                .filter(r => ![
                                    Resource.HAPPINESS,
                                    Resource.CREDITS,
                                    Resource.CONSTRUCTION,
                                    Resource.MILITARY_CAP,
                                    Resource.RESEARCH_CAP,
                                    Resource.CULTURAL_CAP
                                ].includes(r))
                                .map(r => (
                                    <div key={r} className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold">{r}</span>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="range" 
                                                className="w-24 accent-blue-500 h-1" 
                                                onChange={() => {}} 
                                            />
                                            <span className="text-[10px] font-mono text-blue-400">5%</span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RoutesPanel({ routes }: { routes: TradeRoute[] }) {
    return (
        <div className="space-y-4">
            {routes.length === 0 ? (
                <div className="p-12 text-center text-slate-500 italic bg-[#0f172a] border border-[#1e293b] rounded-xl">
                    No active trade routes found. Recalculate or establish agreements.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {routes.map((route, i) => (
                        <div key={i} className="bg-[#0f172a] border border-[#1e293b] p-4 rounded-xl flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-center gap-5">
                                <div className="flex -space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold text-xs ring-4 ring-[#0f172a]">
                                        {route.path[0][0]}
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-bold text-xs ring-4 ring-[#0f172a]">
                                        {route.path[route.path.length-1][0]}
                                    </div>
                                </div>
                                <div>
                                    <div className="font-bold text-slate-200 flex items-center gap-2">
                                        Route Path: {route.path.length} Hops
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${route.exposureScore > 20 ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                                            Risk: {route.exposureScore.toFixed(0)}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 max-w-[400px] truncate">
                                        {route.path.join(" → ")}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-4 items-center">
                                <div className="text-right">
                                    <div className="text-xs text-slate-400">Integrity</div>
                                    <div className="text-sm font-bold text-blue-400">98%</div>
                                </div>
                                <div className="h-8 w-px bg-slate-800"></div>
                                <button className="p-2 hover:bg-slate-800 rounded text-slate-500 hover:text-blue-400 transition-colors">
                                    <ArrowUpRight size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ActionButton({ icon, label, color, onClick }: { icon: React.ReactNode, label: string, color: 'red' | 'amber' | 'blue', onClick: () => void }) {
    const colorClasses = {
        red: 'hover:bg-red-600/10 hover:text-red-500 border-transparent hover:border-red-500/30',
        amber: 'hover:bg-amber-600/10 hover:text-amber-500 border-transparent hover:border-amber-500/30',
        blue: 'hover:bg-blue-600/10 hover:text-blue-500 border-transparent hover:border-blue-500/30'
    };

    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-tight border transition-all ${colorClasses[color]} text-slate-500 bg-transparent`}
        >
            {icon}
            {label}
        </button>
    );
}
