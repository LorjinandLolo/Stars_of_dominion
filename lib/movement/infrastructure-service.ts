// lib/movement/infrastructure-service.ts
// Infrastructure degradation (three modes), weaponization hooks,
// traffic rerouting, and rare permanent map reshaping.

import type {
    MovementWorldState,
    InfrastructureDegradation,
    DegradationMode,
    TradeSegment,
    GateObject,
    Corridor,
    ReshapeResult,
    InfraAction,
} from './types';
import { eventBus } from './event-bus';
import config from './movement-config.json';

// ─── Tick degradation ─────────────────────────────────────────────────────────

export interface DegradationResult {
    targetId: string;
    infraType: 'tradeSegment' | 'corridor' | 'gate';
    mode: DegradationMode;
    previousIntegrity: number;
    newIntegrity: number;
    collapsed: boolean;
}

/**
 * Advance all degradation processes by deltaSeconds.
 * Mutates world state in-place (caller should deep-copy if needed).
 * Returns a list of change records for logging/UI.
 */
export function tickDegradation(
    world: MovementWorldState,
    deltaSeconds: number
): DegradationResult[] {
    const results: DegradationResult[] = [];
    const hours = deltaSeconds / 3600;
    const instabCfg = config.infrastructure.degradation;
    const now = world.nowSeconds;

    // 1. Physical entropy on trade segments
    if (availableModes(world).includes('physical')) {
        for (const [id, seg] of world.tradeSegments) {
            if (seg.status === 'collapsed') continue;
            const rate = instabCfg.physical.tradeSegmentRatePerHour * hours;
            const prev = seg.integrity;
            seg.integrity = Math.max(0, seg.integrity - rate);

            if (prev !== seg.integrity) {
                results.push({ targetId: id, infraType: 'tradeSegment', mode: 'physical', previousIntegrity: prev, newIntegrity: seg.integrity, collapsed: seg.integrity === 0 });
                if (seg.integrity === 0) {
                    seg.status = 'collapsed';
                    emitDegradation('tradeSegment', id, 'physical', 1, false, now);
                    attemptReroute(id, world);
                }
            }
        }

        // Physical entropy on corridors
        for (const [id, corridor] of world.corridors) {
            const rate = instabCfg.physical.corridorRatePerHour * hours;
            corridor.militarizationLevel = Math.max(0, corridor.militarizationLevel - rate * 0.5);
        }

        // Physical entropy on gates
        for (const [id, gate] of world.gates) {
            if (gate.state === 'destroyed') continue;
            const rate = instabCfg.physical.gateRatePerHour * hours;
            const prev = gate.integrity;
            gate.integrity = Math.max(0, gate.integrity - rate);
            if (prev !== gate.integrity && gate.integrity < 0.2 && gate.state === 'online') {
                gate.state = 'unstable';
                emitDegradation('gate', id, 'physical', 1 - gate.integrity, false, now);
            }
        }
    }

    // 2. Economic — instability-driven drift
    for (const [id, seg] of world.tradeSegments) {
        const sys = world.systems.get(seg.fromSystemId);
        if (!sys) continue;
        if (sys.instability > instabCfg.economic.instabilityThreshold) {
            const rate = instabCfg.economic.driftRatePerHour * hours;
            const prev = seg.integrity;
            seg.integrity = Math.max(0, seg.integrity - rate);
            if (prev !== seg.integrity) {
                results.push({ targetId: id, infraType: 'tradeSegment', mode: 'economic', previousIntegrity: prev, newIntegrity: seg.integrity, collapsed: seg.integrity === 0 });
                if (seg.integrity === 0) {
                    seg.status = 'collapsed';
                    emitDegradation('tradeSegment', id, 'economic', 1, false, now);
                    attemptReroute(id, world);
                }
            }
        }
    }

    return results;
}

function availableModes(_world: MovementWorldState): DegradationMode[] {
    return ['physical', 'hostile', 'economic'];
}

function emitDegradation(
    infraType: 'tradeSegment' | 'corridor' | 'gate',
    targetId: string,
    mode: DegradationMode,
    severity: number,
    isPermanent: boolean,
    now: number
) {
    eventBus.emit({ type: 'degradationEvent', infraType, targetId, mode, severity, isPermanent, timestamp: now });
}

// ─── Traffic rerouting ─────────────────────────────────────────────────────────

export interface RouteRerouteResult {
    success: boolean;
    newSegmentId?: string;
    altPath?: string[];
}

/**
 * When a trade segment collapses, find an alternate hyperlane path and
 * create a reroute segment.  Emits routeRerouted event.
 */
export function attemptReroute(
    collapsedSegmentId: string,
    world: MovementWorldState
): RouteRerouteResult {
    const seg = world.tradeSegments.get(collapsedSegmentId);
    if (!seg) return { success: false };

    // Find a hyperlane path between seg.from and seg.to
    const altPath = bfsHyperlane(seg.fromSystemId, seg.toSystemId, world);
    if (!altPath) {
        // No path — segment truly isolated; might reshape
        return { success: false };
    }

    // Create a rerouted substitute segment
    const rerouteId = `reroute-${collapsedSegmentId}-${Date.now()}`;
    const rerouteSeg: TradeSegment = {
        id: rerouteId,
        fromSystemId: altPath[0],
        toSystemId: altPath[altPath.length - 1],
        throughput: seg.throughput * 0.65, // reduced capacity on alternate path
        status: 'rerouted',
        isReroute: true,
        integrity: 0.8,
        isFlashing: false,
    };
    world.tradeSegments.set(rerouteId, rerouteSeg);

    eventBus.emit({
        type: 'routeRerouted',
        routeId: collapsedSegmentId,
        oldPath: [seg.fromSystemId, seg.toSystemId],
        newPath: altPath,
        cause: 'collapse',
        timestamp: world.nowSeconds,
    });

    return { success: true, newSegmentId: rerouteId, altPath };
}

function bfsHyperlane(
    from: string,
    to: string,
    world: MovementWorldState
): string[] | null {
    if (from === to) return [from];
    const visited = new Map<string, string>([[from, '']]);
    let frontier = [from];
    while (frontier.length > 0) {
        const next: string[] = [];
        for (const sid of frontier) {
            const sys = world.systems.get(sid);
            for (const n of sys?.hyperlaneNeighbors ?? []) {
                if (!visited.has(n)) {
                    visited.set(n, sid);
                    if (n === to) {
                        // Reconstruct
                        const path: string[] = [n];
                        let cur = n;
                        while (cur !== from) { cur = visited.get(cur)!; path.unshift(cur); }
                        return path;
                    }
                    next.push(n);
                }
            }
        }
        frontier = next;
    }
    return null;
}

// ─── Hostile degradation (direct) ─────────────────────────────────────────────

/**
 * Apply hostile action directly to an infrastructure target.
 * Returns updated integrity and emits events.
 */
export function applyHostileDegradation(
    infraType: 'tradeSegment' | 'corridor' | 'gate',
    targetId: string,
    intensity: number,
    attackerFactionId: string,
    world: MovementWorldState
): { newIntegrity: number; collapsed: boolean } {
    const hostileCfg = config.infrastructure.degradation.hostile;
    const now = world.nowSeconds;

    if (infraType === 'tradeSegment') {
        const seg = world.tradeSegments.get(targetId);
        if (!seg) return { newIntegrity: 1, collapsed: false };
        const damage = hostileCfg.sabotageImpact * intensity;
        seg.integrity = Math.max(0, seg.integrity - damage);
        seg.isFlashing = true;
        if (seg.integrity === 0) {
            seg.status = 'collapsed';
            emitDegradation('tradeSegment', targetId, 'hostile', damage, false, now);
            attemptReroute(targetId, world);
        }
        return { newIntegrity: seg.integrity, collapsed: seg.integrity === 0 };
    }

    if (infraType === 'gate') {
        const gate = world.gates.get(targetId);
        if (!gate) return { newIntegrity: 1, collapsed: false };
        const damage = hostileCfg.gateOverloadImpact * intensity;
        gate.integrity = Math.max(0, gate.integrity - damage);
        if (gate.integrity < 0.1) gate.state = 'sabotaged';
        emitDegradation('gate', targetId, 'hostile', damage, gate.integrity < 0.1, now);
        return { newIntegrity: gate.integrity, collapsed: gate.integrity < 0.1 };
    }

    if (infraType === 'corridor') {
        const corridor = world.corridors.get(targetId);
        if (!corridor) return { newIntegrity: 1, collapsed: false };
        const damage = hostileCfg.sabotageImpact * intensity * 0.5;
        corridor.militarizationLevel = Math.min(1, corridor.militarizationLevel + damage);
        emitDegradation('corridor', targetId, 'hostile', damage, false, now);
        return { newIntegrity: 1 - corridor.militarizationLevel, collapsed: false };
    }

    return { newIntegrity: 1, collapsed: false };
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

/**
 * Advance recovery on a specific infrastructure target.
 * Recovers are slow, config-driven.
 */
export function recoverInfrastructure(
    infraType: 'tradeSegment' | 'corridor' | 'gate',
    targetId: string,
    world: MovementWorldState,
    deltaSeconds: number
): void {
    const hours = deltaSeconds / 3600;
    const rate = config.infrastructure.recovery.baseRatePerHour * hours;

    if (infraType === 'tradeSegment') {
        const seg = world.tradeSegments.get(targetId);
        if (!seg || seg.status === 'active') return;
        seg.integrity = Math.min(1, seg.integrity + rate);
        seg.isFlashing = false;
        if (seg.integrity >= config.infrastructure.recovery.fullRestorationThreshold) {
            seg.status = 'active';
        } else if (seg.integrity >= config.infrastructure.recovery.repairedAlteredThreshold) {
            seg.status = 'rerouted'; // recovered but altered
        }
    }

    if (infraType === 'gate') {
        const gate = world.gates.get(targetId);
        if (!gate || gate.state === 'online') return;
        gate.integrity = Math.min(1, gate.integrity + rate * 0.5); // gates recover slower
        if (gate.integrity >= config.infrastructure.recovery.fullRestorationThreshold) {
            gate.state = 'online';
        } else if (gate.integrity > 0.3) {
            gate.state = 'unstable';
        }
    }
}

// ─── Rare permanent reshaping ──────────────────────────────────────────────────

/**
 * Attempt a permanent map reshape event.  Very low probability (config-gated).
 * Only triggered when multiple collapses coincide or hostile intensity is extreme.
 */
export function attemptReshape(
    trigger: 'multipleCollapse' | 'extremeHostile' | 'gateCataclysm',
    world: MovementWorldState
): ReshapeResult | null {
    const reshapeCfg = config.infrastructure.reshape;
    const roll = Math.random();

    if (roll > reshapeCfg.reshapeBaseProb) return null; // Most of the time: no reshape

    const result: ReshapeResult = {
        isPermanent: true,
        newLinks: [],
        fracturedCorridorIds: [],
        newDeepSpacePaths: [],
        narrative: '',
    };

    // Permanent link formation (e.g. a new hyperlane forms from debris network)
    if (Math.random() < reshapeCfg.permanentLinkFormationProb) {
        const sysArray = [...world.systems.values()];
        const a = sysArray[Math.floor(Math.random() * sysArray.length)];
        const b = sysArray[Math.floor(Math.random() * sysArray.length)];
        if (a.id !== b.id) {
            a.hyperlaneNeighbors.push(b.id);
            b.hyperlaneNeighbors.push(a.id);
            result.newLinks.push({ fromSystemId: a.id, toSystemId: b.id });
            result.narrative += `New unstable hyperlane formed between ${a.name} and ${b.name}. `;
        }
    }

    // Corridor fracture
    if (Math.random() < reshapeCfg.corridorFractureProb) {
        const corridors = [...world.corridors.values()];
        const target = corridors[Math.floor(Math.random() * corridors.length)];
        if (target && target.nodeIds.length >= 4) {
            const splitIdx = Math.floor(target.nodeIds.length / 2);
            const fragA = { ...target, id: `${target.id}-a`, nodeIds: target.nodeIds.slice(0, splitIdx), chokepointIds: [] };
            const fragB = { ...target, id: `${target.id}-b`, nodeIds: target.nodeIds.slice(splitIdx), chokepointIds: [] };
            world.corridors.delete(target.id);
            world.corridors.set(fragA.id, fragA);
            world.corridors.set(fragB.id, fragB);
            result.fracturedCorridorIds.push(target.id);
            result.narrative += `Corridor "${target.name}" has fractured permanently into two isolated segments. `;
        }
    }

    // Deep space expansion
    const sysArray = [...world.systems.values()];
    const expandingSys = sysArray.find(s => s.instability > 70);
    if (expandingSys) {
        const neighbor = sysArray.find(s => s.id !== expandingSys.id && !expandingSys.hyperlaneNeighbors.includes(s.id));
        if (neighbor) {
            result.newDeepSpacePaths.push({ fromSystemId: expandingSys.id, toSystemId: neighbor.id });
            result.narrative += `Instability in ${expandingSys.name} has opened new deep-space drift lanes. `;
        }
    }

    if (result.newLinks.length === 0 && result.fracturedCorridorIds.length === 0 && result.newDeepSpacePaths.length === 0) {
        return null;
    }

    eventBus.emit({
        type: 'reshapeEvent',
        narrative: result.narrative.trim(),
        newLinks: result.newLinks,
        fracturedCorridorIds: result.fracturedCorridorIds,
        newDeepSpacePaths: result.newDeepSpacePaths,
        timestamp: world.nowSeconds,
    });

    return result;
}
