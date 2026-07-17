// lib/multiplayer/order-client.ts
// Stars of Dominion — Client-Side Order Dispatcher
//
// The one function UI components should call to issue a player order.
// Flow:
//   1. Register a PendingOrder in the store (HUD chip appears instantly).
//   2. Apply the optimistic overlay to the currently rendered lists
//      (fleet arrows / build queues update in the same frame as the click).
//   3. POST to /api/game/order (with an Appwrite JWT when available, so the
//      server can verify faction ownership).
//   4. On ack: mark 'queued'. On rejection/network error: mark 'failed' —
//      the overlay is dropped on the next sync pass.
//
// Reconciliation with authoritative snapshots happens in useGameSync, which
// re-applies overlays after every world rebuild and prunes confirmed orders.

'use client';

import { useUIStore, type PendingOrder } from '@/lib/store/ui-store';
import { applyPendingOrderOverlays, describeOrder } from '@/lib/multiplayer/optimistic';
import { getBrowserClients } from '@/lib/appwrite-browser';

// ─── JWT cache (Appwrite JWTs are valid 15 min; refresh at 10) ───────────────
let jwtCache: { token: string; fetchedAt: number } | null = null;
const JWT_TTL_MS = 10 * 60 * 1000;

async function getJwt(): Promise<string | null> {
    try {
        if (jwtCache && Date.now() - jwtCache.fetchedAt < JWT_TTL_MS) {
            return jwtCache.token;
        }
        const { account } = getBrowserClients();
        const res: any = await account.createJWT();
        if (res?.jwt) {
            jwtCache = { token: res.jwt, fetchedAt: Date.now() };
            return res.jwt;
        }
        return null;
    } catch {
        return null; // anonymous/dev session — server falls back to claim check
    }
}

let userIdCache: { id: string; fetchedAt: number } | null = null;

async function getUserId(): Promise<string | null> {
    try {
        if (userIdCache && Date.now() - userIdCache.fetchedAt < JWT_TTL_MS) {
            return userIdCache.id;
        }
        const { account } = getBrowserClients();
        const user = await account.get();
        if (user?.$id) {
            userIdCache = { id: user.$id, fetchedAt: Date.now() };
            return user.$id;
        }
        return null;
    } catch {
        return null;
    }
}

export interface DispatchInput {
    actionId: string;
    payload: Record<string, any>;
    factionId: string;
    /** Optional custom HUD label; defaults to a generated description. */
    label?: string;
}

export interface DispatchResult {
    success: boolean;
    orderId?: string;
    error?: string;
    localId: string;
}

/**
 * Dispatch a player order with instant optimistic feedback.
 */
export async function dispatchOrder(input: DispatchInput): Promise<DispatchResult> {
    const { actionId, payload, factionId } = input;
    const store = useUIStore.getState();
    const localId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const pending: PendingOrder = {
        localId,
        orderId: null,
        actionId,
        label: input.label ?? describeOrder(actionId, payload),
        factionId,
        payload,
        createdAt: Date.now(),
        status: 'sending',
    };

    // 1. HUD chip
    store.addPendingOrder(pending);

    // 2. Instant overlay on whatever is currently rendered
    try {
        const { fleets, planets } = useUIStore.getState();
        const next = applyPendingOrderOverlays({ fleets, planets }, [pending]);
        if (next.fleets !== fleets || next.planets !== planets) {
            useUIStore.setState({ fleets: next.fleets, planets: next.planets });
        }
    } catch (e) {
        console.warn('[OrderClient] Optimistic overlay failed (non-fatal):', e);
    }

    // 3. Send to server
    try {
        const [jwt, userId] = await Promise.all([getJwt(), getUserId()]);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (jwt) headers['x-appwrite-jwt'] = jwt;

        const res = await fetch('/api/game/order', {
            method: 'POST',
            headers,
            body: JSON.stringify({ actionId, payload, factionId, userId }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.error) {
            const error = data?.error || `Order rejected (${res.status})`;
            useUIStore.getState().updatePendingOrder(localId, { status: 'failed', error });
            return { success: false, error, localId };
        }

        useUIStore.getState().updatePendingOrder(localId, {
            status: 'queued',
            orderId: data.orderId ?? null,
        });
        return { success: true, orderId: data.orderId, localId };
    } catch (e: any) {
        const error = e?.message || 'Network error while sending order.';
        useUIStore.getState().updatePendingOrder(localId, { status: 'failed', error });
        return { success: false, error, localId };
    }
}
