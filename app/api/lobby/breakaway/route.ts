// app/api/lobby/breakaway/route.ts
// Stars of Dominion — take the helm of a breakaway state (casual-play Item 7).
//
// GET   whether this account may take one, and which states are unled
// POST  { breakawayId? }  ask for one (a named state, or let the game pick or
//       raise one). The worker does the rest within a cycle; the lobby polls
//       /api/lobby/claim for the new claim.
//
// Session-gated: identity from the better-auth cookie, never the body.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requestBreakawaySeat, seatStatus } from '@/lib/breakaway/seat-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    try {
        return NextResponse.json(await seatStatus(userId));
    } catch (err: any) {
        console.error('[API/lobby/breakaway GET]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    try {
        const result = await requestBreakawaySeat({
            userId,
            displayName: (session?.user?.name || 'Commander').slice(0, 40),
            breakawayId: body?.breakawayId,
            underground: body?.underground === true,
            hiding: body?.hiding === true,
        });
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json({ queued: true }, { status: 202 });
    } catch (err: any) {
        console.error('[API/lobby/breakaway POST]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
