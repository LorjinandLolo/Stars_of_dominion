import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getConstructionWorldState, getGameWorldState } from '@/lib/game-world-state-singleton';
import { getBuildingsForSystem } from '@/lib/construction/construction-service';
import { Planet } from '@/lib/construction/construction-types';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const systemId = searchParams.get('systemId');
        
        if (!systemId) {
            return NextResponse.json({ error: 'systemId is required' }, { status: 400 });
        }

        const state = getConstructionWorldState();
        const result = getBuildingsForSystem(systemId, state);
        
        const planets: Planet[] = [];
        for (const planet of state.planets.values()) {
            if (planet.systemId === systemId) {
                planets.push(planet);
            }
        }

        const spaceBuildQueue = getGameWorldState().construction.spaceBuildQueue.filter(q => q.systemId === systemId);

        return NextResponse.json({
            success: true,
            data: { 
                planets,
                buildings: result.buildings,
                queue: result.queue,
                spaceBuildQueue
            }
        }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game/construction] Failed to fetch construction data:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
