// lib/government/cohesion-service.ts
// Stars of Dominion — Government & Leadership, Phase 6.1 (Empire Cohesion).
//
// WORKER-SIDE. Cohesion is deliberately a SLOW STOCK that drifts toward a
// computed target, not a per-tick recalculation. That lag is the mechanic: a
// frontier world can read 70 while its target sits at 15, which is what
// "quietly preparing to leave" looks like in numbers.
//
// Every driver is named and signed, so a collapse can always be traced back to
// the decisions that caused it — the same readable-cause pattern as
// assessCoupRisk in coup-service.

import type { GameWorldState } from '@/lib/game-world-state';
import type { CohesionDriver, PlanetCohesion } from './cohesion-types';
import { stageFor } from './cohesion-types';
import { getGovernment, weightedBlocSatisfaction } from './government-service';
import { getGovernor } from './governor-service';

/** Cohesion points a planet can move per sim day. Slow on purpose. */
const COHESION_DRIFT_PER_DAY = 3;
/** Neutral centre of the scale before any driver applies. */
const COHESION_BASELINE = 50;
/**
 * Distance penalties, per unit of whichever metric was available. Both ceilings
 * land near -20 so the driver carries the same weight either way; only the
 * granularity differs (a lane hop is a much bigger step than a grid tile).
 */
const DISTANCE_SCALE = {
    lanes: { max: 10, costPerUnit: 2, noun: 'jumps' },
    grid: { max: 30, costPerUnit: 0.7, noun: 'sectors' },
} as const;
/** Cohesion cost per covert operation run against the planet's system. */
const INTERFERENCE_COST_PER_OP = 1.5;
const MAX_COUNTED_OPS = 10;
/** Penalty for a world nobody was appointed to administer. */
const NO_GOVERNOR_PENALTY = -6;

/** War fatigue accrual per sim day, per faction (Phase 6.1 makes it per-empire). */
const WAR_FATIGUE_PER_DAY = 4;
const WAR_FATIGUE_RECOVERY_PER_DAY = 2;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

/**
 * Distances from a capital, plus which metric produced them — the caller needs
 * to know whether a "3" means three lane hops or three grid tiles.
 */
export interface CapitalDistances {
    distances: Map<string, number>;
    metric: keyof typeof DISTANCE_SCALE;
}

/** Axial hex distance between two systems on the galaxy grid. */
function hexDistance(aQ: number, aR: number, bQ: number, bR: number): number {
    const dq = aQ - bQ;
    const dr = aR - bR;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * Distance from a faction's capital to every system, in jumps.
 *
 * Prefers hyperlane hops, but falls back to axial hex distance when the lane
 * graph is unavailable. The fallback used to be load-bearing — the galaxy
 * shipped 567 systems with EMPTY `hyperlaneNeighbors`, so a pure BFS reported
 * every world as cut off from its own capital and handed the whole empire the
 * maximum distance penalty. `lib/movement/lane-graph.ts` now populates the
 * graph on load, so the grid metric only covers worlds outside the lane net.
 *
 * Computed once per faction per tick — the graph does not change mid-tick.
 */
export function distancesFromCapital(world: GameWorldState, factionId: string): CapitalDistances {
    const out = new Map<string, number>();
    const capital = world.economy.factions.get(factionId)?.capitalSystemId;
    const capitalSystem = capital ? world.movement.systems.get(capital) : undefined;
    if (!capital || !capitalSystem) return { distances: out, metric: 'lanes' };

    out.set(capital, 0);
    const queue: string[] = [capital];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const hops = out.get(current)!;
        const system = world.movement.systems.get(current);
        if (!system) continue;

        for (const neighbour of system.hyperlaneNeighbors ?? []) {
            if (out.has(neighbour)) continue;
            out.set(neighbour, hops + 1);
            queue.push(neighbour);
        }
    }

    // The lane graph reached nothing — measure across the grid instead.
    if (out.size <= 1) {
        for (const [systemId, system] of world.movement.systems) {
            out.set(systemId, Math.round(hexDistance(system.q, system.r, capitalSystem.q, capitalSystem.r)));
        }
        return { distances: out, metric: 'grid' };
    }

    return { distances: out, metric: 'lanes' };
}

/**
 * Everything pulling this world toward or away from the political order.
 * Pure read — the panel and the tick use the same function, so what the player
 * sees is exactly what the simulation applied.
 */
export function computeCohesionDrivers(
    world: GameWorldState,
    planetId: string,
    distances?: CapitalDistances
): { drivers: CohesionDriver[]; target: number; distanceFromCapital: number } {
    const planet = world.construction?.planets?.get(planetId);
    if (!planet?.ownerId) return { drivers: [], target: COHESION_BASELINE, distanceFromCapital: -1 };

    const factionId = planet.ownerId;
    const gov = getGovernment(world, factionId);
    const drivers: CohesionDriver[] = [];

    const push = (id: string, label: string, delta: number) => {
        if (Math.abs(delta) < 0.05) return;
        drivers.push({ id, label, delta });
    };

    // ── The political order itself ───────────────────────────────────────────
    if (gov) {
        push('legitimacy', `Legitimacy at ${Math.round(gov.legitimacy)}`, (gov.legitimacy - 50) * 0.30);
        push('approval', `Approval at ${Math.round(gov.approval)}`, (gov.approval - 50) * 0.20);
        push('corruption', `Corruption at ${Math.round(gov.corruption)}`, -gov.corruption * 0.20);
        push('war_fatigue', `War exhaustion at ${Math.round(gov.warFatigue)}`, -gov.warFatigue * 0.15);

        const blocSat = weightedBlocSatisfaction(world, factionId);
        push('factions', `Interest groups ${Math.round(blocSat)}% satisfied`, (blocSat - 50) * 0.15);
    }

    // ── Local conditions ─────────────────────────────────────────────────────
    const stability = planet.stability ?? 50;
    const happiness = planet.happiness ?? 80;
    const unrest = planet.unrest ?? 0;
    push('stability', `Local stability ${Math.round(stability)}`, (stability - 50) * 0.30);
    push('happiness', `Population happiness ${Math.round(happiness)}`, (happiness - 50) * 0.20);
    push('unrest', `Unrest at ${Math.round(unrest)}`, -unrest * 0.40);

    // ── Who administers it ───────────────────────────────────────────────────
    const governor = getGovernor(world, planetId);
    if (governor) {
        push('governor', `Governor ${governor.name} loyalty ${Math.round(governor.loyalty)}`, (governor.loyalty - 50) * 0.20);
    } else {
        push('governor', 'No governor appointed', NO_GOVERNOR_PENALTY);
    }

    // ── Distance from the political centre ───────────────────────────────────
    const resolved = distances ?? distancesFromCapital(world, factionId);
    const scale = DISTANCE_SCALE[resolved.metric];
    const hops = resolved.distances.get(planet.systemId) ?? -1;
    if (hops > 0) {
        const counted = Math.min(hops, scale.max);
        push('distance', `${hops} ${scale.noun} from the capital`, -counted * scale.costPerUnit);
    } else if (hops < 0) {
        // Cut off from the capital entirely — worse than merely distant.
        push('distance', 'No route to the capital', -scale.max * scale.costPerUnit);
    }

    // ── Concessions already made ─────────────────────────────────────────────
    const autonomy = world.planetCohesion?.get(planetId)?.autonomy ?? 0;
    if (autonomy > 0) {
        push('autonomy', `${Math.round(autonomy)}% self-rule granted`, autonomy * 0.15);
    }

    // ── Foreign hands ────────────────────────────────────────────────────────
    const escalation = world.espionage?.regionEscalation?.get(planet.systemId);
    if (escalation && escalation.operationCount > 0) {
        const counted = Math.min(escalation.operationCount, MAX_COUNTED_OPS);
        push('interference', `${escalation.operationCount} covert operation(s) in this system`, -counted * INTERFERENCE_COST_PER_OP);
    }

    drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const target = clamp100(COHESION_BASELINE + drivers.reduce((sum, d) => sum + d.delta, 0));

    return { drivers, target, distanceFromCapital: hops };
}

/**
 * Create cohesion records for owned worlds that lack one. Idempotent; call at
 * world load and after conquest. New records start AT their target so a fresh
 * save does not spend a week of sim time settling.
 */
export function ensureCohesion(world: GameWorldState): void {
    if (!(world.planetCohesion instanceof Map)) world.planetCohesion = new Map();
    if (!world.construction?.planets) return;

    const distanceCache = new Map<string, CapitalDistances>();
    let seeded = 0;

    for (const planet of world.construction.planets.values()) {
        if (!planet.ownerId) continue;
        if (world.planetCohesion.has(planet.id)) continue;

        if (!distanceCache.has(planet.ownerId)) {
            distanceCache.set(planet.ownerId, distancesFromCapital(world, planet.ownerId));
        }
        const { drivers, target, distanceFromCapital } = computeCohesionDrivers(
            world, planet.id, distanceCache.get(planet.ownerId)
        );

        world.planetCohesion.set(planet.id, {
            planetId: planet.id,
            factionId: planet.ownerId,
            systemId: planet.systemId,
            cohesion: target,
            target,
            trend: 0,
            stage: stageFor(target),
            drivers,
            distanceFromCapital,
            lastEvaluatedSeconds: world.nowSeconds,
        });
        seeded++;
    }

    if (seeded > 0) console.log(`[Government] Seeded cohesion for ${seeded} world(s).`);
}

/**
 * Advance cohesion: per-faction war fatigue and stability first (they feed the
 * drivers), then every planet drifts toward its target, then the empire
 * aggregate is recomputed.
 */
export function tickCohesion(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.planetCohesion instanceof Map)) world.planetCohesion = new Map();
    if (!world.construction?.planets) return;

    const days = deltaSeconds / 86400;
    const distanceCache = new Map<string, CapitalDistances>();

    // Drop records for worlds that no longer exist.
    for (const planetId of [...world.planetCohesion.keys()]) {
        if (!world.construction.planets.has(planetId)) world.planetCohesion.delete(planetId);
    }

    for (const planet of world.construction.planets.values()) {
        if (!planet.ownerId) {
            world.planetCohesion.delete(planet.id);
            continue;
        }

        if (!distanceCache.has(planet.ownerId)) {
            distanceCache.set(planet.ownerId, distancesFromCapital(world, planet.ownerId));
        }
        const { drivers, target, distanceFromCapital } = computeCohesionDrivers(
            world, planet.id, distanceCache.get(planet.ownerId)
        );

        let record = world.planetCohesion.get(planet.id);
        if (!record) {
            record = {
                planetId: planet.id,
                factionId: planet.ownerId,
                systemId: planet.systemId,
                cohesion: target,
                target,
                trend: 0,
                stage: stageFor(target),
                drivers,
                distanceFromCapital,
                lastEvaluatedSeconds: world.nowSeconds,
            };
            world.planetCohesion.set(planet.id, record);
            continue;
        }

        // Conquest (or secession) hands the world to someone else; the loyalty
        // question restarts against the new capital, it does not reset.
        record.factionId = planet.ownerId;
        record.systemId = planet.systemId;
        record.target = target;
        record.drivers = drivers;
        record.distanceFromCapital = distanceFromCapital;

        const gap = target - record.cohesion;
        const step = Math.sign(gap) * Math.min(Math.abs(gap), COHESION_DRIFT_PER_DAY * days);
        record.cohesion = clamp100(record.cohesion + step);
        record.trend = days > 0 ? step / days : 0;
        record.stage = stageFor(record.cohesion);
        record.lastEvaluatedSeconds = world.nowSeconds;
    }

    updateEmpireCohesion(world, days);
}

/**
 * Roll planet cohesion up to the empire, and refresh the per-faction scalars the
 * drivers depend on. Population-weighted: losing a hundred settlers is not the
 * same as losing a core world.
 */
function updateEmpireCohesion(world: GameWorldState, days: number): void {
    if (!(world.government instanceof Map)) return;

    for (const gov of world.government.values()) {
        const planets = [...world.construction.planets.values()].filter(p => p.ownerId === gov.factionId);

        // Per-faction stability, authoritative from this phase on: the mirror of
        // the galaxy-wide scalar could never answer "is THIS empire holding".
        const totalPop = planets.reduce((s, p) => s + Math.max(1, p.population ?? 1), 0);
        if (planets.length > 0) {
            gov.stability = clamp100(
                planets.reduce((s, p) => s + (p.stability ?? 50) * Math.max(1, p.population ?? 1), 0) / totalPop
            );
        }

        // Per-faction war exhaustion: this empire's wars, not the galaxy's.
        gov.warFatigue = clamp100(
            gov.warFatigue + (isFactionAtWar(world, gov.factionId)
                ? WAR_FATIGUE_PER_DAY * days
                : -WAR_FATIGUE_RECOVERY_PER_DAY * days)
        );

        const records = planets
            .map(p => world.planetCohesion.get(p.id))
            .filter((r): r is PlanetCohesion => Boolean(r));

        if (records.length === 0) {
            gov.cohesion = gov.legitimacy; // A government with no worlds is only its own claim.
            gov.cohesionTrend = 0;
            gov.cohesionDrivers = [];
            continue;
        }

        const weightFor = (record: PlanetCohesion) => {
            const planet = world.construction.planets.get(record.planetId);
            return Math.max(1, planet?.population ?? 1);
        };
        const weightSum = records.reduce((s, r) => s + weightFor(r), 0);

        gov.cohesion = clamp100(records.reduce((s, r) => s + r.cohesion * weightFor(r), 0) / weightSum);
        gov.cohesionTrend = records.reduce((s, r) => s + r.trend * weightFor(r), 0) / weightSum;

        // Empire-level drivers: the same causes, averaged, so the panel can say
        // what is pulling the whole civilization apart rather than one world.
        const totals = new Map<string, { label: string; delta: number }>();
        for (const record of records) {
            const weight = weightFor(record) / weightSum;
            for (const driver of record.drivers) {
                const existing = totals.get(driver.id);
                if (existing) existing.delta += driver.delta * weight;
                else totals.set(driver.id, { label: driver.label, delta: driver.delta * weight });
            }
        }
        gov.cohesionDrivers = [...totals.entries()]
            .map(([id, v]) => ({ id, label: v.label, delta: v.delta }))
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 8);
    }
}

/**
 * Is this faction at war with another EMPIRE right now? Uses the same test as
 * diplomacy's isAtWar (escalation 7 = shooting).
 *
 * Deliberately ignores rivalries with anything that is not a real empire —
 * pirates and raider bands sit permanently at maximum escalation with everyone,
 * so counting them made every faction permanently "at war", which accrued war
 * exhaustion forever and dragged the whole galaxy's cohesion down with it.
 * Fighting raiders is policing, not war.
 */
export function isFactionAtWar(world: GameWorldState, factionId: string): boolean {
    for (const rivalry of world.rivalries.values()) {
        const isA = rivalry.empireAId === factionId;
        const isB = rivalry.empireBId === factionId;
        if (!isA && !isB) continue;
        if ((rivalry.escalationLevel ?? 0) < 7) continue;

        const otherId = isA ? rivalry.empireBId : rivalry.empireAId;
        // Only empires with an economy of their own count as belligerents.
        if (!world.economy.factions.has(otherId)) continue;
        return true;
    }
    return false;
}

/**
 * The worlds a government should be most worried about, worst first.
 * Used by the panel and, from 6.2, by the escalation ladder.
 */
export function weakestWorlds(world: GameWorldState, factionId: string, limit = 5): PlanetCohesion[] {
    if (!(world.planetCohesion instanceof Map)) return [];
    return [...world.planetCohesion.values()]
        .filter(r => r.factionId === factionId)
        .sort((a, b) => a.cohesion - b.cohesion)
        .slice(0, limit);
}

/** Cohesion for one planet, or undefined if it has no record. */
export function getPlanetCohesion(world: GameWorldState, planetId: string): PlanetCohesion | undefined {
    return world.planetCohesion?.get(planetId);
}
