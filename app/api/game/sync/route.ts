// app/api/game/sync/route.ts
// Stars of Dominion — Game State Sync Endpoint (polling)
//
// Replaces the Appwrite Realtime subscriptions: the client polls this route
// (see hooks/useGameSync.ts) for the session snapshot + faction shards.
// Pass ?sessionSince=<ISO>&shardsSince=<ISO> to receive only what changed
// since the last poll — idle polls return a few bytes, not the whole world.
//
// This route used to take no session and apply no owner predicate: it returned
// every faction's shard, verbatim, to any caller including an unauthenticated
// curl. Since a shard carries espionage agents, intel networks, active
// operations with their attribution state, and the opportunity board, every
// player held every rival's covert position — and the espionage system's whole
// premise is that they do not.
//
// It is now session-gated, and each row is projected for the caller:
// the caller's own shard comes through scrubOwnerSecrets, everyone else's
// through projectPublicShard. See lib/persistence/shard-privacy.ts for why the
// split happens here rather than in extractFactionShard.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { projectShardForCaller, viewerContextFromOwnShard } from '@/lib/persistence/shard-privacy';

export const dynamic = 'force-dynamic';

const SESSION_DOC_ID = 'default-session';

export async function GET(req: NextRequest) {
    try {
        // Identity from the session cookie, never from a query parameter.
        // A caller with a session but no claim is legitimate — that is a player
        // sitting in the lobby — and simply owns no shard, so every row they
        // receive is the public projection.
        const { userId, factionId } = await resolveCallerFaction(req);
        if (!userId) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }

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

        // The caller's own shard carries their fog map (`visibility`) and fleet
        // positions — the ViewerContext every RIVAL shard's fleet list is
        // filtered against. A delta poll may not include the caller's row (it
        // only returns rows changed since shardsSince), so fetch it explicitly:
        // serving rivals unfiltered because the caller's own shard happened to
        // be quiet would reopen the un-fogged-fleets hole on most polls.
        let viewer = undefined;
        if (factionId) {
            const ownRow = shards.find(s => s.factionId === factionId)
                ?? await prisma.gameFactionShard.findUnique({ where: { id: factionId } });
            viewer = viewerContextFromOwnShard(ownRow?.data);
        }

        return NextResponse.json({
            session: sessionChanged
                ? {
                      snapshot: session.snapshot,
                      updatedAt: session.updatedAt.toISOString(),
                  }
                : null,
            sessionUpdatedAt: session.updatedAt.toISOString(),
            factions: shards.map(s => ({
                id: s.id,
                data: projectShardForCaller(s.data, !!factionId && s.factionId === factionId, viewer),
                updatedAt: s.updatedAt.toISOString(),
            })),
        });
    } catch (err: any) {
        console.error('[API/game/sync]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
