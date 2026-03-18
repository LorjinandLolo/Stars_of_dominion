/**
 * lib/economy/corporate/company-types.ts
 * Phase 14 — Chartered Companies & Transport Monopolies
 *
 * A Chartered Company is a semi-autonomous corporate entity created by
 * an empire to operate trade logistics, enforce monopolies, govern
 * corporate colonies, and issue shares. They exist in the political space
 * between empires and pirates.
 */

import { Resource } from '../../trade-system/types';

// ─── Re-export expanded Resource enum for consumers ──────────────────────────
export { Resource };

// ─── Company Charter & Identity ──────────────────────────────────────────────
 
/**
 * Quasi-sovereign powers granted to a company by its founding charter.
 * Inspired by historical entities like the VOC.
 */
export enum CharterPower {
    /** Can collect tolls on trade routes and hold resource monopolies. */
    MONOPOLY = 'MONOPOLY',
    /** Can establish corporate colonies and govern systems directly. */
    GOVERNANCE = 'GOVERNANCE',
    /** Can maintain a private battlegroup and hire privateers. */
    PARAMILITARY = 'PARAMILITARY',
}

/**
 * The full legal name is always "[baseName] Charter Company".
 * E.g. baseName "Aurelian Spice" → "Aurelian Spice Charter Company"
 */
export interface CompanyCharter {
    baseName: string;
    fullName: string; // auto-filled: `${baseName} Charter Company`
    powers: CharterPower[];
}

// ─── Core Data Model ─────────────────────────────────────────────────────────

export interface CharteredCompany {
    id: string;
    charter: CompanyCharter;
    foundingFactionId: string;
    /** The system where the company HQ and main exchange desk resides. */
    headquartersSystemId: string;
    /** Unix-seconds timestamp when the charter was granted. */
    foundedAt: number;

    // ── Financials ──────────────────────────────────────────────────────────
    /** Current credit balance held by the company. */
    treasury: number;
    /** Total shares ever issued (dilution tracked separately). */
    sharesOutstanding: number;
    /** Last computed share price in credits. */
    sharePrice: number;
    /** FactionID → number of shares held. */
    shareholders: Record<string, number>;
    /** Cumulative dividends paid out to shareholders (per-tick ledger). */
    dividendsPaidTotal: number;
    /** Profit accumulated this "dividend period" (resets on dividend payout). */
    pendingProfit: number;

    // ── Assets ──────────────────────────────────────────────────────────────
    /**
     * Resource → System IDs where this company holds a monopoly.
     * No other faction can trade that resource in those systems without paying a toll.
     */
    monopolyRights: Partial<Record<Resource, string[]>>;
    /**
     * IDs of physical infrastructure assets (trade hubs, depots, relay stations)
     * owned and operated by the company.
     */
    infrastructureOwned: string[];
    /**
     * System IDs under direct corporate governance.
     * These systems do not pay taxes to the founding faction;
     * instead the company distributes profits as dividends.
     */
    corporateColonies: string[];

    // ── Logistics & Security ────────────────────────────────────────────────
    /**
     * Abstracted size of the company's private escort fleet.
     * Higher values reduce piracyRisk on company-operated routes.
     * Scale: 0 (no fleet) → 100 (full battlegroup).
     */
    privateFleetSize: number;
    /** IDs of TradeRoutes currently managed and protected by this company. */
    activeTradeRouteIds: string[];

    // ── Political Status ────────────────────────────────────────────────────
    /**
     * 0 = fully state-controlled, 100 = rogue megacorp operating independently.
     * High autonomy lets the company trade with sanctioned empires and ignore
     * founding-faction embargoes.
     */
    autonomyLevel: number;
    /**
     * 0 = clean, 100 = thoroughly corrupt.
     * Affects unrest in corporate colonies and increases blowback risk.
     */
    corruptionIndex: number;

    /** Whether the founding faction has issued a revocation demand. */
    charterRevocationPending: boolean;
}

// ─── Faction-side Corporate State ────────────────────────────────────────────

/**
 * Attached to a Faction to track their corporate ownership portfolio.
 */
export interface FactionCorporateState {
    factionId: string;
    /** CompanyID → share count held. */
    companySharesOwned: Record<string, number>;
    /** IDs of companies this faction founded. */
    charteredCompanyIds: string[];
    /** Total dividend credits received this session. */
    totalDividendsReceived: number;
}

// ─── Toll & Tariff Ledger ────────────────────────────────────────────────────

export interface CorporateTollRecord {
    companyId: string;
    routeId: string;
    systemId: string;
    resource: Resource;
    tollAmount: number; // credits
    tick: number;
}

// ─── Company Events ──────────────────────────────────────────────────────────

export type CompanyEventType =
    | 'dividend_paid'
    | 'monopoly_granted'
    | 'monopoly_challenged'
    | 'charter_revoked'
    | 'fleet_expanded'
    | 'colony_acquired'
    | 'went_rogue'
    | 'share_issued'
    | 'governance_expanded';

export interface CompanyEvent {
    type: CompanyEventType;
    companyId: string;
    payload: Record<string, unknown>;
    timestamp: number;
}
