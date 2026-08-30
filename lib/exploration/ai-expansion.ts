// lib/exploration/ai-expansion.ts
// The AI half of the explore/expand loop. tickAIColonization settles worlds
// the faction can already see; this module gives AI factions the means to SEE:
// a scout fleet, survey orders on adjacent unexplored systems, and movement
// toward the frontier when the local neighborhood is charted. Without it, AI
// factions could never expand past their home system for the whole season.
//
// Runs from tick step10b for AI-run factions only (same claimedFactionIds
// convention as every other AI service). All choices are deterministic.

import type { GameWorldState } from '../game-world-state';
import { issueExploreOrder } from './exploration-service';
import { issueMoveOrder } from '../movement/movement-service';

/** What the scout hull costs — mirrors the MIL_BUILD_FLEET registry cost. */
const SCOUT_FLEET_COST: Record<string, number> = { CREDITS: 1000, METALS: 500 };
/** Survey fee, mirroring the EXPLORE_ISSUE_ORDER registry cost players pay. */
const SURVEY_COST: Record<string, number> = { CREDITS: 500 };

function canAfford(reserves: Record<string, number> | undefined, cost: Record<string, number>, headroom = 1): boolean {
    if (!reserves) return false;
    return Object.entries(cost).every(([k, v]) => (reserves[k] ?? 0) >= v * headroom);
}

function charge(reserves: Record<string, number>, cost: Record<string, number>): void {
    for (const [k, v] of Object.entries(cost)) {
        if (reserves[k] === undefined) continue;
        reserves[k] = (reserves[k] ?? 0) - v;
    }
}

function isSurveyedBy(world: GameWorldState, factionId: string, systemId: string): boolean {
    return world.movement.factionVisibility.get(factionId)?.[systemId]?.revealStage === 'surveyed';
}

/**
 * Breadth-first search from `fromSystemId` for the nearest system this faction
 * has not surveyed. Returns the FIRST HOP of the path (sorted-neighbor order,
 * so restarts replay identically), or null if the whole reachable graph is
 * charted.
 */
function firstHopTowardUnexplored(world: GameWorldState, factionId: string, fromSystemId: string): string | null {
    const visited = new Set<string>([fromSystemId]);
    const queue: Array<{ id: string; firstHop: string | null }> = [{ id: fromSystemId, firstHop: null }];
    while (queue.length > 0) {
        const { id, firstHop } = queue.shift()!;
        const node = world.movement.systems.get(id);
        if (!node) continue;
        const neighbors = [...(node.hyperlaneNeighbors ?? [])].sort();
        for (const n of neighbors) {
            if (visited.has(n)) continue;
            visited.add(n);
            const hop = firstHop ?? n;
            if (!isSurveyedBy(world, factionId, n)) return hop;
            queue.push({ id: n, firstHop: hop });
        }
    }
    return null;
}

/**
 * One expansion turn per AI faction: ensure a scout exists, then survey an
 * adjacent unexplored system, or sail toward the nearest one.
 */
export function tickAIExpansion(world: GameWorldState): void {
    const claimedList = (world as any).claimedFactionIds;
    if (!Array.isArray(claimedList)) return; // convention: no list → nobody is AI
    const claimed = new Set<string>(claimedList);

    for (const [factionId, faction] of world.economy.factions) {
        if (claimed.has(factionId)) continue;
        if (factionId === 'faction-pirates' || factionId === 'faction-neutral') continue;
        const reserves = faction.reserves as Record<string, number> | undefined;

        // ── 1. A scout to see with ──────────────────────────────────────────
        let fleet = [...world.movement.fleets.values()]
            .filter(f => f.factionId === factionId)
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!fleet) {
            // Keep double the cost in hand — expansion never drains the war chest.
            if (!canAfford(reserves, SCOUT_FLEET_COST, 2)) continue;
            const capital = faction.capitalSystemId;
            if (!capital || !world.movement.systems.has(capital)) continue;
            charge(reserves!, SCOUT_FLEET_COST);
            const fleetId = `fleet-${factionId}-scout-1`;
            fleet = {
                id: fleetId,
                factionId,
                name: `${faction.name ?? factionId} Survey Wing`,
                currentSystemId: capital,
                destinationSystemId: null,
                activeLayer: null,
                transitProgress: 0,
                etaSeconds: 0,
                plannedPath: [],
                orders: [],
                doctrine: {
                    type: 'Defensive',
                    deviationFromPosture: 0,
                    preferredLayers: ['hyperlane', 'gate'],
                    retreatThreshold: 0.5,
                    logisticsStrain: 0,
                    moraleDrift: 0,
                    supplyLevel: 1.0,
                },
                postureId: 'Expansionist',
                strength: 1.0,
                basePower: 100,
                composition: {},
                hyperdriveProfile: {
                    hyperlane: { speedMultiplier: 1.0, detectabilityMultiplier: 1.0, supplyStrainMultiplier: 1.0 },
                    trade: { speedMultiplier: 1.2, detectabilityMultiplier: 1.5, supplyStrainMultiplier: 1.0 },
                    corridor: { speedMultiplier: 2.0, detectabilityMultiplier: 0.5, supplyStrainMultiplier: 1.0 },
                },
            } as any;
            world.movement.fleets.set(fleetId, fleet as any);
            console.log(`[AI Expansion] ${factionId} commissioned a survey wing at ${capital}.`);
            continue; // survey next turn — the yard needs a tick
        }

        // Busy fleets finish what they started.
        if (fleet.destinationSystemId) continue;
        const inFlight = world.movement.explorationOrders.some(o =>
            o.factionId === factionId || world.movement.fleets.get(o.fleetId)?.factionId === factionId);
        if (inFlight) continue;

        const here = fleet.currentSystemId;
        if (!here) continue;
        const hereNode = world.movement.systems.get(here);
        if (!hereNode) continue;

        // ── 2. Survey something adjacent (or right here) ────────────────────
        const candidates = [here, ...[...(hereNode.hyperlaneNeighbors ?? [])].sort()]
            .filter(id => !isSurveyedBy(world, factionId, id));
        if (candidates.length > 0) {
            if (!canAfford(reserves, SURVEY_COST, 2)) continue;
            charge(reserves!, SURVEY_COST);
            issueExploreOrder(fleet.id, candidates[0], 'survey', world.movement);
            continue;
        }

        // ── 3. Neighborhood charted — sail toward the frontier ─────────────
        const hop = firstHopTowardUnexplored(world, factionId, here);
        if (hop) {
            try {
                issueMoveOrder(fleet as any, hop, 'hyperlane', world.movement);
            } catch (e: any) {
                console.warn(`[AI Expansion] ${factionId} scout could not move to ${hop}: ${e.message}`);
            }
        }
    }
}
