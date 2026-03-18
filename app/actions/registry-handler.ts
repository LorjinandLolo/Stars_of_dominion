/**
 * app/actions/registry-handler.ts
 * 
 * Central entry point for all player-initiated actions.
 * Dispatches to specific subsystem handlers while providing unified validation.
 */
'use server'

import { revalidatePath } from 'next/cache';
import { PlayerAction, ActionResult } from '@/lib/actions/types';
import { ACTION_DEFINITIONS } from '@/lib/actions/registry';
import { queueBuildingAction, upgradeBuildingAction, repairBuildingAction, recruitUnitsAction } from './construction';
import { moveFleetAction, buildFleetAction } from './movement';
import { assignAgentAction, launchCovertOpAction } from './espionage';
import { getServerClients } from '@/lib/appwrite';
import { ResourceType } from '@/lib/actions/types';
import { startResearchAction } from './tech';
import { attackFleetAction, bombardPlanetAction } from './combat';
import { declareWarAction, offerPeaceAction, sendEnvoyAction, enactPolicyAction } from './politics';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_FACTIONS = 'factions';

async function checkAndDeductCosts(factionId: string, cost: Partial<Record<ResourceType, number>>): Promise<{ success: boolean; error?: string }> {
  const { db } = await getServerClients();
  let factionDoc;
  try {
    factionDoc = await db.getDocument(DB_ID, COLL_FACTIONS, factionId);
  } catch (e) {
    return { success: false, error: 'Faction not found' };
  }

  const resources = JSON.parse(factionDoc.resources || '{}');
  const missing: string[] = [];

  for (const [res, amount] of Object.entries(cost)) {
    const current = resources[res.toLowerCase()] || 0;
    if (current < amount!) {
      missing.push(res);
    }
  }

  if (missing.length > 0) {
    return { success: false, error: `Insufficient resources: ${missing.join(', ')}` };
  }

  // Deduct
  const updatedResources = { ...resources };
  for (const [res, amount] of Object.entries(cost)) {
    updatedResources[res.toLowerCase()] = (updatedResources[res.toLowerCase()] || 0) - amount!;
  }

  await db.updateDocument(DB_ID, COLL_FACTIONS, factionId, {
    resources: JSON.stringify(updatedResources)
  });

  return { success: true };
}

/**
 * Main dispatcher for all player actions.
 * In a full implementation, this would handle global resource checks, 
 * logging, and multi-step validation.
 */
export async function executePlayerAction(action: PlayerAction): Promise<ActionResult<any>> {
  const definition = ACTION_DEFINITIONS[action.actionId];
  if (!definition) {
    return { success: false, error: `Unknown action: ${action.actionId}` };
  }

  // 1. Basic Validation (Schema check)
  for (const [key, type] of Object.entries(definition.params)) {
    if (!(key in action.payload)) {
      return { success: false, error: `Missing parameter: ${key}` };
    }
  }

  // 1.1 Cost Check
  const costResult = await checkAndDeductCosts(action.issuerId, definition.cost);
  if (!costResult.success) {
    return costResult;
  }

  // 2. Dispatch to Subsystem
  switch (action.actionId) {
    case "PLANET_CONSTRUCT_BUILDING":
      return await queueBuildingAction(
        action.payload.planetId,
        action.targetId || "", // targetId is systemId here
        action.payload.buildingType,
        action.issuerId
      );

    case "PLANET_UPGRADE_BUILDING":
      return await upgradeBuildingAction(
        action.payload.buildingId,
        action.issuerId
      );

    case "PLANET_REPAIR_BUILDING":
      return await repairBuildingAction(
        action.payload.buildingId,
        action.issuerId
      );

    case "PLANET_RECRUIT_UNITS":
      return await recruitUnitsAction(
        action.payload.planetId,
        action.payload.unitType,
        action.payload.count,
        action.issuerId
      );

    case "MIL_MOVE_FLEET":
      return await moveFleetAction(
        action.payload.fleetId,
        action.payload.destinationId
      );

    case "MIL_BUILD_FLEET":
      return await buildFleetAction(
        action.payload.planetId,
        action.payload.systemId,
        action.payload.factionId
      );

    case "MIL_ATTACK_FLEET":
      return await attackFleetAction(
        action.payload.attackerId,
        action.payload.targetId
      );

    case "MIL_BOMBARD_PLANET":
      return await bombardPlanetAction(
        action.payload.fleetId,
        action.payload.targetId
      );

    case "ESP_ASSIGN_AGENT":
      return await assignAgentAction(
        action.payload.agentId,
        action.payload.systemId,
        action.payload.domain // e.g. 'politicalSubversion'
      );

    case "ESP_SABOTAGE_FACILITY":
      return await launchCovertOpAction(
        action.issuerId,
        action.payload.targetFactionId,
        action.payload.targetRegionId,
        'infrastructureSabotage',
        action.payload.investment || 0.5,
        action.payload.risk || 0.5
      );

    case "TECH_START_RESEARCH":
      return await startResearchAction(
        action.issuerId,
        action.payload.techId
      );

    case "DIP_DECLARE_WAR":
      return await declareWarAction(
        action.issuerId,
        action.payload.targetFactionId
      );

    case "DIP_OFFER_PEACE":
      return await offerPeaceAction(
        action.issuerId,
        action.payload.targetFactionId
      );

    case "DIP_SEND_ENVOY":
      return await sendEnvoyAction(
        action.issuerId,
        action.payload.targetFactionId
      );

    case "IDEO_ENACT_POLICY":
      return await enactPolicyAction(
        action.issuerId,
        action.payload.policyId
      );

    // Add more cases as subsystems are implemented (Diplomacy, etc.)
    
    default:
      return { success: false, error: `Action ${action.actionId} is not yet implemented.` };
  }
}
