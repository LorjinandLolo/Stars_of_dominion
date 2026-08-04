// components/planet/surfaceGeometry.ts
// Voronoi district geometry for the planet surface board.
//
// The lib-side generator produces 64 deterministic seed points in the unit
// disc (SurfaceSector.cx/cy). Here — client only — those seeds become organic
// Voronoi cells clipped to the planetary silhouette. The worker never touches
// this module: agreement between client and worker lives in the seeds, not
// the polygons.

import { Delaunay } from 'd3-delaunay';
import type { PlanetSurface } from '@/lib/planet-surface/types';
import { SURFACE_SECTOR_COUNT } from '@/lib/planet-surface/types';

export const BOARD_SIZE = 1000;
export const CX = BOARD_SIZE / 2;
export const CY = BOARD_SIZE / 2;
export const PLANET_RADIUS = 468;

export type Pt = [number, number];

export interface SurfaceGeometry {
    /** SVG path per sector (closed polygon). */
    paths: string[];
    /** Area centroid per sector — glyph/label anchor. */
    centroids: Pt[];
    /** Clipped polygon vertices per sector — scenery placement. */
    polygons: Pt[][];
    /** Approximate cell area per sector — glyph sizing. */
    areas: number[];
    /** UNCLIPPED cell vertices — adjacent cells share exact edge endpoints. */
    rawPolygons: Pt[][];
    /** True Voronoi adjacency per sector (Delaunay neighbours, sectors only). */
    cellNeighbors: number[][];
}

// ─── Circle clip (Sutherland-Hodgman against a fine polygon approximation) ──

const CLIP_STEPS = 72;
const CIRCLE: Pt[] = Array.from({ length: CLIP_STEPS }, (_, i) => {
    const a = (i / CLIP_STEPS) * Math.PI * 2;
    return [CX + PLANET_RADIUS * Math.cos(a), CY + PLANET_RADIUS * Math.sin(a)] as Pt;
});

function clipToCircle(poly: Pt[]): Pt[] {
    let output = poly;
    for (let i = 0; i < CLIP_STEPS && output.length; i++) {
        const a = CIRCLE[i];
        const b = CIRCLE[(i + 1) % CLIP_STEPS];
        const input = output;
        output = [];
        // Circle vertices wind clockwise on screen (y-down): interior points
        // sit on the POSITIVE cross-product side of each edge.
        const inside = (p: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
        const intersect = (p: Pt, q: Pt): Pt => {
            const dx1 = q[0] - p[0], dy1 = q[1] - p[1];
            const dx2 = b[0] - a[0], dy2 = b[1] - a[1];
            const denom = dx1 * dy2 - dy1 * dx2;
            if (Math.abs(denom) < 1e-9) return q;
            const t = ((a[0] - p[0]) * dy2 - (a[1] - p[1]) * dx2) / denom;
            return [p[0] + t * dx1, p[1] + t * dy1];
        };
        for (let j = 0; j < input.length; j++) {
            const cur = input[j];
            const prev = input[(j + input.length - 1) % input.length];
            const curIn = inside(cur);
            const prevIn = inside(prev);
            if (curIn) {
                if (!prevIn) output.push(intersect(prev, cur));
                output.push(cur);
            } else if (prevIn) {
                output.push(intersect(prev, cur));
            }
        }
    }
    return output;
}

function polygonCentroid(poly: Pt[]): Pt {
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        const cross = x1 * y2 - x2 * y1;
        area += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    if (Math.abs(area) < 1e-9) return poly[0] ?? [CX, CY];
    area /= 2;
    return [cx / (6 * area), cy / (6 * area)];
}

function polygonArea(poly: Pt[]): number {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// ─── Geometry builder ────────────────────────────────────────────────────────

const geoCache = new Map<string, SurfaceGeometry>();

export function computeSurfaceGeometry(surface: PlanetSurface): SurfaceGeometry {
    const cached = geoCache.get(surface.planetId);
    if (cached) return cached;

    // Seed points in board space, plus a ring of dummy points outside the
    // planet so every real cell is bounded before circle-clipping.
    const pts: Pt[] = surface.sectors.map(s => [CX + s.cx * PLANET_RADIUS, CY + s.cy * PLANET_RADIUS]);
    const DUMMIES = 36;
    for (let i = 0; i < DUMMIES; i++) {
        const a = (i / DUMMIES) * Math.PI * 2;
        pts.push([CX + PLANET_RADIUS * 1.22 * Math.cos(a), CY + PLANET_RADIUS * 1.22 * Math.sin(a)]);
    }

    const pad = PLANET_RADIUS * 1.4;
    const delaunay = Delaunay.from(pts);
    const voronoi = delaunay.voronoi([CX - pad, CY - pad, CX + pad, CY + pad]);

    const paths: string[] = [];
    const centroids: Pt[] = [];
    const polygons: Pt[][] = [];
    const areas: number[] = [];
    const rawPolygons: Pt[][] = [];
    const cellNeighbors: number[][] = [];

    for (let i = 0; i < SURFACE_SECTOR_COUNT; i++) {
        const raw = voronoi.cellPolygon(i);
        const cell: Pt[] = raw ? (raw as unknown as Pt[]).slice(0, -1).map(p => [p[0], p[1]]) : [];
        const clipped = clipToCircle(cell);
        const poly = clipped.length >= 3 ? clipped : cell;
        rawPolygons.push(cell);
        polygons.push(poly);
        centroids.push(polygonCentroid(poly));
        areas.push(polygonArea(poly));
        paths.push(
            poly.length
                ? `M ${poly.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} Z`
                : ''
        );
        cellNeighbors.push(Array.from(voronoi.neighbors(i)).filter(n => n < SURFACE_SECTOR_COUNT));
    }

    const geo: SurfaceGeometry = { paths, centroids, polygons, areas, rawPolygons, cellNeighbors };
    geoCache.set(surface.planetId, geo);
    return geo;
}

// ─── Coastlines ──────────────────────────────────────────────────────────────
// Adjacent unclipped Voronoi cells share exact edge endpoints, so the shore
// between a land district and an ocean district is the consecutive vertex
// pair of the land cell whose both points also appear in the ocean cell.

export interface CoastSegment { key: string; a: Pt; b: Pt }

export function computeCoastlines(
    geo: SurfaceGeometry,
    isOcean: (sectorIndex: number) => boolean,
): CoastSegment[] {
    const EPS = 0.5;
    const near = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
    const segments: CoastSegment[] = [];
    for (let i = 0; i < geo.rawPolygons.length; i++) {
        if (isOcean(i)) continue;
        for (const j of geo.cellNeighbors[i]) {
            // Only land→ocean pairs emit, so each shore edge appears once.
            if (!isOcean(j)) continue;
            const landPoly = geo.rawPolygons[i];
            const oceanPoly = geo.rawPolygons[j];
            for (let k = 0; k < landPoly.length; k++) {
                const a = landPoly[k];
                const b = landPoly[(k + 1) % landPoly.length];
                const aShared = oceanPoly.some(q => near(a, q));
                const bShared = oceanPoly.some(q => near(b, q));
                if (aShared && bShared) segments.push({ key: `${i}-${j}-${k}`, a, b });
            }
        }
    }
    return segments;
}

/** Glyph size scaled to the district's actual footprint. */
export function glyphSizeForArea(area: number): number {
    return Math.max(14, Math.min(24, Math.sqrt(area) * 0.24));
}
