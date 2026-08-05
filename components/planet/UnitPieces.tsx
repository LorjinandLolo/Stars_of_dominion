"use client";

// components/planet/UnitPieces.tsx
// The pieces on the planetary board. Each formation is a token standing in a
// district: click yours to select it, and the districts it can reach light up.
// Click one of those to order the march — orders resolve simultaneously on the
// next cycle, so both sides commit blind.

import React from 'react';
import type { PlanetSurface } from '@/lib/planet-surface/types';
import type { DistrictWarState, GroundUnitType } from '@/lib/combat/siege/siege-types';
import type { Formation, FormationSide } from '@/lib/combat/siege/formations';
import { legalMoves } from '@/lib/combat/siege/formations';
import { controllerOf } from '@/lib/combat/siege/district-front';
import { pointInPolygon, type SurfaceGeometry, type Pt } from './surfaceGeometry';

interface UnitPiecesProps {
    surface: PlanetSurface;
    geo: SurfaceGeometry;
    war: DistrictWarState;
    formations: Formation[];
    /** Which side the viewing player commands, if any. */
    playerSide: FormationSide | null;
    attackerColor: string;
    defenderColor: string;
    /** HOI4-style multi-selection. */
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
    /** queue = append a waypoint; redeploy = strategic rail move. */
    onOrderMove: (formation: Formation, sectorIndex: number, opts?: { queue?: boolean; redeploy?: boolean }) => void;
    /** True while the player is in strategic-redeployment mode (B). */
    redeployMode: boolean;
}

/** NATO-ish silhouettes: readable at a glance, identifiable at small size. */
function UnitGlyph({ type, size, color }: { type: GroundUnitType; size: number; color: string }) {
    const s = size;
    switch (type) {
        case 'INFANTRY': // crossed straps
            return <path d={`M ${-s} ${-s * 0.6} L ${s} ${s * 0.6} M ${s} ${-s * 0.6} L ${-s} ${s * 0.6}`} stroke={color} strokeWidth={s * 0.3} fill="none" />;
        case 'ARMOR': // tracked oval
            return <ellipse rx={s * 0.95} ry={s * 0.55} fill="none" stroke={color} strokeWidth={s * 0.32} />;
        case 'ANTI_ARMOR': // oval with a bar through it
            return (
                <g>
                    <ellipse rx={s * 0.9} ry={s * 0.5} fill="none" stroke={color} strokeWidth={s * 0.26} />
                    <path d={`M ${-s} ${s * 0.7} L ${s} ${-s * 0.7}`} stroke={color} strokeWidth={s * 0.3} />
                </g>
            );
        case 'ARTILLERY': // the gunner's dot
            return <circle r={s * 0.5} fill={color} />;
        case 'AIRBORNE': // wings
            return (
                <path d={`M ${-s} ${-s * 0.55} L 0 ${s * 0.1} L ${s} ${-s * 0.55} M ${-s * 0.55} ${s * 0.5} L 0 ${s * 0.1} L ${s * 0.55} ${s * 0.5}`}
                    stroke={color} strokeWidth={s * 0.26} fill="none" />
            );
        case 'SPECIAL_OPS': // dagger
            return (
                <g>
                    <path d={`M 0 ${-s} L 0 ${s * 0.9}`} stroke={color} strokeWidth={s * 0.26} />
                    <path d={`M ${-s * 0.55} ${-s * 0.15} L ${s * 0.55} ${-s * 0.15}`} stroke={color} strokeWidth={s * 0.26} />
                </g>
            );
        case 'MILITIA': // irregular chevron
            return <path d={`M ${-s * 0.9} ${s * 0.5} L 0 ${-s * 0.7} L ${s * 0.9} ${s * 0.5}`} stroke={color} strokeWidth={s * 0.28} fill="none" />;
        default:
            return <circle r={s * 0.5} fill={color} />;
    }
}

export default function UnitPieces({
    surface, geo, war, formations, playerSide,
    attackerColor, defenderColor, selectedIds, onSelectionChange, onOrderMove, redeployMode,
}: UnitPiecesProps) {
    const rootRef = React.useRef<SVGGElement | null>(null);
    // Drag-and-drop: the piece being dragged and where the cursor is, in board
    // coordinates. Click-then-right-click still works; dragging is the shortcut.
    const [drag, setDrag] = React.useState<{ id: string; at: Pt; start: Pt; moved: boolean } | null>(null);

    const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedFormations = React.useMemo(
        () => formations.filter(f => selectedSet.has(f.id) && f.strength > 0),
        [formations, selectedSet]
    );
    const dragging = formations.find(f => f.id === drag?.id) ?? null;
    /** The piece whose reach is shown: the dragged one, else the first selected. */
    const lead = dragging ?? selectedFormations[0] ?? null;

    // Districts the lead piece can reach this cycle. In redeployment mode the
    // whole friendly rear is reachable instead.
    const reachable = React.useMemo(() => {
        if (!lead) return [];
        if (redeployMode) {
            return surface.sectors
                .filter(s => s.index !== lead.sectorIndex
                    && controllerOf(war, s.index) === lead.side
                    && s.terrain !== 'ocean')
                .map(s => ({ sectorIndex: s.index, cost: 0, contested: false }));
        }
        return legalMoves(surface, war, lead);
    }, [lead, surface, war, redeployMode]);

    /** Issues the order to every selected piece that can obey it. */
    const orderSelection = React.useCallback((sectorIndex: number, opts?: { queue?: boolean; redeploy?: boolean }) => {
        const targets = selectedFormations.length ? selectedFormations : (lead ? [lead] : []);
        for (const f of targets) {
            if (opts?.redeploy || opts?.queue) { onOrderMove(f, sectorIndex, opts); continue; }
            if (legalMoves(surface, war, f).some(o => o.sectorIndex === sectorIndex)) onOrderMove(f, sectorIndex);
        }
    }, [selectedFormations, lead, surface, war, onOrderMove]);

    /** Screen point → board coordinates. */
    const toBoard = React.useCallback((clientX: number, clientY: number): Pt | null => {
        const svg = rootRef.current?.ownerSVGElement;
        if (!svg) return null;
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        const p = svg.createSVGPoint();
        p.x = clientX; p.y = clientY;
        const q = p.matrixTransform(ctm.inverse());
        return [q.x, q.y];
    }, []);

    /** Which district a board point falls in. */
    const districtAt = React.useCallback((pt: Pt): number | null => {
        for (let i = 0; i < geo.polygons.length; i++) {
            if (geo.polygons[i].length >= 3 && pointInPolygon(pt, geo.polygons[i])) return i;
        }
        return null;
    }, [geo]);

    // While dragging, follow the pointer anywhere on the page and drop on release.
    React.useEffect(() => {
        if (!drag) return;
        const DRAG_THRESHOLD = 10; // board units — below this it was a click
        const move = (e: PointerEvent) => {
            const pt = toBoard(e.clientX, e.clientY);
            if (!pt) return;
            setDrag(d => {
                if (!d) return d;
                const moved = d.moved || Math.hypot(pt[0] - d.start[0], pt[1] - d.start[1]) > DRAG_THRESHOLD;
                return { ...d, at: pt, moved };
            });
        };
        const up = (e: PointerEvent) => {
            const pt = toBoard(e.clientX, e.clientY);
            const formation = formations.find(f => f.id === drag.id);
            const idx = pt ? districtAt(pt) : null;
            const wasDrag = drag.moved;
            setDrag(null);
            if (!formation) return;
            // A tap, not a drag: leave it selected so the reachable districts
            // stay lit and the player can right-click one.
            if (!wasDrag) return;
            if (idx == null) return;
            if (redeployMode) { onOrderMove(formation, idx, { redeploy: true }); return; }
            const legal = legalMoves(surface, war, formation).some(o => o.sectorIndex === idx);
            if (legal) onOrderMove(formation, idx);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [drag, formations, surface, war, toBoard, districtAt, onOrderMove, redeployMode]);

    // Stack pieces that share a district so they never overlap.
    const bySector = React.useMemo(() => {
        const m = new Map<number, Formation[]>();
        for (const f of formations) {
            if (f.strength <= 0) continue;
            const list = m.get(f.sectorIndex) ?? [];
            list.push(f);
            m.set(f.sectorIndex, list);
        }
        return m;
    }, [formations]);

    return (
        <g ref={rootRef}>
            <defs>
                <marker id="up-arrow-a" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={attackerColor} />
                </marker>
                <marker id="up-arrow-d" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={defenderColor} />
                </marker>
            </defs>

            {/* Reachable districts for the selection. Right-click orders the
                move (HOI4); shift+right-click queues a waypoint. Left-click
                still works for players who prefer click-click. */}
            {reachable.map(opt => (
                <path
                    key={`mv-${opt.sectorIndex}`}
                    d={geo.paths[opt.sectorIndex]}
                    fill={redeployMode ? '#a855f7' : opt.contested ? '#ef4444' : '#38bdf8'}
                    fillOpacity={redeployMode ? 0.14 : opt.contested ? 0.22 : 0.16}
                    stroke={redeployMode ? '#d8b4fe' : opt.contested ? '#fca5a5' : '#7dd3fc'}
                    strokeWidth={1.6}
                    strokeDasharray="6 4"
                    className="up-reach cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); orderSelection(opt.sectorIndex, redeployMode ? { redeploy: true } : undefined); }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        orderSelection(opt.sectorIndex, redeployMode ? { redeploy: true } : { queue: e.shiftKey });
                    }}
                />
            ))}

            {/* Right-clicking districts outside the current reach is handled at
                the board level (PlanetSurfaceView) so nothing here covers the
                map and swallows ordinary district clicks. */}

            {/* Ordered march: arrows from the piece through every queued
                waypoint, so a shift-clicked path reads as one route. */}
            {formations.filter(f => f.strength > 0 && (f.moveTo != null || (f.path?.length ?? 0) > 0)).map(f => {
                const stops = [
                    ...(f.moveTo != null ? [f.moveTo] : []),
                    ...(f.path ?? []),
                ];
                if (!stops.length) return null;
                const color = f.redeploying ? '#c084fc' : f.side === 'attacker' ? attackerColor : defenderColor;
                const marker = `url(#up-arrow-${f.side === 'attacker' ? 'a' : 'd'})`;
                let cursor = geo.centroids[f.sectorIndex];
                return (
                    <g key={`ord-${f.id}`} pointerEvents="none">
                        {stops.map((stop, i) => {
                            const to = geo.centroids[stop];
                            if (!cursor || !to) return null;
                            const from = cursor;
                            cursor = to;
                            // Stop short so the head sits inside the district.
                            const dx = to[0] - from[0], dy = to[1] - from[1];
                            const len = Math.hypot(dx, dy) || 1;
                            const end: Pt = [to[0] - (dx / len) * 12, to[1] - (dy / len) * 12];
                            const last = i === stops.length - 1;
                            return (
                                <g key={i}>
                                    <line x1={from[0]} y1={from[1]} x2={end[0]} y2={end[1]}
                                        stroke="#020617" strokeWidth={5} opacity={0.5} strokeLinecap="round" />
                                    <line x1={from[0]} y1={from[1]} x2={end[0]} y2={end[1]}
                                        stroke={color} strokeWidth={2.4}
                                        strokeDasharray={f.redeploying ? '3 4' : '8 5'}
                                        opacity={last ? 0.95 : 0.6}
                                        className="up-march"
                                        markerEnd={last ? marker : undefined} />
                                    {!last && <circle cx={to[0]} cy={to[1]} r={3} fill={color} opacity={0.8} />}
                                </g>
                            );
                        })}
                    </g>
                );
            })}

            {/* Live drag: an arrow trailing the cursor to the district under it */}
            {drag && dragging && (() => {
                const from = geo.centroids[dragging.sectorIndex];
                const hovered = districtAt(drag.at);
                const legal = hovered != null && reachable.some(o => o.sectorIndex === hovered);
                const color = legal ? (dragging.side === 'attacker' ? attackerColor : defenderColor) : '#94a3b8';
                return (
                    <g pointerEvents="none">
                        {hovered != null && legal && (
                            <path d={geo.paths[hovered]} fill={color} fillOpacity={0.3} stroke="#ffffff" strokeWidth={2} />
                        )}
                        <line x1={from[0]} y1={from[1]} x2={drag.at[0]} y2={drag.at[1]}
                            stroke="#020617" strokeWidth={5} opacity={0.5} strokeLinecap="round" />
                        <line x1={from[0]} y1={from[1]} x2={drag.at[0]} y2={drag.at[1]}
                            stroke={color} strokeWidth={2.4} strokeDasharray="8 5" className="up-march"
                            markerEnd={`url(#up-arrow-${dragging.side === 'attacker' ? 'a' : 'd'})`} />
                    </g>
                );
            })()}

            {/* The pieces */}
            {Array.from(bySector.entries()).map(([sectorIndex, stack]) => {
                const [cx, cy] = geo.centroids[sectorIndex];
                const area = geo.areas[sectorIndex];
                const size = Math.max(7, Math.min(12, Math.sqrt(area) * 0.13));
                return stack.map((f, i) => {
                    // Fan the stack so several formations in one district all read.
                    const spread = size * 2.3;
                    const offX = (i - (stack.length - 1) / 2) * spread;
                    const offY = f.side === 'attacker' ? size * 1.5 : -size * 1.5;
                    const x = cx + offX;
                    const y = cy + offY;
                    const color = f.side === 'attacker' ? attackerColor : defenderColor;
                    const mine = playerSide === f.side;
                    const isSel = selectedSet.has(f.id);
                    const org = Math.max(0, Math.min(100, f.organization ?? 100));
                    return (
                        <g
                            key={f.id}
                            transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)})`}
                            className={mine ? (drag?.id === f.id ? 'cursor-grabbing' : 'cursor-grab') : undefined}
                            opacity={drag?.id === f.id ? 0.55 : 1}
                            onPointerDown={(e) => {
                                // Drag to order a march; a plain click (no drag)
                                // still just selects — both paths work.
                                if (!mine || e.button !== 0) return;
                                e.stopPropagation();
                                const pt = toBoard(e.clientX, e.clientY);
                                // Shift/ctrl extends the selection, HOI4-style.
                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                    onSelectionChange(isSel
                                        ? selectedIds.filter(id => id !== f.id)
                                        : [...selectedIds, f.id]);
                                } else {
                                    onSelectionChange(isSel && selectedIds.length === 1 ? [] : [f.id]);
                                }
                                if (pt) setDrag({ id: f.id, at: pt, start: pt, moved: false });
                            }}
                            // Selection is driven by pointerdown (above) so the
                            // same gesture starts a drag; the click handler only
                            // stops the district underneath from also reacting.
                            onClick={(e) => { if (mine) e.stopPropagation(); }}
                        >
                            {/* counter body */}
                            <rect
                                x={-size * 1.35} y={-size * 0.95} width={size * 2.7} height={size * 1.9} rx={size * 0.25}
                                fill="#0b1220" fillOpacity={0.92}
                                stroke={isSel ? '#ffffff' : color}
                                strokeWidth={isSel ? 2.2 : 1.3}
                            />
                            {/* the unit symbol */}
                            <g transform={`translate(0, ${(-size * 0.05).toFixed(1)})`}>
                                <UnitGlyph type={f.unitType} size={size * 0.62} color={color} />
                            </g>
                            {/* strength */}
                            <text
                                y={size * 0.85} textAnchor="middle" fontSize={size * 0.72}
                                fill="#e2e8f0" fontFamily="monospace" pointerEvents="none"
                            >
                                {f.strength >= 1000 ? `${(f.strength / 1000).toFixed(1)}k` : f.strength}
                            </text>
                            {/* organisation bar: a shredded formation fights badly */}
                            <rect x={-size * 1.15} y={size * 1.0} width={size * 2.3} height={size * 0.22}
                                fill="#1e293b" rx={size * 0.11} />
                            <rect x={-size * 1.15} y={size * 1.0} width={size * 2.3 * (org / 100)} height={size * 0.22}
                                fill={org > 60 ? '#4ade80' : org > 30 ? '#fbbf24' : '#f87171'} rx={size * 0.11} />
                            {/* cut off from supply */}
                            {f.encircled && (
                                <circle cx={size * 1.2} cy={-size * 0.8} r={size * 0.34}
                                    fill="#f59e0b" stroke="#0b1220" strokeWidth={0.8} className="up-warn" />
                            )}
                            {isSel && (
                                <rect x={-size * 1.6} y={-size * 1.2} width={size * 3.2} height={size * 2.4} rx={size * 0.3}
                                    fill="none" stroke="#ffffff" strokeWidth={1} strokeDasharray="4 3" className="up-sel" />
                            )}
                        </g>
                    );
                });
            })}

            <style>{`
                .up-reach { animation: up-reach 1.4s linear infinite; }
                @keyframes up-reach { to { stroke-dashoffset: -10; } }
                .up-march { animation: up-march 0.9s linear infinite; }
                @keyframes up-march { to { stroke-dashoffset: -12; } }
                .up-sel { animation: up-sel 1.2s linear infinite; }
                @keyframes up-sel { to { stroke-dashoffset: -14; } }
                .up-warn { animation: up-warn 1.5s ease-in-out infinite; }
                @keyframes up-warn { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
                @media (prefers-reduced-motion: reduce) {
                    .up-reach, .up-march, .up-sel, .up-warn { animation: none; }
                }
            `}</style>
        </g>
    );
}
