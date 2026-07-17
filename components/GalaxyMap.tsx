"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { HexGrid } from '@/lib/hex-grid';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { Activity } from 'lucide-react';
import HexCell from './map/HexCell';

interface GalaxyMapProps {
    planets: any[];
    factions: any[];
    armies?: any[];
    onHexClick?: (x: number, y: number) => void;
    selectedHex?: { x: number, y: number } | null;
}

export default function GalaxyMap({ planets, factions, armies, onHexClick, selectedHex }: GalaxyMapProps) {
    const { playerFactionId, diplomacyState, focusTarget, setFocusTarget } = useUIStore();
    
    // ─── DATA PRE-PROCESSING ────────────────────────────────────────────────
    const processedPlanets = useMemo(() => {
        const planetMap = new Map();
        if (planets) {
            planets.forEach(p => {
                let attrs = p.attributes;
                if (typeof attrs === 'string') {
                    try { attrs = JSON.parse(attrs); } catch (e) { attrs = {}; }
                }
                planetMap.set(`${p.x},${p.y}`, { ...p, _parsedAttrs: attrs });
            });
        }
        return planetMap;
    }, [planets]);

    const processedArmies = useMemo(() => {
        const armyMap = new Map();
        if (armies) armies.forEach(a => armyMap.set(`${a.x},${a.y}`, a));
        return armyMap;
    }, [armies]);

    const { minX, minY, maxX, maxY, ROWS, COLS } = useMemo(() => {
        if (!planets || !planets.length) return { minX: 0, minY: 0, maxX: 50, maxY: 50, ROWS: 50, COLS: 50 };
        const xs = planets.map(p => p.x);
        const ys = planets.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
            minX, minY, maxX, maxY,
            ROWS: Math.max(20, maxY + 5),
            COLS: Math.max(20, maxX + 5)
        };
    }, [planets]);

    const HEX_SIZE = 25;
    const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
    const HEX_HEIGHT = 2 * HEX_SIZE;

    const grid = useMemo(() => new HexGrid(ROWS, COLS), [ROWS, COLS]);
    const corners = useMemo(() => grid.getHexCorners(HEX_SIZE), [grid, HEX_SIZE]);

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (!playerFactionId || !factions?.length || !planets?.length) return;
        
        const factionIdToFind = typeof playerFactionId === 'string' ? playerFactionId : (playerFactionId as any).id;
        const faction = factions.find(f => (f.$id || f.id) === factionIdToFind);
        
        if (faction && faction.capitalSystemId) {
            const capitalPlanet = planets.find(p => p.systemId === faction.capitalSystemId || p.id === `planet-${faction.capitalSystemId}`);
            if (capitalPlanet) {
                setFocusTarget({ x: capitalPlanet.x, y: capitalPlanet.y, zoom: 1.5 });
            }
        }
    }, [playerFactionId, factions, planets, setFocusTarget]);

    useEffect(() => {
        if (!focusTarget) return;

        const { x, y, zoom: targetZoom } = focusTarget;
        const targetPix = grid.hexToPixel(x, y, HEX_SIZE);
        
        const padding = 3;
        const baseW = (maxX - minX + padding * 2) * HEX_WIDTH;
        const baseH = (maxY - minY + padding * 2) * 0.75 * HEX_HEIGHT;
        const baseX = (minX - padding) * HEX_WIDTH;
        const baseY = (minY - padding) * 0.75 * HEX_HEIGHT;

        if (targetZoom) setZoom(targetZoom);

        const currentW = baseW / (targetZoom || zoom);
        const currentH = baseH / (targetZoom || zoom);

        setPan({
            x: targetPix.x - baseX - currentW / 2,
            y: targetPix.y - baseY - currentH / 2
        });

        setFocusTarget(null);
    }, [focusTarget, minX, minY, maxX, maxY, HEX_WIDTH, HEX_HEIGHT, zoom, grid, setFocusTarget, HEX_SIZE]);

    const { currentViewBox, visibleBounds } = useMemo(() => {
        const padding = 3;
        const baseW = (maxX - minX + padding * 2) * HEX_WIDTH;
        const baseH = (maxY - minY + padding * 2) * 0.75 * HEX_HEIGHT;
        const baseX = (minX - padding) * HEX_WIDTH;
        const baseY = (minY - padding) * 0.75 * HEX_HEIGHT;

        const vw = baseW / zoom;
        const vh = baseH / zoom;

        const vx = baseX + pan.x + (baseW - vw) / 2;
        const vy = baseY + pan.y + (baseH - vh) / 2;

        const minCol = Math.floor((vx - HEX_WIDTH) / HEX_WIDTH);
        const maxCol = Math.ceil((vx + vw + HEX_WIDTH) / HEX_WIDTH);
        const minRow = Math.floor((vy - HEX_HEIGHT) / (HEX_HEIGHT * 0.75));
        const maxRow = Math.ceil((vy + vh + HEX_HEIGHT) / (HEX_HEIGHT * 0.75));

        return {
            currentViewBox: `${vx} ${vy} ${vw} ${vh}`,
            visibleBounds: { minCol, maxCol, minRow, maxRow }
        };
    }, [minX, minY, maxX, maxY, HEX_WIDTH, HEX_HEIGHT, pan, zoom]);

    const [showSortieMenu, setShowSortieMenu] = useState(false);
    const [showRenameInput, setShowRenameInput] = useState(false);
    const [renamePlanetName, setRenamePlanetName] = useState('');
    const [sortieTargetInput, setSortieTargetInput] = useState('');
    const [sortieInts, setSortieInts] = useState(0);
    const [sortieBombers, setSortieBombers] = useState(0);
    const [sortieLoading, setSortieLoading] = useState(false);

    const filteredTargets = useMemo(() => {
        if (!sortieTargetInput || sortieTargetInput.length < 2) return [];
        return planets.filter(p => p.name.toLowerCase().includes(sortieTargetInput.toLowerCase())).slice(0, 5);
    }, [planets, sortieTargetInput]);

    const handleLaunchSortie = async (parentPlanetId: string) => {
        if (!sortieTargetInput) return;
        setSortieLoading(true);
        try {
            const targetPlanet = planets.find(p => p.name.toLowerCase() === sortieTargetInput.toLowerCase());
            const targetId = targetPlanet ? targetPlanet.id : sortieTargetInput;

            await dispatchOrder({
                actionId: 'AIR_LAUNCH_SORTIE',
                factionId: playerFactionId || 'PLAYER_FACTION',
                payload: {
                    parentBaseId: parentPlanetId,
                    targetId,
                    missionType: 'strike_planet',
                    numInterceptors: sortieInts,
                    numBombers: sortieBombers
                },
                label: 'Air sortie launch',
            });
            setShowSortieMenu(false);
            setSortieInts(0);
            setSortieBombers(0);
            setSortieTargetInput('');
        } catch (e) { console.error(e); } finally { setSortieLoading(false); }
    };

    const handleRenamePlanet = async (planetId: string) => {
        if (!renamePlanetName) return;
        try {
            await dispatchOrder({
                actionId: 'RENAME_PLANET',
                factionId: playerFactionId || 'PLAYER_FACTION',
                payload: { planetId, newName: renamePlanetName },
                label: `Renaming planet to ${renamePlanetName}`,
            });
            setShowRenameInput(false);
            setRenamePlanetName('');
        } catch (e) { console.error(e); }
    };

    const handleWheel = (e: React.WheelEvent) => {
        const scaleBy = 1.1;
        const oldZoom = zoom;
        let newZoom = e.deltaY < 0 ? oldZoom * scaleBy : oldZoom / scaleBy;
        newZoom = Math.min(Math.max(newZoom, 0.5), 5);
        setZoom(newZoom);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const scale = 2.0 / zoom;
        setPan(prev => ({ x: prev.x - dx * scale, y: prev.y - dy * scale }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => setIsDragging(false);

    const hexCells = useMemo(() => {
        const cells = [];
        const { minCol, maxCol, minRow, maxRow } = visibleBounds;

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;

                const center = grid.hexToPixel(c, r, HEX_SIZE);
                const planet = processedPlanets.get(`${c},${r}`);
                const army = processedArmies.get(`${c},${r}`);
                const isSelected = selectedHex?.x === c && selectedHex?.y === r;

                cells.push(
                    <HexCell 
                        key={`${c},${r}`}
                        c={c} r={r} size={HEX_SIZE}
                        center={center} corners={corners}
                        planet={planet} army={army}
                        isSelected={isSelected} isDragging={isDragging}
                        playerFactionId={playerFactionId}
                        factions={factions}
                        diplomacyState={diplomacyState}
                        onHexClick={onHexClick}
                    />
                );
            }
        }
        return cells;
    }, [visibleBounds.minCol, visibleBounds.maxCol, visibleBounds.minRow, visibleBounds.maxRow, ROWS, COLS, grid, HEX_SIZE, processedPlanets, processedArmies, selectedHex, isDragging, playerFactionId, factions, diplomacyState, onHexClick, corners]);

    const selectedPlanet = useMemo(() => {
        if (!selectedHex) return null;
        return processedPlanets.get(`${selectedHex.x},${selectedHex.y}`);
    }, [selectedHex, processedPlanets]);

    const hyperlanes = useMemo(() => {
        return (
            <g opacity="0.4">
                {planets.map(p => p.hyperlaneTo?.map((dest: any, idx: number) => {
                    if (dest.x === undefined || dest.y === undefined) return null;
                    const start = grid.hexToPixel(p.x, p.y, HEX_SIZE);
                    const end = grid.hexToPixel(dest.x, dest.y, HEX_SIZE);
                    return (
                        <line 
                            key={`lane-${p.id}-${idx}`} 
                            x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                            stroke="var(--color-neon-cyan)" strokeWidth="1.5" strokeDasharray="4,8"
                            className="hyperlane-anim"
                        />
                    );
                }))}
            </g>
        );
    }, [planets, grid, HEX_SIZE]);

    return (
        <div
            className={`w-full h-screen bg-black overflow-hidden select-none relative nebula-bg ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={handleWheel}
        >
            <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03] overflow-hidden">
                <div className="w-full h-[200%] bg-[linear-gradient(to_bottom,transparent_50%,#fff_50%)] bg-[length:100%_4px] animate-[scanline_10s_linear_infinite]" />
            </div>

            <svg viewBox={currentViewBox} className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {hyperlanes}

                {hexCells}
            </svg>

            {selectedPlanet && (
                <div className="absolute bottom-10 left-10 w-96 glass-panel p-8 rounded-2xl shadow-2xl animate-in slide-in-from-left-10 duration-500 text-white pointer-events-auto border-l-4 border-l-sky-500">
                    <div className="flex justify-between items-start mb-6 group">
                        <div>
                            <span className="text-[10px] font-mono text-sky-500/60 uppercase tracking-[0.3em] block mb-1">Sector Core Identified</span>
                            {showRenameInput ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <input 
                                        type="text" 
                                        value={renamePlanetName} 
                                        onChange={(e) => setRenamePlanetName(e.target.value)} 
                                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRenamePlanet(selectedPlanet.id);
                                            else if (e.key === 'Escape') setShowRenameInput(false);
                                        }}
                                        autoFocus
                                    />
                                    <button onClick={() => handleRenamePlanet(selectedPlanet.id)} className="text-xs text-sky-400 hover:text-sky-300">Save</button>
                                </div>
                            ) : (
                                <h2 className="text-3xl font-display uppercase tracking-widest text-white flex items-center gap-2">
                                    {selectedPlanet.name}
                                    <button onClick={() => { setShowRenameInput(true); setRenamePlanetName(selectedPlanet.name); }} className="text-slate-600 hover:text-slate-300 transition-colors">
                                        <Activity size={14} />
                                    </button>
                                </h2>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                            <span className="text-slate-400 font-display text-[10px] uppercase tracking-widest">Administrative Region</span>
                            <span className="font-mono text-xs uppercase text-slate-200">
                                {selectedPlanet._parsedAttrs.region_id?.replace(/_/g, ' ') || 'Frontier Space'}
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 py-2">
                            <div className="text-center">
                                <div className="text-[8px] text-slate-500 uppercase mb-1">Defense</div>
                                <div className="text-sm font-mono text-green-400">{selectedPlanet._parsedAttrs.defense_modifier || '1.0'}x</div>
                            </div>
                            <div className="text-center border-x border-white/5">
                                <div className="text-[8px] text-slate-500 uppercase mb-1">Hazards</div>
                                <div className="text-sm font-mono text-red-400">{(selectedPlanet._parsedAttrs.hazard_level || 0) * 100}%</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[8px] text-slate-500 uppercase mb-1">Trade Flux</div>
                                <div className="text-sm font-mono text-amber-400">{selectedPlanet._parsedAttrs.trade_value || '1.0'}</div>
                            </div>
                        </div>

                        {selectedPlanet.unrest !== undefined && (
                            <div className="space-y-2 mt-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[8px] text-slate-500 uppercase tracking-widest">Internal Stability</span>
                                    <span className={`text-[10px] font-mono ${selectedPlanet.unrest > 80 ? 'text-red-400' : 'text-green-400'}`}>
                                        {100 - selectedPlanet.unrest}%
                                    </span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${selectedPlanet.unrest > 80 ? 'bg-red-500' : 'bg-sky-500'}`}
                                        style={{ width: `${100 - selectedPlanet.unrest}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {selectedPlanet.siege && (
                            <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                                <div className="flex justify-between items-end">
                                    <span className="text-[9px] text-slate-400">Occupation Status</span>
                                    <span className="text-lg font-mono text-red-500">{selectedPlanet.siege.occupationProgress}%</span>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 mt-6 border-t border-white/10">
                            <button
                                onClick={() => setShowSortieMenu(!showSortieMenu)}
                                className="w-full py-2 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-lg text-xs font-display uppercase tracking-widest text-indigo-300 transition-colors"
                            >
                                {showSortieMenu ? 'Cancel Operation' : 'Launch Air Sortie'}
                            </button>

                            {showSortieMenu && (
                                <div className="mt-4 p-4 bg-black/40 rounded-lg border border-white/5 space-y-4 relative">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-display uppercase tracking-widest block mb-2">Target Sector / System</label>
                                        <input
                                            type="text"
                                            value={sortieTargetInput}
                                            onChange={(e) => setSortieTargetInput(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                                        />
                                        {filteredTargets.length > 0 && (
                                            <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl overflow-hidden max-h-40">
                                                {filteredTargets.map(t => (
                                                    <div 
                                                        key={t.id} 
                                                        className="px-3 py-2 text-xs text-slate-300 hover:bg-indigo-500 hover:text-white cursor-pointer"
                                                        onClick={() => setSortieTargetInput(t.name)}
                                                    >
                                                        {t.name} <span className="text-slate-500 ml-2">({t.x}:{t.y})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleLaunchSortie(selectedPlanet.id)}
                                        disabled={sortieLoading || !sortieTargetInput || (sortieInts === 0 && sortieBombers === 0)}
                                        className="w-full py-2 mt-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:bg-slate-700 rounded text-xs font-display uppercase font-bold text-white tracking-widest"
                                    >
                                        {sortieLoading ? 'Transmitting Auth...' : 'Execute Strike Order'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="absolute top-10 right-10 glass-panel p-6 rounded-2xl w-64 animate-in slide-in-from-right-10 duration-700 pointer-events-none">
                <h3 className="text-[10px] font-display text-sky-500 uppercase tracking-[0.3em] mb-4 border-b border-white/5 pb-2">Cartographic Legend</h3>
                <div className="space-y-4 text-[10px] text-slate-300 uppercase">
                    <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-red-500" /> Strategic Throat</div>
                    <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-sky-500" /> Trade Canal</div>
                    <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-amber-500" /> Resource Spine</div>
                </div>
            </div>
        </div>
    );
}
