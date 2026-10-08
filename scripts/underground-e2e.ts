// scripts/underground-e2e.ts
// End to end for Item 13d on a throwaway database with the real worker:
// every empire is taken, DEV 2 asks to lead a movement underground, the worker
// seats them, DEV 2 orders a strike and it happens, and the host's own wire
// copy never shows that a person leads the cell.
//
//   npx tsx scripts/underground-e2e.ts

import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { LOBBY_FACTIONS } from '../data/factions/lobby-factions';
import { isUndergroundSeatId } from '../lib/rebellion/rebellion-types';
import { projectShardForCaller } from '../lib/persistence/shard-privacy';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const require = createRequire(import.meta.url);
const TSX = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
const rand = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const AURELIAN = 'faction-aurelian';

async function main() {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) { console.log('  skip  no DATABASE_URL in .env.local'); return; }
    const { PrismaClient } = await import('../lib/generated/prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const DB = 'stars_underground_probe';
    const probeUrl = baseUrl.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`);
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: baseUrl }) });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE ${DB}`);
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: probeUrl }) });
    const env: NodeJS.ProcessEnv = {
        ...process.env, DATABASE_URL: probeUrl, NODE_ENV: 'production',
        POSTGRES_PASSWORD: rand(32), BETTER_AUTH_SECRET: rand(64), BETTER_AUTH_URL: 'http://localhost:3000', GAME_ADMIN_SECRET: rand(32),
        DEV_DUEL_PASSWORD: rand(24),
    };
    let worker: ReturnType<typeof spawn> | null = null;
    let log = '';
    try {
        console.log('\n[1] A full galaxy, and a newcomer');
        const boot = spawnSync(process.execPath, [TSX, 'scripts/server-bootstrap.ts'], { env, encoding: 'utf-8', timeout: 300_000 });
        check('a fresh galaxy with DEV 1 and DEV 2 (server setup)', boot.status === 0, `${boot.stdout}\n${boot.stderr}`.slice(-500));
        const dev1 = await db.user.findUnique({ where: { email: 'dev1@stars.com' } });
        const dev2 = await db.user.findUnique({ where: { email: 'dev2@stars.com' } });
        await db.playerProfile.delete({ where: { userId: dev2!.id } });
        for (const f of LOBBY_FACTIONS) {
            if (f.id === AURELIAN) continue;
            await db.user.create({ data: { id: `probe-user-${f.id}`, name: `Probe ${f.name}`, email: `${f.id}@probe.local` } });
            await db.playerProfile.create({ data: { userId: `probe-user-${f.id}`, factionId: f.id, displayName: `Probe ${f.name}` } });
        }

        process.env.DATABASE_URL = probeUrl;
        const { requestBreakawaySeat } = await import('../lib/breakaway/seat-service');
        const queued = await requestBreakawaySeat({ userId: dev2!.id, displayName: 'Dev Commander 2', underground: true });
        check('DEV 2 asks to lead a movement underground, and the request is queued', queued.ok, JSON.stringify(queued));

        console.log('\n[2] The worker seats them');
        worker = spawn(process.execPath, ['scripts/worker-forever.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        worker.stdout!.on('data', d => { log += d; });
        worker.stderr!.on('data', d => { log += d; });
        let claim: any = null;
        for (const until = Date.now() + 150_000; Date.now() < until;) {
            await sleep(4000);
            claim = await db.playerProfile.findUnique({ where: { userId: dev2!.id } });
            if (claim) break;
        }
        const seatId = claim?.factionId ?? '';
        check('DEV 2 holds an underground seat', isUndergroundSeatId(seatId), `${seatId}\n${log.slice(-1500)}`);

        // The read the page makes (app/api/rebel/cell): the host shard naming the seat.
        let hostRow: any = null;
        let cell: any = null;
        for (const until = Date.now() + 90_000; Date.now() < until;) {
            const rows = await db.gameFactionShard.findMany({ where: { data: { contains: seatId } } });
            for (const row of rows) {
                const c = (JSON.parse(row.data).rebelCells ?? []).find((x: any) => x?.seat?.factionId === seatId);
                if (c?.seatView) { hostRow = row; cell = c; }
            }
            if (cell) break;
            await sleep(3000);
        }
        check('the cell, with its leader\'s view, is on the server', !!cell?.seatView, log.slice(-800));
        // Every empire is human here, so the movement grows inside one of them.
        check('it grows inside an empire', !!hostRow && LOBBY_FACTIONS.some(f => f.id === hostRow.factionId), hostRow?.factionId);
        check('no state exists for the seat yet', !(await db.gameFactionShard.findFirst({ where: { factionId: seatId } })));

        console.log('\n[3] DEV 2 gives an order');
        const { verifyFactionOwnership } = await import('../lib/multiplayer/order-queue');
        check('ownership: DEV 2 may command the seat', (await verifyFactionOwnership(seatId, dev2!.id)).ok);
        check('ownership: DEV 1 may not', !(await verifyFactionOwnership(seatId, dev1!.id)).ok);
        const actsBefore = cell?.actsCommitted ?? 0;
        await db.gameOrder.create({ data: { actionId: 'REB_CELL_ACT', factionId: seatId, payload: JSON.stringify({ act: 'propaganda' }) } });
        let after: any = null;
        for (const until = Date.now() + 90_000; Date.now() < until;) {
            await sleep(4000);
            const row = await db.gameFactionShard.findUnique({ where: { id: hostRow.id } });
            after = (JSON.parse(row!.data).rebelCells ?? []).find((x: any) => x.id === cell.id);
            if ((after?.actsCommitted ?? 0) > actsBefore) break;
        }
        check('the strike happened', (after?.actsCommitted ?? 0) > actsBefore, log.slice(-800));
        const file = (JSON.parse((await db.gameFactionShard.findUnique({ where: { id: hostRow.id } }))!.data).espionageCases ?? [])
            .find((k: any) => k.cellId === cell.id);
        check('the host has a file on it', !!file);

        console.log('\n[4] The host never learns a person leads it');
        const latest = (await db.gameFactionShard.findUnique({ where: { id: hostRow.id } }))!.data;
        const wire = projectShardForCaller(latest, true);
        check('the host\'s own wire copy names neither the seat nor its holder', !wire.includes(seatId) && !wire.includes('Dev Commander 2'));
        const claims = await db.playerProfile.findMany({ select: { factionId: true } });
        check('the claims table has the seat (the worker filters it)', claims.some(c => c.factionId === seatId));
        const snap = await db.multiplayerSession.findUnique({ where: { id: 'default-session' } });
        check('the shared snapshot never names the seat', !snap!.snapshot.includes(seatId));
    } finally {
        fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'underground-worker.log'), log);
        if (worker?.pid) {
            if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(worker.pid), '/T', '/F']);
            else worker.kill('SIGTERM');
            await sleep(1500);
        }
        await db.$disconnect().catch(() => {});
        try { const { prisma } = await import('../lib/db'); await prisma.$disconnect(); } catch { /* not opened */ }
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`).catch(() => {});
        await admin.$disconnect();
        console.log('  (throwaway database dropped)');
    }
    console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
