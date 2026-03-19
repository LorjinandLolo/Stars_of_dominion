// app/api/notifications/route.ts
// Stars of Dominion — Notification Polling Endpoint
// Clients poll this endpoint to pick up new server-side notifications.

import { NextRequest, NextResponse } from 'next/server';
import { drainNotifications, peekNotifications } from '@/lib/time/notification-hooks';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const factionId = searchParams.get('factionId') ?? undefined;
    const drain     = searchParams.get('drain') !== 'false'; // default: drain

    const notifications = drain
        ? drainNotifications(factionId)
        : peekNotifications(factionId);

    return NextResponse.json({ notifications }, { status: 200 });
}
