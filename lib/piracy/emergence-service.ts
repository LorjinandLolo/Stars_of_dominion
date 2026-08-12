// lib/piracy/emergence-service.ts
// Pirate system Phase 2 — emergence.
//
// Design: docs/pirate-system/emergence.md.
//
// Piracy is not spawned, it is precipitated. This module scores the galaxy each
// tick (step 11b), lets the score ratchet local lawlessness, and then rolls
// against it (step 11c) so that raiders appear where the players' own decisions
// made raiding worth doing — fat lanes with no escort, chokepoints nobody
// garrisons, provinces whose owner is fighting somewhere else.
//
// Replaces step11_pirateSpawning, which rolled a flat chance in every system in
// the galaxy, ignored trade entirely, and produced pirates in empty voids.

import type { GameWorldState } from '../game-world-state';
import type { Fleet, SystemNode } from '../movement/types';
import { RNG, seedFromString } from '../trade-system/rng';
import { computeOpportunityIndex, OpportunityBreakdown } from './opportunity-index';
import {
    activeOrganizations,
    ensurePiracyState,
    foundOrganization,
    nearestOrganization,
    supportableFleets,
    PIRATE_FACTION_ID,
} from './organization-service';
import { EMERGENCE_LOG_LIMIT, PirateOrigin } from './piracy-types';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Spawn chance per tick in a system whose opportunity is total. */
const BASE_SPAWN_CHANCE = 0.06;
/**
 * Superlinear, so mediocre opportunity produces nothing and real opportunity
 * produces a lot. A POI of 50 is worth ~35% of the chance at 100, not half.
 */
const SPAWN_EXPONENT = 1.5;
/** Below this reading a system is simply not worth a pirate's time. */
const MIN_SPAWN_POI = 8;
/** Only the best candidates are rolled; scales with galaxy size. */
const CANDIDATE_FLOOR = 8;
const CANDIDATE_DIVISOR = 20;
/** Backstop against a runaway galaxy, not a design constraint. */
const GLOBAL_RAIDER_CAP = 40;
/** How far a band will reach to absorb a new raiding party. */
const ABSORPTION_HOPS = 3;

/** Lawlessness the ratchet adds per hour at POI 100 with raiders present. */
const LAWLESSNESS_GROWTH_PER_HOUR = 5;
/** Lawlessness burned off per hour per point of suppressing fleet strength. */
const LAWLESSNESS_SUPPRESSION_PER_HOUR = 6;
/** Passive healing per hour once the opportunity is gone. */
const LAWLESSNESS_HEAL_PER_HOUR = 1.5;
/** A parked fleet weaker than this is not suppressing anything. */
const MIN_SUPPRESSOR_STRENGTH = 0.4;

// ─── Step 11b — score the galaxy, ratchet the ground ─────────────────────────

/**
 * Recompute the Piracy Opportunity Index and let it move local lawlessness.
 *
 * Opportunity nobody exploits does not compound: growth requires raiders
 * actually operating in the system, so a rich undefended lane that has not yet
 * been found stays clean — and becomes filthy fast once it is.
 */
export function tickPiracyOpportunity(
    world: GameWorldState,
    deltaSeconds: number
): Map<string, OpportunityBreakdown> {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);
    const index = computeOpportunityIndex(world);

    // Who is sitting on whom, this tick.
    const raidersBySystem = new Map<string, number>();
    const suppressionBySystem = new Map<string, number>();
    for (const fleet of world.movement.fleets.values()) {
        if (!fleet.currentSystemId) continue;
        if (fleet.factionId === PIRATE_FACTION_ID) {
            raidersBySystem.set(fleet.currentSystemId, (raidersBySystem.get(fleet.currentSystemId) ?? 0) + 1);
        } else if ((fleet.strength ?? 0) >= MIN_SUPPRESSOR_STRENGTH) {
            suppressionBySystem.set(
                fleet.currentSystemId,
                (suppressionBySystem.get(fleet.currentSystemId) ?? 0) + (fleet.strength ?? 0)
            );
        }
    }

    piracy.opportunityIndex = new Map();
    for (const [systemId, breakdown] of index) {
        const sys = world.movement.systems.get(systemId);
        if (!sys) continue;

        piracy.opportunityIndex.set(systemId, breakdown.poi);
        sys.piracyOpportunity = breakdown.poi;

        const raiders = raidersBySystem.get(systemId) ?? 0;
        const suppression = suppressionBySystem.get(systemId) ?? 0;

        let lawlessness = sys.lawlessness ?? 0;
        if (raiders > 0) {
            lawlessness += LAWLESSNESS_GROWTH_PER_HOUR * (breakdown.poi / 100) * hours;
        } else if (breakdown.poi < MIN_SPAWN_POI) {
            // Pacified ground heals instead of staying permanently marked.
            lawlessness -= LAWLESSNESS_HEAL_PER_HOUR * hours;
        }
        lawlessness -= LAWLESSNESS_SUPPRESSION_PER_HOUR * suppression * hours;
        sys.lawlessness = Math.max(0, Math.min(100, lawlessness));

        // corsair_den is a CONDITION — ground gone lawless enough that raiders
        // can rest there. pirate_station is a built asset with an owner, and is
        // set by the base network, not here.
        if (sys.lawlessness >= 100 && !sys.tags.includes('corsair_den')) {
            sys.tags.push('corsair_den');
            console.log(`[Piracy] ${sys.name} has gone lawless — corsair den`);
        } else if (sys.lawlessness <= 40 && sys.tags.includes('corsair_den')) {
            sys.tags = sys.tags.filter(tag => tag !== 'corsair_den');
            console.log(`[Piracy] ${sys.name} pacified — corsair den cleared`);
        }
    }
    return index;
}

// ─── Origins ─────────────────────────────────────────────────────────────────

/**
 * What kind of band the conditions produce. Origin is the seed of identity:
 * two organizations with identical stats but different origins negotiate
 * differently, fracture along different lines, and want different endings.
 */
export function determineOrigin(
    world: GameWorldState,
    sys: SystemNode,
    breakdown: OpportunityBreakdown
): PirateOrigin {
    if (breakdown.dominantInput === 'shadowEconomyNode') return 'sponsored';
    if (breakdown.dominantInput === 'sanctions') return 'smuggler_syndicate';
    if (breakdown.dominantInput === 'ownerAtWar') return 'war_refugee';

    // A world that has stopped obeying its own capital arms whoever shows up.
    const secession = world.secessionCrises;
    if (secession instanceof Map) {
        for (const crisis of secession.values()) {
            if (crisis.systemIds?.includes(sys.id)) return 'secession_remnant';
        }
    }
    if ((sys.escalationLevel ?? 0) >= 7) return 'war_refugee';
    return 'frontier_desperation';
}

// ─── Step 11c — emergence ────────────────────────────────────────────────────

function createRaiderFleet(sys: SystemNode, world: GameWorldState, rng: RNG): Fleet {
    return {
        id: `pirate-raider-${sys.id}-${world.nowSeconds}`,
        name: 'Pirate Raider',
        factionId: PIRATE_FACTION_ID,
        organizationId: null,
        currentSystemId: sys.id,
        destinationSystemId: null,
        plannedPath: [],
        transitProgress: 0,
        strength: 0.2 + rng.next() * 0.4,
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
            trade: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
            corridor: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
            gate: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
            deepSpace: { speedMultiplier: 0.8, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
        },
        orders: [],
        etaSeconds: 0,
        activeLayer: null,
        isDetectable: true,
        postureId: 'Expansionist',
        doctrine: {
            type: 'Raider',
            deviationFromPosture: 0.5,
            preferredLayers: ['hyperlane', 'deepSpace'],
            retreatThreshold: 0.3,
            logisticsStrain: 0,
            moraleDrift: 0,
            supplyLevel: 1.0,
        },
        basePower: 100,
        composition: { interceptor: 2 },
    };
}

/**
 * Roll for new raiding parties in the systems worth raiding, and hand each one
 * either to the band already working that stretch of space or to a new band of
 * its own.
 */
export function tickPiracyEmergence(
    world: GameWorldState,
    precomputed?: Map<string, OpportunityBreakdown>
): void {
    const piracy = ensurePiracyState(world);

    const raiderCount = [...world.movement.fleets.values()]
        .filter(f => f.factionId === PIRATE_FACTION_ID).length;
    if (raiderCount >= GLOBAL_RAIDER_CAP) return;

    // Only the best opportunities are rolled at all. The index is handed over
    // by the opportunity pass rather than recomputed.
    const candidateCount = Math.max(CANDIDATE_FLOOR, Math.floor(world.movement.systems.size / CANDIDATE_DIVISOR));
    const index = precomputed ?? computeOpportunityIndex(world);
    const candidates = [...index.values()]
        .filter(b => b.poi >= MIN_SPAWN_POI)
        .sort((a, b) => b.poi - a.poi || a.systemId.localeCompare(b.systemId))
        .slice(0, candidateCount);

    for (const breakdown of candidates) {
        const sys = world.movement.systems.get(breakdown.systemId);
        if (!sys) continue;

        const rng = new RNG(seedFromString(`piracy|emerge|${sys.id}|${world.nowSeconds}`));
        const chance = BASE_SPAWN_CHANCE * Math.pow(breakdown.poi / 100, SPAWN_EXPONENT);
        if (!rng.check(chance)) continue;

        const fleet = createRaiderFleet(sys, world, rng);
        if (world.movement.fleets.has(fleet.id)) continue;   // one party per system per tick
        world.movement.fleets.set(fleet.id, fleet);

        // A band already working this stretch absorbs the party — unless it is
        // already carrying more ships than it can support, in which case the
        // newcomers strike out on their own rather than joining a mutiny.
        const host = nearestOrganization(world, sys.id, ABSORPTION_HOPS);
        const origin = determineOrigin(world, sys, breakdown);
        let organizationId: string;
        let absorbed = false;

        if (host && host.fleetIds.length < supportableFleets(world, host)) {
            host.fleetIds.push(fleet.id);
            fleet.organizationId = host.id;
            host.infamy = Math.min(100, host.infamy + 1);
            organizationId = host.id;
            absorbed = true;
        } else {
            organizationId = foundOrganization(world, sys.id, [fleet.id], origin).id;
        }

        piracy.emergenceLog.push({
            organizationId,
            systemId: sys.id,
            atSeconds: world.nowSeconds,
            poi: breakdown.poi,
            dominantFactor: breakdown.dominantFactor,
            dominantInput: breakdown.dominantInput,
            origin,
            blamedFactionId: breakdown.blamedFactionId,
            absorbed,
        });
        if (piracy.emergenceLog.length > EMERGENCE_LOG_LIMIT) {
            piracy.emergenceLog.splice(0, piracy.emergenceLog.length - EMERGENCE_LOG_LIMIT);
        }

        console.log(
            `[Piracy] Raiders at ${sys.name} (POI ${Math.round(breakdown.poi)}, `
            + `${breakdown.dominantFactor}: ${breakdown.dominantInput})`
        );

        if ([...world.movement.fleets.values()].filter(f => f.factionId === PIRATE_FACTION_ID).length >= GLOBAL_RAIDER_CAP) {
            break;
        }
    }
}

/** Recent emergences a faction is entitled to see. Used by intel and the press. */
export function emergenceHistory(world: GameWorldState, systemId?: string) {
    const log = ensurePiracyState(world).emergenceLog;
    return systemId ? log.filter(record => record.systemId === systemId) : [...log];
}

/** Organizations currently operating in a region, for AI and UI callers. */
export function organizationsInSystem(world: GameWorldState, systemId: string) {
    return activeOrganizations(world).filter(org =>
        org.fleetIds.some(id => world.movement.fleets.get(id)?.currentSystemId === systemId)
    );
}
