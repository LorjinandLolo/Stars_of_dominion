/**
 * lib/rebellion/visibility.ts
 * Which rebel cells a foreign service can see (Item 13b). Browser-safe: the
 * persistence layer (loaded by the page too) builds each sponsor's view of
 * foreign cells from this, so it imports types only.
 */

import type { ForeignCellView, RebelCell } from './rebellion-types';

/** Infiltration of the host a service needs to see cells there without a local network (Embedded). */
export const SEE_CELLS_MIN_INFILTRATION = 35;

function cellsOf(world: any): RebelCell[] {
    const cells = world?.rebellion?.cells;
    return cells instanceof Map ? [...cells.values()] : [];
}

function sponsorsCell(world: any, factionId: string, cellId: string): boolean {
    const s = world?.rebellion?.sponsorships;
    if (!(s instanceof Map)) return false;
    for (const sp of s.values()) if (sp.cellId === cellId && sp.sponsorFactionId === factionId && !sp.endedAtSeconds) return true;
    return false;
}

/**
 * Can this empire's service see this cell? Its sponsors always can; otherwise
 * it takes a network in the cell's system, or an Embedded Network in the host.
 */
export function canSeeCell(world: any, factionId: string, cell: RebelCell): boolean {
    if (cell.status !== 'active' || cell.hostFactionId === factionId) return false;
    if (sponsorsCell(world, factionId, cell.id)) return true;
    const net = world?.espionage?.intelNetworks?.get?.(`${factionId}:${cell.systemId}`);
    if (net && net.penetrationLevel !== 'none') return true;
    const level = world?.espionage?.factionIntel?.get?.(factionId)?.infiltrationLevels?.[cell.hostFactionId] ?? 0;
    return level >= SEE_CELLS_MIN_INFILTRATION;
}

/** What a foreign service sees of the cells it can see: no sponsors, no truth. */
export function foreignCellsFor(world: any, factionId: string): ForeignCellView[] {
    return cellsOf(world)
        .filter(c => canSeeCell(world, factionId, c))
        .map(c => ({
            id: c.id,
            name: c.name,
            planetId: c.planetId,
            planetName: world?.construction?.planets?.get?.(c.planetId)?.name ?? 'an unknown world',
            systemId: c.systemId,
            hostFactionId: c.hostFactionId,
            cause: c.cause,
            strength: Math.round(c.strength),
            members: c.members,
            actsCommitted: c.actsCommitted ?? 0,
        }));
}
