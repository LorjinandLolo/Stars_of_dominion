import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { getServerClients } from '@/lib/appwrite';
import { deserializeWorld } from '@/lib/persistence/save-service';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_SESSIONS = 'multiplayer_sessions';
const SESSION_DOC_ID = 'default-session';

export async function GET(req: NextRequest) {
    try {
        const { db } = await getServerClients();
        
        // 1. Fetch Authoritative Snapshot from DB
        const doc: any = await db.getDocument(DB_ID, COLL_SESSIONS, SESSION_DOC_ID);
        if (!doc || !doc.snapshot) {
            throw new Error('No active game session found in database.');
        }

        const world = deserializeWorld(doc.snapshot);
        
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
