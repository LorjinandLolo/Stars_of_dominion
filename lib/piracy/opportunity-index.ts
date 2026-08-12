// lib/piracy/opportunity-index.ts
// Pirate system Phase 2 — the Piracy Opportunity Index.
//
// Design: docs/pirate-system/emergence.md §1.
//
//     POI = 100 × value × exposure × instability × chokepoint amplification
//
// Multiplicative, not additive: a rich defended lane produces nothing, an empty
// lawless void produces nothing. Piracy needs something worth stealing AND the
// ability to steal it AND nobody paying attention. Every input is read off state
// the engine already carries, so the index can tell a player exactly which of
// their own decisions grew the corsairs on their frontier.

import type { GameWorldState } from '../game-world-state';
import type { SystemNode } from '../movement/types';
import { Resource } from '../trade-system/types';

export const PIRATE_FACTION_ID = 'faction-pirates';

/** Cargo classes worth diverting a raid for. */
const HIGH_VALUE_RESOURCES = new Set<Resource>([
    Resource.RARES, Resource.CAPACOLA, Resource.SACRED_FLORA, Resource.AMMO,
]);

/** Archetypes that are chokepoints by construction. */
const CHOKEPOINT_TAGS = new Set(['throat', 'canal', 'strait', 'gate', 'bridge']);

/** Rivalries at or above this escalation are shooting wars (matches trade). */
const HOSTILE_ESCALATION_LEVEL = 5;

/** Hops at which distance from the capital stops making things worse. */
const REACH_SATURATION_HOPS = 6;
/** Route length, in hops, at which a lane cannot be covered end to end. */
const REACH_SATURATION_ROUTE = 10;

/** Share of all live routes through one system that counts as a full chokepoint. */
const BETWEENNESS_FULL = 0.15;
/**
 * Below this many live routes, "share of all routes" says nothing — in a galaxy
 * with one agreement every system on its path carries 100% of the traffic.
 * Chokepoint status then has to come from geography (corridors, archetypes).
 */
const BETWEENNESS_MIN_ROUTES = 7;

export interface OpportunityBreakdown {
    systemId: string;
    /** 0–100. */
    poi: number;
    /** 0–1 factors. */
    value: number;
    exposure: number;
    instability: number;
    /** 0–1. Amplifies the product; geography, not economics. */
    chokepointScore: number;
    /** Which factor did the most to produce this reading. */
    dominantFactor: 'value' | 'exposure' | 'instability';
    /** The specific input behind the dominant factor, for the emergence log. */
    dominantInput: string;
    /** Whose neglect, or whose deliberate act. */
    blamedFactionId?: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ─── Precomputed per-tick context ────────────────────────────────────────────

interface RouteLoad {
    /** Σ routePriority of live routes through this system. */
    priority: number;
    /** Mean escortLevel (0–8) of those routes. */
    escort: number;
    /** Longest transiting route, in hops. */
    longestPath: number;
    /** True when any transiting agreement carries a high-value resource. */
    highValueCargo: boolean;
    /** Count of routes through here — the betweenness numerator. */
    routeCount: number;
}

interface IndexContext {
    routeLoad: Map<string, RouteLoad>;
    totalRoutes: number;
    /** factionId → systemId → hops from that faction's capital. */
    capitalDistance: Map<string, Map<string, number>>;
    /** systemId → Σ strength of non-pirate fleets here or one hop away. */
    navalPresence: Map<string, number>;
    /** Factions currently in a shooting war. */
    atWar: Set<string>;
    /** Factions under someone's sanctions or embargo. */
    sanctioned: Set<string>;
    /** Systems carrying an active shadow-economy node, and who planted it. */
    shadowNodes: Map<string, string>;
    /** Chokepoint system ids drawn from corridor definitions. */
    corridorChokepoints: Set<string>;
}

function buildRouteLoad(world: GameWorldState): { routeLoad: Map<string, RouteLoad>; totalRoutes: number } {
    const routeLoad = new Map<string, RouteLoad>();
    const routes = world.economy?.tradeRoutes;
    const agreements = world.economy?.tradeAgreements;
    if (!(routes instanceof Map)) return { routeLoad, totalRoutes: 0 };

    for (const route of routes.values()) {
        const agreement = agreements instanceof Map ? agreements.get(route.agreementId) : undefined;
        const highValue = !!agreement && HIGH_VALUE_RESOURCES.has(agreement.resource);
        for (const systemId of route.path ?? []) {
            const entry = routeLoad.get(systemId) ?? {
                priority: 0, escort: 0, longestPath: 0, highValueCargo: false, routeCount: 0,
            };
            entry.priority += route.routePriority ?? 0;
            entry.escort += route.escortLevel ?? 0;
            entry.longestPath = Math.max(entry.longestPath, route.path?.length ?? 0);
            entry.highValueCargo = entry.highValueCargo || highValue;
            entry.routeCount += 1;
            routeLoad.set(systemId, entry);
        }
    }
    // escort accumulated as a sum; turn it into the mean the design asks for.
    for (const entry of routeLoad.values()) {
        if (entry.routeCount > 0) entry.escort /= entry.routeCount;
    }
    return { routeLoad, totalRoutes: routes.size };
}

/** Hops from one system to every other, over hyperlanes. */
function hopDistances(world: GameWorldState, fromSystemId: string): Map<string, number> {
    const dist = new Map<string, number>([[fromSystemId, 0]]);
    const queue: string[] = [fromSystemId];
    while (queue.length) {
        const current = queue.shift()!;
        const depth = dist.get(current)!;
        if (depth >= REACH_SATURATION_HOPS) continue;   // no need to walk further
        const node = world.movement.systems.get(current);
        for (const neighbour of node?.hyperlaneNeighbors ?? []) {
            if (dist.has(neighbour)) continue;
            dist.set(neighbour, depth + 1);
            queue.push(neighbour);
        }
    }
    return dist;
}

function buildContext(world: GameWorldState): IndexContext {
    const { routeLoad, totalRoutes } = buildRouteLoad(world);

    // Distance from power, one BFS per capital rather than one per system.
    const capitalDistance = new Map<string, Map<string, number>>();
    const factions = world.economy?.factions;
    if (factions instanceof Map) {
        for (const faction of factions.values()) {
            if (!faction.capitalSystemId) continue;
            capitalDistance.set(faction.id, hopDistances(world, faction.capitalSystemId));
        }
    }

    // Naval cover: a fleet one hop away still shortens the odds.
    const navalPresence = new Map<string, number>();
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === PIRATE_FACTION_ID || !fleet.currentSystemId) continue;
        const strength = fleet.strength ?? 0;
        navalPresence.set(fleet.currentSystemId, (navalPresence.get(fleet.currentSystemId) ?? 0) + strength);
        const node = world.movement.systems.get(fleet.currentSystemId);
        for (const neighbour of node?.hyperlaneNeighbors ?? []) {
            navalPresence.set(neighbour, (navalPresence.get(neighbour) ?? 0) + strength * 0.5);
        }
    }

    const atWar = new Set<string>();
    const rivalries = world.rivalries;
    if (rivalries instanceof Map) {
        for (const rivalry of rivalries.values()) {
            if ((rivalry.escalationLevel ?? 0) < HOSTILE_ESCALATION_LEVEL) continue;
            atWar.add(rivalry.empireAId);
            atWar.add(rivalry.empireBId);
        }
    }

    // Sanctions suppress legal trade and reward the illegal kind.
    const sanctioned = new Set<string>();
    const policies = world.economy?.policies;
    if (policies instanceof Map) {
        for (const policy of policies.values()) {
            // Declared a Set, but a snapshot that round-tripped through JSON
            // without the Map/Set reviver hands back a plain array.
            const targets = policy.sanctions as unknown;
            if (targets instanceof Set) for (const id of targets) sanctioned.add(id as string);
            else if (Array.isArray(targets)) for (const id of targets) sanctioned.add(id as string);
            for (const embargo of policy.embargoes ?? []) sanctioned.add(embargo.factionId);
        }
    }

    const shadowNodes = new Map<string, string>();
    const nodes = world.espionage?.shadowEconomyNodes;
    if (nodes instanceof Map) {
        for (const node of nodes.values()) shadowNodes.set(node.systemId, node.factionId);
    }

    const corridorChokepoints = new Set<string>();
    if (world.movement.corridors instanceof Map) {
        for (const corridor of world.movement.corridors.values()) {
            for (const id of corridor.chokepointIds ?? []) corridorChokepoints.add(id);
        }
    }

    return {
        routeLoad, totalRoutes, capitalDistance, navalPresence,
        atWar, sanctioned, shadowNodes, corridorChokepoints,
    };
}

// ─── The three factors ───────────────────────────────────────────────────────

/** Is there anything here worth taking? */
function valueFactor(sys: SystemNode, load: RouteLoad | undefined): number {
    const tradeValue = (sys.tradeValue ?? 0) / 100;
    // routePriority is unbounded in principle; 40 is a busy junction.
    const routeLoad = Math.min(1, (load?.priority ?? 0) / 40);
    const cargoQuality = load?.highValueCargo ? 1.6 : 1.0;
    return clamp01((tradeValue * 0.5 + routeLoad * 0.5) * cargoQuality);
}

/** Can it be taken safely? */
function exposureFactor(
    sys: SystemNode,
    load: RouteLoad | undefined,
    context: IndexContext
): { exposure: number; reason: string } {
    const security = (sys.security ?? 50) / 100;
    const escort = (load?.escort ?? 0) / 8;
    const naval = Math.min(1, (context.navalPresence.get(sys.id) ?? 0) / 2);
    const securityCover = 0.5 * security + 0.3 * escort + 0.2 * naval;

    const ownerDistance = sys.ownerFactionId
        ? context.capitalDistance.get(sys.ownerFactionId)?.get(sys.id)
        : undefined;
    // Unreachable or unowned ground is as far from power as it gets.
    const hops = ownerDistance ?? REACH_SATURATION_HOPS;
    const distanceTerm = Math.min(1, hops / REACH_SATURATION_HOPS);
    const routeTerm = Math.min(1, (load?.longestPath ?? 0) / REACH_SATURATION_ROUTE);
    const reachPenalty = Math.max(distanceTerm, routeTerm);

    const unowned = !sys.ownerFactionId || sys.isContested ? 0.15 : 0;
    const exposure = clamp01((1 - securityCover + unowned) * (0.6 + 0.4 * reachPenalty));

    let reason = `security=${Math.round((sys.security ?? 50))}`;
    if (escort === 0 && (load?.routeCount ?? 0) > 0) reason = 'escortLevel=0';
    else if (!sys.ownerFactionId) reason = 'unowned';
    else if (hops >= REACH_SATURATION_HOPS) reason = `hopsFromCapital>=${REACH_SATURATION_HOPS}`;
    return { exposure, reason };
}

/** Is anyone paying attention? */
function instabilityFactor(
    sys: SystemNode,
    context: IndexContext,
    world: GameWorldState
): { instability: number; reason: string; blamed?: string } {
    const unrest = clamp01(((sys.instability ?? 0) / 100) * 0.6 + ((sys.escalationLevel ?? 0) / 10) * 0.4);

    const gov = sys.ownerFactionId ? world.government?.get(sys.ownerFactionId) : undefined;
    const cohesionTerm = gov ? clamp01(1 - (gov.cohesion ?? 50) / 100) : 0.5;
    const corruption = gov ? clamp01((gov.corruption ?? 0) / 100) : 0;
    const warStrain = sys.ownerFactionId && context.atWar.has(sys.ownerFactionId)
        ? clamp01(0.5 + (gov?.warFatigue ?? 0) / 200)
        : 0;

    const shadowSponsor = context.shadowNodes.get(sys.id);
    const shadowTerm = shadowSponsor ? 1 : 0;
    const sanctionTerm = sys.ownerFactionId && context.sanctioned.has(sys.ownerFactionId) ? 1 : 0;

    const instability = clamp01(
        0.30 * unrest
        + 0.20 * cohesionTerm
        + 0.15 * warStrain
        + 0.15 * ((sys.lawlessness ?? 0) / 100)
        + 0.10 * corruption
        + 0.05 * shadowTerm
        + 0.05 * sanctionTerm
    );

    let reason = 'unrest';
    let blamed: string | undefined;
    if (shadowSponsor) { reason = 'shadowEconomyNode'; blamed = shadowSponsor; }
    else if (warStrain > 0) reason = 'ownerAtWar';
    else if (sanctionTerm > 0) reason = 'sanctions';
    else if (corruption > 0.6) reason = 'corruption';
    else if (cohesionTerm > 0.6) reason = 'ownerCohesion';
    return { instability, reason, blamed };
}

/** Geography: everything must pass through here, so the pirate need not search. */
function chokepointScore(sys: SystemNode, context: IndexContext): number {
    if (context.corridorChokepoints.has(sys.id)) return 1;
    if (sys.tags?.some(tag => CHOKEPOINT_TAGS.has(tag))) return 1;
    const routes = context.routeLoad.get(sys.id)?.routeCount ?? 0;
    if (context.totalRoutes < BETWEENNESS_MIN_ROUTES || routes <= 0) return 0;
    return clamp01((routes / context.totalRoutes) / BETWEENNESS_FULL);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Score every system. Cheap enough to run per tick: one BFS per capital, one
 * pass over routes and fleets, then arithmetic per system.
 */
export function computeOpportunityIndex(world: GameWorldState): Map<string, OpportunityBreakdown> {
    const context = buildContext(world);
    const result = new Map<string, OpportunityBreakdown>();

    for (const sys of world.movement.systems.values()) {
        const load = context.routeLoad.get(sys.id);
        const value = valueFactor(sys, load);
        const { exposure, reason: exposureReason } = exposureFactor(sys, load, context);
        const { instability, reason: instabilityReason, blamed } = instabilityFactor(sys, context, world);
        const choke = chokepointScore(sys, context);

        const poi = Math.max(0, Math.min(100,
            100 * value * exposure * instability * (1 + 0.6 * choke)
        ));

        // The dominant factor is the one furthest from 1 — the binding
        // constraint on this system's attractiveness, and therefore the lever
        // that produced the reading.
        let dominantFactor: OpportunityBreakdown['dominantFactor'] = 'value';
        let dominantInput = load?.highValueCargo ? 'highValueCargo' : `tradeValue=${Math.round(sys.tradeValue ?? 0)}`;
        if (exposure >= value && exposure >= instability) {
            dominantFactor = 'exposure';
            dominantInput = exposureReason;
        } else if (instability >= value && instability >= exposure) {
            dominantFactor = 'instability';
            dominantInput = instabilityReason;
        }

        result.set(sys.id, {
            systemId: sys.id,
            poi,
            value,
            exposure,
            instability,
            chokepointScore: choke,
            dominantFactor,
            dominantInput,
            blamedFactionId: blamed,
        });
    }
    return result;
}
