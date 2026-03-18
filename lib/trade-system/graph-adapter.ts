import { GameWorldState } from '../game-world-state';
import { Graph, GraphEdge, EdgeType } from './types';

/**
 * Builds a navigable Graph for the trade system using the hyperlanes and gates
 * defined in the movement system.
 */
export function buildTradeGraph(world: GameWorldState): Graph {
    const nodes: string[] = Array.from(world.movement.systems.keys());
    const edges: GraphEdge[] = [];
    const adj = new Map<string, GraphEdge[]>();

    const addEdge = (from: string, to: string, type: EdgeType, cost: number, isChokepoint: boolean) => {
        const edge: GraphEdge = {
            from,
            to,
            type,
            baseCost: cost,
            isChokepointEdge: isChokepoint
        };
        edges.push(edge);
        if (!adj.has(from)) adj.set(from, []);
        adj.get(from)!.push(edge);
    };

    // 1. Process Trade Segments (Hyperlanes with specialized trade throughput)
    for (const seg of world.movement.tradeSegments.values()) {
        if (seg.status === 'active' || seg.status === 'rerouted') {
            const cost = 10; // Base cost for hyperlane trade
            addEdge(seg.fromSystemId, seg.toSystemId, EdgeType.HYPERLANE, cost, false);
            addEdge(seg.toSystemId, seg.fromSystemId, EdgeType.HYPERLANE, cost, false);
        }
    }

    // 2. Process Online Gates (Mesh Network)
    // All online gates can reach all other online gates directly.
    const onlineGates = Array.from(world.movement.gates.values()).filter(g => g.state === 'online');
    for (let i = 0; i < onlineGates.length; i++) {
        for (let j = i + 1; j < onlineGates.length; j++) {
            const a = onlineGates[i];
            const b = onlineGates[j];
            
            addEdge(a.systemId, b.systemId, EdgeType.WORMHOLE, 5, true);
            addEdge(b.systemId, a.systemId, EdgeType.WORMHOLE, 5, true);
        }
    }

    // 3. Process Strategic Corridors (Internal connections)
    for (const corridor of world.movement.corridors.values()) {
        if (corridor.denialFieldActive) continue;
        const nodeIds = corridor.nodeIds;
        for (let i = 0; i < nodeIds.length - 1; i++) {
            addEdge(nodeIds[i], nodeIds[i+1], EdgeType.HYPERLANE, 8, true);
            addEdge(nodeIds[i+1], nodeIds[i], EdgeType.HYPERLANE, 8, true);
        }
    }

    return { nodes, edges, adj };
}
