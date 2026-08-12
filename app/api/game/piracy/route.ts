// app/api/game/piracy/route.ts
// The underworld, as one faction is entitled to see it.
//
// This exists because a faction shard is NOT a private channel: /api/game/sync
// returns every shard to every caller, unauthenticated, since clients need each
// other's fleets to draw the galaxy. Shipping the per-faction pirate view in a
// shard therefore handed every player every rival's covert sponsorships, base
// locations and treasuries — the exact asymmetry the whole system runs on.
//
// So the projection is served here instead, keyed off the better-auth session
// and the caller's own faction claim. See docs/pirate-system/systems.md §8.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { applyPiracySnapshot, deserializeWorld } from '@/lib/persistence/save-service';
import { buildPirateDashboard, buildPirateView } from '@/lib/piracy/pirate-view';

const SESSION_DOC_ID = 'default-session';
const PIRACY_DOC_ID = 'default-session-piracy';

export async function GET(req: NextRequest) {
    try {
        // Identity comes from the session cookie, never from a query parameter —
        // otherwise this endpoint would be the leak it exists to close.
        const session = await auth.api.getSession({ headers: req.headers });
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        }

        const profile = await prisma.playerProfile.findUnique({ where: { userId } });
        if (!profile?.factionId) {
            return NextResponse.json({ error: 'No faction claimed.' }, { status: 403 });
        }

        const [sessionDoc, piracyDoc] = await Promise.all([
            prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID } }),
            prisma.multiplayerSession.findUnique({ where: { id: PIRACY_DOC_ID } }),
        ]);
        if (!sessionDoc) {
            return NextResponse.json({ error: 'No game session found.' }, { status: 404 });
        }

        // The shared snapshot is scrubbed of pirate state; the authoritative
        // copy lives in its own row that nothing else serves.
        const world = deserializeWorld(sessionDoc.snapshot);
        applyPiracySnapshot(world, piracyDoc?.snapshot);

        const played = [...world.piracy.organizations.values()]
            .find(org => org.playerFactionId === profile.factionId);

        return NextResponse.json({
            factionId: profile.factionId,
            view: buildPirateView(world, profile.factionId),
            dashboard: played ? buildPirateDashboard(world, played.id) : null,
            updatedAt: sessionDoc.updatedAt.toISOString(),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
