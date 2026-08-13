// scripts/pirate-persistence-check.ts
// Does authoritative pirate state actually survive a worker restart?
//
// The session snapshot every client polls is deliberately scrubbed of pirate
// secrets — and it is ALSO what the worker reloads. That combination silently
// destroyed live state until the authoritative copy was moved to its own row.
// This asserts both halves at once: the scrubbed public snapshot really is
// empty, and the private row really does carry everything.
// Run: npx tsx scripts/pirate-persistence-check.ts

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { deserializeWorld, applyPiracySnapshot } from '../lib/persistence/save-service';

const SESSION_DOC_ID = 'default-session';
const PIRACY_DOC_ID = 'default-session-piracy';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures += 1;
}

async function main() {
    const sessionDoc = await prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } });
    const piracyDoc = await prisma.multiplayerSession.findUnique({ where: { id: PIRACY_DOC_ID } });

    if (!sessionDoc) { console.log('no session document'); process.exit(1); }

    // 1. What every client is served.
    const publicWorld = deserializeWorld(sessionDoc.snapshot);
    const publicOrgs = [...publicWorld.piracy.organizations.values()];
    console.log('\n[1] the shared snapshot every client polls');
    check('carries no bases', publicWorld.piracy.bases.size === 0, `${publicWorld.piracy.bases.size}`);
    check('carries no sponsorships', publicWorld.piracy.sponsorships.size === 0);
    check('carries no protection contracts', publicWorld.piracy.protectionContracts.size === 0);
    check('carries no black markets', publicWorld.piracy.blackMarkets.size === 0);
    check('carries no captures', publicWorld.piracy.captures.size === 0);
    check('carries no emergence log', publicWorld.piracy.emergenceLog.length === 0);
    check('exposes no band\'s private dealings',
        publicOrgs.every(o => Object.keys(o.relations ?? {}).length === 0));
    check('exposes no leader', publicOrgs.every(o => o.leader === null));
    check('but still names the bands', publicOrgs.length > 0, `${publicOrgs.length} band(s)`);

    // 2. The private row the sync API never serves.
    console.log('\n[2] the authoritative row (never served to clients)');
    check('exists', !!piracyDoc);
    if (!piracyDoc) { process.exit(1); }

    const world = deserializeWorld(sessionDoc.snapshot);
    applyPiracySnapshot(world, piracyDoc.snapshot);
    const orgs = [...world.piracy.organizations.values()];

    check('restores the bands', orgs.length > 0, `${orgs.length}`);
    check('every band has its wings back', orgs.every(o => (o.factions?.length ?? 0) === 5),
        orgs.map(o => o.factions?.length ?? 0).join(','));
    check('collections deserialize as Maps',
        world.piracy.bases instanceof Map && world.piracy.sponsorships instanceof Map);

    const withLeader = orgs.filter(o => o.leader).length;
    const withTreasury = orgs.filter(o => o.treasury > 0).length;
    const withBases = orgs.filter(o => o.baseIds.length > 0).length;
    console.log(`\n  bands with a leader:   ${withLeader}/${orgs.length}`);
    console.log(`  bands with money:      ${withTreasury}/${orgs.length}`);
    console.log(`  bands with a base:     ${withBases}/${orgs.length}`);
    console.log(`  bases in the world:    ${world.piracy.bases.size}`);
    console.log(`  total looted:          ${Math.round(orgs.reduce((s, o) => s + o.lootTaken, 0)).toLocaleString()}cr`);
    console.log(`  total raids landed:    ${orgs.reduce((s, o) => s + o.raidsLanded, 0)}`);

    console.log('\n[3] the raiding loop actually ran');
    check('raids landed', orgs.some(o => o.raidsLanded > 0));
    check('loot was taken', orgs.some(o => o.lootTaken > 0));
    check('loot bought infrastructure', world.piracy.bases.size > 0);

    console.log('\n── bands ──');
    for (const org of orgs) {
        console.log(
            `  ${org.name.padEnd(22)} stage ${org.stage} ${org.doctrine.padEnd(15)}`
            + ` infamy ${org.infamy.toFixed(1).padStart(5)} heat ${org.heat.toFixed(1).padStart(5)}`
            + ` raids ${String(org.raidsLanded).padStart(3)}`
            + ` loot ${Math.round(org.lootTaken).toLocaleString().padStart(9)}cr`
            + ` ${org.fleetIds.length} ship(s) ${org.baseIds.length} base(s)`
        );
    }

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
    process.exitCode = failures === 0 ? 0 : 1;
}

main()
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
