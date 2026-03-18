/**
 * app/actions/combat.ts
 * 
 * Server actions for the Military & Combat pillar.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { initiateCombat, resolveEngagementRound, advanceRound } from '@/lib/combat/combat-engine';
import { ActionResult } from '@/lib/actions/types';
import { CombatState, CombatantState, TargetDetails, OngoingEngagementRound, CombatStance, PostBattleDirective } from '@/lib/combat/combat-types';

/**
 * Initiates combat between two fleets.
 */
export async function attackFleetAction(attackerFleetId: string, defenderFleetId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  const attackerFleet = world.movement.fleets.get(attackerFleetId);
  const defenderFleet = world.movement.fleets.get(defenderFleetId);

  if (!attackerFleet || !defenderFleet) {
    return { success: false, error: 'Attacker or Defender fleet not found.' };
  }

  const combatId = `combat-${attackerFleetId}-${defenderFleetId}-${Date.now()}`;
  
  const target: TargetDetails = {
    systemId: attackerFleet.currentSystemId || '',
    terrainModifier: 1.0,
    infrastructureIntegrity: 1.0
  };

  const attacker: CombatantState = {
    factionId: attackerFleet.factionId,
    role: 'attacker',
    baseForceCount: attackerFleet.strength * 100,
    composition: {}, // In a full impl, derive from fleet unit registry
    intelLevel: 'observing',
    supply: 1.0,
    morale: 1.0,
    doctrine: 'aggressive',
    casualties: 0,
    predictionPoints: 0
  };

  const defender: CombatantState = {
    factionId: defenderFleet.factionId,
    role: 'defender',
    baseForceCount: defenderFleet.strength * 100,
    composition: {},
    intelLevel: 'observing',
    supply: 1.0,
    morale: 1.0,
    doctrine: 'defensive',
    casualties: 0,
    predictionPoints: 0
  };

  const combatState = initiateCombat(combatId, target, attacker, defender);
  world.activeCombats.set(combatId, combatState);

  revalidatePath('/');
  return { success: true, combatId } as any;
}

/**
 * Selects a combat stance for the next round.
 */
export async function selectCombatStanceAction(combatId: string, factionId: string, stance: CombatStance): Promise<ActionResult> {
  const world = getGameWorldState();
  const combat = world.activeCombats.get(combatId);

  if (!combat) return { success: false, error: 'Combat not found.' };

  if (combat.attacker.factionId === factionId) {
    combat.attacker.selectedStance = stance;
  } else if (combat.defender.factionId === factionId) {
    combat.defender.selectedStance = stance;
  } else {
    return { success: false, error: 'Faction not involved in this combat.' };
  }

  revalidatePath('/');
  return { success: true };
}

/**
 * Selects a post-battle directive.
 */
export async function selectCombatDirectiveAction(combatId: string, factionId: string, directive: PostBattleDirective): Promise<ActionResult> {
  const world = getGameWorldState();
  const combat = world.activeCombats.get(combatId);

  if (!combat) return { success: false, error: 'Combat not found.' };

  if (combat.attacker.factionId === factionId) {
    combat.attacker.selectedDirective = directive;
  } else if (combat.defender.factionId === factionId) {
    combat.defender.selectedDirective = directive;
  } else {
    return { success: false, error: 'Faction not involved in this combat.' };
  }

  revalidatePath('/');
  return { success: true };
}

/**
 * Launches a planetary bombardment.
 */
export async function bombardPlanetAction(fleetId: string, planetId: string): Promise<ActionResult> {
  // Bombardment logic: reduce planet stability, damage buildings
  // For now, we'll just log it or apply a placeholder effect
  return { success: true };
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
export async function submitDefense(crisisId: string, strategyId: string): Promise<ActionResult> {
  // Crisis response logic: resolve the crisis based on strategy
  // For now, return a mock success
  revalidatePath('/');
  return { 
    success: true, 
    winner: 'defender',
    message: 'Defense successfully repelled the invaders.'
  } as any;
}

