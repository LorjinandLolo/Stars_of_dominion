// lib/government/policy-slots.ts
// How many policies a government can carry at once. Client-safe (no registry,
// no fs): the worker's evaluatePolicy and decreePolicy enforce it, and the
// Government panel reads the same numbers to grey out ENACT.
//
// Until 2026-10 there was no limit. The enlightenment soak's scripted players
// stacked eight approval policies by sim day ~19 and sat at approval 100 for
// the rest of the season, which flattened politics for anyone who read the
// policy list. Three slots make the list a choice: which three, and what each
// one costs you with the groups that oppose it.

import type { GovernmentState } from './types';

/** Active policies plus bills before the chamber, at most. */
export const POLICY_SLOTS = 3;

/**
 * Slots in use: every active policy, plus every pending bill for a policy that
 * is not active yet (a tabled bill holds its slot until the chamber divides).
 * `ignorePolicyId` leaves out a pending bill that the caller is about to
 * replace — a decree overtaking its own bill does not need a second slot.
 */
/** Just what the count reads — the worker's GovernmentState and the client's snapshot both fit. */
export interface PolicySlotReadable {
    activePolicies: GovernmentState['activePolicies'];
    bills?: Array<{ policyId: string; status: string }>;
}

export function policySlotsUsed(gov: PolicySlotReadable, ignorePolicyId?: string): number {
    const active = new Set(gov.activePolicies ?? []);
    let pending = 0;
    for (const bill of gov.bills ?? []) {
        if (bill.status !== 'pending' || active.has(bill.policyId) || bill.policyId === ignorePolicyId) continue;
        pending++;
    }
    return active.size + pending;
}

export function hasFreePolicySlot(gov: Parameters<typeof policySlotsUsed>[0], ignorePolicyId?: string): boolean {
    return policySlotsUsed(gov, ignorePolicyId) < POLICY_SLOTS;
}

export function noSlotMessage(): string {
    return `Every policy slot is taken (${POLICY_SLOTS}). Repeal one first.`;
}
