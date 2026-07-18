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
            // Snapshot-loaded systems can be missing the neighbors array entirely.
            for (const neighborId of sys.hyperlaneNeighbors ?? []) {
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
    // Speed modifier: higher = faster = lower time cost. A zero/negative/missing
    // multiplier (e.g. a fleet with no deep-space drive, or a partial snapshot
    // profile) must NOT divide to Infinity/NaN — that froze the fleet at 0%.
    const speedMult = profile && profile.speedMultiplier > 0 ? profile.speedMultiplier : 1.0;
    let cost = edge.baseTravelSeconds / speedMult;

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
/**
 * Travel time for a direct deep-space crossing between two systems (no lane).
 * Cost scales with hex distance, at the (slow) deepSpace layer speed.
 */
export function deepSpaceHopSeconds(
    fromId: string,
    toId: string,
    world: MovementWorldState
): number | null {
    const a: any = world.systems.get(fromId);
    const b: any = world.systems.get(toId);
    // Only bail when a system genuinely doesn't exist. Coordinates can be missing
    // on snapshot-loaded systems — in that case fall back to a nominal 1-hex
    // crossing so the fleet still moves instead of freezing at 0% forever.
    if (!a || !b) return null;
    let hexDist = 1;
    if (a.q !== undefined && b.q !== undefined && a.r !== undefined && b.r !== undefined) {
        const dq = a.q - b.q;
        const dr = a.r - b.r;
        hexDist = Math.max(1, (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2);
    }
    const speedMult = (config.movement.layerSpeedMultipliers as any).deepSpace ?? 0.5;
    const perHex = (1 / (config.movement.baseSpeedUnitsPerSecond * speedMult)) * 3600;
    return hexDist * perHex;
}

/**
 * Pick a real system to anchor a stranded fleet to. Prefers the last known
 * waypoint on its planned route (the origin of the current hop), then its
 * current/destination system, then any system as a last resort.
 */
function nearestKnownSystem(fleet: Fleet, world: MovementWorldState): string | null {
    for (const id of fleet.plannedPath ?? []) {
        if (world.systems.has(id)) return id;
    }
    if (fleet.currentSystemId && world.systems.has(fleet.currentSystemId)) return fleet.currentSystemId;
    if (fleet.destinationSystemId && world.systems.has(fleet.destinationSystemId)) return fleet.destinationSystemId;
    const first = world.systems.keys().next();
    return first.done ? null : first.value;
}

/**
 * Rescue a fleet whose movement state is invalid/irrecoverable (no valid path,
 * NaN/Infinity hop cost, unknown hop endpoint). Instead of leaving it invisible
 * in limbo forever, snap it to a real system, clear its transit state, and warn.
 * Also repairs already-vanished fleets sitting in existing saves.
 */
export function recoverStrandedFleet(
    fleet: Fleet,
    world: MovementWorldState,
    reason: string
): Fleet {
    const snapTo = nearestKnownSystem(fleet, world);
    if (!snapTo) {
        // Truly nothing to snap to (empty world). Leave the fleet untouched.
        console.warn(`[Movement] Fleet ${fleet.id} stranded (${reason}) but no system exists to recover to.`);
        return fleet;
    }
    console.warn(`[Movement] Fleet ${fleet.id} stranded (${reason}); snapping to ${snapTo} and clearing transit.`);
    return {
        ...fleet,
        currentSystemId: snapTo,
        destinationSystemId: null,
        originSystemId: null,
        plannedPath: [],
        transitProgress: 0,
        activeLayer: null,
        etaSeconds: 0,
    };
}

export function issueMoveOrder(
    fleet: Fleet,
    targetSystemId: string,
    layer: MovementLayer,
    world: MovementWorldState
): Fleet {
    const result = findPath(fleet, targetSystemId, [layer, 'hyperlane'], world);

    // Where this journey began. Recorded once from the parked departure system
    // and preserved across mid-transit reroutes so return-to-origin has a target.
    const originSystemId = fleet.originSystemId ?? fleet.currentSystemId ?? null;

    const order: FleetOrder = {
        type: 'move',
        targetSystemId,
        preferredLayer: layer,
        issuedAt: new Date(world.nowSeconds * 1000).toISOString(),
    };

    if (!result.canReach) {
        // No lane route exists (disconnected graph or unmapped region). The old
        // behavior silently returned the fleet unchanged — the player's move
        // order evaporated with zero feedback. Fall back to a direct deep-space
        // crossing: slower, but ANY system is reachable.
        const from = fleet.currentSystemId ?? fleet.plannedPath?.[0];
        if (!from) return fleet;
        const secs = deepSpaceHopSeconds(from, targetSystemId, world);
        if (secs == null) return fleet;
        console.log(`[Movement] No lane path ${from} → ${targetSystemId}; engaging deep-space drive (${Math.round(secs)}s game-time).`);
        return {
            ...fleet,
            plannedPath: [from, targetSystemId],
            destinationSystemId: targetSystemId,
            originSystemId,
            etaSeconds: secs,
            transitProgress: 0,
            activeLayer: 'deepSpace' as MovementLayer,
            orders: [...fleet.orders, order].slice(-config.movement.orderQueueMaxLength),
        };
    }

    return {
        ...fleet,
        plannedPath: result.path,
        destinationSystemId: targetSystemId,
        originSystemId,
        etaSeconds: result.totalSeconds,
        transitProgress: 0,
        orders: [...fleet.orders, order].slice(-config.movement.orderQueueMaxLength),
    };
}

/**
 * Redirect a fleet to a new destination, handling the in-transit case cleanly.
 *
 * A parked fleet (or one with no meaningful hop underway) simply receives a
 * fresh move order. A fleet mid-hop finishes its current hop, then reroutes from
 * that waypoint toward the new target — hop progress and the recorded origin
 * system are preserved, so a subsequent return-to-origin still works.
 *
 * Course-change semantics: we finish the current hop rather than reversing
 * mid-hop. This keeps transit bookkeeping simple (no fractional back-tracking)
 * and matches how the fleet is already committed to the lane it is traversing.
 */
export function changeFleetCourse(
    fleet: Fleet,
    targetSystemId: string,
    layer: MovementLayer,
    world: MovementWorldState
): Fleet {
    // Parked, or nothing meaningful in transit — a plain move order suffices.
    if (fleet.currentSystemId || (fleet.plannedPath?.length ?? 0) < 2) {
        return issueMoveOrder(fleet, targetSystemId, layer, world);
    }

    const hopFrom = fleet.plannedPath[0];
    const hopTo = fleet.plannedPath[1];

    // New target IS the next waypoint — just truncate the route there.
    if (hopTo === targetSystemId) {
        return {
            ...fleet,
            destinationSystemId: hopTo,
            plannedPath: [hopFrom, hopTo],
        };
    }

    // Plan the new route from the waypoint the fleet is heading toward.
    const atWaypoint: Fleet = {
        ...fleet,
        currentSystemId: hopTo,
        destinationSystemId: null,
        plannedPath: [],
        transitProgress: 0,
    };
    const rerouted = issueMoveOrder(atWaypoint, targetSystemId, layer, world);
    if (!rerouted.destinationSystemId) {
        // No plottable route from the next waypoint — hold the current course
        // rather than stranding the fleet with a broken path.
        return fleet;
    }

    return {
        ...rerouted,
        currentSystemId: null,
        // rerouted.plannedPath starts at hopTo; prepend the hop already in progress.
        plannedPath: [hopFrom, ...rerouted.plannedPath],
        transitProgress: fleet.transitProgress,
        activeLayer: fleet.activeLayer,
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
    // Nothing to do — fleet is parked.
    if (!fleet.destinationSystemId) return fleet;

    // Destination set but no usable route (e.g. a legacy/limbo save whose planned
    // path was lost). Rescue rather than silently returning every tick, which left
    // the fleet frozen and — if mid-hop with a null currentSystemId — invisible.
    if ((fleet.plannedPath?.length ?? 0) < 2) {
        return recoverStrandedFleet(fleet, world, 'destination set but no planned path');
    }

    const hopFrom = fleet.plannedPath[0];
    const hopTo = fleet.plannedPath[1];
    const adj = buildLayerGraph(world, ['hyperlane', 'trade', 'corridor', 'gate', 'deepSpace']);
    const candidateEdges = (adj.get(hopFrom) ?? []).filter(e => e.to === hopTo);

    let edge: LayerEdge;
    if (candidateEdges.length === 0) {
        // No graph edge for this hop — it's a raw deep-space crossing (or an
        // endpoint missing from the system map). Synthesize the edge so the fleet
        // still advances (previously it froze forever at 0%).
        const secs = deepSpaceHopSeconds(hopFrom, hopTo, world);
        if (secs == null) return recoverStrandedFleet(fleet, world, `unknown hop endpoint ${hopFrom}→${hopTo}`);
        edge = { from: hopFrom, to: hopTo, layer: 'deepSpace' as MovementLayer, baseTravelSeconds: secs };
    } else {
        // Pick the cheapest still-traversable edge. A gate/lane may have closed
        // since the route was planned; taking the first edge blindly could land on
        // an Infinity-cost hop and freeze the fleet. Deep-space is always an option.
        edge = candidateEdges
            .map(e => ({ e, cost: effectiveEdgeCost(e, fleet, world) }))
            .sort((x, y) => x.cost - y.cost)[0].e;
    }
    const hopCost = effectiveEdgeCost(edge, fleet, world);
    if (!Number.isFinite(hopCost) || hopCost <= 0) {
        // Every candidate for this hop is impassable/degenerate. Recover instead of
        // dividing to Infinity/NaN and freezing the fleet in transit.
        return recoverStrandedFleet(fleet, world, `no traversable edge ${hopFrom}→${hopTo} (cost=${hopCost})`);
    }
    const progressGain = deltaSeconds / hopCost; // fraction of this hop completed

    const newProgress = fleet.transitProgress + progressGain;
    if (!Number.isFinite(newProgress)) {
        return recoverStrandedFleet(fleet, world, 'non-finite transit progress');
    }

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
            originSystemId: arrived ? null : fleet.originSystemId,
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
