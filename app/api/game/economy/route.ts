import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getEconomyState } from '@/lib/economy/economy-service';
import { getGameWorldState } from '@/lib/game-world-state-singleton';

export async function GET(req: NextRequest) {
    try {
        const world = getGameWorldState();
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
