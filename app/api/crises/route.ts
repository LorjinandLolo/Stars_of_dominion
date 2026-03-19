// app/api/crises/route.ts
// Stars of Dominion — Active Crises API Endpoint
// Returns all active crises for a faction; supports creating crises.

import { NextRequest, NextResponse } from 'next/server';
import { getActiveCrisesForFaction, createCrisis } from '@/lib/time/crisis-engine';
import type { CrisisType, CrisisResponseOption } from '@/lib/time/time-types';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const factionId = searchParams.get('factionId');
    if (!factionId) {
        return NextResponse.json({ error: 'factionId is required' }, { status: 400 });
    }
    const crises = getActiveCrisesForFaction(factionId);
    return NextResponse.json({ crises }, { status: 200 });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { attackerEmpireId, defenderEmpireId, targetId, targetType, crisisType, attackerPrediction } = body;

        if (!attackerEmpireId || !defenderEmpireId || !targetId || !crisisType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const crisis = createCrisis({
            attackerEmpireId,
            defenderEmpireId,
            targetId,
            targetType: targetType ?? 'system',
            crisisType: crisisType as CrisisType,
            attackerPrediction: attackerPrediction as CrisisResponseOption | undefined,
        });

        return NextResponse.json({ crisis }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
