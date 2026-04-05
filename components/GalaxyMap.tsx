"use client";

import React, { useMemo, useState, useRef } from 'react';
import { HexGrid } from '@/lib/hex-grid';
import { getSectorType } from '@/lib/game-rules';
import { useUIStore } from '@/lib/store/ui-store';
import { Activity } from 'lucide-react';

interface GalaxyMapProps {
    planets: any[];
    factions: any[];
    armies?: any[];
    onHexClick?: (x: number, y: number) => void;
    selectedHex?: { x: number, y: number } | null;
}

export default function GalaxyMap({ planets, factions, armies, onHexClick, selectedHex }: GalaxyMapProps) {
    const { playerFactionId, diplomacyState, focusTarget, setFocusTarget } = useUIStore();
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

    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const [viewBoxVisible, setViewBoxVisible] = useState({ x: 0, y: 0, w: 0, h: 0 });

    // ─── CAMERA LOGIC ─────────────────────────────────────────────────────────

    // Initial Focus on Capital
    React.useEffect(() => {
        if (!playerFactionId || !factions?.length || !planets?.length) return;
        
        const faction = factions.find(f => f.$id === playerFactionId || f.id === playerFactionId);
        if (faction && faction.capitalSystemId) {
            const capitalPlanet = planets.find(p => p.systemId === faction.capitalSystemId || p.id === `planet-${faction.capitalSystemId}`);
            if (capitalPlanet) {
                setFocusTarget({ x: capitalPlanet.x, y: capitalPlanet.y, zoom: 1.5 });
            }
        }
    }, [playerFactionId, factions, planets?.length]);

    // Handle focusTarget changes
    React.useEffect(() => {
        if (!focusTarget) return;

        const { x, y, zoom: targetZoom } = focusTarget;
        
        // Convert hex (x, y) to pixel
        const targetPix = grid.hexToPixel(x, y, HEX_SIZE);
        
        // Calculate base center (similar to currentViewBox logic)
        const padding = 3;
        const baseX = (minX - padding) * HEX_WIDTH;
        const baseY = (minY - padding) * 0.75 * HEX_HEIGHT;
        const baseW = (maxX - minX + padding * 2) * HEX_WIDTH;
        const baseH = (maxY - minY + padding * 2) * 0.75 * HEX_HEIGHT;

        // We want targetPix to be at the center of the viewport
        // ViewBox = (baseX + pan.x) (baseY + pan.y) (baseW/zoom) (baseH/zoom)
        // Center of ViewBox = (baseX + pan.x + baseW/2zoom) , (baseY + pan.y + baseH/2zoom)
        // Set Center = targetPix
        
        if (targetZoom) setZoom(targetZoom);

        const currentW = baseW / (targetZoom || zoom);
        const currentH = baseH / (targetZoom || zoom);

        setPan({
            x: targetPix.x - baseX - currentW / 2,
            y: targetPix.y - baseY - currentH / 2
        });

        // Clear target after focusing
        setFocusTarget(null);
    }, [focusTarget, minX, minY, maxX, maxY, HEX_WIDTH, HEX_HEIGHT, zoom, grid]);


    // Air Sorties & UI State
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
            // Find target ID from exact match or string
            const targetPlanet = planets.find(p => p.name.toLowerCase() === sortieTargetInput.toLowerCase());
            const targetId = targetPlanet ? targetPlanet.id : sortieTargetInput;

            await fetch('/api/game/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actionId: 'AIR_LAUNCH_SORTIE',
                    factionId: playerFactionId,
                    payload: {
                        parentBaseId: parentPlanetId,
                        targetId,
                        missionType: 'strike_planet', // Hardcoded for now
                        numInterceptors: sortieInts,
                        numBombers: sortieBombers
                    }
                })
            });
            setShowSortieMenu(false);
            setSortieInts(0);
            setSortieBombers(0);
            setSortieTargetInput('');
        } catch (e) {
            console.error(e);
        } finally {
            setSortieLoading(false);
        }
    };

    const handleRenamePlanet = async (planetId: string) => {
        if (!renamePlanetName) return;
        try {
            await fetch('/api/game/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actionId: 'RENAME_PLANET',
                    factionId: playerFactionId,
                    payload: {
                        planetId,
                        newName: renamePlanetName
                    }
                })
            });
            setShowRenameInput(false);
            setRenamePlanetName('');
            // Optimistic update could happen here if we mutated local UI state
        } catch (e) {
            console.error(e);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        const scaleBy = 1.1;
        const oldZoom = zoom;
        let newZoom = e.deltaY < 0 ? oldZoom * scaleBy : oldZoom / scaleBy;
        newZoom = Math.min(Math.max(newZoom, 0.5), 5); // Limit zoom
        setZoom(newZoom);
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

                const asteroids = [];
                if (terrain === 'asteroid_field') {
                    fill = '#18181b';
                    stroke = '#27272a';
                    // deterministic asteroids based on coords
                    const seed = (c * 31 + r * 17);
                    const count = (seed % 4) + 3; // 3 to 6 asteroids
                    for (let i = 0; i < count; i++) {
                        const ax = ((seed * (i + 1) * 7) % (HEX_SIZE * 1.2)) - HEX_SIZE * 0.6;
                        const ay = ((seed * (i + 2) * 11) % (HEX_SIZE * 1.2)) - HEX_SIZE * 0.6;
                        const ar = ((seed * (i + 3)) % 3) + 1.5;
                        asteroids.push(<circle key={`ast-${i}`} cx={ax} cy={ay} r={ar} fill="#3f3f46" opacity="0.8" />);
                    }
                } else if (terrain === 'nebula') {
                    fill = '#172554';
                } else if (terrain === 'ion_storm') {
                    fill = '#082f49';
                    stroke = '#0284c7';
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

                // Moon generation
                let moon = null;
                if (planet) {
                    const hasMoon = (c * 13 + r * 7) % 10 > 6; // ~30% chance for a moon
                    if (hasMoon) {
                        moon = <circle cx={HEX_SIZE * 0.55} cy={-HEX_SIZE * 0.55} r={HEX_SIZE * 0.15} fill="#a1a1aa" opacity="0.9" />;
                    }
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

                        {/* Terrain Features */}
                        {terrain === 'nebula' && (
                            <circle cx={0} cy={0} r={HEX_SIZE * 0.8} fill="#3b82f6" opacity="0.15" filter="url(#glow)" />
                        )}
                        {terrain === 'ion_storm' && (
                            <>
                                <path d={`M -5,-10 L 5,0 L -2,3 L 8,12`} stroke="#38bdf8" strokeWidth="1.5" fill="none" opacity="0.6" filter="url(#glow)" />
                                <circle cx={0} cy={0} r={HEX_SIZE * 0.6} fill="#0ea5e9" opacity="0.1" filter="url(#glow)" />
                            </>
                        )}
                        {asteroids}

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

                        {moon}

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
            className={`w-full h-screen bg-black overflow-hidden select-none relative nebula-bg ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
        >
            {/* Scanline Overlay */}
            <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03] overflow-hidden">
                <div className="w-full h-[200%] bg-[linear-gradient(to_bottom,transparent_50%,#fff_50%)] bg-[length:100%_4px] animate-[scanline_10s_linear_infinite]" />
            </div>

            <svg
                viewBox={currentViewBox}
                className="w-full h-full"
                preserveAspectRatio="xMidYMid slice"
            >
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="planet-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0.8  0 0 0 0 1  0 0 0 1 0" />
                        <feMerge>
                            <feMergeNode />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Hyperlanes Layer (Rendered below hexes for depth) */}
                <g opacity="0.4">
                    {planets.map(p => p.hyperlaneTo?.map((dest: any, idx: number) => {
                        if (dest.x === undefined || dest.y === undefined) return null;
                        const start = grid.hexToPixel(p.x, p.y, HEX_SIZE);
                        const end = grid.hexToPixel(dest.x, dest.y, HEX_SIZE);
                        return (
                            <line 
                                key={`lane-bg-${p.id}-${idx}`} 
                                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                                stroke="var(--color-neon-cyan)" 
                                strokeWidth="1.5" 
                                strokeDasharray="4,8"
                                className="hyperlane-anim"
                            />
                        );
                    }))}
                </g>

                {hexes.map((hex: any) => (
                    <g key={hex.key} filter={hex.props.children[0].props.fill !== '#0a0a0a' ? 'url(#glow)' : undefined}>
                        {hex}
                    </g>
                ))}
            </svg>

            {/* Info Panel Overlay */}
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
                                        placeholder={selectedPlanet.name}
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
                                    <button onClick={() => { setShowRenameInput(true); setRenamePlanetName(selectedPlanet.name); }} className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100">
                                        <Activity size={14} />
                                    </button>
                                </h2>
                            )}
                        </div>
                        <div className="px-2 py-1 bg-sky-500/10 border border-sky-500/20 rounded text-[9px] font-mono text-sky-400">
                            {selectedPlanet.x}:{selectedPlanet.y}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
                            <span className="text-slate-400 font-display text-[10px] uppercase tracking-widest">Administrative Region</span>
                            <span className="font-mono text-xs uppercase text-slate-200">
                                {JSON.parse(selectedPlanet.attributes).region_id?.replace(/_/g, ' ') || 'Frontier Space'}
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 py-2">
                            <div className="text-center">
                                <div className="text-[8px] text-slate-500 uppercase mb-1">Defense</div>
                                <div className="text-sm font-mono text-green-400">{JSON.parse(selectedPlanet.attributes).defense_modifier || '1.0'}x</div>
                            </div>
                            <div className="text-center border-x border-white/5">
                                <div className="text-[8px] text-slate-500 uppercase mb-1">Hazards</div>
                                <div className="text-sm font-mono text-red-400">{(JSON.parse(selectedPlanet.attributes).hazard_level || 0) * 100}%</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[8px] text-slate-500 uppercase mb-1">Trade Flux</div>
                                <div className="text-sm font-mono text-amber-400">{JSON.parse(selectedPlanet.attributes).trade_value || '1.0'}</div>
                            </div>
                        </div>

                        {/* Unrest Bar */}
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
                            <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-pulse">
                                <div className="flex items-center gap-2 text-red-400 mb-2">
                                    <Activity size={14} />
                                    <span className="text-[10px] font-display uppercase tracking-widest">Siege in Progress</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-[9px] text-slate-400">Occupation Status</span>
                                    <span className="text-lg font-mono text-red-500">{selectedPlanet.siege.occupationProgress}%</span>
                                </div>
                            </div>
                        )}

                        {/* Basic Services Dashboard */}
                        {selectedPlanet.services && Object.keys(selectedPlanet.services).length > 0 && (
                            <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2 block">Basic Services</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.values(selectedPlanet.services).map((svc: any) => {
                                        let dotColor = 'bg-slate-500';
                                        if (svc.status === 'adequate') dotColor = 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]';
                                        if (svc.status === 'strained') dotColor = 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
                                        if (svc.status === 'failing') dotColor = 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]';
                                        if (svc.status === 'collapsed') dotColor = 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse';

                                        return (
                                            <div key={svc.serviceId} className="flex flex-col bg-slate-900/60 border border-slate-800/80 rounded p-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                                        <span className="text-[9px] font-display uppercase tracking-wider text-slate-300">{svc.serviceId.replace('_', ' ')}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[8px] text-slate-500 uppercase">LVL {svc.level}</span>
                                                    <span className={`text-[9px] font-mono ${svc.coverageRatio >= 1 ? 'text-green-400' : 'text-amber-400'}`}>
                                                        {Math.floor(svc.coverageRatio * 100)}%
                                                    </span>
                                                </div>
                                                {svc.unpaidUpkeepTicks > 0 && (
                                                    <div className="text-[7px] text-red-400 mt-1 uppercase font-mono tracking-tighter">
                                                        Budget Deficit Detected ({svc.unpaidUpkeepTicks} cycles)
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Tactical Actions (Air Sorties) */}
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
                                            placeholder="Enter Hex/Name (e.g. rim-prime)"
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white"
                                        />
                                        {/* Autocomplete Dropdown */}
                                        {filteredTargets.length > 0 && (
                                            <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl overflow-hidden max-h-40">
                                                {filteredTargets.map(t => (
                                                    <div 
                                                        key={t.id} 
                                                        className="px-3 py-2 text-xs text-slate-300 hover:bg-indigo-500 hover:text-white cursor-pointer"
                                                        onClick={() => {
                                                            setSortieTargetInput(t.name);
                                                        }}
                                                    >
                                                        {t.name} <span className="text-slate-500 ml-2">({t.x}:{t.y})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[9px] text-slate-400 font-display uppercase tracking-widest block mb-2">Interceptors ({sortieInts})</label>
                                            <input 
                                                type="range" min="0" max="100" 
                                                value={sortieInts} 
                                                onChange={(e) => setSortieInts(parseInt(e.target.value))}
                                                className="w-full accent-indigo-500" 
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-slate-400 font-display uppercase tracking-widest block mb-2">Bombers ({sortieBombers})</label>
                                            <input 
                                                type="range" min="0" max="100" 
                                                value={sortieBombers} 
                                                onChange={(e) => setSortieBombers(parseInt(e.target.value))}
                                                className="w-full accent-red-500" 
                                            />
                                        </div>
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

            {/* Floating Legend */}
            <div className="absolute top-10 right-10 glass-panel p-6 rounded-2xl w-64 animate-in slide-in-from-right-10 duration-700 pointer-events-none">
                <h3 className="text-[10px] font-display text-sky-500 uppercase tracking-[0.3em] mb-4 border-b border-white/5 pb-2">Cartographic Legend</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-2">Sector Significance</div>
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--color-neon-red)] bg-red-500" />
                            <span className="text-[10px] text-slate-300 uppercase">Strategic Throat</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--color-neon-blue)] bg-sky-500" />
                            <span className="text-[10px] text-slate-300 uppercase">Trade Canal</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--color-neon-gold)] bg-amber-500" />
                            <span className="text-[10px] text-slate-300 uppercase">Resource Spine</span>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-white/5 space-y-2">
                        <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-2">Real-time Signals</div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 border border-dashed border-sky-400 animate-spin-slow" />
                            <span className="text-[10px] text-slate-300 uppercase">Hyperlane Pulse</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-red-500 text-xs animate-pulse">⚔</span>
                            <span className="text-[10px] text-slate-300 uppercase">Active Conflict</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
