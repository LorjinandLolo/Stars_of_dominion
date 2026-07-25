/**
 * lib/economy/corporate/company-registry.ts
 * Phase 14 — Runtime Registry for all Chartered Companies
 *
 * Holds all active company instances and faction corporate states.
 * Exposes tick and lookup functions for integration into the game loop.
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
import { TradeRoute } from '../../trade-system/types';
import { GameWorldState } from '../../game-world-state';

// ─── Registry State ───────────────────────────────────────────────────────────

export interface CorporateWorldState {
    companies: Map<string, CharteredCompany>;
    factionStates: Map<string, FactionCorporateState>;
    tollLog: CorporateTollRecord[];
    eventLog: CompanyEvent[];
    tick: number;
}

export function createEmptyCorporateWorldState(): CorporateWorldState {
    return {
        companies: new Map(),
        factionStates: new Map(),
        tollLog: [],
        eventLog: [],
        tick: 0,
    };
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
    corpState.companies.set(company.id, company);
    return company;
}

// ─── Master Tick ──────────────────────────────────────────────────────────────

/**
 * Tick all active Chartered Companies.
 * Call once per major simulation tick — integrates into the game loop.
 */
export function tickAllCompanies(
    corpState: CorporateWorldState,
    world: GameWorldState
): void {
    corpState.tick += 1;

    const allRoutes = world.economy.tradeRoutes ?? new Map<string, TradeRoute>();

    // Dividends pay real credits into shareholder treasuries.
    const creditFaction = (factionId: string, amount: number) => {
        const reserves = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
        if (reserves && amount > 0) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + amount;
    };

    for (const company of corpState.companies.values()) {
        // Skip revoked companies
        if (company.charterRevocationPending && company.treasury <= 0) continue;

        // A company operates every route its founding faction is a party to —
        // this drives piracy suppression and share-price volume.
        company.activeTradeRouteIds = [...allRoutes.values()]
            .filter(r => {
                const agr = world.economy.tradeAgreements?.get(r.agreementId);
                return !!agr && (agr.aFactionId === company.foundingFactionId || agr.bFactionId === company.foundingFactionId);
            })
            .map(r => r.id);

        tickCompanyLogistics(
            company,
            allRoutes,
            corpState.factionStates,
            corpState.tollLog,
            corpState.eventLog,
            corpState.tick,
            world.nowSeconds,
            creditFaction
        );

        // Corruption destabilizes corporate colonies (the service computed the
        // signal but nobody applied it — do it here where we have the world).
        if (company.corruptionIndex > 50) {
            const unrest = (company.corruptionIndex - 50) * 0.3;
            for (const colonySystemId of company.corporateColonies) {
                for (const planet of world.economy.planets.values()) {
                    if (planet.systemId !== colonySystemId) continue;
                    planet.instability = Math.min(100, planet.instability + unrest * 0.01);
                }
            }
        }
    }

    // Prune logs — keep bounded to avoid unbounded snapshot growth
    if (corpState.tollLog.length > 500) {
        corpState.tollLog = corpState.tollLog.slice(corpState.tollLog.length - 500);
    }
    if (corpState.eventLog.length > 200) {
        corpState.eventLog = corpState.eventLog.slice(corpState.eventLog.length - 200);
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
