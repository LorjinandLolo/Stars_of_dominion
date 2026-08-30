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
    'PRESS_RESOLVE_CRISIS',
    'PRESS_TOGGLE_QUARANTINE',
    'PRESS_TOGGLE_JAM',
    'PRESS_DEPLOY_COUNTER_NARRATIVE',
    'PRESS_SEED_STORY',
    'PRESS_INV_COOPERATE',
    'PRESS_INV_OBSTRUCT',
    'PRESS_INV_SACRIFICE_OFFICIAL',
    'PRESS_INV_PUBLISH_FIRST',
    'PRESS_LEAK_INTEL',
    'PRESS_FABRICATE_STORY',
    'PRESS_LAUNCH_CAMPAIGN',
    'PRESS_CANCEL_CAMPAIGN',
    'PRESS_COUNTER_CAMPAIGN',
    'PRESS_TRACE_CAMPAIGN',
    'PRESS_ACCUSE_CAMPAIGN',
    'PRESS_CRISIS_REACT',
    'PRESS_CRISIS_PREDICT',
    'TRADE_ESTABLISH_ROUTE',
    'INFRA_UPGRADE',
    // Pirate system. Every one of these has a handler in scripts/game-loop.ts,
    // but queueOrder rejects anything that is in neither ACTION_DEFINITIONS nor
    // this set — so the entire PIR_* surface was unreachable from the client.
    'PIR_SPONSOR_ORG',
    'PIR_SET_OPERATION',
    'PIR_CUT_SPONSORSHIP',
    'PIR_ISSUE_MARQUE',
    'PIR_REVOKE_MARQUE',
    'PIR_NEGOTIATE',
    'PIR_BACK_SUCCESSOR',
    'PIR_PAY_PROTECTION',
    'PIR_BLACKMARKET_BUY',
    'PIR_BLACKMARKET_SELL',
    'PIR_BUY_INTEL',
    'PIR_CUSTOMS_ENFORCE',
    'PIR_POST_BOUNTY',
    'PIR_OFFER_AMNESTY',
    'PIR_DISPOSE_CREW',
    'PIR_ASSIGN_RAID',
    'PIR_SET_POSTURE',
    'PIR_ESTABLISH_BASE',
    'PIR_SET_RACKET',
    'PIR_SPLIT_LOOT',
    'PIR_ACCEPT_MARQUE',
    'PIR_REFUSE_MARQUE',
    'PIR_LEGITIMIZE',
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
 * Faction ownership check. Policy: orders are accepted ONLY from the signed-in
 * claimant of the faction. Unclaimed factions (AI empires, factions whose
 * player hasn't arrived yet) accept orders from NOBODY — they used to fail
 * open "for solo/dev play", which meant any signed-in player could command
 * every AI empire's fleets and treasury through the real order queue. Dev
 * play claims a faction like everyone else (scripts/setup-dev-duel.ts).
 * DB errors fail CLOSED: a rejected click retries; a hijacked empire doesn't.
 */
async function verifyFactionOwnership(
    factionId: string,
    userId: string | null
): Promise<{ ok: boolean; error?: string }> {
    if (!userId) {
        return { ok: false, error: 'Sign in to issue orders.' };
    }
    try {
        const claim = await prisma.playerProfile.findUnique({ where: { factionId } });
        if (!claim) {
            return { ok: false, error: 'This faction has no player claim — claim it in the lobby first.' };
        }
        if (claim.userId === userId) return { ok: true };
        return { ok: false, error: 'This faction is claimed by another player.' };
    } catch {
        return { ok: false, error: 'Could not verify faction ownership — try again.' };
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
