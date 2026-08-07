/**
 * lib/economy/corporate/company-registry.ts
 * Runtime registry and master tick for all Chartered Companies.
 *
 * Holds every company instance, the per-faction portfolios, and the political
 * ledgers the Charter Corporation layer runs on (demands, crises, megaprojects,
 * host policies, rivalries). The tick below is the single place where a company
 * earns, spends, decides, lobbies and gets into trouble — in that order.
 */

import {
    CharteredCompany,
    FactionCorporateState,
    CorporateTollRecord,
    CompanyEvent,
    CharterPower,
} from './company-types';
import {
    foundCompany,
    tickCompanyLogistics,
} from './company-service';
import type {
    CorporateCrisis,
    CorporateDemand,
    CorporateHostPolicy,
    CorporateRivalry,
    MegaprojectProposal,
} from './charter-types';
import { TradeRoute } from '../../trade-system/types';
import { GameWorldState } from '../../game-world-state';
import {
    computeInfluence,
    computeStanding,
    ensureCharterFields,
} from './charter-service';
import { GROWTH_INTERVAL_SECONDS, decayRivalries, runGrowthCycle } from './corporate-ai';
import {
    expireDemands,
    maybeIssueDemand,
    remitToState,
    tickHostPolicies,
    tickRogueBehaviour,
} from './corporate-politics';
import {
    lapseCrises,
    maybeProposeMegaproject,
    maybeSpawnCrisis,
    tickMegaprojects,
} from './corporate-events';

// ─── Registry State ───────────────────────────────────────────────────────────

export interface CorporateWorldState {
    companies: Map<string, CharteredCompany>;
    factionStates: Map<string, FactionCorporateState>;
    tollLog: CorporateTollRecord[];
    eventLog: CompanyEvent[];
    tick: number;

    // ── Charter Corporation layer ───────────────────────────────────────────
    /** Live and recently-settled lobbying, keyed by demand id. */
    demands: Map<string, CorporateDemand>;
    /** Live and recently-settled corporate crises, keyed by crisis id. */
    crises: Map<string, CorporateCrisis>;
    /** Proposed, building and completed megaprojects, keyed by proposal id. */
    megaprojects: Map<string, MegaprojectProposal>;
    /** How each government treats each foreign company: `${factionId}:${companyId}`. */
    hostPolicies: Map<string, CorporateHostPolicy>;
    /** Standing commercial rivalries, keyed by the sorted company-id pair. */
    rivalries: Map<string, CorporateRivalry>;
}

export function createEmptyCorporateWorldState(): CorporateWorldState {
    return {
        companies: new Map(),
        factionStates: new Map(),
        tollLog: [],
        eventLog: [],
        tick: 0,
        demands: new Map(),
        crises: new Map(),
        megaprojects: new Map(),
        hostPolicies: new Map(),
        rivalries: new Map(),
    };
}

/**
 * Bring a deserialized corporate state up to the current shape. Snapshots
 * written before the Charter Corporation layer have neither the new ledgers nor
 * the new company fields; both are filled in here, idempotently.
 */
export function ensureCorporateState(world: GameWorldState): CorporateWorldState {
    const corp = ((world as any).corporate ??= createEmptyCorporateWorldState()) as CorporateWorldState;
    if (!(corp.companies instanceof Map)) corp.companies = new Map();
    if (!(corp.factionStates instanceof Map)) corp.factionStates = new Map();
    if (!Array.isArray(corp.tollLog)) corp.tollLog = [];
    if (!Array.isArray(corp.eventLog)) corp.eventLog = [];
    if (typeof corp.tick !== 'number') corp.tick = 0;
    if (!(corp.demands instanceof Map)) corp.demands = new Map();
    if (!(corp.crises instanceof Map)) corp.crises = new Map();
    if (!(corp.megaprojects instanceof Map)) corp.megaprojects = new Map();
    if (!(corp.hostPolicies instanceof Map)) corp.hostPolicies = new Map();
    if (!(corp.rivalries instanceof Map)) corp.rivalries = new Map();

    for (const company of corp.companies.values()) {
        ensureCharterFields(company, world.nowSeconds);
    }
    return corp;
}

// ─── Faction State Helpers ────────────────────────────────────────────────────

export function getOrCreateFactionState(
    corpState: CorporateWorldState,
    factionId: string
): FactionCorporateState {
    if (!corpState.factionStates.has(factionId)) {
        corpState.factionStates.set(factionId, {
            factionId,
            companySharesOwned: {},
            charteredCompanyIds: [],
            totalDividendsReceived: 0,
        });
    }
    return corpState.factionStates.get(factionId)!;
}

// ─── Charter Actions ──────────────────────────────────────────────────────────

/**
 * Register a new Chartered Company into the world state.
 *
 * This is the legacy three-power path, kept for callers that only know about
 * CharterPower. Full charters go through `charterCorporation` in
 * charter-service and are inserted by the order handler.
 */
export function charterNewCompany(
    corpState: CorporateWorldState,
    baseName: string,
    foundingFactionId: string,
    headquartersSystemId: string,
    powers: CharterPower[],
    nowSeconds: number,
    unlockedTechIds: Set<string> = new Set()
): CharteredCompany {
    const factionState = getOrCreateFactionState(corpState, foundingFactionId);
    const company = foundCompany(baseName, foundingFactionId, headquartersSystemId, factionState, powers, nowSeconds, unlockedTechIds);
    ensureCharterFields(company, nowSeconds);
    corpState.companies.set(company.id, company);
    return company;
}

/** Insert an already-built company (full charter path). */
export function registerCompany(
    corpState: CorporateWorldState,
    company: CharteredCompany
): CharteredCompany {
    corpState.companies.set(company.id, company);
    return company;
}

// ─── Financial sub-step ───────────────────────────────────────────────────────

/** Per-tick fraction of outstanding debt the company services. */
const DEBT_SERVICE_RATE = 0.02;

/**
 * Income from the company's own holdings, less their upkeep and debt service.
 * Returns the tick's profit from these sources (never negative — a loss is
 * taken against treasury but does not create a remittance).
 */
function tickCompanyAssets(company: CharteredCompany, world: GameWorldState): number {
    const assets = company.assets ?? [];
    const income = assets.reduce((s, a) => s + a.incomePerTick, 0) + (company.megaprojectIncome ?? 0);
    const upkeep = assets.reduce((s, a) => s + a.upkeepPerTick, 0);

    // Debt is serviced before anything is called profit.
    const service = (company.debt ?? 0) * DEBT_SERVICE_RATE;
    company.debt = Math.max(0, (company.debt ?? 0) - service);

    const net = income - upkeep - service;
    company.treasury += net;
    if (net > 0) company.pendingProfit += net;

    // Megaprojects that pay the state do so directly, outside the profit share.
    const stateIncome = company.stateMegaprojectIncome ?? 0;
    if (stateIncome > 0 && !company.hasGoneRogue) {
        const reserves = world.economy.factions.get(company.foundingFactionId)?.reserves as Record<string, number> | undefined;
        if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + stateIncome;
    }
    return Math.max(0, net);
}

// ─── Master Tick ──────────────────────────────────────────────────────────────

/**
 * Tick all active Chartered Companies. Called once per strategic tick (6 sim
 * hours) from tickEconomy.
 */
export function tickAllCompanies(
    corpState: CorporateWorldState,
    world: GameWorldState,
    deltaSeconds = 6 * 3600
): void {
    corpState.tick += 1;
    const now = world.nowSeconds;

    const allRoutes = world.economy.tradeRoutes ?? new Map<string, TradeRoute>();

    // Dividends pay real credits into shareholder treasuries. Synthetic share
    // classes have no faction record, so their dividends simply leave the game.
    const creditFaction = (factionId: string, amount: number) => {
        const reserves = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
        if (reserves && amount > 0) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + amount;
    };

    for (const company of corpState.companies.values()) {
        ensureCharterFields(company, now);

        // Skip revoked companies that have already been stripped.
        if (company.charterRevocationPending && company.treasury <= 0) continue;

        // A company operates every route its founding faction is a party to —
        // this drives piracy suppression and share-price volume.
        company.activeTradeRouteIds = [...allRoutes.values()]
            .filter(r => {
                const agr = world.economy.tradeAgreements?.get(r.agreementId);
                return !!agr && (agr.aFactionId === company.foundingFactionId || agr.bFactionId === company.foundingFactionId);
            })
            .map(r => r.id);

        // ── 1. Trading operations: tolls, piracy suppression, dividends ──────
        const profitBefore = company.pendingProfit;
        tickCompanyLogistics(
            company,
            allRoutes,
            corpState.factionStates,
            corpState.tollLog,
            corpState.eventLog,
            corpState.tick,
            now,
            creditFaction
        );
        // tickCompanyLogistics zeroes pendingProfit on a dividend tick, so a
        // negative delta means the period closed — treat that as no new profit
        // to remit rather than a phantom loss.
        const tollProfit = Math.max(0, company.pendingProfit - profitBefore);

        // ── 2. Its own holdings ──────────────────────────────────────────────
        const assetProfit = tickCompanyAssets(company, world);

        // ── 3. The clause that made the charter worth granting ───────────────
        remitToState(company, world, tollProfit + assetProfit);

        // ── 4. Corruption destabilizes corporate colonies ────────────────────
        if (company.corruptionIndex > 50) {
            const unrest = (company.corruptionIndex - 50) * 0.3;
            for (const colonySystemId of company.corporateColonies) {
                for (const planet of world.economy.planets.values()) {
                    if (planet.systemId !== colonySystemId) continue;
                    planet.instability = Math.min(100, planet.instability + unrest * 0.01);
                }
            }
        }

        // ── 5. A company past the rogue line stops behaving like an asset ────
        tickRogueBehaviour(company, world, now);

        // ── 6. It decides for itself ─────────────────────────────────────────
        if (now - (company.lastGrowthAt ?? 0) >= GROWTH_INTERVAL_SECONDS) {
            try {
                runGrowthCycle(company, world, corpState, now);
            } catch (e) {
                console.error(`[Corporate] growth cycle failed for ${company.id}:`, e);
            }
        }

        // ── 7. It lobbies, it has accidents, it proposes monuments ───────────
        try { maybeIssueDemand(company, corpState, world, now); } catch (e) {
            console.error(`[Corporate] demand generation failed for ${company.id}:`, e);
        }
        try { maybeSpawnCrisis(company, corpState, now); } catch (e) {
            console.error(`[Corporate] crisis generation failed for ${company.id}:`, e);
        }
        try { maybeProposeMegaproject(company, corpState, now); } catch (e) {
            console.error(`[Corporate] megaproject proposal failed for ${company.id}:`, e);
        }

        company.influence = computeInfluence(company);
        company.standing = computeStanding(company);
    }

    // ── 8. Cross-company and cross-empire bookkeeping ───────────────────────
    tickHostPolicies(corpState, world);
    tickMegaprojects(corpState, world, deltaSeconds, now);
    expireDemands(corpState, world, now);
    lapseCrises(corpState, world, now);
    decayRivalries(corpState, now, corpState.eventLog);

    // Prune logs — keep bounded to avoid unbounded snapshot growth
    if (corpState.tollLog.length > 500) {
        corpState.tollLog = corpState.tollLog.slice(corpState.tollLog.length - 500);
    }
    if (corpState.eventLog.length > 200) {
        corpState.eventLog = corpState.eventLog.slice(corpState.eventLog.length - 200);
    }
    // Completed and rejected megaprojects are history; keep the tail only.
    const finished = [...corpState.megaprojects.values()]
        .filter(p => p.status === 'rejected')
        .sort((a, b) => a.proposedAt - b.proposedAt);
    while (finished.length > 20) {
        const oldest = finished.shift();
        if (oldest) corpState.megaprojects.delete(oldest.id);
    }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Returns all companies that hold a monopoly in a given system. */
export function getCompaniesControllingSystem(
    corpState: CorporateWorldState,
    systemId: string
): CharteredCompany[] {
    const result: CharteredCompany[] = [];
    for (const company of corpState.companies.values()) {
        const allMonopolySystems = Object.values(company.monopolyRights).flat();
        if (allMonopolySystems.includes(systemId) || company.corporateColonies.includes(systemId)) {
            result.push(company);
        }
    }
    return result;
}

/** Returns the total share value held by a faction across all companies. */
export function getFactionPortfolioValue(
    corpState: CorporateWorldState,
    factionId: string
): number {
    const state = corpState.factionStates.get(factionId);
    if (!state) return 0;

    let total = 0;
    for (const [companyId, shares] of Object.entries(state.companySharesOwned)) {
        const company = corpState.companies.get(companyId);
        if (company) {
            total += shares * company.sharePrice;
        }
    }
    return total;
}

/** Companies operating inside a given empire's borders that it did not charter. */
export function getForeignCompaniesInEmpire(
    corpState: CorporateWorldState,
    factionId: string
): CharteredCompany[] {
    return [...corpState.companies.values()].filter(c =>
        c.foundingFactionId !== factionId && (c.operatingFactionIds ?? []).includes(factionId)
    );
}

/** Pending business a government needs to answer. */
export function getPendingCorporateBusiness(
    corpState: CorporateWorldState,
    factionId: string
): { demands: CorporateDemand[]; crises: CorporateCrisis[]; proposals: MegaprojectProposal[] } {
    return {
        demands: [...corpState.demands.values()].filter(d => d.factionId === factionId && d.status === 'pending'),
        crises: [...corpState.crises.values()].filter(c => c.factionId === factionId && c.status === 'pending'),
        proposals: [...corpState.megaprojects.values()].filter(
            p => p.factionId === factionId && (p.status === 'proposed' || p.status === 'delayed')
        ),
    };
}
