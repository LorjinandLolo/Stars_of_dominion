// scripts/sync-privacy-probe.ts
// Does /api/game/sync still hand a rival's secrets to whoever asks?
//
// Two halves:
//   1. Offline — run the real serve-time projections over the real shard rows in
//      Postgres and assert nothing private survives. Needs no dev server.
//   2. Live (optional) — if a dev server is up, fetch the endpoint with no
//      cookies and assert it refuses.
//
//   npx tsx scripts/sync-privacy-probe.ts
//   npx tsx scripts/sync-privacy-probe.ts http://localhost:3000
//
// Exits non-zero on any leak, so it works as a pre-commit / CI gate.

import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { projectPublicShard, scrubOwnerSecrets } from '../lib/persistence/shard-privacy';

/** Fields a rival must never receive. */
const PRIVATE_KEYS = [
    'tech',
    'espionageAgents',
    'intelNetworks',
    'espionageFactionIntel',
    'espionageOperations',
    'espionageReports',
    'espionageBoard',
    'recruitmentJobs',
    'planetaryLogistics',
];

/** Economy fields a rival must never receive. */
const PRIVATE_ECONOMY_KEYS = [
    'reserves', 'creditSupply', 'liquidity', 'debt', 'stability',
    'metrics', 'infamy', 'centralization', 'economicModel', 'backingRatioPolicy',
];

let failures = 0;
const fail = (msg: string) => { failures++; console.log(`  LEAK  ${msg}`); };

/**
 * A shard carrying one of everything, including the two hidden-truth channels.
 * Runs with no database, so the projection logic is proven even on a machine
 * where Postgres is down — which is exactly when a leak would slip through.
 */
function selfTest() {
    console.log(`\n=== self-test against a synthetic shard ===`);
    const shard: any = {
        factionId: 'faction-probe',
        fleets: [
            { id: 'fleet-1', factionId: 'faction-probe', currentSystemId: 'sys-seen', isDetectable: false },
            { id: 'fleet-2', factionId: 'faction-probe', currentSystemId: 'sys-dark' },
        ],
        economy: {
            id: 'faction-probe', name: 'Probe Combine', capitalSystemId: 'sys-1',
            theatreId: 'theatre-probe', civilizationId: 'civ-probe', ideologyId: 'ideo-probe',
            reserves: { CREDITS: 50000 }, creditSupply: 1e6, liquidity: 5e5, debt: 0,
            stability: 100, infamy: 42, metrics: { tradeDependencyIndex: 0.2 },
        },
        tech: { unlockedTechIds: ['secret_tech'] },
        espionageAgents: [
            { id: 'agent-1', ownerFactionId: 'faction-probe', name: 'Real Name', codename: 'GHOST', traitIds: ['ghost', 'compromised'], status: 'active' },
            { id: 'agent-2', ownerFactionId: 'faction-probe', traitIds: [], status: 'turned' },
        ],
        intelNetworks: [{ id: 'net-1', systemId: 'sys-9', assetTags: ['sleeper_cell'] }],
        espionageFactionIntel: { counterIntelStrength: 30, infiltrationLevels: { rival: 70 } },
        espionageOperations: [{ id: 'op-1', actorFactionId: 'faction-probe', targetFactionId: 'rival', attributionState: 'invisible' }],
        espionageReports: [{ id: 'rep-1', ownerFactionId: 'faction-probe', confidence: 0.8, accurate: false }],
        espionageBoard: [{ id: 'opp-1', ownerFactionId: 'faction-probe', kind: 'threat' }],
        recruitmentJobs: [{ id: 'job-1', factionId: 'faction-probe', planetId: 'planet-1' }],
        planetaryLogistics: { defensePower: 999 },
    };

    // Rival fleets are FOGGED server-side now: only what the viewer's own fog
    // map (or fleet presence) entitles them to see. No viewer at all = nothing.
    const viewer = { visibility: { 'sys-seen': 'scanned' } as Record<string, string>, presenceSystems: new Set<string>() };
    const pub = projectPublicShard(shard, viewer);
    for (const key of PRIVATE_KEYS) {
        if (pub[key] !== undefined) fail(`self-test: rival payload carries "${key}"`);
    }
    for (const key of PRIVATE_ECONOMY_KEYS) {
        if (pub.economy?.[key] !== undefined) fail(`self-test: rival payload carries economy.${key}`);
    }
    if (pub.fleets?.length !== 1 || pub.fleets[0].id !== 'fleet-1') {
        fail(`self-test: viewer with sys-seen scanned should see exactly fleet-1, got [${(pub.fleets ?? []).map((f: any) => f.id).join(', ')}]`);
    }
    const blind = projectPublicShard(shard);
    if (blind.fleets?.length !== 0) fail('self-test: viewer-less rival payload must carry NO fleets (fail closed)');
    if (pub.economy?.capitalSystemId !== 'sys-1') fail('self-test: rival payload lost economy.capitalSystemId');
    if (pub.economy?.name !== 'Probe Combine') fail('self-test: rival payload lost economy.name');
    console.log(`  rival keys kept: [${Object.keys(pub).sort().join(', ')}]`);
    console.log(`  rival economy kept: [${Object.keys(pub.economy ?? {}).sort().join(', ')}]`);

    const own = scrubOwnerSecrets(shard);
    if ('accurate' in (own.espionageReports?.[0] ?? {})) fail("self-test: owner still sees report.accurate");
    if (own.espionageAgents?.[0]?.traitIds?.includes('compromised')) fail("self-test: owner still sees the 'compromised' trait");
    if (own.espionageAgents?.[1]?.status === 'turned') fail("self-test: owner still sees status 'turned'");
    for (const key of ['tech', 'espionageOperations', 'espionageBoard', 'intelNetworks', 'recruitmentJobs']) {
        if ((own as any)[key] === undefined) fail(`self-test: owner scrub wrongly dropped "${key}"`);
    }
    // Scrubbing must not mutate the caller's object — the DB row stays complete.
    if (!('accurate' in shard.espionageReports[0])) fail('self-test: scrub MUTATED the source shard — persistence would be corrupted');
    if (!shard.espionageAgents[0].traitIds.includes('compromised')) fail('self-test: scrub MUTATED the source agent traits');
    console.log(`  owner scrub: accurate hidden, compromised hidden, turned masked, everything else intact`);
}

async function main() {
    selfTest();

    let rows: Array<{ id: string; factionId: string; data: string }> = [];
    try {
        rows = await prisma.gameFactionShard.findMany();
    } catch (e: any) {
        console.log(`\n=== Postgres unreachable (${e.message.split('\n')[0]}) ===`);
        console.log('  Skipping the live-data half. Start it with: docker compose up -d');
        return;
    }

    console.log(`\n=== shard rows in Postgres: ${rows.length} ===`);
    if (!rows.length) {
        console.log('  No shards yet — run the worker (npm run worker) first. Nothing to check.');
        return;
    }

    console.log(`\n=== rival projection (projectPublicShard) ===`);
    for (const row of rows) {
        let shard: any;
        try { shard = JSON.parse(row.data); } catch { fail(`${row.id}: unparseable row`); continue; }
        const pub = projectPublicShard(shard);

        for (const key of PRIVATE_KEYS) {
            if (pub[key] !== undefined) fail(`${row.factionId}: rival payload still carries "${key}"`);
        }
        for (const key of PRIVATE_ECONOMY_KEYS) {
            if (pub.economy && pub.economy[key] !== undefined) {
                fail(`${row.factionId}: rival payload still carries economy.${key}`);
            }
        }

        const kept = Object.keys(pub).sort().join(', ');
        const econKept = pub.economy ? Object.keys(pub.economy).sort().join('/') : '—';
        const fleets = Array.isArray(pub.fleets) ? pub.fleets.length : 0;
        console.log(`  ${row.factionId.padEnd(24)} keys[${kept}]  economy[${econKept}]  fleets=${fleets}`);
    }

    console.log(`\n=== owner scrub (scrubOwnerSecrets) ===`);
    let reportsSeen = 0, agentsSeen = 0;
    for (const row of rows) {
        let shard: any;
        try { shard = JSON.parse(row.data); } catch { continue; }
        const own = scrubOwnerSecrets(shard);

        for (const r of own.espionageReports ?? []) {
            reportsSeen++;
            if (r && 'accurate' in r) fail(`${row.factionId}: report ${r.id} still exposes the hidden 'accurate' flag`);
        }
        for (const a of own.espionageAgents ?? []) {
            agentsSeen++;
            if (Array.isArray(a?.traitIds) && a.traitIds.includes('compromised')) {
                fail(`${row.factionId}: agent ${a.id} still exposes the hidden 'compromised' trait`);
            }
            if (a?.status === 'turned') fail(`${row.factionId}: agent ${a.id} still exposes status 'turned'`);
        }

        // The owner must still get everything they legitimately need.
        for (const key of ['tech', 'espionageOperations', 'espionageBoard']) {
            if (shard[key] !== undefined && own[key] === undefined) {
                fail(`${row.factionId}: owner scrub wrongly dropped "${key}"`);
            }
        }
    }
    console.log(`  checked ${reportsSeen} report(s) and ${agentsSeen} agent(s) across ${rows.length} shard(s)`);
    if (!reportsSeen && !agentsSeen) {
        console.log('  NOTE: no espionage data in the DB yet — the scrub is unexercised, not proven.');
    }

    // Persistence regression guard: `accurate` must survive extraction, because
    // the shard is the only place espionage reports are stored.
    console.log(`\n=== persistence (accurate must SURVIVE in the stored row) ===`);
    let storedWithFlag = 0, storedTotal = 0;
    for (const row of rows) {
        let shard: any;
        try { shard = JSON.parse(row.data); } catch { continue; }
        for (const r of shard.espionageReports ?? []) {
            storedTotal++;
            if (r && 'accurate' in r) storedWithFlag++;
        }
    }
    if (storedTotal === 0) {
        console.log('  no stored reports yet — cannot confirm; re-run after espionage activity.');
    } else if (storedWithFlag !== storedTotal) {
        fail(`only ${storedWithFlag}/${storedTotal} stored reports retain 'accurate' — the save is lossy`);
    } else {
        console.log(`  ok: ${storedWithFlag}/${storedTotal} stored reports retain 'accurate'`);
    }

    const origin = process.argv[2];
    if (origin) {
        console.log(`\n=== live endpoint, no cookies: ${origin}/api/game/sync ===`);
        try {
            const res = await fetch(`${origin}/api/game/sync`, { cache: 'no-store' });
            const body = await res.text();
            console.log(`  status ${res.status}`);
            if (res.status !== 401) {
                fail(`unauthenticated GET returned ${res.status}, expected 401`);
                if (/espionage|intelNetworks|reserves/.test(body)) {
                    fail('response body still contains espionage/economy fields');
                }
            } else {
                console.log('  ok: refused without a session');
            }
        } catch (e: any) {
            console.log(`  (no server reachable at ${origin}: ${e.message}) — skipped`);
        }
    } else {
        console.log(`\n(pass a dev-server origin to also probe the live endpoint, e.g. http://localhost:3000)`);
    }
}

main()
    .then(() => {
        console.log(failures ? `\n❌ ${failures} leak(s)\n` : `\n✅ no leaks\n`);
        process.exitCode = failures ? 1 : 0;
    })
    .catch(e => { console.error(e); process.exitCode = 1; })
    // The self-test half runs with no database at all, in which case touching
    // the client here would throw over a clean result.
    .finally(() => { try { void prisma.$disconnect(); } catch { /* never connected */ } });
