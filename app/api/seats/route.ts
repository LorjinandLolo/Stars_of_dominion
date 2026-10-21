// app/api/seats/route.ts
// Stars of Dominion — cabinet seats held by friends (lib/government/seat-scope.ts).
//
// GET     the caller's own seat (if any) and, for a ruler, the seats in their
//         court: who holds which portfolio, by persona. Never user ids.
// POST    { actAs: factionId } — an account that both rules an empire and
//         holds a seat elsewhere picks which court it is in (the sod-act-as
//         cookie, validated by lib/multiplayer/caller-faction on every read).
// DELETE  give up the caller's own seat. A ruler dismisses a minister with
//         the GOV_DISMISS_MINISTER order instead (it costs political capital
//         and the worker clears the row).
//
// Identity from the session cookie only.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveCallerFaction, ACT_AS_COOKIE } from '@/lib/multiplayer/caller-faction';
import { lobbyFactionById } from '@/data/factions/lobby-factions';

export const dynamic = 'force-dynamic';

function empireName(factionId: string): string {
    return lobbyFactionById(factionId)?.name ?? factionId.replace(/^faction-/, '');
}

export async function GET(req: NextRequest) {
    const caller = await resolveCallerFaction(req);
    if (!caller.userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    try {
        const court = caller.ownFactionId
            ? await prisma.factionSeat.findMany({ where: { factionId: caller.ownFactionId }, select: { id: true, portfolio: true, persona: true, exposed: true, createdAt: true } })
            : [];
        return NextResponse.json({
            role: caller.role,
            actingFactionId: caller.factionId,
            ownFactionId: caller.ownFactionId,
            seat: caller.seat ? { ...caller.seat, empireName: empireName(caller.seat.factionId) } : null,
            court: court.map(s => ({ id: s.id, portfolio: s.portfolio, persona: s.persona, exposed: s.exposed, since: s.createdAt.toISOString() })),
        });
    } catch (err: any) {
        console.error('[API/seats GET]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const caller = await resolveCallerFaction(req);
    if (!caller.userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body = act as own empire */ }
    const actAs = typeof body?.actAs === 'string' ? body.actAs : null;
    const allowed = actAs === null || actAs === caller.ownFactionId || actAs === caller.seat?.factionId;
    if (!allowed) return NextResponse.json({ error: 'You hold no place in that court.' }, { status: 403 });
    const res = NextResponse.json({ ok: true, actingFactionId: actAs ?? caller.ownFactionId ?? caller.seat?.factionId ?? null });
    if (actAs) res.cookies.set(ACT_AS_COOKIE, actAs, { path: '/', sameSite: 'lax', httpOnly: true, maxAge: 30 * 24 * 3600 });
    else res.cookies.set(ACT_AS_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
}

export async function DELETE(req: NextRequest) {
    const caller = await resolveCallerFaction(req);
    if (!caller.userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    try {
        const { count } = await prisma.factionSeat.deleteMany({ where: { userId: caller.userId } });
        const res = NextResponse.json({ ok: true, released: count > 0 });
        res.cookies.set(ACT_AS_COOKIE, '', { path: '/', maxAge: 0 });
        return res;
    } catch (err: any) {
        console.error('[API/seats DELETE]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
