// lib/movement/overlay-api.ts
// UI integration hooks: overlay render primitives, fleet card data,
// and crisis trigger queries.  No React — pure data API.

import type {
    MovementWorldState,
    OverlayPrimitive,
    OverlayType,
    FleetCardData,
    TradeSegment,
    Corridor,
    GateObject,
    Fleet,
} from './types';
import { GameEvent, eventBus } from './event-bus';
import { computeVisibility, getSensorOverlayPrimitives } from './visibility-service';
import { getFleetCardData as doctrineFleetCard } from '../doctrine/doctrine-service';

// ─── Colour helpers ───────────────────────────────────────────────────────────

function segmentColor(seg: TradeSegment): string {
    if (seg.status === 'collapsed') return '#ef4444';
    if (seg.status === 'blockaded') return '#f97316';
    if (seg.status === 'disrupted') return '#f59e0b';
    if (seg.status === 'rerouted') return '#a855f7';
    return '#22c55e';
}

function segmentThickness(seg: TradeSegment): number {
    return Math.round(1 + seg.throughput * 7); // 1–8 px
}

function gateColor(gate: GateObject): string {
    if (gate.state === 'online') {
        if (gate.accessPolicy === 'open') return '#06b6d4';
        if (gate.accessPolicy === 'restricted') return '#f59e0b';
        return '#94a3b8'; // closed
    }
    if (gate.state === 'sabotaged') return '#ef4444';
    if (gate.state === 'unstable') return '#f97316';
    if (gate.state === 'offline') return '#475569';
    return '#1e293b'; // destroyed
}

function gateIconType(gate: GateObject): string {
    if (gate.state === 'online') return `gate-${gate.accessPolicy}`;
    return `gate-${gate.state}`;
}

// ─── Overlay data ─────────────────────────────────────────────────────────────

/**
 * Get all render primitives for a given overlay layer for one faction.
 *
 * Primitives are returned as a flat array for the renderer to iterate.
 * The UI may call this once per overlay toggle, caching until world state changes.
 */
export function getOverlayData(
    factionId: string,
    overlayType: OverlayType,
    world: MovementWorldState
): OverlayPrimitive[] {
    switch (overlayType) {
        case 'systems': return getSystemsOverlay(factionId, world);
        case 'trade': return getTradeOverlay(factionId, world);
        case 'corridor': return getCorridorOverlay(factionId, world);
        case 'gates': return getGatesOverlay(factionId, world);
        case 'deepSpace': return getDeepSpaceOverlay(factionId, world);
        case 'sensors': return getSensorOverlayPrimitives(factionId, world);
        case 'influence': return getInfluenceOverlay(factionId, world);
        default: return [];
    }
}

// ── Systems overlay ────────────────────────────────────────────────────────────
function getSystemsOverlay(factionId: string, world: MovementWorldState): OverlayPrimitive[] {
    const vis = world.factionVisibility.get(factionId) ?? {};
    const primitives: OverlayPrimitive[] = [];

    for (const [sysId, sys] of world.systems) {
        const stage = vis[sysId]?.revealStage ?? 'unknown';
        if (stage === 'unknown') continue;

        // Base hyperlane lines
        for (const neighborId of sys.hyperlaneNeighbors) {
            primitives.push({
                kind: 'line',
                fromSystemId: sysId,
                toSystemId: neighborId,
                color: '#334155',
                thickness: 1,
                dashed: false,
                flashing: false,
                opacity: 0.6,
                layer: 'hyperlane',
            });
        }

        // Label for scanned/surveyed
        if (stage === 'scanned' || stage === 'surveyed') {
            primitives.push({
                kind: 'label',
                systemId: sysId,
                text: sys.name,
                color: '#94a3b8',
            });
        }
    }
    return primitives;
}

// ── Trade overlay ──────────────────────────────────────────────────────────────
function getTradeOverlay(factionId: string, world: MovementWorldState): OverlayPrimitive[] {
    const vis = world.factionVisibility.get(factionId) ?? {};
    const primitives: OverlayPrimitive[] = [];

    for (const [, seg] of world.tradeSegments) {
        // Only show if at least one endpoint is visible to this faction
        const fromVis = vis[seg.fromSystemId]?.revealStage;
        const toVis = vis[seg.toSystemId]?.revealStage;
        if (!fromVis || fromVis === 'unknown') continue;

        primitives.push({
            kind: 'line',
            fromSystemId: seg.fromSystemId,
            toSystemId: seg.toSystemId,
            color: segmentColor(seg),
            thickness: segmentThickness(seg),
            dashed: seg.isReroute,
            flashing: seg.isFlashing,
            opacity: seg.status === 'collapsed' ? 0.3 : 0.85,
            layer: 'trade',
        });

        // Blockade icon at disrupted system
        if (seg.status === 'blockaded') {
            primitives.push({
                kind: 'icon',
                systemId: seg.fromSystemId,
                iconType: 'blockade',
                color: '#f97316',
                size: 14,
            });
        }
    }
    return primitives;
}

// ── Corridor overlay ───────────────────────────────────────────────────────────
function getCorridorOverlay(factionId: string, world: MovementWorldState): OverlayPrimitive[] {
    const vis = world.factionVisibility.get(factionId) ?? {};
    const primitives: OverlayPrimitive[] = [];

    for (const [, corridor] of world.corridors) {
        const nodeIds = corridor.nodeIds;
        for (let i = 0; i < nodeIds.length - 1; i++) {
            const from = nodeIds[i];
            const to = nodeIds[i + 1];
            if ((vis[from]?.revealStage ?? 'unknown') === 'unknown') continue;

            primitives.push({
                kind: 'line',
                fromSystemId: from,
                toSystemId: to,
                color: corridor.denialFieldActive ? '#ef4444' : '#8b5cf6',
                thickness: 3,
                dashed: false,
                flashing: corridor.denialFieldActive,
                opacity: 0.7,
                layer: 'corridor',
            });
        }

        // Chokepoint icons
        for (const cpId of corridor.chokepointIds) {
            if ((vis[cpId]?.revealStage ?? 'unknown') !== 'unknown') {
                primitives.push({
                    kind: 'icon',
                    systemId: cpId,
                    iconType: 'chokepoint',
                    color: '#8b5cf6',
                    size: 16,
                });
            }
        }
    }
    return primitives;
}

// ── Gates overlay ──────────────────────────────────────────────────────────────
function getGatesOverlay(factionId: string, world: MovementWorldState): OverlayPrimitive[] {
    const vis = world.factionVisibility.get(factionId) ?? {};
    const primitives: OverlayPrimitive[] = [];
    const onlineGates = [...world.gates.values()].filter(g => g.state !== 'destroyed');

    for (const gate of onlineGates) {
        if ((vis[gate.systemId]?.revealStage ?? 'unknown') === 'unknown') continue;

        primitives.push({
            kind: 'icon',
            systemId: gate.systemId,
            iconType: gateIconType(gate),
            color: gateColor(gate),
            size: 18,
        });
    }

    // Gate-to-gate links
    const visible = onlineGates.filter(g => (vis[g.systemId]?.revealStage ?? 'unknown') !== 'unknown' && g.state === 'online');
    for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
            primitives.push({
                kind: 'line',
                fromSystemId: visible[i].systemId,
                toSystemId: visible[j].systemId,
                color: gateColor(visible[i]),
                thickness: 2,
                dashed: true,
                flashing: visible[i].overloadTriggered || visible[j].overloadTriggered,
                opacity: 0.5,
                layer: 'gate',
            });
        }
    }
    return primitives;
}

// ── Deep Space overlay ────────────────────────────────────────────────────────
function getDeepSpaceOverlay(factionId: string, world: MovementWorldState): OverlayPrimitive[] {
    const vis = world.factionVisibility.get(factionId) ?? {};
    const primitives: OverlayPrimitive[] = [];

    // Show deep-space fleets as faint dotted trails
    for (const fleet of world.fleets.values()) {
        if (fleet.activeLayer !== 'deepSpace') continue;
        if (!fleet.currentSystemId && fleet.destinationSystemId) {
            const fromSys = fleet.plannedPath[0];
            const toSys = fleet.destinationSystemId;
            // Only visible if from or to is known to faction
            const fromKnown = (vis[fromSys]?.revealStage ?? 'unknown') !== 'unknown';
            const toKnown = (vis[toSys]?.revealStage ?? 'unknown') !== 'unknown';
            // Detectable only if fleet.isDetectable
            if ((fromKnown || toKnown) && fleet.isDetectable) {
                primitives.push({
                    kind: 'line',
                    fromSystemId: fromSys,
                    toSystemId: toSys,
                    color: '#64748b',
                    thickness: 1,
                    dashed: true,
                    flashing: false,
                    opacity: 0.35,
                    layer: 'deepSpace',
                });
            }
        }
    }

    // Instability heat — high instability systems expand deep-space presence
    for (const [sysId, sys] of world.systems) {
        if (sys.instability > config_ds_threshold && (vis[sysId]?.revealStage ?? 'unknown') !== 'unknown') {
            primitives.push({
                kind: 'heatTile',
                systemId: sysId,
                intensity: sys.instability / 100,
                colorScheme: 'purple',
            });
        }
    }

    return primitives;
}

// Inline config reference for deep-space overlay
const config_ds_threshold = 60; // config.movement.deepSpaceExpansionInstabilityThreshold

// ── Influence overlay ─────────────────────────────────────────────────────────
function getInfluenceOverlay(factionId: string, world: MovementWorldState): OverlayPrimitive[] {
    const vis = world.factionVisibility.get(factionId) ?? {};
    const primitives: OverlayPrimitive[] = [];

    for (const [sysId, sys] of world.systems) {
        if ((vis[sysId]?.revealStage ?? 'unknown') === 'unknown') continue;
        if (!sys.ownerFactionId) continue;

        const isSelf = sys.ownerFactionId === factionId;
        primitives.push({
            kind: 'heatTile',
            systemId: sysId,
            intensity: 0.6,
            colorScheme: isSelf ? 'blue' : 'red',
        });
    }
    return primitives;
}

// ─── Fleet card ────────────────────────────────────────────────────────────────

/**
 * Get fleet card data for a specific fleet.
 * Delegates to DoctrineService for posture alignment calculation.
 */
export function getFleetCardData(
    factionId: string,
    fleetId: string,
    world: MovementWorldState
): FleetCardData | null {
    return doctrineFleetCard(factionId, fleetId, world);
}

// ─── Crisis triggers ──────────────────────────────────────────────────────────

/**
 * Return all events from the EventBus log since the given unix-seconds timestamp.
 * Used by the crisis UI layer to surface recent trigger events.
 */
export function getCrisisTriggersSince(sinceSeconds: number): GameEvent[] {
    return eventBus.getEventsSince(sinceSeconds);
}
