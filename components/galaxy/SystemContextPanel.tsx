"use client";

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { X, Tag, Shield, Zap, Users, Navigation, Search, Sparkles, LayoutGrid, Crosshair, AlertOctagon, Globe, Anchor, Swords } from 'lucide-react';
import { surveySystemAction } from '@/app/actions/exploration';
import { calculateBiosphereModifiers } from '@/lib/economy/biosphere-traits';
import { ResourceId } from '@/lib/economy/economy-types';
import { executePlayerAction } from '@/app/actions/registry-handler';


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

// ── Planet type metadata ───────────────────────────────────────────────────────
const PLANET_TYPE_ICONS: Record<string, { icon: string; color: string }> = {
    standard:    { icon: '🪐', color: '#94a3b8' },
    industrial:  { icon: '⚙️', color: '#f59e0b' },
    agricultural:{ icon: '🌿', color: '#22c55e' },
    fortress:    { icon: '🏰', color: '#ef4444' },
    research:    { icon: '🔬', color: '#3b82f6' },
    moon:        { icon: '🌙', color: '#a78bfa' },
    megaplanet:  { icon: '🌍', color: '#06b6d4' },
    capital:     { icon: '⭐', color: '#f59e0b' },
    hive:        { icon: '🐝', color: '#d97706' },
    prison:      { icon: '⛓️', color: '#6b7280' },
    resort:      { icon: '🏖️', color: '#10b981' },
    tomb:        { icon: '💀', color: '#78716c' },
    ocean:       { icon: '🌊', color: '#0ea5e9' },
    arctic:      { icon: '❄️', color: '#bae6fd' },
    desert:      { icon: '🏜️', color: '#ca8a04' },
};

// ── Orbit distance / size for visual layout ───────────────────────────────────
const ORBIT_SIZES = [26, 19, 15, 12];
const ORBIT_COLORS = ['#38bdf8', '#818cf8', '#34d399', '#fb923c'];

interface PlanetCardProps {
    planet: any;
    playerFactionId: string | null;
    selectedFleetId: string | null;
    orbitedPlanetId: string | null;
    selectedPlanetId: string | null;
    onOrbit: (planetId: string) => void;
    onSiege: (planetId: string) => void;
    onConstruct: (planetId: string) => void;
    orbitIndex: number;
}

function PlanetCard({
    planet,
    playerFactionId,
    selectedFleetId,
    orbitedPlanetId,
    selectedPlanetId,
    onOrbit,
    onSiege,
    onConstruct,
    orbitIndex,
}: PlanetCardProps) {
    const isOwnedByPlayer = planet.ownerId === playerFactionId;
    const isUnowned = !planet.ownerId;
    const isOrbitedByFleet = orbitedPlanetId === planet.id;
    const isSelected = selectedPlanetId === planet.id;

    const typeInfo = PLANET_TYPE_ICONS[planet.planetType] || { icon: '🪐', color: '#94a3b8' };
    const ownerColor = isOwnedByPlayer
        ? '#22c55e'
        : isUnowned
        ? '#94a3b8'
        : '#ef4444';

    const stability = planet.stability ?? 75;
    const unrest = planet.unrest ?? 0;

    return (
        <div
            className={`relative rounded-xl border transition-all duration-200 overflow-hidden ${
                isOrbitedByFleet
                    ? 'border-indigo-400/60 bg-indigo-950/40 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                    : isSelected
                    ? 'border-emerald-500/50 bg-emerald-950/20'
                    : 'border-slate-700/50 bg-slate-900/40 hover:border-slate-600/60'
            }`}
        >
            {/* Orbit index indicator */}
            <div
                className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
                style={{ backgroundColor: ORBIT_COLORS[orbitIndex % ORBIT_COLORS.length] }}
            />

            <div className="pl-3 pr-2 py-2.5">
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm leading-none">{typeInfo.icon}</span>
                        <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-200 truncate leading-tight">{planet.name}</div>
                            <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: typeInfo.color }}>
                                {planet.planetType}
                            </div>
                        </div>
                    </div>

                    {/* Owner pip */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {isOrbitedByFleet && (
                            <div className="flex items-center gap-0.5 text-[9px] font-bold text-indigo-400 bg-indigo-900/40 px-1.5 py-0.5 rounded border border-indigo-500/30">
                                <Anchor size={8} />
                                IN ORBIT
                            </div>
                        )}
                        <div
                            className="w-2 h-2 rounded-full border border-slate-700 flex-shrink-0"
                            style={{ backgroundColor: ownerColor }}
                            title={planet.ownerId ? `Owned by ${planet.ownerId.replace('faction-', '')}` : 'Unclaimed'}
                        />
                    </div>
                </div>

                {/* Tags row */}
                {planet.tags && planet.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {planet.tags.slice(0, 2).map((tag: string) => (
                            <span
                                key={tag}
                                className="flex items-center gap-0.5 text-[9px] font-display px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50"
                            >
                                <Tag size={7} />
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Stats mini-bars */}
                <div className="space-y-1 mb-2.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 w-12 uppercase tracking-wider">Stability</span>
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${stability}%`, backgroundColor: stability > 60 ? '#22c55e' : stability > 30 ? '#f59e0b' : '#ef4444' }}
                            />
                        </div>
                        <span className="text-[9px] font-mono text-slate-400">{stability}%</span>
                    </div>
                    {unrest > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-500 w-12 uppercase tracking-wider">Unrest</span>
                            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all bg-orange-500"
                                    style={{ width: `${unrest}%` }}
                                />
                            </div>
                            <span className="text-[9px] font-mono text-orange-400">{unrest}%</span>
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5">
                    {/* Construct (always available if player-owned) */}
                    {isOwnedByPlayer && (
                        <button
                            onClick={() => onConstruct(planet.id)}
                            className="flex-1 py-1 bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/30 rounded text-[9px] text-emerald-400 font-bold transition-all flex items-center justify-center gap-1"
                        >
                            <LayoutGrid size={9} />
                            BUILD
                        </button>
                    )}

                    {/* Orbit (if fleet selected and not already orbiting) */}
                    {selectedFleetId && !isOrbitedByFleet && (
                        <button
                            onClick={() => onOrbit(planet.id)}
                            className="flex-1 py-1 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 rounded text-[9px] text-indigo-400 font-bold transition-all flex items-center justify-center gap-1"
                        >
                            <Crosshair size={9} />
                            ORBIT
                        </button>
                    )}

                    {/* Siege (if fleet is in orbit and planet is enemy-owned or unowned) */}
                    {isOrbitedByFleet && !isOwnedByPlayer && (
                        <button
                            onClick={() => onSiege(planet.id)}
                            className="flex-1 py-1 bg-red-700/20 hover:bg-red-700/35 border border-red-500/30 rounded text-[9px] text-red-400 font-bold transition-all flex items-center justify-center gap-1 animate-pulse hover:animate-none"
                        >
                            <Swords size={9} />
                            SIEGE
                        </button>
                    )}

                    {/* Leave orbit */}
                    {isOrbitedByFleet && (
                        <button
                            onClick={() => onOrbit(planet.id)} // toggle
                            className="py-1 px-2 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-600/30 rounded text-[9px] text-slate-400 font-bold transition-all"
                            title="Leave orbit"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function SystemContextPanel() {
    const {
        selectedSystemId,
        systems,
        regions,
        setSelectedSystem,
        selectedFleetId,
        setSelectedFleetId,
        setSelectedPlanet,
        selectedPlanetId,
        playerFactionId,
        orbitedPlanetId,
        setOrbitedPlanet,
        setSystemContested,
        setPlanets, // New: from the UI store
    } = useUIStore();
    const [moving, setMoving] = React.useState(false);
    const [surveying, setSurveying] = React.useState(false);
    const [sieging, setSieging] = React.useState<string | null>(null);
    const storePlanets = useUIStore(s => s.planets);
    const planets = React.useMemo(() => 
        storePlanets.filter(p => p.systemId === selectedSystemId),
    [storePlanets, selectedSystemId]);
    const loadingPlanets = false; // Now handled by global sync
    const [activeTab, setActiveTab] = React.useState<'system' | 'planets'>('system');

    React.useEffect(() => {
        if (selectedSystemId) {
            // Auto-switch to planets tab when there's more than 1
            if (planets.length > 1) {
                setActiveTab('planets');
            }
        }
    }, [selectedSystemId, planets.length]);

    const system = systems.find((s) => s.id === selectedSystemId);
    if (!system) return null;

    const region = regions.find((r) => r.systemIds.includes(system.id));

    const statusColor = (v: number) =>
        v < 33 ? '#22c55e' : v < 66 ? '#f59e0b' : '#ef4444';

    const modifiers = calculateBiosphereModifiers(system.tags);
    const hasActiveModifiers = Object.values(modifiers).some(m => m !== 1.0 && m !== undefined);

    // ── Contested system logic ─────────────────────────────────────────────────
    const isContested = system.isContested || [...new Set(planets.map(p => p.ownerId).filter(o => o && o !== 'faction-neutral'))].length > 1;
    const playerOwnedCount = planets.filter(p => p.ownerId === playerFactionId).length;
    const enemyOwnedCount = planets.filter(p => p.ownerId && p.ownerId !== playerFactionId && p.ownerId !== 'faction-neutral').length;


    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleMoveFleetToSystem = async () => {
        if (!selectedFleetId) return;
        setMoving(true);
        try {
            const res = await executePlayerAction({
                id: `act_${Date.now()}`,
                actionId: 'MIL_MOVE_FLEET',
                issuerId: playerFactionId || 'PLAYER_FACTION',
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
    };

    const handleOrbitPlanet = (planetId: string) => {
        // Toggle: if already orbiting this planet, leave orbit; else enter orbit
        setOrbitedPlanet(orbitedPlanetId === planetId ? null : planetId);
    };

    const handleSiegePlanet = async (planetId: string) => {
        setSieging(planetId);
        try {
            // Queues MIL_INVASION_PLANET into Appwrite game_orders.
            // The game-loop.ts worker picks it up every 5 seconds, resolves it
            // server-side (authoritative), then pushes an updated snapshot to all
            // connected clients via the Appwrite Realtime WebSocket channel.
            await executePlayerAction({
                id: `act_${Date.now()}`,
                actionId: 'MIL_INVASION_PLANET',
                issuerId: playerFactionId || 'PLAYER_FACTION',
                targetId: planetId,
                payload: {
                    fleetId: selectedFleetId,
                    systemId: system.id,
                    planetId,
                },
                timestamp: Math.floor(Date.now() / 1000)
            });

            // Optimistic re-fetch so this player sees immediate feedback
            // while waiting for the authoritative WebSocket snapshot push.
            const r = await fetch(`/api/game/construction?systemId=${system.id}`).then(res => res.json());
            if (r.success && r.data) {
                const updated: any[] = r.data.planets;
                // Update the *global* store with these specific planets. 
                // Since this is a full list for the system, we merge it with the previous global state.
                const prev = useUIStore.getState().planets;
                const nextIds = new Set(updated.map(p => p.id));
                const filteredPrev = prev.filter(p => !nextIds.has(p.id));
                setPlanets([...filteredPrev, ...updated]);

                const owners = [...new Set(updated.map((p: any) => p.ownerId).filter(Boolean))];
                setSystemContested(system.id, owners.length > 1);
            }
            setOrbitedPlanet(null);
        } finally {
            setSieging(null);
        }
    };


    const handleConstruct = (planetId: string) => {
        setSelectedPlanet(planetId);
    };

    return (
        <div className="absolute top-4 right-4 z-30 w-76 pointer-events-auto" style={{ width: '300px' }}>
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

                {/* Contested Banner */}
                {isContested && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-orange-950/50 border-b border-orange-600/30">
                        <AlertOctagon size={13} className="text-orange-400 flex-shrink-0 animate-pulse" />
                        <span className="text-[10px] font-display tracking-widest text-orange-300 uppercase">
                            Contested System — {playerOwnedCount} allied / {enemyOwnedCount} hostile
                        </span>
                    </div>
                )}

                {/* Tab Bar (if planets available) */}
                {planets.length > 0 && (
                    <div className="flex border-b border-slate-700/60">
                        <button
                            onClick={() => setActiveTab('system')}
                            className={`flex-1 py-2 text-[10px] font-display tracking-widest uppercase transition-colors ${
                                activeTab === 'system'
                                    ? 'text-amber-400 bg-slate-800/50 border-b-2 border-amber-500'
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            System
                        </button>
                        <button
                            onClick={() => setActiveTab('planets')}
                            className={`flex-1 py-2 text-[10px] font-display tracking-widest uppercase transition-colors flex items-center justify-center gap-1.5 ${
                                activeTab === 'planets'
                                    ? 'text-sky-400 bg-slate-800/50 border-b-2 border-sky-500'
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <Globe size={10} />
                            Planets ({planets.length})
                        </button>
                    </div>
                )}

                {/* Body */}
                <div className="px-4 py-3 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700">

                    {activeTab === 'system' && (
                        <>
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
                            {(system.ownerFactionId || (system as any).ownerId) && (
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Users size={12} className="text-slate-500" />
                                    <span className="text-slate-300">{(system.ownerFactionId || (system as any).ownerId).replace('faction-', '').toUpperCase()}</span>
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
                                                    {k}: +{v as number}%
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

                            {/* Fleet Deploy — move to system (then choose planet from planets tab) */}
                            {selectedFleetId && (
                                <div className="mt-4 pt-4 border-t border-slate-700/60">
                                    <p className="text-[10px] text-slate-500 italic mb-2 leading-relaxed">
                                        Fleet will enter this system. Switch to <span className="text-sky-400 font-bold">PLANETS</span> tab to assign orbital positions.
                                    </p>
                                    <button
                                        disabled={moving}
                                        onClick={handleMoveFleetToSystem}
                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs tracking-wider font-bold transition-all shadow-lg flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Navigation className="w-4 h-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                                        {moving ? 'PLOTTING COURSE...' : 'JUMP TO SYSTEM'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Planets Tab ────────────────────────────────────────────────────── */}
                    {activeTab === 'planets' && (
                        <div className="space-y-3">
                            {/* Mini orbit visual */}
                            <div className="flex items-center justify-center py-2">
                                <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
                                    {/* Star */}
                                    <div className="absolute w-6 h-6 rounded-full bg-amber-400 shadow-[0_0_12px_4px_rgba(251,191,36,0.4)] z-10" />
                                    {/* Orbit rings */}
                                    {planets.map((_, i) => (
                                        <div
                                            key={i}
                                            className="absolute rounded-full border border-slate-700/40"
                                            style={{
                                                width: (ORBIT_SIZES[i % ORBIT_SIZES.length] * 2) + 24,
                                                height: (ORBIT_SIZES[i % ORBIT_SIZES.length] * 2) + 24,
                                            }}
                                        />
                                    ))}
                                    {/* Planet dots on orbits */}
                                    {planets.map((planet, i) => {
                                        const angle = (i / planets.length) * Math.PI * 2 - Math.PI / 2;
                                        const radius = ORBIT_SIZES[i % ORBIT_SIZES.length] + 12;
                                        const x = Math.cos(angle) * radius;
                                        const y = Math.sin(angle) * radius;
                                        const isOrbited = orbitedPlanetId === planet.id;
                                        return (
                                            <div
                                                key={planet.id}
                                                className={`absolute w-2.5 h-2.5 rounded-full border transition-all ${isOrbited ? 'scale-150 shadow-[0_0_6px_2px_rgba(99,102,241,0.6)]' : ''}`}
                                                style={{
                                                    backgroundColor: ORBIT_COLORS[i % ORBIT_COLORS.length],
                                                    borderColor: isOrbited ? '#818cf8' : 'transparent',
                                                    transform: `translate(calc(${x}px - 5px), calc(${y}px - 5px))`,
                                                    left: '50%',
                                                    top: '50%',
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Contested Legend */}
                            {isContested && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-950/40 border border-orange-500/20">
                                    <AlertOctagon size={12} className="text-orange-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-orange-300/80 leading-relaxed">
                                        Hostile forces control planets in this system. Achieving full control requires capturing all {planets.length} planets.
                                    </p>
                                </div>
                            )}

                            {/* Orbital siege/fleet instructions */}
                            {selectedFleetId && !orbitedPlanetId && (
                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20">
                                    <Crosshair size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-indigo-300/80 leading-relaxed">
                                        Fleet is in system. Select <strong>ORBIT</strong> on a planet to establish orbital superiority, then <strong>SIEGE</strong> to begin ground assault.
                                    </p>
                                </div>
                            )}

                            {/* Planet Cards */}
                            {loadingPlanets ? (
                                <div className="space-y-2">
                                    {[1, 2].map(i => (
                                        <div key={i} className="h-20 bg-slate-800/50 rounded-xl animate-pulse" />
                                    ))}
                                </div>
                            ) : planets.length === 0 ? (
                                <div className="text-center py-6 text-slate-500 text-[10px] font-display tracking-widest uppercase">
                                    No colonized worlds in this system
                                </div>
                            ) : (
                                planets.map((planet, i) => (
                                    <PlanetCard
                                        key={planet.id}
                                        planet={planet}
                                        playerFactionId={playerFactionId}
                                        selectedFleetId={selectedFleetId}
                                        orbitedPlanetId={orbitedPlanetId}
                                        selectedPlanetId={selectedPlanetId}
                                        onOrbit={handleOrbitPlanet}
                                        onSiege={handleSiegePlanet}
                                        onConstruct={handleConstruct}
                                        orbitIndex={i}
                                    />
                                ))
                            )}

                            {/* System control summary */}
                            {planets.length > 0 && (
                                <div className="pt-2 border-t border-slate-700/40">
                                    <div className="flex justify-between text-[9px] font-display tracking-widest uppercase text-slate-500">
                                        <span>System Control</span>
                                        <span className={isContested ? 'text-orange-400' : playerOwnedCount === planets.length ? 'text-emerald-400' : 'text-slate-400'}>
                                            {isContested ? 'CONTESTED' : playerOwnedCount === planets.length ? 'FULL CONTROL' : 'PARTIAL'}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                        <div
                                            className="h-full bg-emerald-500 transition-all"
                                            style={{ width: `${(playerOwnedCount / planets.length) * 100}%` }}
                                        />
                                        <div
                                            className="h-full bg-red-500 transition-all"
                                            style={{ width: `${(enemyOwnedCount / planets.length) * 100}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-1 text-[8px] text-slate-600">
                                        <span className="text-emerald-600">{playerOwnedCount} Allied</span>
                                        <span className="text-red-600">{enemyOwnedCount} Hostile</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
