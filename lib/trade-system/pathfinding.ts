// ===== file: lib/trade-system/pathfinding.ts =====
import {
    Graph,
    GraphEdge,
    PolicyState,
    PolicyRule,
    WarState,
    EdgeType,
    Resource
} from './types';

interface PathResult {
    path: string[];
    totalCost: number;
    riskScore: number;
}

// Simple Priority Queue for Dijkstra
class PriorityQueue<T> {
    private items: { item: T; priority: number }[] = [];

    enqueue(item: T, priority: number) {
        this.items.push({ item, priority });
        this.items.sort((a, b) => a.priority - b.priority);
    }

    dequeue(): T | undefined {
        return this.items.shift()?.item;
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }
}

/**
 * Calculates the traversal cost of an edge for a specific trade route context.
 * Returns Infinity if the edge is impassable (e.g. Deny policy).
 */
export function getEdgeCost(
    edge: GraphEdge,
    targetSystemOwner: string | undefined, // Owner of the 'to' node
    traderFactionId: string,
    resource: Resource,
    policies: Map<string, PolicyState>,
    warStates: Map<string, WarState>
): number {
    let cost = edge.baseCost;

    // 1. Geography / Risk Risks
    if (edge.type === EdgeType.DEEP_SPACE) {
        cost *= 1.5; // Natural penalty
    }

    // 2. Policy Checks (Chokepoints / Borders)
    // If the target system has an owner, check their policies towards the trader
    if (targetSystemOwner) {
        const ownerPolicy = policies.get(targetSystemOwner);
        if (ownerPolicy) {
            // Check Chokepoint Rules
            const rule = ownerPolicy.chokepointRules.get(edge.to);
            if (rule) {
                if (rule.rule === PolicyRule.DENY) return Infinity;
                if (rule.rule === PolicyRule.TAX) cost += (rule.taxRate || 0.1) * 50; // Arbitrary flat cost per tax % for pathfinding
                if (rule.rule === PolicyRule.PRIORITIZE) cost *= 0.8;
            }

            // Check Embargoes
            const embroidery = ownerPolicy.embargoes.find(e => e.factionId === traderFactionId);
            if (embroidery) {
                // If it's a total embargo (empty resources list) or contains specific resource
                if (embroidery.resources.length === 0 || embroidery.resources.includes(resource)) {
                    return Infinity;
                }
            }
        }
    }

    // 3. War / Blockade Risks
    // Check if the 'to' system is blockaded or has hostile fleets relative to the trader
    // We iterate all war states to see if anyone is blockading this system against the trader?
    // Or simpler: The trader's enemies might be blockading the target system.

    // For now, let's look at the "Universal Hostility" in the system
    // We assume 'warStates' contains data relevant to the simulation context.
    // If we want to be specific, we'd need to know who the trader is at war with.
    // Simplified: If a system is in 'blockadeSystems' of ANY faction that is hostile to trader...
    // But we don't have "Hostile relations" passed here easily. 
    // Let's assume WarState has a "blockadeSystems" set that is globally recognized as "Dangerous/Blocked"
    // OR we iterate all WarStates and if any lists this system, we add risk.

    for (const ws of warStates.values()) {
        if (ws.blockadeSystems.has(edge.to)) {
            cost += 500; // Massive penalty for running a blockade
        }
        if (ws.hostileFleetsPresence.has(edge.to)) {
            cost += (ws.hostileFleetsPresence.get(edge.to) || 0) * 10;
        }
    }

    return cost;
}

export function findBestRoute(
    graph: Graph,
    startSys: string,
    endSys: string,
    traderFactionId: string,
    resource: Resource,
    systemOwners: Map<string, string>, // SystemID -> FactionID
    policies: Map<string, PolicyState>,
    warStates: Map<string, WarState>
): PathResult | null {
    if (!graph.adj.has(startSys)) return null;

    const costs = new Map<string, number>();
    const cameFrom = new Map<string, string>();
    const pq = new PriorityQueue<string>();

    costs.set(startSys, 0);
    pq.enqueue(startSys, 0);

    while (!pq.isEmpty()) {
        const current = pq.dequeue()!;

        if (current === endSys) {
            // Reconstruct path
            const path: string[] = [];
            let curr: string | undefined = endSys;
            while (curr) {
                path.unshift(curr);
                curr = cameFrom.get(curr);
            }
            return {
                path,
                totalCost: costs.get(endSys)!,
                riskScore: 0 // TODO: Calculate separate risk score if needed
            };
        }

        const neighbors = graph.adj.get(current) || [];
        for (const edge of neighbors) {
            const targetOwner = systemOwners.get(edge.to);
            const edgeCost = getEdgeCost(edge, targetOwner, traderFactionId, resource, policies, warStates);

            if (edgeCost === Infinity) continue;

            const newCost = costs.get(current)! + edgeCost;
            if (newCost < (costs.get(edge.to) || Infinity)) {
                costs.set(edge.to, newCost);
                cameFrom.set(edge.to, current);
                pq.enqueue(edge.to, newCost);
            }
        }
    }

    return null; // No path found
}
