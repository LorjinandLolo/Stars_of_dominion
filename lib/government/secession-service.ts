// lib/government/secession-service.ts
// Stars of Dominion — Government & Leadership, Phase 6.3 (secession crisis).
//
// WORKER-SIDE. Worlds that have gone past defiance stop asking for redress and
// start asking to leave — together. A crisis is a region, not a planet, and it
// is answered with terms: the five concessions in secession-types, each of which
// keeps the flag flying at a permanent price.
//
// This is also where lib/combat/secession-service.ts finally gets called. Those
// two pure functions have sat in the repo unused since they were written; they
// decide whether a region that ran out of patience turns violent, and how strong
// the rebels are when it does.

import type { GameWorldState } from '@/lib/game-world-state';
import type { SecessionCrisis, SecessionDemandId } from './secession-types';
import { SECESSION_DEMANDS, SECESSION_SETTLE_THRESHOLD, secessionDemand } from './secession-types';
import {
    evaluateSecessionRisk,
    spawnRebelGarrison,
} from '@/lib/combat/secession-service';
import { RNG } from '@/lib/trade-system/rng';
import { seedFromString } from '@/lib/leadership/leader-generator';
import { fireNotification } from '@/lib/time/notification-hooks';
import { pushWorldStory } from '@/lib/press-system/integration';
import { getGovernment, spendPoliticalCapital } from './government-service';
import { getGovernor } from './governor-service';
import { getPlanetCohesion } from './cohesion-service';
import { recordPoliticalEvent } from './ideology-drift';

/** Cohesion at or below which a world will join a movement to leave. */
const SECESSION_COHESION_THRESHOLD = 20;
/** Worlds this far apart on the grid are not one region. */
const REGION_RADIUS = 12;
/** A movement needs company — one angry world is a defiance problem, not a crisis. */
const MIN_REGION_WORLDS = 2;
/** How long the region will keep asking (10 sim days). */
const CRISIS_WINDOW_SECONDS = 10 * 86400;
/** Political capital to answer with force. */
export const SUPPRESS_SECESSION_COST = 40;
/** Settled crises kept for the record. */
const MAX_RESOLVED_KEPT = 8;

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

// ─── Reading the region ───────────────────────────────────────────────────────

/** Axial hex distance between two systems. */
function hexDistance(aQ: number, aR: number, bQ: number, bR: number): number {
    const dq = aQ - bQ;
    const dr = aR - bR;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * How much of the region's population wants out. Cohesion is the government's
 * measure; this is the population's answer to a different question, so it runs
 * hotter than a simple inversion — unrest and foreign money both push it.
 */
function computeIndependenceSupport(world: GameWorldState, planetIds: string[]): number {
    let weighted = 0;
    let population = 0;

    for (const planetId of planetIds) {
        const planet = world.construction.planets.get(planetId);
        if (!planet) continue;
        const record = getPlanetCohesion(world, planetId);
        const pop = Math.max(1, planet.population ?? 1);

        const fromCohesion = 100 - (record?.cohesion ?? 50);
        const fromUnrest = (planet.unrest ?? 0) * 0.5;
        const interference = world.espionage?.regionEscalation?.get(planet.systemId)?.operationCount ?? 0;

        weighted += Math.min(100, fromCohesion * 0.7 + fromUnrest * 0.3 + Math.min(15, interference * 2)) * pop;
        population += pop;
    }

    return population > 0 ? clamp100(weighted / population) : 0;
}

/** Aggregate loyalty of whoever administers the region. */
function computeGovernorLoyalty(world: GameWorldState, planetIds: string[]): number {
    const governors = planetIds.map(id => getGovernor(world, id)).filter(Boolean);
    if (governors.length === 0) return 0; // nobody is holding these worlds at all
    return clamp100(governors.reduce((s, g) => s + (g!.loyalty ?? 0), 0) / governors.length);
}

/**
 * Whether the garrison would act against its own region. Falls with the
 * military bloc's satisfaction and with the empire's war exhaustion — troops
 * asked to shoot neighbours after a long war are the classic failure point.
 */
function computeMilitaryLoyalty(world: GameWorldState, factionId: string): number {
    const gov = getGovernment(world, factionId);
    const military = world.movement.empirePostures.get(factionId)?.blocs?.find(b => b.id === 'military');
    const base = military?.satisfaction ?? 50;
    const fatigue = (gov?.warFatigue ?? 0) * 0.3;
    const legitimacy = ((gov?.legitimacy ?? 50) - 50) * 0.2;
    return clamp100(base - fatigue + legitimacy);
}

/** Name the crisis after the region's most populous system. */
function nameCrisis(world: GameWorldState, planetIds: string[]): string {
    let bestName = 'the frontier';
    let bestPop = -1;

    for (const planetId of planetIds) {
        const planet = world.construction.planets.get(planetId);
        if (!planet) continue;
        const pop = planet.population ?? 0;
        if (pop <= bestPop) continue;
        bestPop = pop;
        const system = world.movement.systems.get(planet.systemId);
        bestName = system?.name ?? planet.name ?? planetId;
    }

    return `The ${bestName} Autonomy Crisis`;
}

/** What the region is asking for: the concessions that answer its grievances. */
function demandsFor(world: GameWorldState, planetIds: string[]): SecessionDemandId[] {
    const drivers = new Set<string>();
    for (const planetId of planetIds) {
        for (const driver of getPlanetCohesion(world, planetId)?.drivers ?? []) {
            if (driver.delta < 0) drivers.add(driver.id);
        }
    }

    const wanted: SecessionDemandId[] = ['autonomy']; // always the headline ask
    if (drivers.has('corruption') || drivers.has('approval')) wanted.push('tax_relief');
    if (drivers.has('war_fatigue')) wanted.push('military_exemption');
    if (drivers.has('distance')) wanted.push('local_parliament');
    if (drivers.has('stability') || drivers.has('happiness')) wanted.push('resource_rights');

    // A movement always wants at least three things, so there is room to bargain.
    for (const demand of SECESSION_DEMANDS) {
        if (wanted.length >= 3) break;
        if (!wanted.includes(demand.id)) wanted.push(demand.id);
    }

    return wanted;
}

// ─── Formation ────────────────────────────────────────────────────────────────

/** Open crises a faction is facing. */
export function openSecessions(world: GameWorldState, factionId: string): SecessionCrisis[] {
    if (!(world.secessionCrises instanceof Map)) return [];
    return [...world.secessionCrises.values()]
        .filter(c => c.factionId === factionId && c.status === 'open')
        .sort((a, b) => a.deadlineSeconds - b.deadlineSeconds);
}

/** Planets already spoken for by an open crisis. */
function claimedPlanets(world: GameWorldState): Set<string> {
    const claimed = new Set<string>();
    for (const crisis of world.secessionCrises?.values() ?? []) {
        if (crisis.status !== 'open') continue;
        for (const planetId of crisis.planetIds) claimed.add(planetId);
    }
    return claimed;
}

/**
 * Group a faction's separatist worlds into regions and open a crisis for any
 * cluster big enough to matter. Idempotent per tick.
 */
export function formSecessionCrises(world: GameWorldState): SecessionCrisis[] {
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    if (!world.construction?.planets) return [];

    const claimed = claimedPlanets(world);
    const opened: SecessionCrisis[] = [];

    for (const gov of world.government?.values() ?? []) {
        const candidates = [...(world.planetCohesion?.values() ?? [])]
            .filter(r => r.factionId === gov.factionId)
            .filter(r => r.cohesion <= SECESSION_COHESION_THRESHOLD)
            .filter(r => !claimed.has(r.planetId));

        if (candidates.length < MIN_REGION_WORLDS) continue;

        // Cluster by proximity: worlds that can see each other leave together.
        const remaining = [...candidates];
        while (remaining.length >= MIN_REGION_WORLDS) {
            const seed = remaining.shift()!;
            const seedSystem = world.movement.systems.get(seed.systemId);
            const cluster = [seed];

            for (let i = remaining.length - 1; i >= 0; i--) {
                const other = remaining[i];
                const otherSystem = world.movement.systems.get(other.systemId);
                if (!seedSystem || !otherSystem) continue;
                const distance = hexDistance(seedSystem.q, seedSystem.r, otherSystem.q, otherSystem.r);
                if (distance > REGION_RADIUS) continue;
                cluster.push(other);
                remaining.splice(i, 1);
            }

            if (cluster.length < MIN_REGION_WORLDS) continue;
            const crisis = openCrisis(world, gov.factionId, cluster.map(c => c.planetId));
            if (crisis) opened.push(crisis);
        }
    }

    return opened;
}

/** Open a crisis over a specific set of worlds. */
export function openCrisis(
    world: GameWorldState,
    factionId: string,
    planetIds: string[]
): SecessionCrisis | undefined {
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
    if (planetIds.length === 0) return undefined;
    const gov = getGovernment(world, factionId);
    if (!gov) return undefined;

    const systemIds = [...new Set(
        planetIds.map(id => world.construction.planets.get(id)?.systemId).filter(Boolean) as string[]
    )];

    // The most disloyal governor in the region becomes its face.
    const leaders = planetIds
        .map(id => getGovernor(world, id))
        .filter(Boolean)
        .sort((a, b) => (a!.loyalty ?? 0) - (b!.loyalty ?? 0));
    const leader = leaders[0];

    const causes = new Set<string>();
    for (const planetId of planetIds) {
        for (const driver of getPlanetCohesion(world, planetId)?.drivers ?? []) {
            if (driver.delta < 0) causes.add(driver.label);
        }
    }

    const crisis: SecessionCrisis = {
        id: `secession-${factionId}-${systemIds[0] ?? planetIds[0]}-${world.nowSeconds}`,
        factionId,
        name: nameCrisis(world, planetIds),
        planetIds,
        systemIds,
        leaderId: leader?.id,
        leaderName: leader?.name,
        openedAtSeconds: world.nowSeconds,
        deadlineSeconds: world.nowSeconds + CRISIS_WINDOW_SECONDS,
        independenceSupport: computeIndependenceSupport(world, planetIds),
        governorLoyalty: computeGovernorLoyalty(world, planetIds),
        militaryLoyalty: computeMilitaryLoyalty(world, factionId),
        demands: demandsFor(world, planetIds),
        granted: [],
        causes: [...causes].slice(0, 4),
        status: 'open',
    };

    world.secessionCrises.set(crisis.id, crisis);
    gov.history.push({
        timestamp: world.nowSeconds,
        event: `${crisis.name}: ${planetIds.length} worlds demand independence.`,
    });

    try {
        fireNotification({
            id: crisis.id,
            factionId,
            category: 'politics',
            priority: 'urgent',
            title: crisis.name.toUpperCase(),
            body: `${planetIds.length} worlds demand independence. Support for leaving: ${Math.round(crisis.independenceSupport)}%.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { crisisId: crisis.id },
        });
    } catch { /* notification queue absent in tests */ }

    try {
        pushWorldStory(world, { targetEmpireId: factionId, subject: crisis.name, magnitude: 85 });
    } catch { /* press state absent on minimal worlds */ }

    return crisis;
}

// ─── Negotiation ──────────────────────────────────────────────────────────────

export interface SecessionActionResult {
    ok: boolean;
    message?: string;
    outcome?: string;
    independenceSupport?: number;
    settled?: boolean;
}

/**
 * Concede one of the region's demands. Each concession is permanent — it buys
 * the empire's survival at the cost of the centre's reach.
 */
export function grantConcession(
    world: GameWorldState,
    factionId: string,
    crisisId: string,
    demandId: SecessionDemandId
): SecessionActionResult {
    const crisis = world.secessionCrises?.get(crisisId);
    if (!crisis || crisis.status !== 'open') return { ok: false, message: 'That crisis is no longer open.' };
    if (crisis.factionId !== factionId) return { ok: false, message: 'That crisis is not yours to settle.' };
    if (crisis.granted.includes(demandId)) return { ok: false, message: 'That concession has already been made.' };

    const demand = secessionDemand(demandId);
    if (!demand) return { ok: false, message: `Unknown concession "${demandId}".` };

    const gov = getGovernment(world, factionId)!;
    if (!spendPoliticalCapital(world, factionId, demand.politicalCapital, `conceded ${demand.label} to ${crisis.name}`)) {
        return {
            ok: false,
            message: `Needs ${demand.politicalCapital} political capital; the government holds ${Math.floor(gov.politicalCapital)}.`,
        };
    }

    crisis.granted.push(demandId);

    // Asked-for concessions land properly; unasked ones read as a brush-off.
    const asked = crisis.demands.includes(demandId);
    const effect = asked ? demand.support : demand.support * 0.4;
    crisis.independenceSupport = clamp100(crisis.independenceSupport - effect);

    applyConcession(world, crisis, demandId);

    if (crisis.independenceSupport <= SECESSION_SETTLE_THRESHOLD) {
        return settle(world, crisis);
    }

    return {
        ok: true,
        outcome: `${demand.label} conceded — support for independence now ${Math.round(crisis.independenceSupport)}%`,
        independenceSupport: crisis.independenceSupport,
        settled: false,
    };
}

/** The standing price of each concession. */
function applyConcession(world: GameWorldState, crisis: SecessionCrisis, demandId: SecessionDemandId): void {
    const gov = getGovernment(world, crisis.factionId)!;

    for (const planetId of crisis.planetIds) {
        const record = getPlanetCohesion(world, planetId);
        const planet = world.construction.planets.get(planetId);
        if (!record) continue;

        switch (demandId) {
            case 'autonomy':
                record.autonomy = Math.min(100, (record.autonomy ?? 0) + 40);
                record.cohesion = clamp100(record.cohesion + 18);
                break;
            case 'tax_relief':
                record.autonomy = Math.min(100, (record.autonomy ?? 0) + 15);
                record.cohesion = clamp100(record.cohesion + 10);
                if (planet) planet.happiness = clamp100((planet.happiness ?? 80) + 10);
                break;
            case 'resource_rights':
                record.autonomy = Math.min(100, (record.autonomy ?? 0) + 20);
                record.cohesion = clamp100(record.cohesion + 12);
                break;
            case 'local_parliament':
                record.autonomy = Math.min(100, (record.autonomy ?? 0) + 25);
                record.cohesion = clamp100(record.cohesion + 15);
                break;
            case 'military_exemption':
                record.cohesion = clamp100(record.cohesion + 12);
                if (planet) planet.unrest = clamp100((planet.unrest ?? 0) - 15);
                break;
        }

        const governor = getGovernor(world, planetId);
        if (governor) governor.loyalty = clamp100(governor.loyalty + 10);
    }

    // Devolving power is a constitutional act; the army reads exemptions as an insult.
    if (demandId === 'local_parliament') {
        gov.senatePower = clamp100(gov.senatePower + 5);
        gov.executivePower = clamp100(gov.executivePower - 5);
    }
    if (demandId === 'military_exemption') {
        const military = world.movement.empirePostures.get(crisis.factionId)?.blocs?.find(b => b.id === 'military');
        if (military) military.satisfaction = clamp100(military.satisfaction - 12);
        gov.coupPressure = clamp100((gov.coupPressure ?? 0) + 5);
    }
}

function settle(world: GameWorldState, crisis: SecessionCrisis): SecessionActionResult {
    crisis.status = 'settled';
    crisis.resolvedAtSeconds = world.nowSeconds;
    crisis.outcome = `settled on terms — ${crisis.granted.length} concession(s), the flag stays`;

    const gov = getGovernment(world, crisis.factionId);
    if (gov) {
        gov.legitimacy = clamp100(gov.legitimacy + 4); // a government that can make a deal
        gov.history.push({ timestamp: world.nowSeconds, event: `${crisis.name} settled without bloodshed.` });
    }

    try {
        fireNotification({
            id: `${crisis.id}-settled`,
            factionId: crisis.factionId,
            category: 'politics',
            priority: 'normal',
            title: 'Crisis Settled',
            body: `${crisis.name}: ${crisis.outcome}`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { crisisId: crisis.id },
        });
    } catch { /* notification queue absent in tests */ }

    return { ok: true, outcome: crisis.outcome, independenceSupport: crisis.independenceSupport, settled: true };
}

/**
 * Answer the region with force. It works — support collapses — and the empire
 * pays for it everywhere else, permanently and in public.
 */
export function suppressSecession(
    world: GameWorldState,
    factionId: string,
    crisisId: string
): SecessionActionResult {
    const crisis = world.secessionCrises?.get(crisisId);
    if (!crisis || crisis.status !== 'open') return { ok: false, message: 'That crisis is no longer open.' };
    if (crisis.factionId !== factionId) return { ok: false, message: 'That crisis is not yours to suppress.' };

    const gov = getGovernment(world, factionId)!;
    if (!spendPoliticalCapital(world, factionId, SUPPRESS_SECESSION_COST, `suppressed ${crisis.name}`)) {
        return {
            ok: false,
            message: `Suppression needs ${SUPPRESS_SECESSION_COST} political capital; the government holds ${Math.floor(gov.politicalCapital)}.`,
        };
    }

    // Troops asked to fire on their own neighbours may simply decline.
    const rng = new RNG(seedFromString(`${crisis.id}|suppress`));
    const obeyed = rng.next() < crisis.militaryLoyalty / 100;

    if (!obeyed) {
        crisis.independenceSupport = clamp100(crisis.independenceSupport + 15);
        crisis.militaryLoyalty = clamp100(crisis.militaryLoyalty - 20);
        gov.legitimacy = clamp100(gov.legitimacy - 8);
        gov.coupPressure = clamp100((gov.coupPressure ?? 0) + 10);
        crisis.outcome = 'the garrison refused to fire on its own neighbours';
        gov.history.push({ timestamp: world.nowSeconds, event: `${crisis.name}: ${crisis.outcome}.` });

        try {
            pushWorldStory(world, { targetEmpireId: factionId, subject: `${crisis.name}: troops refuse orders`, magnitude: 90 });
        } catch { /* press state absent */ }

        return { ok: true, outcome: crisis.outcome, independenceSupport: crisis.independenceSupport, settled: false };
    }

    crisis.status = 'suppressed';
    crisis.resolvedAtSeconds = world.nowSeconds;
    crisis.independenceSupport = clamp100(crisis.independenceSupport - 45);
    crisis.outcome = 'put down by force';

    for (const planetId of crisis.planetIds) {
        const planet = world.construction.planets.get(planetId);
        const record = getPlanetCohesion(world, planetId);
        if (planet) {
            planet.unrest = clamp100((planet.unrest ?? 0) - 45);
            planet.stability = clamp100((planet.stability ?? 50) + 20);
            planet.happiness = clamp100((planet.happiness ?? 80) - 25);
        }
        if (record) record.cohesion = clamp100(record.cohesion + 10);
    }

    // Every world in the empire watched this happen.
    for (const record of world.planetCohesion?.values() ?? []) {
        if (record.factionId !== factionId) continue;
        if (crisis.planetIds.includes(record.planetId)) continue;
        record.cohesion = clamp100(record.cohesion - 6);
    }

    gov.legitimacy = clamp100(gov.legitimacy - 10);
    recordPoliticalEvent(world, factionId, 'purge_officers', 2);
    gov.history.push({ timestamp: world.nowSeconds, event: `${crisis.name} was put down by force.` });

    try {
        pushWorldStory(world, { targetEmpireId: factionId, subject: `${crisis.name} crushed`, magnitude: 95 });
    } catch { /* press state absent */ }

    return { ok: true, outcome: crisis.outcome, independenceSupport: crisis.independenceSupport, settled: false };
}

// ─── Escalation ───────────────────────────────────────────────────────────────

/**
 * Refresh live crisis readouts, and escalate any region that ran out of
 * patience. Escalation is where lib/combat/secession-service is consulted: it
 * decides whether the region turns violent and how strong the rebels are.
 */
export function tickSecession(world: GameWorldState, deltaSeconds: number): void {
    if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();

    for (const crisis of world.secessionCrises.values()) {
        if (crisis.status !== 'open') continue;

        // A region's mood moves while the government deliberates.
        crisis.independenceSupport = clamp100(
            computeIndependenceSupport(world, crisis.planetIds)
            - crisis.granted.reduce((sum, id) => sum + (secessionDemand(id)?.support ?? 0), 0)
        );
        crisis.governorLoyalty = computeGovernorLoyalty(world, crisis.planetIds);
        crisis.militaryLoyalty = computeMilitaryLoyalty(world, crisis.factionId);

        if (crisis.independenceSupport <= SECESSION_SETTLE_THRESHOLD && crisis.granted.length > 0) {
            settle(world, crisis);
            continue;
        }

        if (world.nowSeconds >= crisis.deadlineSeconds) escalate(world, crisis);
    }

    formSecessionCrises(world);
    pruneResolved(world);
}

/**
 * The region stopped asking. Consults the long-dead evaluateSecessionRisk to
 * decide whether this becomes a shooting matter, and spawnRebelGarrison to arm
 * it. Phase 6.4 turns the result into an actual breakaway state; here it marks
 * worlds in open revolt and names the faction that will hold them.
 */
function escalate(world: GameWorldState, crisis: SecessionCrisis): void {
    const gov = getGovernment(world, crisis.factionId);
    crisis.status = 'escalated';
    crisis.resolvedAtSeconds = world.nowSeconds;
    crisis.escalatedAtSeconds = world.nowSeconds;

    // Foreign money is what turns a protest into an insurgency.
    const foreignFunding = crisis.systemIds.reduce(
        (sum, systemId) => sum + (world.espionage?.regionEscalation?.get(systemId)?.operationCount ?? 0) * 8,
        0
    );

    let violent = false;
    for (const planetId of crisis.planetIds) {
        const planet = world.construction.planets.get(planetId);
        if (!planet) continue;

        // The region's patience is spent — treat that as unrest at the limit.
        const event = evaluateSecessionRisk(
            planet.systemId,
            crisis.factionId,
            Math.max(planet.unrest ?? 0, 100),
            crisis.independenceSupport,
            foreignFunding
        );
        if (!event) continue;

        violent = true;
        crisis.rebelFactionId ??= event.newRebelFactionId;

        const garrison = spawnRebelGarrison(event, planet.population ?? 10, foreignFunding);
        planet.unrest = 100;
        planet.stability = clamp100((planet.stability ?? 50) - 30);
        // Phase 6.4 converts this into a real breakaway faction and its forces.
        (planet as any).rebelGarrison = garrison;

        const record = getPlanetCohesion(world, planetId);
        if (record) record.cohesion = 0;
    }

    crisis.outcome = violent
        ? 'negotiations failed — the region is in open revolt'
        : 'negotiations failed — the region governs itself in all but name';

    if (gov) {
        gov.legitimacy = clamp100(gov.legitimacy - 12);
        gov.history.push({ timestamp: world.nowSeconds, event: `${crisis.name}: ${crisis.outcome}.` });
    }

    try {
        fireNotification({
            id: `${crisis.id}-escalated`,
            factionId: crisis.factionId,
            category: 'politics',
            priority: 'urgent',
            title: 'SECESSION CRISIS ESCALATED',
            body: `${crisis.name}: ${crisis.outcome}.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'government',
            payload: { crisisId: crisis.id, rebelFactionId: crisis.rebelFactionId },
        });
    } catch { /* notification queue absent in tests */ }

    try {
        pushWorldStory(world, { targetEmpireId: crisis.factionId, subject: `${crisis.name}: ${crisis.outcome}`, magnitude: 100 });
    } catch { /* press state absent */ }
}

function pruneResolved(world: GameWorldState): void {
    const resolved = [...world.secessionCrises.values()]
        .filter(c => c.status !== 'open')
        .sort((a, b) => (a.resolvedAtSeconds ?? 0) - (b.resolvedAtSeconds ?? 0));
    const excess = resolved.length - MAX_RESOLVED_KEPT;
    for (let i = 0; i < excess; i++) world.secessionCrises.delete(resolved[i].id);
}
