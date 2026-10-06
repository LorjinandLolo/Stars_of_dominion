// scripts/telemetry-report.ts
// How the game is being played, per player, from the telemetry table.
//
// On the server, from the repo folder:
//   docker compose -f compose.prod.yaml exec app npx tsx scripts/telemetry-report.ts
//   docker compose -f compose.prod.yaml exec app npx tsx scripts/telemetry-report.ts 3       (last 3 days)
//   docker compose -f compose.prod.yaml exec app npx tsx scripts/telemetry-report.ts 7 --prune 60
//                                                              (and delete rows older than 60 days)
// Locally: npx tsx scripts/telemetry-report.ts
//
// Read-only unless --prune is given. Prints no secrets and no message text —
// telemetry never stores any.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { prisma } from '../lib/db';
import { CLIENT_EVENT_KINDS } from '../lib/telemetry/telemetry-rules';
import type { NavTab } from '../types/ui-state';

const days = Math.max(1, Number(process.argv[2]) || 7);
const pruneAt = process.argv.indexOf('--prune');
const pruneDays = pruneAt > 0 ? Math.max(7, Number(process.argv[pruneAt + 1]) || 60) : null;

/** Every main panel, so the report can say which ones nobody opened. */
const ALL_TABS: NavTab[] = ['galaxy', 'economy', 'government', 'intelligence', 'press', 'shadow', 'council', 'saga', 'dossier'];

function parse(detail: string | null): Record<string, any> {
    if (!detail) return {};
    try { return JSON.parse(detail); } catch { return {}; }
}

function top(counts: Map<string, number>, n = 5): string {
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
}

function bump(map: Map<string, number>, key: string, by = 1): void {
    map.set(key, (map.get(key) ?? 0) + by);
}

function ago(date: Date): string {
    const hours = (Date.now() - date.getTime()) / 3_600_000;
    if (hours < 1) return `${Math.round(hours * 60)} min ago`;
    if (hours < 48) return `${Math.round(hours)} h ago`;
    return `${Math.round(hours / 24)} days ago`;
}

interface PlayerRow {
    label: string;
    sessions: number;
    minutes: number;
    days: Set<string>;
    lastSeen: Date | null;
    tabs: Map<string, number>;
    overlays: Map<string, number>;
    ordersQueued: Map<string, number>;
    ordersRefused: Map<string, number>;
    ordersFailed: Map<string, number>;
    errors: Map<string, number>;
    smallScreen: boolean;
}

function emptyRow(label: string): PlayerRow {
    return {
        label, sessions: 0, minutes: 0, days: new Set(), lastSeen: null,
        tabs: new Map(), overlays: new Map(), ordersQueued: new Map(), ordersRefused: new Map(),
        ordersFailed: new Map(), errors: new Map(), smallScreen: false,
    };
}

async function main() {
    if (pruneDays) {
        const cutoff = new Date(Date.now() - pruneDays * 86_400_000);
        const { count } = await prisma.telemetryEvent.deleteMany({ where: { at: { lt: cutoff } } });
        console.log(`Pruned ${count} event(s) older than ${pruneDays} days.\n`);
    }

    const since = new Date(Date.now() - days * 86_400_000);
    const [events, profiles, users] = await Promise.all([
        prisma.telemetryEvent.findMany({ where: { at: { gte: since } }, orderBy: { at: 'asc' } }),
        prisma.playerProfile.findMany({ select: { userId: true, factionId: true, displayName: true } }),
        prisma.user.findMany({ select: { id: true, name: true } }),
    ]);

    const nameOfUser = new Map(users.map(u => [u.id, u.name]));
    const userOfFaction = new Map(profiles.map(p => [p.factionId, p.userId]));
    const labelOf = (userId: string) => {
        const profile = profiles.find(p => p.userId === userId);
        const name = profile?.displayName ?? nameOfUser.get(userId) ?? userId.slice(0, 8);
        return `${name} (${profile?.factionId?.replace(/^faction-/, '') ?? 'no empire'})`;
    };

    const rows = new Map<string, PlayerRow>();
    const row = (userId: string) => {
        if (!rows.has(userId)) rows.set(userId, emptyRow(labelOf(userId)));
        return rows.get(userId)!;
    };
    const tabsOpenedByAnyone = new Set<string>();
    const refusedEverywhere = new Map<string, number>();

    for (const event of events) {
        // Worker events carry the empire, not the account.
        const userId = event.userId ?? (event.factionId ? userOfFaction.get(event.factionId) : undefined);
        if (!userId) continue;
        const r = row(userId);
        const detail = parse(event.detail);
        r.days.add(event.at.toISOString().slice(0, 10));
        if (!r.lastSeen || event.at > r.lastSeen) r.lastSeen = event.at;

        switch (event.kind) {
            case 'session_start':
                r.sessions++;
                if (typeof detail.w === 'number' && detail.w < 900) r.smallScreen = true;
                break;
            case 'heartbeat': r.minutes++; break;
            case 'tab_opened': bump(r.tabs, String(detail.tab)); tabsOpenedByAnyone.add(String(detail.tab)); break;
            case 'overlay_opened': bump(r.overlays, String(detail.overlay)); break;
            case 'order_queued': bump(r.ordersQueued, String(detail.actionId)); break;
            case 'order_refused':
                bump(r.ordersRefused, `${detail.actionId}: ${String(detail.error).slice(0, 60)}`);
                bump(refusedEverywhere, String(detail.actionId));
                break;
            case 'order_failed':
                bump(r.ordersFailed, `${detail.actionId}: ${String(detail.reason).slice(0, 60)}`);
                bump(refusedEverywhere, String(detail.actionId));
                break;
            case 'client_error': bump(r.errors, String(detail.message).slice(0, 80)); break;
        }
    }

    console.log(`Telemetry — last ${days} day(s), ${events.length} event(s), ${rows.size} player(s)\n`);

    // Who played, and how much.
    const ordered = [...rows.values()].sort((a, b) => b.minutes - a.minutes);
    console.log('player                                   sessions  minutes  days  last seen');
    for (const r of ordered) {
        console.log(`${r.label.padEnd(40)} ${String(r.sessions).padStart(8)} ${String(r.minutes).padStart(8)} ${String(r.days.size).padStart(5)}  ${r.lastSeen ? ago(r.lastSeen) : '—'}${r.smallScreen ? '  (small screen)' : ''}`);
    }
    const claimedButSilent = profiles.filter(p => !rows.has(p.userId));
    if (claimedButSilent.length) {
        console.log(`\nClaimed an empire, not seen in ${days} day(s): ${claimedButSilent.map(p => p.displayName ?? p.factionId).join(', ')}`);
    }

    // What each did.
    for (const r of ordered) {
        const queued = [...r.ordersQueued.values()].reduce((s, n) => s + n, 0);
        const refused = [...r.ordersRefused.values()].reduce((s, n) => s + n, 0);
        const failed = [...r.ordersFailed.values()].reduce((s, n) => s + n, 0);
        console.log(`\n── ${r.label}`);
        console.log(`   panels:   ${top(r.tabs, 8)}`);
        console.log(`   overlays: ${top(r.overlays)}`);
        console.log(`   orders:   ${queued} given (${top(r.ordersQueued)})`);
        if (refused) console.log(`   refused:  ${refused} — ${top(r.ordersRefused, 3)}`);
        if (failed) console.log(`   failed in the worker: ${failed} — ${top(r.ordersFailed, 3)}`);
        if (r.errors.size) console.log(`   errors:   ${top(r.errors, 3)}`);
    }

    // The galaxy as a whole.
    console.log('\n── Everyone');
    const unopened = ALL_TABS.filter(t => !tabsOpenedByAnyone.has(t));
    console.log(`   panels nobody opened: ${unopened.join(', ') || 'none'}`);
    console.log(`   most refused orders:  ${top(refusedEverywhere)}`);
    const kinds = new Map<string, number>();
    for (const e of events) bump(kinds, e.kind);
    console.log(`   events by kind:       ${[...CLIENT_EVENT_KINDS, 'order_queued', 'order_failed'].map(k => `${k} ${kinds.get(k) ?? 0}`).join(', ')}`);
}

main()
    .catch(e => { console.error('telemetry-report failed:', e?.message ?? e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
