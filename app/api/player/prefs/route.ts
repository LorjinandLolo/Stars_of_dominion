// app/api/player/prefs/route.ts
// Stars of Dominion — the signed-in player's interface preferences.
//
// GET   returns them (defaults for a new account).
// PATCH { showEverything?, opened? } updates them.
//
// Identity from the session cookie only (lib/multiplayer/caller-faction). The
// record is the caller's PlayerProfile row; a caller without a claim has no
// dock to configure and gets the defaults back.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { applyUiPrefsPatch, defaultUiPrefs, parseUiPrefs, type UiPrefsPatch } from '@/lib/player/ui-prefs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { userId } = await resolveCallerFaction(req);
        if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

        const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { uiPrefs: true } });
        return NextResponse.json({ prefs: profile ? parseUiPrefs(profile.uiPrefs) : defaultUiPrefs() });
    } catch (err: any) {
        console.error('[API/player/prefs] read failed:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const { userId } = await resolveCallerFaction(req);
        if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

        let body: UiPrefsPatch;
        try { body = await req.json(); } catch { return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 }); }

        const profile = await prisma.playerProfile.findUnique({ where: { userId }, select: { uiPrefs: true } });
        if (!profile) return NextResponse.json({ error: 'Claim a faction first.' }, { status: 409 });

        const next = applyUiPrefsPatch(parseUiPrefs(profile.uiPrefs), {
            showEverything: body?.showEverything,
            opened: Array.isArray(body?.opened) ? body.opened : undefined,
        });
        await prisma.playerProfile.update({ where: { userId }, data: { uiPrefs: JSON.stringify(next) } });
        return NextResponse.json({ prefs: next });
    } catch (err: any) {
        console.error('[API/player/prefs] write failed:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
