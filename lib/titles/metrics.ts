// lib/titles/metrics.ts
// Seasons & Titles — Phase 2: what each crown actually measures.
//
// Every metric is a pure read over state the engine already tracks, with two
// declared exceptions (peace streak and season kill tally) that need a memory
// the world does not otherwise keep. Both live in TitleWorldState.seasonCounters
// and are documented at their evaluators.
//
// A metric returns a Map of subjectId → score. Absent subjects score nothing;
// a metric with no subjects leaves its crown vacant rather than awarding it.

import type { GameWorldState } from '../game-world-state';
import type { TitleSubject } from './types';
import { Resource } from '../trade-system/types';
import { isRankedFaction } from '../seasons/prestige';
import { ensureTitleState } from './title-service';

export type MetricScores = Map<string, number>;

export interface MetricDefinition {
    id: string;
    /** Which kind of subject this metric scores. */
    subject: TitleSubject;
    /** Scores below this are ignored — keeps a crown vacant rather than trivial. */
    floor?: number;
    evaluate: (world: GameWorldState) => MetricScores;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rankedFactions(world: GameWorldState): string[] {
    const factions = world.economy?.factions;
    if (!(factions instanceof Map)) return [];
    return [...factions.keys()].filter(isRankedFaction);
}

function zeroed(world: GameWorldState): MetricScores {
    const scores: MetricScores = new Map();
    for (const id of rankedFactions(world)) scores.set(id, 0);
    return scores;
}

function add(scores: MetricScores, key: string, amount: number): void {
    if (!scores.has(key)) return; // never invent a subject
    scores.set(key, (scores.get(key) ?? 0) + amount);
}

/**
 * Iterate a Map that a given world may not have. Metrics run against every
 * snapshot the game has ever written, including ones predating the sub-state
 * they read — a crown must go unscored, never throw inside the tick.
 */
function values<T>(map: Map<string, T> | undefined | null): Iterable<T> {
    return map instanceof Map ? map.values() : [];
}

/** Trade agreement for a route, or null if the agreement is gone. */
function agreementFor(world: GameWorldState, agreementId: string) {
    const agreements = world.economy?.tradeAgreements;
    return agreements instanceof Map ? agreements.get(agreementId) ?? null : null;
}

// ─── Season counters ──────────────────────────────────────────────────────────
// The two metrics that cannot be read off current state. Systems push into these
// through notifyTitleMetric; the season closer clears them.

export const COUNTER_FLEET_POWER_DESTROYED = 'fleet_power_destroyed_season';
export const COUNTER_LAST_WAR_SECONDS = 'last_war_at_seconds';

interface PendingMetric {
    counterId: string;
    subjectId: string;
    delta: number;
}

const _metricBuffer: PendingMetric[] = [];

/**
 * Record progress against a season counter. Safe from any server-side context;
 * buffered, drained by the title tick. A counter nothing reads is a no-op.
 */
export function notifyTitleMetric(counterId: string, subjectId: string, delta: number): void {
    if (!subjectId || !Number.isFinite(delta) || delta === 0) return;
    _metricBuffer.push({ counterId, subjectId, delta });
}

export function drainMetricCounters(world: GameWorldState): void {
    if (_metricBuffer.length === 0) return;
    const pending = _metricBuffer.splice(0, _metricBuffer.length);
    const counters = ensureTitleState(world).seasonCounters;
    for (const { counterId, subjectId, delta } of pending) {
        const key = `${counterId}|${subjectId}`;
        counters.set(key, (counters.get(key) ?? 0) + delta);
    }
}

export function readCounter(world: GameWorldState, counterId: string, subjectId: string): number {
    return ensureTitleState(world).seasonCounters.get(`${counterId}|${subjectId}`) ?? 0;
}

export function setCounter(
    world: GameWorldState, counterId: string, subjectId: string, value: number
): void {
    ensureTitleState(world).seasonCounters.set(`${counterId}|${subjectId}`, value);
}

/**
 * Clear per-season tallies at a season boundary. Streak marks survive — a peace
 * streak that reset every season would measure the season, not the peace.
 */
export function resetSeasonCounters(world: GameWorldState): void {
    const counters = ensureTitleState(world).seasonCounters;
    for (const key of [...counters.keys()]) {
        if (key.startsWith(`${COUNTER_FLEET_POWER_DESTROYED}|`)) counters.delete(key);
    }
}

// ─── Metric evaluators ────────────────────────────────────────────────────────

/** Share of trade volume a faction is party to. */
const tradeFlowShare: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const agreement of values(world.economy?.tradeAgreements)) {
        const volume = agreement.volumePerHour || 0;
        add(scores, agreement.aFactionId, volume);
        add(scores, agreement.bFactionId, volume);
    }
    return scores;
};

/** Total fleet power in commission. */
const fleetPowerTotal: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const fleet of values(world.movement?.fleets)) {
        add(scores, fleet.factionId, (fleet.basePower || 0) * (fleet.strength || 1));
    }
    return scores;
};

/**
 * Tech depth, weighted toward what has spread. A tech others also hold counts
 * for less than one only you have — the crown is for leading the web, not for
 * having climbed a common ladder.
 */
const techWebWeight: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    const tech = world.tech instanceof Map ? world.tech : new Map();
    const holders = new Map<string, number>();
    for (const [factionId, state] of tech) {
        if (!isRankedFaction(factionId)) continue;
        for (const techId of state.unlockedTechIds ?? []) {
            holders.set(techId, (holders.get(techId) ?? 0) + 1);
        }
    }
    for (const [factionId, state] of tech) {
        let weight = 0;
        for (const techId of state.unlockedTechIds ?? []) {
            weight += 1 / (holders.get(techId) ?? 1);
        }
        add(scores, factionId, weight);
    }
    return scores;
};

/** Average planetary happiness. Needs a real empire behind it. */
const MIN_PLANETS_FOR_HAPPINESS = 3;
const avgHappiness: MetricDefinition['evaluate'] = (world) => {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const planet of values(world.construction?.planets)) {
        const owner = planet.ownerId;
        if (!owner || !isRankedFaction(owner)) continue;
        const entry = totals.get(owner) ?? { sum: 0, count: 0 };
        entry.sum += planet.happiness ?? 50;
        entry.count += 1;
        totals.set(owner, entry);
    }
    const scores = zeroed(world);
    for (const [factionId, { sum, count }] of totals) {
        if (count < MIN_PLANETS_FOR_HAPPINESS) continue;
        add(scores, factionId, sum / count);
    }
    return scores;
};

/** Espionage reach: network maturity plus the agents holding it open. */
const espionageReach: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const network of values(world.espionage?.intelNetworks)) {
        const reach = (network.strength || 0) * (1 + (network.agentIds?.length ?? 0) * 0.25);
        add(scores, network.ownerFactionId, reach);
    }
    return scores;
};

/** Press reach: being believed, times being heard. */
const pressReach: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    const empires = world.press?.empires;
    if (!(empires instanceof Map)) return scores;
    for (const [empireId, press] of empires) {
        const credibility = (press.credibility ?? 0) / 100;
        const influence = press.narrativeInfluence ?? 0;
        add(scores, empireId, credibility * influence);
    }
    return scores;
};

/**
 * Chokepoint control. A geography crown: it counts gates and the systems the
 * lane graph marks as chokepoints, so two systems in the right place beat twenty
 * in the wrong one. Deliberately not weighted by empire size.
 */
const chokepointControl: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const gate of values(world.movement?.gates)) {
        if (gate.state === 'destroyed') continue;
        add(scores, gate.ownerFactionId, 1);
    }
    // Corridors name their own chokepoints; owning one of those systems is
    // worth more than owning an ordinary one.
    const chokepoints = new Set<string>();
    for (const corridor of values(world.movement?.corridors)) {
        for (const systemId of corridor.chokepointIds ?? []) chokepoints.add(systemId);
    }
    for (const systemId of chokepoints) {
        const owner = world.movement?.systems?.get(systemId)?.ownerFactionId;
        if (owner) add(scores, owner, 2);
    }
    return scores;
};

/** Industrial output — what a faction makes, not what it moves. */
const INDUSTRIAL_RESOURCES = [Resource.METALS, Resource.CHEMICALS, Resource.ENERGY, Resource.AMMO];
const industrialShare: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const planet of values(world.economy?.planets)) {
        const owner = planet.factionId;
        if (!owner) continue;
        let output = 0;
        for (const resource of INDUSTRIAL_RESOURCES) {
            output += (planet.currentRates as Record<string, number> | undefined)?.[resource.toLowerCase()]
                ?? (planet.currentRates as Record<string, number> | undefined)?.[resource]
                ?? 0;
        }
        add(scores, owner, output);
    }
    return scores;
};

/**
 * Peace streak, in seconds since this faction was last observed at war.
 *
 * Exception to "held titles are pure functions of current state": the world
 * keeps no record of when a war began, so the evaluator stamps a mark whenever
 * it sees a faction at war and measures from there. A fresh world starts every
 * faction's streak at the moment of first evaluation, which is the honest
 * reading — nobody has a peace to their name that predates the record.
 */
const WAR_ESCALATION_LEVEL = 7;
const peaceStreakSeconds: MetricDefinition['evaluate'] = (world) => {
    const atWar = new Set<string>();
    for (const rivalry of values(world.rivalries)) {
        if ((rivalry.escalationLevel ?? 0) < WAR_ESCALATION_LEVEL) continue;
        atWar.add(rivalry.empireAId);
        atWar.add(rivalry.empireBId);
    }

    const scores = zeroed(world);
    for (const factionId of scores.keys()) {
        if (atWar.has(factionId)) {
            setCounter(world, COUNTER_LAST_WAR_SECONDS, factionId, world.nowSeconds);
            scores.set(factionId, 0);
            continue;
        }
        let since = readCounter(world, COUNTER_LAST_WAR_SECONDS, factionId);
        if (since === 0) {
            since = world.nowSeconds;
            setCounter(world, COUNTER_LAST_WAR_SECONDS, factionId, since);
        }
        scores.set(factionId, Math.max(0, world.nowSeconds - since));
    }
    return scores;
};

/** Diplomatic web, weighted by how much each partner is worth talking to. */
const diplomaticWebWeight: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    const partnerWeight = new Map<string, number>();
    const systemsByOwner = new Map<string, number>();
    for (const system of values(world.movement?.systems)) {
        const owner = system.ownerFactionId;
        if (owner) systemsByOwner.set(owner, (systemsByOwner.get(owner) ?? 0) + 1);
    }
    for (const factionId of scores.keys()) {
        partnerWeight.set(factionId, 1 + (systemsByOwner.get(factionId) ?? 0) * 0.1);
    }

    for (const treaty of values(world.treaties)) {
        if (treaty.status !== 'active') continue;
        for (const signatory of treaty.signatories) {
            for (const other of treaty.signatories) {
                if (other === signatory) continue;
                add(scores, signatory, partnerWeight.get(other) ?? 1);
            }
        }
    }
    for (const pact of values(world.tradePacts)) {
        add(scores, pact.empireAId, (partnerWeight.get(pact.empireBId) ?? 1) * 0.5);
        add(scores, pact.empireBId, (partnerWeight.get(pact.empireAId) ?? 1) * 0.5);
    }
    return scores;
};

/** Average satisfaction across a faction's population blocs. */
const blocApprovalAvg: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    const postures = world.movement?.empirePostures;
    if (!(postures instanceof Map)) return scores;
    for (const [factionId, posture] of postures) {
        const blocs = Array.isArray(posture.blocs) ? posture.blocs : [];
        if (blocs.length === 0) continue;
        const avg = blocs.reduce((sum, b) => sum + (b.satisfaction ?? 0), 0) / blocs.length;
        add(scores, factionId, avg);
    }
    return scores;
};

/**
 * Foreign trade crossing your space. You win this by being useful to rivals:
 * only volume where the faction is neither party but owns a system on the path
 * counts, and a lane is counted once per owner regardless of how much of it
 * they hold.
 */
const foreignTransitVolume: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const route of values(world.economy?.tradeRoutes)) {
        const agreement = agreementFor(world, route.agreementId);
        if (!agreement) continue;
        const volume = agreement.volumePerHour || 0;
        if (volume <= 0) continue;

        const crossed = new Set<string>();
        for (const systemId of route.path ?? []) {
            const owner = world.movement?.systems?.get(systemId)?.ownerFactionId;
            if (!owner) continue;
            if (owner === agreement.aFactionId || owner === agreement.bFactionId) continue;
            crossed.add(owner);
        }
        for (const owner of crossed) add(scores, owner, volume);
    }
    return scores;
};

/**
 * Enemy fleet power destroyed this season. A rolling window by construction:
 * the tally is cleared at every season close, so the villain crown resets on its
 * own rather than accumulating into a permanent lead.
 */
const fleetPowerDestroyedSeason: MetricDefinition['evaluate'] = (world) => {
    const scores = zeroed(world);
    for (const factionId of scores.keys()) {
        scores.set(factionId, readCounter(world, COUNTER_FLEET_POWER_DESTROYED, factionId));
    }
    return scores;
};

/** Pirate infamy. Subject is the organization, not a faction. */
const orgInfamy: MetricDefinition['evaluate'] = (world) => {
    const scores: MetricScores = new Map();
    for (const org of values(world.piracy?.organizations)) {
        scores.set(org.id, org.infamy || 0);
    }
    return scores;
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const METRICS: Record<string, MetricDefinition> = {
    trade_flow_share: { id: 'trade_flow_share', subject: 'faction', floor: 1, evaluate: tradeFlowShare },
    fleet_power_total: { id: 'fleet_power_total', subject: 'faction', floor: 1, evaluate: fleetPowerTotal },
    tech_web_weight: { id: 'tech_web_weight', subject: 'faction', floor: 1, evaluate: techWebWeight },
    avg_happiness: { id: 'avg_happiness', subject: 'faction', floor: 1, evaluate: avgHappiness },
    espionage_reach: { id: 'espionage_reach', subject: 'faction', floor: 0.1, evaluate: espionageReach },
    press_reach: { id: 'press_reach', subject: 'faction', floor: 1, evaluate: pressReach },
    chokepoint_control: { id: 'chokepoint_control', subject: 'faction', floor: 1, evaluate: chokepointControl },
    industrial_share: { id: 'industrial_share', subject: 'faction', floor: 1, evaluate: industrialShare },
    peace_streak_seconds: { id: 'peace_streak_seconds', subject: 'faction', floor: 86_400, evaluate: peaceStreakSeconds },
    diplomatic_web_weight: { id: 'diplomatic_web_weight', subject: 'faction', floor: 1, evaluate: diplomaticWebWeight },
    bloc_approval_avg: { id: 'bloc_approval_avg', subject: 'faction', floor: 1, evaluate: blocApprovalAvg },
    foreign_transit_volume: { id: 'foreign_transit_volume', subject: 'faction', floor: 1, evaluate: foreignTransitVolume },
    fleet_power_destroyed_season: { id: 'fleet_power_destroyed_season', subject: 'faction', floor: 1, evaluate: fleetPowerDestroyedSeason },
    infamy: { id: 'infamy', subject: 'pirate_org', floor: 1, evaluate: orgInfamy },
};
