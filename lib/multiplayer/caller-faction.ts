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

import { headers as nextHeaders } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export interface CallerIdentity {
    /** better-auth user id, or null when the request carries no valid session. */
    userId: string | null;
    /** The faction this user has claimed, or null when they have claimed none. */
    factionId: string | null;
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
        if (!userId) return { userId: null, factionId: null };

        const profile = await prisma.playerProfile.findUnique({ where: { userId } });
        return { userId, factionId: profile?.factionId ?? null };
    } catch {
        return { userId: null, factionId: null };
    }
}
