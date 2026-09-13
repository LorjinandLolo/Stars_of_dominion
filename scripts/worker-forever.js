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

import { spawn } from 'node:child_process';

const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;
const HEALTHY_RUN_MS = 60_000;

let delayMs = MIN_DELAY_MS;
let child = null;
let stopping = false;

function start() {
    const startedAt = Date.now();
    const isWin = process.platform === 'win32';
    child = spawn(isWin ? 'npx.cmd' : 'npx', ['tsx', 'scripts/game-loop.ts'], {
        stdio: 'inherit',
        shell: isWin,
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
    stopping = true;
    console.log(`[worker-forever] ${sig} — stopping`);
    if (child) child.kill(sig);
    setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
