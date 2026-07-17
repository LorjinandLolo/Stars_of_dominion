"use client";

// components/galaxy/FleetCommandBar.tsx
// Stars of Dominion — Fleet Command roster
//
// The missing piece of fleet UX: a docked, always-reachable list of YOUR
// fleets. Clicking one selects it and snaps the camera to it; with a fleet
// selected, clicking any system on the map opens the system panel with
// "JUMP TO SYSTEM", and planets offer ORBIT / INVADE / ENGAGE.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { Anchor, ChevronDown, ChevronUp, GitMerge, Navigation, Rocket, Scissors, Swords, Users, X } from 'lucide-react';

export default function FleetCommandBar() {
    const fleets = useUIStore(s => s.fleets);
    const systems = useUIStore(s => s.systems);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const selectedFleetId = useUIStore(s => s.selectedFleetId);
    const setSelectedFleetId = useUIStore(s => s.setSelectedFleetId);
    const setSelectedSystem = useUIStore(s => s.setSelectedSystem);
    const setSelectedPlanet = useUIStore(s => s.setSelectedPlanet);
    const setFocusTarget = useUIStore(s => s.setFocusTarget);

    const [collapsed, setCollapsed] = React.useState(false);
    const activeCombats = useUIStore(s => s.activeCombats);

    // ── Drag & drop fleet merging ──
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = React.useState<string | null>(null);

    // ── Fleet splitting ──
    const [splitFleetId, setSplitFleetId] = React.useState<string | null>(null);
    const [splitCounts, setSplitCounts] = React.useState<Record<string, number>>({});

    const myFleets = fleets.filter((f: any) => f.factionId === playerFactionId);

    const sysName = (id: string | null | undefined) =>
        systems.find((s: any) => s.id === id)?.name ?? (id ? id.slice(0, 10) : '—');

    /** Best "where is it" system for a fleet — current, next hop, or destination. */
    const fleetSystemId = (fleet: any): string | null =>
        fleet.currentSystemId
        ?? (Array.isArray(fleet.plannedPath) && fleet.plannedPath.length > 1 ? fleet.plannedPath[1] : null)
        ?? fleet.destinationSystemId
        ?? null;

    const inCombat = (fleet: any) =>
        (activeCombats as any[]).some((c: any) => c?.location?.systemId && c.location.systemId === fleet.currentSystemId);

    const handleSelect = (fleet: any, zoom = 1.5) => {
        setSelectedFleetId(fleet.id);
        // Clear any planet selection — the bottom dock shows the planet garrison
        // when one is selected, hiding the fleet's own battle card.
        setSelectedPlanet(null);
        const sysId = fleetSystemId(fleet);
        const sys = systems.find((s: any) => s.id === sysId);
        if (sys) {
            setSelectedSystem(sys.id);
            setFocusTarget({ x: sys.q, y: sys.r, zoom });
        }
    };

    /** Fleets can merge only while both are holding in the same system. */
    const canMergeInto = (srcId: string | null, tgt: any): boolean => {
        if (!srcId || srcId === tgt.id) return false;
        const src = myFleets.find((f: any) => f.id === srcId);
        if (!src) return false;
        return !!src.currentSystemId
            && src.currentSystemId === tgt.currentSystemId
            && !src.destinationSystemId
            && !tgt.destinationSystemId;
    };

    const openSplit = (fleet: any) => {
        if (splitFleetId === fleet.id) { setSplitFleetId(null); return; }
        // Default: take half of each ship type
        const half: Record<string, number> = {};
        for (const [type, count] of Object.entries(fleet.composition || {})) {
            half[type] = Math.floor((Number(count) || 0) / 2);
        }
        setSplitCounts(half);
        setSplitFleetId(fleet.id);
    };

    const handleSplitConfirm = async (fleet: any) => {
        const composition: Record<string, number> = {};
        for (const [type, count] of Object.entries(splitCounts)) {
            if (count > 0) composition[type] = count;
        }
        setSplitFleetId(null);
        await dispatchOrder({
            actionId: 'MIL_SPLIT_FLEET',
            factionId: playerFactionId || 'PLAYER_FACTION',
            payload: { fleetId: fleet.id, composition },
            label: `Detaching forces from ${fleet.name ?? fleet.id}`,
        });
    };

    const handleMergeDrop = async (targetFleet: any) => {
        const srcId = draggingId;
        setDraggingId(null);
        setDropTargetId(null);
        if (!canMergeInto(srcId, targetFleet)) return;
        const src = myFleets.find((f: any) => f.id === srcId);
        await dispatchOrder({
            actionId: 'MIL_MERGE_FLEETS',
            factionId: playerFactionId || 'PLAYER_FACTION',
            payload: { sourceFleetId: srcId, targetFleetId: targetFleet.id },
            label: `Merging ${src?.name ?? 'fleet'} into ${targetFleet.name ?? targetFleet.id}`,
        });
        // If the absorbed fleet was selected, follow the merge to the survivor.
        if (useUIStore.getState().selectedFleetId === srcId) {
            setSelectedFleetId(targetFleet.id);
        }
    };

    const shipCount = (fleet: any) =>
        Object.values(fleet.composition || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);

    return (
        <div className="absolute right-3 bottom-16 z-30 w-64 pointer-events-auto">
            <div className="rounded-xl border border-indigo-700/40 bg-slate-950/90 backdrop-blur-md shadow-2xl overflow-hidden">
                {/* Header */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-indigo-950/60 hover:bg-indigo-900/40 transition-colors"
                >
                    <span className="flex items-center gap-2 text-[10px] font-display font-bold tracking-widest text-indigo-300 uppercase">
                        <Rocket size={11} />
                        Fleet Command ({myFleets.length})
                    </span>
                    {collapsed ? <ChevronUp size={12} className="text-indigo-400" /> : <ChevronDown size={12} className="text-indigo-400" />}
                </button>

                {!collapsed && (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60">
                        {myFleets.length === 0 ? (
                            <p className="p-3 text-[10px] text-slate-500 leading-relaxed">
                                No fleets yet. Open a planet's <span className="text-indigo-400 font-bold">UNITS</span> panel
                                and commission one from the <span className="text-indigo-400 font-bold">SPACE</span> tab.
                            </p>
                        ) : (
                            myFleets.map((fleet: any) => {
                                const isSelected = selectedFleetId === fleet.id;
                                const inTransit = !!fleet.destinationSystemId;
                                const ships = shipCount(fleet);
                                const isDragging = draggingId === fleet.id;
                                const isValidDrop = draggingId ? canMergeInto(draggingId, fleet) : false;
                                const isDropHover = dropTargetId === fleet.id && isValidDrop;
                                return (
                                    <div
                                        key={fleet.id}
                                        onClick={() => handleSelect(fleet)}
                                        onDoubleClick={() => handleSelect(fleet, 2.6)}
                                        title="Click: select · Double-click: fly camera to this fleet · Drag onto another fleet to merge"
                                        draggable
                                        onDragStart={(e) => {
                                            setDraggingId(fleet.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', fleet.id);
                                        }}
                                        onDragEnd={() => { setDraggingId(null); setDropTargetId(null); }}
                                        onDragOver={(e) => {
                                            if (isValidDrop) {
                                                e.preventDefault();
                                                e.dataTransfer.dropEffect = 'move';
                                            }
                                        }}
                                        onDragEnter={() => { if (isValidDrop) setDropTargetId(fleet.id); }}
                                        onDragLeave={() => { if (dropTargetId === fleet.id) setDropTargetId(null); }}
                                        onDrop={(e) => { e.preventDefault(); handleMergeDrop(fleet); }}
                                        className={`px-3 py-2 cursor-pointer transition-all ${
                                            isDropHover
                                                ? 'bg-emerald-600/25 border-l-2 border-emerald-400 ring-1 ring-inset ring-emerald-500/50'
                                                : isDragging
                                                ? 'opacity-40 border-l-2 border-slate-500 border-dashed'
                                                : draggingId && !isValidDrop
                                                ? 'opacity-30 border-l-2 border-transparent'
                                                : isSelected
                                                ? 'bg-indigo-600/25 border-l-2 border-indigo-400'
                                                : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                                        }`}
                                    >
                                        {isDropHover && (
                                            <div className="flex items-center gap-1 text-[8px] font-bold text-emerald-300 mb-1">
                                                <GitMerge size={9} />
                                                RELEASE TO MERGE INTO THIS FLEET
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-bold text-slate-200 truncate">
                                                {fleet.name || fleet.id}
                                                {(fleet as any).__optimistic && (
                                                    <span className="ml-1.5 text-[8px] text-cyan-400 animate-pulse">SYNCING</span>
                                                )}
                                            </span>
                                            <span className="flex items-center gap-1 flex-shrink-0">
                                                {!inTransit && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openSplit(fleet); }}
                                                        className={`${splitFleetId === fleet.id ? 'text-amber-300' : 'text-slate-500 hover:text-amber-300'}`}
                                                        title="Split this fleet — detach ships into a new fleet"
                                                    >
                                                        <Scissors size={11} />
                                                    </button>
                                                )}
                                                {isSelected && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setSelectedFleetId(null); }}
                                                        className="text-slate-500 hover:text-slate-300"
                                                        title="Deselect fleet"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mt-0.5">
                                            <span className={`flex items-center gap-1 text-[9px] ${inTransit ? 'text-sky-400' : 'text-slate-500'}`}>
                                                {inTransit ? <Navigation size={8} /> : <Anchor size={8} />}
                                                {inTransit
                                                    ? `→ ${sysName(fleet.destinationSystemId)} · ${Math.round((fleet.transitProgress ?? 0) * 100)}%`
                                                    : `holding at ${sysName(fleet.currentSystemId)}`}
                                            </span>
                                            <span className="text-[9px] font-mono text-slate-400">
                                                {ships > 0 ? `${ships} ships` : `pwr ${fleet.basePower ?? 0}`}
                                            </span>
                                        </div>
                                        {/* ── Split editor ── */}
                                        {splitFleetId === fleet.id && (() => {
                                            const compEntries = Object.entries(fleet.composition || {}).filter(([, c]) => (Number(c) || 0) > 0);
                                            const totalShipsHere = compEntries.reduce((a, [, c]) => a + (Number(c) || 0), 0);
                                            const takeTotal = Object.values(splitCounts).reduce((a, b) => a + (b || 0), 0);
                                            const wouldTakeAll = totalShipsHere > 0 && takeTotal >= totalShipsHere;
                                            return (
                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="mt-1.5 p-2 rounded border border-amber-600/30 bg-amber-950/20 space-y-1.5"
                                                >
                                                    <div className="text-[8px] uppercase tracking-widest text-amber-400/80 font-bold flex items-center gap-1">
                                                        <Scissors size={8} />
                                                        Detach into new fleet
                                                    </div>
                                                    {compEntries.length === 0 ? (
                                                        <p className="text-[9px] text-slate-400">
                                                            No ships aboard — splitting will divide base power 50/50.
                                                        </p>
                                                    ) : (
                                                        compEntries.map(([type, count]) => {
                                                            const max = Number(count) || 0;
                                                            const take = splitCounts[type] ?? 0;
                                                            return (
                                                                <div key={type} className="flex items-center justify-between gap-2">
                                                                    <span className="text-[9px] text-slate-300 uppercase truncate">{type.toLowerCase()} ({max})</span>
                                                                    <span className="flex items-center gap-1">
                                                                        <button
                                                                            onClick={() => setSplitCounts(s => ({ ...s, [type]: Math.max(0, (s[type] ?? 0) - 1) }))}
                                                                            className="w-4 h-4 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] leading-none hover:bg-slate-700"
                                                                        >−</button>
                                                                        <span className="w-6 text-center text-[10px] font-mono text-amber-300">{take}</span>
                                                                        <button
                                                                            onClick={() => setSplitCounts(s => ({ ...s, [type]: Math.min(max, (s[type] ?? 0) + 1) }))}
                                                                            className="w-4 h-4 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] leading-none hover:bg-slate-700"
                                                                        >+</button>
                                                                    </span>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                    {wouldTakeAll && (
                                                        <p className="text-[8px] text-red-400">Leave at least one ship behind.</p>
                                                    )}
                                                    <div className="flex gap-1.5 pt-0.5">
                                                        <button
                                                            disabled={wouldTakeAll || (compEntries.length > 0 && takeTotal === 0)}
                                                            onClick={() => handleSplitConfirm(fleet)}
                                                            className="flex-1 py-1 rounded bg-amber-600/30 hover:bg-amber-500/40 border border-amber-500/40 text-amber-200 text-[9px] font-bold tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            DETACH
                                                        </button>
                                                        <button
                                                            onClick={() => setSplitFleetId(null)}
                                                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[9px] font-bold"
                                                        >
                                                            CANCEL
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Status badges: troops aboard / in combat */}
                                        {((fleet.transportedArmyIds?.length ?? 0) > 0 || inCombat(fleet)) && (
                                            <div className="flex items-center gap-2 mt-1">
                                                {(fleet.transportedArmyIds?.length ?? 0) > 0 && (
                                                    <span className="flex items-center gap-1 text-[8px] font-bold text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-600/30">
                                                        <Users size={8} />
                                                        {fleet.transportedArmyIds.length} {fleet.transportedArmyIds.length === 1 ? 'ARMY' : 'ARMIES'} ABOARD
                                                    </span>
                                                )}
                                                {inCombat(fleet) && (
                                                    <span className="flex items-center gap-1 text-[8px] font-bold text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded border border-red-600/40 animate-pulse">
                                                        <Swords size={8} />
                                                        IN COMBAT
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}

                        {draggingId ? (
                            <p className="px-3 py-2 text-[9px] text-emerald-300/80 bg-emerald-950/40 leading-relaxed">
                                <span className="font-bold">Merging:</span> drop onto a highlighted fleet to combine
                                them. Fleets must be holding in the same system.
                            </p>
                        ) : selectedFleetId ? (
                            <p className="px-3 py-2 text-[9px] text-indigo-300/70 bg-indigo-950/40 leading-relaxed">
                                Fleet selected — <span className="font-bold text-indigo-300">right-click any system</span> to
                                move there instantly, or click one and use JUMP TO SYSTEM.
                            </p>
                        ) : myFleets.length > 1 ? (
                            <p className="px-3 py-2 text-[9px] text-slate-500 bg-slate-900/40 leading-relaxed">
                                Tip: <span className="text-slate-400 font-bold">drag one fleet onto another</span> (same
                                system) to merge them into a single force.
                            </p>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
