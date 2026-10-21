// lib/multiplayer/caller-faction.ts
// Who is asking, and which faction do they speak for?
//
// Three places used to answer this independently — the piracy route resolved it
// from the session, the order queue verified a client-supplied id, and the lobby
// did its own profile lookups — with different shapes and different failure
// semantics. Anything that gates private state now goes through here.
//
// The identity NEVER comes from a query parameter or a request body. That is the
// whole point: a `?factionId=` endpoint is an authorization hole wearing a
// filter's clothing, and several routes in this app still have one.
//
// Since the cabinet seats (lib/government/seat-scope.ts) an account can speak
// for a faction in two ways: as its ruler (PlayerProfile) or as a seated
// minister (FactionSeat). An account that holds both picks which court it is
// in with the `sod-act-as` cookie, set by /api/seats/act and validated here
// against what the account actually holds — the cookie can choose between the
// two, never name a third.

import { headers as nextHeaders } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const ACT_AS_COOKIE = 'sod-act-as';

export interface CallerSeat {
    id: string;
    factionId: string;
    portfolio: string;
    persona: string;
}

export interface CallerIdentity {
    /** better-auth user id, or null when the request carries no valid session. */
    userId: string | null;
    /** The faction this user speaks for right now, or null when they have none. */
    factionId: string | null;
    /** How they speak for it. 'ruler' is the claim; 'minister' is a seat. Null with no faction. */
    role: 'ruler' | 'minister' | null;
    /** The empire this account RULES, whatever court it is acting in. */
    ownFactionId: string | null;
    /** The seat this account holds, whatever court it is acting in. */
    seat: CallerSeat | null;
}

const ANON: CallerIdentity = { userId: null, factionId: null, role: null, ownFactionId: null, seat: null };

function cookieValue(hdrs: Headers, name: string): string | null {
    const raw = hdrs.get('cookie');
    if (!raw) return null;
    for (const part of raw.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('='));
    }
    return null;
}

/**
 * Resolve the caller from the better-auth session cookie.
 *
 * `req` is optional: pass it in a route handler (cheapest path), omit it in a
 * Server Action, where next/headers supplies the same cookies.
 *
 * Fails CLOSED — any error resolves to an anonymous caller. Callers that need
 * to stay available during a DB hiccup must decide that for themselves; this
 * function will not hand out an identity it could not verify.
 */
export async function resolveCallerFaction(req?: { headers: Headers }): Promise<CallerIdentity> {
    try {
        const hdrs = req?.headers ?? (await nextHeaders());
        const session = await auth.api.getSession({ headers: hdrs });
        const userId = session?.user?.id ?? null;
        if (!userId) return ANON;

        const [profile, seatRow] = await Promise.all([
            prisma.playerProfile.findUnique({ where: { userId } }),
            prisma.factionSeat.findUnique({ where: { userId } }).catch(() => null),
        ]);
        const ownFactionId = profile?.factionId ?? null;
        const seat: CallerSeat | null = seatRow
            ? { id: seatRow.id, factionId: seatRow.factionId, portfolio: seatRow.portfolio, persona: seatRow.persona }
            : null;

        // Which court? The ruler's own by default; the seat when that is all
        // they hold, or when they asked for it and actually hold it.
        const wanted = cookieValue(hdrs, ACT_AS_COOKIE);
        const actAsSeat = !!seat && (!ownFactionId || wanted === seat.factionId);
        if (actAsSeat) {
            return { userId, factionId: seat!.factionId, role: 'minister', ownFactionId, seat };
        }
        if (ownFactionId) return { userId, factionId: ownFactionId, role: 'ruler', ownFactionId, seat };
        return { userId, factionId: null, role: null, ownFactionId: null, seat: null };
    } catch {
        return ANON;
    }
}
