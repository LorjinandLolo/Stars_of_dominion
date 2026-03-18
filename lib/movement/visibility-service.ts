// lib/movement/visibility-service.ts
// Fog-of-war and sensor fusion per faction.

import type {
    MovementWorldState,
    FactionVisibility,
    SystemVisibilityEntry,
    SensorSource,
    RevealStage,
    Fleet,
    OverlayPrimitive,
    OverlayType,
    SystemNode,
} from './types';
import config from './movement-config.json';

// ─── Sensor fusion ─────────────────────────────────────────────────────────────

/**
 * Returns hex-grid hop distance between two systems using BFS on hyperlane adjacency.
 * Capped at maxHops for performance.
 */
function hopDistance(
    fromId: string,
    toId: string,
    systems: Map<string, SystemNode>,
    maxHops = 12
): number {
    if (fromId === toId) return 0;
    const visited = new Set<string>([fromId]);
    let frontier = [fromId];
    let hops = 0;
    while (frontier.length > 0 && hops < maxHops) {
        hops++;
        const next: string[] = [];
        for (const sid of frontier) {
            const sys = systems.get(sid);
            for (const n of sys?.hyperlaneNeighbors ?? []) {
                if (n === toId) return hops;
                if (!visited.has(n)) { visited.add(n); next.push(n); }
            }
        }
        frontier = next;
    }
    return Infinity;
}

/**
 * Effective strength of a sensor source at a target system.
 * Decays exponentially with distance.
 */
function sensorStrengthAt(
    source: SensorSource,
    targetSystemId: string,
    systems: Map<string, SystemNode>
): number {
    const d = hopDistance(source.systemId, targetSystemId, systems);
    if (d > source.detectionRadius) return 0;
    const decay = config.visibility.sensorDecayExponent;
    // Exponential decay: strength × (1 - d/radius)^decay
    const ratio = (source.detectionRadius - d) / Math.max(source.detectionRadius, 1);
    return source.detectionStrength * Math.pow(ratio, decay);
}

/**
 * Aggregate all sensor sources for a faction and produce a normalised
 * strength value (0–1) per system.
 */
function aggregateSensorCoverage(
    factionId: string,
    sources: SensorSource[],
    systems: Map<string, SystemNode>
): Map<string, number> {
    const coverage = new Map<string, number>();
    const factionSources = sources.filter(s => s.factionId === factionId);

    for (const sys of systems.values()) {
        let strength = 0;
        for (const src of factionSources) {
            strength = Math.min(1, strength + sensorStrengthAt(src, sys.id, systems));
        }
        if (strength > 0) coverage.set(sys.id, strength);
    }
    return coverage;
}

function strengthToRevealStage(strength: number): RevealStage {
    const c = config.visibility;
    if (strength >= c.minimumStrengthForSurvey) return 'surveyed';
    if (strength >= c.minimumStrengthForScan) return 'scanned';
    if (strength >= c.minimumStrengthForPing) return 'pinged';
    return 'unknown';
}

function visibleTagsForStage(stage: RevealStage, sys: SystemNode): string[] {
    if (stage === 'unknown') return [];
    const reveal = sys.tagReveal;
    const stagesInOrder: RevealStage[] = ['pinged', 'scanned', 'surveyed'];
    const visible: string[] = [];
    for (const s of stagesInOrder) {
        visible.push(...(reveal.revealedAt[s] ?? []));
        if (s === stage) break;
    }
    return [...new Set(visible)];
}

function observedFleets(
    targetSystemId: string,
    sensorStrength: number,
    allFleets: Map<string, Fleet>
): string[] {
    if (sensorStrength < config.visibility.minimumStrengthForPing) return [];
    return [...allFleets.values()]
        .filter(f => f.currentSystemId === targetSystemId && f.isDetectable)
        .map(f => f.id);
}

function movementIntentVisible(sensorStrength: number, fleet: Fleet): boolean {
    // Movement intent (destination) is only visible above scan threshold
    return sensorStrength >= config.visibility.minimumStrengthForScan && fleet.isDetectable;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a full per-system visibility snapshot for one faction.
 * Call this every major tick or when sensor sources change.
 */
export function computeVisibility(
    factionId: string,
    world: MovementWorldState
): FactionVisibility {
    const coverage = aggregateSensorCoverage(factionId, world.sensorSources, world.systems);
    const nowISO = new Date(world.nowSeconds * 1000).toISOString();
    const visibility: FactionVisibility = {};

    for (const [sysId, sys] of world.systems) {
        const strength = coverage.get(sysId) ?? 0;
        const stage = strengthToRevealStage(strength);

        // Preserve previous reveal stage (never downgrade past pinged even when out of range)
        const existing = world.factionVisibility.get(factionId)?.[sysId];
        const effectiveStage: RevealStage = existing
            ? pickHigherStage(existing.revealStage, stage)
            : stage;

        const fleetsHere = [...world.fleets.values()].filter(
            f => f.currentSystemId === sysId && f.factionId !== factionId
        );
        const observedFl = strength >= config.visibility.minimumStrengthForPing
            ? fleetsHere.filter(f => f.isDetectable).map(f => f.id)
            : [];

        const hasMovementHint = fleetsHere.some(f =>
            movementIntentVisible(strength, f)
        );

        visibility[sysId] = {
            revealStage: effectiveStage,
            lastSeenAt: strength > 0 ? nowISO : (existing?.lastSeenAt ?? ''),
            visibleTags: visibleTagsForStage(effectiveStage, sys),
            observedFleetIds: observedFl,
            movementIntentVisible: hasMovementHint,
        };
    }

    return visibility;
}

/**
 * Never downgrade a reveal stage — once seen, never go below pinged.
 */
function pickHigherStage(a: RevealStage, b: RevealStage): RevealStage {
    const rank: Record<RevealStage, number> = { unknown: 0, pinged: 1, scanned: 2, surveyed: 3 };
    return rank[a] >= rank[b] ? a : b;
}

/**
 * Get the current reveal stage for a single system for a faction.
 */
export function getRevealStage(
    factionId: string,
    systemId: string,
    factionVisibility: Map<string, FactionVisibility>
): RevealStage {
    return factionVisibility.get(factionId)?.[systemId]?.revealStage ?? 'unknown';
}

// ─── Overlay primitives for sensors ───────────────────────────────────────────

/**
 * Generate sensor overlay render primitives: heatmap tiles showing sensor coverage.
 */
export function getSensorOverlayPrimitives(
    factionId: string,
    world: MovementWorldState
): OverlayPrimitive[] {
    const coverage = aggregateSensorCoverage(factionId, world.sensorSources, world.systems);
    const primitives: OverlayPrimitive[] = [];

    for (const [sysId, strength] of coverage) {
        primitives.push({
            kind: 'heatTile',
            systemId: sysId,
            intensity: strength,
            colorScheme: 'blue',
        });
    }
    return primitives;
}
