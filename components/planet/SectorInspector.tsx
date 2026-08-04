"use client";

// components/planet/SectorInspector.tsx
// Right-hand inspector for the selected surface sector: terrain, region,
// social groups, occupant building — and the build flow for empty sectors.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { BUILDINGS } from '@/data/buildings';
import type { BuildingDefinition } from '@/lib/construction/construction-types';
import type { PlanetSurface, SurfaceSector } from '@/lib/planet-surface/types';
import type { SectorOccupant } from '@/lib/planet-surface/occupancy';
import { TERRAIN_META } from './terrainMeta';
import { WEDGE_NAMES } from '@/lib/planet-surface/types';
import { X, Hammer, ArrowLeft, Clock, Mountain, AlertTriangle } from 'lucide-react';

interface SectorInspectorProps {
    planet: any;
    surface: PlanetSurface;
    sector: SurfaceSector;
    occupant: SectorOccupant | null;
    onClose: () => void;
}

const COST_KEYS: Array<{ key: keyof BuildingDefinition['cost']; reserve: string; label: string }> = [
    { key: 'metals', reserve: 'METALS', label: 'M' },
    { key: 'chemicals', reserve: 'CHEMICALS', label: 'C' },
    { key: 'food', reserve: 'FOOD', label: 'F' },
    { key: 'credits', reserve: 'CREDITS', label: '¢' },
    { key: 'energy', reserve: 'ENERGY', label: 'E' },
    { key: 'rares', reserve: 'RARES', label: 'R' },
];

function fmtDuration(sec: number): string {
    if (sec <= 0) return 'due';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(sec % 60)}s`;
}

export default function SectorInspector({ planet, surface, sector, occupant, onClose }: SectorInspectorProps) {
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const factions = useUIStore(s => s.factions);
    const nowSeconds = useUIStore(s => s.nowSeconds);
    const techState = useUIStore(s => s.techState);

    const [catalogOpen, setCatalogOpen] = React.useState(false);
    React.useEffect(() => { setCatalogOpen(false); }, [sector.index]);

    const isOwner = planet.ownerId === playerFactionId;
    const region = surface.regions.find(r => r.id === sector.regionId);
    const terrain = TERRAIN_META[sector.terrain];
    const reserves: Record<string, number> = ((playerFactionId ? factions[playerFactionId] : null)?.reserves ?? {}) as Record<string, number>;
    const unlockedTech = new Set(techState?.unlockedTechIds ?? []);
    const buildingDef = occupant ? BUILDINGS.find(b => b.id === occupant.buildingId) : null;

    const existingBuildingIds = new Set<string>([
        ...(planet.tiles ?? []).filter((t: any) => t.buildingId && t.constructionState !== 'ruined').map((t: any) => t.buildingId),
        ...(planet.buildQueue ?? []).map((q: any) => q.buildingId),
    ]);

    const handleBuild = (def: BuildingDefinition) => {
        dispatchOrder({
            actionId: 'PLANET_CONSTRUCT_BUILDING',
            factionId: playerFactionId || 'PLAYER_FACTION',
            payload: {
                planetId: planet.id,
                systemId: planet.systemId,
                buildingType: def.id,
                sectorIndex: sector.index,
            },
            label: `Constructing ${def.name} — ${WEDGE_NAMES[sector.wedge]} ring ${sector.ring + 1}`,
        });
        setCatalogOpen(false);
    };

    const canAfford = (def: BuildingDefinition) =>
        COST_KEYS.every(({ key, reserve }) => ((def.cost as any)[key] ?? 0) <= (reserves[reserve] ?? 0));

    const buildBlocked = (def: BuildingDefinition): string | null => {
        if (def.civilizationId) return 'RESTRICTED';
        if (def.techRequired && !unlockedTech.has(def.techRequired)) return 'TECH LOCKED';
        if ((def.infrastructureRequired ?? 0) > (planet.infrastructureLevel ?? 1)) return `INFRA ${def.infrastructureRequired} REQUIRED`;
        if (Array.isArray(def.tagRequirements) && def.tagRequirements.length > 0
            && !def.tagRequirements.every(t => (planet.tags ?? []).includes(t))) return `NEEDS ${def.tagRequirements.join(' + ').toUpperCase()}`;
        if (def.uniquePerPlanet && existingBuildingIds.has(def.id)) return 'UNIQUE — BUILT';
        if (sector.terrain === 'ocean' && !/naval|port|harbor|fish/i.test(def.id)) return 'OCEAN';
        if (!canAfford(def)) return 'CANNOT AFFORD';
        return null;
    };

    // ── Build catalog mode ───────────────────────────────────────────────────
    if (catalogOpen) {
        const categories = Array.from(new Set(BUILDINGS.map(b => b.category)));
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 px-3 h-10 border-b border-slate-800/60 flex-shrink-0">
                    <button onClick={() => setCatalogOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10">
                        <ArrowLeft size={14} />
                    </button>
                    <span className="text-[10px] font-display tracking-[0.2em] text-slate-300">
                        BUILD — {WEDGE_NAMES[sector.wedge].toUpperCase()} R{sector.ring + 1}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-3">
                    {categories.map(cat => {
                        const defs = BUILDINGS.filter(b => b.category === cat && !b.civilizationId);
                        if (!defs.length) return null;
                        return (
                            <div key={cat}>
                                <div className="text-[8px] font-display tracking-[0.25em] text-slate-500 uppercase px-1 mb-1">{cat}</div>
                                <div className="space-y-1">
                                    {defs.map(def => {
                                        const blocked = buildBlocked(def);
                                        return (
                                            <button
                                                key={def.id}
                                                disabled={!!blocked}
                                                onClick={() => handleBuild(def)}
                                                title={def.description}
                                                className={[
                                                    'w-full text-left px-2.5 py-2 rounded border transition-all',
                                                    blocked
                                                        ? 'border-slate-800/60 bg-slate-900/30 opacity-45 cursor-not-allowed'
                                                        : 'border-slate-700/60 bg-slate-900/60 hover:border-emerald-500/60 hover:bg-emerald-500/10',
                                                ].join(' ')}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold text-slate-200 truncate">{def.name}</span>
                                                    <span className="text-[8px] font-mono text-slate-500 flex-shrink-0">T{def.tier}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    {COST_KEYS.map(({ key, reserve, label }) => {
                                                        const amt = (def.cost as any)[key] ?? 0;
                                                        if (!amt) return null;
                                                        const shortfall = amt > (reserves[reserve] ?? 0);
                                                        return (
                                                            <span key={key} className={`text-[8px] font-mono ${shortfall ? 'text-rose-400' : 'text-slate-400'}`}>
                                                                {label}{amt}
                                                            </span>
                                                        );
                                                    })}
                                                    <span className="text-[8px] font-mono text-slate-500 ml-auto flex items-center gap-0.5">
                                                        <Clock size={8} />{fmtDuration(def.buildTimeSeconds || 3600)}
                                                    </span>
                                                </div>
                                                {blocked && <div className="text-[7px] font-display tracking-widest text-rose-400/80 mt-1">{blocked}</div>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Details mode ─────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 h-10 border-b border-slate-800/60 flex-shrink-0">
                <span className="text-[10px] font-display tracking-[0.2em]" style={{ color: terrain.color }}>
                    {WEDGE_NAMES[sector.wedge].toUpperCase()} · RING {sector.ring + 1}
                </span>
                <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10">
                    <X size={13} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Terrain */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center border" style={{ backgroundColor: `${terrain.color}22`, borderColor: `${terrain.color}55`, color: terrain.color }}>
                        {terrain.icon}
                    </div>
                    <div>
                        <div className="text-[12px] font-display tracking-wider text-slate-100 uppercase">{terrain.label}</div>
                        <div className="text-[9px] text-slate-500">Habitability {sector.habitability}%</div>
                    </div>
                </div>
                {sector.chokepoint && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-300">
                        <Mountain size={11} /> Natural chokepoint — defensive terrain
                    </div>
                )}

                {/* Ground war: who holds this district right now */}
                {planet.siege?.districts && (() => {
                    const war = planet.siege.districts;
                    const held = war.control?.[sector.index] === 'attacker' ? 'attacker' : 'defender';
                    const onFront = (war.contested ?? []).includes(sector.index);
                    const isLZ = (war.landingZones ?? []).includes(sector.index);
                    const dug = Math.round(war.entrenchment?.[sector.index] ?? 0);
                    return (
                        <div className={`rounded border p-2.5 ${held === 'attacker' ? 'border-rose-500/40 bg-rose-500/10' : 'border-sky-500/40 bg-sky-500/10'}`}>
                            <div className="text-[8px] font-display tracking-[0.25em] text-slate-400 uppercase mb-1">Front Status</div>
                            <div className={`text-[11px] font-display tracking-wider ${held === 'attacker' ? 'text-rose-300' : 'text-sky-300'}`}>
                                {held === 'attacker' ? 'ENEMY HELD' : 'FRIENDLY HELD'}
                            </div>
                            <div className="mt-1 space-y-0.5">
                                {onFront && <div className="text-[9px] text-amber-300">⚔ Contested — fighting here this cycle</div>}
                                {isLZ && <div className="text-[9px] text-rose-300">▲ Enemy beachhead</div>}
                                <div className="text-[9px] text-slate-400">Entrenchment {dug}%</div>
                            </div>
                        </div>
                    );
                })()}
                <p className="text-[9px] leading-relaxed text-slate-400">{terrain.blurb}</p>

                {/* Occupant */}
                {occupant && (
                    <div className="rounded border border-slate-700/60 bg-slate-900/60 p-2.5">
                        <div className="text-[8px] font-display tracking-[0.25em] text-slate-500 uppercase mb-1">Development</div>
                        <div className="text-[11px] font-bold text-slate-100">{buildingDef?.name ?? occupant.buildingId}</div>
                        {occupant.state === 'active' && buildingDef && (
                            <div className="mt-1.5 space-y-0.5">
                                {buildingDef.effects.map((e, i) => (
                                    <div key={i} className="text-[8px] font-mono text-emerald-400">
                                        {e.type.replace(/_/g, ' ')} {e.value > 0 ? '+' : ''}{e.value}{e.target ? ` (${e.target})` : ''}
                                    </div>
                                ))}
                            </div>
                        )}
                        {(occupant.state === 'under_construction' || occupant.state === 'pending') && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-mono text-sky-400">
                                <Clock size={10} className="animate-pulse" />
                                {occupant.state === 'pending'
                                    ? 'Order in transit…'
                                    : occupant.completesAtSeconds
                                        ? `Completes in ${fmtDuration(occupant.completesAtSeconds - nowSeconds)}`
                                        : 'Under construction'}
                            </div>
                        )}
                        {occupant.state === 'ruined' && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-rose-400">
                                <AlertTriangle size={10} /> Ruined — awaiting repair
                            </div>
                        )}
                    </div>
                )}

                {/* Build CTA */}
                {!occupant && isOwner && (
                    <button
                        onClick={() => setCatalogOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-display tracking-[0.2em] transition-all"
                    >
                        <Hammer size={13} /> DEVELOP SECTOR
                    </button>
                )}
                {!occupant && !isOwner && (
                    <div className="text-[9px] text-slate-600 text-center py-2">Undeveloped territory</div>
                )}

                {/* Region */}
                {region && (
                    <div className="rounded border border-slate-800/60 bg-slate-900/40 p-2.5">
                        <div className="flex items-center gap-1.5 mb-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: region.color }} />
                            <span className="text-[10px] font-display tracking-wider text-slate-200">{region.name}</span>
                        </div>
                        <div className="space-y-2">
                            {region.socialGroups.map(g => (
                                <div key={g.id}>
                                    <div className="flex justify-between text-[8px] text-slate-400 mb-0.5">
                                        <span>{g.name}</span>
                                        <span className="font-mono">{Math.round(g.share * 100)}%</span>
                                    </div>
                                    <div className="flex gap-1 items-center">
                                        <div className="h-0.5 flex-1 bg-slate-800 rounded overflow-hidden">
                                            <div className="h-full bg-emerald-500/70" style={{ width: `${g.loyalty}%` }} />
                                        </div>
                                        <span className="text-[7px] font-mono text-slate-600">LOY {g.loyalty}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
