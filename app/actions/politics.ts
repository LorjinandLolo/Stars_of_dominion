/**
 * app/actions/politics.ts
 * 
 * Server actions for the Politics & Diplomacy pillar.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { applyPolicyEffect } from '@/lib/politics/politics-service';
import type { ActionResult } from '@/lib/actions/types';
import { TreatyType } from '@/lib/politics/cold-war-types';
import { executePlayerAction } from './registry-handler';

/**
 * Declares war on a target faction.
 */
export async function declareWarAction(issuerId: string, targetFactionId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `war-${Date.now()}`,
    actionId: 'DIP_DECLARE_WAR',
    issuerId,
    targetId: targetFactionId,
    payload: { targetFactionId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Offers peace to an enemy faction.
 */
export async function offerPeaceAction(issuerId: string, targetFactionId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `peace-${Date.now()}`,
    actionId: 'DIP_OFFER_PEACE',
    issuerId,
    targetId: targetFactionId,
    payload: { targetFactionId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Sends a diplomatic envoy to improve relations.
 */
export async function sendEnvoyAction(issuerId: string, targetFactionId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `envoy-${Date.now()}`,
    actionId: 'DIP_SEND_ENVOY',
    issuerId,
    targetId: targetFactionId,
    payload: { targetFactionId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Enacts a government policy, affecting bloc satisfaction.
 */
export async function enactPolicyAction(factionId: string, policyId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `policy-${Date.now()}`,
    actionId: 'IDEO_ENACT_POLICY',
    issuerId: factionId,
    targetId: policyId,
    payload: { policyId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Casts a vote on an active Council resolution.
 * Note: No specific action ID yet, could be added later for multiplayer sync.
 * For now, using the registry handler for generic actions or continuing if loop supports.
 */
export async function castCouncilVoteAction(resolutionId: string, vote: 'support' | 'oppose' | 'abstain'): Promise<ActionResult> {
  // Generic council action (needs addition to registry if we want authoritative loop processing)
  // For now, let's just use revalidatePath as Council is often processed at season end.
  revalidatePath('/');
  return { success: true };
}

/**
 * Supports a specific power bloc in the Council.
 */
export async function supportBlocAction(blocId: string): Promise<ActionResult> {
  revalidatePath('/');
  return { success: true };
}

/**
 * Direct lobbying to boost Council legitimacy.
 */
export async function lobbyCouncilAction(): Promise<ActionResult> {
  revalidatePath('/');
  return { success: true };
}

/**
 * Proposes a formal treaty between empires.
 */
export async function proposeTreatyAction(type: TreatyType, signatories: string[]): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `treaty-${Date.now()}`,
    actionId: 'DIP_PROPOSE_TREATY',
    issuerId: signatories[0], // Assumes current faction is first
    targetId: signatories[1],
    payload: { targetFactionId: signatories[1], treatyType: type },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Demands tribute from a vassal faction.
 */
export async function demandTributeAction(vassalId: string, overlordId: string, resourceType: string, amount: number): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `tribute-${Date.now()}`,
    actionId: 'DIP_DEMAND_TRIBUTE',
    issuerId: overlordId,
    targetId: vassalId,
    payload: { targetFactionId: vassalId, amount },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Negotiates a trade pact with specific resource adjustments.
 */
export async function negotiateTradePactAction(empireAId: string, empireBId: string, resourceAdjustments: Record<string, number>, tariffExemption: boolean): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `trade-pact-${Date.now()}`,
    actionId: 'DIP_TRADE_PACT',
    issuerId: empireAId,
    targetId: empireBId,
    payload: { targetFactionId: empireBId, resource: 'credits', volume: 100 },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}
