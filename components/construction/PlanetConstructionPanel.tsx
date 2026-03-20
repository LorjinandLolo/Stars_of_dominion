'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Hammer, Clock, AlertTriangle, Building, ArrowUpCircle, Users, Heart, Zap } from 'lucide-react';
import { BuildingType, PlacedBuilding, ConstructionOrder } from '@/lib/construction/construction-types';
import { BUILDINGS as BUILDING_DEFS } from '@/data/buildings';
import { cancelBuildingAction, advanceTimeAction } from '@/app/actions/construction';
import { executePlayerAction } from '@/app/actions/registry-handler';
import { Navigation } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui-store';

function formatDuration(seconds: number): string {
    if (seconds <= 0) return 'Immediate';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
}

interface PlanetConstructionPanelProps {
    planetId: string;
    systemId: string;
    factionId: string;
    factionCredits: number;
    factionMetals: number;
    factionChemicals: number;
    factionEnergy: number;
    factionRares: number;
    factionManpower?: number;
    onClose: () => void;
}

export function PlanetConstructionPanel({
    planetId,
    systemId,
    factionId,
    factionCredits,
    factionMetals,
    factionChemicals,
    factionEnergy,
    factionRares,
    factionManpower = 0,
    onClose
}: PlanetConstructionPanelProps) {
    const { playerFactionId, diplomacyState } = useUIStore();
    const [activeTab, setActiveTab] = useState<'BUILD' | 'QUEUE' | 'SPACE'>('BUILD');
    const [buildings, setBuildings] = useState<PlacedBuilding[]>([]);
    const [queue, setQueue] = useState<ConstructionOrder[]>([]);
    const [spaceQueue, setSpaceQueue] = useState<any[]>([]);
    const [planet, setPlanet] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper: Map BUILDING_DEFS array to an object for easier lookup
    const buildingMap = React.useMemo(() => {
        const map: Record<string, typeof BUILDING_DEFS[0]> = {};
        BUILDING_DEFS.forEach(b => { map[b.id] = b; });
        return map;
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/game/construction?systemId=${systemId}`);
            const res = await response.json();
            if (res.success && res.data) {
                // Filter to just this planet for the panel view
                const p = res.data.planets.find((p: any) => p.id === planetId);
                setPlanet(p || null);
                setBuildings(res.data.buildings.filter((b: any) => b.planetId === planetId));
                setQueue(res.data.queue.filter((q: any) => q.planetId === planetId));
                if ('spaceBuildQueue' in res.data) {
                    setSpaceQueue(res.data.spaceBuildQueue.filter((q: any) => q.planetId === planetId));
                }
                setError(null);
            } else if (!res.success) {
                setError(res.error || 'Failed to load construction data');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load construction data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [planetId, systemId]);

    const handleQueueBuilding = async (type: string) => {
        setActionLoading(true);
        setError(null);
        try {
            const { queueBuildingAction } = await import('@/app/actions/construction');
            const res = await queueBuildingAction(planetId, systemId, type, factionId);
            if (!res.success) throw new Error(res.error || 'Failed to queue building');
            await loadData();
            setActiveTab('QUEUE');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleQueueSpaceConstruction = async (shipType: string) => {
        setActionLoading(true);
        setError(null);
        try {
            const { queueSpaceConstructionAction } = await import('@/app/actions/construction');
            const res = await queueSpaceConstructionAction(planetId, shipType, factionId);
            if (!res.success) throw new Error(res.error || 'Failed to queue space construction');
            await loadData();
            setActiveTab('QUEUE');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        setActionLoading(true);
        setError(null);
        try {
            const res = await cancelBuildingAction(orderId, factionId);
            if (!res.success) throw new Error(res.error || 'Failed to cancel order');
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // For testing/prototyping: instantly advance the turn
    const handleDevAdvanceTurn = async () => {
        setActionLoading(true);
        try {
            const res = await advanceTimeAction(86400); // 1 day
            if (res.success) {
                await loadData();
            } else {
                setError(res.error || 'Failed to advance time');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    // Helper: Can the faction afford this building right now?
    const canAfford = (type: string) => {
        const def = buildingMap[type];
        if (!def) return false;
        if (factionCredits < def.cost.credits) return false;
        if (def.cost.metals && factionMetals < def.cost.metals) return false;
        if (def.cost.chemicals && factionChemicals < def.cost.chemicals) return false;
        if (def.cost.energy && factionEnergy < def.cost.energy) return false;
        if (def.cost.manpower && factionManpower < def.cost.manpower) return false;
        return true;
    };

    // Helper: Is this an upgrade button? (Conceptual for now as defs don't have upgradesTo yet)
    const getUpgradePrereq = (type: string) => {
        const def = buildingMap[type];
        if (!def || def.tier === 1) return null;
        // For now, no implicit upgrade chain in data, so return null
        return null;
    };

    const hasPrereq = (type: string) => {
        const prereq = getUpgradePrereq(type);
        if (!prereq) return true; // Tier 1 or no prereq defined
        return buildings.some(b => b.buildingId === prereq && b.status === 'operational');
    };

    const handleBuildFleet = async () => {
        setActionLoading(true);
        setError(null);
        try {
            const res = await executePlayerAction({
                id: `act_${Date.now()}`,
                actionId: 'MIL_BUILD_FLEET',
                issuerId: factionId,
                targetId: systemId,
                payload: { planetId, systemId, factionId },
                timestamp: Math.floor(Date.now() / 1000)
            });
            if (!res.success) throw new Error(res.error || 'Failed to construct fleet');
            await loadData();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const hasShipyard = buildings.some(b => ['shipyard', 'naval_base', 'fleet_command'].includes(b.type) && b.status === 'operational');

    // Helper: get ownership color
    const getOwnershipColor = (ownerId: string | null) => {
        if (!ownerId) return 'var(--color-owner-neutral)';
        if (ownerId === playerFactionId) return 'var(--color-owner-player)';
        const isAlly = diplomacyState.treaties?.some(t => 
            t.status === 'active' && 
            t.signatories.includes(ownerId) && 
            t.signatories.includes(playerFactionId!)
        );
        if (isAlly) return 'var(--color-owner-ally)';
        const isEnemy = diplomacyState.rivalries?.some(r => 
            (r.empireAId === ownerId && r.empireBId === playerFactionId) ||
            (r.empireBId === ownerId && r.empireAId === playerFactionId)
        );
        if (isEnemy) return 'var(--color-owner-enemy)';
        return 'var(--color-owner-neutral)';
    };

    const ownerColor = getOwnershipColor(factionId); // Using factionId passed as prop which is the owner context

    // Organize BUILD tab into categories
    const categories = Array.from(new Set(Object.values(BUILDING_DEFS).map(d => d.category)));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div 
                className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border-2 rounded-xl shadow-2xl overflow-hidden shadow-cyan-900/10"
                style={{ borderColor: ownerColor }}
                >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                            <Hammer className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                                PLANETARY CONSTRUCTION
                                {planet && (
                                    <span className="text-xs font-mono font-normal bg-slate-800 px-2 py-0.5 rounded text-indigo-300 uppercase">
                                        {planet.planetType} WORLD
                                    </span>
                                )}
                            </h2>
                            {planet && (
                                <div className="flex gap-4 mt-1">
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Users className="w-3 h-3 text-blue-400" />
                                        <span className="font-mono text-slate-200">POP {(planet.population || 0).toFixed(1)}M / {planet.popCapacity || 20}M</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Heart className="w-3 h-3 text-rose-400" />
                                        <span className="font-mono text-slate-200">HAP {planet.happiness || 80}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <Zap className="w-3 h-3 text-amber-400" />
                                        <span className={`font-mono ${planet.unrest > 50 ? 'text-red-400' : 'text-slate-200'}`}>UNR {(planet.unrest || 0).toFixed(0)}%</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 pt-4 border-b border-slate-800 bg-slate-900/50">
                    <button
                        onClick={() => setActiveTab('BUILD')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${activeTab === 'BUILD'
                            ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                    >
                        BUILD OPTIONS
                    </button>
                    <button
                        onClick={() => setActiveTab('QUEUE')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${activeTab === 'QUEUE'
                            ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
                            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                    >
                        ACTIVE QUEUE & STRUCTURES
                    </button>
                    {hasShipyard && (
                        <button
                            onClick={() => setActiveTab('SPACE')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ${activeTab === 'SPACE'
                                ? 'border-fuchsia-500 text-fuchsia-400 bg-fuchsia-500/10'
                                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                        >
                            SPACE CONSTRUCTION
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-950/50 relative">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-red-400">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="text-sm font-medium space-y-1">
                                <p>Error Occurred</p>
                                <p className="text-red-300 opacity-90">{error}</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'BUILD' && (
                        <div className="space-y-8">
                            {categories.map(cat => (
                                <div key={cat} className="space-y-4">
                                    <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase flex items-center gap-2">
                                        <div className="h-px bg-slate-800 flex-1" />
                                        {cat}
                                        <div className="h-px bg-slate-800 flex-1" />
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {(Object.entries(BUILDING_DEFS) as [BuildingType, any][])
                                            .filter(([_, def]) => def.category === cat)
                                            .map(([type, def]) => {
                                                const afford = canAfford(type);
                                                const reqsMet = hasPrereq(type);
                                                const isUpgrade = def.tier > 1;

                                                // Don't clutter UI with upgrades for buildings we don't even have T1 of yet,
                                                // UNLESS we are specifically looking at T2/T3 and have the prerequisite.
                                                if (isUpgrade && !reqsMet) return null;

                                                return (
                                                    <div
                                                        key={type}
                                                        className={`p-4 rounded-xl border transition-all duration-200 flex flex-col
                                                            ${afford && reqsMet ? 'bg-slate-900 border-slate-700 hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10' : 'bg-slate-900/50 border-slate-800/50 opacity-75'}
                                                        `}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <h4 className="text-slate-200 font-semibold flex items-center gap-2">
                                                                    {isUpgrade ? <ArrowUpCircle className="w-4 h-4 text-emerald-400" /> : <Building className="w-4 h-4 text-slate-400" />}
                                                                    {def.name}
                                                                </h4>
                                                                <div className="text-xs text-slate-500 uppercase tracking-wider mt-0.5">Tier {def.tier}</div>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-950 px-2 py-1 rounded">
                                                                <Clock className="w-3 h-3" />
                                                                {formatDuration(def.buildTimeSeconds)}
                                                            </div>
                                                        </div>

                                                        <p className="text-sm text-slate-400 mb-4 flex-1 line-clamp-2">{def.description}</p>

                                                        {/* Costs */}
                                                        <div className="bg-slate-950/50 rounded p-2 mb-4">
                                                            <div className="text-[10px] uppercase text-slate-500 font-bold mb-1.5 tracking-wider">Construction Cost</div>
                                                            <div className="flex flex-wrap gap-2 text-xs">
                                                                <span className={factionCredits >= def.cost.credits ? 'text-emerald-400' : 'text-red-400'}>
                                                                    {def.cost.credits} Cr
                                                                </span>
                                                                {def.cost.metals > 0 && (
                                                                    <span className={factionMetals >= def.cost.metals ? 'text-slate-300' : 'text-red-400'}>
                                                                        {def.cost.metals} Met
                                                                    </span>
                                                                )}
                                                                {def.cost.chemicals > 0 && (
                                                                    <span className={factionChemicals >= def.cost.chemicals ? 'text-amber-300' : 'text-red-400'}>
                                                                        {def.cost.chemicals} Chm
                                                                    </span>
                                                                )}
                                                                {def.cost.energy && def.cost.energy > 0 && (
                                                                    <span className={factionEnergy >= def.cost.energy ? 'text-sky-300' : 'text-red-400'}>
                                                                        {def.cost.energy} Nrg
                                                                    </span>
                                                                )}
                                                                {def.cost.manpower > 0 && (
                                                                    <span className="text-blue-300">
                                                                        {def.cost.manpower} Man
                                                                    </span>
                                                                )}
                                                                {def.cost.rares && def.cost.rares > 0 && (
                                                                    <span className={factionRares >= def.cost.rares ? 'text-fuchsia-300' : 'text-red-400'}>
                                                                        {def.cost.rares} Rx
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Yields Preview */}
                                                        {def.effects.length > 0 && (
                                                            <div className="mb-4 text-xs font-medium text-emerald-400/80 bg-emerald-500/5 px-2 py-1.5 rounded">
                                                                Effects: {def.effects.map((e: any, idx: number) => (
                                                                    <span key={idx} className="mr-2">
                                                                        {e.type.replace(/_/g, ' ')}: +{e.value}
                                                                        {idx < def.effects.length - 1 ? ',' : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <button
                                                            disabled={!afford || !reqsMet || actionLoading}
                                                            onClick={() => handleQueueBuilding(type)}
                                                            className={`w-full py-2.5 rounded-lg text-sm font-medium tracking-wide transition-all mt-auto
                                                                ${(!afford || !reqsMet)
                                                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'}
                                                            `}
                                                        >
                                                            {isUpgrade ? 'COMMENCE UPGRADE' : 'QUEUE CONSTRUCTION'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}                    {activeTab === 'QUEUE' && (
                        <div className="space-y-6">
                            {/* Active Queue Section */}
                            <div>
                                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-cyan-500" />
                                    Active Construction
                                </h3>
                                {(queue.length === 0 && spaceQueue.length === 0) ? (
                                    <div className="p-8 border-2 border-dashed border-slate-800 rounded-xl text-center text-slate-500">
                                        No active construction on this planet.
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        {queue.map(order => {
                                            const def = buildingMap[order.buildingId];
                                            if (!def) return null;
                                            const isUpgrade = def.tier > 1;
                                            return (
                                                <div key={order.orderId} className="p-4 bg-slate-900 border border-slate-700/50 rounded-xl flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg">
                                                            {isUpgrade ? <ArrowUpCircle className="w-5 h-5" /> : <Hammer className="w-5 h-5" />}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-slate-200">
                                                                {isUpgrade ? `Upgrading: ${def.name}` : `Constructing: ${def.name}`}
                                                            </div>
                                                            <div className="text-xs text-slate-400 font-medium font-mono">
                                                                ETA: {formatDuration(order.completesAtSeconds - (Math.floor(Date.now() / 1000)))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {spaceQueue.map(order => (
                                            <div key={order.orderId} className="p-4 bg-slate-900 border border-fuchsia-900/30 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-fuchsia-500/10 text-fuchsia-400 rounded-lg">
                                                        <Navigation className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-slate-200">
                                                            Assembling: {order.shipType.replace(/_/g, ' ').toUpperCase()}
                                                        </div>
                                                        <div className="text-xs text-slate-400 font-medium font-mono">
                                                            ETA: {formatDuration(order.completesAtSeconds - (Math.floor(Date.now() / 1000)))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Completed Buildings Section */}
                            <div className="mt-8">
                                <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                                    <Building className="w-4 h-4 text-emerald-500" />
                                    Operational Infrastructure ({buildings.filter(b => b.status === 'operational').length} / 5)
                                </h3>
                                {buildings.length === 0 ? (
                                    <div className="p-8 border border-slate-800 rounded-xl text-center text-slate-500 bg-slate-900/30">
                                        Planet is undeveloped.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {buildings.map(bldg => {
                                            const def = buildingMap[bldg.buildingId];
                                            if (!def) return null;
                                            return (
                                                <div key={bldg.id} className="p-4 bg-slate-900 border border-slate-700 rounded-xl relative overflow-hidden group">
                                                    <div className={`absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 rotate-45 ${bldg.status === 'operational' ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} />
                                                    <div className="flex justify-between items-start relative z-10 mb-3">
                                                        <div>
                                                            <h4 className="font-bold text-slate-200">{def.name}</h4>
                                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mt-0.5">
                                                                <span>Tier {def.tier}</span>
                                                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                                                <span className={bldg.status === 'operational' ? 'text-emerald-500' : 'text-rose-500'}>
                                                                    {bldg.status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 text-xs relative z-10">
                                                        {def.effects.map((effect, idx) => (
                                                            <div key={idx} className={`flex justify-between items-center py-1 ${idx < def.effects.length - 1 ? 'border-b border-slate-800' : ''}`}>
                                                                <span className="text-slate-500 font-medium capitalize">{effect.type.replace(/_/g, ' ')}</span>
                                                                <span className="text-emerald-400 font-bold">+{effect.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'SPACE' && (
                        <div className="space-y-6">
                            <h3 className="text-sm font-bold tracking-widest text-slate-400 uppercase mb-4 flex items-center gap-2">
                                <Navigation className="w-4 h-4 text-fuchsia-500" />
                                SPACE CONSTRUCTION OPTIONS
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { id: 'trade_fleet', name: 'Trade Fleet', desc: 'Automated freighter convoy for interstellar commerce.', cost: '500 Cr, 200 Met, 100 Chm' },
                                    { id: 'corvette', name: 'Escort Corvette', desc: 'Fast, lightweight patrol vessel for local defense.', cost: '800 Cr, 300 Met, 150 Chm' },
                                    { id: 'sensor_relay', name: 'Sensor Relay', desc: 'Static orbital node that expands system detection range.', cost: '400 Cr, 200 Met, 200 Chm' },
                                    { id: 'exploration_node', name: 'Exploration Node', desc: 'Deep-space sensor array for clearing distant fog of war.', cost: '800 Cr, 400 Met, 400 Chm' }
                                ].map(ship => (
                                    <div key={ship.id} className="p-4 bg-slate-900 border border-slate-700 rounded-xl flex flex-col">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-slate-200 capitalize">{ship.name}</h4>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Orbital Order</div>
                                        </div>
                                        <p className="text-xs text-slate-400 mb-4 flex-1">{ship.desc}</p>
                                        <div className="text-[10px] font-mono text-fuchsia-400 mb-4">{ship.cost}</div>
                                        <button
                                            onClick={() => handleQueueSpaceConstruction(ship.id)}
                                            disabled={actionLoading}
                                            className="w-full py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-fuchsia-600/20"
                                        >
                                            REQUISITION
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default PlanetConstructionPanel;
