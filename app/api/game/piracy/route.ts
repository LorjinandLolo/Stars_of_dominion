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

// One deserialize, shared by every caller.
//
// deserializeWorld over the ~1.2 MB snapshot ran once per REQUEST — every 15 s
// per open tab — and built a world that is identical for all of them. Only
// buildPirateView and buildPirateDashboard below are per-faction, so this is
// keyed on the two rows' timestamps and NOT on the faction. The promise is
// cached rather than the world, so simultaneous misses still deserialize once.
//
// This holds only while the request path stays read-only: anything here that
// mutates `world` mutates it for every other caller. Project, never write.
let worldKey = '';
let worldBuild: Promise<any> | null = null;

async function pirateWorld(key: string): Promise<any> {
    if (worldBuild && worldKey === key) return worldBuild;
    const build = (async () => {
        const [sessionDoc, piracyDoc] = await Promise.all([
            prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID }, select: { snapshot: true } }),
            prisma.multiplayerSession.findUnique({ where: { id: PIRACY_DOC_ID }, select: { snapshot: true } }),
        ]);
        if (!sessionDoc) throw new Error('No game session found.');
        // The shared snapshot is scrubbed of pirate state; the authoritative
        // copy lives in its own row that nothing else serves.
        const world = deserializeWorld(sessionDoc.snapshot);
        applyPiracySnapshot(world, piracyDoc?.snapshot);
        return world;
    })();
    worldKey = key;
    worldBuild = build;
    // A failed build must not be remembered as the state of that key.
    build.catch(() => {
        if (worldBuild === build) { worldBuild = null; worldKey = ''; }
    });
    return build;
}

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

        const [sessionMeta, piracyMeta] = await Promise.all([
            prisma.multiplayerSession.findUnique({ where: { id: SESSION_DOC_ID }, select: { updatedAt: true } }),
            prisma.multiplayerSession.findUnique({ where: { id: PIRACY_DOC_ID }, select: { updatedAt: true } }),
        ]);
        if (!sessionMeta) {
            return NextResponse.json({ error: 'No game session found.' }, { status: 404 });
        }

        // Both rows key the cache: the pirate aggregate is saved to its own
        // row, so a pirate-only write has to invalidate as well.
        const world = await pirateWorld(
            `${sessionMeta.updatedAt.getTime()}:${piracyMeta?.updatedAt.getTime() ?? 0}`
        );

        const played = [...world.piracy.organizations.values()]
            .find(org => org.playerFactionId === profile.factionId);

        return NextResponse.json({
            factionId: profile.factionId,
            view: buildPirateView(world, profile.factionId),
            dashboard: played ? buildPirateDashboard(world, played.id) : null,
            updatedAt: sessionMeta.updatedAt.toISOString(),
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
