/**
 * lib/trade-system/piracy-service.ts
 * Phase 14 — Active Piracy & Privateering
 *
 * Allows fleets (pirate or privateer) to physically occupy a system
 * that a Trade Route passes through, siphoning a fraction of goods
 * from every flow passing under their guns. Triggers "Shadow Tab" crises
 * if the loss is significant.
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
    rng: RNG
): PiracyInterdictionResult[] {
    const results: PiracyInterdictionResult[] = [];

    for (const fleet of piracyFleets) {
        // Find all routes whose PATH passes through this system
        const vulnerableRoutes = routes.filter(r => r.path.includes(fleet.systemId));

        for (const route of vulnerableRoutes) {
            // Effective intercept chance = fleet strength × (1 - route's escort mitigation)
            const escortMitigation = Math.min(0.8, route.escortLevel * 0.1);
            const interceptChance = fleet.interdictionStrength * (1 - escortMitigation);

            if (!rng.check(interceptChance)) continue;

            // Determine which resource is seized
            const resource = fleet.targetedResources.length > 0
                ? fleet.targetedResources[Math.floor(rng.next() * fleet.targetedResources.length)]
                : randomResource(rng);

            // Siphon between 5% and 40% of the route's base flow per tick
            const siphonRate = 0.05 + rng.next() * 0.35;
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
 * Deploy a new piracy fleet to a system. Call this when:
 * - A player/AI empire decides to sponsor a Privateer
 * - A rebel faction gains military assets during a secession
 * - Random "corsair den" events spawn independent pirates
 */
export function spawnPiracyFleet(
    actorType: PiracyActorType,
    systemId: string,
    sponsorFactionId: string | null,
    interdictionStrength: number,
    targetedResources: Resource[] = []
): PiracyFleet {
    return {
        id: `piracy-${systemId}-${Date.now()}`,
        actorType,
        sponsorFactionId,
        systemId,
        interdictionStrength: Math.max(0.05, Math.min(1.0, interdictionStrength)),
        targetedResources,
        lootAccumulated: 0,
        isDetected: false
    };
}

/**
 * Reduce a piracy fleet's interdiction strength when a patrol/escort
 * successfully engages them. Remove from the registry when strength → 0.
 */
export function suppressPiracyFleet(
    fleet: PiracyFleet,
    suppressionStrength: number
): boolean {
    fleet.interdictionStrength -= suppressionStrength;
    return fleet.interdictionStrength <= 0; // returns true = fleet destroyed
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomResource(rng: RNG): Resource {
    const resources = [Resource.METALS, Resource.CHEMICALS, Resource.FOOD, Resource.ENERGY, Resource.RARES];
    return resources[Math.floor(rng.next() * resources.length)];
}
