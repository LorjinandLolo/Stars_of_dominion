// app/api/notifications/route.ts
// Stars of Dominion — Notification Polling Endpoint
// Clients poll this endpoint to pick up new server-side notifications.
//
// This route used to take the faction from `?factionId=` and no session, so
// any caller, signed in or not, could read AND DRAIN another faction's queue:
// the rival never saw their own battle reports. With no factionId at all it
// drained every faction's queue at once. Identity now comes from the session
// cookie, the same way /api/game/sync resolves it; the query parameter is
// ignored.

import { NextRequest, NextResponse } from 'next/server';
import { drainNotifications, peekNotifications } from '@/lib/time/notification-hooks';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { userId, factionId } = await resolveCallerFaction(req);
    if (!userId) {
        return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    // Signed in but no faction claimed yet (the lobby): nothing is addressed
    // to them. Never fall through to drainNotifications(undefined), which
    // matches every faction.
    if (!factionId) {
        return NextResponse.json({ notifications: [] }, { status: 200 });
    }

    const drain = req.nextUrl.searchParams.get('drain') !== 'false'; // default: drain
    const notifications = drain
        ? drainNotifications(factionId)
        : peekNotifications(factionId);

    return NextResponse.json({ notifications }, { status: 200 });
}
