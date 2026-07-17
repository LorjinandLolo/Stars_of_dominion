"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import OverlayToggleBar from './OverlayToggleBar';
import SystemContextPanel from './SystemContextPanel';
import CrisisBottomTray from './CrisisBottomTray';
import { ReviewPanel } from '../combat/ReviewPanel';
import { PlanetConstructionPanel } from '../construction/PlanetConstructionPanel';
import { Activity } from 'lucide-react';
import SystemNode from './SystemNode';
import StellarPhenomenon, { hasPhenomenon } from './StellarPhenomenon';
import { STAR_CLASSES, factionColor } from './starVisuals';

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

function SimulationTimer() {
    const nowSeconds = useUIStore(s => s.nowSeconds);
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
            return { fill: '#334155', stroke: '#38bdf8' };
        default:
            return { fill: '#64748b', stroke: '#cbd5e1' };
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
            return { fill: '#1e293b', stroke: '#334155', opacity: 0.7, showDetails: false, showDot: false };
    }
}

export default function GalaxyShell() {
    const systems = useUIStore(s => s.systems);
    const regions = useUIStore(s => s.regions);
    const activeOverlay = useUIStore(s => s.activeOverlay);
    const selectedSystemId = useUIStore(s => s.selectedSystemId);
    const setSelectedSystem = useUIStore(s => s.setSelectedSystem);
    const fleets = useUIStore(s => s.fleets);
    const selectedPlanetId = useUIStore(s => s.selectedPlanetId);
    const setSelectedPlanet = useUIStore(s => s.setSelectedPlanet);
    const constructionPlanetId = useUIStore(s => s.constructionPlanetId);
    const setConstructionPlanet = useUIStore(s => s.setConstructionPlanet);
    const playerState = useUIStore(s => s.playerState);
    const factionVisibility = useUIStore(s => s.factionVisibility);
    const factions = useUIStore(s => s.factions);
    const contestedSystemIds = useUIStore(s => s.contestedSystemIds);
    const forwardBases = useUIStore(s => s.forwardBases);
    const diplomacyState = useUIStore(s => s.diplomacyState);

    // Friend/foe relationship of every other faction toward the player, derived from
    // rivalries (war = hostile) and mutual-defense treaties (ally).
    const relationshipByFaction = useMemo(() => {
        const rel: Record<string, 'ally' | 'neutral' | 'hostile'> = {};
        const me = playerState?.factionId;
        if (!me) return rel;
        const dip: any = diplomacyState || {};
        for (const r of (dip.rivalries || [])) {
            const other = r.empireAId === me ? r.empireBId : r.empireBId === me ? r.empireAId : null;
            if (!other) continue;
            if ((r.escalationLevel ?? 0) >= 5 && !r.detenteActive) rel[other] = 'hostile';
        }
        for (const t of (dip.treaties || [])) {
            if (t.status !== 'active' || t.type !== 'mutual_defense') continue;
            const sig: string[] = t.signatories || [];
            if (!sig.includes(me)) continue;
            for (const s of sig) if (s !== me && rel[s] !== 'hostile') rel[s] = 'ally';
        }
        return rel;
    }, [playerState, diplomacyState]);

    const systemMap = useMemo(() => {
        const map = new Map<string, any>();
        systems.forEach((s: any) => map.set(s.id, s));
        return map;
    }, [systems]);

    // Which systems are faction capitals (for cinematic treatment).
    const capitalSet = useMemo(() => {
        const set = new Set<string>();
        Object.values(factions || {}).forEach((f: any) => {
            if (f?.capitalSystemId) set.add(f.capitalSystemId);
        });
        return set;
    }, [factions]);

    // Constellation lanes: connect each system to its few nearest neighbours. Computed
    // once per systems change (capped for very large galaxies), then culled by viewport.
    const lanes = useMemo(() => {
        const arr = systems as any[];
        if (!arr.length || arr.length > 700) return [] as any[];
        const out: { ax: number; ay: number; bx: number; by: number; key: string; strong: boolean }[] = [];
        const seen = new Set<string>();
        const THRESH = HEX_WIDTH * 3.2;
        for (let i = 0; i < arr.length; i++) {
            const a = arr[i];
            const pa = hexToPixel(a.q, a.r);
            const cand: { j: number; d: number }[] = [];
            for (let j = 0; j < arr.length; j++) {
                if (i === j) continue;
                const pb = hexToPixel(arr[j].q, arr[j].r);
                const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
                if (d < THRESH) cand.push({ j, d });
            }
            cand.sort((x, y) => x.d - y.d);
            for (let k = 0; k < Math.min(3, cand.length); k++) {
                const j = cand[k].j;
                const key = i < j ? `${i}-${j}` : `${j}-${i}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const b = arr[j];
                const pb = hexToPixel(b.q, b.r);
                const strong = (!!a.ownerId && a.ownerId === b.ownerId) || (a.tradeValue || 0) > 50 || (b.tradeValue || 0) > 50;
                out.push({ ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, key, strong });
            }
        }
        return out;
    }, [systems]);

    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    }, []);

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

    const focusTarget = useUIStore(s => s.focusTarget);
    const setFocusTarget = useUIStore(s => s.setFocusTarget);

    useEffect(() => {
        if (focusTarget) {
            const px = hexToPixel(focusTarget.x, focusTarget.y);
            setPan({ 
                x: px.x - (svgMinX + (svgMaxX - svgMinX) / 2), 
                y: px.y - (svgMinY + (svgMaxY - svgMinY) / 2) 
            });
            if (focusTarget.zoom) setZoom(focusTarget.zoom);
            setFocusTarget(null);
        }
    }, [focusTarget, setFocusTarget, svgMinX, svgMaxX, svgMinY, svgMaxY]);

    const viewBoxObj = useMemo(() => {
        const w = (svgMaxX - svgMinX) / zoom;
        const h = (svgMaxY - svgMinY) / zoom;
        const cx = svgMinX + (svgMaxX - svgMinX) / 2 + pan.x;
        const cy = svgMinY + (svgMaxY - svgMinY) / 2 + pan.y;
        return { x: cx - w / 2, y: cy - h / 2, w, h };
    }, [pan, zoom, svgMinX, svgMaxX, svgMinY, svgMaxY]);

    const dynamicVb = `${viewBoxObj.x} ${viewBoxObj.y} ${viewBoxObj.w} ${viewBoxObj.h}`;

    // ─── FRUSTUM CULLING ──────────────────────────────────────────────────────
    const visibleSystems = useMemo(() => {
        const { x: vx, y: vy, w: vw, h: vh } = viewBoxObj;
        const buffer = HEX_WIDTH * 2;
        return systems.filter((sys: any) => {
            const px = hexToPixel(sys.q, sys.r);
            return (
                px.x >= vx - buffer &&
                px.x <= vx + vw + buffer &&
                px.y >= vy - buffer &&
                px.y <= vy + vh + buffer
            );
        });
    }, [systems, viewBoxObj]);

    const handleSelectSystem = useCallback((id: string) => {
        if (!hasMoved.current) {
            const currentSelected = useUIStore.getState().selectedSystemId;
            setSelectedSystem(currentSelected === id ? null : id);
        }
    }, [setSelectedSystem]);

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
        setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
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

            {/* Deep-space background: faint nebulae, star clouds and a distant starfield.
                Translated slightly against the camera pan for a parallax depth effect. */}
            <div
                className="absolute inset-0 pointer-events-none gx-parallax"
                style={{ transform: `translate3d(${-pan.x * 0.03}px, ${-pan.y * 0.03}px, 0)` }}
            >
                <div className="absolute inset-0 gx-nebula gx-nebula-1" />
                <div className="absolute inset-0 gx-nebula gx-nebula-2" />
                <div className="absolute inset-0 gx-starfield" />
            </div>

            <SimulationTimer />

            <svg viewBox={dynamicVb} className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <filter id="hex-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>

                    {/* Per-star-class glow halos (soft radial fade) */}
                    {STAR_CLASSES.map((c) => (
                        <radialGradient key={c.key} id={`glow-${c.key}`}>
                            <stop offset="0%" stopColor={c.glow} stopOpacity={0.55} />
                            <stop offset="38%" stopColor={c.glow} stopOpacity={0.16} />
                            <stop offset="100%" stopColor={c.glow} stopOpacity={0} />
                        </radialGradient>
                    ))}

                    {/* Soft blur for nebula clouds */}
                    <filter id="nebula-blur" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="4.5" />
                    </filter>

                    {/* OPTIMIZED BACKGROUND GRID: Using a Pattern instead of thousands of polygons */}
                    <pattern id="hex-grid-pattern" width={HEX_WIDTH} height={HEX_HEIGHT * 0.75} patternUnits="userSpaceOnUse" overflow="visible">
                        <polygon
                            points={getHexCorners(HEX_SIZE - 1)}
                            transform={`translate(${HEX_WIDTH / 2}, ${HEX_HEIGHT / 2})`}
                            fill="none"
                            stroke="#334155"
                            strokeWidth={0.5}
                        />
                        <polygon
                            points={getHexCorners(HEX_SIZE - 1)}
                            transform={`translate(0, ${HEX_HEIGHT * 0.75 / 2})`}
                            fill="none"
                            stroke="#334155"
                            strokeWidth={0.5}
                        />
                    </pattern>
                </defs>

                {/* Background Grid Pattern */}
                <rect
                    x={svgMinX} y={svgMinY}
                    width={svgMaxX - svgMinX} height={svgMaxY - svgMinY}
                    fill="url(#hex-grid-pattern)"
                    opacity={0.15}
                    pointerEvents="none"
                />

                {/* Galaxy-wide pulse synced to the ~10s authoritative clock — the whole
                    universe breathes with each tick. */}
                {(() => {
                    const cx = svgMinX + (svgMaxX - svgMinX) / 2;
                    const cy = svgMinY + (svgMaxY - svgMinY) / 2;
                    const maxR = Math.hypot(svgMaxX - svgMinX, svgMaxY - svgMinY) / 2;
                    return (
                        <circle
                            cx={cx} cy={cy} r={maxR}
                            fill="none" stroke="#38bdf8" strokeWidth={0.6}
                            className="gx-galaxy-pulse"
                            style={{ transformOrigin: `${cx}px ${cy}px` }}
                            pointerEvents="none"
                        />
                    );
                })()}

                {/* Constellation / hyperspace lanes (culled to viewport). Owned or
                    high-trade lanes flow brighter to read as active commerce. */}
                {lanes.map((ln: any) => {
                    const { x: vx, y: vy, w: vw, h: vh } = viewBoxObj;
                    const buffer = HEX_WIDTH * 3;
                    const aIn = ln.ax >= vx - buffer && ln.ax <= vx + vw + buffer && ln.ay >= vy - buffer && ln.ay <= vy + vh + buffer;
                    const bIn = ln.bx >= vx - buffer && ln.bx <= vx + vw + buffer && ln.by >= vy - buffer && ln.by <= vy + vh + buffer;
                    if (!aIn && !bIn) return null;
                    return (
                        <line
                            key={ln.key}
                            x1={ln.ax} y1={ln.ay} x2={ln.bx} y2={ln.by}
                            stroke={ln.strong ? '#38bdf8' : '#334155'}
                            strokeWidth={ln.strong ? 0.7 : 0.4}
                            strokeDasharray={ln.strong ? '2 3' : '1 4'}
                            className={ln.strong ? 'gx-lane-flow' : undefined}
                            opacity={ln.strong ? 0.5 : 0.22}
                            pointerEvents="none"
                        />
                    );
                })}

                {/* Stellar phenomena layer (nebulae, black holes, belts…) — behind stars */}
                {visibleSystems.map((sys: any) => {
                    if (!hasPhenomenon(sys.tags)) return null;
                    const p = hexToPixel(sys.q, sys.r);
                    return <StellarPhenomenon key={`phenom-${sys.id}`} sys={sys} x={p.x} y={p.y} zoom={zoom} />;
                })}

                {regions.map((region: any) => region.systemIds.map((sid: any) => {
                    const sys = systemMap.get(sid);
                    if (!sys) return null;
                    const px = hexToPixel(sys.q, sys.r);
                    const { x: vx, y: vy, w: vw, h: vh } = viewBoxObj;
                    const buffer = HEX_WIDTH * 2;
                    const isVisible = (
                        px.x >= vx - buffer &&
                        px.x <= vx + vw + buffer &&
                        px.y >= vy - buffer &&
                        px.y <= vy + vh + buffer
                    );
                    if (!isVisible) return null;
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

                {visibleSystems.map((sys: any) => {
                    const px = hexToPixel(sys.q, sys.r);
                    const isSelected = selectedSystemId === sys.id;
                    const revealStage = factionVisibility?.[sys.id]?.revealStage || 'unknown';
                    const styles = getVisibilityStyles(revealStage, systemColor(activeOverlay, sys.instability, sys.tradeValue, sys.escalationLevel, sys.security));

                    return (
                        <SystemNode
                            key={sys.id}
                            sys={sys}
                            px={px}
                            isSelected={isSelected}
                            revealStage={revealStage}
                            styles={styles}
                            contested={contestedSystemIds.has(sys.id)}
                            isMobile={isMobile}
                            hexPoints={HEX_POINTS}
                            onSelect={handleSelectSystem}
                            isCapital={capitalSet.has(sys.id)}
                            ownerColor={factionColor(sys.ownerId)}
                            relationship={sys.ownerId
                                ? (sys.ownerId === playerState?.factionId ? 'mine' : (relationshipByFaction[sys.ownerId] || 'neutral'))
                                : null}
                            activeOverlay={activeOverlay}
                            showLabel={zoom > 2.2}
                        />
                    );
                })}

                {/* Forward operating bases — staging points for invasions */}
                {(forwardBases || []).map((base: any) => {
                    const sys = systemMap.get(base.systemId);
                    if (!sys) return null;
                    const p = hexToPixel(sys.q, sys.r);
                    const { x: vx, y: vy, w: vw, h: vh } = viewBoxObj;
                    const buffer = HEX_WIDTH * 2;
                    if (!(p.x >= vx - buffer && p.x <= vx + vw + buffer && p.y >= vy - buffer && p.y <= vy + vh + buffer)) return null;
                    const color = factionColor(base.factionId);
                    const supply = typeof base.supply === 'number' ? base.supply : 1;
                    return (
                        <g key={base.id} transform={`translate(${p.x + 9}, ${p.y - 9})`} pointerEvents="none">
                            {/* staging radius / supply ring (shrinks as the base runs down) */}
                            <circle r={6} fill="none" stroke={color} strokeWidth={0.6}
                                strokeDasharray="2 2" opacity={0.4 + supply * 0.4} className="gx-spin-slow" />
                            {/* base marker: chevron flag */}
                            <polygon points="0,-3 3,0 0,3 0,1.2 -3,1.2 -3,-1.2 0,-1.2" fill={color} stroke="#020617" strokeWidth={0.4} />
                            <text textAnchor="middle" y={11} fontSize={4} fill={color}
                                style={{ paintOrder: 'stroke', stroke: '#020617', strokeWidth: 0.6 }}>FOB</text>
                        </g>
                    );
                })}

                {/* Fleets */}
                {fleets.map((fleet: any) => {
                    let fromSys, x = 0, y = 0;
                    if (fleet.currentSystemId) {
                        fromSys = systemMap.get(fleet.currentSystemId);
                        if (fromSys) {
                            const px = hexToPixel(fromSys.q, fromSys.r);
                            const { x: vx, y: vy, w: vw, h: vh } = viewBoxObj;
                            const buffer = HEX_WIDTH * 2;
                            const isVisible = (
                                px.x >= vx - buffer &&
                                px.x <= vx + vw + buffer &&
                                px.y >= vy - buffer &&
                                px.y <= vy + vh + buffer
                            );
                            if (!isVisible) return null;
                            x = px.x; y = px.y - 6;
                        }
                    }
                    if (!fromSys) return null;
                    const color = factionColor(fleet.factionId);
                    return (
                        <g key={fleet.id} transform={`translate(${x}, ${y})`}>
                            {/* Engine glow */}
                            <circle r={3.5} fill={color} opacity={0.35} className="gx-breathe" />
                            <polygon points="0,-4 3,4 -3,4" fill={color} stroke="#fff" strokeWidth={0.5} filter="url(#hex-glow)" />
                        </g>
                    );
                })}
            </svg>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes breathe {
                    0%, 100% { opacity: 0.8; transform: scale(1); }
                    50%       { opacity: 1;   transform: scale(1.15); }
                }
                @keyframes scanlines { 0% { background-position: 0 0; } 100% { background-position: 0 4px; } }
                .animate-breathe { animation: breathe 3s ease-in-out infinite; }
                .animate-scanlines { animation: scanlines 2s linear infinite; }

                /* ── Galaxy map life ─────────────────────────────────────────── */
                /* SVG elements rotate/scale about their own centre. */
                .gx-spin, .gx-spin-slow, .gx-spin-rev,
                .gx-pulse-ring, .gx-select-ring, .gx-select-ring2 {
                    transform-box: fill-box;
                    transform-origin: center;
                }
                @keyframes gx-breathe { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
                .gx-breathe      { animation: gx-breathe 3.5s ease-in-out infinite; }
                .gx-breathe-slow { animation: gx-breathe 6s ease-in-out infinite; }

                .gx-spin      { animation: spin 9s linear infinite; }
                .gx-spin-slow { animation: spin 22s linear infinite; }
                .gx-spin-rev  { animation: spin 30s linear infinite reverse; }

                @keyframes gx-pulse-ring {
                    0%   { transform: scale(1);   opacity: 0.8; }
                    100% { transform: scale(2.1); opacity: 0; }
                }
                .gx-pulse-ring { animation: gx-pulse-ring 2.4s ease-out infinite; }

                @keyframes gx-select {
                    0%   { transform: scale(0.9); opacity: 0.9; }
                    100% { transform: scale(2.4); opacity: 0; }
                }
                .gx-select-ring  { animation: gx-select 1.8s ease-out infinite; }
                .gx-select-ring2 { animation: gx-select 1.8s ease-out infinite; animation-delay: 0.9s; }

                @keyframes gx-lane-flow { to { stroke-dashoffset: -10; } }
                .gx-lane-flow { animation: gx-lane-flow 1.1s linear infinite; }

                /* Whole-galaxy tick pulse (~10s, matches the authoritative clock). */
                .gx-galaxy-pulse { transform-box: view-box; }
                @keyframes gx-galaxy-pulse {
                    0%   { transform: scale(0.02); opacity: 0.18; }
                    100% { transform: scale(1);    opacity: 0; }
                }
                .gx-galaxy-pulse { animation: gx-galaxy-pulse 10s ease-out infinite; }

                /* Deep-space background */
                .gx-parallax { will-change: transform; }
                .gx-nebula { mix-blend-mode: screen; }
                .gx-nebula-1 {
                    background:
                        radial-gradient(40% 30% at 25% 30%, rgba(59,130,246,0.10), transparent 70%),
                        radial-gradient(35% 26% at 75% 65%, rgba(168,85,247,0.09), transparent 70%);
                    animation: gx-drift-a 70s ease-in-out infinite alternate;
                }
                .gx-nebula-2 {
                    background:
                        radial-gradient(30% 22% at 62% 18%, rgba(20,184,166,0.07), transparent 70%),
                        radial-gradient(46% 32% at 14% 82%, rgba(236,72,153,0.06), transparent 70%);
                    animation: gx-drift-b 95s ease-in-out infinite alternate;
                }
                @keyframes gx-drift-a { from { transform: translate(0,0) scale(1); } to { transform: translate(2%, -1.6%) scale(1.05); } }
                @keyframes gx-drift-b { from { transform: translate(0,0) scale(1); } to { transform: translate(-2.2%, 1.5%) scale(1.06); } }
                .gx-starfield {
                    opacity: 0.55;
                    background-image:
                        radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,0.55), transparent),
                        radial-gradient(1px 1px at 28% 68%, rgba(255,255,255,0.4), transparent),
                        radial-gradient(1px 1px at 46% 34%, rgba(255,255,255,0.5), transparent),
                        radial-gradient(1px 1px at 63% 78%, rgba(255,255,255,0.35), transparent),
                        radial-gradient(1px 1px at 78% 26%, rgba(255,255,255,0.5), transparent),
                        radial-gradient(1px 1px at 88% 60%, rgba(255,255,255,0.4), transparent),
                        radial-gradient(1px 1px at 54% 90%, rgba(255,255,255,0.3), transparent),
                        radial-gradient(1px 1px at 8% 84%, rgba(255,255,255,0.35), transparent);
                }
                @media (prefers-reduced-motion: reduce) {
                    .gx-breathe, .gx-breathe-slow, .gx-spin, .gx-spin-slow, .gx-spin-rev,
                    .gx-pulse-ring, .gx-select-ring, .gx-select-ring2, .gx-lane-flow,
                    .gx-galaxy-pulse, .gx-nebula-1, .gx-nebula-2 { animation: none; }
                }
            `}</style>

            <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.15] mix-blend-overlay">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] animate-scanlines" />
            </div>

            <OverlayToggleBar />
            <SystemContextPanel />
            <CrisisBottomTray />
            <ReviewPanel />

            {constructionPlanetId && selectedSystemId && (
                <PlanetConstructionPanel
                    planetId={constructionPlanetId}
                    systemId={selectedSystemId}
                    factionId={playerState.factionId}
                    factionCredits={reserves['CREDITS'] || 0}
                    factionMetals={reserves['METALS'] || 0}
                    factionChemicals={reserves['CHEMICALS'] || 0}
                    factionEnergy={reserves['ENERGY'] || 0}
                    factionRares={reserves['RARES'] || 0}
                    factionManpower={reserves['FOOD'] || 0}
                    onClose={() => setConstructionPlanet(null)}
                />
            )}
        </div>
    );
}
