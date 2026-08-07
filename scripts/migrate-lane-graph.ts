/**
 * scripts/migrate-lane-graph.ts
 *
 * One-shot repair for live saves written before the hyperlane graph was wired
 * up: loads the session snapshot, rebuilds `hyperlaneNeighbors` from the map's
 * link list, and writes the snapshot back. Advances no clock and runs no tick —
 * only the lane layer changes.
 *
 *   npx tsx scripts/migrate-lane-graph.ts            # repair only if lanes missing
 *   npx tsx scripts/migrate-lane-graph.ts --force    # rebuild even if lanes exist
 *   npx tsx scripts/migrate-lane-graph.ts --dry-run  # report, write nothing
 *
 * The worker performs the same repair on load, so this is only needed to fix
 * the snapshot the UI polls without starting (and ticking) the game loop.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { deserializeWorld, serializeWorld } from '../lib/persistence/save-service';
import { ensureLaneGraph } from '../lib/movement/lane-graph';

const SESSION_DOC_ID = 'default-session';

async function main() {
    const force = process.argv.includes('--force');
    const dryRun = process.argv.includes('--dry-run');
    const doc = await prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } });
    if (!doc) {
        console.error('[LaneMigration] No session snapshot found. Seed the world first (npx tsx scripts/push-init-state.ts).');
        process.exit(1);
    }

    const world = deserializeWorld(doc.snapshot);
    const systems = world.movement.systems;
    const edgesBefore = [...systems.values()].reduce((n, s) => n + (s.hyperlaneNeighbors?.length ?? 0), 0) / 2;
    console.log(`[LaneMigration] Snapshot holds ${systems.size} systems with ${edgesBefore} lanes.`);

    const stats = ensureLaneGraph(systems, { force });
    if (!stats) {
        console.log('[LaneMigration] Lanes already present — nothing to do. Pass --force to rebuild.');
        return;
    }

    const edgesAfter = [...systems.values()].reduce((n, s) => n + s.hyperlaneNeighbors.length, 0) / 2;
    if (dryRun) {
        console.log(`[LaneMigration] Dry run: would go from ${edgesBefore} to ${edgesAfter} lanes. Nothing written.`);
        return;
    }

    await prisma.multiplayerSession.update({
        where: { id: SESSION_DOC_ID },
        data: { snapshot: serializeWorld(world) },
    });
    console.log(`[LaneMigration] Wrote snapshot: ${edgesBefore} to ${edgesAfter} lanes.`);
}

main()
    .catch(err => { console.error('[LaneMigration] Failed:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
