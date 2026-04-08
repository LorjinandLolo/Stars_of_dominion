"use client";

import React, { useState } from 'react';
import {
    Building2,
    TrendingUp,
    TrendingDown,
    Anchor,
    Coins,
    Shield,
    AlertTriangle,
    Globe,
    Activity,
    Plus,
    X,
    Swords,
} from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';
import { CompanySnapshot, MarketTicker, CharterPower, Resource } from '@/types/ui-state';
import { 
    charterCompanyAction, 
    commandPrivateersAction, 
    taxColoniesAction 
} from '@/app/actions/company';

// ─── Sub-components ────────────────────────────────────────────────────────────

function MarketRow({ m }: { m: MarketTicker }) {
    const pct = ((m.currentPrice - m.basePrice) / m.basePrice) * 100;
    const isUp = pct >= 0;
    const ratio = (m.demand / m.supply);

    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-950/10 border border-slate-700/30 hover:border-emerald-500/30 transition-colors">
            <div className="w-24 text-[10px] font-display tracking-widest text-slate-400">{m.resource}</div>
            <div className={`font-mono text-sm font-bold w-16 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                {m.currentPrice.toFixed(1)}cr
            </div>
            <div className={`flex items-center gap-0.5 text-[10px] w-14 ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {isUp ? '+' : ''}{pct.toFixed(1)}%
            </div>
            {/* Supply / Demand ratio bar */}
            <div className="flex-1 group relative">
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${ratio > 1.1 ? 'bg-rose-500' : ratio < 0.9 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                        style={{ width: `${Math.min(100, (m.supply / (m.supply + m.demand)) * 200)}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

function CompanyCard({ c, selected, onClick }: { c: CompanySnapshot; selected: boolean; onClick: () => void }) {
    const priceChange = c.sharePrice - c.sharePricePrev;
    const isUp = priceChange >= 0;
    const mktCap = c.sharePrice * c.sharesOutstanding;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-lg border p-3 transition-all ${selected
                ? 'bg-amber-950/40 border-amber-600/60'
                : 'bg-slate-900/50 border-slate-700/30 hover:border-slate-600/50'
                }`}
        >
            <div className="flex items-start gap-2 mb-2">
                <Building2 size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-display text-slate-200 truncate uppercase">{c.fullName}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-tighter">ID: {c.id.split('-').pop()}</div>
                </div>
                <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-bold text-amber-400">{c.sharePrice.toFixed(2)}cr</div>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-1 mb-2">
                <div className="flex items-center gap-1">
                    {c.powers.includes(CharterPower.PARAMILITARY) && <Swords size={10} className="text-rose-400" />}
                    {c.powers.includes(CharterPower.GOVERNANCE) && <Globe size={10} className="text-blue-400" />}
                </div>
                <div className={`text-[9px] flex items-center justify-end gap-0.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isUp ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                    {isUp ? '+' : ''}{priceChange.toFixed(2)}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[9px]">
                <div><span className="text-slate-500 uppercase">MKT CAP</span><br /><span className="font-mono text-slate-300">{(mktCap / 1000).toFixed(0)}K</span></div>
                <div><span className="text-slate-500 uppercase">ROUTES</span><br /><span className="font-mono text-slate-300">{c.activeTradeRouteIds.length}</span></div>
                <div><span className="text-slate-500 uppercase">FLEET</span><br /><span className="font-mono text-slate-300">{c.privateFleetSize}</span></div>
            </div>
        </button>
    );
}

function FoundCharterDialog({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('');
    const [powers, setPowers] = useState<CharterPower[]>([CharterPower.MONOPOLY]);
    const [isFounding, setIsFounding] = useState(false);

    const togglePower = (p: CharterPower) => {
        if (p === CharterPower.MONOPOLY) return; // Basic monopoly is always granted
        setPowers(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    };

    const handleFound = async () => {
        setIsFounding(true);
        // In a real app we'd get player faction info from store
        const result = await charterCompanyAction(name, 'faction-aurelian', 'crimson-expanse', powers);
        if (result.success) {
            onClose();
        } else {
            console.error(result.error);
        }
        setIsFounding(false);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-amber-600/50 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-slate-800 bg-amber-950/20 flex justify-between items-center">
                    <h3 className="font-display text-sm tracking-widest text-amber-400 uppercase">GRANT VOC-STYLE CHARTER</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-display text-slate-500 block uppercase">CHARTER BASE NAME</label>
                        <input 
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="East Galaxy..."
                            className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-2 text-sm text-slate-200 focus:border-amber-500/50 transition-colors outline-none"
                        />
                        <p className="text-[10px] text-slate-600 italic">Becomes "{name || '...'} Charter Company"</p>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-display text-slate-500 block uppercase">QUASI-SOVEREIGN POWERS (VOC STYLE)</label>
                        
                        {(Object.values(CharterPower) as CharterPower[]).map(p => (
                            <button
                                key={p}
                                onClick={() => togglePower(p)}
                                className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                                    powers.includes(p) 
                                        ? 'bg-amber-950/20 border-amber-600/50' 
                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className={`mt-1 p-1.5 rounded bg-slate-900 border ${powers.includes(p) ? 'border-amber-500/50 text-amber-400' : 'border-slate-800 text-slate-500'}`}>
                                    {p === CharterPower.MONOPOLY && <Coins size={14} />}
                                    {p === CharterPower.GOVERNANCE && <Globe size={14} />}
                                    {p === CharterPower.PARAMILITARY && <Swords size={14} />}
                                </div>
                                <div>
                                    <div className={`text-xs font-display tracking-tight ${powers.includes(p) ? 'text-amber-300' : 'text-slate-400'}`}>
                                        {p} AUTHORITY
                                    </div>
                                    <div className="text-[9px] text-slate-500 mt-1">
                                        {p === CharterPower.MONOPOLY && "Sole rights to trade specific commodities in designated systems."}
                                        {p === CharterPower.GOVERNANCE && "Governs colonies directly; taxes bypass the central treasury."}
                                        {p === CharterPower.PARAMILITARY && "Maintains private battlegroups; authorized to wage war on pirates."}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={handleFound}
                        disabled={isFounding || !name}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-black font-display text-xs tracking-widest py-3 rounded-lg transition-all shadow-lg shadow-amber-900/20"
                    >
                        {isFounding ? 'GRANTING CHARTER...' : 'FOUND CHARTER COMPANY'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

export default function CorporateLedgerPanel() {
    const { corporateState, playerFactionId } = useUIStore();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<'market' | 'companies'>('market');
    const [showFoundDialog, setShowFoundDialog] = useState(false);

    const selected = corporateState.companies.find(c => c.id === selectedId) ?? null;

    const handlePrivateers = async () => {
        if (!selectedId || !playerFactionId) return;
        const res = await commandPrivateersAction(selectedId, playerFactionId);
        if (res.success) {
            // Revalidation handles state
        }
    };

    const handleTax = async () => {
        if (!selectedId || !selected || !playerFactionId) return;
        const res = await taxColoniesAction(selectedId, playerFactionId);
        if (res.success) {
            // Revalidation handles state
        }
    };

    const handleEquities = async () => {
        // Feature not yet finalized
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-950/50 backdrop-blur-xl">
            {showFoundDialog && <FoundCharterDialog onClose={() => setShowFoundDialog(false)} />}
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700/40 flex justify-between items-center bg-slate-900/20">
                <div>
                    <h2 className="font-display text-sm tracking-widest text-amber-400 flex items-center gap-2 uppercase">
                        <Activity size={14} /> GALACTIC EXCHANGE
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-tighter">Corporate Sovereignty &amp; Commodity Trade</p>
                </div>
                <button 
                    onClick={() => setShowFoundDialog(true)}
                    className="flex items-center gap-2 bg-amber-600/10 border border-amber-500/30 hover:bg-amber-600/20 px-4 py-2 rounded-lg text-amber-400 font-display text-[10px] tracking-widest transition-all"
                >
                    <Plus size={12} /> FOUND NEW CHARTER
                </button>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-slate-700/40 px-6 bg-slate-900/10">
                {(['market', 'companies'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`py-3 px-6 text-[10px] font-display tracking-widest transition-colors border-b-2 -mb-px uppercase ${tab === t
                            ? 'text-amber-400 border-amber-400'
                            : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                    >
                        {t === 'market' ? 'COMMODITY MARKET' : 'CHARTERED ENTITIES'}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto">
                {tab === 'market' && (
                    <div className="p-6 space-y-3">
                        <div className="flex justify-between items-center mb-4">
                            <div className="text-[10px] font-display tracking-widest text-slate-500 flex items-center gap-1 uppercase">
                                <Globe size={10} /> LIVE TICKER — AGGREGATED PRODUCTION FLOWS
                            </div>
                            <div className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/20">
                                SESSION PROFIT: +{corporateState.totalDividendsReceived.toLocaleString()}cr
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                            {corporateState.markets.map(m => <MarketRow key={m.resource} m={m} />)}
                        </div>
                    </div>
                )}

                {tab === 'companies' && (
                    <div className="flex gap-0 h-full">
                        {/* Company list */}
                        <div className="w-1/2 border-r border-slate-800/80 p-4 space-y-3 overflow-y-auto custom-scrollbar">
                            {corporateState.companies.map(c => (
                                <CompanyCard
                                    key={c.id}
                                    c={c}
                                    selected={selectedId === c.id}
                                    onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                                />
                            ))}
                        </div>

                        {/* Detail pane */}
                        <div className="w-1/2 p-6 overflow-y-auto bg-slate-900/10">
                            {selected ? (
                                <div className="space-y-6 animate-in slide-in-from-right-2 duration-300">
                                    <div className="p-4 rounded-xl bg-amber-950/10 border border-amber-500/20">
                                        <div className="text-[10px] font-display text-amber-500/70 mb-1 uppercase tracking-widest">SELECTED ENTITY</div>
                                        <div className="text-lg font-display text-slate-100 uppercase">{selected.fullName}</div>
                                        <div className="text-[10px] text-slate-500 mt-1 italic tracking-tight">Founded by Faction: {selected.foundingFactionId}</div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'TREASURY', val: `${(selected.treasury / 1000).toFixed(1)}K cr`, icon: <Coins size={12} />, color: 'text-amber-400' },
                                            { label: 'DIVIDENDS', val: `${(selected.dividendsPaidTotal / 1000).toFixed(1)}K cr`, icon: <TrendingUp size={12} />, color: 'text-emerald-400' },
                                            { label: 'FLEET SIZE', val: `${selected.privateFleetSize}`, icon: <Shield size={12} />, color: 'text-rose-400' },
                                            { label: 'MONOPOLIES', val: `${selected.monopolySystemsCount}`, icon: <Globe size={12} />, color: 'text-violet-400' },
                                        ].map(stat => (
                                            <div key={stat.label} className="bg-slate-900 border border-slate-800 p-3 rounded-lg">
                                                <div className={`flex items-center gap-2 text-[10px] font-display uppercase tracking-widest mb-1 ${stat.color}`}>
                                                    {stat.icon} {stat.label}
                                                </div>
                                                <div className="text-sm font-mono text-slate-200">{stat.val}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action Panel */}
                                    <div className="space-y-2">
                                        <div className="text-[10px] font-display text-slate-500 uppercase tracking-widest px-1">CHARTER ACTIONS</div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {selected.powers.includes(CharterPower.PARAMILITARY) && (
                                                <button 
                                                    onClick={handlePrivateers}
                                                    className="flex items-center justify-between p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 hover:bg-rose-950/40 transition-all group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Swords size={16} className="text-rose-400" />
                                                        <div className="text-left">
                                                            <div className="text-[10px] font-display text-rose-300 uppercase tracking-wider">COMMAND PRIVATEERS</div>
                                                            <div className="text-[9px] text-rose-500/70">Deploy assets to interdict pirate nodes</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] font-mono text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">EXEC_SOVEREIGN</div>
                                                </button>
                                            )}
                                            {selected.powers.includes(CharterPower.GOVERNANCE) && (
                                                <button 
                                                    onClick={handleTax}
                                                    className="flex items-center justify-between p-3 rounded-lg bg-blue-950/20 border border-blue-500/30 hover:bg-blue-950/40 transition-all group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Globe size={16} className="text-blue-400" />
                                                        <div className="text-left">
                                                            <div className="text-[10px] font-display text-blue-300 uppercase tracking-wider">TAX CORPORATE COLONIES</div>
                                                            <div className="text-[9px] text-blue-500/70">Divert dividends to central treasury</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] font-mono text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">EXEC_SOVEREIGN</div>
                                                </button>
                                            )}
                                            <button 
                                                onClick={handleEquities}
                                                className="flex items-center gap-3 p-3 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 transition-all"
                                            >
                                                <Coins size={16} className="text-amber-500" />
                                                <div className="text-left">
                                                    <div className="text-[10px] font-display text-slate-300 uppercase tracking-wider">ISSUE EQUITIES</div>
                                                    <div className="text-[9px] text-slate-500">Dilute existing shares to raise capital</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Risk Indicators */}
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[9px] uppercase tracking-tighter">
                                                <span className="text-slate-500 font-display">ROGUE AUTONOMY</span>
                                                <span className={selected.autonomyLevel > 70 ? 'text-orange-400' : 'text-slate-400'}>{selected.autonomyLevel}%</span>
                                            </div>
                                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 transition-all" style={{ width: `${selected.autonomyLevel}%` }} />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[9px] uppercase tracking-tighter">
                                                <span className="text-slate-500 font-display">CORRUPTION INDEX</span>
                                                <span className={selected.corruptionIndex > 50 ? 'text-rose-400' : 'text-slate-400'}>{selected.corruptionIndex}%</span>
                                            </div>
                                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-rose-500 transition-all" style={{ width: `${selected.corruptionIndex}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs">
                                    <Activity size={32} className="mb-4 opacity-10 animate-pulse" />
                                    <div className="font-display tracking-widest uppercase opacity-40">AWAITING ENTITY SELECTION</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
