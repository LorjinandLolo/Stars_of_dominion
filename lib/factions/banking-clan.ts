// lib/factions/banking-clan.ts
//
// The Intergalactic Banking Clan — Genoa's Bank of Saint George rather than the
// Star Wars caricature. A creditor republic that funds other people's wars,
// insures other people's cargo, and collects when the terms are not met.
//
// Six authored traits needed no code. All three economic strengths —
// credits_generation +0.45, trade_value +0.35, market_efficiency +0.25 — route
// to eco_tax_mult and are live today; combat_power_multiplier -0.35, pop_growth
// -0.30 and approval -0.15 are the price. "No native army" is therefore already
// in the game, and their rented strength already works: the mercenary-contract
// system built for the Kaer'Ruun makes the Clan the natural EMPLOYER, and it
// already defaults an employer who cannot pay.
//
// What is missing is the thing they are actually for:
//
//   SOVEREIGN LOANS   lend now, collect per tick, and own the consequences.
//   FORECLOSURE       a debtor who cannot pay surrenders what was pledged.
//   DEFAULT CASCADE   their own solvency rests on other people's promises.
//
// A leaf module: the worker's order handlers and the tick read it, so it imports
// only types, civ-ids and the ledger.

import type { GameWorldState } from '../game-world-state';
import type { BankingTraitState, SovereignLoan } from './faction-traits-types';
import { CIV_BANKING, isBankingClan } from './civ-ids';
import { bumpMetric } from '../tech/history-ledger';

export const BANKING_CIV_ID = CIV_BANKING;

export const LOANS_METRIC = 'bnk.loansIssued';
export const DEFAULTS_METRIC = 'bnk.defaults';
export const FORECLOSURE_METRIC = 'bnk.foreclosures';

const TICK_SECONDS = 6 * 60 * 60;

/**
 * The reserve key. UPPERCASE, and this is not a style preference: world.tributes
 * has never moved a single credit because it stores 'credits' lowercase while
 * every faction reserve is keyed 'CREDITS', so both sides read undefined. Every
 * transfer here normalises at the boundary for exactly that reason.
 */
export const CREDIT_KEY = 'CREDITS';

/** Interest charged per strategic tick, as a fraction of principal. */
export const INTEREST_PER_TICK = 0.02;
/** Shortest and longest terms the Clan will write. */
export const MIN_TERM_TICKS = 8;
export const MAX_TERM_TICKS = 60;
/** Consecutive missed payments before the loan is called. */
export const MISSED_PAYMENTS_BEFORE_DEFAULT = 3;

export function bankingState(world: GameWorldState, factionId: string): BankingTraitState | undefined {
    return world.factionTraits?.get(factionId)?.banking;
}

function reservesOf(world: GameWorldState, factionId: string): Record<string, number> | undefined {
    return ((world as any).economy?.factions?.get(factionId) as any)?.reserves;
}

export function creditsOf(world: GameWorldState, factionId: string): number {
    return reservesOf(world, factionId)?.[CREDIT_KEY] ?? 0;
}

/**
 * Move credits between two factions.
 *
 * Copies promise-service, the one demonstrably correct faction-to-faction
 * transfer in the repo, rather than step6_trade. Returns what actually moved,
 * which is what makes a partial payment expressible instead of silently
 * writing a negative reserve.
 */
function transferCredits(world: GameWorldState, fromId: string, toId: string, amount: number): number {
    if (amount <= 0) return 0;
    const from = reservesOf(world, fromId);
    const to = reservesOf(world, toId);
    if (!from || !to) return 0;
    const available = from[CREDIT_KEY] ?? 0;
    const moved = Math.min(amount, Math.max(0, available));
    if (moved <= 0) return 0;
    from[CREDIT_KEY] = available - moved;
    to[CREDIT_KEY] = (to[CREDIT_KEY] ?? 0) + moved;
    return moved;
}

// ─── Issuing ────────────────────────────────────────────────────────────────

export interface LoanResult {
    ok: boolean;
    reason?: string;
    loan?: SovereignLoan;
}

/**
 * Write a sovereign loan. The principal moves immediately; that is the point of
 * a loan and also what makes it a real decision — the Clan is poorer today in
 * exchange for a claim on someone else's tomorrow.
 */
export function issueSovereignLoan(
    world: GameWorldState,
    lenderId: string,
    borrowerId: string,
    principal: number,
    termTicks: number,
): LoanResult {
    if (!isBankingClan(world, lenderId)) {
        return { ok: false, reason: 'Only the Clan writes sovereign paper.' };
    }
    if (!borrowerId || borrowerId === lenderId) {
        return { ok: false, reason: 'The Clan does not lend to itself.' };
    }
    if (!reservesOf(world, borrowerId)) {
        return { ok: false, reason: 'That power has no treasury to credit.' };
    }
    if (!(principal > 0)) return { ok: false, reason: 'A loan needs a principal.' };
    if (creditsOf(world, lenderId) < principal) {
        return { ok: false, reason: 'The Clan cannot advance what it does not hold.' };
    }

    const term = Math.max(MIN_TERM_TICKS, Math.min(Math.round(termTicks) || MIN_TERM_TICKS, MAX_TERM_TICKS));
    const st = bankingState(world, lenderId);
    if (!st) return { ok: false, reason: 'No ledger.' };

    const moved = transferCredits(world, lenderId, borrowerId, principal);
    if (moved < principal) {
        // Put back whatever moved rather than writing a half-funded loan.
        transferCredits(world, borrowerId, lenderId, moved);
        return { ok: false, reason: 'The advance could not be funded in full.' };
    }

    const now = world.nowSeconds ?? 0;
    const loan: SovereignLoan = {
        id: `loan-${borrowerId}-${now}`,
        lenderFactionId: lenderId,
        borrowerFactionId: borrowerId,
        principal,
        outstanding: principal * (1 + INTEREST_PER_TICK * term),
        paymentPerTick: (principal * (1 + INTEREST_PER_TICK * term)) / term,
        issuedAtSeconds: now,
        dueAtSeconds: now + term * TICK_SECONDS,
        missedPayments: 0,
        collected: 0,
        status: 'active',
    };
    st.loans[loan.id] = loan;
    st.loansIssued += 1;
    bumpMetric(world as any, lenderId, LOANS_METRIC, 1);
    console.log(`[Banking Clan] Advanced ${principal} to ${borrowerId} over ${term} ticks.`);
    return { ok: true, loan };
}

// ─── Servicing ──────────────────────────────────────────────────────────────

/** Loans the Clan currently holds against a given power. */
export function loansAgainst(world: GameWorldState, lenderId: string, borrowerId: string): SovereignLoan[] {
    const st = bankingState(world, lenderId);
    if (!st) return [];
    return Object.values(st.loans).filter(l => l.borrowerFactionId === borrowerId && l.status === 'active');
}

/** Total still owed to the Clan across every active loan. */
export function totalOutstanding(world: GameWorldState, lenderId: string): number {
    const st = bankingState(world, lenderId);
    if (!st) return 0;
    return Object.values(st.loans)
        .filter(l => l.status === 'active')
        .reduce((sum, l) => sum + l.outstanding, 0);
}

/**
 * One tick of debt service.
 *
 * A borrower who can pay, pays. One who cannot misses, and after
 * MISSED_PAYMENTS_BEFORE_DEFAULT consecutive misses the loan is called.
 *
 * Failure semantics are deliberate and match the mercenary contracts: a missed
 * payment does NOT compound. Debt that silently grows while a player is losing a
 * war is a mechanic nobody can reason about, and it would make a single bad loan
 * unrecoverable rather than expensive.
 */
export function serviceLoans(world: GameWorldState, lenderId: string): { collected: number; defaulted: string[] } {
    const st = bankingState(world, lenderId);
    if (!st) return { collected: 0, defaulted: [] };

    let collected = 0;
    const defaulted: string[] = [];

    for (const loan of Object.values(st.loans)) {
        if (loan.status !== 'active') continue;

        const due = Math.min(loan.paymentPerTick, loan.outstanding);
        const paid = transferCredits(world, loan.borrowerFactionId, lenderId, due);

        if (paid >= due - 1e-9) {
            loan.outstanding = Math.max(0, loan.outstanding - paid);
            loan.collected += paid;
            loan.missedPayments = 0;
            collected += paid;
            if (loan.outstanding <= 1e-9) {
                loan.status = 'repaid';
                st.loansRepaid += 1;
                console.log(`[Banking Clan] ${loan.borrowerFactionId} has cleared its paper.`);
            }
        } else {
            // Partial payments still count for what they were — the Clan takes
            // what is there — but the tick is a miss.
            loan.outstanding = Math.max(0, loan.outstanding - paid);
            loan.collected += paid;
            collected += paid;
            loan.missedPayments += 1;
            if (loan.missedPayments >= MISSED_PAYMENTS_BEFORE_DEFAULT) {
                loan.status = 'defaulted';
                st.defaults += 1;
                defaulted.push(loan.id);
                bumpMetric(world as any, lenderId, DEFAULTS_METRIC, 1);
                console.log(`[Banking Clan] ${loan.borrowerFactionId} has defaulted. The terms were not met.`);
            }
        }
    }

    st.totalCollected += collected;
    return { collected, defaulted };
}

// ─── Foreclosure ────────────────────────────────────────────────────────────

export interface ForeclosureResult {
    ok: boolean;
    reason?: string;
    /** Company whose shares were seized, when the debtor had one to pledge. */
    companyId?: string;
    sharesSeized?: number;
    creditsSeized?: number;
}

/**
 * Collect when the terms are not met.
 *
 * Prefers the CHARTER — "territory arrives by foreclosure" — because the
 * corporate layer already models a company as an owned, valuable thing with
 * shareholders and monopoly rights. Seizing a debtor's stake is a real transfer
 * of a real asset, not a number adjustment.
 *
 * Falls back to hard currency when the debtor holds no charter, so a defaulting
 * power without a company is not simply forgiven — that fallback is what keeps
 * the mechanic from being dead against most of the galaxy, since only a few
 * factions ever found companies.
 */
export function forecloseOn(world: GameWorldState, lenderId: string, loanId: string): ForeclosureResult {
    if (!isBankingClan(world, lenderId)) return { ok: false, reason: 'Only the Clan forecloses.' };
    const st = bankingState(world, lenderId);
    const loan = st?.loans?.[loanId];
    if (!st || !loan) return { ok: false, reason: 'No such instrument.' };
    if (loan.status !== 'defaulted') return { ok: false, reason: 'That loan is not in default.' };

    const debtor = loan.borrowerFactionId;
    const owed = loan.outstanding;

    // 1. The charter, if they have one.
    const companies = (world as any).corporate?.companies;
    if (companies?.values) {
        for (const company of companies.values() as Iterable<any>) {
            const held = company?.shareholders?.[debtor] ?? 0;
            if (held > 0) {
                company.shareholders[debtor] = 0;
                company.shareholders[lenderId] = (company.shareholders[lenderId] ?? 0) + held;
                loan.status = 'foreclosed';
                st.foreclosures += 1;
                bumpMetric(world as any, lenderId, FORECLOSURE_METRIC, 1);
                console.log(`[Banking Clan] Foreclosed on ${debtor}: ${held} shares of ${company.id} transferred.`);
                return { ok: true, companyId: company.id, sharesSeized: held };
            }
        }
    }

    // 2. Otherwise take what is in the vault, up to what is owed.
    const seized = transferCredits(world, debtor, lenderId, owed);
    loan.status = 'foreclosed';
    st.foreclosures += 1;
    bumpMetric(world as any, lenderId, FORECLOSURE_METRIC, 1);
    console.log(`[Banking Clan] Foreclosed on ${debtor}: ${Math.round(seized)} credits seized.`);
    return { ok: true, creditsSeized: seized };
}

// ─── Default cascade ────────────────────────────────────────────────────────

/**
 * "A default cascade can unmake it."
 *
 * Their strength is other people's promises, so bad paper is a real solvency
 * risk rather than a missed opportunity. Returns 0..1 — the share of everything
 * they are owed that has gone bad.
 *
 * Derived from the ledger, never stored: loans are serviced every tick and a
 * cached ratio would report last tick's book.
 */
export function badDebtRatio(world: GameWorldState, lenderId: string): number {
    const st = bankingState(world, lenderId);
    if (!st) return 0;
    let bad = 0;
    let total = 0;
    for (const loan of Object.values(st.loans)) {
        if (loan.status === 'repaid' || loan.status === 'foreclosed') continue;
        total += loan.outstanding;
        if (loan.status === 'defaulted') bad += loan.outstanding;
    }
    return total > 0 ? bad / total : 0;
}

/** Peak penalty when the whole book has gone bad. */
export const CASCADE_TAX_PENALTY = 0.5;
export const CASCADE_APPROVAL_PENALTY = 0.25;

/**
 * The cascade as a government modifier source.
 *
 * PENALTY-ONLY: a clean book contributes exactly zero, so the civ pipeline's
 * authored bonuses stand alone and nothing is counted twice.
 */
export function getCascadeModifiers(world: GameWorldState, factionId: string): Record<string, number> {
    if (!isBankingClan(world, factionId)) return {};
    const bad = badDebtRatio(world, factionId);
    if (!bad) return {};
    return {
        tax_income: -bad * CASCADE_TAX_PENALTY,
        approval: -bad * CASCADE_APPROVAL_PENALTY,
    };
}

// ─── Tick ───────────────────────────────────────────────────────────────────

export function tickBankingClan(
    world: GameWorldState,
    traits: { banking?: BankingTraitState; factionId: string },
): void {
    const st = traits.banking;
    if (!st) return;
    serviceLoans(world, traits.factionId);
    st.outstandingAtLastTick = totalOutstanding(world, traits.factionId);
    st.lastEvaluatedSeconds = world.nowSeconds ?? 0;
}
