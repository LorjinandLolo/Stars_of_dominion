// scripts/reseed-galaxy.ts — clear everything that belongs to the OLD galaxy,
// so scripts/push-init-state.ts can lay down a fresh one. Called by
// scripts/reseed-server.sh inside the setup container, with the worker,
// narrator and app stopped. Not meant to be run on its own.
//
//   npx tsx scripts/reseed-galaxy.ts --yes [--keep-claims] [--drop-dev-accounts]
//
// Cleared: the worker lease, the written history (chronicle, articles, feuds,
// gazette front pages), messages between empires, invite links (they point
// at the inviter's old empire), old manual saves, and (unless --keep-claims)
// every faction claim. push-init-state.ts then clears shards and orders and
// overwrites the snapshot.
//
// Kept: accounts and sign-ins, and telemetry (it's about how people play,
// not about the galaxy).
//
// --drop-dev-accounts deletes dev1@stars.com and dev2@stars.com, which
// setup-dev-duel.ts creates with a known password (SERVER.md 1.5).

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';

const DEV_EMAILS = ['dev1@stars.com', 'dev2@stars.com'];

async function main(): Promise<void> {
    const args = new Set(process.argv.slice(2));
    if (!args.has('--yes')) {
        console.error('✋ This deletes the galaxy\'s history and claims. Run it through scripts/reseed-server.sh.');
        process.exit(1);
    }
    const keepClaims = args.has('--keep-claims');
    const dropDev = args.has('--drop-dev-accounts');

    const counts = await prisma.$transaction(async tx => {
        const c: Record<string, number> = {};
        c.lease = (await tx.multiplayerSession.deleteMany({ where: { id: 'worker-lease' } })).count;
        c.chronicle = (await tx.chronicleEvent.deleteMany()).count;
        c.articles = (await tx.narrativeArticle.deleteMany()).count;
        c.feuds = (await tx.feud.deleteMany()).count;
        c.gazettes = (await tx.gazette.deleteMany()).count;
        c.messages = (await tx.empireMessage.deleteMany()).count;
        c.invites = (await tx.invite.deleteMany()).count;
        c.saves = (await tx.gameSave.deleteMany()).count;
        if (!keepClaims) c.claims = (await tx.playerProfile.deleteMany()).count;
        if (dropDev) {
            const devs = await tx.user.findMany({ where: { email: { in: DEV_EMAILS } }, select: { id: true } });
            const ids = devs.map(d => d.id);
            await tx.playerProfile.deleteMany({ where: { userId: { in: ids } } });
            // Sessions and accounts (the password) cascade with the user.
            c.devAccounts = (await tx.user.deleteMany({ where: { id: { in: ids } } })).count;
        }
        return c;
    });

    console.log('[Reseed] Cleared: ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
    if (keepClaims) console.log('[Reseed] Claims kept: players hold the same empires in the new galaxy.');
}

main()
    .then(() => prisma.$disconnect())
    .catch(async err => {
        console.error('❌ Reseed cleanup failed (nothing was deleted, it runs in one transaction):', err?.message ?? err);
        await prisma.$disconnect();
        process.exit(1);
    });
