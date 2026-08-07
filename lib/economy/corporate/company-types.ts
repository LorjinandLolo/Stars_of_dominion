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
import type {
    CorporateMission,
    OperatingTerritory,
    CorporateRight,
    CorporatePersonality,
    CorporateAsset,
    CorporateActionRecord,
    CorporateStanding,
} from './charter-types';

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

    /** Latch: set once when autonomy crosses the rogue threshold. */
    hasGoneRogue?: boolean;
    /** Share price before the last adjustment (for UI tickers). */
    sharePricePrev?: number;

    // ── Charter Corporation layer ───────────────────────────────────────────
    // Every field below is optional: companies chartered before this layer
    // existed are backfilled by `ensureCharterFields` at world load, so the
    // simulation may assume they are present after bootstrap.

    /** What the charter authorises it to do for a living. */
    mission?: CorporateMission;
    /** How far from home the charter lets it operate. */
    territory?: OperatingTerritory;
    /** Individual privileges written into the charter. */
    rights?: CorporateRight[];
    /** Drives every decision the company makes without being asked. */
    personality?: CorporatePersonality;
    /** Share of profit returned to the founding government, 0–1. */
    profitShareToState?: number;
    /** Cumulative credits remitted to the founding government. */
    stateRemittanceTotal?: number;

    /** 0–100. Political weight: employment, revenue, infrastructure, trade, arms. */
    influence?: number;
    /**
     * 0–100. How willingly it does what the founding government asks. Distinct
     * from autonomy: a loyal company may be highly autonomous (trusted), and a
     * tightly-held one may be deeply disloyal (resentful).
     */
    loyalty?: number;
    /** Consecutive demands the founding government has refused. */
    refusedDemands?: number;
    /** Demands the founding government has granted. */
    grantedDemands?: number;
    /** Derived arc position: instrument → partner → power → rival → rogue. */
    standing?: CorporateStanding;

    /** Physical holdings the company bought with its own money. */
    assets?: CorporateAsset[];
    /** Systems the company operates in — assets, colonies or monopolies. */
    presenceSystemIds?: string[];
    /** Foreign empires whose space this company operates inside. */
    operatingFactionIds?: string[];

    /** Sim-seconds of the last autonomous growth cycle. */
    lastGrowthAt?: number;
    /** Sim-seconds of the last demand issued to the founding government. */
    lastDemandAt?: number;
    /** Sim-seconds of the last crisis this company generated. */
    lastCrisisAt?: number;
    /** Sim-seconds of the last megaproject proposal. */
    lastProposalAt?: number;
    /** Bounded ring of autonomous decisions, newest last. */
    growthLog?: CorporateActionRecord[];

    /** Outstanding debt in credits. Serviced from treasury each dividend period. */
    debt?: number;
    /** Permanent income added by completed megaprojects, credits per tick. */
    megaprojectIncome?: number;
    /** Credits per tick owed to the founding state by completed megaprojects. */
    stateMegaprojectIncome?: number;
    /** Set when the state has nationalised the company; it no longer acts freely. */
    nationalized?: boolean;
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
    | 'governance_expanded'
    // ── Charter Corporation layer ──
    | 'chartered'
    | 'grew'
    | 'demand_issued'
    | 'demand_resolved'
    | 'crisis_opened'
    | 'crisis_resolved'
    | 'megaproject_proposed'
    | 'megaproject_started'
    | 'megaproject_completed'
    | 'shares_traded'
    | 'takeover'
    | 'merged'
    | 'nationalized'
    | 'host_policy_changed'
    | 'rivalry_escalated'
    | 'standing_changed';

export interface CompanyEvent {
    type: CompanyEventType;
    companyId: string;
    payload: Record<string, unknown>;
    timestamp: number;
}
