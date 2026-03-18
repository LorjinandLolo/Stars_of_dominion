/**
 * lib/economy/corporate/company-service.ts
 * Phase 14 — Chartered Company Lifecycle & Economics
 *
 * Pure deterministic functions governing the creation, operation,
 * and financial mechanics of Chartered Companies.
 */

import {
    CharteredCompany,
    FactionCorporateState,
    CompanyCharter,
    CorporateTollRecord,
    CompanyEvent,
    CompanyEventType,
    CharterPower,
} from './company-types';
import { Resource } from '../../trade-system/types';
import { TradeRoute } from '../../trade-system/types';

// ─── Configuration ────────────────────────────────────────────────────────────

const INITIAL_SHARES = 1_000_000;
const INITIAL_SHARE_PRICE = 10;           // credits per share
const INITIAL_TREASURY = 50_000;          // starting operating capital
const DIVIDEND_PERIOD_TICKS = 100;        // how often dividends are paid
const DIVIDEND_PAYOUT_RATIO = 0.6;        // 60% of pending profit → dividends
const TOLL_RATE_BASE = 0.04;              // 4% of flow value per system owned
const PIRACY_SUPPRESSION_PER_FLEET = 0.02; // each fleet unit reduces piracyRisk by 2%
const AUTONOMY_ROGUE_THRESHOLD = 80;
const CORRUPTION_UNREST_MULTIPLIER = 0.3;

// ─── Company Lifecycle ────────────────────────────────────────────────────────

/**
 * Charter a new company. The full legal name is strictly enforced as
 * "[baseName] Charter Company".
 */
export function foundCompany(
    baseName: string,
    foundingFactionId: string,
    headquartersSystemId: string,
    factionState: FactionCorporateState,
    powers: CharterPower[],
    nowSeconds: number,
    unlockedTechIds: Set<string> = new Set()
): CharteredCompany {
    // 0. Tech check
    if (!unlockedTechIds.has('eco_tra_1')) {
        throw new Error('Faction lacks "Chartered Companies" technology to found a company.');
    }

    const charter: CompanyCharter = {
        baseName,
        fullName: `${baseName} Charter Company`,
        powers,
    };

    const company: CharteredCompany = {
        id: `company-${baseName.toLowerCase().replace(/\s+/g, '-')}-${nowSeconds}`,
        charter,
        foundingFactionId,
        headquartersSystemId,
        foundedAt: nowSeconds,

        // Financials
        treasury: INITIAL_TREASURY,
        sharesOutstanding: INITIAL_SHARES,
        sharePrice: INITIAL_SHARE_PRICE,
        shareholders: { [foundingFactionId]: INITIAL_SHARES }, // faction starts with 100%
        dividendsPaidTotal: 0,
        pendingProfit: 0,

        // Assets — bootstrapped with a minor monopoly on the HQ system
        monopolyRights: {},
        infrastructureOwned: [],
        corporateColonies: [],

        // Logistics
        privateFleetSize: 5,
        activeTradeRouteIds: [],

        // Politics
        autonomyLevel: 10,
        corruptionIndex: 0,
        charterRevocationPending: false,
    };

    // Apply Charter Power Initial Bonuses
    if (powers.includes(CharterPower.PARAMILITARY)) {
        company.privateFleetSize += 10; // Initial security detachment
    }
    if (powers.includes(CharterPower.GOVERNANCE)) {
        company.corporateColonies.push(headquartersSystemId); // HQ starts as a corporate colony
    }

    // Grant a nominal monopoly on the HQ system for all resources at founding
    company.monopolyRights[Resource.METALS] = [headquartersSystemId];
    company.monopolyRights[Resource.FOOD] = [headquartersSystemId];

    // Register with the founding faction's portfolio
    factionState.charteredCompanyIds.push(company.id);
    factionState.companySharesOwned[company.id] = INITIAL_SHARES;

    return company;
}

/**
 * Issue new shares to raise capital. Dilutes existing shareholders.
 */
export function issueNewShares(
    company: CharteredCompany,
    newShareCount: number,
    buyerFactionId: string,
    pricePerShare: number,
    buyerState: FactionCorporateState,
    events: CompanyEvent[],
    nowSeconds: number
): void {
    const capitalRaised = newShareCount * pricePerShare;
    company.treasury += capitalRaised;
    company.sharesOutstanding += newShareCount;
    company.shareholders[buyerFactionId] = (company.shareholders[buyerFactionId] ?? 0) + newShareCount;
    buyerState.companySharesOwned[company.id] = (buyerState.companySharesOwned[company.id] ?? 0) + newShareCount;

    events.push({
        type: 'share_issued',
        companyId: company.id,
        payload: { newShareCount, buyerFactionId, capitalRaised },
        timestamp: nowSeconds,
    });
}

// ─── Financial Operations ─────────────────────────────────────────────────────

/**
 * Recompute share price based on Net Asset Value (NAV).
 * NAV = treasury + (infrastructureOwned × estimated value) + routeVolumeFactor
 */
export function adjustSharePrice(
    company: CharteredCompany,
    routeVolumeTotal: number,      // total goods volume across all company routes this period
    infraValuePerAsset = 5_000     // estimated credit value per owned infra node
): void {
    const infraValue = company.infrastructureOwned.length * infraValuePerAsset;
    const routeValue = routeVolumeTotal * 0.5; // 50 credits per unit of flow volume
    const nav = company.treasury + infraValue + routeValue;

    // NAV per share, with a small volatility range ±5%
    const navPerShare = nav / Math.max(1, company.sharesOutstanding);
    const volatility = 1 + (Math.random() * 0.1 - 0.05);
    company.sharePrice = Math.max(0.01, navPerShare * volatility);
}

/**
 * Distribute dividends from pendingProfit to all shareholders.
 * Called every DIVIDEND_PERIOD_TICKS ticks.
 */
export function issueDividends(
    company: CharteredCompany,
    factionStates: Map<string, FactionCorporateState>,
    events: CompanyEvent[],
    nowSeconds: number
): void {
    if (company.pendingProfit <= 0) return;

    const totalPayout = company.pendingProfit * DIVIDEND_PAYOUT_RATIO;
    const retainedEarnings = company.pendingProfit - totalPayout;

    // Retain a portion in treasury
    company.treasury += retainedEarnings;

    // Distribute to shareholders proportionally
    const totalShares = company.sharesOutstanding;
    for (const [factionId, sharesHeld] of Object.entries(company.shareholders)) {
        if (sharesHeld <= 0) continue;
        const dividendAmount = totalPayout * (sharesHeld / totalShares);
        company.dividendsPaidTotal += dividendAmount;

        const factionState = factionStates.get(factionId);
        if (factionState) {
            factionState.totalDividendsReceived += dividendAmount;
        }
    }

    events.push({
        type: 'dividend_paid',
        companyId: company.id,
        payload: { totalPayout, retainedEarnings, perShare: totalPayout / totalShares },
        timestamp: nowSeconds,
    });

    company.pendingProfit = 0;
}

// ─── Per-Tick Simulation ──────────────────────────────────────────────────────

/**
 * The company's core operational loop — runs every simulation tick.
 *
 * 1. Suppresses piracy on company-operated routes using its private fleet.
 * 2. Collects tolls from routes passing through monopoly systems.
 * 3. Pays operating costs (infra upkeep, fleet maintenance).
 * 4. Checks if autonomy has crossed the rogue threshold.
 * 5. Queues dividends for the next payout period.
 */
export function tickCompanyLogistics(
    company: CharteredCompany,
    allRoutes: Map<string, TradeRoute>,
    factionStates: Map<string, FactionCorporateState>,
    tollLog: CorporateTollRecord[],
    events: CompanyEvent[],
    tick: number,
    nowSeconds: number
): void {
    let tickRevenue = 0;

    // 1. Suppress piracy on company-operated routes
    for (const routeId of company.activeTradeRouteIds) {
        const route = allRoutes.get(routeId);
        if (!route) continue;

        const fleetEffect = company.privateFleetSize * PIRACY_SUPPRESSION_PER_FLEET;
        route.piracyRisk = Math.max(0, route.piracyRisk - fleetEffect);
    }

    // 2. Collect tolls from ALL routes passing through monopoly systems
    for (const [resource, systemIds] of Object.entries(company.monopolyRights) as [Resource, string[]][]) {
        if (!systemIds) continue;
        for (const route of allRoutes.values()) {
            const intersectingSystems = route.path.filter(sysId => systemIds.includes(sysId));
            if (intersectingSystems.length === 0) continue;

            // Collect toll for each monopoly system the route passes through
            for (const systemId of intersectingSystems) {
                const tollAmount = route.routePriority * TOLL_RATE_BASE * 100; // credit proxy
                tickRevenue += tollAmount;

                tollLog.push({
                    companyId: company.id,
                    routeId: route.id,
                    systemId,
                    resource,
                    tollAmount,
                    tick,
                });
            }
        }
    }

    // 3. Operating costs — fleet upkeep + infra maintenance
    const fleetUpkeep = company.privateFleetSize * 2;
    const infraUpkeep = company.infrastructureOwned.length * 50;
    const totalCosts = fleetUpkeep + infraUpkeep;

    company.treasury += tickRevenue - totalCosts;
    company.pendingProfit += Math.max(0, tickRevenue - totalCosts);

    // 4. Check for Going Rogue
    if (company.autonomyLevel >= AUTONOMY_ROGUE_THRESHOLD && !company.charterRevocationPending) {
        // Company is functionally independent — emit event
        events.push({
            type: 'went_rogue',
            companyId: company.id,
            payload: { autonomyLevel: company.autonomyLevel, treasury: company.treasury },
            timestamp: nowSeconds,
        });
    }

    // 5. Issue dividends on a fixed period
    if (tick % DIVIDEND_PERIOD_TICKS === 0) {
        issueDividends(company, factionStates, events, nowSeconds);
        adjustSharePrice(company, company.activeTradeRouteIds.length * 1000);
    }

    // 6. Corruption increases unrest in corporate colonies (signal only — unrest applied externally)
    if (company.corruptionIndex > 50) {
        // External caller can read this value and spike SystemNode.unrest
        for (const _colonyId of company.corporateColonies) {
            const unrestContribution = (company.corruptionIndex - 50) * CORRUPTION_UNREST_MULTIPLIER;
            // unrest applied by caller via: system.unrest += unrestContribution
            void unrestContribution;
        }
    }

    // 7. Paramilitary Authority — increased maintenance if fleet is large
    if (company.charter.powers.includes(CharterPower.PARAMILITARY)) {
        const combatMaintenance = company.privateFleetSize * 0.5; // Additional hazard pay
        company.treasury -= combatMaintenance;
        company.pendingProfit -= combatMaintenance;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Grant or expand a monopoly right to a company in specified systems.
 */
export function grantMonopolyRight(
    company: CharteredCompany,
    resource: Resource,
    systemIds: string[],
    events: CompanyEvent[],
    nowSeconds: number
): void {
    const existing = company.monopolyRights[resource] ?? [];
    const added = systemIds.filter(id => !existing.includes(id));
    company.monopolyRights[resource] = [...existing, ...added];

    events.push({
        type: 'monopoly_granted',
        companyId: company.id,
        payload: { resource, systemIds: added },
        timestamp: nowSeconds,
    });
}

/**
 * Revoke a company's charter — used by the founding faction when autonomy is too high
 * or during a political crisis.
 */
export function revokeCharter(
    company: CharteredCompany,
    events: CompanyEvent[],
    nowSeconds: number
): void {
    company.charterRevocationPending = true;
    events.push({
        type: 'charter_revoked',
        companyId: company.id,
        payload: { reason: 'Founding faction revoked charter', autonomyLevel: company.autonomyLevel },
        timestamp: nowSeconds,
    });
}

/**
 * Command the company to expand its privateer fleet.
 * Increases security at the cost of treasury and autonomy risk.
 */
export function commandPrivateers(
    company: CharteredCompany,
    events: CompanyEvent[],
    nowSeconds: number
): void {
    const cost = 5000;
    if (company.treasury < cost) {
        throw new Error('Company lacks sufficient treasury to expand privateer operations.');
    }

    company.treasury -= cost;
    company.privateFleetSize = Math.min(100, company.privateFleetSize + 10);
    company.autonomyLevel = Math.min(100, company.autonomyLevel + 5);

    events.push({
        type: 'fleet_expanded',
        companyId: company.id,
        payload: { cost, newSize: company.privateFleetSize, autonomyDelta: 5 },
        timestamp: nowSeconds,
    });
}

/**
 * Directly tax a corporate colony.
 * Transfers funds to the faction, but increases corruption and autonomy.
 */
export function collectCorporateTax(
    company: CharteredCompany,
    factionState: FactionCorporateState,
    events: CompanyEvent[],
    nowSeconds: number
): number {
    const taxAmount = company.treasury * 0.25; // 25% tax
    if (taxAmount <= 0) {
        throw new Error('Company has no liquid treasury to tax.');
    }

    company.treasury -= taxAmount;
    factionState.totalDividendsReceived += taxAmount;
    company.corruptionIndex = Math.min(100, company.corruptionIndex + 10);
    company.autonomyLevel = Math.min(100, company.autonomyLevel + 2);

    events.push({
        type: 'dividend_paid', // Reusing dividend event for tax record for now
        companyId: company.id,
        payload: { taxAmount, corruptionDelta: 10, autonomyDelta: 2 },
        timestamp: nowSeconds,
    });

    return taxAmount;
}
