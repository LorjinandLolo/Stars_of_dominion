import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { prisma } from '../lib/db';
async function main() {
    const doc = await prisma.multiplayerSession.findUnique({ where: { id: 'worker-lease' } });
    if (!doc) { console.log('no lease held'); return; }
    console.log('current lease:', doc.snapshot);
    await prisma.multiplayerSession.update({
        where: { id: 'worker-lease' },
        data: { snapshot: JSON.stringify({ holderId: 'expired', expiresAt: 0 }) },
    });
    console.log('lease released');
}
main().catch(console.error).finally(() => prisma.$disconnect());
