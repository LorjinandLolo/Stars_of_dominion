"use client";

import React, { useMemo } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { HexGrid } from '@/lib/hex-grid';
import OverlayToggleBar from './OverlayToggleBar';
import SystemContextPanel from './SystemContextPanel';
import CrisisBottomTray from './CrisisBottomTray';
import { PlanetConstructionPanel } from '../construction/PlanetConstructionPanel';


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
            return { fill: '#1e293b', stroke: '#38bdf8' }; // Brightened Deep Space
        default:
            // Standard systems default visual—lightened to pop against the dark space background
            return { fill: '#334155', stroke: '#94a3b8' }; // Significantly brighter neutral hex
    }
}

function surveyedColor(isSurveyed: boolean | undefined, baseColors: { fill: string; stroke: string }) {
    if (isSurveyed === false) {
        return { fill: '#0f172a', stroke: '#1e293b' }; // Dark, hidden visual for unsurveyed
    }
    return baseColors;
}

export default function GalaxyShell() {
    const {
        systems,
        regions,
        activeOverlay,
        selectedSystemId,
        setSelectedSystem,
        fleets,
        selectedFleetId,
        setSelectedFleetId,
        selectedPlanetId,
        setSelectedPlanet,
        playerState,
        nowSeconds,
    } = useUIStore();


    const { minQ, maxQ, minR, maxR } = useMemo(() => {
        if (!systems.length) return { minQ: -30, maxQ: 30, minR: -25, maxR: 25 };
        return {
            minQ: Math.min(...systems.map((s) => s.q)),
            maxQ: Math.max(...systems.map((s) => s.q)),
            minR: Math.min(...systems.map((s) => s.r)),
            maxR: Math.max(...systems.map((s) => s.r)),
        };
    }, [systems]);

    const pad = 4;
    const svgMinX = hexToPixel(minQ - pad, minR - pad).x;
    const svgMinY = hexToPixel(minQ - pad, minR - pad).y;
    const svgMaxX = hexToPixel(maxQ + pad, maxR + pad).x;
    const svgMaxY = hexToPixel(maxQ + pad, maxR + pad).y;
    const vb = `${svgMinX} ${svgMinY} ${svgMaxX - svgMinX} ${svgMaxY - svgMinY}`;

    // Region color lookup
    const regionBySystem = useMemo(() => {
        const map: Record<string, typeof regions[0]> = {};
        regions.forEach((r) => r.systemIds.forEach((sid) => { map[sid] = r; }));
        return map;
    }, [regions]);

    const [pan, setPan] = React.useState({ x: 0, y: 0 });
    const [zoom, setZoom] = React.useState(1);
    const [dragging, setDragging] = React.useState(false);
    const hasMoved = React.useRef(false);
    const lastMouse = React.useRef({ x: 0, y: 0 });

    const dynamicVb = useMemo(() => {
        const w = (svgMaxX - svgMinX) / zoom;
        const h = (svgMaxY - svgMinY) / zoom;
        const cx = svgMinX + (svgMaxX - svgMinX) / 2 + pan.x;
        const cy = svgMinY + (svgMaxY - svgMinY) / 2 + pan.y;
        return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
    }, [pan, zoom, svgMinX, svgMaxX, svgMinY, svgMaxY]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
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
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            hasMoved.current = true;
        }
        setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
        lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    return (
        <div
            className="relative w-full h-full overflow-hidden bg-slate-950 select-none"
            style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            onWheel={handleWheel}
        >
            {/* ── Star field background ── */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#0f172a_0%,_#020617_80%)]" />

            {/* ── Galaxy SVG ── */}
            <svg
                viewBox={dynamicVb}
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="xMidYMid meet"
            >
                {/* Region soft-border halos */}
                {regions.map((region) => {
                    if (region.status === 'dissolving') return null;
                    return region.systemIds.map((sid) => {
                        const sys = systems.find((s) => s.id === sid);
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
                                strokeDasharray={region.status === 'emerging' ? '3,3' : undefined}
                                strokeOpacity={0.5}
                                pointerEvents="none"
                            />
                        );
                    });
                })}

                {/* System hexes */}
                {systems.map((sys) => {
                    const px = hexToPixel(sys.q, sys.r);
                    const isSelected = selectedSystemId === sys.id;
                    const baseColors = systemColor(
                        activeOverlay,
                        sys.instability,
                        sys.tradeValue,
                        sys.escalationLevel,
                        sys.security,
                    );
                    const { fill, stroke } = surveyedColor(sys.isSurveyed, baseColors);
                    const regionColor = regionBySystem[sys.id]?.color;

                    return (
                        <g
                            key={sys.id}
                            transform={`translate(${px.x}, ${px.y})`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!hasMoved.current) setSelectedSystem(isSelected ? null : sys.id);
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <polygon
                                points={HEX_POINTS}
                                fill={fill}
                                stroke={isSelected ? '#fbbf24' : stroke}
                                strokeWidth={isSelected ? 2 : 1} // Bumped stroke width slightly for contrast
                            />
                            {/* System dot */}
                            <circle
                                r={sys.tags.includes('gate') || sys.tags.includes('fortress') ? 4 : 2.5}
                                fill={
                                    sys.ownerId
                                        ? (sys.ownerId === 'faction-aurelian'
                                            ? '#3b82f6'
                                            : sys.ownerId === 'faction-vektori'
                                                ? '#ef4444'
                                                : sys.ownerId === 'faction-null-syndicate'
                                                    ? '#a855f7'
                                                    : '#22c55e')
                                        : '#94a3b8' // Brightened neutral system dot to pop clearly
                                }
                            />
                            {/* Escalation indicator ring */}
                            {sys.escalationLevel > 6 && (
                                <circle
                                    r={5}
                                    fill="none"
                                    stroke="#ef4444"
                                    strokeWidth={1}
                                    strokeOpacity={0.7}
                                    strokeDasharray="2,2"
                                />
                            )}
                        </g>
                    );
                })}

                {/* Fleets */}
                {fleets.map((fleet) => {
                    let fromSys, toSys;
                    let x = 0, y = 0;

                    if (fleet.currentSystemId) {
                        fromSys = systems.find(s => s.id === fleet.currentSystemId);
                        if (fromSys) {
                            const px = hexToPixel(fromSys.q, fromSys.r);
                            x = px.x;
                            y = px.y - 6; // Offset slightly above planet
                        }
                    } else if (fleet.plannedPath.length >= 2) {
                        fromSys = systems.find(s => s.id === fleet.plannedPath[0]);
                        toSys = systems.find(s => s.id === fleet.plannedPath[1]);
                        if (fromSys && toSys) {
                            const p1 = hexToPixel(fromSys.q, fromSys.r);
                            const p2 = hexToPixel(toSys.q, toSys.r);
                            x = p1.x + (p2.x - p1.x) * fleet.transitProgress;
                            y = p1.y + (p2.y - p1.y) * fleet.transitProgress;
                        }
                    }

                    if (!fromSys) return null;

                    const color = fleet.factionId === 'faction-aurelian' ? '#3b82f6' :
                        fleet.factionId === 'faction-vektori' ? '#ef4444' :
                            fleet.factionId === 'faction-null-syndicate' ? '#a855f7' : '#22c55e';

                    return (
                        <g
                            key={fleet.id}
                            transform={`translate(${x}, ${y})`}
                            style={{ transition: 'transform 2s linear' }}
                        >
                            {/* Simple triangle to represent a fleet */}
                            <polygon
                                points="0,-4 3,4 -3,4"
                                fill={color}
                                stroke="#fff"
                                strokeWidth={0.5}
                                className="drop-shadow-md"
                            />
                            {/* Pulse ring for moving fleets */}
                            {fleet.transitProgress > 0 && (
                                <circle
                                    r={6}
                                    fill="none"
                                    stroke={color}
                                    className="animate-ping"
                                    opacity={0.5}
                                />
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* ── Overlay UI layers ── */}
            <OverlayToggleBar />
            <SystemContextPanel />
            <CrisisBottomTray />

            {/* ── Construction UI Overlay ── */}
            {selectedPlanetId && selectedSystemId && (
                <PlanetConstructionPanel
                    planetId={selectedPlanetId}
                    systemId={selectedSystemId}
                    factionId={playerState.factionId}
                    factionCredits={1000} // TODO: Connect to real economy credits state
                    factionMetals={2000}  // TODO: Connect to real economy metals state
                    factionChemicals={500}
                    factionEnergy={1000}
                    factionRares={100}
                    factionManpower={1000}
                    onClose={() => setSelectedPlanet(null)}
                />
            )}

            {/* ── Overlay label when active ── */}
            {activeOverlay && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                    <div className="text-xs font-display tracking-widest text-amber-400 bg-slate-950/80 px-3 py-1 rounded border border-amber-400/30">
                        {activeOverlay.toUpperCase()} OVERLAY ACTIVE
                    </div>
                </div>
            )}

            {/* ── Scroll/Drag/Click help (Minimal) ── */}
            <div className="absolute bottom-16 right-4 z-30 pointer-events-none">
                <div className="text-[10px] font-display text-slate-600 bg-slate-950/40 px-2 py-1 rounded border border-slate-800/30">
                    Scroll · Drag · Click
                </div>
            </div>
        </div>
    );
}
