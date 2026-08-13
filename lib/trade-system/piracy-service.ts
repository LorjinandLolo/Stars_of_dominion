/**
 * lib/trade-system/piracy-service.ts
 * Phase 14 — Active Piracy & Privateering
 *
 * Allows fleets (pirate or privateer) to physically occupy a system
 * that a Trade Route passes through, siphoning a fraction of goods
 * from every flow passing under their guns. Triggers "Shadow Tab" crises
 * if the loss is significant.
 *
 * Pirate system Phase 0 (docs/pirate-system/systems.md §10): a PiracyFleet is
 * no longer an independent population with its own spawn rule. It is a per-system
 * interdiction record DERIVED each tick from the physical 'faction-pirates' fleets
 * in world.movement — see derivePiracyFleets. Previously the two layers spawned,
 * grew and died separately, so the raiders the player could see on the map had no
 * economic effect and the raiders taxing their trade did not exist on the map.
 */

import { TradeRoute, Resource } from './types';
import { RNG } from './rng';

// ─── Data Models ─────────────────────────────────────────────────────────────

export type PiracyActorType = 'pirate' | 'privateer';

/**
 * A hostile fleet sitting on a system node, actively preying on
 * any Trade Route whose path passes through that system.
 */
export interface PiracyFleet {
    id: string;
    actorType: PiracyActorType;
    /** The faction that sponsors a privateer (null for independent pirates). */
    sponsorFactionId: string | null;
    /** The system hex they are camped in. */
    systemId: string;
    /** 0–1: how effective this fleet is at intercepting trade (scales with fleet size). */
    interdictionStrength: number;
    /** Which resources they preferentially target. Empty = opportunistic (takes all). */
    targetedResources: Resource[];
    /** Accumulated loot (credits equivalent). */
    lootAccumulated: number;
    /** Whether this fleet was detected by an intelligence operation. */
    isDetected: boolean;
    /** Owning pirate organization, once organizations exist. Null = unaffiliated. */
    organizationId?: string | null;
    /** Ids of the movement-layer fleets this record was derived from. */
    raiderFleetIds?: string[];
    /**
     * How hard they are squeezing. The skim is the sophisticated play: a lane
     * that stays profitable is a lane the owner never bothers to escort.
     */
    posture?: PiracyPosture;
}

export type PiracyPosture = 'skim' | 'prey' | 'strangle';

/** Fraction of a route's flow taken per landed raid, by posture. */
export const POSTURE_SIPHON: Record<PiracyPosture, [number, number]> = {
    skim: [0.05, 0.10],
    prey: [0.15, 0.30],
    strangle: [0.40, 0.70],
};

/**
 * The movement-layer facts derivePiracyFleets needs about one raider. Kept as a
 * plain shape so this module stays free of the movement/world imports.
 */
export interface RaiderSnapshot {
    fleetId: string;
    systemId: string;
    /** 0–1 fleet strength. */
    strength: number;
    organizationId?: string | null;
    /** Set when this raider is a sponsored privateer rather than an independent. */
    sponsorFactionId?: string | null;
}

export interface PiracyInterdictionResult {
    routeId: string;
    fleetId: string;
    /** Resource type seized. */
    resource: Resource;
    /** Volume of goods lost from the trade flow. */
    volumeLost: number;
    /** Credit-equivalent value of the theft. */
    valueLost: number;
    /** True if this theft was large enough to trigger a Shadow Tab crisis. */
    triggersCrisis: boolean;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const CRISIS_THRESHOLD_CREDITS = 5000;
const BASE_PRICE_PER_UNIT = 12; // credits per resource unit, baseline

/**
 * How much interdiction strength one point of raider fleet strength is worth.
 * A lone weak raider barely troubles a lane; a pack parked on a chokepoint
 * approaches total interception.
 */
const INTERDICTION_PER_STRENGTH = 0.5;
const MIN_INTERDICTION = 0.05;
const MAX_INTERDICTION = 0.95;

// ─── Core Logic ──────────────────────────────────────────────────────────────

/**
 * For every active piracy fleet, check all trade routes that pass through
 * their occupied system and siphon goods.
 *
 * Call once per simulation tick.
 */
export function tickPiracyInterdiction(
    piracyFleets: PiracyFleet[],
    routes: TradeRoute[],
    rng: RNG,
    /**
     * Per-(camp, route) intercept chance. The pirate system passes `raidOdds`,
     * which already prices escorts, garrisons, ambush position and the leader —
     * so when it is supplied the legacy escort mitigation below MUST NOT run, or
     * escorts are charged twice and a lane at level 3+ becomes unraidable.
     *
     * It is also per ROUTE: `interdictionStrength` is a per-CAMP field, so a
     * junction shared by an escorted and an unescorted lane used to apply one
     * lane's defence to the other, decided purely by array order.
     */
    oddsFor?: (fleet: PiracyFleet, route: TradeRoute) => number,
    /** Posture per route, for the same reason. Falls back to the camp's. */
    postureFor?: (fleet: PiracyFleet, route: TradeRoute) => PiracyPosture
): PiracyInterdictionResult[] {
    const results: PiracyInterdictionResult[] = [];

    for (const fleet of piracyFleets) {
        // Find all routes whose PATH passes through this system
        const vulnerableRoutes = routes.filter(r => r.path.includes(fleet.systemId));

        for (const route of vulnerableRoutes) {
            const interceptChance = oddsFor
                ? oddsFor(fleet, route)
                // Legacy path: fleet strength × (1 - route's escort mitigation).
                : fleet.interdictionStrength * (1 - Math.min(0.8, route.escortLevel * 0.1));

            if (!rng.check(interceptChance)) continue;

            // Determine which resource is seized
            const resource = fleet.targetedResources.length > 0
                ? fleet.targetedResources[Math.floor(rng.next() * fleet.targetedResources.length)]
                : randomResource(rng);

            // How much they take is a choice, not a constant. Strangling a lane
            // kills the pirates' own income; skimming one can run for years
            // inside a great power's economy without provoking a response.
            const posture = postureFor?.(fleet, route) ?? fleet.posture ?? 'prey';
            const [minSiphon, maxSiphon] = POSTURE_SIPHON[posture];
            const siphonRate = minSiphon + rng.next() * (maxSiphon - minSiphon);
            const volumeLost = route.routePriority * siphonRate * 100; // routePriority as proxy for flow volume
            const valueLost = volumeLost * BASE_PRICE_PER_UNIT;

            // Boost the fleet's loot pool
            fleet.lootAccumulated += valueLost;

            // Boost the route's piracy risk score for future ticks (ratchet mechanic)
            route.piracyRisk = Math.min(0.95, route.piracyRisk + 0.02);

            const triggersCrisis = valueLost >= CRISIS_THRESHOLD_CREDITS;

            results.push({
                routeId: route.id,
                fleetId: fleet.id,
                resource,
                volumeLost: Math.round(volumeLost),
                valueLost: Math.round(valueLost),
                triggersCrisis
            });
        }
    }

    return results;
}

/**
 * Build the interdiction record for one system's worth of raiders.
 *
 * The id is derived from the system rather than a wall clock: the record is
 * rebuilt every tick, so a `Date.now()` id would have produced a new identity —
 * and a reset loot pool — on each pass.
 */
export function spawnPiracyFleet(
    actorType: PiracyActorType,
    systemId: string,
    sponsorFactionId: string | null,
    interdictionStrength: number,
    targetedResources: Resource[] = [],
    /** Owning band. Part of the id, so rivals sharing a system stay separate. */
    organizationId: string | null = null
): PiracyFleet {
    return {
        id: organizationId ? `piracy-${systemId}-${organizationId}` : `piracy-${systemId}`,
        actorType,
        sponsorFactionId,
        systemId,
        interdictionStrength: Math.max(MIN_INTERDICTION, Math.min(1.0, interdictionStrength)),
        targetedResources,
        lootAccumulated: 0,
        isDetected: false,
        organizationId: null,
        raiderFleetIds: [],
        posture: 'prey'
    };
}

/**
 * Rebuild the interdiction registry from the live raider fleets.
 *
 * One record per occupied system PER BAND, its strength summed from that band's
 * raiders parked there. Keying on the system alone pooled rival organizations
 * into a single camp: their strengths added together, and whichever band came
 * first in Map iteration order was credited with the entire raid — loot, infamy,
 * heat and all — while its rival's hulls boosted the odds for nothing.
 *
 * Loot pools and detection flags carry over from the previous tick's record for
 * the same camp, so suppression bounties and intel state survive the rebuild; a
 * system the raiders have left simply drops out.
 */
export function derivePiracyFleets(
    raiders: RaiderSnapshot[],
    previous: Map<string, PiracyFleet>
): Map<string, PiracyFleet> {
    const byCamp = new Map<string, RaiderSnapshot[]>();
    for (const raider of raiders) {
        if (!raider.systemId) continue;
        const key = `${raider.systemId}::${raider.organizationId ?? ''}`;
        const list = byCamp.get(key);
        if (list) list.push(raider);
        else byCamp.set(key, [raider]);
    }

    const next = new Map<string, PiracyFleet>();
    for (const group of byCamp.values()) {
        const systemId = group[0].systemId;
        const organizationId = group[0].organizationId ?? null;
        const totalStrength = group.reduce((sum, r) => sum + Math.max(0, r.strength ?? 0), 0);
        const sponsorFactionId = group.find(r => r.sponsorFactionId)?.sponsorFactionId ?? null;
        const fleet = spawnPiracyFleet(
            sponsorFactionId ? 'privateer' : 'pirate',
            systemId,
            sponsorFactionId,
            Math.min(MAX_INTERDICTION, totalStrength * INTERDICTION_PER_STRENGTH),
            [],
            organizationId
        );
        fleet.organizationId = organizationId;
        fleet.raiderFleetIds = group.map(r => r.fleetId);

        const prior = previous.get(fleet.id);
        if (prior) {
            fleet.lootAccumulated = prior.lootAccumulated;
            fleet.isDetected = prior.isDetected;
            fleet.posture = prior.posture ?? fleet.posture;
        }
        next.set(fleet.id, fleet);
    }
    return next;
}

/**
 * Apply suppression damage to a raider's strength when a patrol/escort engages
 * it. Returns true when the raider is destroyed.
 *
 * Operates on the physical fleet: the interdiction record is derived, so damage
 * written to it would be erased on the next rebuild.
 */
export function suppressRaider(
    raider: { strength: number },
    suppressionStrength: number
): boolean {
    raider.strength -= suppressionStrength;
    return raider.strength <= 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomResource(rng: RNG): Resource {
    const resources = [Resource.METALS, Resource.CHEMICALS, Resource.FOOD, Resource.ENERGY, Resource.RARES];
    return resources[Math.floor(rng.next() * resources.length)];
}
