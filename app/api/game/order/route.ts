// app/api/game/order/route.ts
// Stars of Dominion — Player Order Endpoint
//
// Thin HTTP wrapper around lib/multiplayer/order-queue.ts, which owns ALL
// validation, faction-ownership checks, and cost deduction (shared with the
// Server Action path so neither can be bypassed).

import { NextRequest, NextResponse } from 'next/server';
import { queueOrder } from '@/lib/multiplayer/order-queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { actionId, payload, factionId } = body;

        // Caller identity comes from the better-auth session cookie,
        // resolved inside queueOrder.
        const result = await queueOrder({
            actionId,
            payload: payload ?? {},
            factionId,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
        }

        return NextResponse.json(
            { success: true, orderId: result.orderId, message: 'Order dispatched successfully.' },
            { status: 200 }
        );
    } catch (err: any) {
        console.error('[API/game/order] Failed to push order:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
