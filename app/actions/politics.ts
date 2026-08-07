/**
 * app/actions/politics.ts
 * 
 * Server actions for the Politics & Diplomacy pillar.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { listPolicies, policyEnactCost, policyRepealCost } from '@/lib/government/policy-service';
import type { ActionResult } from '@/lib/actions/types';
import type { PolicyOption } from '@/types/ui-state';
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
 * Enacts a government policy. The worker charges political capital and applies
 * the ideology shift + bloc reaction (lib/government/policy-service).
 */
export async function enactPolicyAction(factionId: string, policyId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `policy-${Date.now()}`,
    actionId: 'GOV_ENACT_POLICY',
    issuerId: factionId,
    targetId: policyId,
    payload: { policyId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Repeals an active policy. Costs political capital too — reversals are
 * political acts, not free undos.
 */
export async function repealPolicyAction(factionId: string, policyId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `policy-repeal-${Date.now()}`,
    actionId: 'GOV_REPEAL_POLICY',
    issuerId: factionId,
    targetId: policyId,
    payload: { policyId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Spends political capital whipping one party on one bill. */
export async function lobbyPartyAction(factionId: string, billId: string, partyId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `lobby-${Date.now()}`,
    actionId: 'GOV_LOBBY_PARTY',
    issuerId: factionId,
    targetId: partyId,
    payload: { billId, partyId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Enacts a policy by executive decree, bypassing the chamber. */
export async function decreePolicyAction(factionId: string, policyId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `decree-${Date.now()}`,
    actionId: 'GOV_DECREE_POLICY',
    issuerId: factionId,
    targetId: policyId,
    payload: { policyId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Answers a world in open defiance (Phase 6.2). Costs are charged worker-side
 * because they vary by response.
 */
export async function answerDefianceAction(factionId: string, eventId: string, response: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `defiance-${Date.now()}`,
    actionId: 'GOV_ANSWER_DEFIANCE',
    issuerId: factionId,
    targetId: eventId,
    payload: { eventId, response },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Concedes one of a breakaway region's demands (Phase 6.3). */
export async function grantConcessionAction(factionId: string, crisisId: string, demandId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `concession-${Date.now()}`,
    actionId: 'GOV_GRANT_CONCESSION',
    issuerId: factionId,
    targetId: crisisId,
    payload: { crisisId, demandId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Answers a secession crisis with force. */
export async function suppressSecessionAction(factionId: string, crisisId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `suppress-${Date.now()}`,
    actionId: 'GOV_SUPPRESS_SECESSION',
    issuerId: factionId,
    targetId: crisisId,
    payload: { crisisId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Recognises another empire's breakaway state as independent (Phase 6.5). */
export async function recognizeBreakawayAction(factionId: string, rebelFactionId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `recognise-${Date.now()}`,
    actionId: 'DIP_RECOGNIZE_BREAKAWAY',
    issuerId: factionId,
    targetId: rebelFactionId,
    payload: { rebelFactionId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Guarantees a breakaway state's independence — recognition with teeth. */
export async function guaranteeBreakawayAction(factionId: string, rebelFactionId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `guarantee-${Date.now()}`,
    actionId: 'DIP_GUARANTEE_BREAKAWAY',
    issuerId: factionId,
    targetId: rebelFactionId,
    payload: { rebelFactionId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Purges the officer corps to buy down coup pressure. */
export async function purgeOfficersAction(factionId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `purge-${Date.now()}`,
    actionId: 'GOV_PURGE_OFFICERS',
    issuerId: factionId,
    targetId: factionId,
    payload: {},
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * Appoints a leader to a cabinet portfolio. Costs political capital, charged
 * by the worker (lib/government/cabinet-service).
 */
export async function appointMinisterAction(factionId: string, portfolio: string, leaderId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `minister-${Date.now()}`,
    actionId: 'GOV_APPOINT_MINISTER',
    issuerId: factionId,
    targetId: leaderId,
    payload: { portfolio, leaderId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Dismisses the sitting minister for a portfolio; the seat refills at once. */
export async function dismissMinisterAction(factionId: string, portfolio: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `dismiss-${Date.now()}`,
    actionId: 'GOV_DISMISS_MINISTER',
    issuerId: factionId,
    targetId: portfolio,
    payload: { portfolio },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/** Appoints a planetary governor. */
export async function appointGovernorAction(factionId: string, planetId: string, leaderId: string): Promise<ActionResult> {
  const result = await executePlayerAction({
    id: `governor-${Date.now()}`,
    actionId: 'GOV_APPOINT_GOVERNOR',
    issuerId: factionId,
    targetId: planetId,
    payload: { planetId, leaderId },
    timestamp: Math.floor(Date.now() / 1000)
  });

  if (result.success) revalidatePath('/');
  return result;
}

/**
 * The policy catalog (data/policies/*.json). Read server-side because the
 * registry is fs-backed; the client caches it in the UI store.
 */
export async function getPolicyCatalogAction(): Promise<ActionResult<PolicyOption[]>> {
  try {
    const catalog: PolicyOption[] = listPolicies().map(def => ({
      id: def.id,
      name: def.name ?? def.id,
      description: def.description ?? '',
      category: def.category ?? 'state',
      cost: policyEnactCost(def),
      repealCost: policyRepealCost(def),
      effects: def.effects ?? {},
      supportTags: def.support_tags ?? [],
      opposeTags: def.oppose_tags ?? [],
    }));
    return { success: true, data: catalog };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Policy catalog unavailable.' };
  }
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
