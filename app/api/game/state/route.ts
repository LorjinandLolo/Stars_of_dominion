import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getGameWorldState } from '@/lib/game-world-state-singleton';

export async function GET(req: NextRequest) {
    try {
        const world = getGameWorldState();
        
        // We can optionally filter fleets by factionId if provided
        const { searchParams } = new URL(req.url);
        const factionId = searchParams.get('factionId');
        
        let fleets = Array.from(world.movement.fleets.values());
        const visibility = factionId ? world.movement.factionVisibility.get(factionId) : null;

        if (factionId && visibility) {
            // Filter fleets: Always see own, see Others if system is scanned/surveyed
            fleets = fleets.filter(f => {
                if (f.factionId === factionId) return true;
                const sysId = f.currentSystemId || f.destinationSystemId;
                if (!sysId) return false;
                const entry = visibility[sysId];
                return entry && (entry.revealStage === 'scanned' || entry.revealStage === 'surveyed');
            });
        }

        return NextResponse.json({
            nowSeconds: world.nowSeconds,
            fleets: fleets,
            visibility: visibility,
            leadership: {
                leaders: Object.fromEntries(world.leadership.leaders),
                recruitmentPool: world.leadership.recruitmentPool,
                nowSeconds: world.leadership.nowSeconds
            }
        }, { status: 200 });


    } catch (err: any) {
        console.error('[API/game/state] Failed to fetch state:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
