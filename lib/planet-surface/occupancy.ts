// lib/planet-surface/occupancy.ts
// Single source of truth for "which sector holds what" on a planet's surface
// board. Used by BOTH the worker (to validate/auto-place construction orders)
// and the client (to draw the board), so legacy tiles without a stored
// sectorIndex land in the same deterministic spot everywhere.

import type { PlanetSurface } from './types';
import { autoPlaceBuilding } from './generator';

export type OccupantState = 'active' | 'under_construction' | 'ruined' | 'pending';

export interface SectorOccupant {
    sectorIndex: number;
    buildingId: string;
    state: OccupantState;
    tileId?: string;
    completesAtSeconds?: number;
    /** True when the position was derived (legacy tile with no sectorIndex). */
    autoPlaced?: boolean;
    /** True for optimistic queue ghosts not yet acknowledged by the worker. */
    optimistic?: boolean;
}

interface PlanetLike {
    tiles?: Array<{
        tileId: string;
        buildingId: string | null;
        constructionState: string;
        constructionCompleteAt?: number | null;
        sectorIndex?: number;
    }>;
    buildQueue?: Array<{
        buildingId: string;
        sectorIndex?: number;
        completesAtSeconds?: number;
        tileId?: string;
        [k: string]: any;
    }>;
}

/**
 * Maps every developed sector to its occupant. Iteration order is stable:
 * explicit sector tiles first, then legacy tiles in array order (deterministic
 * auto-placement), then queue entries that have no backing tile yet
 * (optimistic ghosts).
 */
export function computeSectorOccupancy(planet: PlanetLike, surface: PlanetSurface): Map<number, SectorOccupant> {
    const bySector = new Map<number, SectorOccupant>();
    const occupied = new Set<number>();

    const tiles = Array.isArray(planet.tiles) ? planet.tiles : [];
    const queue = Array.isArray(planet.buildQueue) ? planet.buildQueue : [];

    const stateOf = (t: { constructionState: string }): OccupantState =>
        t.constructionState === 'under_construction' ? 'under_construction'
        : t.constructionState === 'ruined' ? 'ruined'
        : 'active';

    // Pass 1: tiles that know their sector.
    for (const t of tiles) {
        if (t.constructionState === 'empty' || !t.buildingId) continue;
        if (!Number.isInteger(t.sectorIndex)) continue;
        const idx = t.sectorIndex as number;
        if (occupied.has(idx)) continue;
        occupied.add(idx);
        bySector.set(idx, {
            sectorIndex: idx,
            buildingId: t.buildingId,
            state: stateOf(t),
            tileId: t.tileId,
            completesAtSeconds: t.constructionCompleteAt ?? undefined,
        });
    }

    // Pass 2: legacy tiles — deterministic placement, same key + order as the
    // worker uses when reserving slots.
    for (const t of tiles) {
        if (t.constructionState === 'empty' || !t.buildingId) continue;
        if (Number.isInteger(t.sectorIndex)) continue;
        const idx = autoPlaceBuilding(surface, String(t.buildingId ?? t.tileId), occupied);
        if (idx === null) continue;
        occupied.add(idx);
        bySector.set(idx, {
            sectorIndex: idx,
            buildingId: t.buildingId,
            state: stateOf(t),
            tileId: t.tileId,
            completesAtSeconds: t.constructionCompleteAt ?? undefined,
            autoPlaced: true,
        });
    }

    // Pass 3: queue entries without a backing tile (optimistic ghosts from
    // lib/multiplayer/optimistic.ts, or worker entries whose tile is missing).
    for (const q of queue) {
        if (!Number.isInteger(q.sectorIndex)) continue;
        const idx = q.sectorIndex as number;
        if (occupied.has(idx)) continue;
        occupied.add(idx);
        bySector.set(idx, {
            sectorIndex: idx,
            buildingId: q.buildingId,
            state: 'pending',
            completesAtSeconds: q.completesAtSeconds,
            optimistic: true,
        });
    }

    return bySector;
}
