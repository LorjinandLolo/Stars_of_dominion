// app/api/espionage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { generateRecruitPool } from '@/lib/espionage/agent-service';

// GET /api/espionage?factionId=xxx  → returns agents + networks for a faction
export async function GET(req: NextRequest) {
    try {
        const factionId = req.nextUrl.searchParams.get('factionId') || 'PLAYER_FACTION';
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
        const body = await req.json();
        const factionId = body.factionId || 'PLAYER_FACTION';
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
