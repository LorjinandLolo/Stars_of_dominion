// scripts/clear-worker-lease.ts
// Expire the worker lease so a replacement worker can start immediately.
// Only needed when a worker was hard-killed (SIGKILL / closed terminal) and
// never ran its shutdown handler — otherwise the stale lease clears itself
// after LEASE_TTL_MS (15 minutes).
//
// Run: npx tsx scripts/clear-worker-lease.ts

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Imported after dotenv so lib/db sees DATABASE_URL, exactly as the worker does.
const { prisma } = await import('../lib/db');

const LEASE_DOC_ID = 'worker-lease';

async function main() {
    const doc = await prisma.multiplayerSession.findUnique({ where: { id: LEASE_DOC_ID } });
    if (!doc) {
        console.log('[Lease] No lease document — a worker can start already.');
        return;
    }

    console.log(`[Lease] Current holder: ${doc.snapshot}`);
    await prisma.multiplayerSession.update({
        where: { id: LEASE_DOC_ID },
        data: { snapshot: JSON.stringify({ holderId: 'released', expiresAt: 0 }) },
    });
    console.log('[Lease] Expired. Start the worker with: npm run worker');
}

main()
    .catch(e => { console.error('[Lease] Failed:', e); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
