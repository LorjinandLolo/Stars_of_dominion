import React, { useState } from 'react';
import { TradeRoute, ResourceId } from '@/types';
import { ArrowRight, Lock, CheckCircle, ShieldAlert } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface TradePanelProps {
    factionId: string;
    activeRoutes: TradeRoute[];
    factions: any[];
    planets: any[];
    onCreateRoute: (targetId: string, resource: ResourceId, amount: number) => void;
}

export default function TradePanel({ factionId, activeRoutes, factions, planets, onCreateRoute }: TradePanelProps) {
    const [selectedFactionId, setSelectedFactionId] = useState('');
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const [selectedResource, setSelectedResource] = useState<ResourceId>('credits');
    const [amount, setAmount] = useState(50);

    // Filter planets based on selected faction
    // Assuming planet.owner or planet.ownerId holds the faction ID. 
    // Also assuming factions have $id or id.
    const filteredPlanets = planets
        .filter(p => selectedFactionId ? (p.owner === selectedFactionId || p.ownerId === selectedFactionId) : true)
        .map(p => ({
            id: p.$id || p.id,
            name: p.name
        }));

    // Map factions for Select
    const factionOptions = factions.map(f => ({
        id: f.$id || f.id,
        name: f.name,
        type: f.alignment // optional extra info
    }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedTargetId && amount > 0) {
            onCreateRoute(selectedTargetId, selectedResource, amount);
            // Reset
            setAmount(50);
            setSelectedTargetId('');
        }
    };

    const handleFactionChange = (id: string) => {
        setSelectedFactionId(id);
        setSelectedTargetId(''); // Reset planet when faction changes
    };

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-[800px] max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-2">
                <ArrowRight className="text-blue-500" /> Trade Network
            </h2>

            {/* Active Routes List */}
            <div className="mb-8">
                <h3 className="text-sm uppercase text-slate-500 font-bold mb-3 tracking-wider">Active Routes</h3>
                {activeRoutes.length === 0 ? (
                    <p className="text-slate-400 italic bg-slate-800/50 p-4 rounded text-center">No active trade routes.</p>
                ) : (
                    <div className="space-y-3">
                        {activeRoutes.map(route => (
                            <div key={route.id} className="flex items-center justify-between bg-slate-800 border border-slate-700 p-4 rounded-lg">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full ${route.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {route.status === 'active' ? <CheckCircle size={18} /> : <Lock size={18} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-200">
                                            {route.origin_planet_id === factionId ? 'Exporting' : 'Importing'} {route.amount} <span className="capitalize text-blue-400">{route.resource}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Route: {route.origin_planet_id} <ArrowRight size={10} className="inline mx-1" /> {route.target_planet_id}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs font-mono text-slate-600">{route.id}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Route Form */}
            <div className="bg-slate-800/30 p-6 rounded-xl border border-slate-700/50">
                <h3 className="text-sm uppercase text-slate-400 font-bold mb-4 tracking-wider">Establish New Route</h3>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">

                    {/* Faction Selector */}
                    <div className="col-span-1">
                        <SearchableSelect
                            options={factionOptions}
                            value={selectedFactionId}
                            onChange={handleFactionChange}
                            placeholder="Select Faction..."
                            label="Faction"
                        />
                    </div>

                    {/* Planet Selector */}
                    <div className="col-span-1">
                        <SearchableSelect
                            options={filteredPlanets}
                            value={selectedTargetId}
                            onChange={setSelectedTargetId}
                            placeholder={selectedFactionId ? "Select Planet..." : "Select Faction First"}
                            label="Planet"
                        />
                    </div>

                    {/* Resource Selector */}
                    <div className="col-span-1">
                        <label className="block text-xs text-slate-500 mb-1">Resource</label>
                        <select
                            value={selectedResource}
                            onChange={e => setSelectedResource(e.target.value as ResourceId)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="credits">Credits</option>
                            <option value="metals">Metals</option>
                            <option value="chemicals">Chemicals</option>
                            <option value="food">Food</option>
                        </select>
                    </div>

                    {/* Amount Input */}
                    <div className="col-span-1">
                        <label className="block text-xs text-slate-500 mb-1">Amount</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            min="10"
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!selectedTargetId}
                        className="col-span-4 mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-3 px-4 rounded transition-colors text-sm"
                    >
                        Establish Route
                    </button>
                </form>
            </div>
        </div>
    );
}
