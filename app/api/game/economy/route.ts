import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { getEconomyState } from '@/lib/economy/economy-service';
import { deserializeWorld, injectFactionShard } from '@/lib/persistence/save-service';

const SESSION_DOC_ID = 'default-session';

export async function GET(req: NextRequest) {
    try {
        // Load the worker's persisted world. The Next.js process singleton is a
        // different process from the game-loop worker, so reading it showed a
        // freshly built world instead of the simulated one.
        const [session, shards] = await Promise.all([
            prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } }),
            prisma.gameFactionShard.findMany(),
        ]);

        if (!session) {
            return NextResponse.json(
                { error: 'No game session found. Start the worker (npm run worker) after seeding.' },
                { status: 404 }
            );
        }

        const world = deserializeWorld(session.snapshot);

        // Faction economy records ride the per-faction shards, not the session doc.
        for (const shard of shards) {
            try {
                injectFactionShard(world, shard.data);
            } catch (e) {
                console.warn(`[API/game/economy] Skipping unreadable shard ${shard.id}`);
            }
        }

        // Use the requesting player's faction (falling back to Aurelian only if none was
        // supplied) so each player sees their own economy rather than a hardcoded one.
        const { searchParams } = new URL(req.url);
        const playerFactionId = searchParams.get('factionId') || 'faction-aurelian';

        const state = getEconomyState(world, playerFactionId);

        return NextResponse.json({
            success: true,
            ...state,
            playerFactionId
        }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game/economy] Failed to fetch economy state:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
