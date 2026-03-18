// components/panels/ShipDesignerPanel.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { 
    Shield, Sword, Zap, Activity, Save, Trash2, 
    Plus, ChevronRight, Info, AlertOctagon,
    Cpu, Target, Gauge, ArrowRight
} from 'lucide-react';
import { SHIP_HULLS, SHIP_COMPONENTS, calculateDesignStats } from '@/lib/combat/ship-registry';
import { ShipDesign, ShipStats } from '@/lib/combat/ship-types';
import { saveShipDesignAction, deleteShipDesignAction } from '@/app/actions/ship-design';

export default function ShipDesignerPanel() {
    const { shipDesigns, addShipDesign, updateShipDesign, deleteShipDesign } = useUIStore();
    const [selectedHullId, setSelectedHullId] = useState(SHIP_HULLS[0].id);
    const [currentComponents, setCurrentComponents] = useState<Record<string, string>>({});
    const [designName, setDesignName] = useState('New Design');
    const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const selectedHull = SHIP_HULLS.find(h => h.id === selectedHullId)!;

    // Load design if selected
    const handleLoadDesign = (design: ShipDesign) => {
        setActiveDesignId(design.id);
        setSelectedHullId(design.hullId);
        setCurrentComponents(design.components);
        setDesignName(design.name);
    };

    const handleNewDesign = () => {
        setActiveDesignId(null);
        setSelectedHullId(SHIP_HULLS[0].id);
        setCurrentComponents({});
        setDesignName('New Design');
    };

    const handleComponentChange = (slotId: string, compId: string) => {
        setCurrentComponents(prev => ({
            ...prev,
            [slotId]: compId
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const design: ShipDesign = {
            id: activeDesignId || `design-${Date.now()}`,
            name: designName,
            hullId: selectedHullId,
            components: currentComponents
        };

        const res = await saveShipDesignAction(design);
        if (res.success) {
            if (activeDesignId) {
                updateShipDesign(activeDesignId, design);
            } else {
                addShipDesign(design);
                setActiveDesignId(design.id);
            }
        }
        setIsSaving(false);
    };

    const stats = calculateDesignStats(selectedHullId, currentComponents);
    const powerBalance = stats.powerDraw; // In our registry, negative draw = production

    return (
        <div className="flex h-full bg-slate-950/80 backdrop-blur-xl border-l border-white/5 text-slate-200">
            {/* Design Library (Left) */}
            <div className="w-64 border-r border-white/5 bg-black/40 flex flex-col">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-xs font-display tracking-widest text-slate-400 uppercase">Registry</h3>
                    <button 
                        onClick={handleNewDesign}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="New Design"
                    >
                        <Plus size={14} className="text-blue-400" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {shipDesigns.map(design => (
                        <button
                            key={design.id}
                            onClick={() => handleLoadDesign(design)}
                            className={`w-full p-3 rounded-lg text-left transition-all border ${
                                activeDesignId === design.id
                                ? 'bg-blue-500/10 border-blue-500/30'
                                : 'border-transparent hover:bg-white/5'
                            }`}
                        >
                            <div className="text-xs font-display text-white truncate">{design.name}</div>
                            <div className="text-[10px] text-slate-500 uppercase mt-1">
                                {SHIP_HULLS.find(h => h.id === design.hullId)?.name || 'Unknown Hull'}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Editor (Center/Right) */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Editor Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-blue-500/5 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <Cpu className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <input 
                                value={designName}
                                onChange={(e) => setDesignName(e.target.value)}
                                className="bg-transparent border-none focus:ring-0 text-xl font-display text-white p-0 uppercase tracking-widest block w-64"
                            />
                            <p className="text-[10px] text-slate-500 font-mono tracking-widest mt-1">Sovereign Fleet Engineer v4.2</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-display text-xs tracking-widest disabled:opacity-50"
                    >
                        <Save size={14} />
                        {isSaving ? 'SYNCING...' : 'SAVE DESIGN'}
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Configuration Panels */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                        {/* Hull Selection */}
                        <section className="space-y-4">
                            <h4 className="text-[10px] font-display text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Activity size={12} /> SELECT HULL ARCHETYPE
                            </h4>
                            <div className="grid grid-cols-3 gap-4">
                                {SHIP_HULLS.map(hull => (
                                    <button
                                        key={hull.id}
                                        onClick={() => setSelectedHullId(hull.id)}
                                        className={`p-4 rounded-xl border transition-all text-left ${
                                            selectedHullId === hull.id
                                            ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                            : 'bg-white/5 border-white/10 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-display text-white">{hull.name}</span>
                                            <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-slate-500">{hull.size}</span>
                                        </div>
                                        <div className="text-[9px] text-slate-500 uppercase tracking-tighter">
                                            {hull.slots.length} MODULE SLOTS
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Component Slots */}
                        <section className="space-y-4">
                            <h4 className="text-[10px] font-display text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Target size={12} /> COMPONENT SLOTTING
                            </h4>
                            <div className="grid grid-cols-1 gap-3">
                                {selectedHull.slots.map(slot => {
                                    const currentCompId = currentComponents[slot.id];
                                    const currentComp = SHIP_COMPONENTS.find(c => c.id === currentCompId);
                                    
                                    return (
                                        <div key={slot.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                                                {slot.type === 'weapon' && <Sword size={18} className="text-red-400" />}
                                                {slot.type === 'utility' && <Shield size={18} className="text-blue-400" />}
                                                {slot.type === 'core' && <Zap size={18} className="text-amber-400" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest">{slot.type} slot</div>
                                                <select 
                                                    value={currentCompId || ''}
                                                    onChange={(e) => handleComponentChange(slot.id, e.target.value)}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-white p-0 mt-1 cursor-pointer"
                                                >
                                                    <option value="" className="bg-slate-900">EMPTY SLOT</option>
                                                    {SHIP_COMPONENTS.filter(c => c.type === slot.type).map(comp => (
                                                        <option key={comp.id} value={comp.id} className="bg-slate-900">
                                                            {comp.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            {currentComp && (
                                                <div className="text-[10px] text-slate-400 italic">
                                                    {currentComp.description}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </div>

                    {/* Stats Summary (Right) */}
                    <div className="w-80 border-l border-white/5 bg-black/20 p-8 space-y-6">
                        <h4 className="text-[10px] font-display text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Gauge size={12} /> DESIGN SPECIFICATIONS
                        </h4>

                        <div className="space-y-4">
                            <StatBar label="OFFENSIVE DAMAGE" value={stats.damage} max={200} color="bg-red-500" />
                            <StatBar label="SURVIVAL POWER" value={stats.baseForce} max={1000} color="bg-blue-500" />
                            <StatBar label="MITIGATION FIELD" value={stats.shields} max={200} color="bg-cyan-500" />
                            <StatBar label="EVASION / SPEED" value={stats.speed} max={100} color="bg-green-500" />
                        </div>

                        <div className="pt-6 border-t border-white/5 space-y-4">
                            <div className="flex justify-between items-end">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Power Generation</div>
                                <div className={`text-xl font-mono ${powerBalance <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {Math.abs(powerBalance)} units
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-black/40 border border-white/5 flex gap-3">
                                {powerBalance > 0 ? (
                                    <>
                                        <AlertOctagon size={16} className="text-red-400 shrink-0" />
                                        <div className="text-[10px] text-red-400/80 leading-tight">
                                            CRITICAL: Power draw exceeds production. Design will be non-functional.
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Info size={16} className="text-blue-400 shrink-0" />
                                        <div className="text-[10px] text-slate-500 leading-tight">
                                            STABLE: Power generation sufficient for all subsystems.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Visual Breakdown */}
                        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/10 space-y-3">
                            <div className="text-[10px] font-display text-blue-400 uppercase tracking-widest">Composite Efficiency</div>
                            <div className="flex items-center gap-2">
                                <div className="text-3xl font-mono text-white">{( (stats.damage + stats.shields + stats.speed) / 3 ).toFixed(1)}</div>
                                <ArrowRight size={14} className="text-slate-600" />
                                <div className="text-[10px] text-slate-400 uppercase">Class-V Integration</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatBar({ label, value, max, color }: { label: string, value: number, max: number, color: string }) {
    const percentage = Math.min((value / max) * 100, 100);
    return (
        <div className="space-y-2">
            <div className="flex justify-between text-[9px] uppercase tracking-widest font-mono">
                <span className="text-slate-500">{label}</span>
                <span className="text-white font-bold">{value}</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${color} transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.1)]`} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
