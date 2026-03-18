"use client";

import React, { useState } from 'react';
import { IntrigueOption, IntrigueResponse } from '@/lib/intrigue/types';
import { Eye, Target, Skull, Zap, DollarSign, Activity, HelpCircle } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface IntriguePanelProps {
    factionId: string;
    factions: any[];
    planets: any[];
    onGenerateOps: (targetId: string) => Promise<IntrigueResponse>;
    onExecuteOp: (optionId: string) => Promise<void>;
}

export default function IntriguePanel({ factionId, factions, planets, onGenerateOps, onExecuteOp }: IntriguePanelProps) {
    const [selectedFactionId, setSelectedFactionId] = useState('');
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [ops, setOps] = useState<IntrigueResponse | null>(null);
    const [result, setResult] = useState<string | null>(null);

    // Filter planets
    const filteredPlanets = planets
        .filter(p => selectedFactionId ? (p.owner === selectedFactionId || p.ownerId === selectedFactionId) : true)
        .map(p => ({
            id: p.$id || p.id,
            name: p.name
        }));

    // Map factions
    const factionOptions = factions.map(f => ({
        id: f.$id || f.id,
        name: f.name,
        type: f.alignment
    }));

    const handleGenerate = async () => {
        if (!selectedTargetId) return;
        setIsLoading(true);
        setOps(null);
        setResult(null);
        try {
            const response = await onGenerateOps(selectedTargetId);
            setOps(response);
        } catch (e) {
            console.error(e);
            setResult('Failed to establish spy network contact.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecute = async (optionId: string) => {
        setIsLoading(true);
        try {
            // Mock result for now, normally wait for server
            await onExecuteOp(optionId);
            setResult('Operation command sent. Awaiting status report...');
            // Clear ops after execution to prevent double-click
            setOps(null);
        } catch (e) {
            console.error(e);
            setResult('Operation aborted due to command failure.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFactionChange = (id: string) => {
        setSelectedFactionId(id);
        setSelectedTargetId('');
        setOps(null); // Clear previous ops
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'SABOTAGE': return <Zap className="text-yellow-500" />;
            case 'ASSASSINATION': return <Skull className="text-red-500" />;
            case 'THEFT': return <DollarSign className="text-green-500" />;
            case 'ESPIONAGE': return <Eye className="text-blue-500" />;
            case 'INSURRECTION': return <Activity className="text-orange-500" />;
            default: return <HelpCircle className="text-gray-500" />;
        }
    };

    return (
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 w-[900px] max-h-[85vh] overflow-y-auto shadow-2xl shadow-black relative">
            <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
                <Eye size={120} />
            </div>

            <h2 className="text-3xl font-display font-bold text-slate-100 mb-2 flex items-center gap-3">
                <Target className="text-red-600" /> Covert Operations
            </h2>
            <p className="text-slate-500 mb-8 font-mono text-sm max-w-lg">
                Select a target system to task your local sleeper agents with generating actionable intelligence and sabotage opportunities.
            </p>

            {/* Step 1: Target Selection */}
            <div className="flex gap-4 mb-8 items-end">
                <div className="flex-1 space-y-4">
                    <SearchableSelect
                        options={factionOptions}
                        value={selectedFactionId}
                        onChange={handleFactionChange}
                        placeholder="Select Target Faction..."
                        label="Target Faction"
                        className="w-full"
                    />

                    <SearchableSelect
                        options={filteredPlanets}
                        value={selectedTargetId}
                        onChange={setSelectedTargetId}
                        placeholder={selectedFactionId ? "Select Target System..." : "Select Faction First"}
                        label="Target System"
                        className="w-full"
                    />
                </div>

                <div className="mb-1">
                    <button
                        onClick={handleGenerate}
                        disabled={!selectedTargetId || isLoading}
                        className="bg-red-700 hover:bg-red-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-3 px-8 rounded text-lg transition-all shadow-lg shadow-red-900/20 h-12"
                    >
                        {isLoading ? 'Decrypting...' : 'Initialize Ops'}
                    </button>
                </div>
            </div>

            {/* Step 2: Display Options */}
            {ops && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-900/50 p-4 border-l-4 border-blue-500 mb-6 rounded-r italic text-blue-200">
                        {/* Typewriter effect could go here */}
                        "{ops.flavorText}"
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {ops.options.map(opt => (
                            <div key={opt.id} className="group bg-black/40 border border-slate-800 hover:border-red-500/50 p-5 rounded-xl transition-all hover:bg-slate-900/80 relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-t from-red-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                                        {getIcon(opt.plotType)}
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded border ${opt.risk === 'HIGH' ? 'border-red-500 text-red-500' :
                                        opt.risk === 'MEDIUM' ? 'border-yellow-500 text-yellow-500' :
                                            'border-green-500 text-green-500'
                                        }`}>
                                        {opt.risk} RISK
                                    </span>
                                </div>

                                <h3 className="font-bold text-lg text-white mb-2 relative z-10">{opt.title}</h3>
                                <p className="text-slate-400 text-sm mb-6 h-12 leading-relaxed relative z-10">{opt.description}</p>

                                <div className="space-y-4 relative z-10">
                                    <div className="text-xs font-mono text-slate-500 flex gap-2">
                                        {opt.cost.map((c, i) => (
                                            <span key={i} className="bg-slate-950 px-2 py-1 rounded">
                                                -{c.amount} {c.resource}
                                            </span>
                                        ))}
                                    </div>

                                    <button
                                        onClick={() => handleExecute(opt.id)}
                                        disabled={isLoading}
                                        className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded border border-slate-700 hover:border-slate-500 transition-all"
                                    >
                                        Execute
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Result Message */}
            {result && (
                <div className="mt-8 p-6 bg-slate-800/80 border-t-2 border-slate-600 text-center rounded animate-in zoom-in-95">
                    <p className="text-xl font-mono text-slate-200">{result}</p>
                </div>
            )}
        </div>
    );
}
