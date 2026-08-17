// scripts/swap-dev-claim.ts
// Point a dev account's claim at a different faction, for UI verification.
//   npx tsx scripts/swap-dev-claim.ts dev1@stars.com faction-kaerruun
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const { prisma } = await import('../lib/db');
    const [email, factionId] = process.argv.slice(2);
    if (!email || !factionId) throw new Error('usage: swap-dev-claim <email> <factionId>');
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) throw new Error(`no user ${email}`);
    const before = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
    await prisma.playerProfile.update({ where: { userId: user.id }, data: { factionId } });
    console.log(`${email}: ${before?.factionId} -> ${factionId}`);
    await prisma.$disconnect();
}
main();
