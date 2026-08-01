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
 * Hop distances from one system to every system reachable within maxHops,
 * via a single BFS over hyperlane adjacency. Replaces the old per-pair BFS
 * (O(systems) per source×target pair) in coverage aggregation.
 */
function hopDistancesFrom(
    fromId: string,
    systems: Map<string, SystemNode>,
    maxHops: number
): Map<string, number> {
    const dist = new Map<string, number>([[fromId, 0]]);
    let frontier = [fromId];
    let hops = 0;
    while (frontier.length > 0 && hops < maxHops) {
        hops++;
        const next: string[] = [];
        for (const sid of frontier) {
            const sys = systems.get(sid);
            for (const n of sys?.hyperlaneNeighbors ?? []) {
                if (!dist.has(n)) { dist.set(n, hops); next.push(n); }
            }
        }
        frontier = next;
    }
    return dist;
}

/**
 * Aggregate all sensor sources for a faction and produce a normalised
 * strength value (0–1) per system. One BFS per source; per system the
 * strength is the clamped sum over sources, decaying exponentially with
 * distance: strength × (1 - d/radius)^decay.
 */
function aggregateSensorCoverage(
    factionId: string,
    sources: SensorSource[],
    systems: Map<string, SystemNode>
): Map<string, number> {
    const coverage = new Map<string, number>();
    const decay = config.visibility.sensorDecayExponent;

    for (const src of sources) {
        if (src.factionId !== factionId) continue;
        // The old per-pair BFS was capped at 12 hops regardless of radius, so
        // sources never reached past 12 — keep that cap for identical results.
        const dists = hopDistancesFrom(src.systemId, systems, Math.min(src.detectionRadius, 12));
        for (const [sysId, d] of dists) {
            if (d > src.detectionRadius) continue;
            const ratio = (src.detectionRadius - d) / Math.max(src.detectionRadius, 1);
            const strength = src.detectionStrength * Math.pow(ratio, decay);
            if (strength <= 0) continue;
            coverage.set(sysId, Math.min(1, (coverage.get(sysId) ?? 0) + strength));
        }
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
    // Systems loaded from a multiplayer snapshot may not carry a tagReveal
    // structure — fall back to revealing all tags at scan level or better.
    if (!reveal?.revealedAt) {
        return stage === 'pinged' ? [] : [...(sys.tags ?? [])];
    }
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

    // Group fleets by system once — the old per-system spread+filter over the
    // whole fleet map was O(systems × fleets) per faction.
    const foreignFleetsBySystem = new Map<string, Fleet[]>();
    for (const f of world.fleets.values()) {
        if (!f.currentSystemId || f.factionId === factionId) continue;
        const arr = foreignFleetsBySystem.get(f.currentSystemId);
        if (arr) arr.push(f); else foreignFleetsBySystem.set(f.currentSystemId, [f]);
    }

    const prevVisibility = world.factionVisibility.get(factionId);

    for (const [sysId, sys] of world.systems) {
        const strength = coverage.get(sysId) ?? 0;

        // Preserve previous reveal stage (never downgrade past pinged even when out of range)
        const existing = prevVisibility?.[sysId];

        // Fast path: no sensor coverage, nothing previously known, and no
        // foreign fleet to observe — the entry would be fully default, and
        // those are omitted from the result anyway (readers treat a missing
        // system as 'unknown').
        if (strength === 0 && !existing && !foreignFleetsBySystem.has(sysId)) continue;

        const stage = strengthToRevealStage(strength);
        const effectiveStage: RevealStage = existing
            ? pickHigherStage(existing.revealStage, stage)
            : stage;

        const fleetsHere = foreignFleetsBySystem.get(sysId) ?? [];
        const observedFl = strength >= config.visibility.minimumStrengthForPing
            ? fleetsHere.filter(f => f.isDetectable).map(f => f.id)
            : [];

        const hasMovementHint = fleetsHere.some(f =>
            movementIntentVisible(strength, f)
        );

        const lastSeenAt = strength > 0 ? nowISO : (existing?.lastSeenAt ?? '');

        // Omit fully-default entries (never seen, nothing observed): every
        // reader treats a missing system as 'unknown', and writing all ~550
        // unknown systems per faction bloated the snapshot by ~1 MB.
        if (effectiveStage === 'unknown' && !lastSeenAt
            && observedFl.length === 0 && !hasMovementHint) {
            continue;
        }

        visibility[sysId] = {
            revealStage: effectiveStage,
            lastSeenAt,
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
