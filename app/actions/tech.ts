/**
 * app/actions/tech.ts
 * 
 * Server actions for the Tech & Research pillar.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { TechEngine } from '@/lib/tech/engine';
import type { ActionResult } from '@/lib/actions/types';

import { executePlayerAction } from './registry-handler';

/**
 * Starts research for a specific tech ID.
 * Assigns tech to the first available research slot.
 */
export async function startResearchAction(factionId: string, techId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `tech-${Date.now()}`,
    actionId: 'TECH_START_RESEARCH',
    issuerId: factionId,
    targetId: techId,
    payload: { techId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Returns the player's current tech state.
 */
export async function getPlayerTechStateAction(factionId: string) {
  const world = getGameWorldState();
  let playerState = world.tech.get(factionId);
  if (!playerState) {
    playerState = TechEngine.initPlayerState(factionId);
    world.tech.set(factionId, playerState);
  }
  
  // Return plain object for RSC
  return {
    factionId: playerState.factionId,
    unlockedTechIds: playerState.unlockedTechIds,
    activeSlots: playerState.activeSlots,
    activeEffects: playerState.activeEffects,
    maxSlots: playerState.maxSlots,
    globalModifiers: playerState.globalModifiers,
    lockedTechIds: playerState.lockedTechIds
  };
}
