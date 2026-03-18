import { getServerClients } from '@/lib/appwrite';
import { ID, Query } from 'node-appwrite';
import { CrisisType, resolveLogic } from './crisis-shared';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'game';
const COLL_CRISES = 'crises'; // Created by schema script

// --- Actions ---

/**
 * Triggers a new Crisis event.
 * Locks the entities involved.
 */
export async function triggerCrisis(
    type: CrisisType,
    attackerId: string,
    defenderId: string,
    targetId: string,
    attackerStrategyId: string,
    initialPayload: any = {}
) {
    const { db } = await getServerClients();

    // 1. Calculate Deadline (e.g. 12 hours from now)
    // For Demo: 2 minutes to allow quick testing
    const hours = 0.03; // ~2 mins
    const deadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    // 2. Create Crisis Document
    const crisis = await db.createDocument(DB_ID, COLL_CRISES, ID.unique(), {
        type,
        attacker_id: attackerId,
        defender_id: defenderId,
        target_id: targetId,
        status: 'active',
        deadline,
        attacker_commitment: JSON.stringify(initialPayload),
        attacker_strategy: attackerStrategyId,
        defender_response: null, // Waiting for user
        resolution_result: null
    });

    return crisis;
}

/**
 * Gets active crises for a faction (as defender).
 */
export async function getActiveCrises(factionId: string) {
    const { db } = await getServerClients();
    const res = await db.listDocuments(DB_ID, COLL_CRISES, [
        Query.equal('defender_id', factionId),
        Query.equal('status', 'active')
    ]);
    return res.documents;
}

/**
 * Submits a defense response. Trigger resolution if needed.
 */
export async function respondToCrisis(crisisId: string, responseStrategyId: string) {
    const { db } = await getServerClients();

    // 1. Fetch Crisis
    const crisis: any = await db.getDocument(DB_ID, COLL_CRISES, crisisId);
    if (crisis.status !== 'active') throw new Error('Crisis already resolved');

    // 2. Resolve Immediately (WEGO style - since Attacker already committed)
    const result = resolveLogic(crisis.attacker_strategy, responseStrategyId);

    // 3. Update Crisis
    await db.updateDocument(DB_ID, COLL_CRISES, crisisId, {
        defender_response: responseStrategyId,
        status: 'resolved',
        resolution_result: JSON.stringify(result)
    });

    return result;
}
