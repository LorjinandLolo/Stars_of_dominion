"use client";

import React, { useMemo, useState, useRef } from 'react';
import { HexGrid } from '@/lib/hex-grid';
import { getSectorType } from '@/lib/game-rules';
import { useUIStore } from '@/lib/store/ui-store';

interface GalaxyMapProps {
    planets: any[];
    factions: any[];
    armies?: any[];
    onHexClick?: (x: number, y: number) => void;
    selectedHex?: { x: number, y: number } | null;
}

export default function GalaxyMap({ planets, factions, armies, onHexClick, selectedHex }: GalaxyMapProps) {
    const { playerFactionId, diplomacyState } = useUIStore();
    // Configuration - Dynamic based on map content
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

    // Zoom State
    const [zoom, setZoom] = useState(1);
    const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 0, h: 0 });

    // Panning State
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Initialize ViewBox once planets are loaded
    React.useEffect(() => {
        const padding = 3;
        const x = (minX - padding) * HEX_WIDTH;
        const y = (minY - padding) * 0.75 * HEX_HEIGHT;
        const w = (maxX - minX + padding * 2) * HEX_WIDTH;
        const h = (maxY - minY + padding * 2) * 0.75 * HEX_HEIGHT;
        setViewBox({ x, y, w, h });
    }, [minX, minY, maxX, maxY, HEX_WIDTH, HEX_HEIGHT]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleBy = 1.1;
        const oldZoom = zoom;
        let newZoom = e.deltaY < 0 ? oldZoom * scaleBy : oldZoom / scaleBy;
        newZoom = Math.min(Math.max(newZoom, 0.5), 5); // Limit zoom

        // Calculate focus point relative to SVG
        // This is tricky without exact specialized logic, so we'll zoom to center of current view for simplicity first
        // Or strict center zoom:
        const zoomFactor = oldZoom / newZoom;

        setZoom(newZoom);

        // Adjust Pan to keep center? 
        // For now, let's keep it simple: Zoom creates a multiplier on the ViewBox W/H
        // But viewBox x/y is 'pan'.
    };

    // Better Zoom Interaction:
    // We actually just modify the 'scale' transform or the width/height of viewBox.
    // Let's use a "camera" approach: { x, y, zoom }
    // ViewBox = (x) (y) (w/zoom) (h/zoom)

    const currentViewBox = useMemo(() => {
        const padding = 3;
        const baseW = (maxX - minX + padding * 2) * HEX_WIDTH;
        const baseH = (maxY - minY + padding * 2) * 0.75 * HEX_HEIGHT;
        const baseX = (minX - padding) * HEX_WIDTH;
        const baseY = (minY - padding) * 0.75 * HEX_HEIGHT;

        // Apply Pan
        const vx = baseX + pan.x;
        const vy = baseY + pan.y;

        // Apply Zoom (Centered on current view center)
        const vw = baseW / zoom;
        const vh = baseH / zoom;

        // Adjust x/y to center the zoom
        const cx = vx + baseW / 2; // Center of unzoomed
        const cy = vy + baseH / 2;

        // We want the center to stay formatted
        // This is getting complex with bare SVG viewBox. 
        // Standard game map approach: 
        // ViewBox is fixed to screen size? No, viewBox defines the window into world.

        return `${vx + (baseW - vw) / 2} ${vy + (baseH - vh) / 2} ${vw} ${vh}`;
    }, [minX, minY, maxX, maxY, HEX_WIDTH, HEX_HEIGHT, pan, zoom]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const scale = 2.0 / zoom; // Adjust sensitivity by zoom
        setPan(prev => ({ x: prev.x - dx * scale, y: prev.y - dy * scale }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    // Helper to get ownership relationship color
    const getOwnershipColor = (ownerId: string | null) => {
        if (!ownerId) return 'var(--color-owner-neutral)';
        if (ownerId === playerFactionId) return 'var(--color-owner-player)';
        
        // Check treaties for alliance/non-aggression/cooperation (Ally)
        const isAlly = diplomacyState.treaties.some(t => 
            t.status === 'active' && 
            t.signatories.includes(ownerId) && 
            t.signatories.includes(playerFactionId!) &&
            (t.type === 'mutual_defense' || t.type === 'non_aggression' || t.type === 'research_share' || t.type === 'intelligence_pact')
        );
        if (isAlly) return 'var(--color-owner-ally)';

        // Check rivalries (Enemy)
        const isEnemy = diplomacyState.rivalries.some(r => 
            (r.empireAId === ownerId && r.empireBId === playerFactionId) ||
            (r.empireBId === ownerId && r.empireAId === playerFactionId)
        );
        if (isEnemy) return 'var(--color-owner-enemy)';

        return 'var(--color-owner-neutral)';
    };

    const getFactionColor = (factionId: string) => {
        const faction = factions.find(f => f.$id === factionId);
        if (!faction) return '#d946ef';
        // Fallback to relationship color if we want consistency, or keep individual colors for background?
        // Let's use relationship color for the planet dot.
        return getOwnershipColor(factionId);
    };

    // Generate all hexes
    const hexes = useMemo(() => {
        const _hexes = [];
        const planetMap = new Map();
        if (planets) planets.forEach(p => planetMap.set(`${p.x},${p.y}`, p));

        const armyMap = new Map();
        if (armies) armies.forEach(a => armyMap.set(`${a.x},${a.y}`, a));

        // Iterate only over the relevant bounds (with some buffer for render)
        for (let r = minY - 5; r <= maxY + 5; r++) {
            for (let c = minX - 5; c <= maxX + 5; c++) {
                if (r < 0 || c < 0) continue;

                const center = grid.hexToPixel(c, r, HEX_SIZE);

                const planet = planetMap.get(`${c},${r}`);
                const army = armyMap.get(`${c},${r}`);
                const terrain = getSectorType(c, r);

                let fill = '#0a0a0a';
                let stroke = '#262626';

                if (terrain === 'asteroid_field') {
                    fill = '#18181b';
                    stroke = '#27272a';
                } else if (terrain === 'nebula') {
                    fill = '#172554';
                }

                if (planet && planet.attributes) {
                    let attrs = planet.attributes;
                    if (typeof attrs === 'string') {
                        try { attrs = JSON.parse(attrs); } catch (e) { }
                    }
                    if (attrs.archetype_tag) {
                        switch (attrs.archetype_tag) {
                            case 'throat': fill = '#7f1d1d'; stroke = '#ef4444'; break;
                            case 'canal': fill = '#0891b2'; stroke = '#22d3ee'; break;
                            case 'spine': fill = '#CA8A04'; stroke = '#EAB308'; break; // Yellow/Gold
                            case 'fortress': fill = '#3f6212'; stroke = '#84cc16'; break; // Green
                            case 'void': fill = '#450a0a'; stroke = '#000000'; break; // Dark Red/Black
                            case 'basin': fill = '#1e1b4b'; stroke = '#6366f1'; break; // Indigo
                        }
                    }
                }

                // Selection Highlight
                if (selectedHex && selectedHex.x === c && selectedHex.y === r) {
                    stroke = '#22c55e'; // Green highlight
                }

                _hexes.push(
                    <g key={`${c},${r}`} transform={`translate(${center.x}, ${center.y})`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isDragging) onHexClick?.(c, r);
                        }}
                        style={{ cursor: 'pointer' }}
                    >
                        <polygon
                            points={grid.getHexCorners(HEX_SIZE).map(p => `${p.x},${p.y}`).join(' ')}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth="1"
                            className="transition-colors duration-200 hover:fill-zinc-800"
                        />

                        {/* Render Hyperlanes if any */}
                        {planet?.hyperlaneTo?.map((dest: any, idx: number) => {
                            if (dest.x === undefined || dest.y === undefined) return null;
                            const destPix = grid.hexToPixel(dest.x, dest.y, HEX_SIZE);
                            const dx = destPix.x - center.x;
                            const dy = destPix.y - center.y;
                            return (
                                <line key={`lane-${idx}`} x1={0} y1={0} x2={dx} y2={dy}
                                    stroke="#06b6d4" strokeWidth="2" strokeDasharray="5,5" opacity="0.6" />
                            );
                        })}

                        {planet && (
                            <circle r={HEX_SIZE * 0.4} fill={planet.ownerId ? getFactionColor(planet.ownerId) : '#52525b'} />
                        )}

                        {/* Phase 13: Ground Siege Map Overlay Indicator */}
                        {planet?.siege && (
                            <text x={0} y={4} textAnchor="middle" fill="#ef4444" fontSize="14" fontWeight="bold" fontFamily="monospace">
                                ⚔
                            </text>
                        )}

                        {planet?.unrest > 80 && !planet?.siege && (
                            <text x={0} y={4} textAnchor="middle" fill="#f59e0b" fontSize="16" fontWeight="bold" fontFamily="monospace">
                                !
                            </text>
                        )}

                        {army && (
                            <rect x={-5} y={-5} width={10} height={10} fill="#ef4444" transform="rotate(45)" />
                        )}
                    </g>
                );
            }
        }
        return _hexes;
    }, [planets, armies, selectedHex, minX, minY, maxX, maxY, ROWS, COLS, isDragging, grid, factions]);
    // Get Selected Planet Data
    const selectedPlanet = useMemo(() => {
        if (!selectedHex) return null;
        return planets.find(p => p.x === selectedHex.x && p.y === selectedHex.y);
    }, [selectedHex, planets]);

    return (
        <div
            className={`w-full h-screen bg-black overflow-hidden select-none relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
        >
            <svg
                viewBox={currentViewBox}
                className="w-full h-full"
                preserveAspectRatio="xMidYMid slice"
            >
                {hexes}
            </svg>

            {/* Info Panel Overlay */}
            {selectedPlanet && (
                <div className="absolute bottom-6 left-6 w-80 bg-zinc-900/90 border border-zinc-700 p-6 rounded-lg shadow-2xl backdrop-blur-md text-white pointer-events-auto">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-2xl font-bold text-sky-400">{selectedPlanet.name}</h2>
                        <span className="text-xs font-mono text-zinc-500">[{selectedPlanet.x}, {selectedPlanet.y}]</span>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between border-b border-zinc-700 pb-2">
                            <span className="text-zinc-400">Region</span>
                            <span className="font-semibold capitalize">{JSON.parse(selectedPlanet.attributes).region_id?.replace('_', ' ') || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-700 pb-2">
                            <span className="text-zinc-400">Arch. Tag</span>
                            <span className="font-mono text-yellow-500">{JSON.parse(selectedPlanet.attributes).archetype_tag || 'Standard'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="bg-zinc-800 p-2 rounded text-center">
                                <div className="text-xs text-zinc-500 uppercase">Defense</div>
                                <div className="text-lg font-bold text-green-400">{JSON.parse(selectedPlanet.attributes).defense_modifier || '1.0'}x</div>
                            </div>
                            <div className="bg-zinc-800 p-2 rounded text-center">
                                <div className="text-xs text-zinc-500 uppercase">Hazard</div>
                                <div className="text-lg font-bold text-red-400">{(JSON.parse(selectedPlanet.attributes).hazard_level || 0) * 100}%</div>
                            </div>
                        </div>
                        <div className="bg-zinc-800 p-2 rounded text-center mt-2">
                            <div className="text-xs text-zinc-500 uppercase">Trade Value</div>
                            <div className="text-lg font-bold text-yellow-400">{JSON.parse(selectedPlanet.attributes).trade_value || '1.0'}</div>
                        </div>
                    </div>

                    {/* Phase 13: Unrest and Siege Indicators */}
                    {selectedPlanet.unrest !== undefined && (
                        <div className="bg-zinc-800 border border-zinc-700 p-3 rounded mt-2">
                            <div className="flex justify-between items-center mb-1">
                                <div className="text-xs text-zinc-400 uppercase">Planetary Unrest</div>
                                <div className={`text-sm font-bold ${selectedPlanet.unrest > 80 ? 'text-red-500' : selectedPlanet.unrest > 50 ? 'text-yellow-500' : 'text-green-500'}`}>
                                    {selectedPlanet.unrest}%
                                </div>
                            </div>
                            <div className="w-full bg-black h-2 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${selectedPlanet.unrest > 80 ? 'bg-red-500' : selectedPlanet.unrest > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                    style={{ width: `${selectedPlanet.unrest}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {selectedPlanet.siege && (
                        <div className="border border-red-900 bg-red-950/30 p-3 rounded mt-2 animate-pulse">
                            <div className="text-red-500 font-bold uppercase text-xs mb-1 flex items-center justify-between">
                                <span>Active Siege</span>
                                <span>{selectedPlanet.siege.occupationProgress}% Occupied</span>
                            </div>
                            <div className="flex justify-between text-xs text-zinc-300">
                                <span>Attacker: {selectedPlanet.siege.aggressorEmpireId.slice(0, 10)}</span>
                                <span className="text-red-400">{selectedPlanet.siege.invadingTroops} Troops</span>
                            </div>
                        </div>
                    )}

                </div>
            )}

            <div className="absolute top-4 right-4 bg-zinc-900/80 p-4 rounded text-white text-sm pointer-events-none border border-zinc-700/50 backdrop-blur-sm">
                <h3 className="font-bold mb-2 text-sky-400">Map Legend</h3>
                <div className="space-y-4">
                    <div>
                        <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Terrain / Regions</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 bg-red-900 border border-red-500"></div> Throats / Chokepoints</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 bg-cyan-600 border border-cyan-400"></div> Wormhole Canals</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 bg-yellow-600 border border-yellow-500"></div> Trade Spines</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 bg-green-900 border border-green-500"></div> Fortress Gates</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-950 border border-indigo-500"></div> Central Basin</div>
                    </div>
                    
                    <div className="border-t border-zinc-800 pt-3">
                        <div className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Ownership</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-[#10b981]"></div> Your Territory</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div> Allied / Pacts</div>
                        <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-[#ef4444]"></div> Rivals / Enemies</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#facc15]"></div> Neutral / Unknown</div>
                    </div>
                </div>
                <div className="mt-4 text-[10px] text-zinc-500 border-t border-zinc-800 pt-2 italic">
                    Scroll to Zoom • Drag to Pan • Click to Select
                </div>
            </div>
        </div>
    );
}
