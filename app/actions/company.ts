'use server';
/**
 * app/actions/company.ts
 * Multiplayer Authoritative Refactor
 */

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/actions/types';
import type { CharterTerms, CorporateRight, HostPolicyStance } from '@/lib/economy/corporate/charter-types';
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
 * Invest credits into a company (buys newly issued shares at market price).
 */
export async function investCompanyAction(companyId: string, factionId: string, amount: number): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `invest-${Date.now()}`,
        actionId: 'ECON_INVEST_COMPANY',
        issuerId: factionId,
        targetId: companyId,
        payload: { companyId, amount },
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Liquidate a company you founded; treasury is distributed to shareholders.
 */
export async function liquidateCompanyAction(companyId: string, factionId: string): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `liquidate-${Date.now()}`,
        actionId: 'ECON_LIQUIDATE_COMPANY',
        issuerId: factionId,
        targetId: companyId,
        payload: { companyId },
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

// ─── Charter Corporations ────────────────────────────────────────────────────

/** Small helper: every charter order is the same shape apart from its payload. */
async function corporateOrder(
    actionId: Parameters<typeof executePlayerAction>[0]['actionId'],
    factionId: string,
    targetId: string,
    payload: Record<string, unknown>
): Promise<ActionResult> {
    const result = await executePlayerAction({
        id: `${actionId.toLowerCase()}-${Date.now()}`,
        actionId,
        issuerId: factionId,
        targetId,
        payload,
        timestamp: Math.floor(Date.now() / 1000),
    });
    if (result.success) revalidatePath('/');
    return result;
}

/**
 * Grant a full VOC-style charter: mission, operating territory, granted rights,
 * ownership split and the state's profit share.
 */
export async function foundCharterAction(
    factionId: string,
    baseName: string,
    headquartersSystemId: string,
    terms: CharterTerms,
    foundingCapital: number
): Promise<ActionResult> {
    return corporateOrder('CORP_FOUND_CHARTER', factionId, headquartersSystemId, {
        baseName,
        headquartersSystemId,
        mission: terms.mission,
        territory: terms.territory,
        rights: terms.rights,
        ownership: terms.ownership,
        profitShareToState: terms.profitShareToState,
        foundingCapital,
    });
}

/** Answer a company's lobbying: accept, reject or negotiate. */
export async function respondToDemandAction(
    factionId: string,
    demandId: string,
    response: 'accept' | 'reject' | 'negotiate'
): Promise<ActionResult> {
    return corporateOrder('CORP_RESPOND_DEMAND', factionId, demandId, { demandId, response });
}

/** Answer a megaproject proposal: approve, delay, modify or reject. */
export async function respondToProposalAction(
    factionId: string,
    proposalId: string,
    response: 'approve' | 'delay' | 'modify' | 'reject'
): Promise<ActionResult> {
    return corporateOrder('CORP_RESPOND_PROPOSAL', factionId, proposalId, { proposalId, response });
}

/** Settle a corporate crisis by picking one of its options. */
export async function resolveCorporateCrisisAction(
    factionId: string,
    crisisId: string,
    optionId: string
): Promise<ActionResult> {
    return corporateOrder('CORP_RESOLVE_CRISIS', factionId, crisisId, { crisisId, optionId });
}

/** Buy a block of shares out of the open float. */
export async function buySharesAction(factionId: string, companyId: string, shareCount: number): Promise<ActionResult> {
    return corporateOrder('CORP_BUY_SHARES', factionId, companyId, { companyId, shareCount });
}

/** Sell a block of shares back into the float. */
export async function sellSharesAction(factionId: string, companyId: string, shareCount: number): Promise<ActionResult> {
    return corporateOrder('CORP_SELL_SHARES', factionId, companyId, { companyId, shareCount });
}

/** Bid for a controlling stake, paying the takeover premium. */
export async function hostileTakeoverAction(factionId: string, companyId: string): Promise<ActionResult> {
    return corporateOrder('CORP_HOSTILE_TAKEOVER', factionId, companyId, { companyId });
}

/** Fold one charter into another. Requires board control of both. */
export async function mergeCompaniesAction(factionId: string, survivorId: string, absorbedId: string): Promise<ActionResult> {
    return corporateOrder('CORP_MERGE', factionId, survivorId, { survivorId, absorbedId });
}

/** Set how your empire treats a foreign-chartered company inside your borders. */
export async function setHostPolicyAction(
    factionId: string,
    companyId: string,
    stance: HostPolicyStance,
    tariffRate = 0
): Promise<ActionResult> {
    return corporateOrder('CORP_SET_HOST_POLICY', factionId, companyId, { companyId, stance, tariffRate });
}

/** Seize a company you chartered, compensating outside shareholders at market. */
export async function nationalizeCompanyAction(factionId: string, companyId: string): Promise<ActionResult> {
    return corporateOrder('CORP_NATIONALIZE', factionId, companyId, { companyId });
}

/** Revoke a charter outright. */
export async function revokeCharterAction(factionId: string, companyId: string): Promise<ActionResult> {
    return corporateOrder('CORP_REVOKE_CHARTER', factionId, companyId, { companyId });
}

/** Write a right into an existing charter. */
export async function grantRightAction(factionId: string, companyId: string, right: CorporateRight): Promise<ActionResult> {
    return corporateOrder('CORP_GRANT_RIGHT', factionId, companyId, { companyId, right });
}

/** Strike a right out of an existing charter. */
export async function revokeRightAction(factionId: string, companyId: string, right: CorporateRight): Promise<ActionResult> {
    return corporateOrder('CORP_REVOKE_RIGHT', factionId, companyId, { companyId, right });
}

/** Change the share of profit the company remits to the treasury. */
export async function setProfitShareAction(
    factionId: string,
    companyId: string,
    profitShareToState: number
): Promise<ActionResult> {
    return corporateOrder('CORP_SET_PROFIT_SHARE', factionId, companyId, { companyId, profitShareToState });
}

/** Pay credits into a company's treasury. */
export async function subsidizeCompanyAction(factionId: string, companyId: string, amount: number): Promise<ActionResult> {
    return corporateOrder('CORP_SUBSIDIZE', factionId, companyId, { companyId, amount });
}
