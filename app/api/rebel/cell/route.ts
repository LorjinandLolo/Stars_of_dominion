// app/api/rebel/cell/route.ts
// Stars of Dominion — what a person leading a cell from hiding sees (Item 13d).
//
// GET → { held: false }                 the caller leads no movement underground
//       { held: true, view | null }     the cell as its leader sees it (null until
//                                       the worker has written the first view)
//       { held: false, risen: true }    the movement is a state now: play it
//
// Identity from the session cookie, never a parameter. The cell lives whole in
// its HOST's shard (the host's own wire copy has the seat scrubbed out), so
// this route reads that row server-side and returns only the seat's view.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { isUndergroundSeatId } from '@/lib/rebellion/rebellion-types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { userId, factionId } = await resolveCallerFaction(req);
        if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        if (!isUndergroundSeatId(factionId)) return NextResponse.json({ held: false });

        // The state exists once fission has made it under this very id.
        const state = await prisma.gameFactionShard.findFirst({ where: { factionId }, select: { id: true } });
        if (state) return NextResponse.json({ held: false, risen: true });

        // Only the host shard naming this seat is parsed.
        const rows = await prisma.gameFactionShard.findMany({
            where: { data: { contains: factionId } },
            select: { data: true },
        });
        for (const row of rows) {
            let shard: any;
            try { shard = JSON.parse(row.data); } catch { continue; }
            const cell = (shard?.rebelCells ?? []).find((c: any) => c?.seat?.factionId === factionId);
            if (cell) return NextResponse.json({ held: true, view: cell.seatView ?? null });
        }
        // Claimed, but the worker has not seated it yet (or the cell is gone).
        return NextResponse.json({ held: true, view: null });
    } catch (err: any) {
        console.error('[API/rebel/cell]', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
