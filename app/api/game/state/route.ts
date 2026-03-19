import { NextRequest, NextResponse } from 'next/server';
import { getGameWorldState } from '@/lib/game-world-state-singleton';

export async function GET(req: NextRequest) {
    try {
        const world = getGameWorldState();
        
        // We can optionally filter fleets by factionId if provided
        const { searchParams } = new URL(req.url);
        const factionId = searchParams.get('factionId');
        
        let fleets = Array.from(world.movement.fleets.values());
        if (factionId) {
            // In a real implementation, you might only see your own fleets + detected ones
            // For now, we return all or filter by owner
            // fleets = fleets.filter(f => f.factionId === factionId);
        }

        return NextResponse.json({
            nowSeconds: world.nowSeconds,
            fleets: fleets
        }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game/state] Failed to fetch state:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
