#!/usr/bin/env node
// scripts/worker-forever.js — `npm run worker:forever`
//
// Keeps a game-loop worker alive on a dev machine. The worker EXITS ON
// PURPOSE when its hang watchdog trips ("cycle stuck ... exiting so a fresh
// worker can take over"), which is the right call on the server, where the
// container restart policy starts a fresh one. Locally nothing did, so a
// stalled DB save (Docker Desktop dying under memory pressure, twice on
// 2026-09-13) left the game with no worker until someone noticed.
//
// Restarts after 5s; backs off to 60s if the worker keeps dying within a
// minute (a real crash, not a hang), and resets once it has run for a minute.

//
// Also the worker's entry point in compose.prod.yaml (casual-play Item 9):
// there the container restart policy covers a crashed wrapper, and this covers
// the worker between them without a full container restart.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;
const HEALTHY_RUN_MS = 60_000;
/** How long a stopping worker gets to release its lease (compose gives 30s). */
const SHUTDOWN_GRACE_MS = 25_000;

// tsx's CLI run by this same node — no npx, no shell. The npx.cmd + shell
// spawn is what failed on Windows with 0xC0000142, and it put two extra
// processes between a SIGTERM and the worker that has to release its lease.
const require = createRequire(import.meta.url);
const TSX_CLI = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');

let delayMs = MIN_DELAY_MS;
let child = null;
let stopping = false;

function start() {
    const startedAt = Date.now();
    child = spawn(process.execPath, [TSX_CLI, 'scripts/game-loop.ts'], {
        stdio: 'inherit',
        env: process.env,
    });
    console.log(`[worker-forever] started worker (pid ${child.pid})`);

    child.on('exit', (code, signal) => {
        child = null;
        if (stopping) return;
        const ranMs = Date.now() - startedAt;
        delayMs = ranMs >= HEALTHY_RUN_MS ? MIN_DELAY_MS : Math.min(delayMs * 2, MAX_DELAY_MS);
        console.log(`[worker-forever] worker exited (code ${code}, signal ${signal}) after ${Math.round(ranMs / 1000)}s — restarting in ${delayMs / 1000}s`);
        setTimeout(start, delayMs);
    });
}

function shutdown(sig) {
    if (stopping) return;
    stopping = true;
    console.log(`[worker-forever] ${sig} — stopping`);
    if (!child) process.exit(0);
    // Wait for the worker to release its lease and exit; leaving after half a
    // second (as this used to) let the container stop kill it mid-release.
    child.once('exit', () => process.exit(0));
    child.kill(sig);
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
