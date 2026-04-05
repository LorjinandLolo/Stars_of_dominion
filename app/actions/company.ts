'use server';
/**
 * app/actions/company.ts
 * Multiplayer Authoritative Refactor
 */

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/actions/types';
import { executePlayerAction } from './registry-handler';

/**
 * Charter a new Chartered Company.
 */
export async function charterCompanyAction(
    baseName: string,
    foundingFactionId: string,
    headquartersSystemId: string,
    powers: any[]
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `charter-${Date.now()}`,
        actionId: 'ECON_ESTABLISH_COMPANY',
        issuerId: foundingFactionId,
        targetId: headquartersSystemId,
        payload: { baseName, foundingFactionId, headquartersSystemId, powers },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Grant a resource monopoly to a company in a set of systems.
 */
export async function grantMonopolyAction(
    companyId: string,
    resource: string,
    systemIds: string[],
    factionId: string
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `monopoly-${Date.now()}`,
        actionId: 'ECON_GRANT_MONOPOLY',
        issuerId: factionId,
        targetId: companyId,
        payload: { companyId, resource, systemIds },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Issue new shares to raise capital for a company.
 */
export async function issueSharesAction(
    companyId: string,
    buyerFactionId: string,
    shareCount: number,
    pricePerShare: number
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `shares-${Date.now()}`,
        actionId: 'ECON_ISSUE_SHARES',
        issuerId: buyerFactionId,
        targetId: companyId,
        payload: { companyId, buyerFactionId, shareCount, pricePerShare },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Command the company to expand its privateer fleet.
 */
export async function commandPrivateersAction(companyId: string, factionId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `privateers-${Date.now()}`,
        actionId: 'ECON_COMMAND_PRIVATEERS',
        issuerId: factionId,
        targetId: companyId,
        payload: { companyId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Directly tax a corporate colony.
 */
export async function taxColoniesAction(companyId: string, factionId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `tax-${Date.now()}`,
        actionId: 'ECON_TAX_COLONIES',
        issuerId: factionId,
        targetId: companyId,
        payload: { companyId },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}
