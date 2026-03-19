// app/api/tick/route.ts
// Stars of Dominion — Strategic Tick API Endpoint
// Called by external cron (or Appwrite scheduled function) every 6 hours.
// Protected by CRON_SECRET header.

import { NextRequest, NextResponse } from 'next/server';
import { tryRunStrategicTick } from '@/lib/time/tick-scheduler';

export async function POST(req: NextRequest) {
    const secret  = req.headers.get('x-cron-secret');
    const allowed = process.env.CRON_SECRET;

    if (allowed && secret !== allowed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await tryRunStrategicTick();
        return NextResponse.json(result, { status: 200 });
    } catch (err: any) {
        console.error('[API/tick] Tick failed:', err);
        return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
    }
}

// Allow public GET to query current tick state (safe, no writes)
export async function GET() {
    const { getCurrentTickState } = await import('@/lib/time/tick-scheduler');
    return NextResponse.json(getCurrentTickState(), { status: 200 });
}
