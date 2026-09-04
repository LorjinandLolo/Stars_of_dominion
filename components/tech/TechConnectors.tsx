"use client";

import React from 'react';
import type { Tech } from '@/lib/tech/types';
import { ROW_GAP_HALF, canvasSize, nodeRect, type GridOffset, type Rect } from './layout';

type EdgeKind = 'highlight' | 'active' | 'idle' | 'faint';

interface Edge {
    id: string;
    /** Finished SVG path; the glow and the stroke both trace it. */
    d: string;
    kind: EdgeKind;
}

const EDGE_STYLE: Record<EdgeKind, { stroke: string; glow: string; width: number; opacity: number }> = {
    highlight: { stroke: '#a5b4fc', glow: '#818cf8', width: 2, opacity: 1 },
    active: { stroke: '#6366f1', glow: '#6366f1', width: 1.5, opacity: 1 },
    idle: { stroke: '#334155', glow: '#334155', width: 1.5, opacity: 0.9 },
    faint: { stroke: '#1e293b', glow: '#1e293b', width: 1, opacity: 0.5 },
};

const EDGE_KINDS: EdgeKind[] = ['faint', 'idle', 'active', 'highlight'];

/** Corner radius of the up-and-over lane; capped so it never exceeds the half gap it lives in. */
const LANE_RADIUS = Math.min(10, ROW_GAP_HALF);

const gx = (t: Tech) => t.position?.x ?? 0;
const gy = (t: Tech) => t.position?.y ?? 0;

/**
 * Anchors depend on where the child sits relative to the parent. The old tree
 * always left the parent's bottom and entered the child's top, which is right
 * for the common row-to-row edge but sends a same-row edge looping back up
 * through the parent's own body and into the child from above, arrowhead
 * pointing the wrong way. Every tree has such edges (the T2 *_1 -> *_2/*_3
 * sub-branch fans), so they get side anchors instead.
 */
function routeEdge(parent: Tech, child: Tech, pr: Rect, cr: Rect, skipsSibling: boolean): string {
    const dy = gy(child) - gy(parent);

    if (dy !== 0) {
        // Row-to-row: vertical tangents so the bezier leaves and enters square on.
        // A child above its parent (none authored today, but nothing forbids it)
        // just swaps the two edges rather than looping around.
        const from = { x: pr.x + pr.w / 2, y: dy > 0 ? pr.y + pr.h : pr.y };
        const to = { x: cr.x + cr.w / 2, y: dy > 0 ? cr.y : cr.y + cr.h };
        const midY = (from.y + to.y) / 2;
        return `M ${from.x} ${from.y} C ${from.x} ${midY} ${to.x} ${midY} ${to.x} ${to.y}`;
    }

    const dir = gx(child) > gx(parent) ? 1 : -1;

    if (!skipsSibling) {
        // Neighbours on the same row: a straight run through the gap between them.
        const fromX = dir > 0 ? pr.x + pr.w : pr.x;
        const toX = dir > 0 ? cr.x : cr.x + cr.w;
        return `M ${fromX} ${pr.y + pr.h / 2} L ${toX} ${cr.y + cr.h / 2}`;
    }

    // A sibling sits between them, so a straight run would pass behind its card
    // and read as a chain through it. Go up into the row gap, across, and back
    // down. The lane leaves and enters at the quarter points of the top edge so
    // it stays clear of the centre anchor that row-above parents use.
    const r = LANE_RADIUS;
    const fromX = pr.x + pr.w / 2 + dir * (pr.w / 4);
    const toX = cr.x + cr.w / 2 - dir * (cr.w / 4);
    const laneY = pr.y - ROW_GAP_HALF;
    return [
        `M ${fromX} ${pr.y}`,
        `L ${fromX} ${laneY + r}`,
        `Q ${fromX} ${laneY} ${fromX + dir * r} ${laneY}`,
        `L ${toX - dir * r} ${laneY}`,
        `Q ${toX} ${laneY} ${toX} ${laneY + r}`,
        `L ${toX} ${cr.y}`,
    ].join(' ');
}

interface TechConnectorsProps {
    techs: Tech[];
    offset: GridOffset;
    unlockedTechIds: string[];
    /** Selected tech plus every ancestor; edges inside this set light up. */
    chainIds: ReadonlySet<string>;
    selectedId: string | null;
}

export default function TechConnectors({
    techs,
    offset,
    unlockedTechIds,
    chainIds,
    selectedId,
}: TechConnectorsProps) {
    const size = canvasSize(techs, offset);
    const byId = new Map(techs.map(t => [t.id, t] as const));
    const unlocked = new Set(unlockedTechIds);

    // Column occupancy per row, so a same-row edge can tell whether another
    // card sits in its way.
    const rows = new Map<number, number[]>();
    for (const t of techs) {
        const row = rows.get(gy(t));
        if (row) row.push(gx(t));
        else rows.set(gy(t), [gx(t)]);
    }
    const hasCardBetween = (a: Tech, b: Tech) => {
        const lo = Math.min(gx(a), gx(b));
        const hi = Math.max(gx(a), gx(b));
        return (rows.get(gy(a)) ?? []).some(x => x > lo && x < hi);
    };

    const edges: Edge[] = [];
    for (const tech of techs) {
        for (const preId of tech.prerequisites ?? []) {
            const parent = byId.get(preId);
            if (!parent) continue;
            const pr = nodeRect(parent, offset);
            const cr = nodeRect(tech, offset);

            let kind: EdgeKind;
            if (selectedId) {
                // Unlock edges leave the selected node; chain edges join two ancestors.
                const inChain = parent.id === selectedId || (chainIds.has(parent.id) && chainIds.has(tech.id));
                kind = inChain ? 'highlight' : 'faint';
            } else {
                kind = unlocked.has(parent.id) ? 'active' : 'idle';
            }

            const skipsSibling = gy(parent) === gy(tech) && hasCardBetween(parent, tech);
            edges.push({
                id: `${parent.id}-${tech.id}`,
                d: routeEdge(parent, tech, pr, cr, skipsSibling),
                kind,
            });
        }
    }
    // Brighter edges paint last so a highlighted path is never crossed out by a faint one.
    edges.sort((a, b) => EDGE_KINDS.indexOf(a.kind) - EDGE_KINDS.indexOf(b.kind));

    return (
        <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={size.w}
            height={size.h}
            aria-hidden="true"
        >
            <defs>
                {EDGE_KINDS.map(kind => (
                    <marker
                        key={kind}
                        id={`tech-arrow-${kind}`}
                        markerWidth="6"
                        markerHeight="4"
                        refX="5"
                        refY="2"
                        orient="auto"
                    >
                        <polygon points="0 0, 6 2, 0 4" fill={EDGE_STYLE[kind].stroke} />
                    </marker>
                ))}
            </defs>

            {edges.map(edge => {
                const style = EDGE_STYLE[edge.kind];
                return (
                    <g key={edge.id} opacity={style.opacity} className="transition-opacity duration-300">
                        {edge.kind !== 'faint' && (
                            <path d={edge.d} fill="none" stroke={style.glow} strokeOpacity={0.25} strokeWidth={style.width + 3} />
                        )}
                        <path
                            d={edge.d}
                            fill="none"
                            stroke={style.stroke}
                            strokeWidth={style.width}
                            markerEnd={`url(#tech-arrow-${edge.kind})`}
                        />
                    </g>
                );
            })}
        </svg>
    );
}
