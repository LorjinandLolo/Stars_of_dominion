"use client";

// components/planet/PlanetSurfaceView.tsx
// Layer 2 — the planet view. Clicking a planet dives into its living
// strategic board: 64 organic Voronoi districts. The world built in
// peacetime is the battlefield of the later ground-war system, so terrain,
// regions, buildings and infrastructure all live HERE, not in a spreadsheet.

import React from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { generateSurface } from '@/lib/planet-surface/generator';
import { computeSectorOccupancy, type SectorOccupant } from '@/lib/planet-surface/occupancy';
import { SURFACE_WEDGES } from '@/lib/planet-surface/types';
import { BUILDINGS } from '@/data/buildings';
import { computeSurfaceGeometry, computeCoastlines, glyphSizeForArea, pointInPolygon, BOARD_SIZE, CX, CY, PLANET_RADIUS } from './surfaceGeometry';
import { TERRAIN_META, ARCHETYPE_CORE, ARCHETYPE_LABEL } from './terrainMeta';
import SectorInspector from './SectorInspector';
import DistrictScenery from './DistrictScenery';
import BuildingMotif from './BuildingMotif';
import WarLayer from './WarLayer';
import WarHud from './WarHud';
import UnitPieces from './UnitPieces';
import { dispatchOrder } from '@/lib/multiplayer/order-client';
import { computeRoadNetwork, computeBridges } from './roadNetwork';
import { factionColor } from '@/components/galaxy/starVisuals';
import {
    X, Users, Landmark, Wrench, Heart, AlertTriangle, PanelsTopLeft,
} from 'lucide-react';

const BUILDING_BY_ID = new Map(BUILDINGS.map(b => [b.id, b]));

export default function PlanetSurfaceView() {
    const surfacePlanetId = useUIStore(s => s.surfacePlanetId);
    const setSurfacePlanet = useUIStore(s => s.setSurfacePlanet);
    const planets = useUIStore(s => s.planets);
    const factions = useUIStore(s => s.factions);
    const playerFactionId = useUIStore(s => s.playerFactionId);
    const setConstructionPlanet = useUIStore(s => s.setConstructionPlanet);
    const systemViewId = useUIStore(s => s.systemViewId);
    const armies = useUIStore(s => s.armies);

    const planet = planets.find((p: any) => p.id === surfacePlanetId);

    const [selectedSector, setSelectedSector] = React.useState<number | null>(null);
    const [hover, setHover] = React.useState<{ index: number; x: number; y: number } | null>(null);
    const [hoverRegion, setHoverRegion] = React.useState<string | null>(null);
    const [legendOpen, setLegendOpen] = React.useState(false);
    const [selectedFormations, setSelectedFormations] = React.useState<string[]>([]);
    const [redeployMode, setRedeployMode] = React.useState(false);
    /** Marquee drag-select: box corners in board coordinates. */
    const [marquee, setMarquee] = React.useState<{ from: [number, number]; to: [number, number]; add: boolean } | null>(null);
    const boardRef = React.useRef<SVGSVGElement | null>(null);

    /** Issues a march order to every selected formation. */
    const orderSelection = React.useCallback((sectorIndex: number, opts?: { queue?: boolean; redeploy?: boolean }) => {
        const forms = planet?.siege?.districts?.formations ?? [];
        for (const id of selectedFormations) {
            const f = forms.find((x: any) => x.id === id);
            if (!f || f.strength <= 0) continue;
            const verb = opts?.redeploy ? 'redeploys to' : opts?.queue ? 'routed via' : 'advances to';
            dispatchOrder({
                actionId: 'MIL_MOVE_FORMATION',
                factionId: playerFactionId || 'PLAYER_FACTION',
                payload: {
                    planetId: planet.id, formationId: f.id, sectorIndex,
                    queue: !!opts?.queue, redeploy: !!opts?.redeploy,
                },
                label: `${String(f.unitType).replace(/_/g, ' ')} ${verb} district ${sectorIndex}`,
            });
        }
        if (!opts?.queue) {
            setRedeployMode(false);
            setSelectedFormations([]);
        }
    }, [planet, selectedFormations, playerFactionId]);

    /** Screen point → board coordinates. */
    const toBoard = React.useCallback((clientX: number, clientY: number): [number, number] | null => {
        const svg = boardRef.current;
        const ctm = svg?.getScreenCTM();
        if (!svg || !ctm) return null;
        const p = svg.createSVGPoint();
        p.x = clientX; p.y = clientY;
        const q = p.matrixTransform(ctm.inverse());
        return [q.x, q.y];
    }, []);

    // B toggles strategic redeployment (HOI4). Esc clears the selection first.
    React.useEffect(() => {
        if (!planet?.siege) return;
        const onKey = (e: KeyboardEvent) => {
            const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
            if (typing) return;
            if (e.key === 'b' || e.key === 'B') {
                e.preventDefault();
                setRedeployMode(m => !m);
            } else if (e.key === 'Escape' && (selectedFormations.length || redeployMode)) {
                e.preventDefault();
                setRedeployMode(false);
                setSelectedFormations([]);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [planet?.siege, selectedFormations.length, redeployMode]);

    // Board disappears with the planet (e.g. stale id after a sync purge).
    React.useEffect(() => {
        if (surfacePlanetId && !planet) setSurfacePlanet(null);
    }, [surfacePlanetId, planet, setSurfacePlanet]);

    // Esc returns to the galaxy — but only when no workspace is open on top
    // (CommandWorkspace owns Esc while a dock panel is expanded). Mirror the
    // selection in a ref so the handler never writes one store inside another
    // setState updater (React forbids updates during render).
    const selectedSectorRef = React.useRef<number | null>(null);
    React.useEffect(() => { selectedSectorRef.current = selectedSector; }, [selectedSector]);
    React.useEffect(() => {
        if (!surfacePlanetId) return;
        const onKey = (e: KeyboardEvent) => {
            // `defaultPrevented` = a higher layer (modal, dock workspace)
            // already consumed this keystroke; regardless of listener
            // registration order, we must not also act on it.
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            if (useUIStore.getState().activeTab !== 'galaxy') return;
            e.preventDefault();
            if (selectedSectorRef.current !== null) {
                setSelectedSector(null);   // first Esc: drop selection
            } else {
                setSurfacePlanet(null);    // second Esc: leave the planet
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [surfacePlanetId, setSurfacePlanet]);

    // Reset transient state when switching planets.
    React.useEffect(() => {
        setSelectedSector(null);
        setHover(null);
        setHoverRegion(null);
    }, [surfacePlanetId]);

    const tagKey = (planet?.tags ?? []).join(',');
    const surface = React.useMemo(
        () => planet ? generateSurface(planet.id, planet.planetType, planet.tags) : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [planet?.id, planet?.planetType, tagKey]
    );
    const occupancy = React.useMemo(
        () => (planet && surface) ? computeSectorOccupancy(planet, surface) : new Map<number, SectorOccupant>(),
        [planet, surface]
    );
    const geo = React.useMemo(() => surface ? computeSurfaceGeometry(surface) : null, [surface]);

    // Marquee drag-select: box the formations you want, then command them all.
    React.useEffect(() => {
        if (!marquee) return;
        const move = (e: PointerEvent) => {
            const pt = toBoard(e.clientX, e.clientY);
            if (pt) setMarquee(m => (m ? { ...m, to: pt } : m));
        };
        const up = () => {
            setMarquee(null);
            const forms = planet?.siege?.districts?.formations;
            if (!forms || !geo) return;
            const side = planet.siege.attackerEmpireId === playerFactionId ? 'attacker'
                : planet.siege.defenderEmpireId === playerFactionId ? 'defender' : null;
            if (!side) return;
            const x0 = Math.min(marquee.from[0], marquee.to[0]);
            const x1 = Math.max(marquee.from[0], marquee.to[0]);
            const y0 = Math.min(marquee.from[1], marquee.to[1]);
            const y1 = Math.max(marquee.from[1], marquee.to[1]);
            // Too small to be a deliberate box — treat it as a click.
            if (Math.hypot(x1 - x0, y1 - y0) < 12) return;
            const boxed = forms
                .filter((f: any) => f.side === side && f.strength > 0)
                .filter((f: any) => {
                    const c = geo.centroids[f.sectorIndex];
                    return c && c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1;
                })
                .map((f: any) => f.id);
            setSelectedFormations(prev => marquee.add
                ? Array.from(new Set([...prev, ...boxed]))
                : boxed);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [marquee, toBoard, planet, geo, playerFactionId]);
    const roads = React.useMemo(
        () => (surface && geo)
            ? computeRoadNetwork(surface, geo, occupancy, id => BUILDING_BY_ID.get(id)?.category)
            : [],
        [surface, geo, occupancy]
    );
    const coastlines = React.useMemo(
        () => (surface && geo)
            ? computeCoastlines(geo, i => surface.sectors[i].terrain === 'ocean')
            : [],
        [surface, geo]
    );
    const bridges = React.useMemo(() => computeBridges(roads), [roads]);
    /**
     * Route segments touching each district, so nothing is ever built on top
     * of a road, rail or supply line. Power lines are aerial — pylons don't
     * clear ground, so they are excluded.
     */
    const routesBySector = React.useMemo(() => {
        const m = new Map<number, Array<[[number, number], [number, number]]>>();
        for (const e of roads) {
            if (e.kind === 'power') continue;
            for (const idx of [e.a, e.b]) {
                const list = m.get(idx) ?? [];
                list.push([e.from as [number, number], e.to as [number, number]]);
                m.set(idx, list);
            }
        }
        return m;
    }, [roads]);
    // Bearing of the first ground route touching each district — urban main
    // streets align to it so local streets continue the highway.
    const bearingBySector = React.useMemo(() => {
        const m = new Map<number, number>();
        for (const e of roads) {
            if (e.kind === 'power') continue;
            const ang = Math.atan2(e.to[1] - e.from[1], e.to[0] - e.from[0]);
            if (!m.has(e.a)) m.set(e.a, ang);
            if (!m.has(e.b)) m.set(e.b, ang);
        }
        return m;
    }, [roads]);

    if (!surfacePlanetId || !planet || !surface || !geo) return null;

    const isOwner = planet.ownerId === playerFactionId;
    const ownerFaction = factions[planet.ownerId];
    const regionById = new Map(surface.regions.map(r => [r.id, r]));
    const [coreInner, coreOuter] = ARCHETYPE_CORE[surface.archetype];
    const selected = selectedSector !== null ? surface.sectors[selectedSector] : null;
    const developedCount = occupancy.size;

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-[radial-gradient(ellipse_at_center,_#0b1120_0%,_#020617_85%)]"
            style={{ animation: 'planetRise 0.35s ease-out' }}
        >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="w-8 h-8 rounded-full flex-shrink-0 border border-white/20"
                        style={{ background: `radial-gradient(circle at 35% 35%, ${coreInner}, ${coreOuter})` }}
                    />
                    <div className="min-w-0">
                        <div className="text-[13px] font-display tracking-[0.2em] text-slate-100 uppercase truncate">{planet.name}</div>
                        <div className="text-[8px] font-display tracking-[0.15em] text-slate-500 uppercase">
                            {ARCHETYPE_LABEL[surface.archetype]} · {planet.planetType} · {(ownerFaction as any)?.name ?? planet.ownerId?.replace(/^faction-/, '') ?? 'Unclaimed'}
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-4 text-[9px] font-mono">
                    <span className="flex items-center gap-1 text-slate-300" title="Population">
                        <Users size={11} className="text-slate-500" />{Math.floor(planet.population ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400" title="Stability">
                        <Landmark size={11} />{planet.stability ?? 0}%
                    </span>
                    <span className="flex items-center gap-1 text-pink-400" title="Happiness">
                        <Heart size={11} />{planet.happiness ?? 0}%
                    </span>
                    {(planet.unrest ?? 0) > 20 && (
                        <span className="flex items-center gap-1 text-amber-400 animate-pulse" title="Unrest">
                            <AlertTriangle size={11} />{planet.unrest}%
                        </span>
                    )}
                    <span className="text-slate-500" title="Developed sectors">{developedCount}/64 developed</span>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setLegendOpen(o => !o)}
                        className="lg:hidden p-2 text-slate-400 hover:text-white rounded hover:bg-white/10"
                        title="Regions"
                    >
                        <PanelsTopLeft size={15} />
                    </button>
                    {isOwner && (
                        <button
                            onClick={() => setConstructionPlanet(planet.id)}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-[9px] font-display tracking-[0.15em] transition-all"
                            title="Orbital, infrastructure and logistics management"
                        >
                            <Wrench size={11} /> SYSTEMS
                        </button>
                    )}
                    <button
                        onClick={() => setSurfacePlanet(null)}
                        className="p-2 text-slate-400 hover:text-red-300 rounded hover:bg-red-500/10"
                        title={systemViewId ? 'Back to the system (Esc)' : 'Return to galaxy (Esc)'}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* ── Body: legend | board | inspector ───────────────────────── */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Region legend */}
                <div className={[
                    'flex-col w-56 border-r border-slate-800/60 bg-slate-950/60 backdrop-blur-sm overflow-y-auto flex-shrink-0 z-10',
                    legendOpen ? 'flex absolute inset-y-0 left-0' : 'hidden lg:flex',
                ].join(' ')}>
                    <div className="px-3 py-2 text-[8px] font-display tracking-[0.25em] text-slate-500 uppercase border-b border-slate-800/40">
                        Regions · {surface.regions.length}
                    </div>
                    {surface.regions.map(region => (
                        <button
                            key={region.id}
                            onMouseEnter={() => setHoverRegion(region.id)}
                            onMouseLeave={() => setHoverRegion(null)}
                            onClick={() => {
                                const first = region.sectorIndexes[0];
                                setSelectedSector(cur => cur !== null && region.sectorIndexes.includes(cur) ? cur : first);
                            }}
                            className={[
                                'text-left px-3 py-2 border-b border-slate-900/80 transition-colors',
                                hoverRegion === region.id ? 'bg-slate-800/50' : 'hover:bg-slate-900/60',
                            ].join(' ')}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: region.color }} />
                                <span className="text-[9px] font-display tracking-wider text-slate-200 truncate">{region.name}</span>
                            </div>
                            <div className="text-[7px] text-slate-500 mt-0.5 ml-3.5">
                                {region.sectorIndexes.length} sectors · {region.socialGroups.map(g => g.name).join(' · ')}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Board — while a ground war is on, leave room for the command
                    bar so the southern hemisphere is never hidden behind it. */}
                <div
                    className="flex-1 flex items-center justify-center overflow-hidden p-2"
                    style={planet.siege ? { paddingBottom: 172 } : undefined}
                >
                    <svg
                        ref={boardRef}
                        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
                        className="w-full h-full max-w-[92vmin] max-h-[92vmin]"
                        onMouseLeave={() => setHover(null)}
                        // Right-click is a game order, not a browser menu: it
                        // marches the selection to whatever district is under
                        // the cursor (shift queues it as a waypoint).
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (!selectedFormations.length) return;
                            const pt = toBoard(e.clientX, e.clientY);
                            if (!pt || !geo) return;
                            const idx = geo.polygons.findIndex(poly => poly.length >= 3 && pointInPolygon(pt, poly));
                            if (idx < 0) return;
                            orderSelection(idx, redeployMode ? { redeploy: true } : { queue: e.shiftKey });
                        }}
                        onPointerDown={(e) => {
                            // Left-drag across open ground boxes up formations.
                            // Dragging a piece is a move order, so pieces opt out.
                            if (e.button !== 0 || !planet.siege?.districts?.formations?.length) return;
                            const onPiece = (e.target as Element).closest?.('.cursor-grab, .cursor-grabbing');
                            if (onPiece) return;
                            const pt = toBoard(e.clientX, e.clientY);
                            if (pt) setMarquee({ from: pt, to: pt, add: e.shiftKey || e.ctrlKey || e.metaKey });
                        }}
                    >
                        <defs>
                            {/* Base tint of the world beneath the districts */}
                            <radialGradient id="ps-shade" cx="35%" cy="30%">
                                <stop offset="0%" stopColor={coreInner} stopOpacity={0.45} />
                                <stop offset="100%" stopColor={coreOuter} stopOpacity={0.75} />
                            </radialGradient>
                            {/* Limb darkening — sells the sphere without hiding terrain */}
                            <radialGradient id="ps-limb" cx="38%" cy="32%">
                                <stop offset="55%" stopColor="#000000" stopOpacity={0} />
                                <stop offset="88%" stopColor="#000000" stopOpacity={0.22} />
                                <stop offset="100%" stopColor="#000000" stopOpacity={0.55} />
                            </radialGradient>
                            {/* Everything animated (clouds) stays inside the silhouette */}
                            <clipPath id="ps-clip">
                                <circle cx={CX} cy={CY} r={PLANET_RADIUS} />
                            </clipPath>
                        </defs>

                        {/* Planet silhouette: ocean floor beneath the districts */}
                        <circle cx={CX} cy={CY} r={PLANET_RADIUS} fill="#082f49" />
                        <circle cx={CX} cy={CY} r={PLANET_RADIUS} fill="url(#ps-shade)" />

                        {/* Everything on the surface stays inside the silhouette */}
                        <g clipPath="url(#ps-clip)">
                        {/* Districts: terrain fill + scenery (interactive layer) */}
                        {surface.sectors.map(sec => {
                            const meta = TERRAIN_META[sec.terrain];
                            const region = regionById.get(sec.regionId);
                            const isSelected = selectedSector === sec.index;
                            const isHovered = hover?.index === sec.index;
                            const dimmed = hoverRegion !== null && sec.regionId !== hoverRegion;
                            return (
                                <g key={sec.index}>
                                    <path
                                        d={geo.paths[sec.index]}
                                        fill={meta.color}
                                        fillOpacity={dimmed ? 0.1 : isSelected ? 0.62 : isHovered ? 0.52 : 0.42}
                                        stroke={isSelected ? '#ffffff' : region?.color ?? '#0f172a'}
                                        strokeOpacity={isSelected ? 0.95 : dimmed ? 0.08 : 0.32}
                                        strokeWidth={isSelected ? 3 : 1}
                                        className="cursor-pointer transition-[fill-opacity,stroke-opacity] duration-150"
                                        onClick={() => setSelectedSector(cur => cur === sec.index ? null : sec.index)}
                                        onMouseEnter={(e) => setHover({ index: sec.index, x: e.clientX, y: e.clientY })}
                                    />
                                    <DistrictScenery
                                        terrain={sec.terrain}
                                        polygon={geo.polygons[sec.index]}
                                        seedKey={`${surface.planetId}:${sec.index}`}
                                        scale={Math.sqrt(geo.areas[sec.index])}
                                        dimmed={dimmed}
                                        ring={sec.ring}
                                        capital={sec.regionId === 'region-capital'}
                                        roadBearing={bearingBySector.get(sec.index) ?? null}
                                        routes={routesBySector.get(sec.index)}
                                        keepOut={occupancy.has(sec.index) ? {
                                            x: geo.centroids[sec.index][0],
                                            y: geo.centroids[sec.index][1],
                                            // Clear the whole installation footprint, not just its icon.
                                            r: glyphSizeForArea(geo.areas[sec.index]) * 2.6,
                                        } : null}
                                    />
                                </g>
                            );
                        })}

                        {/* Coastlines: golden shore where land meets sea */}
                        <g pointerEvents="none">
                            {coastlines.map(seg => (
                                <line
                                    key={seg.key}
                                    x1={seg.a[0]} y1={seg.a[1]} x2={seg.b[0]} y2={seg.b[1]}
                                    stroke="#fbbf24" strokeWidth={2.4} strokeLinecap="round" opacity={0.6}
                                />
                            ))}
                        </g>

                        {/* Infrastructure: roads / rails / animated supply routes */}
                        <g pointerEvents="none">
                            {roads.map(edge => {
                                // A route ends AT an installation, never through
                                // it: trim each end back to the building's
                                // footprint so the depot is the terminus.
                                const pad = (idx: number) =>
                                    occupancy.has(idx) ? glyphSizeForArea(geo.areas[idx]) * 1.15 : 0;
                                const trim = (p: [number, number], toward: [number, number], by: number): [number, number] => {
                                    if (by <= 0) return p;
                                    const dx = toward[0] - p[0], dy = toward[1] - p[1];
                                    const len = Math.hypot(dx, dy) || 1;
                                    const k = Math.min(by, len * 0.42) / len;
                                    return [p[0] + dx * k, p[1] + dy * k];
                                };
                                const from = trim(edge.from as [number, number], edge.mid as [number, number], pad(edge.a));
                                const to = trim(edge.to as [number, number], edge.mid as [number, number], pad(edge.b));
                                const d = `M ${from[0].toFixed(1)} ${from[1].toFixed(1)} Q ${edge.mid[0].toFixed(1)} ${edge.mid[1].toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
                                return (
                                    <g key={edge.key}>
                                        {edge.kind !== 'power' && (
                                            <path d={d} fill="none" stroke="#0f172a" strokeWidth={edge.kind === 'road' ? 4 : 4.6} strokeLinecap="round" opacity={0.55} />
                                        )}
                                        {edge.kind === 'road' && (
                                            <>
                                                <path d={d} fill="none" stroke="#d6c9a5" strokeWidth={2.6} strokeLinecap="round" opacity={0.8} />
                                                <path d={d} fill="none" stroke="#f8fafc" strokeWidth={0.6} strokeDasharray="4 5" strokeLinecap="round" opacity={0.7} />
                                            </>
                                        )}
                                        {edge.kind === 'rail' && (
                                            <>
                                                {/* sleepers: short wide dashes under the rail line */}
                                                <path d={d} fill="none" stroke="#d6d3d1" strokeWidth={3.6} strokeDasharray="1.4 5.2" opacity={0.75} />
                                                <path d={d} fill="none" stroke="#64748b" strokeWidth={1.4} strokeLinecap="round" opacity={0.95} />
                                            </>
                                        )}
                                        {edge.kind === 'supply' && (
                                            <path d={d} fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="7 6" strokeLinecap="round" opacity={0.85} className="ps-supply" />
                                        )}
                                        {edge.kind === 'power' && (() => {
                                            // Thin line + pylon crossbars at thirds
                                            const px = (t: number) => edge.from[0] + (edge.to[0] - edge.from[0]) * t;
                                            const py = (t: number) => edge.from[1] + (edge.to[1] - edge.from[1]) * t;
                                            return (
                                                <g>
                                                    <line x1={edge.from[0]} y1={edge.from[1]} x2={edge.to[0]} y2={edge.to[1]}
                                                        stroke="#fde047" strokeWidth={0.9} opacity={0.45} />
                                                    {[0.33, 0.66].map(t => (
                                                        <g key={t}>
                                                            <line x1={px(t)} y1={py(t) + 4} x2={px(t)} y2={py(t) - 5} stroke="#fde047" strokeWidth={1} opacity={0.6} />
                                                            <line x1={px(t) - 3} y1={py(t) - 3.5} x2={px(t) + 3} y2={py(t) - 3.5} stroke="#fde047" strokeWidth={1} opacity={0.6} />
                                                        </g>
                                                    ))}
                                                </g>
                                            );
                                        })()}
                                    </g>
                                );
                            })}

                            {/* Overpasses where ground routes cross */}
                            {bridges.map(br => {
                                const deg = (br.angle * 180) / Math.PI;
                                return (
                                    <g key={br.key} transform={`translate(${br.x.toFixed(1)}, ${br.y.toFixed(1)}) rotate(${deg.toFixed(1)})`}>
                                        {/* abutments */}
                                        <rect x={-9} y={-4.4} width={2.4} height={8.8} fill="#0f172a" opacity={0.85} rx={0.6} />
                                        <rect x={6.6} y={-4.4} width={2.4} height={8.8} fill="#0f172a" opacity={0.85} rx={0.6} />
                                        {/* deck with guard rails */}
                                        <rect x={-8} y={-3.2} width={16} height={6.4} fill="#0f172a" opacity={0.9} rx={1} />
                                        <rect x={-8} y={-2} width={16} height={4} fill="#d6c9a5" rx={0.8} />
                                        <line x1={-8} y1={-2.6} x2={8} y2={-2.6} stroke="#f8fafc" strokeWidth={0.7} opacity={0.8} />
                                        <line x1={-8} y1={2.6} x2={8} y2={2.6} stroke="#f8fafc" strokeWidth={0.7} opacity={0.8} />
                                    </g>
                                );
                            })}
                        </g>

                        {/* Developments + markers */}
                        {surface.sectors.map(sec => {
                            const occ = occupancy.get(sec.index) ?? null;
                            const dimmed = hoverRegion !== null && sec.regionId !== hoverRegion;
                            const [cxp, cyp] = geo.centroids[sec.index];
                            if (!occ) {
                                return sec.chokepoint ? (
                                    <circle key={`m-${sec.index}`} cx={cxp} cy={cyp} r={3.5} fill="#fbbf24" opacity={dimmed ? 0.15 : 0.75} pointerEvents="none" />
                                ) : null;
                            }
                            const def = BUILDING_BY_ID.get(occ.buildingId);
                            return (
                                <BuildingMotif
                                    key={`m-${sec.index}`}
                                    category={def?.category ?? 'industrial'}
                                    buildingId={occ.buildingId}
                                    occupant={occ}
                                    cx={cxp}
                                    cy={cyp}
                                    scale={Math.sqrt(geo.areas[sec.index])}
                                    dimmed={dimmed}
                                />
                            );
                        })}

                        {/* The ground war: territory, front line, beachheads */}
                        {planet.siege?.districts && (
                            <WarLayer
                                surface={surface}
                                geo={geo}
                                war={planet.siege.districts}
                                attackerColor={factionColor(planet.siege.attackerEmpireId)}
                                defenderColor={factionColor(planet.siege.defenderEmpireId)}
                                playerIsAttacker={planet.siege.attackerEmpireId === playerFactionId}
                            />
                        )}

                        {/* The pieces: formations standing on the districts */}
                        {planet.siege?.districts?.formations?.length > 0 && (
                            <UnitPieces
                                surface={surface}
                                geo={geo}
                                war={planet.siege.districts}
                                formations={planet.siege.districts.formations}
                                playerSide={
                                    planet.siege.attackerEmpireId === playerFactionId ? 'attacker'
                                    : planet.siege.defenderEmpireId === playerFactionId ? 'defender'
                                    : null
                                }
                                attackerColor={factionColor(planet.siege.attackerEmpireId)}
                                defenderColor={factionColor(planet.siege.defenderEmpireId)}
                                selectedIds={selectedFormations}
                                onSelectionChange={setSelectedFormations}
                                redeployMode={redeployMode}
                                onOrderMove={(formation, sectorIndex, opts) => {
                                    const verb = opts?.redeploy ? 'redeploys to'
                                        : opts?.queue ? 'routed via' : 'advances to';
                                    dispatchOrder({
                                        actionId: 'MIL_MOVE_FORMATION',
                                        factionId: playerFactionId || 'PLAYER_FACTION',
                                        payload: {
                                            planetId: planet.id, formationId: formation.id, sectorIndex,
                                            queue: !!opts?.queue, redeploy: !!opts?.redeploy,
                                        },
                                        label: `${formation.unitType.replace(/_/g, ' ')} ${verb} district ${sectorIndex}`,
                                    });
                                    // A queued waypoint keeps the selection so a
                                    // whole path can be laid down in one go.
                                    if (!opts?.queue) {
                                        setRedeployMode(false);
                                        setSelectedFormations([]);
                                    }
                                }}
                            />
                        )}

                        {/* Marquee: the selection box being dragged */}
                        {marquee && (() => {
                            const x = Math.min(marquee.from[0], marquee.to[0]);
                            const y = Math.min(marquee.from[1], marquee.to[1]);
                            const w = Math.abs(marquee.to[0] - marquee.from[0]);
                            const h = Math.abs(marquee.to[1] - marquee.from[1]);
                            if (w < 2 && h < 2) return null;
                            return (
                                <g pointerEvents="none">
                                    <rect x={x} y={y} width={w} height={h}
                                        fill="#38bdf8" fillOpacity={0.12}
                                        stroke="#7dd3fc" strokeWidth={1.6} strokeDasharray="7 4" className="ps-marquee" />
                                </g>
                            );
                        })()}

                        {/* Military presence: garrison + landed armies at the capital core */}
                        {(() => {
                            const troops = planet.garrison?.troopCount ?? 0;
                            const landed = armies.filter((a: any) => a.currentPlanetId === planet.id).length;
                            if (troops <= 0 && landed <= 0) return null;
                            const [gx, gy] = geo.centroids[0];
                            return (
                                <g pointerEvents="none">
                                    <circle cx={gx + 16} cy={gy - 16} r={11} fill="#020617" fillOpacity={0.8} stroke="#f87171" strokeWidth={1.2} />
                                    <text x={gx + 16} y={gy - 12.5} textAnchor="middle" fontSize={9} fill="#fca5a5" fontFamily="monospace" fontWeight="bold">
                                        {landed > 0 ? `⚔${landed}` : '🛡'}
                                    </text>
                                </g>
                            );
                        })()}

                        </g>

                        {/* Ground war: the world itself is under attack */}
                        {planet.siege && (
                            <circle
                                cx={CX} cy={CY} r={PLANET_RADIUS + 14}
                                fill="none" stroke="#ef4444" strokeWidth={2.5}
                                strokeDasharray="18 12" className="ps-siege" opacity={0.7}
                            />
                        )}

                        {/* Drifting cloud shadows — the planet breathes */}
                        <g clipPath="url(#ps-clip)" pointerEvents="none" className="ps-clouds">
                            <ellipse cx={CX - 160} cy={CY - 120} rx={150} ry={54} fill="#e2e8f0" opacity={0.07} className="ps-cloud-a" />
                            <ellipse cx={CX + 60} cy={CY + 170} rx={190} ry={62} fill="#e2e8f0" opacity={0.06} className="ps-cloud-b" />
                            <ellipse cx={CX + 210} cy={CY - 60} rx={120} ry={44} fill="#e2e8f0" opacity={0.05} className="ps-cloud-c" />
                        </g>

                        {/* Planetary rim: atmosphere ring + terminator shading */}
                        <circle cx={CX} cy={CY} r={PLANET_RADIUS} fill="none" stroke="#0ea5e9" strokeWidth={2.5} opacity={0.45} />
                        <circle cx={CX} cy={CY} r={PLANET_RADIUS + 7} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.18} />
                        <circle cx={CX} cy={CY} r={PLANET_RADIUS} fill="url(#ps-limb)" pointerEvents="none" />

                        {/* Compass */}
                        {Array.from({ length: SURFACE_WEDGES }, (_, w) => {
                            const label = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][w];
                            const ang = (-90 + w * 45) * Math.PI / 180;
                            const r = PLANET_RADIUS + 24;
                            return (
                                <text
                                    key={w}
                                    x={CX + r * Math.cos(ang)}
                                    y={CY + r * Math.sin(ang) + 4}
                                    textAnchor="middle"
                                    fontSize={13}
                                    fill="#475569"
                                    fontFamily="var(--font-display)"
                                    pointerEvents="none"
                                >
                                    {label}
                                </text>
                            );
                        })}

                        <style>{`
                            /* Infrastructure flow */
                            .ps-supply { animation: ps-supply 1.2s linear infinite; }
                            @keyframes ps-supply { to { stroke-dashoffset: -13; } }

                            /* Siege ring crawls around the world */
                            .ps-siege { transform-box: fill-box; transform-origin: center; animation: ps-siege 40s linear infinite; }
                            @keyframes ps-siege { to { transform: rotate(360deg); } }

                            /* Cloud shadows drift slowly across the disc */
                            .ps-cloud-a { animation: ps-drift-a 90s linear infinite alternate; }
                            .ps-cloud-b { animation: ps-drift-b 120s linear infinite alternate; }
                            .ps-cloud-c { animation: ps-drift-c 75s linear infinite alternate; }
                            @keyframes ps-drift-a { from { transform: translate(-60px, 10px); } to { transform: translate(340px, -30px); } }
                            @keyframes ps-drift-b { from { transform: translate(40px, -20px); } to { transform: translate(-320px, 30px); } }
                            @keyframes ps-drift-c { from { transform: translate(-30px, 40px); } to { transform: translate(220px, -50px); } }

                            /* Building life: smoke, lights, glows, windmills, scaffolds */
                            .bm-smoke { animation: bm-smoke 3.4s ease-out infinite; }
                            @keyframes bm-smoke {
                                0%   { transform: translateY(0);     opacity: 0.7; }
                                100% { transform: translateY(-14px); opacity: 0; }
                            }
                            .bm-twinkle { animation: bm-twinkle 2.6s ease-in-out infinite; }
                            @keyframes bm-twinkle { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
                            .bm-glow { animation: bm-glow 2.8s ease-in-out infinite; }
                            @keyframes bm-glow { 0%,100% { opacity: 0.95; } 50% { opacity: 0.45; } }
                            .bm-spin { animation: bm-spin 5s linear infinite; }
                            @keyframes bm-spin { to { transform: rotate(360deg); } }
                            .bm-scaffold { animation: bm-scaffold 1.6s linear infinite; }
                            @keyframes bm-scaffold { to { stroke-dashoffset: -9; } }
                            .bm-radar { animation: bm-radar 4s linear infinite; }
                            @keyframes bm-radar { to { transform: rotate(360deg); } }
                            .ps-marquee { animation: ps-marquee 0.9s linear infinite; }
                            @keyframes ps-marquee { to { stroke-dashoffset: -11; } }

                            @media (prefers-reduced-motion: reduce) {
                                .ps-supply, .ps-siege, .ps-cloud-a, .ps-cloud-b, .ps-cloud-c,
                                .bm-smoke, .bm-twinkle, .bm-glow, .bm-spin, .bm-scaffold, .bm-radar { animation: none; }
                            }
                        `}</style>
                    </svg>
                </div>

                {/* Ground-war command bar */}
                {planet.siege && (
                    <WarHud
                        planet={planet}
                        surface={surface}
                        selectedFormations={selectedFormations}
                        redeployMode={redeployMode}
                    />
                )}

                {/* Inspector */}
                {selected && (
                    <div className="w-72 border-l border-slate-800/60 bg-slate-950/80 backdrop-blur-md flex-shrink-0 z-10 absolute inset-y-0 right-0 xl:relative xl:inset-auto" style={{ animation: 'inspectorSlide 0.18s ease-out' }}>
                        <SectorInspector
                            planet={planet}
                            surface={surface}
                            sector={selected}
                            occupant={occupancy.get(selected.index) ?? null}
                            onClose={() => setSelectedSector(null)}
                        />
                    </div>
                )}
            </div>

            {/* Hover tooltip */}
            {hover && hover.index !== selectedSector && (() => {
                const sec = surface.sectors[hover.index];
                const occ = occupancy.get(sec.index);
                const meta = TERRAIN_META[sec.terrain];
                const region = regionById.get(sec.regionId);
                const def = occ ? BUILDING_BY_ID.get(occ.buildingId) : null;
                return (
                    <div
                        className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded border border-slate-700/80 bg-slate-950/95 shadow-xl"
                        style={{ left: Math.min(hover.x + 14, window.innerWidth - 190), top: hover.y + 14 }}
                    >
                        <div className="text-[9px] font-display tracking-wider uppercase" style={{ color: meta.color }}>
                            {meta.label}{sec.chokepoint ? ' · chokepoint' : ''}
                        </div>
                        <div className="text-[8px] text-slate-400">{region?.name}</div>
                        {def && <div className="text-[8px] text-slate-200 mt-0.5">{def.name}{occ!.state !== 'active' ? ` (${occ!.state.replace('_', ' ')})` : ''}</div>}
                    </div>
                );
            })()}

            <style jsx global>{`
                @keyframes planetRise {
                    from { transform: scale(0.55); opacity: 0; }
                    to   { transform: scale(1);    opacity: 1; }
                }
                @keyframes inspectorSlide {
                    from { transform: translateX(20px); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>
        </div>
    );
}
