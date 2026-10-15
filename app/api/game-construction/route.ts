import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { buildConstructionView } from '@/lib/construction/construction-view';

/**
 * The construction view of one system (lib/construction/construction-view.ts).
 *
 * NOTE: this reads the Next server's world singleton, which is NOT the live
 * game — nothing loads the worker's world into it. The construction panel no
 * longer calls this route; it builds the same view from the world the client
 * already syncs. Kept for debugging tools that expect the shape.
 */
export async function GET(req: NextRequest) {
    try {
        const systemId = new URL(req.url).searchParams.get('systemId');
        if (!systemId) {
            return NextResponse.json({ error: 'systemId is required' }, { status: 400 });
        }
        return NextResponse.json({ success: true, data: buildConstructionView(getGameWorldState(), systemId) }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game-construction] Failed to fetch construction data:', err);
        return NextResponse.json({ success: false, error: err.message || 'Internal error' }, { status: 500 });
    }
}
