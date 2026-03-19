/**
 * app/actions/politics.ts
 * 
 * Server actions for the Politics & Diplomacy pillar.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { applyPolicyEffect } from '@/lib/politics/politics-service';
import { calculateEscalationLevel } from '@/lib/politics/cold-war-service';
import type { ActionResult } from '@/lib/actions/types';
import { RivalryState, Treaty, TradePact, Tribute, TreatyType } from '@/lib/politics/cold-war-types';
import { applyCouncilVote, supportBloc, lobbyCouncil } from '@/lib/politics/council-logic';

/**
 * Declares war on a target faction.
 * Sets rivalry score to 100 and escalation to max.
 */
export async function declareWarAction(issuerId: string, targetFactionId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  const rivalryId = `rivalry-${issuerId}-${targetFactionId}`;
  
  const state: RivalryState = {
    id: rivalryId,
    empireAId: issuerId,
    empireBId: targetFactionId,
    rivalryScore: 100,
    escalationLevel: 7, // Direct War
    activeSanctionIds: [],
    proxyConflictsInvolved: [],
    detenteActive: false
  };

  world.rivalries.set(rivalryId, state);
  
  // Also set the reverse rivalry if needed for AI
  const reverseRivalryId = `rivalry-${targetFactionId}-${issuerId}`;
  world.rivalries.set(reverseRivalryId, { ...state, id: reverseRivalryId, empireAId: targetFactionId, empireBId: issuerId });

  revalidatePath('/');
  return { success: true };
}

/**
 * Offers peace to an enemy faction.
 * Reduces rivalry score and sets escalation to a lower level.
 */
export async function offerPeaceAction(issuerId: string, targetFactionId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  const rivalryId = `rivalry-${issuerId}-${targetFactionId}`;
  const rivalry = world.rivalries.get(rivalryId);

  if (!rivalry) return { success: false, error: 'No active rivalry/war found.' };

  rivalry.rivalryScore = 50;
  rivalry.escalationLevel = calculateEscalationLevel(50);
  rivalry.detenteActive = true;

  revalidatePath('/');
  return { success: true };
}

/**
 * Sends a diplomatic envoy to improve relations.
 */
export async function sendEnvoyAction(issuerId: string, targetFactionId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  const rivalryId = `rivalry-${issuerId}-${targetFactionId}`;
  let rivalry = world.rivalries.get(rivalryId);

  if (!rivalry) {
    rivalry = {
      id: rivalryId,
      empireAId: issuerId,
      empireBId: targetFactionId,
      rivalryScore: 20,
      escalationLevel: 0,
      activeSanctionIds: [],
      proxyConflictsInvolved: [],
      detenteActive: false
    };
    world.rivalries.set(rivalryId, rivalry);
  } else {
    rivalry.rivalryScore = Math.max(0, rivalry.rivalryScore - 10);
    rivalry.escalationLevel = calculateEscalationLevel(rivalry.rivalryScore);
  }

  revalidatePath('/');
  return { success: true };
}

/**
 * Enacts a government policy, affecting bloc satisfaction.
 */
export async function enactPolicyAction(factionId: string, policyId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  
  try {
    applyPolicyEffect(factionId, policyId, world as any);
    revalidatePath('/');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to enact policy.' };
  }
}

/**
 * Casts a vote on an active Council resolution.
 */
export async function castCouncilVoteAction(resolutionId: string, vote: 'support' | 'oppose' | 'abstain'): Promise<ActionResult> {
  const world = getGameWorldState();
  const result = applyCouncilVote(world.council, resolutionId, vote);
  world.council = { ...world.council, ...result };
  
  revalidatePath('/');
  return { success: true };
}

/**
 * Supports a specific power bloc in the Council.
 */
export async function supportBlocAction(blocId: string): Promise<ActionResult> {
  const world = getGameWorldState();
  const result = supportBloc(world.council, blocId);
  world.council = { ...world.council, ...result };
  
  revalidatePath('/');
  return { success: true };
}

/**
 * Direct lobbying to boost Council legitimacy.
 */
export async function lobbyCouncilAction(): Promise<ActionResult> {
  const world = getGameWorldState();
  const result = lobbyCouncil(world.council);
  world.council = { ...world.council, ...result };
  
  revalidatePath('/');
  return { success: true };
}

/**
 * Proposes a formal treaty between empires.
 */
export async function proposeTreatyAction(type: TreatyType, signatories: string[]): Promise<ActionResult> {
  const world = getGameWorldState();
  const treatyId = `treaty-${signatories.sort().join('-')}-${type}`;
  
  const treaty: Treaty = {
    id: treatyId,
    type,
    signatories,
    signedAtTick: world.nowSeconds,
    status: 'active'
  };

  world.treaties.set(treatyId, treaty);
  revalidatePath('/');
  return { success: true };
}

/**
 * Demands tribute from a vassal faction.
 */
export async function demandTributeAction(vassalId: string, overlordId: string, resourceType: string, amount: number): Promise<ActionResult> {
  const world = getGameWorldState();
  const tributeId = `tribute-${overlordId}-${vassalId}-${resourceType}`;

  const tribute: Tribute = {
    id: tributeId,
    vassalId,
    overlordId,
    resourceType,
    amountPerTick: amount,
    status: 'active'
  };

  world.tributes.set(tributeId, tribute);
  revalidatePath('/');
  return { success: true };
}

/**
 * Negotiates a trade pact with specific resource adjustments.
 */
export async function negotiateTradePactAction(empireAId: string, empireBId: string, resourceAdjustments: Record<string, number>, tariffExemption: boolean): Promise<ActionResult> {
  const world = getGameWorldState();
  const pactId = `pact-${[empireAId, empireBId].sort().join('-')}`;

  const pact: TradePact = {
    id: pactId,
    empireAId,
    empireBId,
    resourceAdjustments,
    tariffExemption,
    signedAtTick: world.nowSeconds
  };

  world.tradePacts.set(pactId, pact);
  revalidatePath('/');
  return { success: true };
}
