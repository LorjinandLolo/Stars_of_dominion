// lib/multiplayer/order-queue.ts
// Stars of Dominion — Unified Server-Side Order Queue
//
// SINGLE entry point for queueing player orders into Postgres `game_orders`.
// Both the HTTP route (/api/game/order) and Server Actions (registry-handler)
// delegate here, so validation, ownership checks, and cost deduction can never
// be bypassed by picking a different code path.
//
// Server-only module: do not import from client components.

import { ACTION_DEFINITIONS } from '@/lib/actions/registry';
import type { PlayerActionId } from '@/lib/actions/types';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

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
}

export interface QueueOrderResult {
    success: boolean;
    orderId?: string;
    error?: string;
    /** HTTP-ish status hint for route handlers. */
    status?: number;
}

/**
 * Resolve the caller's user id from the better-auth session cookie.
 * Works in both route handlers and Server Actions via next/headers.
 */
async function getSessionUserId(): Promise<string | null> {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        return session?.user?.id ?? null;
    } catch {
        return null; // anonymous/dev session — ownership falls back to claim check
    }
}

/**
 * Faction ownership check. Policy:
 *  - If the faction is claimed in player_profiles, the caller's session user
 *    must match the claimant.
 *  - Unclaimed factions are allowed (solo/dev play, AI factions).
 */
async function verifyFactionOwnership(
    factionId: string,
    userId: string | null
): Promise<{ ok: boolean; error?: string }> {
    try {
        const claim = await prisma.playerProfile.findUnique({ where: { factionId } });
        if (!claim) return { ok: true }; // unclaimed — allow
        if (userId && claim.userId === userId) return { ok: true };
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

// NOTE: cost enforcement intentionally does NOT happen here.
// Costs are checked and deducted by the game-loop worker against
// world.economy.factions — the same reserves the resource bar displays.

/**
 * Validate, authorize, and queue a player order.
 * Returns the created order id so clients can track acknowledgment.
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

    // 2. Identity + ownership
    const userId = await getSessionUserId();
    const ownership = await verifyFactionOwnership(factionId, userId);
    if (!ownership.ok) {
        return reject(ownership.error ?? 'Faction ownership check failed.', 403);
    }

    // 3. Queue.
    try {
        const doc = await prisma.gameOrder.create({
            data: {
                actionId,
                factionId,
                payload: JSON.stringify(payload ?? {}),
            },
        });
        return { success: true, orderId: doc.id };
    } catch (e: any) {
        console.error('[OrderQueue] Failed to queue order:', e);
        return { success: false, error: 'Failed to synchronize action with database.', status: 500 };
    }
}
