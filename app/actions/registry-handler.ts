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
import { withSafeAction } from '@/lib/actions/safe-action';
import { queueBuildingAction, upgradeBuildingAction, repairBuildingAction, recruitUnitsAction } from './construction';
import { moveFleetAction, buildFleetAction } from './movement';
import { assignAgentAction, launchCovertOpAction } from './espionage';
import { getServerClients } from '@/lib/appwrite';
import { ResourceType } from '@/lib/actions/types';
import { startResearchAction } from './tech';
import { attackFleetAction, bombardPlanetAction } from './combat';
import { declareWarAction, offerPeaceAction, sendEnvoyAction, enactPolicyAction } from './politics';
import { recruitLeaderAction, assignLeaderAction } from './leadership';

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
  return withSafeAction(async () => {
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

    // 2. Push to Appwrite Order Queue instead of direct execution
    const { db, ID } = await getServerClients();
    
    try {
        await db.createDocument(DB_ID, 'game_orders', ID.unique(), {
            factionId: action.issuerId,
            actionId: action.actionId,
            payload: JSON.stringify(action.payload),
            processed: false
        });
        
        console.log(`[Queue] Action ${action.actionId} queued for ${action.issuerId}`);
        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        console.error('[Queue] Failed to push action:', e);
        return { success: false, error: 'Failed to synchronize action with database.' };
    }
  });
}
