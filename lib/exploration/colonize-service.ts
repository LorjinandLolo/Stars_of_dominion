// lib/exploration/colonize-service.ts
// Colonization: turning a surveyed, unowned body into a faction colony.
// One shared entry point for the PLANET_CLAIM order handler and the AI's
// expansion tick, so player and AI colonies are identical by construction.

import type { GameWorldState } from '../game-world-state';
import type { PlanetProduction } from '../economy/economy-types';
import { initializePlanetServices } from '../economy/services/service-engine';
import { bumpMetric } from '../tech/history-ledger';
import { DEED_COLONIES_FOUNDED } from '../tech/deed-metrics';

/**
 * What a colony costs, in faction reserve keys. The PLANET_CLAIM entry in
 * lib/actions/registry.ts must quote the same numbers — the order path charges
 * through chargeOrderCost (which reads the registry), the AI path charges here.
 */
export const COLONY_COST: Record<string, number> = {
    CREDITS: 20000,
    METALS: 1000,
    FOOD: 1000,
};

export interface ColonizeResult {
    ok: boolean;
    reason?: string;
}

function isUnowned(ownerId: string | undefined | null): boolean {
    return !ownerId || ownerId === '' || ownerId === 'faction-neutral';
}

/** True if the faction has surveyed the system, or has a fleet parked in it. */
export function canSeeSystem(world: GameWorldState, factionId: string, systemId: string): boolean {
    const vis = world.movement.factionVisibility.get(factionId)?.[systemId];
    if (vis?.revealStage === 'surveyed') return true;
    for (const fleet of world.movement.fleets.values()) {
        if (fleet.factionId === factionId && fleet.currentSystemId === systemId) return true;
    }
    return false;
}

/**
 * Found a colony on an unowned body. Does NOT charge cost — the order path
 * has already charged via the registry, the AI path charges before calling.
 */
export function colonizePlanet(world: GameWorldState, factionId: string, planetId: string): ColonizeResult {
    const constr = world.construction.planets.get(planetId);
    if (!constr) return { ok: false, reason: 'No such planet.' };
    if (!isUnowned(constr.ownerId)) return { ok: false, reason: `${constr.name} is already owned.` };
    if (constr.tags?.includes('dead_matter')) {
        return { ok: false, reason: `${constr.name} cannot support a settlement.` };
    }
    const faction = world.economy.factions.get(factionId);
    if (!faction) return { ok: false, reason: 'Unknown faction.' };
    if (!canSeeSystem(world, factionId, constr.systemId)) {
        return { ok: false, reason: `${constr.name} has not been surveyed — settlement needs charts.` };
    }

    // Rewrite the tag array IN PLACE before the economy record is built — the
    // two records share the array by reference (initializeFactionHomeWorld
    // convention), and a filter() here would silently sever that link.
    if (!Array.isArray(constr.tags)) constr.tags = [];
    const kept = constr.tags.filter(t => t !== 'colonizable');
    constr.tags.length = 0;
    constr.tags.push(...kept);
    if (!constr.tags.includes('colony')) constr.tags.push('colony');

    // Economy record — the colony starts small and grows like any other world.
    if (!world.economy.planets.has(planetId)) {
        const ecoPlanet: PlanetProduction = {
            planetId,
            systemId: constr.systemId,
            factionId,
            planetType: constr.planetType === 'agricultural' ? 'agricultural'
                : constr.planetType === 'research' ? 'research'
                : constr.planetType === 'fortress' ? 'fortress'
                : 'industrial',
            // Shares the construction record's tag array by reference, matching
            // how initializeFactionHomeWorld links the two records.
            tags: constr.tags,
            services: {},
            demographics: {
                population: 10,
                growthRate: 0.05,
                housingCapacity: 50,
                serviceSatisfaction: 100,
                unrestRisk: 0,
                manpowerEfficiency: 1.0,
            },
            currentRates: {},
            stockpile: { metals: 200, energy: 500, food: 400, credits: 2000 },
            derived: { construction: 0.5, military: 0.2, research: 0.2, cultural: 0.2 },
            energyLoad: 0,
            energyProduced: 0,
            happiness: 75,
            instability: 0,
            commodityScarcity: false,
        };
        initializePlanetServices(ecoPlanet);
        world.economy.planets.set(planetId, ecoPlanet);
    }

    constr.ownerId = factionId;
    constr.population = Math.max(constr.population ?? 0, 10);
    constr.popCapacity = Math.max(constr.popCapacity ?? 0, 50);
    constr.popGrowth = 0.05;
    if (constr.infrastructureLevel < 1) constr.infrastructureLevel = 1;
    if (constr.demographics.length === 0) {
        constr.demographics = [
            { speciesId: 'species-human', name: 'Primary Species', percentage: 100, socialClass: 'Citizen' },
        ];
    }

    // Fold the system into the faction's economic region so cohesion, collapse
    // and trade distance all see the new territory.
    const region = world.economy.regions.get(`region-${factionId}`);
    if (region && !region.systemIds.includes(constr.systemId)) {
        region.systemIds.push(constr.systemId);
    }

    // The saga: one line per world settled.
    bumpMetric(world, factionId, DEED_COLONIES_FOUNDED);

    console.log(`[Colonize] ${factionId} founded a colony on ${constr.name} (${constr.systemId}).`);
    return { ok: true };
}

/**
 * AI expansion: each unclaimed (AI-run) faction founds at most one colony per
 * tick, and only while it can afford double the cost — expansion never drains
 * the war chest. Deterministic: candidates are sorted by id.
 */
export function tickAIColonization(world: GameWorldState): void {
    // Same convention as the diplomatic AI: no claim list means the worker
    // couldn't tell us who is human, so nobody is treated as AI.
    const claimedList = (world as any).claimedFactionIds;
    if (!Array.isArray(claimedList)) return;
    const claimed = new Set<string>(claimedList);

    for (const [factionId, faction] of world.economy.factions) {
        if (claimed.has(factionId)) continue;
        const reserves = faction.reserves as Record<string, number> | undefined;
        if (!reserves) continue;
        const affordable = Object.entries(COLONY_COST).every(
            ([key, amt]) => (reserves[key] ?? 0) >= amt * 2
        );
        if (!affordable) continue;

        const candidates = [...world.construction.planets.values()]
            .filter(p => isUnowned(p.ownerId)
                && p.tags?.includes('colonizable')
                && canSeeSystem(world, factionId, p.systemId))
            .sort((a, b) => a.id.localeCompare(b.id));
        if (candidates.length === 0) continue;

        const target = candidates[0];
        for (const [key, amt] of Object.entries(COLONY_COST)) {
            reserves[key] = (reserves[key] ?? 0) - amt;
        }
        const result = colonizePlanet(world, factionId, target.id);
        if (!result.ok) {
            // Refund — the guard above makes this near-impossible, but a charge
            // with no colony would be a silent leak.
            for (const [key, amt] of Object.entries(COLONY_COST)) {
                reserves[key] = (reserves[key] ?? 0) + amt;
            }
        }
    }
}
