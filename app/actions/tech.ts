/**
 * app/actions/tech.ts
 * 
 * Server actions for the Tech & Research pillar.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { TechEngine, registry } from '@/lib/tech/engine';
import type { ActionResult } from '@/lib/actions/types';
import { GameStateContext } from '@/lib/tech/types';

/**
 * Starts research for a specific tech ID.
 * Assigns tech to the first available research slot.
 */
export async function startResearchAction(factionId: string, techId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  
  // 1. Get or Init Player Tech State
  let playerState = world.tech.get(factionId);
  if (!playerState) {
    playerState = TechEngine.initPlayerState(factionId);
    world.tech.set(factionId, playerState);
  }

  // 2. Find an empty slot
  const slot = playerState.activeSlots.find(s => s.targetTechId === null);
  if (!slot) {
    return { success: false, error: 'No available research slots.' };
  }

  // 3. Execute Logic
  try {
    const now = Math.floor(Date.now() / 1000);
    const newState = TechEngine.assignResearch(playerState, slot.slotId, techId, now);
    world.tech.set(factionId, newState);
    
    revalidatePath('/');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to start research.' };
  }
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
    unlockedTechIds: Array.from(playerState.unlockedTechs),
    activeSlots: playerState.activeSlots,
    activeEffects: playerState.activeEffects,
    maxSlots: playerState.maxSlots,
    globalModifiers: playerState.globalModifiers,
    lockedTechIds: Array.from(playerState.lockedTechs)
  };
}
