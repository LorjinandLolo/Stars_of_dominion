// app/api/messages/route.ts
// Stars of Dominion — send a message to another player's empire (Item 6c).
//
// POST { toFactionId, body }   one per recipient per Galactic Day, 280 chars.
//
// The sender is the session's claimant, from the better-auth cookie. A body
// may name `fromFactionId`, and if it names anything but the caller's own
// empire the request is refused: 401 without a session, 403 for a signed-in
// account that holds no empire or asks to speak for someone else's.
//
// There is no GET. Messages reach both ends through the empire's private
// shard (the worker copies them in, /api/game/sync serves a shard whole only
// to its owner), so there is one place where "who may read this" is decided.

import { NextRequest, NextResponse } from 'next/server';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { senderStatus } from '@/lib/messages/message-rules';
import { sendMessage } from '@/lib/messages/message-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const caller = await resolveCallerFaction(req);

    let payload: any = null;
    try { payload = await req.json(); } catch { payload = null; }

    const status = senderStatus(caller, payload?.fromFactionId);
    if (status === 401) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    if (status === 403) {
        return NextResponse.json({ error: 'Only the player who holds an empire can send its messages.' }, { status: 403 });
    }
    if (!payload || typeof payload !== 'object') {
        return NextResponse.json({ error: 'Expected { toFactionId, body }.' }, { status: 400 });
    }

    try {
        const result = await sendMessage({
            userId: caller.userId!,
            fromFactionId: caller.factionId!,
            toFactionId: payload.toFactionId,
            body: payload.body,
        });
        if (!result.ok) {
            return NextResponse.json({ error: result.error, nextAt: result.nextAt ?? null }, { status: result.status });
        }
        return NextResponse.json({ message: result.message });
    } catch (err: any) {
        console.error('[API/messages POST]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
