'use server';
/**
 * app/actions/company.ts
 * Phase 16 — Wiring: Server Actions for the Corporate Ledger Panel
 *
 * Allows players to charter new companies, grant monopoly rights,
 * and issue new shares — all wired to the in-memory company registry.
 */

import { revalidatePath } from 'next/cache';
import { getCorporateWorldState } from '@/lib/game-world-state-singleton';
import { charterNewCompany, getOrCreateFactionState } from '@/lib/economy/corporate/company-registry';
import { grantMonopolyRight, issueNewShares } from '@/lib/economy/corporate/company-service';
import { Resource, CharterPower } from '@/lib/economy/corporate/company-types';

// ─── Charter a new company ────────────────────────────────────────────────────

export interface CharterResult {
    success: boolean;
    companyId?: string;
    fullName?: string;
    message: string;
}

/**
 * Charter a new Chartered Company.
 * The full legal name is auto-formatted as "[baseName] Charter Company".
 * Called from the "Charter New Company" button in CorporateLedgerPanel.
 */
export async function charterCompanyAction(
    baseName: string,
    foundingFactionId: string,
    headquartersSystemId: string,
    powers: CharterPower[]
): Promise<CharterResult> {
    if (!baseName.trim()) {
        return { success: false, message: 'Company name cannot be empty.' };
    }

    try {
        const corpState = getCorporateWorldState();
        const company = charterNewCompany(
            corpState,
            baseName.trim(),
            foundingFactionId,
            headquartersSystemId,
            powers,
            Date.now() / 1000
        );

        revalidatePath('/');
        return {
            success: true,
            companyId: company.id,
            fullName: company.charter.fullName,
            message: `"${company.charter.fullName}" has been chartered. Initial monopoly established at ${headquartersSystemId}.`,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to charter company';
        console.error('[SERVER ACTION] charterCompanyAction error:', err);
        return { success: false, message };
    }
}

// ─── Grant a monopoly right ───────────────────────────────────────────────────

export interface MonopolyResult {
    success: boolean;
    message: string;
}

/**
 * Grant a resource monopoly to a company in a set of systems.
 */
export async function grantMonopolyAction(
    companyId: string,
    resource: Resource,
    systemIds: string[]
): Promise<MonopolyResult> {
    try {
        const corpState = getCorporateWorldState();
        const company = corpState.companies.get(companyId);
        if (!company) return { success: false, message: `Company ${companyId} not found.` };

        grantMonopolyRight(company, resource, systemIds, corpState.eventLog, Date.now() / 1000);
        revalidatePath('/');
        return {
            success: true,
            message: `${company.charter.fullName} now holds ${resource} monopoly in ${systemIds.join(', ')}.`
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to grant monopoly';
        return { success: false, message };
    }
}

// ─── Issue shares ─────────────────────────────────────────────────────────────

export interface ShareIssueResult {
    success: boolean;
    message: string;
}

/**
 * Issue new shares to raise capital for a company.
 */
export async function issueSharesAction(
    companyId: string,
    buyerFactionId: string,
    shareCount: number,
    pricePerShare: number
): Promise<ShareIssueResult> {
    if (shareCount <= 0 || pricePerShare <= 0) {
        return { success: false, message: 'Share count and price must be positive.' };
    }

    try {
        const corpState = getCorporateWorldState();
        const company = corpState.companies.get(companyId);
        if (!company) return { success: false, message: `Company not found.` };

        const buyerState = getOrCreateFactionState(corpState, buyerFactionId);
        issueNewShares(company, shareCount, buyerFactionId, pricePerShare, buyerState, corpState.eventLog, Date.now() / 1000);

        revalidatePath('/');
        return {
            success: true,
            message: `${shareCount.toLocaleString()} shares issued to ${buyerFactionId} at ${pricePerShare} cr/share. Capital raised: ${(shareCount * pricePerShare).toLocaleString()} cr.`,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to issue shares';
        return { success: false, message };
    }
}

/**
 * Command the company to expand its privateer fleet.
 */
export async function commandPrivateersAction(companyId: string): Promise<MonopolyResult> {
    try {
        const corpState = getCorporateWorldState();
        const company = corpState.companies.get(companyId);
        if (!company) return { success: false, message: 'Company not found.' };

        const { commandPrivateers } = await import('@/lib/economy/corporate/company-service');
        commandPrivateers(company, corpState.eventLog, Date.now() / 1000);
        
        revalidatePath('/');
        return { success: true, message: 'Privateer fleet expanded.' };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to command privateers';
        return { success: false, message };
    }
}

/**
 * Directly tax a corporate colony.
 */
export async function taxColoniesAction(companyId: string, factionId: string): Promise<MonopolyResult> {
    try {
        const corpState = getCorporateWorldState();
        const company = corpState.companies.get(companyId);
        if (!company) return { success: false, message: 'Company not found.' };

        const factionState = getOrCreateFactionState(corpState, factionId);
        const { collectCorporateTax } = await import('@/lib/economy/corporate/company-service');
        const amount = collectCorporateTax(company, factionState, corpState.eventLog, Date.now() / 1000);
        
        revalidatePath('/');
        return { success: true, message: `Collected ${amount.toLocaleString()} cr in corporate taxes.` };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to tax colonies';
        return { success: false, message };
    }
}

/**
 * Simplified equity issuance for the UI.
 */
export async function quickIssueEquitiesAction(companyId: string): Promise<MonopolyResult> {
    try {
        const corpState = getCorporateWorldState();
        const company = corpState.companies.get(companyId);
        if (!company) return { success: false, message: 'Company not found.' };

        // Issue 10,000 shares at current price to the founding faction by default
        const buyerFactionId = company.foundingFactionId;
        const buyerState = getOrCreateFactionState(corpState, buyerFactionId);
        
        const { issueNewShares } = await import('@/lib/economy/corporate/company-service');
        issueNewShares(company, 10000, buyerFactionId, company.sharePrice, buyerState, corpState.eventLog, Date.now() / 1000);

        revalidatePath('/');
        return { success: true, message: '10,000 shares issued successfully.' };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to issue equities';
        return { success: false, message };
    }
}
