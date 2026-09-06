"use client";

// components/planet/SystemOrbitalView.tsx
// Layer 1.5 — the star system as a PLACE, not a list.
// Entering a system shows the star and its worlds in orbit; planets are the
// interactive objects. Selecting one opens its dossier; from there the player
// dives to the surface board. Galaxy → System → Planet → Surface → District.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { classifyStar, factionColor, hashString } from '@/components/galaxy/starVisuals';
import { hasAsteroidBelt, beltLaneIndex } from '@/lib/movement/belts';
import { generateSurface } from '@/lib/planet-surface/generator';
import { ARCHETYPE_CORE, ARCHETYPE_LABEL } from './terrainMeta';
import { formatPercent } from '@/lib/ui/format';
import {
    X, Globe, Users, Landmark, Heart, ShieldCheck, Wrench, AlertTriangle, Hammer, Swords, Crosshair,
} from 'lucide-react';

const VIEW = 1000;
const SUN_X = 150;
const SUN_Y = VIEW / 2;
const FOCUS_ZOOM = 1.32;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.2;

// Orbits laid out left-to-right from the star, evenly spaced. Each world sits
// at a staggered base angle so names never collide, then travels its orbit at
// its own period. Pure in (index, count, seconds) so the renderer, the hit
// targets and the camera all agree on where a world IS — the old version
// rotated worlds with a CSS animation while the camera eased toward their
// t=0 layout position, so a selected world slid out from under the camera.
const LANE_START = 300;
const LANE_END = VIEW - 120;
function orbitLane(count: number): number {
    return count > 1 ? (LANE_END - LANE_START) / (count - 1) : 0;
}
function orbitPeriodSeconds(i: number): number {
    return 260 + i * 95;
}
function planetPosAt(i: number, count: number, seconds: number): { x: number; y: number; r: number } {
    const orbitR = LANE_START + i * orbitLane(count) - SUN_X;
    const base = ((i % 2 === 0 ? -1 : 1) * (14 + (i % 3) * 9) * Math.PI) / 180;
    const angle = base + (2 * Math.PI * seconds) / orbitPeriodSeconds(i);
    return {
        x: SUN_X + orbitR * Math.cos(angle),
        y: SUN_Y + orbitR * Math.sin(angle),
        r: orbitR,
    };
}

interface Camera { x: number; y: number; zoom: number }
const CAMERA_HOME: Camera = { x: 0, y: 0, zoom: 1 };

/** Camera that puts a world at 44% width, mid-height, at the focus zoom. */
function cameraFocusing(px: number, py: number): Camera {
    return { x: VIEW * 0.44 - px * FOCUS_ZOOM, y: VIEW * 0.5 - py * FOCUS_ZOOM, zoom: FOCUS_ZOOM };
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = React.useState(false);
    React.useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    return reduced;
}

/** Planet marker radius from its type/size hints. */
function planetRadius(planet: any): number {
    const t = String(planet.planetType ?? '').toLowerCase();
    if (t.includes('mega')) return 46;
    if (t.includes('capital')) return 40;
    if (t.includes('moon')) return 22;
    return 32;
}

export default function SystemOrbitalView() {
    const systemViewId = useUIStore(s => s.systemViewId);
    const setSystemView = useUIStore(s => s.setSystemView);
    const setSurfacePlanet = useUIStore(s => s.setSurfacePlanet);
    const setConstructionPlanet = useUIStore(s => s.setConstructionPlanet);
    const setSelectedPlanet = useUIStore(s => s.setSelectedPlanet);
    const systems = useUIStore(s => s.systems);
    const planets = useUIStore(s => s.planets);
    const factions = useUIStore(s => s.factions);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const fleets = useUIStore(s => s.fleets);
    const selectedFleetId = useUIStore(s => s.selectedFleetId);
    const setSelectedFleetId = useUIStore(s => s.setSelectedFleetId);

    const system = systems.find((s: any) => s.id === systemViewId);
    const systemPlanets = React.useMemo(
        () => planets.filter((p: any) => p.systemId === systemViewId),
        [planets, systemViewId]
    );

    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    React.useEffect(() => { setSelectedId(null); }, [systemViewId]);

    // ── Orbit clock + camera ─────────────────────────────────────────────
    // One rAF loop advances the orbit clock and eases the camera toward its
    // target. The camera FOLLOWS the selected world (its live position, not
    // its layout position) until the player pans or zooms, which hands the
    // camera to them until the next selection.
    const reducedMotion = usePrefersReducedMotion();
    const [orbitSeconds, setOrbitSeconds] = React.useState(0);
    const [cam, setCam] = React.useState<Camera>(CAMERA_HOME);
    const camRef = React.useRef<Camera>(CAMERA_HOME);
    const followRef = React.useRef(true);
    const frameRef = React.useRef({ selectedIndex: -1, count: 0, seconds: 0 });
    const dragRef = React.useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null);
    const [dragging, setDragging] = React.useState(false);
    const svgRef = React.useRef<SVGSVGElement | null>(null);

    // The rAF loop aims the camera from these without waiting for a render.
    const selectedIndex = selectedId ? systemPlanets.findIndex((p: any) => p.id === selectedId) : -1;
    React.useLayoutEffect(() => {
        frameRef.current.selectedIndex = selectedIndex;
        frameRef.current.count = systemPlanets.length;
    }, [selectedIndex, systemPlanets.length]);

    /** Selecting (or clearing) re-arms the follow; a pan/zoom disarms it. */
    const selectPlanet = React.useCallback((id: string | null) => {
        followRef.current = true;
        setSelectedId(id);
    }, []);

    React.useEffect(() => {
        if (!systemViewId) return;
        let raf = 0;
        const start = performance.now();
        let last = start;
        let lastOrbitCommit = -1;
        const tick = (now: number) => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const seconds = reducedMotion ? 0 : (now - start) / 1000;
            frameRef.current.seconds = seconds;
            // ~20 orbit commits a second is plenty for worlds that take minutes per lap.
            if (now - lastOrbitCommit > 50) {
                lastOrbitCommit = now;
                setOrbitSeconds(seconds);
            }
            if (followRef.current) {
                const { selectedIndex, count } = frameRef.current;
                const target = selectedIndex >= 0
                    ? (() => { const p = planetPosAt(selectedIndex, count, seconds); return cameraFocusing(p.x, p.y); })()
                    : CAMERA_HOME;
                const cur = camRef.current;
                const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
                const next = {
                    x: cur.x + (target.x - cur.x) * k,
                    y: cur.y + (target.y - cur.y) * k,
                    zoom: cur.zoom + (target.zoom - cur.zoom) * k,
                };
                if (Math.abs(next.x - cur.x) > 0.01 || Math.abs(next.y - cur.y) > 0.01 || Math.abs(next.zoom - cur.zoom) > 0.0005) {
                    camRef.current = next;
                    setCam(next);
                }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [systemViewId, reducedMotion]);

    /** Screen point → root SVG user units (before the camera transform). */
    const toUser = React.useCallback((clientX: number, clientY: number) => {
        const svg = svgRef.current;
        const ctm = svg?.getScreenCTM();
        if (!svg || !ctm) return null;
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = clientY;
        const q = pt.matrixTransform(ctm.inverse());
        return { x: q.x, y: q.y };
    }, []);

    const setCameraNow = React.useCallback((next: Camera) => {
        followRef.current = false;
        camRef.current = next;
        setCam(next);
    }, []);

    const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
        const p = toUser(e.clientX, e.clientY);
        if (!p) return;
        const cur = camRef.current;
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.zoom * Math.exp(-e.deltaY * 0.0012)));
        const ratio = zoom / cur.zoom;
        // Keep the point under the cursor fixed while zooming.
        setCameraNow({ x: p.x - (p.x - cur.x) * ratio, y: p.y - (p.y - cur.y) * ratio, zoom });
    };

    const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.button !== 0) return;
        dragRef.current = { x: e.clientX, y: e.clientY, cam: camRef.current, moved: false };
    };
    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const d = dragRef.current;
        const svg = svgRef.current;
        if (!d || !svg) return;
        const dxPx = e.clientX - d.x;
        const dyPx = e.clientY - d.y;
        if (!d.moved && Math.hypot(dxPx, dyPx) < 4) return; // a click, not a drag
        if (!d.moved) {
            // Capture only once it IS a drag: capturing on pointerdown would
            // retarget the click to the svg and worlds would stop selecting.
            d.moved = true;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        const scale = VIEW / svg.getBoundingClientRect().width; // px → user units
        setCameraNow({ x: d.cam.x + dxPx * scale, y: d.cam.y + dyPx * scale, zoom: d.cam.zoom });
    };
    const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        // Cleared on the next tick so the click that ends a drag still sees `moved`.
        const d = dragRef.current;
        setDragging(false);
        if (d?.moved) setTimeout(() => { if (dragRef.current === d) dragRef.current = null; }, 0);
        else dragRef.current = null;
    };

    // A vanished system (sync purge, stale id) must not strand the player.
    React.useEffect(() => {
        if (systemViewId && !system) setSystemView(null);
    }, [systemViewId, system, setSystemView]);

    // Esc leaves the system view — unless a higher layer consumed the key.
    React.useEffect(() => {
        if (!systemViewId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if (useUIStore.getState().activeTab !== 'galaxy') return;
            if (useUIStore.getState().surfacePlanetId) return; // surface board owns it
            e.preventDefault();
            followRef.current = true;
            setSelectedId(cur => {
                if (cur) return null;
                setSystemView(null);
                return null;
            });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [systemViewId, setSystemView]);

    if (!systemViewId || !system) return null;

    const star = classifyStar(system);
    const selected = systemPlanets.find((p: any) => p.id === selectedId) ?? null;
    const lane = orbitLane(systemPlanets.length);
    const planetPos = (i: number) => planetPosAt(i, systemPlanets.length, orbitSeconds);
    // The belt is a real feature now (lib/movement/belts.ts): same roll the
    // worker makes, so what you see is what you can lurk in.
    const hasBelt = hasAsteroidBelt(system.id);
    const beltRadius = systemPlanets.length > 0
        ? planetPos(beltLaneIndex(system.id, systemPlanets.length)).r + lane * 0.5
        : 320;

    /** My fleet parked here — the selected one if it is, else the first. */
    const myParkedFleet = (() => {
        const mine = (fleets as any[]).filter(f => f.factionId === playerFactionId && f.currentSystemId === systemViewId && !f.destinationSystemId);
        return mine.find(f => f.id === selectedFleetId) ?? mine[0] ?? null;
    })();
    const beltAction = hasBelt && myParkedFleet && playerFactionId ? (() => {
        const lurking = myParkedFleet.stance === 'belt';
        const name = myParkedFleet.name ?? myParkedFleet.id;
        return {
            label: lurking ? `LEAVE BELT · ${name}` : `LURK IN BELT · ${name}`,
            lurking,
            onClick: () => dispatchOrder({
                actionId: 'MIL_FLEET_STANCE',
                factionId: playerFactionId,
                payload: { fleetId: myParkedFleet.id, stance: lurking ? 'open' : 'belt' },
                label: lurking ? `${name} leaving the belt` : `${name} slipping into the asteroid belt`,
            }),
        };
    })() : null;

    /**
     * The dossier's orbit action for a world: the selected fleet if it is mine,
     * else my fleet parked here. In-system → take/leave orbit now; elsewhere →
     * send it here and it takes orbit on arrival.
     */
    const orbitActionFor = (planet: any) => {
        const mine = (fleets as any[]).filter(f => f.factionId === playerFactionId);
        const picked = mine.find(f => f.id === selectedFleetId)
            ?? mine.find(f => f.currentSystemId === systemViewId && !f.destinationSystemId);
        if (!picked || !playerFactionId) return null;
        const name = picked.name ?? picked.id;
        const here = picked.currentSystemId === systemViewId && !picked.destinationSystemId;
        if (here) {
            const active = picked.orbitingPlanetId === planet.id;
            return {
                label: active ? `LEAVE ORBIT · ${name}` : `ORBIT HERE · ${name}`,
                active,
                onClick: () => dispatchOrder({
                    actionId: 'MIL_ORBIT_PLANET',
                    factionId: playerFactionId,
                    payload: { fleetId: picked.id, planetId: planet.id },
                    label: active ? `${name} leaving orbit of ${planet.name}` : `${name} taking orbit over ${planet.name}`,
                }),
            };
        }
        return {
            label: `SEND ${name} · ORBIT ON ARRIVAL`,
            active: false,
            onClick: () => dispatchOrder({
                actionId: 'MIL_MOVE_FLEET',
                factionId: playerFactionId,
                payload: { fleetId: picked.id, destinationId: systemViewId, orbitPlanetId: planet.id },
                label: `${name} en route to orbit ${planet.name}`,
            }),
        };
    };

    return (
        <div
            className="absolute inset-0 z-[38] flex flex-col bg-[radial-gradient(ellipse_at_20%_50%,_#0b1220_0%,_#020617_75%)]"
            style={{ animation: 'systemRise 0.28s ease-out' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: star.core, boxShadow: `0 0 16px ${star.glow}` }} />
                    <div className="min-w-0">
                        <div className="text-[13px] font-display tracking-[0.22em] text-slate-100 uppercase truncate">{system.name}</div>
                        <div className="text-[8px] font-display tracking-[0.15em] text-slate-500 uppercase">
                            {star.label} · {systemPlanets.length} {systemPlanets.length === 1 ? 'world' : 'worlds'}{hasBelt ? ' · asteroid belt' : ''}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setSystemView(null)}
                    className="p-2 text-slate-400 hover:text-red-300 rounded hover:bg-red-500/10"
                    title="Back to galaxy (Esc)"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* World list — quick selection rail, mockup-style */}
                <div className="hidden md:flex flex-col w-56 border-r border-slate-800/60 bg-slate-950/60 backdrop-blur-sm overflow-y-auto flex-shrink-0 z-10">
                    <div className="px-3 py-2 text-[8px] font-display tracking-[0.25em] text-slate-500 uppercase border-b border-slate-800/40">
                        Worlds · {systemPlanets.length}
                    </div>
                    {systemPlanets.map((p: any) => {
                        const psurf = generateSurface(p.id, p.planetType, p.tags);
                        const [pin, pout] = ARCHETYPE_CORE[psurf.archetype];
                        const isSel = selectedId === p.id;
                        return (
                            <button
                                key={p.id}
                                onClick={() => selectPlanet(selectedId === p.id ? null : p.id)}
                                className={[
                                    'flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-900/80 text-left transition-colors',
                                    isSel ? 'bg-sky-500/10 border-l-2 border-l-sky-400' : 'hover:bg-slate-900/60',
                                ].join(' ')}
                            >
                                <span
                                    className="w-6 h-6 rounded-full flex-shrink-0 border border-white/15"
                                    style={{ background: `radial-gradient(circle at 35% 32%, ${pin}, ${pout})` }}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-display tracking-wider text-slate-200 truncate">{p.name}</span>
                                    <span className="block text-[7px] font-display tracking-[0.15em] text-slate-500 uppercase">
                                        {ARCHETYPE_LABEL[psurf.archetype]} {p.planetType}
                                    </span>
                                </span>
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: p.ownerId ? factionColor(p.ownerId) : '#334155' }}
                                    title={p.ownerId ?? 'Unclaimed'}
                                />
                            </button>
                        );
                    })}
                </div>

                {/* Orbital diagram — drag to pan, wheel to zoom, like the galaxy map */}
                <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                    {/* Belt stance lives on the canvas — top-left is clear of the centred
                        clock widget and of the pending-orders HUD in the bottom-left. */}
                    {beltAction && (
                        <button
                            onClick={beltAction.onClick}
                            title={beltAction.lurking
                                ? 'Leave the belt and hold openly'
                                : 'Hide in the asteroid belt: unseen unless they have surveyed this system and hold a fleet here; ambushes enemies passing through'}
                            className={`absolute left-3 top-3 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg border backdrop-blur-sm text-[9px] font-display tracking-[0.15em] transition-all shadow-lg ${
                                beltAction.lurking
                                    ? 'border-stone-300/60 bg-stone-500/30 text-stone-100 hover:bg-stone-500/20'
                                    : 'border-stone-500/50 bg-stone-900/80 hover:bg-stone-700/60 text-stone-200'
                            }`}
                        >
                            <span className="text-[11px] leading-none">◌</span> {beltAction.label}
                        </button>
                    )}
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${VIEW} ${VIEW}`}
                        className={`w-full h-full max-h-[88vh] select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onWheel={handleWheel}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onDoubleClick={() => { followRef.current = true; }}
                    >
                        <defs>
                            <radialGradient id="sv-star">
                                <stop offset="0%" stopColor="#ffffff" />
                                <stop offset="45%" stopColor={star.core} />
                                <stop offset="100%" stopColor={star.glow} />
                            </radialGradient>
                            <radialGradient id="sv-corona">
                                <stop offset="0%" stopColor={star.glow} stopOpacity={0.55} />
                                <stop offset="100%" stopColor={star.glow} stopOpacity={0} />
                            </radialGradient>
                        </defs>

                        {/* Camera: eased by the rAF loop — follows the selected world's
                            LIVE orbit position until the player pans or zooms. */}
                        <g transform={`translate(${cam.x.toFixed(2)} ${cam.y.toFixed(2)}) scale(${cam.zoom.toFixed(4)})`}>

                        {/* Orbit arcs */}
                        {systemPlanets.map((p: any, i: number) => (
                            <circle
                                key={`orbit-${p.id}`}
                                cx={SUN_X} cy={SUN_Y} r={planetPos(i).r}
                                fill="none"
                                stroke={selectedId === p.id ? '#38bdf8' : '#1e293b'}
                                strokeOpacity={selectedId === p.id ? 0.6 : 0.5}
                                strokeWidth={1}
                                strokeDasharray="3 6"
                            />
                        ))}

                        {/* Asteroid belt: a real system feature (lib/movement/belts.ts), slowly turning */}
                        {hasBelt && (() => {
                            const beltR = beltRadius;
                            return (
                                <g className="sv-belt" style={{ transformOrigin: `${SUN_X}px ${SUN_Y}px` }}>
                                    <circle cx={SUN_X} cy={SUN_Y} r={beltR} fill="none" stroke="#78716c" strokeWidth={7} strokeDasharray="1.5 11" opacity={0.5} />
                                    <circle cx={SUN_X} cy={SUN_Y} r={beltR + 9} fill="none" stroke="#57534e" strokeWidth={5} strokeDasharray="1.2 14" opacity={0.4} />
                                    <circle cx={SUN_X} cy={SUN_Y} r={beltR - 8} fill="none" stroke="#a8a29e" strokeWidth={4} strokeDasharray="1 17" opacity={0.35} />
                                </g>
                            );
                        })()}

                        {/* Star */}
                        <circle cx={SUN_X} cy={SUN_Y} r={190} fill="url(#sv-corona)" pointerEvents="none" />
                        <circle cx={SUN_X} cy={SUN_Y} r={78} fill="url(#sv-star)" className="sv-breathe" />

                        {/* Planets */}
                        {systemPlanets.map((p: any, i: number) => {
                            const { x, y } = planetPos(i);
                            const rad = planetRadius(p);
                            const surface = generateSurface(p.id, p.planetType, p.tags);
                            const [inner, outer] = ARCHETYPE_CORE[surface.archetype];
                            const isSelected = selectedId === p.id;
                            const owner = p.ownerId ? factionColor(p.ownerId) : '#475569';
                            const contested = !!p.siege;
                            const moonCount = String(p.planetType).toLowerCase().includes('moon') ? 0 : hashString(p.id + ':moons') % 3;
                            const hasStation = ((p.orbital?.slots ?? []) as any[]).some(sl => sl && sl.state !== 'destroyed');
                            return (
                                <g
                                    key={p.id}
                                    className="cursor-pointer"
                                    onClick={() => { if (!dragRef.current?.moved) selectPlanet(selectedId === p.id ? null : p.id); }}
                                >
                                    {/* Hit target */}
                                    <circle cx={x} cy={y} r={rad + 26} fill="transparent" />
                                    {isSelected && (
                                        <circle cx={x} cy={y} r={rad + 16} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="4 4" className="sv-spin" />
                                    )}
                                    {/* Ownership ring */}
                                    <circle cx={x} cy={y} r={rad + 6} fill="none" stroke={owner} strokeWidth={2.5} opacity={p.ownerId ? 0.85 : 0.35} />
                                    {/* World */}
                                    <circle
                                        cx={x} cy={y} r={rad}
                                        fill={`url(#sv-body-${p.id})`}
                                        stroke="#020617" strokeWidth={1.5}
                                    />
                                    <defs>
                                        <radialGradient id={`sv-body-${p.id}`} cx="35%" cy="32%">
                                            <stop offset="0%" stopColor={inner} />
                                            <stop offset="100%" stopColor={outer} />
                                        </radialGradient>
                                    </defs>
                                    {/* Terminator */}
                                    <circle cx={x} cy={y} r={rad} fill="url(#sv-limb)" pointerEvents="none" />
                                    {contested && (
                                        <circle cx={x} cy={y} r={rad + 12} fill="none" stroke="#ef4444" strokeWidth={2} className="sv-pulse" />
                                    )}
                                    <text
                                        x={x} y={y + rad + 26}
                                        textAnchor="middle" fontSize={15}
                                        fill={isSelected ? '#f8fafc' : '#94a3b8'}
                                        fontFamily="var(--font-display)"
                                        style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
                                        pointerEvents="none"
                                    >
                                        {p.name}
                                    </text>
                                    <text
                                        x={x} y={y + rad + 42}
                                        textAnchor="middle" fontSize={10}
                                        fill="#64748b" fontFamily="monospace"
                                        pointerEvents="none"
                                    >
                                        {ARCHETYPE_LABEL[surface.archetype]}
                                    </text>

                                    {/* Moons: tiny companions on their own slow orbits */}
                                    {Array.from({ length: moonCount }, (_, m) => (
                                        <g key={`moon-${m}`} className="sv-moon"
                                            style={{ transformOrigin: `${x}px ${y}px`, animationDuration: `${26 + m * 17}s`, animationDelay: `-${(hashString(p.id) % 20) + m * 7}s` }}>
                                            <circle cx={x + rad + 12 + m * 9} cy={y} r={3.2 - m} fill="#cbd5e1" stroke="#475569" strokeWidth={0.6} />
                                        </g>
                                    ))}

                                    {/* Orbital station, when the world has live orbital works */}
                                    {hasStation && (
                                        <g className="sv-moon" style={{ transformOrigin: `${x}px ${y}px`, animationDuration: '38s', animationDirection: 'reverse' }}>
                                            <g transform={`translate(${x - rad - 16}, ${y})`}>
                                                <rect x={-4} y={-1.6} width={8} height={3.2} fill="#94a3b8" />
                                                <rect x={-1.4} y={-4} width={2.8} height={8} fill="#64748b" />
                                                <circle r={1.3} fill="#38bdf8" className="sv-breathe" />
                                            </g>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        <defs>
                            <radialGradient id="sv-limb" cx="35%" cy="32%">
                                <stop offset="55%" stopColor="#000" stopOpacity={0} />
                                <stop offset="100%" stopColor="#000" stopOpacity={0.6} />
                            </radialGradient>
                        </defs>

                        {systemPlanets.length === 0 && (
                            <text x={VIEW / 2} y={SUN_Y} textAnchor="middle" fontSize={18} fill="#475569" fontFamily="var(--font-display)">
                                NO CHARTED WORLDS
                            </text>
                        )}

                        {/* Fleets present in-system — same triangles the galaxy
                            map shows, holding station off the star (orbit of a
                            specific world is client cosmetics, not sim state).
                            Click selects the fleet for move/engage orders. */}
                        {(() => {
                            const localFleets = (fleets as any[]).filter(f => f.currentSystemId === systemViewId);
                            if (!localFleets.length) return null;
                            const baseX = SUN_X + 150;
                            const baseY = SUN_Y - 170;
                            return localFleets.slice(0, 8).map((f: any, fi: number) => {
                                // Parked over a world: ride a tight ring around it (and move
                                // with it); otherwise hold station off the star. The old fixed
                                // slot put every fleet "a little too far" from anything.
                                const orbitIdx = f.orbitingPlanetId ? systemPlanets.findIndex((p: any) => p.id === f.orbitingPlanetId) : -1;
                                const orbitPos = orbitIdx >= 0 ? planetPos(orbitIdx) : null;
                                const orbitRing = orbitIdx >= 0 ? planetRadius(systemPlanets[orbitIdx]) + 30 : 0;
                                const orbitAngle = -0.95 + fi * 0.65;
                                // Lurking: ride the belt itself, tucked among the rocks.
                                const inBelt = f.stance === 'belt' && hasBelt;
                                const beltAngle = -1.15 + fi * 0.5;
                                const fx = inBelt ? SUN_X + beltRadius * Math.cos(beltAngle)
                                    : orbitPos ? orbitPos.x + orbitRing * Math.cos(orbitAngle) : baseX + (fi % 2) * 130;
                                const fy = inBelt ? SUN_Y + beltRadius * Math.sin(beltAngle)
                                    : orbitPos ? orbitPos.y + orbitRing * Math.sin(orbitAngle) : baseY - Math.floor(fi / 2) * 46;
                                const col = factionColor(f.factionId);
                                const mine = f.factionId === playerFactionId;
                                const isSel = selectedFleetId === f.id;
                                return (
                                    <g key={`fleet-${f.id}`} className="cursor-pointer"
                                        onClick={() => setSelectedFleetId(isSel ? null : f.id)}>
                                        {orbitPos && (
                                            <circle cx={orbitPos.x} cy={orbitPos.y} r={orbitRing} fill="none" stroke={col}
                                                strokeWidth={0.8} strokeDasharray="3 5" opacity={0.55} pointerEvents="none" />
                                        )}
                                        <circle cx={fx} cy={fy} r={22} fill="transparent" />
                                        {isSel && <circle cx={fx} cy={fy} r={16} fill="none" stroke="#ffffff" strokeWidth={1.2} strokeDasharray="3 4" className="sv-spin" />}
                                        <polygon
                                            points={`${fx},${fy - 9} ${fx - 8},${fy + 7} ${fx + 8},${fy + 7}`}
                                            fill={col}
                                            stroke="#020617"
                                            strokeWidth={1}
                                            opacity={mine ? 1 : 0.85}
                                        />
                                        {inBelt && (
                                            <circle cx={fx} cy={fy} r={15} fill="none" stroke="#a8a29e" strokeWidth={0.9} strokeDasharray="2 3" opacity={0.8} />
                                        )}
                                        <text x={fx + 14} y={fy + 4} fontSize={11}
                                            fill={mine ? '#e2e8f0' : '#94a3b8'} fontFamily="var(--font-display)"
                                            style={{ letterSpacing: '0.08em' }} pointerEvents="none">
                                            {f.name ?? f.id}{inBelt ? ' · lurking' : ''}
                                        </text>
                                    </g>
                                );
                            });
                        })()}

                        </g>{/* end camera */}

                        <style>{`
                            .sv-breathe { animation: sv-breathe 5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
                            @keyframes sv-breathe { 0%,100% { opacity: 0.92; } 50% { opacity: 1; } }
                            .sv-spin { transform-box: fill-box; transform-origin: center; animation: sv-spin 14s linear infinite; }
                            @keyframes sv-spin { to { transform: rotate(360deg); } }
                            .sv-pulse { transform-box: fill-box; transform-origin: center; animation: sv-pulse 1.8s ease-out infinite; }
                            @keyframes sv-pulse { 0% { transform: scale(0.92); opacity: 0.9; } 100% { transform: scale(1.25); opacity: 0; } }

                            /* Worlds move along their orbits from the JS clock (see
                               planetPosAt); only the small cosmetic satellites — moons,
                               stations, the belt — still spin with CSS. */
                            @keyframes sv-orbit { to { transform: rotate(360deg); } }
                            .sv-moon { animation: sv-orbit linear infinite; }
                            .sv-belt { animation: sv-orbit 480s linear infinite; }
                            @media (prefers-reduced-motion: reduce) {
                                .sv-moon, .sv-belt, .sv-breathe, .sv-spin, .sv-pulse { animation: none; }
                            }
                        `}</style>
                    </svg>
                </div>

                {/* Planet dossier */}
                {selected && (
                    <PlanetDossier
                        planet={selected}
                        factions={factions}
                        playerFactionId={playerFactionId}
                        onSurface={() => setSurfacePlanet(selected.id)}
                        onSystems={() => setConstructionPlanet(selected.id)}
                        onUnits={() => setSelectedPlanet(selected.id)}
                        orbit={orbitActionFor(selected)}
                        onClose={() => selectPlanet(null)}
                    />
                )}
            </div>

            <style jsx global>{`
                @keyframes systemRise {
                    from { transform: scale(0.9); opacity: 0; }
                    to   { transform: scale(1);   opacity: 1; }
                }
            `}</style>
        </div>
    );
}

// ─── Dossier ────────────────────────────────────────────────────────────────

interface DossierProps {
    planet: any;
    factions: Record<string, any>;
    playerFactionId: string | null;
    onSurface: () => void;
    onSystems: () => void;
    onUnits: () => void;
    /** Orbit action for the player's fleet, or null when they have none to send. */
    orbit?: { label: string; active: boolean; onClick: () => void } | null;
    onClose: () => void;
}

function Stat({ icon, label, value, tone = 'text-slate-200' }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900/80">
            <span className="flex items-center gap-2 text-[9px] font-display tracking-[0.18em] text-slate-500 uppercase">
                {icon}{label}
            </span>
            <span className={`text-[11px] font-mono font-bold ${tone}`}>{value}</span>
        </div>
    );
}

function PlanetDossier({ planet, factions, playerFactionId, onSurface, onSystems, onUnits, orbit, onClose }: DossierProps) {
    const surface = generateSurface(planet.id, planet.planetType, planet.tags);
    const [inner, outer] = ARCHETYPE_CORE[surface.archetype];
    const isOwner = planet.ownerId === playerFactionId;
    const ownerName = (factions[planet.ownerId] as any)?.name
        ?? (planet.ownerId ? String(planet.ownerId).replace(/^faction-/, '').replace(/[-_]/g, ' ') : 'Unclaimed');
    const developed = (planet.tiles ?? []).filter((t: any) => t.buildingId && t.constructionState !== 'empty').length;
    const queue: any[] = planet.buildQueue ?? [];
    const modifiers: any[] = (planet.activeModifiers ?? []).slice(0, 4);
    const nowSeconds = useUIStore(s => s.nowSeconds);
    // garrison.fortificationLevel is a 0-10 summary — halve it for a 5-star bar.
    const defenseStars = Math.max(0, Math.min(5, Math.round((planet.garrison?.fortificationLevel ?? 0) / 2)));
    const fmtEta = (sec: number) => {
        if (sec <= 0) return 'due';
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div
            className="w-80 border-l border-slate-800/60 bg-slate-950/85 backdrop-blur-md flex flex-col flex-shrink-0 absolute inset-y-0 right-0 xl:relative xl:inset-auto"
            style={{ animation: 'dossierSlide 0.18s ease-out' }}
        >
            <div className="flex items-start gap-3 p-3 border-b border-slate-800/60">
                <div
                    className="w-12 h-12 rounded-full flex-shrink-0 border border-white/15"
                    style={{ background: `radial-gradient(circle at 35% 32%, ${inner}, ${outer})` }}
                />
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-display tracking-[0.15em] text-slate-100 uppercase truncate">{planet.name}</div>
                    <div className="text-[8px] font-display tracking-[0.15em] text-slate-500 uppercase">
                        {ARCHETYPE_LABEL[surface.archetype]} {planet.planetType}
                    </div>
                    <div className="text-[8px] font-display tracking-[0.15em] uppercase mt-0.5" style={{ color: isOwner ? '#34d399' : '#94a3b8' }}>
                        {ownerName}
                    </div>
                </div>
                <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-white/10">
                    <X size={13} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <Stat icon={<Users size={10} />} label="Population" value={Math.floor(planet.population ?? 0).toLocaleString()} />
                <Stat icon={<Landmark size={10} />} label="Stability" value={formatPercent(planet.stability ?? 0, 3)} tone={(planet.stability ?? 0) > 50 ? 'text-emerald-400' : 'text-amber-400'} />
                <Stat icon={<Heart size={10} />} label="Support" value={formatPercent(planet.happiness ?? 0, 1)} tone="text-pink-400" />
                {(planet.unrest ?? 0) > 0 && (
                    <Stat icon={<AlertTriangle size={10} />} label="Unrest" value={formatPercent(planet.unrest, 1)} tone={(planet.unrest ?? 0) > 30 ? 'text-rose-400' : 'text-slate-300'} />
                )}
                <Stat icon={<Wrench size={10} />} label="Infrastructure" value={`Level ${planet.infrastructureLevel ?? 1}`} />
                <Stat icon={<ShieldCheck size={10} />} label="Defense" value={'★'.repeat(defenseStars) + '☆'.repeat(5 - defenseStars)} tone="text-amber-300" />
                <Stat icon={<Globe size={10} />} label="Developed" value={`${developed}/64 districts`} />
                {planet.specialization && <Stat icon={<Landmark size={10} />} label="Doctrine" value={String(planet.specialization).replace(/[-_]/g, ' ')} />}

                {/* Construction queue */}
                {queue.length > 0 && (
                    <div className="px-3 py-2 border-b border-slate-900/80">
                        <div className="flex items-center gap-2 text-[9px] font-display tracking-[0.18em] text-slate-500 uppercase mb-1.5">
                            <Hammer size={10} /> Construction Queue
                        </div>
                        <div className="space-y-1">
                            {queue.slice(0, 4).map((q: any, i: number) => {
                                const total = Math.max(1, (q.completesAtSeconds ?? 0) - (q.startedAtSeconds ?? 0));
                                const left = (q.completesAtSeconds ?? 0) - nowSeconds;
                                const pct = Math.max(0, Math.min(100, 100 - (left / total) * 100));
                                return (
                                    <div key={q.orderId ?? i}>
                                        <div className="flex justify-between text-[9px] text-slate-300">
                                            <span className="capitalize truncate">{String(q.buildingId).replace(/_/g, ' ')}</span>
                                            <span className="font-mono text-sky-400 flex-shrink-0">{fmtEta(left)}</span>
                                        </div>
                                        <div className="h-1 bg-slate-800 rounded overflow-hidden mt-0.5">
                                            <div className="h-full bg-sky-500/80" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                            {queue.length > 4 && <div className="text-[8px] text-slate-600">+{queue.length - 4} more…</div>}
                        </div>
                    </div>
                )}

                {/* Planet effects */}
                {modifiers.length > 0 && (
                    <div className="px-3 py-2 border-b border-slate-900/80">
                        <div className="text-[9px] font-display tracking-[0.18em] text-slate-500 uppercase mb-1.5">Planet Effects</div>
                        <div className="space-y-0.5">
                            {modifiers.map((m: any, i: number) => (
                                <div key={m.id ?? i} className="flex justify-between text-[8px] font-mono">
                                    <span className="text-slate-400 capitalize truncate">{String(m.type ?? m.source ?? '').replace(/[-_]/g, ' ')}</span>
                                    <span className={(m.value ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                        {(m.value ?? 0) >= 0 ? '+' : ''}{m.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {planet.siege && (
                    <div className="m-3 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 flex items-center gap-2 text-[9px] font-display tracking-widest text-red-300">
                        <Swords size={12} /> GROUND WAR IN PROGRESS
                    </div>
                )}
            </div>

            <div className="p-2 border-t border-slate-800/60 grid grid-cols-2 gap-1.5">
                {orbit && (
                    <button
                        onClick={orbit.onClick}
                        className={`col-span-2 flex items-center justify-center gap-2 py-2 rounded border text-[10px] font-display tracking-[0.15em] transition-all ${
                            orbit.active
                                ? 'border-indigo-400/70 bg-indigo-500/25 text-indigo-100 hover:bg-indigo-500/15'
                                : 'border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300'
                        }`}
                    >
                        <Crosshair size={12} /> {orbit.label}
                    </button>
                )}
                <button
                    onClick={onSurface}
                    className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-display tracking-[0.2em] transition-all"
                >
                    <Globe size={13} /> SURFACE
                </button>
                <button
                    onClick={onUnits}
                    className="flex items-center justify-center gap-1.5 py-2 rounded border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800/60 text-slate-300 text-[9px] font-display tracking-[0.15em] transition-all"
                >
                    <Crosshair size={11} /> UNITS
                </button>
                <button
                    onClick={onSystems}
                    disabled={!isOwner}
                    title="Planetary construction — buildings, orbital structures, infrastructure, logistics"
                    className="flex items-center justify-center gap-1.5 py-2 rounded border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-sky-300 text-[9px] font-display tracking-[0.15em] transition-all"
                >
                    <Hammer size={11} /> BUILD
                </button>
            </div>

            <style jsx global>{`
                @keyframes dossierSlide {
                    from { transform: translateX(24px); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
}
