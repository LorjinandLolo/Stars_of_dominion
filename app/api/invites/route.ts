// app/api/invites/route.ts
// Stars of Dominion — the signed-in player's friend links (casual-play Item 6a).
//
// GET   the caller's links.
// POST  mint a new one. Requires a claimed empire: a friend starts next to it.
//
// Session-gated: identity from the better-auth cookie, never the body.

import { NextRequest, NextResponse } from 'next/server';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { createInvite, listInvites } from '@/lib/invites/invite-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { userId } = await resolveCallerFaction(req);
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    try {
        return NextResponse.json({ invites: await listInvites(userId) });
    } catch (err: any) {
        console.error('[API/invites GET]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { userId } = await resolveCallerFaction(req);
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    try {
        const result = await createInvite(userId);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ invite: result.value });
    } catch (err: any) {
        console.error('[API/invites POST]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
