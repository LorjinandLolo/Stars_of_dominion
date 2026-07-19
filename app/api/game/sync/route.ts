// app/api/game/sync/route.ts
// Stars of Dominion — Game State Sync Endpoint (polling)
//
// Replaces the Appwrite Realtime subscriptions: the client polls this route
// (see hooks/useGameSync.ts) for the session snapshot + faction shards.
// Pass ?sessionSince=<ISO>&shardsSince=<ISO> to receive only what changed
// since the last poll — idle polls return a few bytes, not the whole world.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SESSION_DOC_ID = 'default-session';

export async function GET(req: NextRequest) {
    try {
        const sessionSince = req.nextUrl.searchParams.get('sessionSince');
        const shardsSince = req.nextUrl.searchParams.get('shardsSince');

        const [session, shards] = await Promise.all([
            prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } }),
            prisma.gameFactionShard.findMany(
                shardsSince ? { where: { updatedAt: { gt: new Date(shardsSince) } } } : undefined
            ),
        ]);

        if (!session) {
            return NextResponse.json(
                { error: 'No game session found. Start the worker (npm run worker) after seeding.' },
                { status: 404 }
            );
        }

        const sessionChanged = !sessionSince || session.updatedAt > new Date(sessionSince);

        return NextResponse.json({
            session: sessionChanged
                ? {
                      snapshot: session.snapshot,
                      lastTickAt: session.lastTickAt,
                      updatedAt: session.updatedAt.toISOString(),
                  }
                : null,
            sessionUpdatedAt: session.updatedAt.toISOString(),
            factions: shards.map(s => ({
                id: s.id,
                data: s.data,
                updatedAt: s.updatedAt.toISOString(),
            })),
        });
    } catch (err: any) {
        console.error('[API/game/sync]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
