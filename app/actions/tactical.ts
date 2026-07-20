'use server'
/**
 * app/actions/tactical.ts
 *
 * Server actions for the real-time tactical combat layer.
 *
 * Flow: the player engages (MIL_TACTICAL_ENGAGE) → the worker locks the system
 * so auto-resolve leaves it alone → the client runs the tactical sim locally →
 * the client submits the outcome (MIL_TACTICAL_RESULT) → the worker applies it
 * to the strategic fleets and clears the lock.
 */

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/actions/types';
import type { TacticalResultPayload } from '@/lib/tactical/fleet-adapter';

import { executePlayerAction } from './registry-handler';

/**
 * Opens a tactical battle in a system: pauses strategic auto-resolve there
 * (a 30-sim-minute lock) while the client simulates the fight.
 */
export async function engageTacticalBattleAction(
  systemId: string,
  enemyFactionId: string,
  factionId: string = 'PLAYER_FACTION'
): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `tactical-engage-${Date.now()}`,
    actionId: 'MIL_TACTICAL_ENGAGE',
    issuerId: factionId,
    targetId: systemId,
    payload: { systemId, enemyFactionId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Submits the finished tactical battle's outcome. The worker validates the
 * lock + fleet ownership, applies survivors/losses to the strategic fleets,
 * clears any auto-resolve engagement for the pair, and releases the lock.
 */
export async function submitTacticalResultAction(
  payload: TacticalResultPayload,
  factionId: string = 'PLAYER_FACTION'
): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `tactical-result-${Date.now()}`,
    actionId: 'MIL_TACTICAL_RESULT',
    issuerId: factionId,
    targetId: payload.systemId,
    payload: payload as unknown as Record<string, any>,
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}
