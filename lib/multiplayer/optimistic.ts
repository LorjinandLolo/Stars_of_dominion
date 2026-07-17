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
    'MIL_MERGE_FLEETS',
    'MIL_SPLIT_FLEET',
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
            if (!f.currentSystemId) {
                // IN TRANSIT: preserve the current plannedPath! Clearing it left
                // the renderer with no position to draw → the fleet vanished from
                // the map until the next snapshot. Just retarget the destination
                // display; the server reroutes from the next waypoint.
                return { ...f, destinationSystemId: destinationId, [OPTIMISTIC_FLAG]: true };
            }
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

function overlayMergeFleets(lists: OverlayLists, order: PendingOrder): OverlayLists {
    const { sourceFleetId, targetFleetId } = order.payload;
    const src = lists.fleets.find((f: any) => f.id === sourceFleetId);
    const tgt = lists.fleets.find((f: any) => f.id === targetFleetId);
    if (!src || !tgt) return lists; // already merged authoritatively (source gone)
    const mergedComposition: Record<string, number> = { ...(tgt.composition || {}) };
    for (const [type, count] of Object.entries(src.composition || {})) {
        mergedComposition[type] = (mergedComposition[type] || 0) + (Number(count) || 0);
    }
    return {
        ...lists,
        fleets: lists.fleets
            .filter((f: any) => f.id !== sourceFleetId)
            .map((f: any) => f.id !== targetFleetId ? f : {
                ...f,
                composition: mergedComposition,
                basePower: (f.basePower ?? 0) + (src.basePower ?? 0),
                transportedArmyIds: [...(f.transportedArmyIds || []), ...(src.transportedArmyIds || [])],
                [OPTIMISTIC_FLAG]: true,
            }),
    };
}

function overlaySplitFleet(lists: OverlayLists, order: PendingOrder): OverlayLists {
    const { fleetId, composition, name } = order.payload;
    const src = lists.fleets.find((f: any) => f.id === fleetId);
    if (!src) return lists;
    const ghostId = `pending-split-${order.localId}`;
    if (lists.fleets.some((f: any) => f.id === ghostId)) return lists;

    const srcComp: Record<string, number> = { ...(src.composition || {}) };
    const totalShips = Object.values(srcComp).reduce((a, b) => a + (Number(b) || 0), 0);
    const moved: Record<string, number> = {};
    let movedCount = 0;
    for (const [type, want] of Object.entries(composition || {})) {
        const have = srcComp[type] || 0;
        const take = Math.max(0, Math.min(have, Math.floor(Number(want) || 0)));
        if (take > 0) { moved[type] = take; movedCount += take; }
    }
    if (movedCount > 0 && movedCount >= totalShips) return lists; // server will reject

    const srcPower = src.basePower ?? 100;
    const ratio = movedCount > 0 ? (totalShips > 0 ? movedCount / totalShips : 0.5) : 0.5;
    const newPower = Math.max(10, Math.round(srcPower * ratio));
    for (const [type, count] of Object.entries(moved)) {
        srcComp[type] -= count;
        if (srcComp[type] <= 0) delete srcComp[type];
    }

    return {
        ...lists,
        fleets: [
            ...lists.fleets.map((f: any) => f.id !== fleetId ? f : {
                ...f,
                composition: srcComp,
                basePower: Math.max(10, srcPower - newPower),
                [OPTIMISTIC_FLAG]: true,
            }),
            {
                id: ghostId,
                name: name || `${src.name || 'Task Force'} Detachment`,
                factionId: src.factionId,
                currentSystemId: src.currentSystemId,
                destinationSystemId: null,
                plannedPath: [],
                transitProgress: 0,
                orders: [],
                composition: moved,
                basePower: newPower,
                strength: src.strength ?? 1,
                transportedArmyIds: [],
                [OPTIMISTIC_FLAG]: true,
            },
        ],
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
            case 'MIL_MERGE_FLEETS':
                out = overlayMergeFleets(out, order);
                break;
            case 'MIL_SPLIT_FLEET':
                out = overlaySplitFleet(out, order);
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
