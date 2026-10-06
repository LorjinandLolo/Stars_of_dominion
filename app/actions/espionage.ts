/**
 * app/actions/espionage.ts
 * Phase 19 — Server Actions for Espionage & Covert Ops
 */
'use server'

import { revalidatePath } from 'next/cache';
import { generateRecruitPool } from '@/lib/espionage/agent-service';
import type { ActionResult } from '@/lib/actions/types';
import type { AgentCandidate } from '@/lib/espionage/agent-types';
import { executePlayerAction } from './registry-handler';

/**
 * Generates a fresh pool of agent candidates. Pure random generation —
 * no world state involved, so it's safe to run in the web server process.
 */
export async function getRecruitPoolAction(factionId: string): Promise<AgentCandidate[]> {
    return generateRecruitPool(factionId, Math.floor(Date.now() / 1000));
}

/**
 * Recruit an agent from a candidate. Queued as an order; the worker deducts
 * the candidate's recruitment cost and creates the agent, which then arrives
 * via the normal shard sync.
 */
export async function recruitAgentAction(
    candidate: AgentCandidate,
    factionId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `recruit-${Date.now()}`,
        actionId: 'ESP_RECRUIT_AGENT',
        issuerId: factionId,
        targetId: candidate.id,
        payload: { candidate },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Deploy an agent to a system, where they build an intel network.
 */
export async function assignAgentAction(
    factionId: string,
    agentId: string,
    systemId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `assign-${Date.now()}`,
        actionId: 'ESP_ASSIGN_AGENT',
        issuerId: factionId,
        targetId: systemId,
        payload: { agentId, systemId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Seize a time-limited opportunity from the Intelligence Operations Board.
 * Cost is validated and deducted by the worker (varies per opportunity).
 */
export async function seizeOpportunityAction(factionId: string, opportunityId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `seize-${Date.now()}`,
        actionId: 'ESP_SEIZE_OPPORTUNITY',
        issuerId: factionId,
        targetId: opportunityId,
        payload: { opportunityId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Recall an agent from the field (goes on cooldown, network starts decaying).
 */
export async function recallAgentAction(factionId: string, agentId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `recall-${Date.now()}`,
        actionId: 'ESP_RECALL_AGENT',
        issuerId: factionId,
        targetId: agentId,
        payload: { agentId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Launch a catalog operation (lib/espionage/operation-catalog.ts) against a
 * system the target empire holds. The worker enforces the network-stage gate,
 * operation capacity, Intel and credit cost, and that the named agent (if any)
 * is ours and free; a refusal reaches the player as
 * an order failure.
 */
export async function launchCatalogOpAction(
    actorFactionId: string,
    targetFactionId: string,
    targetRegionId: string,
    definitionId: string,
    agentId?: string | null
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `op-${Date.now()}`,
        actionId: 'ESP_LAUNCH_CATALOG_OP',
        issuerId: actorFactionId,
        targetId: targetRegionId,
        payload: { targetFactionId, targetRegionId, definitionId, ...(agentId ? { agentId } : {}) },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}


/**
 * Set the counter-intelligence plan: a service-wide budget (0..1) and coverage
 * (0..1) on systems the faction holds. Upkeep is paid hourly in Intel by the
 * worker; the worker validates and refuses a bad plan.
 */
export async function setCounterIntelAction(
    factionId: string,
    budget: number,
    regions: Record<string, number>
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `ci-${Date.now()}`,
        actionId: 'ESP_SET_COUNTERINTEL',
        issuerId: factionId,
        targetId: factionId,
        payload: { budget, regions },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}
