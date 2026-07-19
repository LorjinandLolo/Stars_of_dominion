import { prisma, withDocAliases } from '@/lib/db';
import { CrisisType, resolveLogic } from './crisis-shared';

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
    // 1. Calculate Deadline (e.g. 12 hours from now)
    // For Demo: 2 minutes to allow quick testing
    const hours = 0.03; // ~2 mins
    const deadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    // 2. Create Crisis Document
    const crisis = await prisma.crisis.create({
        data: {
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
        }
    });

    return withDocAliases(crisis);
}

/**
 * Gets active crises for a faction (as defender).
 */
export async function getActiveCrises(factionId: string) {
    const crises = await prisma.crisis.findMany({
        where: { defender_id: factionId, status: 'active' }
    });
    return crises.map(withDocAliases);
}

/**
 * Submits a defense response. Trigger resolution if needed.
 */
export async function respondToCrisis(crisisId: string, responseStrategyId: string, predictedAttackerStrategyId?: string) {
    // 1. Fetch Crisis
    const crisis = await prisma.crisis.findUniqueOrThrow({ where: { id: crisisId } });
    if (crisis.status !== 'active') throw new Error('Crisis already resolved');

    // 2. Resolve Immediately (WEGO style - since Attacker already committed)
    const result = resolveLogic(crisis.attacker_strategy ?? '', responseStrategyId, predictedAttackerStrategyId);

    // 3. Update Crisis
    await prisma.crisis.update({
        where: { id: crisisId },
        data: {
            defender_response: responseStrategyId,
            status: 'resolved',
            resolution_result: JSON.stringify(result)
        }
    });

    return result;
}
