// scripts/fallen-e2e.ts
// End to end for Item 14a on a throwaway database with the real worker:
// DEV 2's empire (Vektori) has fallen to the Kaer'Ruun, DEV 2 goes into hiding
// through the lobby path, the worker seats them on an outlying lost world with
// the people who fled, and the conqueror's own wire never shows any of it.
//
//   npx tsx scripts/fallen-e2e.ts

import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { isUndergroundSeatId } from '../lib/rebellion/rebellion-types';
import { projectShardForCaller } from '../lib/persistence/shard-privacy';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

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
const VEKTORI = 'faction-vektori';
const KAERRUUN = 'faction-kaerruun';
const hex = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

async function main() {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) { console.log('  skip  no DATABASE_URL in .env.local'); return; }
    const { PrismaClient } = await import('../lib/generated/prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const DB = 'stars_fallen_probe';
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
        console.log('\n[1] Vektori falls to the Kaer\'Ruun');
        const boot = spawnSync(process.execPath, [TSX, 'scripts/server-bootstrap.ts'], { env, encoding: 'utf-8', timeout: 300_000 });
        check('a fresh galaxy with DEV 1 and DEV 2 (server setup)', boot.status === 0, `${boot.stdout}\n${boot.stderr}`.slice(-500));
        const dev2 = await db.user.findUnique({ where: { email: 'dev2@stars.com' } });
        check('DEV 2 leads Vektori', (await db.playerProfile.findUnique({ where: { userId: dev2!.id } }))?.factionId === VEKTORI);

        // Stage the fall in the shared snapshot (where planet ownership lives):
        // Vektori held its capital and three more inhabited worlds; the
        // Kaer'Ruun took them all just now; the ledger remembers; Vektori is
        // latched ELIMINATED.
        const row = await db.multiplayerSession.findUnique({ where: { id: 'default-session' } });
        const w: any = deserializeWorld(row!.snapshot);
        const cap: any = [...w.construction.planets.values()].find((p: any) => p.ownerId === VEKTORI);
        const capSys = w.movement.systems.get(cap.systemId);
        const free = [...w.construction.planets.values()]
            .filter((p: any) => !p.ownerId && p.systemId !== cap.systemId && w.movement.systems.get(p.systemId))
            .sort((a: any, b: any) => hex(capSys, w.movement.systems.get(a.systemId)) - hex(capSys, w.movement.systems.get(b.systemId)));
        const extra = [free[5], free[20], free[60]].filter(Boolean);
        const lost = [cap, ...extra];
        const farthest = extra.reduce((best: any, p: any) => (hex(capSys, w.movement.systems.get(p.systemId)) > hex(capSys, w.movement.systems.get(best.systemId)) ? p : best), extra[0]);
        const now = Number(w.nowSeconds ?? 0);
        w.lostWorlds = { lastOwners: {}, lost: {} };
        for (const p of lost) {
            p.ownerId = KAERRUUN;
            p.population = Math.max(5, Number(p.population ?? 0));
            w.lostWorlds.lost[`${p.id}|${VEKTORI}`] = { planetId: p.id, systemId: p.systemId, lostBy: VEKTORI, takenBy: KAERRUUN, lostAtSeconds: now };
        }
        if (!(w.titles?.defeatStatuses instanceof Map)) { w.titles = w.titles ?? {}; w.titles.defeatStatuses = new Map(); }
        w.titles.defeatStatuses.set(VEKTORI, 'ELIMINATED');
        await db.multiplayerSession.update({ where: { id: 'default-session' }, data: { snapshot: serializeWorld(w) } });

        process.env.DATABASE_URL = probeUrl;
        const { seatStatus, requestBreakawaySeat } = await import('../lib/breakaway/seat-service');
        const status = await seatStatus(dev2!.id);
        check('DEV 2 may go into hiding', status.eligible && status.reason === 'eliminated' && status.canHide, JSON.stringify(status).slice(0, 200));
        const dev1 = await db.user.findUnique({ where: { email: 'dev1@stars.com' } });
        const refused = await requestBreakawaySeat({ userId: dev1!.id, displayName: 'Dev Commander 1', hiding: true });
        check('DEV 1, whose empire stands, may not', !refused.ok);
        const queued = await requestBreakawaySeat({ userId: dev2!.id, displayName: 'Dev Commander 2', hiding: true });
        check('DEV 2\'s request to go into hiding is queued', queued.ok, JSON.stringify(queued));

        console.log('\n[2] The worker hides them');
        worker = spawn(process.execPath, ['scripts/worker-forever.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        worker.stdout!.on('data', d => { log += d; });
        worker.stderr!.on('data', d => { log += d; });
        let seatId = '';
        for (const until = Date.now() + 150_000; Date.now() < until;) {
            await sleep(4000);
            seatId = (await db.playerProfile.findUnique({ where: { userId: dev2!.id } }))?.factionId ?? '';
            if (isUndergroundSeatId(seatId)) break;
        }
        check('DEV 2\'s claim moved from the fallen empire to an underground seat', isUndergroundSeatId(seatId), `${seatId}\n${log.slice(-1500)}`);
        let cell: any = null;
        let hostRow: any = null;
        for (const until = Date.now() + 90_000; Date.now() < until && !cell; ) {
            for (const r of await db.gameFactionShard.findMany({ where: { data: { contains: seatId } } })) {
                const c = (JSON.parse(r.data).rebelCells ?? []).find((x: any) => x?.seat?.factionId === seatId);
                if (c?.seatView) { cell = c; hostRow = r; }
            }
            if (!cell) await sleep(3000);
        }
        check('the cell is in the conqueror\'s territory', hostRow?.factionId === KAERRUUN, hostRow?.factionId);
        check('on the lost world farthest from the old capital, not the capital', cell?.planetId === farthest.id && cell?.planetId !== cap.id, `${cell?.planetId} vs ${farthest.id}`);
        check('fighting for the restoration of Vektori', /restoration of/.test(cell?.cause ?? ''), cell?.cause);
        check('with the people who fled', (cell?.exile?.crew?.length ?? 0) >= 4 && cell?.seatView?.exile?.crew?.length === cell?.exile?.crew?.length);
        check('the leader\'s log says where and with whom', (cell?.seatView?.log ?? []).some((l: any) => /came with you/.test(l.text)) && (cell?.seatView?.log ?? []).some((l: any) => /in hiding on/.test(l.text)));

        console.log('\n[3] The conqueror never learns');
        const latest = (await db.gameFactionShard.findUnique({ where: { id: hostRow.id } }))!.data;
        const wire = projectShardForCaller(latest, true);
        check('the Kaer\'Ruun wire names no seat, no exile, no companion', !wire.includes(seatId) && !wire.includes('"exile"') && (cell?.exile?.crew ?? []).every((c: any) => !wire.includes(c.name)));
        const snap = (await db.multiplayerSession.findUnique({ where: { id: 'default-session' } }))!.snapshot;
        check('the shared snapshot never names the seat', !snap.includes(seatId));
    } finally {
        fs.writeFileSync(path.join(process.env.TEMP ?? '.', 'fallen-worker.log'), log);
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
