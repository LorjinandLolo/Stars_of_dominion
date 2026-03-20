import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getEconomyState } from '@/lib/economy/economy-service';
import { getGameWorldState } from '@/lib/game-world-state-singleton';

export async function GET(req: NextRequest) {
    try {
        const world = getGameWorldState();
        // Assume player faction for now or get from params if needed
        const playerFactionId = 'faction-aurelian'; 
        
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
