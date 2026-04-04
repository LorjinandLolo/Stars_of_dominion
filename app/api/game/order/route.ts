import { NextRequest, NextResponse } from 'next/server';
import { Client, Databases, ID } from 'node-appwrite';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { actionId, payload, factionId } = body;

        if (!actionId || !factionId) {
            return NextResponse.json({ error: 'Missing required order fields.' }, { status: 400 });
        }

        const client = new Client()
            .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
            .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT || '')
            .setKey(process.env.APPWRITE_API_KEY || '');

        const db = new Databases(client);

        const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
        const COLL_ORDERS = 'game_orders';

        // Push order to queue
        await db.createDocument(DB_ID, COLL_ORDERS, ID.unique(), {
            actionId,
            factionId,
            payload: JSON.stringify(payload),
            processed: false,
            timestamp: Date.now()
        });

        return NextResponse.json({ success: true, message: 'Order dispatched successfully.' }, { status: 200 });
    } catch (err: any) {
        console.error('[API/game/order] Failed to push order:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
