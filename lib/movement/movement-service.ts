// lib/movement/movement-service.ts
// Multi-layer fleet pathing, continuous-time travel, weaponized infrastructure.

import type {
    Fleet,
    MovementLayer,
    MovementWorldState,
    FleetOrder,
    SystemNode,
    GateObject,
    TradeSegment,
    Corridor,
    InfraAction,
    InfraActionType,
    ReshapeResult,
} from './types';
import { eventBus } from './event-bus';
import config from './movement-config.json';

// ─── Layer graph building ──────────────────────────────────────────────────────

type LayerEdge = {
    from: string;
    to: string;
    layer: MovementLayer;
    baseTravelSeconds: number;
};

/**
 * Build a composite adjacency map across all available layers.
 * Each edge carries its layer tag so per-layer modifiers can be applied.
 */
function buildLayerGraph(
    world: MovementWorldState,
    availableLayers: MovementLayer[]
): Map<string, LayerEdge[]> {
    const adj = new Map<string, LayerEdge[]>();

    const addEdge = (from: string, to: string, layer: MovementLayer, cost: number) => {
        if (!adj.has(from)) adj.set(from, []);
        adj.get(from)!.push({ from, to, layer, baseTravelSeconds: cost });
    };

    const baseSpeed = config.movement.baseSpeedUnitsPerSecond;

    // 1. Hyperlanes — always available unless explicitly excluded.
    if (availableLayers.includes('hyperlane')) {
        for (const [, sys] of world.systems) {
            for (const neighborId of sys.hyperlaneNeighbors) {
                const cost = (1 / (baseSpeed * config.movement.layerSpeedMultipliers.hyperlane)) * 3600;
                addEdge(sys.id, neighborId, 'hyperlane', cost);
            }
        }
    }

    // 2. Trade route segments — bidirectional.
    if (availableLayers.includes('trade')) {
        for (const [, seg] of world.tradeSegments) {
            if (seg.status === 'active' || seg.status === 'rerouted') {
                const cost = (1 / (baseSpeed * config.movement.layerSpeedMultipliers.trade)) * 3600;
                addEdge(seg.fromSystemId, seg.toSystemId, 'trade', cost);
                addEdge(seg.toSystemId, seg.fromSystemId, 'trade', cost);
            }
        }
    }

    // 3. Strategic corridors — all nodes in a corridor can traverse to each other.
    if (availableLayers.includes('corridor')) {
        for (const [, corridor] of world.corridors) {
            const nodeIds = corridor.nodeIds;
            const cost = (1 / (baseSpeed * config.movement.layerSpeedMultipliers.corridor)) * 3600;
            for (let i = 0; i < nodeIds.length - 1; i++) {
                const from = nodeIds[i];
                const to = nodeIds[i + 1];
                if (!corridor.denialFieldActive) {
                    addEdge(from, to, 'corridor', cost);
                    addEdge(to, from, 'corridor', cost);
                }
            }
        }
    }

    // 4. Gates — only between online gates; access policies enforced later.
    if (availableLayers.includes('gate')) {
        const onlineGates = [...world.gates.values()].filter(g => g.state === 'online');
        const cost = (1 / (baseSpeed * config.movement.layerSpeedMultipliers.gate)) * 3600;
        for (let i = 0; i < onlineGates.length; i++) {
            for (let j = i + 1; j < onlineGates.length; j++) {
                const a = onlineGates[i];
                const b = onlineGates[j];
                addEdge(a.systemId, b.systemId, 'gate', cost);
                addEdge(b.systemId, a.systemId, 'gate', cost);
            }
        }
    }

    // 5. Deep space — connect all systems with higher cost (off-network).
    if (availableLayers.includes('deepSpace')) {
        const sysArray = [...world.systems.values()];
        const cost = (1 / (baseSpeed * config.movement.layerSpeedMultipliers.deepSpace)) * 3600;
        for (const a of sysArray) {
            for (const b of sysArray) {
                if (a.id !== b.id) {
                    addEdge(a.id, b.id, 'deepSpace', cost);
                }
            }
        }
    }

    return adj;
}

// ─── Effective edge cost per fleet ────────────────────────────────────────────

function effectiveEdgeCost(
    edge: LayerEdge,
    fleet: Fleet,
    world: MovementWorldState
): number {
    const profile = fleet.hyperdriveProfile[edge.layer];
    // Speed modifier: higher = faster = lower time cost
    let cost = edge.baseTravelSeconds / (profile?.speedMultiplier ?? 1.0);

    // Gate: add cooldown penalty if recently jumped
    if (edge.layer === 'gate') {
        cost += config.movement.gateJumpCooldownSeconds * 0.5; // amortized
    }

    // Deep space: add risk-adjusted penalty
    if (edge.layer === 'deepSpace') {
        const riskPenalty = config.movement.deepSpaceBaseRiskPerHop * 3600;
        cost += riskPenalty;
    }

    // Gate access policy check 
    const targetSys = world.systems.get(edge.to);
    if (edge.layer === 'gate' && targetSys?.gateId) {
        const gate = world.gates.get(targetSys.gateId);
        if (gate) {
            if (gate.accessPolicy === 'closed') return Infinity;
            if (
                gate.accessPolicy === 'restricted' &&
                !gate.allowedFactionIds.includes(fleet.factionId)
            ) return Infinity;
        }
    }

    return cost;
}

// ─── Dijkstra across layer graph ──────────────────────────────────────────────

interface LayerPathResult {
    path: string[];        // system IDs
    layerPerHop: MovementLayer[];
    totalSeconds: number;
}

function dijkstraLayered(
    from: string,
    to: string,
    fleet: Fleet,
    adj: Map<string, LayerEdge[]>,
    world: MovementWorldState
): LayerPathResult | null {
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const prevLayer = new Map<string, MovementLayer>();
    const visited = new Set<string>();
    // Simple priority queue via sorted array (sufficient for ≤500 nodes)
    const pq: { node: string; cost: number }[] = [];

    dist.set(from, 0);
    pq.push({ node: from, cost: 0 });

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        const { node: current } = pq.shift()!;

        if (visited.has(current)) continue;
        visited.add(current);

        if (current === to) break;

        const edges = adj.get(current) ?? [];
        for (const edge of edges) {
            if (visited.has(edge.to)) continue;
            const cost = effectiveEdgeCost(edge, fleet, world);
            if (cost === Infinity) continue;
            const newDist = (dist.get(current) ?? Infinity) + cost;
            if (newDist < (dist.get(edge.to) ?? Infinity)) {
                dist.set(edge.to, newDist);
                prev.set(edge.to, current);
                prevLayer.set(edge.to, edge.layer);
                pq.push({ node: edge.to, cost: newDist });
            }
        }
    }

    if (!dist.has(to) || dist.get(to) === Infinity) return null;

    // Reconstruct path
    const path: string[] = [];
    const layers: MovementLayer[] = [];
    let cur: string | undefined = to;
    while (cur && cur !== from) {
        path.unshift(cur);
        const l = prevLayer.get(cur);
        if (l) layers.unshift(l);
        cur = prev.get(cur);
    }
    path.unshift(from);

    return { path, layerPerHop: layers, totalSeconds: dist.get(to)! };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FindPathResult extends LayerPathResult {
    eta: number;   // absolute unix seconds ETA
    canReach: boolean;
}

/**
 * Find the optimal path for a fleet across available movement layers.
 */
export function findPath(
    fleet: Fleet,
    targetSystemId: string,
    availableLayers: MovementLayer[],
    world: MovementWorldState
): FindPathResult {
    const adj = buildLayerGraph(world, availableLayers);
    const fromId = fleet.currentSystemId ?? fleet.destinationSystemId;
    if (!fromId) return { path: [], layerPerHop: [], totalSeconds: 0, eta: world.nowSeconds, canReach: false };

    const result = dijkstraLayered(fromId, targetSystemId, fleet, adj, world);
    if (!result) return { path: [], layerPerHop: [], totalSeconds: 0, eta: world.nowSeconds, canReach: false };

    return {
        ...result,
        eta: world.nowSeconds + result.totalSeconds,
        canReach: true,
    };
}

/**
 * Issue movement orders to a fleet and commit the path into the fleet state.
 * Returns the updated fleet (immutably).
 */
export function issueMoveOrder(
    fleet: Fleet,
    targetSystemId: string,
    layer: MovementLayer,
    world: MovementWorldState
): Fleet {
    const result = findPath(fleet, targetSystemId, [layer, 'hyperlane'], world);
    if (!result.canReach) return fleet;

    const order: FleetOrder = {
        type: 'move',
        targetSystemId,
        preferredLayer: layer,
        issuedAt: new Date(world.nowSeconds * 1000).toISOString(),
    };

    return {
        ...fleet,
        plannedPath: result.path,
        destinationSystemId: targetSystemId,
        etaSeconds: result.totalSeconds,
        transitProgress: 0,
        orders: [...fleet.orders, order].slice(-config.movement.orderQueueMaxLength),
    };
}

/**
 * Advance a fleet along its planned route by deltaSeconds.
 * Returns the updated fleet and emits hostileEntry if applicable.
 */
export function advanceFleet(
    fleet: Fleet,
    deltaSeconds: number,
    world: MovementWorldState
): Fleet {
    if (!fleet.destinationSystemId || fleet.plannedPath.length < 2) return fleet;

    const hopFrom = fleet.plannedPath[0];
    const hopTo = fleet.plannedPath[1];
    const adj = buildLayerGraph(world, ['hyperlane', 'trade', 'corridor', 'gate', 'deepSpace']);
    const hopEdges = (adj.get(hopFrom) ?? []).filter(e => e.to === hopTo);
    if (hopEdges.length === 0) return fleet;

    const edge = hopEdges[0];
    const hopCost = effectiveEdgeCost(edge, fleet, world);
    const progressGain = deltaSeconds / hopCost; // fraction of this hop completed

    const newProgress = fleet.transitProgress + progressGain;

    if (newProgress >= 1.0) {
        // Completed this hop — move to next system
        const updatedPath = fleet.plannedPath.slice(1);
        const arrived = updatedPath.length === 1; // final destination reached

        // Check for hostile entry
        const targetSys = world.systems.get(hopTo);
        if (targetSys?.ownerFactionId && targetSys.ownerFactionId !== fleet.factionId) {
            eventBus.emit({
                type: 'hostileEntry',
                fleetId: fleet.id,
                systemId: hopTo,
                ownerFactionId: targetSys.ownerFactionId,
                intruderFactionId: fleet.factionId,
                layer: edge.layer,
                timestamp: world.nowSeconds,
            });
        }

        return {
            ...fleet,
            currentSystemId: arrived ? hopTo : null,
            destinationSystemId: arrived ? null : fleet.destinationSystemId,
            transitProgress: arrived ? 0 : newProgress - 1.0,
            plannedPath: arrived ? [] : updatedPath,
            activeLayer: arrived ? null : edge.layer,
            etaSeconds: Math.max(0, fleet.etaSeconds - deltaSeconds),
        };
    }

    return {
        ...fleet,
        transitProgress: newProgress,
        currentSystemId: null,
        activeLayer: edge.layer,
        etaSeconds: Math.max(0, fleet.etaSeconds - deltaSeconds),
        isDetectable: computeDetectability(fleet, edge.layer),
    };
}

function computeDetectability(fleet: Fleet, layer: MovementLayer): boolean {
    const base = config.movement.layerDetectabilityMultipliers[layer] ?? 1.0;
    const profile = fleet.hyperdriveProfile[layer];
    const eff = base * (profile?.detectabilityMultiplier ?? 1.0);
    return eff > 0.3; // threshold for sensor ping to detect
}

/**
 * Check whether a fleet has valid access to a movement layer.
 */
export function canAccessLayer(
    fleet: Fleet,
    layer: MovementLayer,
    world: MovementWorldState
): boolean {
    if (layer !== 'gate') return true;
    const currentSys = fleet.currentSystemId ? world.systems.get(fleet.currentSystemId) : undefined;
    if (!currentSys?.gateId) return false;
    const gate = world.gates.get(currentSys.gateId);
    if (!gate || gate.state !== 'online') return false;
    if (gate.accessPolicy === 'closed') return false;
    if (gate.accessPolicy === 'restricted' && !gate.allowedFactionIds.includes(fleet.factionId)) return false;
    return true;
}

// ─── Weaponized Infrastructure Actions ────────────────────────────────────────

export interface WeaponizeResult {
    success: boolean;
    message: string;
    severity: number;
}

/**
 * Apply an infrastructure weaponization action and emit the appropriate events.
 */
export function weaponizeInfra(
    action: InfraAction,
    world: MovementWorldState
): WeaponizeResult {
    const now = world.nowSeconds;

    switch (action.type) {
        case 'blockade': {
            const sys = world.systems.get(action.targetId);
            if (!sys) return { success: false, message: 'System not found', severity: 0 };

            eventBus.emit({
                type: 'blockadeStarted',
                fleetId: 'unknown',
                systemId: action.targetId,
                factionId: action.actorFactionId,
                timestamp: now,
            });
            eventBus.emit({
                type: 'infrastructureAttack',
                actionType: action.type,
                targetId: action.targetId,
                attackerFactionId: action.actorFactionId,
                severity: action.intensity,
                timestamp: now,
            });
            return { success: true, message: `Blockade started at ${sys.name}`, severity: action.intensity };
        }

        case 'disruptRoute': {
            eventBus.emit({
                type: 'infrastructureAttack',
                actionType: action.type,
                targetId: action.targetId,
                attackerFactionId: action.actorFactionId,
                severity: action.intensity,
                timestamp: now,
            });
            eventBus.emit({
                type: 'routeRerouted',
                routeId: action.targetId,
                oldPath: [],
                newPath: [],
                cause: 'blockade',
                timestamp: now,
            });
            return { success: true, message: `Route ${action.targetId} disrupted`, severity: action.intensity };
        }

        case 'sabotageGate':
        case 'overloadGate':
        case 'closeGate': {
            const gate = world.gates.get(action.targetId);
            if (!gate) return { success: false, message: 'Gate not found', severity: 0 };

            const roll = Math.random();
            const successChance = config.infrastructure.weaponization.sabotageSuccessBase * action.intensity;
            if (roll > successChance) {
                return { success: false, message: 'Sabotage failed', severity: 0 };
            }

            const reason = action.type === 'closeGate' ? 'policy' :
                action.type === 'overloadGate' ? 'overload' : 'sabotage';

            eventBus.emit({
                type: 'gateClosed',
                gateId: gate.id,
                systemId: gate.systemId,
                closedByFactionId: action.actorFactionId,
                reason,
                timestamp: now,
            });
            eventBus.emit({
                type: 'infrastructureAttack',
                actionType: action.type,
                targetId: action.targetId,
                attackerFactionId: action.actorFactionId,
                severity: action.intensity,
                timestamp: now,
            });
            return { success: true, message: `Gate ${gate.id} ${reason}`, severity: action.intensity };
        }

        case 'militarizeCorridor':
        case 'activateDenialField': {
            eventBus.emit({
                type: 'infrastructureAttack',
                actionType: action.type,
                targetId: action.targetId,
                attackerFactionId: action.actorFactionId,
                severity: action.intensity,
                timestamp: now,
            });
            return { success: true, message: `Corridor ${action.targetId} militarized`, severity: action.intensity };
        }

        case 'openShadowHub':
        case 'establishSmugglersLane': {
            // Deep-space weaponization — increases hidden activity, tracked as an instability source
            eventBus.emit({
                type: 'infrastructureAttack',
                actionType: action.type,
                targetId: action.targetId,
                attackerFactionId: action.actorFactionId,
                severity: action.intensity,
                timestamp: now,
            });
            return { success: true, message: `${action.type} established`, severity: action.intensity };
        }

        default:
            return { success: false, message: 'Unknown action type', severity: 0 };
    }
}
