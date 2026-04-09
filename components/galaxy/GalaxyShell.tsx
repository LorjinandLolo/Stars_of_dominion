"use client";

import React, { useMemo, useState, useRef } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import OverlayToggleBar from './OverlayToggleBar';
import SystemContextPanel from './SystemContextPanel';
import CrisisBottomTray from './CrisisBottomTray';
import { PlanetConstructionPanel } from '../construction/PlanetConstructionPanel';
import { Activity } from 'lucide-react';

const HEX_SIZE = 18;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

/** Convert axial hex coords to pixel center (pointy-top) */
function hexToPixel(q: number, r: number): { x: number; y: number } {
    return {
        x: HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
        y: HEX_SIZE * ((3 / 2) * r),
    };
}

function getHexCorners(size: number): string {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        pts.push(`${size * Math.cos(angle)},${size * Math.sin(angle)}`);
    }
    return pts.join(' ');
}

const HEX_POINTS = getHexCorners(HEX_SIZE - 1);

function SimulationTimer({ nowSeconds }: { nowSeconds: number }) {
    const tick = Math.floor(nowSeconds / 10);
    const progress = ((nowSeconds % 10) / 10) * 100;
    
    return (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 glass-panel px-6 py-2 rounded-full flex items-center gap-6 border-b-2 border-b-sky-500/50 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
            <div className="flex flex-col">
                <span className="text-[8px] text-sky-500/60 uppercase tracking-[0.2em] font-display">Authoritative Clock</span>
                <span className="text-sm font-mono text-white flex items-center gap-2">
                    <Activity size={12} className="text-sky-400 animate-pulse" />
                    TICK {tick}
                </span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="flex flex-col w-32">
                <div className="flex justify-between text-[8px] text-slate-500 uppercase mb-1 font-display">
                    <span>Next Update</span>
                    <span className="text-sky-400 font-mono">{10 - (nowSeconds % 10)}s</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-sky-500 transition-all duration-1000 ease-linear shadow-[0_0_8px_rgba(14,165,233,0.5)]" 
                        style={{ width: `${progress}%` }} 
                    />
                </div>
            </div>
        </div>
    );
}

/** Color for a system based on active overlay and system data */
function systemColor(
    activeOverlay: string | null,
    instability: number,
    tradeValue: number,
    escalationLevel: number,
    security: number,
): { fill: string; stroke: string } {
    switch (activeOverlay) {
        case 'tradeHeat': {
            const v = Math.round((tradeValue / 100) * 255);
            return { fill: `rgb(${v}, ${Math.round(v * 0.6)}, 0)`, stroke: '#92400e' };
        }
        case 'instability': {
            const v = Math.round((instability / 100) * 255);
            return { fill: `rgb(${v}, 0, 0)`, stroke: '#7f1d1d' };
        }
        case 'escalation': {
            const v = escalationLevel / 10;
            return {
                fill: `rgb(${Math.round(v * 249)}, ${Math.round((1 - v) * 115)}, 22)`,
                stroke: '#9a3412',
            };
        }
        case 'institutionalAlignment':
            return { fill: '#312e81', stroke: '#6366f1' };
        case 'regionalStability': {
            const stable = security > 60;
            return stable
                ? { fill: '#14532d', stroke: '#22c55e' }
                : { fill: '#451a03', stroke: '#92400e' };
        }
        case 'deepSpace':
            return { fill: '#1e293b', stroke: '#38bdf8' };
        default:
            return { fill: '#334155', stroke: '#94a3b8' };
    }
}

function getVisibilityStyles(
    revealStage: string | undefined,
    baseColors: { fill: string; stroke: string }
) {
    switch (revealStage) {
        case 'pinged':
            return { fill: '#0f172a', stroke: '#1e293b', opacity: 0.6, showDetails: false, showDot: true };
        case 'scanned':
        case 'surveyed':
            return { ...baseColors, opacity: 1, showDetails: true, showDot: true };
        case 'unknown':
        default:
            return { fill: '#020617', stroke: '#0f172a', opacity: 0.3, showDetails: false, showDot: false };
    }
}

export default function GalaxyShell() {
    const {
        systems,
        regions,
        activeOverlay,
        selectedSystemId,
        setSelectedSystem,
        fleets,
        selectedPlanetId,
        setSelectedPlanet,
        playerState,
        nowSeconds,
        factionVisibility,
        factions,
        contestedSystemIds,
    } = useUIStore();

    const { minQ, maxQ, minR, maxR } = useMemo(() => {
        if (!systems.length) return { minQ: -30, maxQ: 30, minR: -25, maxR: 25 };
        return {
            minQ: Math.min(...systems.map((s: any) => s.q)),
            maxQ: Math.max(...systems.map((s: any) => s.q)),
            minR: Math.min(...systems.map((s: any) => s.r)),
            maxR: Math.max(...systems.map((s: any) => s.r)),
        };
    }, [systems]);

    const pad = 4;
    const svgMinX = hexToPixel(minQ - pad, minR - pad).x;
    const svgMinY = hexToPixel(minQ - pad, minR - pad).y;
    const svgMaxX = hexToPixel(maxQ + pad, maxR + pad).x;
    const svgMaxY = hexToPixel(maxQ + pad, maxR + pad).y;

    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [dragging, setDragging] = useState(false);
    const hasMoved = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    const { focusTarget, setFocusTarget } = useUIStore();

    // Respond to focus target changes from external components (ResourceBar, GameShell)
    useEffect(() => {
        if (focusTarget) {
            const px = hexToPixel(focusTarget.x, focusTarget.y);
            // Center is (0,0) of the map space, so we pan to negative of target pixel
            // minus the offset of the bounding box centers if necessary. 
            // The dynamicVb uses svgMinX/Y as base.
            setPan({ 
                x: px.x - (svgMinX + (svgMaxX - svgMinX) / 2), 
                y: px.y - (svgMinY + (svgMaxY - svgMinY) / 2) 
            });
            if (focusTarget.zoom) setZoom(focusTarget.zoom);
            
            // Clear target after consuming to allow re-triggering same target
            setFocusTarget(null);
        }
    }, [focusTarget, setFocusTarget, svgMinX, svgMaxX, svgMinY, svgMaxY]);

    const dynamicVb = useMemo(() => {
        const w = (svgMaxX - svgMinX) / zoom;
        const h = (svgMaxY - svgMinY) / zoom;
        const cx = svgMinX + (svgMaxX - svgMinX) / 2 + pan.x;
        const cy = svgMinY + (svgMaxY - svgMinY) / 2 + pan.y;
        return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
    }, [pan, zoom, svgMinX, svgMaxX, svgMinY, svgMaxY]);

    const handleWheel = (e: React.WheelEvent) => {
        setZoom((z) => Math.min(8, Math.max(0.4, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    const handleMouseDown = (e: React.MouseEvent) => {
        setDragging(true);
        hasMoved.current = false;
        lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        const dx = (e.clientX - lastMouse.current.x) * (2 / zoom);
        const dy = (e.clientY - lastMouse.current.y) * (2 / zoom);
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) hasMoved.current = true;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const playerFaction = factions[playerState.factionId || ''];
    const reserves = playerFaction?.reserves || {};

    return (
        <div
            className="relative w-full h-full overflow-hidden bg-slate-950 select-none nebula-bg"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            onWheel={handleWheel}
        >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0f172a_0%,_#020617_80%)]" />

            <SimulationTimer nowSeconds={nowSeconds} />

            <svg viewBox={dynamicVb} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <filter id="hex-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {regions.map((region: any) => region.systemIds.map((sid: any) => {
                    const sys = systems.find((s: any) => s.id === sid);
                    if (!sys) return null;
                    const px = hexToPixel(sys.q, sys.r);
                    return (
                        <polygon
                            key={`region-halo-${sid}`}
                            points={HEX_POINTS}
                            transform={`translate(${px.x}, ${px.y})`}
                            fill={`${region.color}18`}
                            stroke={region.color}
                            strokeWidth={region.status === 'emerging' ? 0.5 : 1}
                            strokeOpacity={0.5}
                            pointerEvents="none"
                        />
                    );
                }))}

                {systems.map((sys: any) => {
                    const px = hexToPixel(sys.q, sys.r);
                    const isSelected = selectedSystemId === sys.id;
                    const revealStage = factionVisibility?.[sys.id]?.revealStage || 'unknown';
                    const styles = getVisibilityStyles(revealStage, systemColor(activeOverlay, sys.instability, sys.tradeValue, sys.escalationLevel, sys.security));

                    return (
                        <g
                            key={sys.id}
                            transform={`translate(${px.x}, ${px.y})`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!hasMoved.current) setSelectedSystem(isSelected ? null : sys.id);
                            }}
                            className="transition-all"
                            style={{ cursor: 'pointer', opacity: styles.opacity }}
                        >
                            <polygon
                                points={HEX_POINTS}
                                fill={styles.fill}
                                stroke={isSelected ? 'var(--color-neon-blue)' : styles.stroke}
                                strokeWidth={isSelected ? 2 : 1}
                                filter={isSelected ? 'url(#hex-glow)' : undefined}
                            />
                            {styles.showDot && (
                                <circle
                                    r={sys.tags.includes('gate') || sys.tags.includes('fortress') ? 4 : 2.5}
                                    fill={sys.ownerId ? (sys.ownerId === 'faction-aurelian' ? '#3b82f6' : sys.ownerId === 'faction-vektori' ? '#ef4444' : '#22c55e') : '#94a3b8'}
                                    className="animate-breathe"
                                />
                            )}
                            {/* Contested overlay — dashed orange ring */}
                            {contestedSystemIds.has(sys.id) && (
                                <polygon
                                    points={HEX_POINTS}
                                    fill="none"
                                    stroke="#f97316"
                                    strokeWidth={1.5}
                                    strokeDasharray="3 2"
                                    opacity={0.75}
                                    style={{ animation: 'spin 8s linear infinite' }}
                                    pointerEvents="none"
                                />
                            )}
                        </g>
                    );
                })}

                {/* Fleets */}
                {fleets.map((fleet: any) => {
                    let fromSys, x = 0, y = 0;
                    if (fleet.currentSystemId) {
                        fromSys = systems.find((s: any) => s.id === fleet.currentSystemId);
                        if (fromSys) {
                            const px = hexToPixel(fromSys.q, fromSys.r);
                            x = px.x; y = px.y - 6;
                        }
                    }
                    if (!fromSys) return null;
                    const color = fleet.factionId === 'faction-aurelian' ? '#3b82f6' : '#ef4444';
                    return (
                        <g key={fleet.id} transform={`translate(${x}, ${y})`}>
                            <polygon points="0,-4 3,4 -3,4" fill={color} stroke="#fff" strokeWidth={0.5} filter="url(#hex-glow)" />
                        </g>
                    );
                })}
            </svg>

            {/* Contested ring animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
                @keyframes breathe {
                    0%, 100% { opacity: 0.8; transform: scale(1); }
                    50%       { opacity: 1;   transform: scale(1.15); }
                }
                .animate-breathe { animation: breathe 3s ease-in-out infinite; }
            `}</style>

            <OverlayToggleBar />
            <SystemContextPanel />
            <CrisisBottomTray />

            {selectedPlanetId && selectedSystemId && (
                <PlanetConstructionPanel
                    planetId={selectedPlanetId}
                    systemId={selectedSystemId}
                    factionId={playerState.factionId}
                    factionCredits={reserves['CREDITS'] || 0}
                    factionMetals={reserves['METALS'] || 0}
                    factionChemicals={reserves['CHEMICALS'] || 0}
                    factionEnergy={reserves['ENERGY'] || 0}
                    factionRares={reserves['RARES'] || 0}
                    factionManpower={reserves['FOOD'] || 0}
                    onClose={() => setSelectedPlanet(null)}
                />
            )}
        </div>
    );
}
