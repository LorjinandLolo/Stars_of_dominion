// lib/multiplayer/optimistic.ts
// Stars of Dominion — Optimistic Order Overlays (client-side)
//
// Pure functions that project the *expected* effect of not-yet-confirmed orders
// onto the lists the UI renders. Applied in two places:
//   1. At dispatch time (order-client.ts) — so the click feels instant.
//   2. In useGameSync.updateStoreFromWorld — re-applied on top of EVERY
//      authoritative snapshot, so a snapshot that predates the order doesn't
//      rubber-band the UI back to the old state.
//
// Overlays are cosmetic previews only — the game-loop worker remains the single
// authority. Once the order is reflected in a snapshot (or times out), the
// pending entry is pruned and the overlay disappears naturally.

import type { PendingOrder } from '@/lib/store/ui-store';

/** Marker set on any entity produced/modified by an overlay so components can
 *  render it as "syncing" (e.g. dashed movement line, ghosted queue item). */
export const OPTIMISTIC_FLAG = '__optimistic';

export interface OverlayLists {
    fleets: any[];
    planets: any[];
}

/** Action ids that have a visual overlay implementation. Orders outside this
 *  set still show in the pending HUD — they just don't mutate the map. */
export const OVERLAY_SUPPORTED_ACTIONS = new Set([
    'MIL_MOVE_FLEET',
    'PLANET_CONSTRUCT_BUILDING',
    'MIL_INVASION_PLANET',
]);

function overlayMoveFleet(lists: OverlayLists, order: PendingOrder): OverlayLists {
    const { fleetId, destinationId } = order.payload;
    if (!fleetId || !destinationId) return lists;
    return {
        ...lists,
        fleets: lists.fleets.map((f) => {
            if (f.id !== fleetId) return f;
            // Already reflected authoritatively? Leave it alone.
            if (f.destinationSystemId === destinationId) return f;
            return {
                ...f,
                destinationSystemId: destinationId,
                plannedPath: [],
                transitProgress: 0,
                [OPTIMISTIC_FLAG]: true,
            };
        }),
    };
}

function overlayConstructBuilding(lists: OverlayLists, order: PendingOrder): OverlayLists {
    const { planetId, buildingType } = order.payload;
    if (!planetId || !buildingType) return lists;
    return {
        ...lists,
        planets: lists.planets.map((p) => {
            if (p.id !== planetId) return p;
            const queue = Array.isArray(p.buildQueue) ? p.buildQueue : [];
            // If the authoritative queue already contains this pending item, skip.
            const ghostId = `pending-${order.localId}`;
            if (queue.some((q: any) => q.id === ghostId)) return p;
            return {
                ...p,
                buildQueue: [
                    ...queue,
                    {
                        id: ghostId,
                        buildingId: buildingType,
                        status: 'pending',
                        [OPTIMISTIC_FLAG]: true,
                    },
                ],
            };
        }),
    };
}

function overlayInvasion(lists: OverlayLists, order: PendingOrder): OverlayLists {
    const { planetId } = order.payload;
    if (!planetId) return lists;
    return {
        ...lists,
        planets: lists.planets.map((p) => {
            if (p.id !== planetId) return p;
            if (p.siege) return p; // authoritative siege already exists
            return { ...p, pendingInvasionBy: order.factionId, [OPTIMISTIC_FLAG]: true };
        }),
    };
}

/**
 * Apply all active pending orders to the given lists. Failed orders are skipped
 * (their preview should vanish as soon as we know the server rejected them).
 */
export function applyPendingOrderOverlays(
    lists: OverlayLists,
    pendingOrders: PendingOrder[]
): OverlayLists {
    let out = lists;
    for (const order of pendingOrders) {
        if (order.status === 'failed') continue;
        switch (order.actionId) {
            case 'MIL_MOVE_FLEET':
                out = overlayMoveFleet(out, order);
                break;
            case 'PLANET_CONSTRUCT_BUILDING':
                out = overlayConstructBuilding(out, order);
                break;
            case 'MIL_INVASION_PLANET':
                out = overlayInvasion(out, order);
                break;
            default:
                break; // HUD-only
        }
    }
    return out;
}

/** Short human label for the pending HUD. */
export function describeOrder(actionId: string, payload: Record<string, any>): string {
    switch (actionId) {
        case 'MIL_MOVE_FLEET': return 'Fleet movement order';
        case 'MIL_INVASION_PLANET': return 'Planetary invasion order';
        case 'PLANET_CONSTRUCT_BUILDING': return `Construction: ${payload?.buildingType ?? 'building'}`;
        case 'MIL_BUILD_FLEET': return 'Commissioning fleet';
        case 'MIL_CREATE_ARMY': return 'Raising army';
        case 'TECH_START_RESEARCH': return 'Research directive';
        case 'AIR_LAUNCH_SORTIE': return 'Air sortie launch';
        case 'RENAME_PLANET': return 'Renaming planet';
        case 'DIP_DECLARE_WAR': return 'Declaration of war';
        case 'DIP_SEND_ENVOY': return 'Diplomatic envoy';
        default: return actionId.replace(/_/g, ' ').toLowerCase();
    }
}
