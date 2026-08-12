// scripts/trade-route-probe.ts
// Read-only: why does the live world carry no trade routes? Everything the
// pirate economy does hangs off commerce, so a galaxy with no lanes grows
// bands that have nothing to rob.
// Run: npx tsx scripts/trade-route-probe.ts

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { deserializeWorld, injectFactionShard } from '../lib/persistence/save-service';
import { buildTradeGraph } from '../lib/trade-system/graph-adapter';
import { updateTradeRoutes } from '../lib/trade-system/trade';

async function main() {
    // The world lives in a specific row; siblings ('default-session-piracy',
    // 'worker-lease') share this table and any of them can be the most recently
    // written, which fed a lease blob to deserializeWorld and threw.
    const session = await prisma.multiplayerSession.findUnique({ where: { id: 'default-session' } });
    if (!session) { console.log('no session'); return; }

    const world = deserializeWorld(session.snapshot);
    for (const shard of await prisma.gameFactionShard.findMany()) {
        injectFactionShard(world, shard.data);
    }

    const agreements = [...(world.economy.tradeAgreements?.values() ?? [])];
    console.log(`agreements: ${agreements.length}`);
    for (const agreement of agreements) {
        const a = world.economy.factions.get(agreement.aFactionId);
        const b = world.economy.factions.get(agreement.bFactionId);
        console.log(`  ${agreement.id}: ${agreement.aFactionId} -> ${agreement.bFactionId} (${agreement.resource})`);
        console.log(`    seller exists: ${!!a}  capital: ${a?.capitalSystemId ?? '—'}`
            + `  in graph: ${a?.capitalSystemId ? world.movement.systems.has(a.capitalSystemId) : false}`);
        console.log(`    buyer  exists: ${!!b}  capital: ${b?.capitalSystemId ?? '—'}`
            + `  in graph: ${b?.capitalSystemId ? world.movement.systems.has(b.capitalSystemId) : false}`);
        console.log(`    window: startTick ${agreement.startTick} endTick ${agreement.endTick}`);
    }

    // How many faction capitals actually resolve to a system node at all?
    let resolved = 0;
    for (const faction of world.economy.factions.values()) {
        if (faction.capitalSystemId && world.movement.systems.has(faction.capitalSystemId)) resolved += 1;
    }
    console.log(`\nfactions whose capital resolves to a real system: ${resolved}/${world.economy.factions.size}`);

    // Try the recompute the trade tick would do and see what comes out.
    const systemOwners = new Map<string, string>();
    for (const sys of world.movement.systems.values()) {
        if (sys.ownerFactionId) systemOwners.set(sys.id, sys.ownerFactionId);
    }
    const graph = buildTradeGraph(world);
    console.log(`trade graph: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s)`);

    const routes = updateTradeRoutes(
        agreements,
        new Map(),
        graph,
        systemOwners,
        world.economy.factions,
        world.economy.policies ?? new Map(),
        world.economy.warStates ?? new Map()
    );
    console.log(`routes the trade tick would build right now: ${routes.size}`);
    for (const route of routes.values()) {
        console.log(`  ${route.id}: ${route.path.length} hop(s)  risk ${route.piracyRisk.toFixed(2)}  priority ${route.routePriority}`);
    }
}

main()
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
