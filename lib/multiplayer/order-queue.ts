// lib/multiplayer/order-queue.ts
// Stars of Dominion — Unified Server-Side Order Queue
//
// SINGLE entry point for queueing player orders into Appwrite `game_orders`.
// Both the HTTP route (/api/game/order) and Server Actions (registry-handler)
// delegate here, so validation, ownership checks, and cost deduction can never
// be bypassed by picking a different code path.
//
// Server-only module: do not import from client components.

import { ACTION_DEFINITIONS } from '@/lib/actions/registry';
import type { PlayerActionId } from '@/lib/actions/types';
import { getServerClients } from '@/lib/appwrite';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_ORDERS = 'game_orders';
const COLL_PROFILES = 'player_profiles';
const COLL_FACTIONS = 'factions';

// Actions the game-loop worker handles that aren't (yet) in ACTION_DEFINITIONS.
// They skip schema/cost validation but still go through ownership checks.
const WORKER_ONLY_ACTIONS = new Set([
    'AIR_LAUNCH_SORTIE',
    'MIL_COMBAT_RETREAT',
    'MIL_MERGE_FLEETS',
    'MIL_SPLIT_FLEET',
    'RENAME_PLANET',
    'SHIP_DESIGN_SAVE',
    'PRESS_SUPPRESS_STORY',
    'PRESS_INFLUENCE_NARRATIVE',
    'TRADE_ESTABLISH_ROUTE',
    'INFRA_UPGRADE',
]);

export interface QueueOrderInput {
    actionId: string;
    payload: Record<string, any>;
    factionId: string;
    /** Appwrite user id of the caller, if known (from JWT or session). */
    userId?: string | null;
    /** Appwrite JWT from the browser (account.createJWT()). When present it is
     *  verified server-side and becomes the authoritative identity. */
    jwt?: string | null;
}

export interface QueueOrderResult {
    success: boolean;
    orderId?: string;
    error?: string;
    /** HTTP-ish status hint for route handlers. */
    status?: number;
}

/**
 * Verify an Appwrite JWT and return the user id it belongs to, or null.
 */
async function resolveUserIdFromJwt(jwt: string): Promise<string | null> {
    try {
        const { Client, Account } = await import('node-appwrite');
        const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
        const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
        if (!endpoint || !project) return null;
        const client = new Client().setEndpoint(endpoint).setProject(project).setJWT(jwt);
        const account = new Account(client);
        const user = await account.get();
        return user.$id ?? null;
    } catch {
        return null;
    }
}

/**
 * Faction ownership check. Policy:
 *  - If the faction is claimed in player_profiles, the caller's verified userId
 *    must match the claimant.
 *  - Unclaimed factions are allowed (solo/dev play, AI factions).
 */
async function verifyFactionOwnership(
    db: any,
    Query: any,
    factionId: string,
    userId: string | null
): Promise<{ ok: boolean; error?: string }> {
    try {
        const claims = await db.listDocuments(DB_ID, COLL_PROFILES, [
            Query.equal('factionId', factionId),
            Query.limit(1),
        ]);
        if (claims.total === 0) return { ok: true }; // unclaimed — allow
        const claimant = claims.documents[0].userId;
        if (userId && claimant === userId) return { ok: true };
        return {
            ok: false,
            error: userId
                ? 'This faction is claimed by another player.'
                : 'This faction is claimed — sign in as its owner to issue orders.',
        };
    } catch {
        // If profiles can't be read, fail open so a transient DB hiccup doesn't
        // block all gameplay. Orders are still validated by the worker.
        return { ok: true };
    }
}

// NOTE: cost enforcement intentionally does NOT happen here anymore.
// It used to read the legacy `factions` collection — a stale MVP ledger
// (≈100 credits, no influence/ammo keys) completely disconnected from the
// live economy in the world snapshot. Result: actions like "commission fleet"
// (1000cr) were rejected while the player was looking at 50,000 credits.
// Costs are now checked and deducted by the game-loop worker against
// world.economy.factions — the same reserves the resource bar displays.

/**
 * Validate, authorize, price, and queue a player order.
 * Returns the created order document id so clients can track acknowledgment.
 */
export async function queueOrder(input: QueueOrderInput): Promise<QueueOrderResult> {
    const { actionId, payload, factionId } = input;

    const reject = (error: string, status: number): QueueOrderResult => {
        // Always log rejects server-side — silent 400s are undebuggable from logs.
        console.warn(`[OrderQueue] REJECTED ${actionId ?? '(no action)'} for ${factionId ?? '(no faction)'}: ${error}`);
        return { success: false, error, status };
    };

    if (!actionId || !factionId) {
        return reject('Missing actionId or factionId.', 400);
    }

    // 1. Schema validation
    const definition = ACTION_DEFINITIONS[actionId as PlayerActionId];
    if (!definition && !WORKER_ONLY_ACTIONS.has(actionId)) {
        return reject(`Unknown action: ${actionId}`, 400);
    }
    if (definition) {
        for (const key of Object.keys(definition.params)) {
            if (!(key in (payload || {}))) {
                return reject(`Missing parameter: ${key}`, 400);
            }
        }
    }

    const { db, Query, ID } = await getServerClients();

    // 2. Identity + ownership
    let userId: string | null = input.userId ?? null;
    if (input.jwt) {
        const verified = await resolveUserIdFromJwt(input.jwt);
        if (verified) userId = verified; // JWT wins over self-reported id
    }
    const ownership = await verifyFactionOwnership(db, Query, factionId, userId);
    if (!ownership.ok) {
        return reject(ownership.error ?? 'Faction ownership check failed.', 403);
    }

    // 3. Queue. Only write attributes that exist in the game_orders schema
    // (factionId, actionId, payload, processed) — extra fields like `userId`
    // or `timestamp` make Appwrite reject the document outright.
    try {
        const doc = await db.createDocument(DB_ID, COLL_ORDERS, ID.unique(), {
            actionId,
            factionId,
            payload: JSON.stringify(payload ?? {}),
            processed: false,
        });
        return { success: true, orderId: doc.$id };
    } catch (e: any) {
        console.error('[OrderQueue] Failed to queue order:', e);
        return { success: false, error: 'Failed to synchronize action with database.', status: 500 };
    }
}
