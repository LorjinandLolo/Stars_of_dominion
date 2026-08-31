// app/api/espionage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { generateRecruitPool } from '@/lib/espionage/agent-service';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';

// GET /api/espionage → returns agents + networks for the CALLER's faction.
// (Reads the Next-process singleton, which is largely un-simulated in the
// worker-backed deployment — but the access pattern must still be
// identity-from-session, never identity-from-query.)
export async function GET(req: NextRequest) {
    try {
        const { userId, factionId } = await resolveCallerFaction(req);
        if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        if (!factionId) return NextResponse.json({ agents: [], networks: [] });
        const world = getGameWorldState();
        const agents = Array.from(world.espionage.agents.values())
            .filter(a => a.ownerFactionId === factionId);
        const networks = Array.from(world.espionage.intelNetworks.values())
            .filter(n => n.ownerFactionId === factionId);
        return NextResponse.json({ agents, networks });
    } catch (error: any) {
        console.error('[API GET /espionage] Error:', error?.message ?? error);
        return NextResponse.json(
            { error: error?.message ?? 'Internal server error.' },
            { status: 500 }
        );
    }
}

// GET /api/espionage/recruits?factionId=xxx → returns recruit pool
export async function POST(req: NextRequest) {
    try {
        const { userId, factionId: callerFactionId } = await resolveCallerFaction(req);
        if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
        const factionId = callerFactionId || 'PLAYER_FACTION';
        const world = getGameWorldState();
        const recruits = generateRecruitPool(factionId, world.nowSeconds);
        return NextResponse.json(recruits);
    } catch (error: any) {
        console.error('[API POST /espionage] Error:', error?.message ?? error);
        return NextResponse.json(
            { error: error?.message ?? 'Internal server error.' },
            { status: 500 }
        );
    }
}
