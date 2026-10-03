// scripts/test-telemetry.ts
// What the telemetry ingest will and will not store. Pure: no database.
// Run: npx tsx scripts/test-telemetry.ts

import {
    MAX_DETAIL_CHARS, MAX_EVENTS_PER_REPORT, MAX_EVENT_AGE_MS,
    sanitizeReport, serverDetail, telemetryEnabled,
} from '../lib/telemetry/telemetry-rules';
import * as fs from 'fs';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

const now = new Date('2026-10-03T12:00:00Z');

console.log('\nWhat a browser may report');
{
    const out = sanitizeReport({ events: [
        { kind: 'tab_opened', detail: { tab: 'government' } },
        { kind: 'heartbeat', detail: { anything: 'ignored' } },
        { kind: 'order_queued', detail: { actionId: 'FAKE' } },        // server-only kind
        { kind: 'message_text', detail: { body: 'hello' } },          // unknown kind
        { kind: 'session_start', detail: { w: 1280, h: 720, touch: false, userAgent: 'x', email: 'a@b.c' } },
        null,
        { detail: { tab: 'x' } },
    ] }, now);
    check('known client kinds are kept, in order', out.map(e => e.kind).join(',') === 'tab_opened,heartbeat,session_start', out.map(e => e.kind).join(','));
    check('a browser cannot write a server-only kind', !out.some(e => e.kind === 'order_queued'));
    check('a detail keeps only the keys its kind allows', out[2].detail === JSON.stringify({ w: 1280, h: 720, touch: false }), String(out[2].detail));
    check('a kind with no detail stores none', out[1].detail === null);
}

console.log('\nWhat it cannot do to the table');
{
    const flood = sanitizeReport({ events: Array.from({ length: 500 }, () => ({ kind: 'heartbeat' })) }, now);
    check(`at most ${MAX_EVENTS_PER_REPORT} events per report`, flood.length === MAX_EVENTS_PER_REPORT, String(flood.length));

    const long = sanitizeReport({ events: [{ kind: 'client_error', detail: { message: 'x'.repeat(5000) } }] }, now);
    check('long strings are cut', (long[0].detail?.length ?? 0) <= MAX_DETAIL_CHARS, String(long[0].detail?.length));

    const nested = sanitizeReport({ events: [{ kind: 'tab_opened', detail: { tab: { evil: true } } }] }, now);
    check('objects inside a detail are dropped', nested[0].detail === null, String(nested[0].detail));

    const times = sanitizeReport({ events: [
        { kind: 'heartbeat', ageMs: 5_000 },
        { kind: 'heartbeat', ageMs: 10 * 86_400_000 },
        { kind: 'heartbeat', ageMs: -60_000 },
        { kind: 'heartbeat', ageMs: 'soon' },
    ] }, now);
    check('the time is the server\'s, less how long ago the browser says', times[0].at.getTime() === now.getTime() - 5_000);
    check('an event cannot be backdated past the limit', times[1].at.getTime() === now.getTime() - MAX_EVENT_AGE_MS);
    check('or dated in the future', times[2].at.getTime() === now.getTime() && times[3].at.getTime() === now.getTime());

    check('garbage is an empty report, not an error',
        sanitizeReport(null, now).length === 0 && sanitizeReport({ events: 'x' }, now).length === 0 && sanitizeReport('[]', now).length === 0);
}

console.log('\nServer side');
{
    check('server details are cut to size', serverDetail({ reason: 'r'.repeat(5000) }).length <= MAX_DETAIL_CHARS);
    check('TELEMETRY=off switches it off', !telemetryEnabled({ TELEMETRY: 'off' }) && !telemetryEnabled({ TELEMETRY: ' OFF ' }));
    check('and it is on by default', telemetryEnabled({}) && telemetryEnabled({ TELEMETRY: '' }));
}

console.log('\nWiring');
{
    const read = (p: string) => fs.readFileSync(p, 'utf8');
    check('the game shell starts the recorder', /startTelemetry\(\)/.test(read('components/shell/GameShell.tsx')));
    check('the order queue records accepted orders', /recordServerEvent\('order_queued'/.test(read('lib/multiplayer/order-queue.ts')));
    check('the worker records refused orders and flushes them', /bufferWorkerEvent\(world, 'order_failed'/.test(read('scripts/game-loop.ts')) && /flushWorkerTelemetry\(\)/.test(read('scripts/game-loop.ts')));
    check('refusals the player saw are recorded', (read('lib/multiplayer/order-client.ts').match(/track\('order_refused'/g) ?? []).length === 2);
    check('the off switch reaches the containers', /TELEMETRY: \$\{TELEMETRY:-\}/.test(read('compose.prod.yaml')));
    const client = read('lib/telemetry/telemetry-client.ts');
    check('the browser half never imports the database', !/lib\/db|telemetry-store/.test(client));
}

console.log(failures === 0 ? '\nPASS\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
