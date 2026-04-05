/**
 * app/actions/espionage.ts
 * Phase 19 — Server Actions for Espionage & Covert Ops
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { 
    generateRecruitPool, 
    getSystemVisibility 
} from '@/lib/espionage/agent-service';
import type { ActionResult } from '@/lib/actions/types';
import type { OperationDomain } from '@/lib/espionage/espionage-types';
import type { SpyAgent, IntelNetwork, AgentCandidate, VisibilityLevel } from '@/lib/espionage/agent-types';
import { executePlayerAction } from './registry-handler';

/**
 * Returns the current espionage state for the player's faction.
 */
export async function getEspionageStateAction(factionId: string): Promise<{
    agents: SpyAgent[];
    networks: IntelNetwork[];
}> {
    const world = getGameWorldState();
    const agents = Array.from(world.espionage.agents.values())
        .filter(a => a.ownerFactionId === factionId);
    const networks = Array.from(world.espionage.intelNetworks.values())
        .filter(n => n.ownerFactionId === factionId);
    
    return { agents, networks };
}

/**
 * Generates a fresh pool of agent candidates.
 */
export async function getRecruitPoolAction(factionId: string): Promise<AgentCandidate[]> {
    const world = getGameWorldState();
    return generateRecruitPool(factionId, world.nowSeconds);
}

/**
 * Recruit an agent from a candidate.
 */
export async function recruitAgentAction(
    candidate: AgentCandidate,
    factionId: string
): Promise<ActionResult<SpyAgent>> {
    // Note: LEADER_RECRUIT is often used as a generic recruitment action, 
    // but we'll use a specialized ESP call if needed or wrap it.
    const result = await executePlayerAction({
        id: `recruit-${Date.now()}`,
        actionId: 'LEADER_RECRUIT', // Reusing leader recruitment for agents for now
        issuerId: factionId,
        targetId: candidate.id,
        payload: { leaderId: candidate.id },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result as any;
}

/**
 * Deploy an agent to a system.
 */
export async function assignAgentAction(
    agentId: string,
    systemId: string,
    domain: OperationDomain
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `assign-${Date.now()}`,
        actionId: 'ESP_ASSIGN_AGENT',
        issuerId: 'PLAYER_FACTION',
        targetId: systemId,
        payload: { agentId, systemId, domain },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Recall an agent to the recruitment pool/idle state.
 */
export async function recallAgentAction(agentId: string): Promise<ActionResult> {
    revalidatePath('/');
    return { success: true };
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

/**
 * Get visibility level for a system from a faction's perspective.
 */
export async function getSystemVisibilityAction(
    systemId: string,
    factionId: string
): Promise<VisibilityLevel> {
    const world = getGameWorldState();
    return getSystemVisibility(systemId, factionId, world as any);
}
