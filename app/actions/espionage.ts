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
export async function getRecruitPoolAction(
    factionId: string,
    ownSpecies: string | null = null,
    otherSpecies: string[] = []
): Promise<AgentCandidate[]> {
    // Species are public (every empire's civilizationId is), so the page
    // passes them; the worker re-prices the hire from species and traits.
    const clean = (s: unknown) => (typeof s === 'string' && /^civ-[a-z0-9-]+$/.test(s) ? s : null);
    return generateRecruitPool(
        factionId,
        Math.floor(Date.now() / 1000),
        clean(ownSpecies),
        (Array.isArray(otherSpecies) ? otherSpecies : []).map(clean).filter((s): s is string => !!s).slice(0, 40)
    );
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
    agentId?: string | null,
    falseFlagFactionId?: string | null
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `op-${Date.now()}`,
        actionId: 'ESP_LAUNCH_CATALOG_OP',
        issuerId: actorFactionId,
        targetId: targetRegionId,
        payload: {
            targetFactionId, targetRegionId, definitionId,
            ...(agentId ? { agentId } : {}),
            ...(falseFlagFactionId ? { falseFlagFactionId } : {}),
        },
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

/** Name the culprit of one of our open cases. The worker checks the truth. */
export async function fileAccusationAction(factionId: string, caseId: string, suspectId: string, motive: string | null = null): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `accuse-${Date.now()}`,
        actionId: 'ESP_FILE_ACCUSATION',
        issuerId: factionId,
        targetId: suspectId,
        payload: { caseId, suspectId, ...(motive ? { motive } : {}) },
        timestamp: Math.floor(Date.now() / 1000)
    });
    if (result.success) revalidatePath('/');
    return result;
}

/** Give an open case to the press, naming a suspect. No diplomatic effect. */
export async function leakCaseAction(factionId: string, caseId: string, suspectId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `leak-${Date.now()}`,
        actionId: 'ESP_LEAK_CASE',
        issuerId: factionId,
        targetId: suspectId,
        payload: { caseId, suspectId },
        timestamp: Math.floor(Date.now() / 1000)
    });
    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Pursue a line of inquiry on one of our open files. The worker checks the
 * lead's requirements and charges its Intel; the finding arrives when it is due.
 */
export async function pursueLeadAction(factionId: string, caseId: string, lead: string, targetFactionId: string | null = null): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `lead-${Date.now()}`,
        actionId: 'ESP_PURSUE_LEAD',
        issuerId: factionId,
        targetId: caseId,
        payload: { caseId, lead, ...(targetFactionId ? { targetFactionId } : {}) },
        timestamp: Math.floor(Date.now() / 1000)
    });
    if (result.success) revalidatePath('/');
    return result;
}

/** A security crackdown on one of our worlds (rebel cells, Item 13). */
export async function crackdownAction(factionId: string, planetId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `crackdown-${Date.now()}`,
        actionId: 'REB_CRACKDOWN',
        issuerId: factionId,
        targetId: planetId,
        payload: { planetId },
        timestamp: Math.floor(Date.now() / 1000)
    });
    if (result.success) revalidatePath('/');
    return result;
}

/** Pay a rebel cell in a rival's territory: money, optionally weapons, a cutout, a seconded agent. */
export async function sponsorCellAction(
    factionId: string,
    cellId: string,
    opts: { armed?: boolean; cutout?: boolean; agentId?: string | null } = {}
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `sponsor-${Date.now()}`,
        actionId: 'REB_SPONSOR_CELL',
        issuerId: factionId,
        targetId: cellId,
        payload: { cellId, armed: !!opts.armed, cutout: !!opts.cutout, ...(opts.agentId ? { agentId: opts.agentId } : {}) },
        timestamp: Math.floor(Date.now() / 1000)
    });
    if (result.success) revalidatePath('/');
    return result;
}

/** Item 13d: an order from a person leading a cell from hiding. */
export async function cellOrderAction(
    factionId: string,
    actionId: 'REB_CELL_ACT' | 'REB_CELL_LIE_LOW' | 'REB_CELL_REFUSE_SPONSOR' | 'REB_CELL_DECLARE' | 'REB_JOB_START' | 'REB_JOB_CHOOSE',
    payload: Record<string, unknown> = {}
): Promise<ActionResult> {
    return executePlayerAction({
        id: `cell-${Date.now()}`,
        actionId,
        issuerId: factionId,
        targetId: factionId,
        payload,
        timestamp: Math.floor(Date.now() / 1000)
    });
}

/** Stop paying a cell. */
export async function cutSponsorshipAction(factionId: string, sponsorshipId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `cut-${Date.now()}`,
        actionId: 'REB_CUT_SPONSORSHIP',
        issuerId: factionId,
        targetId: sponsorshipId,
        payload: { sponsorshipId },
        timestamp: Math.floor(Date.now() / 1000)
    });
    if (result.success) revalidatePath('/');
    return result;
}
