/**
 * app/actions/espionage.ts
 * Phase 19 — Server Actions for Espionage & Covert Ops
 */
'use server'

import { revalidatePath } from 'next/cache';
import { generateRecruitPool } from '@/lib/espionage/agent-service';
import type { ActionResult } from '@/lib/actions/types';
import type { OperationDomain } from '@/lib/espionage/espionage-types';
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
 * Deploy an agent to a system.
 */
export async function assignAgentAction(
    factionId: string,
    agentId: string,
    systemId: string,
    domain: OperationDomain
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `assign-${Date.now()}`,
        actionId: 'ESP_ASSIGN_AGENT',
        issuerId: factionId,
        targetId: systemId,
        payload: { agentId, systemId, domain },
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
 * Launch a covert operation in a target region.
 */
export async function launchCovertOpAction(
    actorFactionId: string,
    targetFactionId: string,
    targetRegionId: string,
    domain: OperationDomain,
    investment: number,
    risk: number
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `op-${Date.now()}`,
        actionId: 'ESP_LAUNCH_OP',
        issuerId: actorFactionId,
        targetId: targetRegionId,
        payload: { targetFactionId, targetRegionId, domain, investment, risk },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

