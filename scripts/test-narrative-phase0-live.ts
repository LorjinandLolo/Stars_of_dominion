// scripts/test-narrative-phase0-live.ts
// Integration check for Narrative Phase 0: proves the chronicle actually fills
// from the running game loop, not just from a unit test.
//
// Run: npx tsx scripts/test-narrative-phase0-live.ts        (dev database only)
//
// It flips one planet's owner in the saved world, lets the worker notice the
// system changed hands, asserts a chronicle row appeared, then puts the planet
// back. The world is restored even if the assertions fail.

import assert from 'assert';
import { spawn } from 'child_process';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../lib/db';
import { deserializeWorld, serializeWorld } from '../lib/persistence/save-service';

const SESSION_ID = 'default-session';
const WORKER_SECONDS = 40;

/**
 * Run the game loop for a fixed stretch, then stop it.
 *
 * `shell: true` puts cmd.exe between us and node, and killing the shell on
 * Windows orphans the worker — which then holds the lease and keeps this
 * process alive. Spawn node directly and kill the whole tree.
 */
function runWorker(seconds: number): Promise<string> {
    return new Promise((resolve) => {
        const child = spawn(
            process.execPath,
            ['--import', 'tsx', 'scripts/game-loop.ts'],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let out = '';
        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', d => { out += d.toString(); });

        const stop = () => {
            if (child.exitCode !== null || child.signalCode !== null) return;
            if (process.platform === 'win32' && child.pid) {
                spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
                child.kill('SIGTERM');
            }
        };

        const timer = setTimeout(stop, seconds * 1000);
        child.on('exit', () => { clearTimeout(timer); resolve(out); });
        child.on('error', (e) => { clearTimeout(timer); resolve(`${out}\n[spawn error] ${e.message}`); });
    });
}

async function loadWorld() {
    const doc = await prisma.multiplayerSession.findUniqueOrThrow({ where: { id: SESSION_ID } });
    return deserializeWorld(doc.snapshot);
}

async function saveWorld(world: any) {
    await prisma.multiplayerSession.update({
        where: { id: SESSION_ID },
        data: { snapshot: serializeWorld(world) },
    });
}

async function main() {
    const world: any = await loadWorld();

    // Find a system whose owned planets all belong to one faction. Handing the
    // whole set over changes the system's owner outright, which is the
    // condition the emission in recalculateSystemControl watches for.
    const bySystem = new Map<string, any[]>();
    for (const p of world.construction.planets.values()) {
        const list = bySystem.get(p.systemId) ?? [];
        list.push(p);
        bySystem.set(p.systemId, list);
    }

    let victims: any[] = [];
    let systemId = '';
    for (const [sysId, planets] of bySystem) {
        const owned = planets.filter((p: any) => p.ownerId && p.ownerId !== 'faction-neutral');
        if (owned.length === 0) continue;
        const owners = new Set(owned.map((p: any) => p.ownerId));
        if (owners.size !== 1) continue; // contested — the flip would be ambiguous
        victims = owned;
        systemId = sysId;
        break;
    }
    assert.ok(victims.length > 0, 'no singly-owned system found to test with');

    const originalOwner = victims[0].ownerId;
    // The faction pool comes from planet ownership, not world.economy.factions:
    // cleanWorldForSave strips the economy out of the snapshot into per-faction
    // shards, so the map is empty on a freshly deserialized world.
    const allOwners = new Set<string>();
    for (const p of world.construction.planets.values()) {
        if (p.ownerId && p.ownerId !== 'faction-neutral') allOwners.add(p.ownerId);
    }
    const newOwner = [...allOwners].find(f => f !== originalOwner);
    assert.ok(newOwner, 'need a second faction to hand the system to');
    const label = `${victims.length} planet(s) in ${systemId}`;
    console.log(`[1] flipping ${label} from ${originalOwner} to ${newOwner}`);

    // This script hands real planets to another empire for forty seconds. If it
    // is interrupted before the restore, the dev world keeps the change — so
    // put the planets back on the way out, however we leave.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, async () => {
            console.log(`\n[${signal}] restoring ${label} before exit…`);
            try { await restore(); } catch (e: any) { console.error('[cleanup] restore failed:', e.message); }
            process.exit(1);
        });
    }

    const since = new Date();
    let restored = false;

    try {
        for (const p of victims) p.ownerId = newOwner;
        await saveWorld(world);

        // A worker killed mid-run leaves its lease behind for 15 minutes, and a
        // fresh one refuses to start while it stands. This script always kills
        // its own worker, so clear the lease before spawning.
        await prisma.multiplayerSession.deleteMany({ where: { id: 'worker-lease' } });

        console.log(`[2] running the worker for ${WORKER_SECONDS}s…`);
        const log = await runWorker(WORKER_SECONDS);
        const notable = log.split('\n').filter(l => /\[Chronicle\]|lease|Lease|Cycle|Fatal|error/i.test(l));
        console.log(`[3] worker log:\n${notable.slice(0, 12).map(l => '    ' + l.trim()).join('\n') || '    (silent)'}`);

        const rows = await prisma.chronicleEvent.findMany({
            where: { createdAt: { gte: since }, location: systemId },
            orderBy: { createdAt: 'desc' },
        });
        console.log(`[4] chronicle rows for ${systemId}: ${rows.length}`);
        assert.ok(rows.length > 0, 'the loop must have recorded the change of hands');

        const captured = rows[0];
        console.log(`[5] recorded ${captured.type} importance=${captured.importance} actors=${captured.actorIds}`);
        assert.ok(
            captured.type === 'system_captured' || captured.type === 'capital_captured',
            `expected a capture event, got ${captured.type}`,
        );
        assert.deepStrictEqual(JSON.parse(captured.actorIds), [newOwner], 'the new owner is the actor');
        assert.deepStrictEqual(JSON.parse(captured.targetIds), [originalOwner], 'the old owner is the target');
        assert.strictEqual(captured.narratedAt, null, 'a fresh event is unnarrated');

        // Clean the test's own rows so a real gazette never reports this.
        await prisma.chronicleEvent.deleteMany({ where: { createdAt: { gte: since }, location: systemId } });

        // Restore before announcing success.
        await restore();
        restored = true;
        console.log(`[6] ${label} returned to ${originalOwner}`);

        console.log('\n✅ Narrative Phase 0 live: the running loop fills the chronicle.');
    } finally {
        if (!restored) {
            try {
                await restore();
                console.log(`[cleanup] ${label} returned to ${originalOwner}`);
            } catch (e: any) {
                console.error(`[cleanup] FAILED to restore ${label} to ${originalOwner}:`, e.message);
            }
        }
    }

    async function restore() {
        const after: any = await loadWorld();
        for (const v of victims) {
            const planet = after.construction.planets.get(v.id);
            if (planet) planet.ownerId = originalOwner;
        }
        await saveWorld(after);
    }
}

main()
    .catch(err => { console.error('❌ Live phase 0 check failed:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
