// app/api/telemetry/route.ts
// Stars of Dominion — where the browser reports how the game is being played.
//
// POST { events: [{ kind, detail?, ageMs? }] }  → 204, always.
//
// Identity comes from the better-auth session cookie, never from the body. A
// request without a session is accepted and thrown away: the recorder runs
// on every game page and must never turn a signed-out tab into an error.
// What may be stored is decided by lib/telemetry/telemetry-rules.ts.
//
// navigator.sendBeacon posts here when a tab is closed, so the body may arrive
// as text/plain; it is parsed as JSON either way.

import { NextRequest } from 'next/server';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { sanitizeReport, telemetryEnabled } from '@/lib/telemetry/telemetry-rules';
import { storeReportedEvents } from '@/lib/telemetry/telemetry-store';

export const dynamic = 'force-dynamic';

/** Events one account may store per minute. A well-behaved tab sends a handful. */
const EVENTS_PER_MINUTE = 120;
const recent = new Map<string, { since: number; count: number }>();

function allow(userId: string, count: number): number {
    const now = Date.now();
    const slot = recent.get(userId);
    if (!slot || now - slot.since > 60_000) {
        recent.set(userId, { since: now, count: 0 });
    }
    const current = recent.get(userId)!;
    const room = Math.max(0, EVENTS_PER_MINUTE - current.count);
    const granted = Math.min(room, count);
    current.count += granted;
    if (recent.size > 1000) {
        for (const [key, value] of recent) if (now - value.since > 60_000) recent.delete(key);
    }
    return granted;
}

const NO_CONTENT = () => new Response(null, { status: 204 });

export async function POST(req: NextRequest) {
    if (!telemetryEnabled(process.env)) return NO_CONTENT();

    let body: unknown = null;
    try { body = JSON.parse(await req.text()); } catch { return NO_CONTENT(); }

    const caller = await resolveCallerFaction(req);
    if (!caller.userId) return NO_CONTENT();

    const events = sanitizeReport(body, new Date());
    const granted = allow(caller.userId, events.length);
    if (granted > 0) await storeReportedEvents(caller.userId, caller.factionId, events.slice(0, granted));
    return NO_CONTENT();
}
