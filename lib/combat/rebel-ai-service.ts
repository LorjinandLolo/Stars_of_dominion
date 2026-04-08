import { PlanetaryGarrison } from './siege/siege-types';
import { SystemNode, Link } from '@/types/ui-state';

export type RebelActionType = 'FORTIFY' | 'EXPAND' | 'SABOTAGE';

export interface RebelDecision {
    action: RebelActionType;
    targetSystemId?: string; // If expanding or sabotaging, where?
    allocatedTroops?: number;
}

/**
 * Basic AI decision loop for a newly spawned autonomous Rebel Faction.
 * Evaluates nearby systems, their own strength, and current proxy funding
 * to decide whether to hunker down or aggressively expand the revolution.
 */
export function evaluateRebelTurn(
    rebelGarrison: PlanetaryGarrison,
    homeSystem: SystemNode,
    adjacentLinks: Link[],
    galaxySystems: SystemNode[],
    proxyFundingLevel: number
): RebelDecision {
    // 1. Survival Check
    // If the garrison is severely depleted (under 500 troops) or facing starvation,
    // they MUST fortify and repair defenses immediately.
    if (rebelGarrison.troops < 500 || rebelGarrison.supplyRemaining < 3) {
        return { action: 'FORTIFY' };
    }

    // 2. Expansion Check
    // If they have overwhelming numbers (perhaps from massive proxy funding),
    // they should attempt to conquer an adjacent system to spread the uprising.
    if (rebelGarrison.troops > 2000) {
        // Find adjacent systems connected to the home system
        const neighbors = adjacentLinks
            .filter(l => l.fromSystemId === homeSystem.id || l.toSystemId === homeSystem.id)
            .map(l => l.fromSystemId === homeSystem.id ? l.toSystemId : l.fromSystemId);

        // Filter valid targets (not already owned by rebels)
        const validExpansionTargets = galaxySystems.filter(sys =>
            neighbors.includes(sys.id) && sys.ownerId !== homeSystem.ownerId
        );

        if (validExpansionTargets.length > 0) {
            // Pick a neighbor at random to invade (for simplicity, could be optimized for weakest)
            const target = validExpansionTargets[Math.floor(Math.random() * validExpansionTargets.length)];

            // They send 40% of their troops to launch the invasion, leaving a garrison behind
            const assaultForce = Math.floor(rebelGarrison.troops * 0.40);

            return {
                action: 'EXPAND',
                targetSystemId: target.id,
                allocatedTroops: assaultForce
            };
        }
    }

    // 3. Sabotage / Guerrilla Tactics
    // If they are strong enough to survive but not strong enough to conquer,
    // they use proxy funds to launch terrorist attacks on neighbors.
    if (proxyFundingLevel > 30) {
        return { action: 'SABOTAGE' };
    }

    // Default to fortifying
    return { action: 'FORTIFY' };
}
