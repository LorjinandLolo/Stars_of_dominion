/**
 * app/actions/espionage.ts
 * Phase 19 — Server Actions for Espionage & Covert Ops
 */
'use server'

import { revalidatePath } from 'next/cache';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { 
    generateRecruitPool, 
    recruitAgent, 
    deployAgent, 
    recallAgent, 
    getSystemVisibility 
} from '@/lib/espionage/agent-service';
import { launchOperation } from '@/lib/espionage/espionage-service';
import { ActionResult } from '@/lib/actions/types';
import type { OperationDomain } from '@/lib/espionage/espionage-types';
import type { SpyAgent, IntelNetwork, AgentCandidate, VisibilityLevel } from '@/lib/espionage/agent-types';

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
    const world = getGameWorldState();
    
    // In a real app, check faction credits/intel here
    const agent = recruitAgent(candidate, factionId, world.nowSeconds, world);
    
    revalidatePath('/');
    return { success: true, data: agent };
}

/**
 * Deploy an agent to a system.
 */
export async function assignAgentAction(
    agentId: string,
    systemId: string,
    domain: OperationDomain
): Promise<ActionResult> {
    const world = getGameWorldState();
    const agent = world.espionage.agents.get(agentId);
    
    if (!agent) return { success: false, error: 'Agent not found' };
    
    deployAgent(agent, systemId, domain, world);
    
    revalidatePath('/');
    return { success: true };
}

/**
 * Recall an agent to the recruitment pool/idle state.
 */
export async function recallAgentAction(agentId: string): Promise<ActionResult> {
    const world = getGameWorldState();
    const agent = world.espionage.agents.get(agentId);
    
    if (!agent) return { success: false, error: 'Agent not found' };
    
    recallAgent(agent, world);
    
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
    const world = getGameWorldState();
    
    const result = launchOperation(
        actorFactionId,
        targetFactionId,
        targetRegionId,
        domain,
        investment,
        risk,
        world as any
    );
    
    if (!result.success) return { success: false, error: result.message };
    
    revalidatePath('/');
    return { success: true };
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
