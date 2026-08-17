// scripts/clear-lease.ts
// Delete the worker lease row so a replacement worker can start immediately.
// Needed after a worker is KILLED rather than shut down — releaseLease never
// runs, and the stale row blocks any new worker for up to 15 minutes.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const { prisma } = await import('../lib/db');
    const r = await prisma.multiplayerSession.deleteMany({ where: { id: 'worker-lease' } });
    console.log(`lease rows deleted: ${r.count}`);
    await prisma.$disconnect();
}
main();
