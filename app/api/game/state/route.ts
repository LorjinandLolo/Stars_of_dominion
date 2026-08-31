import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { deserializeWorld } from '@/lib/persistence/save-service';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';

const SESSION_DOC_ID = 'default-session';

export async function GET(req: NextRequest) {
    try {
        // Identity from the session cookie — this route used to return any
        // faction's complete fleet list AND its private fog-of-war map for a
        // client-supplied ?factionId=.
        const { userId, factionId } = await resolveCallerFaction(req);
        if (!userId) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }

        // 1. Fetch Authoritative Snapshot from DB
        const doc = await prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } });
        if (!doc || !doc.snapshot) {
            throw new Error('No active game session found in database.');
        }

        const world = deserializeWorld(doc.snapshot);

        const visibility = factionId ? world.movement.factionVisibility.get(factionId) : null;

        // Fail closed: a caller with no faction claim sees no fleets at all —
        // the unfiltered list was the whole vulnerability.
        let fleets = Array.from(world.movement.fleets.values());
        if (factionId) {
            fleets = fleets.filter(f => {
                if (f.factionId === factionId) return true;
                const sysId = f.currentSystemId || f.destinationSystemId;
                if (!sysId) return false;
                const entry = visibility?.[sysId];
                return !!entry && (entry.revealStage === 'scanned' || entry.revealStage === 'surveyed');
            });
        } else {
            fleets = [];
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
