// app/api/game/brief/route.ts
// Stars of Dominion — the daily brief.
//
// GET  returns the brief for the signed-in player's faction: what happened
//      since they last closed one, what is waiting on their answer, and the one
//      move worth making. POST marks it seen, which starts the next window.
//
// Identity comes from the session cookie only (lib/multiplayer/caller-faction),
// never a query parameter: the brief carries the faction's own private state.
// Everything this route reads, it hands to a pure projection
// (lib/brief/daily-brief.ts) — the shaping is tested without a database.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { deserializeWorld, injectFactionShard } from '@/lib/persistence/save-service';
import { buildDailyBrief, type BriefChronicleRow, type BriefHeadlineRow } from '@/lib/brief/daily-brief';

export const dynamic = 'force-dynamic';

const SESSION_DOC_ID = 'default-session';
/** A player away for a month is told about the last week, not the whole season. */
const MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;
const MAX_CHRONICLE_ROWS = 60;

export async function GET(req: NextRequest) {
    try {
        const { userId, factionId } = await resolveCallerFaction(req);
        if (!userId) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }
        // Signed in but still in the lobby: nothing to brief.
        if (!factionId) {
            return NextResponse.json({ brief: null }, { status: 200 });
        }

        const now = new Date();
        const profile = await prisma.playerProfile.findUnique({
            where: { factionId },
            select: { briefSeenAt: true },
        });

        const floor = new Date(now.getTime() - MAX_WINDOW_MS);
        const lastSeenAt = profile?.briefSeenAt ?? null;
        const since = lastSeenAt && lastSeenAt > floor ? lastSeenAt : floor;

        const [sessionDoc, shardRow, chronicleRows, articleRows] = await Promise.all([
            prisma.multiplayerSession.findUnique({
                where: { id: SESSION_DOC_ID },
                select: { snapshot: true },
            }),
            // The shard table keys on its own id, not the faction — one row per
            // faction all the same, so the first match is the row.
            prisma.gameFactionShard.findFirst({ where: { factionId } }).catch(() => null),
            // JSON-bearing columns are TEXT, so membership is a substring test.
            // Rows this faction had no part in are dropped by the projection
            // anyway; this only keeps the query from reading the whole table.
            prisma.chronicleEvent.findMany({
                where: {
                    createdAt: { gte: since },
                    OR: [
                        { actorIds: { contains: factionId } },
                        { targetIds: { contains: factionId } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: MAX_CHRONICLE_ROWS,
            }),
            prisma.narrativeArticle.findMany({
                where: { createdAt: { gte: since } },
                orderBy: { createdAt: 'desc' },
                take: 40,
            }),
        ]);

        if (!sessionDoc?.snapshot) {
            return NextResponse.json(
                { error: 'No game session found. Start the worker (npm run worker) after seeding.' },
                { status: 404 },
            );
        }

        const world = deserializeWorld(sessionDoc.snapshot);
        // The player's own shard: fleets, economy record (with the worker's
        // notes), charts. Without it the brief would see the public world only.
        if (shardRow?.data) {
            try { injectFactionShard(world, shardRow.data); }
            catch (e) { console.warn('[API/game/brief] shard injection failed:', e); }
        }

        const faction: any = world.economy.factions.get(factionId) ?? null;

        const brief = buildDailyBrief({
            factionId,
            world,
            faction,
            notifications: Array.isArray(faction?.pendingNotifications) ? faction.pendingNotifications : [],
            chronicle: chronicleRows as unknown as BriefChronicleRow[],
            headlines: articleRows as unknown as BriefHeadlineRow[],
            lastSeenAt,
            now,
            // Who plays which empire (Item 6b), from the claims table: the
            // lobby's own public roster, display names only.
            players: Object.fromEntries(
                (await prisma.playerProfile.findMany({ select: { factionId: true, displayName: true } }))
                    .map(p => [p.factionId, p.displayName || 'Commander']),
            ),
        });

        return NextResponse.json({ brief }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game/brief] Failed to build brief:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

/** Mark the brief seen. The next one covers the time from this moment on. */
export async function POST(req: NextRequest) {
    try {
        const { userId, factionId } = await resolveCallerFaction(req);
        if (!userId) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }
        if (!factionId) {
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        const seenAt = new Date();
        await prisma.playerProfile.update({
            where: { factionId },
            data: { briefSeenAt: seenAt },
        });
        return NextResponse.json({ ok: true, seenAt: seenAt.toISOString() }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game/brief] Failed to mark seen:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

