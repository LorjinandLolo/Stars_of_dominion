// scripts/pirate-leak-check.ts
// Asserts the public snapshot carries no pirate secret, including the markers
// stamped onto systems, corridors and routes OUTSIDE world.piracy.
// Run: npx tsx scripts/pirate-leak-check.ts
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { prisma } from '../lib/db';
import { applyPiracySnapshot, cleanWorldForSave, deserializeWorld, serializeWorld, extractFactionShard } from '../lib/persistence/save-service';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

async function main() {
    const s = await prisma.multiplayerSession.findUnique({ where: { id: 'default-session' } });
    const p = await prisma.multiplayerSession.findUnique({ where: { id: 'default-session-piracy' } });
    if (!s) { console.log('no session'); process.exit(1); }

    // Rebuild the authoritative world the worker holds, then clean it as the
    // worker does before writing the shared document.
    const world = deserializeWorld(s.snapshot);
    applyPiracySnapshot(world, p?.snapshot);

    const wire = serializeWorld(cleanWorldForSave(world));

    console.log('\n[1] the shared snapshot');
    check('no pirateInfluence markers', !wire.includes('pirateInfluence'));
    check('no pirateControlByOrg markers', !wire.includes('pirateControlByOrg'));
    check('no restrictedToOrgId hidden lanes', !wire.includes('restrictedToOrgId'));
    check('no protectedByOrgId route markers', !wire.includes('protectedByOrgId'));
    check('no organizationId on anything public', !wire.includes('"organizationId"'));

    console.log('\n[2] the faction shard (readable by every client)');
    const factionId = [...world.economy.factions.keys()][0];
    const shard = extractFactionShard(world, factionId);
    check('carries no pirate view', !shard.includes('pirateView'));
    check('carries no pirate dashboard', !shard.includes('pirateDashboard'));
    check('names no band', !shard.includes('porg-'));

    console.log(`\n${failures === 0 ? 'NO LEAKS' : `${failures} LEAK(S)`}`);
    process.exitCode = failures === 0 ? 0 : 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
