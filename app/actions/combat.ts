'use server'
/**
 * app/actions/combat.ts
 * 
 * Server actions for the Military & Combat pillar.
 */

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { initiateCombat, resolveEngagementRound, advanceRound } from '@/lib/combat/combat-engine';
import type { ActionResult } from '@/lib/actions/types';
import { CombatState, CombatantState, TargetDetails, OngoingEngagementRound, CombatStance, PostBattleDirective } from '@/lib/combat/combat-types';

import { executePlayerAction } from './registry-handler';

/**
 * Initiates combat between two fleets.
 */
export async function attackFleetAction(attackerFleetId: string, defenderFleetId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `combat-init-${Date.now()}`,
    actionId: 'MIL_ATTACK_FLEET',
    issuerId: 'PLAYER_FACTION', // Resolved by handler
    targetId: defenderFleetId,
    payload: { attackerFleetId, defenderFleetId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Selects a combat stance for the next round.
 */
export async function selectCombatStanceAction(combatId: string, factionId: string, stance: CombatStance, prediction?: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `stance-${Date.now()}`,
    actionId: 'MIL_COMBAT_STANCE',
    issuerId: factionId,
    targetId: combatId,
    payload: { combatId, stance, prediction },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Selects a post-battle directive.
 */
export async function selectCombatDirectiveAction(combatId: string, factionId: string, directive: PostBattleDirective): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `directive-${Date.now()}`,
    actionId: 'MIL_COMBAT_DIRECTIVE',
    issuerId: factionId,
    targetId: combatId,
    payload: { combatId, directive },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Launches a planetary bombardment.
 */
export async function bombardPlanetAction(fleetId: string, planetId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `bombard-${Date.now()}`,
    actionId: 'MIL_BOMBARD_PLANET',
    issuerId: 'PLAYER_FACTION', // Resolved by handler
    targetId: planetId,
    payload: { fleetId, targetId: planetId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Launches a planetary invasion.
 */
export async function invasionPlanetAction(fleetId: string, planetId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `invasion-${Date.now()}`,
    actionId: 'MIL_INVASION_PLANET',
    issuerId: 'PLAYER_FACTION', // Resolved by handler
    targetId: planetId,
    payload: { fleetId, targetId: planetId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Ticks all active combats. Called by advanceTimeAction.
 */
export async function tickCombats(deltaSeconds: number) {
  const world = getGameWorldState();
  
  for (const [id, combat] of world.activeCombats) {
    if (combat.resolved) continue;

    // Simulate rounds based on time passed
    // 1 round per 6 hours (21600s)
    const roundsToTick = Math.floor(deltaSeconds / 21600);
    
    for (let i = 0; i < roundsToTick; i++) {
      if (combat.resolved) break;

      const roundInput: OngoingEngagementRound = {
        roundNumber: combat.round,
        // If player has selected a stance, it will be pulled in resolveEngagementRound
        // If not, we can provide a default here or in the logic
        attackerStance: combat.attacker.selectedStance || 'blitz',
        defenderStance: combat.defender.selectedStance || 'entrench'
      };

      resolveEngagementRound(combat, roundInput);
      advanceRound(combat);
    }
  }
}

/**
 * Submits a tactical defense against a crisis.
 */
export async function submitDefense(crisisId: string, strategyId: string, predictedActionId?: string): Promise<ActionResult> {
  // Crisis response logic: resolve the crisis based on strategy
  // For now, return a mock success
  revalidatePath('/');
  return { 
    success: true, 
    winner: 'defender',
    message: 'Defense successfully repelled the invaders.'
  } as any;
}

