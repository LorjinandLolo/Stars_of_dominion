// scripts/pirate-view-probe.ts
// Read-only: what does each faction actually know about the underworld?
// Proves the visibility filter end-to-end against the live world.
// Run: npx tsx scripts/pirate-view-probe.ts

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { applyPiracySnapshot, deserializeWorld, injectFactionShard } from '../lib/persistence/save-service';
import { buildPirateView } from '../lib/piracy/pirate-view';
import { activeOrganizations, ensurePiracyState } from '../lib/piracy/organization-service';

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
    // The session snapshot is the CLIENT-facing projection: its pirate state is
    // deliberately scrubbed. The authoritative copy lives in its own row.
    const piracyDoc = await prisma.multiplayerSession.findUnique({
        where: { id: 'default-session-piracy' },
    });
    applyPiracySnapshot(world, piracyDoc?.snapshot);
    const piracy = ensurePiracyState(world);

    console.log('── The galaxy\'s bands ──────────────────────────────────────');
    for (const org of activeOrganizations(world)) {
        console.log(
            `  ${org.name.padEnd(22)} stage ${org.stage}  ${org.doctrine.padEnd(15)}`
            + ` infamy ${org.infamy.toFixed(1).padStart(5)}  heat ${org.heat.toFixed(1).padStart(5)}`
            + `  ${org.fleetIds.length} ship(s)  ${org.baseIds.length} base(s)`
            + `  ${Math.round(org.treasury).toLocaleString()}cr`
        );
    }
    console.log(`  bases in the galaxy: ${piracy.bases.size}`);
    console.log(`  emergence records:   ${piracy.emergenceLog.length}`);

    if (piracy.emergenceLog.length > 0) {
        console.log('\n── Why they appeared ───────────────────────────────────────');
        for (const record of piracy.emergenceLog.slice(-6)) {
            console.log(
                `  ${record.systemId.slice(0, 28).padEnd(30)} POI ${record.poi.toFixed(1).padStart(5)}`
                + `  ${record.dominantFactor}: ${record.dominantInput.padEnd(22)}`
                + `  origin ${record.origin}${record.absorbed ? ' (absorbed)' : ''}`
            );
        }
    }

    console.log('\n── What each faction is entitled to see ────────────────────');
    for (const faction of world.economy.factions.values()) {
        const view = buildPirateView(world, faction.id);
        if (view.organizations.length === 0 && view.bases.length === 0) continue;
        console.log(
            `  ${faction.id.padEnd(26)} knows ${String(view.organizations.length).padStart(2)} band(s),`
            + ` ${String(view.bases.length).padStart(2)} base(s),`
            + ` ${view.ownSponsorships.length} sponsorship(s),`
            + ` ${view.suspectedSponsorships.length} suspicion(s)`
        );
        for (const org of view.organizations.slice(0, 4)) {
            console.log(
                `      ${org.name.padEnd(22)} stage ${org.stage ?? '?'}  infamy ${org.infamy}`
                + `  we-hunt ${org.heatToward}  control ${org.networkControl ?? '?'}`
            );
        }
    }

    const blind = [...world.economy.factions.values()]
        .filter(f => buildPirateView(world, f.id).organizations.length === 0);
    console.log(`\n  factions with no underworld contact at all: ${blind.length}`);
}

main()
    .catch(e => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
