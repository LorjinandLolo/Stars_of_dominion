// scripts/setup-dev-duel.ts
// Stars of Dominion — Two-Player Dev Test Setup
//
// One command to prepare a head-to-head playtest:
//   npm run setup:duel
//
// It will:
//   1. Create two dev accounts (dev1@stars.com / dev2@stars.com, password: password123)
//   2. Claim "Aurelian Hegemony" for Player 1 and "Vektori Technocracy" for Player 2
//      (clearing any conflicting old claims on those factions/accounts)
//   3. Check that the multiplayer session row exists
//   4. Print exactly what each player should do next
//
// Safe to re-run any time — it resets the two dev claims to a clean state.

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { auth } from '../lib/auth';

const SESSION_DOC_ID = 'default-session';

const PLAYERS = [
    { email: 'dev1@stars.com', name: 'Dev Commander 1', factionId: 'faction-aurelian', factionName: 'Aurelian Hegemony' },
    { email: 'dev2@stars.com', name: 'Dev Commander 2', factionId: 'faction-vektori',  factionName: 'Vektori Technocracy' },
];
const PASSWORD = 'password123';

async function findOrCreateUser(email: string, name: string): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`ℹ️  Account ${email} already exists (id: ${existing.id})`);
        return existing.id;
    }
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    console.log(`✅ Created account ${email} (id: ${created.id})`);
    return created.id;
}

async function claimFaction(userId: string, factionId: string, displayName: string) {
    // 1. Free the faction from anyone else
    const { count: freed } = await prisma.playerProfile.deleteMany({
        where: { factionId, NOT: { userId } },
    });
    if (freed > 0) console.log(`   ↳ removed ${freed} stale claim(s) on ${factionId}`);

    // 2. Free this user from any OTHER faction (dev accounts shouldn't be locked elsewhere)
    const { count: released } = await prisma.playerProfile.deleteMany({
        where: { userId, NOT: { factionId } },
    });
    if (released > 0) console.log(`   ↳ released this account's old claim(s)`);

    // 3. Claim
    const existing = await prisma.playerProfile.findUnique({ where: { userId } });
    if (!existing) {
        await prisma.playerProfile.create({ data: { userId, factionId, displayName } });
    }
    console.log(`✅ ${displayName} → ${factionId}`);
}

async function checkSession(): Promise<boolean> {
    const session = await prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } });
    if (session) {
        console.log('✅ Multiplayer session row exists.');
        return true;
    }
    console.log('⚠️  No multiplayer session found!');
    console.log('   Run this first, then re-run setup:  npx tsx scripts/push-init-state.ts');
    return false;
}

async function main() {
    console.log('====================================================');
    console.log('  STARS OF DOMINION — TWO-PLAYER DEV TEST SETUP');
    console.log('====================================================\n');

    for (const p of PLAYERS) {
        console.log(`\n--- ${p.factionName} ---`);
        const userId = await findOrCreateUser(p.email, p.name);
        await claimFaction(userId, p.factionId, p.name);
    }

    console.log('');
    const sessionOk = await checkSession();

    console.log('\n====================================================');
    console.log('  READY TO PLAY — CHEAT SHEET');
    console.log('====================================================');
    console.log('');
    console.log('  YOU (host), in two terminals:');
    console.log('    Terminal 0:  docker compose up -d  (the database — once)');
    console.log('    Terminal 1:  npm run dev:lan       (the game website)');
    console.log('    Terminal 2:  npm run worker        (the game engine — REQUIRED)');
    console.log('');
    console.log('  PLAYER 1 (you):     http://localhost:3000/login');
    console.log(`    email: ${PLAYERS[0].email}   password: ${PASSWORD}`);
    console.log(`    → pick "${PLAYERS[0].factionName}" in the lobby`);
    console.log('');
    console.log('  PLAYER 2 (friend):  http://<YOUR-IP>:3000/login');
    console.log(`    email: ${PLAYERS[1].email}   password: ${PASSWORD}`);
    console.log(`    → pick "${PLAYERS[1].factionName}" in the lobby`);
    console.log('');
    console.log('  Full instructions (finding your IP, playing over the');
    console.log('  internet, troubleshooting): TESTING_WITH_A_FRIEND.md');
    if (!sessionOk) {
        console.log('\n  ⚠️  Fix the session warning above before starting!');
    }
    console.log('');
}

main()
    .catch(err => { console.error('\n❌ Setup failed:', err.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
