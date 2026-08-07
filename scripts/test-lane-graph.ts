/**
 * scripts/test-lane-graph.ts
 *
 * Verifies the hyperlane graph the whole simulation walks:
 *   npx tsx scripts/test-lane-graph.ts
 *
 * Covers the shipped galaxy (generated-systems.json) plus the synthetic edge
 * cases: no link data, already-populated worlds, idempotency.
 */

import { buildLaneGraph, ensureLaneGraph, loadLaneLinks } from '../lib/movement/lane-graph';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { findPath } from '../lib/movement/movement-service';
import type { SystemNode } from '../lib/movement/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
    if (cond) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}`); }
}

function makeSystems(coords: Array<[string, number, number]>): Map<string, SystemNode> {
    const map = new Map<string, SystemNode>();
    for (const [id, q, r] of coords) {
        map.set(id, {
            id, name: id, q, r,
            tags: [], tagReveal: { allTags: [], revealedAt: {} },
            hyperlaneNeighbors: [], tradeSegmentIds: [], corridorIds: [],
            instability: 0, escalationLevel: 0,
        } as SystemNode);
    }
    return map;
}

function components(systems: Map<string, SystemNode>): number {
    const seen = new Set<string>();
    let count = 0;
    for (const id of systems.keys()) {
        if (seen.has(id)) continue;
        count++;
        const queue = [id];
        seen.add(id);
        while (queue.length) {
            const cur = queue.pop()!;
            for (const n of systems.get(cur)?.hyperlaneNeighbors ?? []) {
                if (!seen.has(n)) { seen.add(n); queue.push(n); }
            }
        }
    }
    return count;
}

function symmetric(systems: Map<string, SystemNode>): boolean {
    for (const [id, sys] of systems) {
        for (const n of sys.hyperlaneNeighbors) {
            if (!systems.get(n)?.hyperlaneNeighbors.includes(id)) return false;
        }
    }
    return true;
}

// ─── 1. Shipped galaxy ────────────────────────────────────────────────────────
console.log('\nShipped galaxy (generated-systems.json)');
{
    const world = getGameWorldState();
    const systems = world.movement.systems;
    const totalEdges = [...systems.values()].reduce((n, s) => n + s.hyperlaneNeighbors.length, 0) / 2;

    assert(systems.size > 500, `loaded ${systems.size} systems`);
    assert(totalEdges > 800, `lane graph has ${totalEdges} undirected edges (was 0)`);
    assert(
        [...systems.values()].every(s => s.hyperlaneNeighbors.length > 0),
        'every system has at least one lane'
    );
    assert(symmetric(systems), 'adjacency is symmetric');
    assert(components(systems) === 1, `galaxy is one connected component (${components(systems)})`);
    assert(
        [...systems.values()].every(s => !s.hyperlaneNeighbors.includes(s.id)),
        'no self-loops'
    );
    assert(
        [...systems.values()].every(s => new Set(s.hyperlaneNeighbors).size === s.hyperlaneNeighbors.length),
        'no duplicate neighbours'
    );

    // A fleet must now find a lane route between two far-apart capitals instead
    // of falling through to a deep-space crossing.
    const ids = [...systems.keys()];
    const fleet: any = {
        id: 'test-fleet', factionId: 'faction-aurelian',
        currentSystemId: ids[0], destinationSystemId: null,
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
        },
    };
    const target = ids[ids.length - 1];
    const route = findPath(fleet, target, ['hyperlane'], world.movement);
    assert(route.canReach, `hyperlane route exists ${ids[0]} to ${target}`);
    assert((route.path?.length ?? 0) > 1, `route is ${route.path?.length ?? 0} systems long`);
}

// ─── 2. Stitching disconnected islands ────────────────────────────────────────
console.log('\nIsland stitching');
{
    const systems = makeSystems([
        ['a', 0, 0], ['b', 1, 0], ['c', 2, 0],   // mainland
        ['x', 9, 0], ['y', 10, 0],               // island
        ['lonely', 4, 0],                        // no links at all
    ]);
    const stats = buildLaneGraph(systems, [
        { fromSystemId: 'a', toSystemId: 'b' },
        { fromSystemId: 'b', toSystemId: 'c' },
        { fromSystemId: 'x', toSystemId: 'y' },
    ]);

    assert(stats.componentsBefore === 3, `found ${stats.componentsBefore} components before stitching`);
    assert(stats.componentsAfter === 1, 'stitched down to one component');
    assert(stats.stitchedEdges === 2, `added ${stats.stitchedEdges} stitch edges`);
    assert(components(systems) === 1, 'walk confirms full connectivity');
    assert(systems.get('lonely')!.hyperlaneNeighbors.includes('c'), 'lonely system joined via nearest mainland node');
}

// ─── 3. Determinism + idempotency ─────────────────────────────────────────────
console.log('\nDeterminism');
{
    const links = loadLaneLinks();
    const coords: Array<[string, number, number]> = [
        ['a', 0, 0], ['b', 3, 1], ['c', 7, 2], ['d', 1, 6], ['e', 12, 12],
    ];
    const first = makeSystems(coords);
    const second = makeSystems(coords);
    buildLaneGraph(first, []);
    buildLaneGraph(second, []);
    const dump = (m: Map<string, SystemNode>) =>
        [...m.keys()].sort().map(id => `${id}:${m.get(id)!.hyperlaneNeighbors.join(',')}`).join('|');
    assert(dump(first) === dump(second), 'two builds of the same world agree');

    const before = dump(first);
    buildLaneGraph(first, []);
    assert(dump(first) === before, 'rebuild is idempotent');
    assert(links.length > 0, `snapshot file exposes ${links.length} links`);
}

// ─── 4. ensureLaneGraph leaves populated worlds alone ─────────────────────────
console.log('\nensureLaneGraph guard');
{
    const systems = makeSystems([['a', 0, 0], ['b', 1, 0], ['c', 5, 5]]);
    systems.get('a')!.hyperlaneNeighbors = ['b'];
    systems.get('b')!.hyperlaneNeighbors = ['a'];
    const skipped = ensureLaneGraph(systems);
    assert(skipped === null, 'no-op when lanes already exist');
    assert(systems.get('c')!.hyperlaneNeighbors.length === 0, 'existing graph untouched');

    const forced = ensureLaneGraph(systems, { force: true, links: [] });
    assert(forced !== null && components(systems) === 1, 'force rebuild reconnects everything');

    const empty = ensureLaneGraph(new Map());
    assert(empty === null, 'empty world returns null instead of throwing');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
