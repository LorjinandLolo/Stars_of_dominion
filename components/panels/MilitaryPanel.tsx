"use client";

import React, { useState } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { executePlayerAction } from '@/app/actions/registry-handler';
import { Shield, Crosshair, Map, Swords, Users, RefreshCw, Rocket, Target } from 'lucide-react';
import { GroundUnitType } from '@/lib/combat/siege/siege-types';

export default function MilitaryPanel() {
    const { 
        armies, fleets, playerFactionId, selectedPlanetId, selectedSystemId, 
        systems, planets, empireIdentity 
    } = useUIStore();

    const { leadership } = empireIdentity;
    const availableLeaders = Array.from(leadership.leaders.values())
        .filter(l => l.factionId === playerFactionId && l.status === 'active' && !l.assignmentId);

    const [activeTab, setActiveTab] = useState<'armies' | 'fleets'>('armies');
    const [selectedFormationId, setSelectedFormationId] = useState<string | null>(null);

    const myArmies = armies.filter(a => a.factionId === playerFactionId);
    const myFleets = fleets.filter(f => f.factionId === playerFactionId);

    const activeList = activeTab === 'armies' ? myArmies : myFleets;
    const selectedFormation = activeList.find(f => f.id === selectedFormationId);

    const handleRecruitUnit = async (unitType: string, count: number = 1) => {
        if (!selectedFormationId) return;
        
        await executePlayerAction('MIL_RECRUIT_FORMATION_UNIT', {
            formationId: selectedFormationId,
            isFleet: activeTab === 'fleets',
            unitType,
            count
        }, playerFactionId || '');
    };

    const handleCreateFormation = async () => {
        if (!selectedPlanetId || !selectedSystemId) {
            alert('Select a planet to create a formation.');
            return;
        }

        if (activeTab === 'armies') {
            await executePlayerAction('MIL_CREATE_ARMY', {
                planetId: selectedPlanetId,
                systemId: selectedSystemId
            }, playerFactionId || '');
        } else {
            await executePlayerAction('MIL_BUILD_FLEET', {
                planetId: selectedPlanetId,
                systemId: selectedSystemId
            }, playerFactionId || '');
        }
    };

    const handleAssignLeader = async (leaderId: string) => {
        if (!selectedFormationId) return;
        await executePlayerAction('LEADER_ASSIGN', {
            leaderId,
            assignmentId: selectedFormationId
        }, playerFactionId || '');
    };

    return (
        <div className="flex h-[80vh] w-full text-slate-200">
            {/* Sidebar: Formation List */}
            <div className="w-1/3 border-r border-slate-700 bg-slate-900/80 p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <h2 className="text-xl font-bold uppercase tracking-widest text-cyan-500">Command</h2>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setActiveTab('armies')}
                            className={`p-2 rounded ${activeTab === 'armies' ? 'bg-cyan-600/30 text-cyan-400' : 'hover:bg-slate-800'}`}
                        >
                            <Shield size={20} />
                        </button>
                        <button 
                            onClick={() => setActiveTab('fleets')}
                            className={`p-2 rounded ${activeTab === 'fleets' ? 'bg-cyan-600/30 text-cyan-400' : 'hover:bg-slate-800'}`}
                        >
                            <Rocket size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {activeList.length === 0 ? (
                        <div className="text-slate-500 text-sm italic p-4 text-center">
                            No {activeTab} available.
                        </div>
                    ) : (
                        activeList.map(formation => (
                            <button
                                key={formation.id}
                                onClick={() => setSelectedFormationId(formation.id)}
                                className={`w-full text-left p-3 rounded border transition-all ${selectedFormationId === formation.id ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}
                            >
                                <div className="font-bold">{formation.name}</div>
                                <div className="text-xs text-slate-400 flex justify-between mt-1">
                                    <span>Base Power: {formation.basePower}</span>
                                    <span>
                                        {activeTab === 'armies' 
                                            ? `Planet: ${planets.find(p => p.$id === (formation as any).currentPlanetId)?.name || 'Unknown'}`
                                            : `System: ${systems.find(s => s.id === formation.currentSystemId)?.name || 'Transit'}`
                                        }
                                    </span>
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <button 
                    onClick={handleCreateFormation}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-sm font-bold uppercase tracking-wider text-slate-300"
                >
                    + Commission New {activeTab === 'armies' ? 'Army' : 'Fleet'}
                </button>
            </div>

            {/* Main Area: Dossier / Blueprint */}
            <div className="flex-1 bg-slate-950 p-6 relative overflow-y-auto">
                {selectedFormation ? (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                        
                        {/* Header Dossier */}
                        <div className="flex justify-between items-start border-b-2 border-cyan-500/50 pb-4">
                            <div>
                                <h1 className="text-4xl font-black uppercase tracking-tighter text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                                    {selectedFormation.name}
                                </h1>
                                <p className="text-sm text-slate-400 font-mono mt-1">
                                    ID: {selectedFormation.id} | STATUS: ACTIVE
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-mono text-amber-500">{selectedFormation.basePower}</div>
                                <div className="text-xs text-slate-500 uppercase">Combat Rating</div>
                            </div>
                        </div>

                        {/* Composition & Recruitment */}
                        <div className="grid grid-cols-2 gap-8">
                            
                            {/* Current Units (Holographic Blueprint style) */}
                            <div className="border border-slate-700 bg-slate-900/50 p-4 rounded-lg relative overflow-hidden">
                                <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-10 pointer-events-none mix-blend-overlay"></div>
                                <h3 className="text-sm font-bold uppercase text-slate-400 mb-4 flex items-center gap-2">
                                    <Swords size={16} className="text-cyan-500" /> Current Composition
                                </h3>
                                
                                <div className="space-y-3 relative z-10">
                                    {Object.entries(selectedFormation.composition || {}).length === 0 ? (
                                        <div className="text-slate-500 text-sm font-mono">No units assigned.</div>
                                    ) : (
                                        Object.entries(selectedFormation.composition || {}).map(([type, count]) => (
                                            <div key={type} className="flex justify-between items-center bg-slate-800/80 p-2 rounded border border-slate-700">
                                                <span className="font-mono text-sm text-cyan-200">{type}</span>
                                                <span className="font-mono font-bold text-amber-400">x{count as number}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Logistics & Command */}
                            <div className="space-y-4">
                                <div className="border border-slate-700 bg-slate-900/50 p-4 rounded-lg">
                                    <h3 className="text-sm font-bold uppercase text-slate-400 mb-4 flex items-center gap-2">
                                        <Users size={16} className="text-yellow-500" /> Command Staff
                                    </h3>
                                    {selectedFormation.leaderId ? (
                                        <div className="flex items-center gap-3 bg-slate-800 p-3 rounded">
                                            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                                                <Users size={20} className="text-slate-400" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-amber-400">
                                                    {leadership.leaders.get(selectedFormation.leaderId)?.name || 'Unknown Officer'}
                                                </div>
                                                <div className="text-xs text-slate-400 font-mono">
                                                    {leadership.leaders.get(selectedFormation.leaderId)?.role || 'Commander'} | LVL {leadership.leaders.get(selectedFormation.leaderId)?.level || 1}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="text-slate-500 text-sm font-mono p-3 bg-slate-800 rounded border border-dashed border-slate-600">
                                                No commanding officer assigned.
                                            </div>
                                            <div className="mt-2">
                                                <select 
                                                    className="w-full bg-slate-800 border border-slate-700 p-2 rounded text-xs text-slate-300"
                                                    onChange={(e) => handleAssignLeader(e.target.value)}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>Select Officer to Assign...</option>
                                                    {availableLeaders.filter(l => activeTab === 'fleets' ? l.role === 'Admiral' : l.role === 'General').map(l => (
                                                        <option key={l.id} value={l.id}>{l.name} (Lvl {l.level})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Recruitment Panel */}
                                <div className="border border-slate-700 bg-slate-900/50 p-4 rounded-lg">
                                    <h3 className="text-sm font-bold uppercase text-slate-400 mb-4 flex items-center gap-2">
                                        <RefreshCw size={16} className="text-green-500" /> Requisition Orders
                                    </h3>
                                    
                                    {activeTab === 'armies' ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {['INFANTRY', 'ARMOR', 'ARTILLERY', 'MECH'].map(unit => (
                                                <button 
                                                    key={unit}
                                                    onClick={() => handleRecruitUnit(unit)}
                                                    className="bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 rounded text-xs font-mono transition-colors text-slate-300"
                                                >
                                                    + {unit}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {['CORVETTE', 'DESTROYER', 'CRUISER', 'BATTLESHIP'].map(unit => (
                                                <button 
                                                    key={unit}
                                                    onClick={() => handleRecruitUnit(unit)}
                                                    className="bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 rounded text-xs font-mono transition-colors text-slate-300"
                                                >
                                                    + {unit}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center flex-col text-slate-600 opacity-50">
                        <Target size={64} className="mb-4" />
                        <p className="text-lg font-mono">SELECT A FORMATION TO VIEW DOSSIER</p>
                    </div>
                )}
            </div>
        </div>
    );
}
