/**
 * app/actions/registry-handler.ts
 *
 * Central entry point for all player-initiated actions (Server Action path).
 * Delegates to lib/multiplayer/order-queue.ts — the SAME code path as
 * /api/game/order — so validation, ownership checks, and cost deduction
 * happen exactly once, in exactly one place.
 */
'use server'

import { PlayerAction, ActionResult } from '@/lib/actions/types';
import { withSafeAction } from '@/lib/actions/safe-action';
import { queueOrder } from '@/lib/multiplayer/order-queue';

/**
 * Main dispatcher for all player actions.
 * Returns the queued order id in `data.orderId` so the UI can track it.
 */
export async function executePlayerAction(action: PlayerAction): Promise<ActionResult<any>> {
  return withSafeAction(async () => {
    const result = await queueOrder({
      actionId: action.actionId,
      payload: action.payload ?? {},
      factionId: action.issuerId,
      userId: (action as any).userId ?? null,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    console.log(`[Queue] Action ${action.actionId} queued for ${action.issuerId} (order ${result.orderId})`);
    return { success: true, data: { orderId: result.orderId } };
  });
}
