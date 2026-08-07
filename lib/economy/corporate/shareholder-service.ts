/**
 * lib/economy/corporate/shareholder-service.ts
 * The equity layer.
 *
 * Shares are the second way to control a company — and the only way to control
 * one somebody else chartered. Buying on the open market, dumping a stake,
 * launching a takeover and merging two charters all live here.
 *
 * Every holder key is either a real faction id or one of the synthetic share
 * classes; the class pools are the float that player purchases come out of.
 */

import type { GameWorldState } from '../../game-world-state';
import type { CharteredCompany } from './company-types';
import type { CorporateWorldState } from './company-registry';
import { SHARE_CLASSES } from './charter-types';
import {
    boardControl,
    computeInfluence,
    computeStanding,
    netAssetValue,
    ownershipPercent,
    pushCompanyEvent,
} from './charter-service';
import { getOrCreateFactionState } from './company-registry';

/** Premium paid over market when buying a block out of the float. */
const MARKET_SPREAD = 1.04;
/** Discount taken when dumping a block back into the float. */
const LIQUIDATION_SPREAD = 0.94;
/** Premium a hostile bid must pay over market to prise shares loose. */
const TAKEOVER_PREMIUM = 1.35;

function reservesOf(world: GameWorldState, factionId: string): Record<string, number> | undefined {
    return world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
}

/** Shares currently sitting in the tradable float, largest pool first. */
function floatPools(company: CharteredCompany): Array<{ key: string; shares: number }> {
    return SHARE_CLASSES
        .map(key => ({ key: key as string, shares: company.shareholders[key] ?? 0 }))
        .filter(p => p.shares > 0)
        .sort((a, b) => b.shares - a.shares);
}

/** Total shares available to buy without a hostile bid. */
export function availableFloat(company: CharteredCompany): number {
    return floatPools(company).reduce((s, p) => s + p.shares, 0);
}

// ─── Open-market trading ─────────────────────────────────────────────────────

/**
 * Buy a block of existing shares out of the float. Credits leave the buyer's
 * treasury and the stake moves onto their name; no new stock is issued, so
 * existing holders are not diluted.
 */
export function buyShares(
    corpState: CorporateWorldState,
    world: GameWorldState,
    companyId: string,
    buyerFactionId: string,
    shareCount: number,
    nowSeconds: number
): { ok: true; cost: number; shares: number } | { ok: false; error: string } {
    const company = corpState.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    const wanted = Math.floor(shareCount);
    if (wanted <= 0) return { ok: false, error: 'Share count must be positive.' };

    const float = availableFloat(company);
    if (float <= 0) return { ok: false, error: 'No shares are being offered on the open market.' };
    const shares = Math.min(wanted, float);

    const price = company.sharePrice * MARKET_SPREAD;
    const cost = shares * price;
    const reserves = reservesOf(world, buyerFactionId);
    if (!reserves || (reserves['CREDITS'] ?? 0) < cost) {
        return { ok: false, error: `Insufficient credits: need ${Math.ceil(cost).toLocaleString()}.` };
    }
    reserves['CREDITS'] -= cost;

    // Draw proportionally from the largest pools first.
    let remaining = shares;
    for (const pool of floatPools(company)) {
        if (remaining <= 0) break;
        const take = Math.min(pool.shares, remaining);
        company.shareholders[pool.key] = pool.shares - take;
        if (company.shareholders[pool.key] <= 0) delete company.shareholders[pool.key];
        remaining -= take;
    }
    company.shareholders[buyerFactionId] = (company.shareholders[buyerFactionId] ?? 0) + shares;
    getOrCreateFactionState(corpState, buyerFactionId).companySharesOwned[companyId] =
        (getOrCreateFactionState(corpState, buyerFactionId).companySharesOwned[companyId] ?? 0) + shares;

    afterOwnershipChange(corpState, company, nowSeconds);
    pushCompanyEvent(corpState.eventLog, company, 'shares_traded', {
        side: 'buy', buyerFactionId, shares, cost: Math.round(cost),
    }, nowSeconds);
    return { ok: true, cost, shares };
}

/** Sell a block back into the float at a discount to market. */
export function sellShares(
    corpState: CorporateWorldState,
    world: GameWorldState,
    companyId: string,
    sellerFactionId: string,
    shareCount: number,
    nowSeconds: number
): { ok: true; proceeds: number; shares: number } | { ok: false; error: string } {
    const company = corpState.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    const held = company.shareholders[sellerFactionId] ?? 0;
    const shares = Math.min(Math.floor(shareCount), held);
    if (shares <= 0) return { ok: false, error: 'You hold no shares to sell.' };

    const proceeds = shares * company.sharePrice * LIQUIDATION_SPREAD;
    company.shareholders[sellerFactionId] = held - shares;
    if (company.shareholders[sellerFactionId] <= 0) delete company.shareholders[sellerFactionId];
    company.shareholders['class:public_shares'] = (company.shareholders['class:public_shares'] ?? 0) + shares;

    const state = getOrCreateFactionState(corpState, sellerFactionId);
    state.companySharesOwned[companyId] = Math.max(0, (state.companySharesOwned[companyId] ?? 0) - shares);
    if (state.companySharesOwned[companyId] === 0) delete state.companySharesOwned[companyId];

    const reserves = reservesOf(world, sellerFactionId);
    if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + proceeds;

    // A large exit is read as a vote of no confidence.
    if (shares / Math.max(1, company.sharesOutstanding) > 0.1) {
        company.sharePricePrev = company.sharePrice;
        company.sharePrice = Math.max(0.01, company.sharePrice * 0.93);
    }

    afterOwnershipChange(corpState, company, nowSeconds);
    pushCompanyEvent(corpState.eventLog, company, 'shares_traded', {
        side: 'sell', sellerFactionId, shares, proceeds: Math.round(proceeds),
    }, nowSeconds);
    return { ok: true, proceeds, shares };
}

// ─── Hostile takeover ────────────────────────────────────────────────────────

/**
 * Bid for control. The raider pays a premium to prise shares out of the float
 * AND out of unwilling holders — including the chartering government, which is
 * how a company can be taken out from under the empire that created it.
 */
export function hostileTakeover(
    corpState: CorporateWorldState,
    world: GameWorldState,
    companyId: string,
    raiderFactionId: string,
    nowSeconds: number
): { ok: true; cost: number; controlled: boolean } | { ok: false; error: string } {
    const company = corpState.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    if (company.nationalized) return { ok: false, error: 'A nationalised company is not traded.' };

    const total = Math.max(1, company.sharesOutstanding);
    const held = company.shareholders[raiderFactionId] ?? 0;
    const target = Math.floor(total * 0.5) + 1;
    if (held >= target) return { ok: false, error: 'You already control this company.' };

    const needed = target - held;
    const price = company.sharePrice * TAKEOVER_PREMIUM;
    const cost = needed * price;
    const reserves = reservesOf(world, raiderFactionId);
    if (!reserves || (reserves['CREDITS'] ?? 0) < cost) {
        return { ok: false, error: `A controlling stake costs ${Math.ceil(cost).toLocaleString()} credits at the bid premium.` };
    }
    reserves['CREDITS'] -= cost;

    // Take the float first, then squeeze the remaining holders pro-rata.
    let remaining = needed;
    for (const pool of floatPools(company)) {
        if (remaining <= 0) break;
        const take = Math.min(pool.shares, remaining);
        company.shareholders[pool.key] = pool.shares - take;
        if (company.shareholders[pool.key] <= 0) delete company.shareholders[pool.key];
        remaining -= take;
    }
    if (remaining > 0) {
        const others = Object.entries(company.shareholders)
            .filter(([key]) => key !== raiderFactionId)
            .sort((a, b) => b[1] - a[1]);
        for (const [key, shares] of others) {
            if (remaining <= 0) break;
            const take = Math.min(shares, remaining);
            company.shareholders[key] = shares - take;
            if (company.shareholders[key] <= 0) delete company.shareholders[key];
            // Unwilling sellers are paid at the same premium.
            const payout = take * price;
            const sellerReserves = reservesOf(world, key);
            if (sellerReserves) sellerReserves['CREDITS'] = (sellerReserves['CREDITS'] ?? 0) + payout;
            const sellerState = corpState.factionStates.get(key);
            if (sellerState) {
                sellerState.companySharesOwned[companyId] = Math.max(0, (sellerState.companySharesOwned[companyId] ?? 0) - take);
            }
            remaining -= take;
        }
    }

    const acquired = needed - remaining;
    company.shareholders[raiderFactionId] = held + acquired;
    getOrCreateFactionState(corpState, raiderFactionId).companySharesOwned[companyId] = held + acquired;

    // Control changing hands against the founder's will is a rupture.
    if (raiderFactionId !== company.foundingFactionId) {
        company.loyalty = Math.max(0, (company.loyalty ?? 50) - 25);
        company.autonomyLevel = Math.min(100, company.autonomyLevel + 10);
    }
    company.sharePricePrev = company.sharePrice;
    company.sharePrice = company.sharePrice * 1.12;

    afterOwnershipChange(corpState, company, nowSeconds);
    const control = boardControl(company);
    pushCompanyEvent(corpState.eventLog, company, 'takeover', {
        raiderFactionId, shares: acquired, cost: Math.round(cost), majority: control.majority,
    }, nowSeconds);
    return { ok: true, cost, controlled: control.holderId === raiderFactionId && control.majority };
}

// ─── Mergers ─────────────────────────────────────────────────────────────────

/**
 * Fold one charter into another. Only a holder with board control of BOTH
 * companies may do it — which is the point of accumulating stakes.
 */
export function mergeCompanies(
    corpState: CorporateWorldState,
    world: GameWorldState,
    survivorId: string,
    absorbedId: string,
    actingFactionId: string,
    nowSeconds: number
): { ok: true } | { ok: false; error: string } {
    const survivor = corpState.companies.get(survivorId);
    const absorbed = corpState.companies.get(absorbedId);
    if (!survivor || !absorbed) return { ok: false, error: 'One of those companies no longer exists.' };
    if (survivorId === absorbedId) return { ok: false, error: 'A company cannot merge with itself.' };

    for (const company of [survivor, absorbed]) {
        const control = boardControl(company);
        if (control.holderId !== actingFactionId || !control.majority) {
            return { ok: false, error: `You do not control the board of ${company.charter.fullName}.` };
        }
    }

    survivor.assets = [...(survivor.assets ?? []), ...(absorbed.assets ?? [])];
    survivor.infrastructureOwned = [...survivor.infrastructureOwned, ...absorbed.infrastructureOwned];
    survivor.corporateColonies = [...new Set([...survivor.corporateColonies, ...absorbed.corporateColonies])];
    survivor.presenceSystemIds = [...new Set([...(survivor.presenceSystemIds ?? []), ...(absorbed.presenceSystemIds ?? [])])];
    survivor.operatingFactionIds = [...new Set([...(survivor.operatingFactionIds ?? []), ...(absorbed.operatingFactionIds ?? [])])];
    survivor.treasury += absorbed.treasury;
    survivor.debt = (survivor.debt ?? 0) + (absorbed.debt ?? 0);
    survivor.privateFleetSize = Math.min(100, survivor.privateFleetSize + absorbed.privateFleetSize);
    survivor.megaprojectIncome = (survivor.megaprojectIncome ?? 0) + (absorbed.megaprojectIncome ?? 0);
    survivor.stateMegaprojectIncome = (survivor.stateMegaprojectIncome ?? 0) + (absorbed.stateMegaprojectIncome ?? 0);
    for (const [resource, systems] of Object.entries(absorbed.monopolyRights)) {
        const key = resource as keyof typeof survivor.monopolyRights;
        survivor.monopolyRights[key] = [...new Set([...(survivor.monopolyRights[key] ?? []), ...(systems ?? [])])];
    }
    survivor.rights = [...new Set([...(survivor.rights ?? []), ...(absorbed.rights ?? [])])];

    // Absorbed holders are compensated in survivor stock, issued at par.
    const absorbedValue = Math.max(1, netAssetValue(absorbed));
    const newShares = Math.round(absorbedValue / Math.max(0.01, survivor.sharePrice));
    const absorbedTotal = Math.max(1, absorbed.sharesOutstanding);
    for (const [holderId, shares] of Object.entries(absorbed.shareholders)) {
        if (shares <= 0) continue;
        const grant = Math.round(newShares * (shares / absorbedTotal));
        survivor.shareholders[holderId] = (survivor.shareholders[holderId] ?? 0) + grant;
        const state = corpState.factionStates.get(holderId);
        if (state) {
            state.companySharesOwned[survivorId] = (state.companySharesOwned[survivorId] ?? 0) + grant;
            delete state.companySharesOwned[absorbedId];
            state.charteredCompanyIds = state.charteredCompanyIds.filter(id => id !== absorbedId);
        }
    }
    survivor.sharesOutstanding += newShares;

    corpState.companies.delete(absorbedId);
    for (const [key, rivalry] of corpState.rivalries) {
        if (rivalry.companyAId === absorbedId || rivalry.companyBId === absorbedId) corpState.rivalries.delete(key);
    }
    for (const [key, demand] of corpState.demands) {
        if (demand.companyId === absorbedId && demand.status === 'pending') corpState.demands.delete(key);
    }
    for (const [key, crisis] of corpState.crises) {
        if (crisis.companyId === absorbedId && crisis.status === 'pending') corpState.crises.delete(key);
    }

    afterOwnershipChange(corpState, survivor, nowSeconds);
    pushCompanyEvent(corpState.eventLog, survivor, 'merged', {
        absorbedId, absorbedName: absorbed.charter.fullName, newShares,
    }, nowSeconds);
    void world;
    return { ok: true };
}

// ─── Board effects ───────────────────────────────────────────────────────────

/**
 * Ownership drives politics. A company whose board the founding government
 * controls is easy to steer; one dominated by outside money drifts, however
 * generous its original charter was.
 */
export function afterOwnershipChange(
    corpState: CorporateWorldState,
    company: CharteredCompany,
    nowSeconds: number
): void {
    const stateStake = ownershipPercent(company, company.foundingFactionId);
    // Recompute the leash from the cap table: majority state ownership pulls
    // autonomy down, a minority stake lets it climb.
    const pull = (50 - stateStake) * 0.06;
    company.autonomyLevel = Math.max(0, Math.min(100, company.autonomyLevel + pull));
    company.influence = computeInfluence(company);
    const before = company.standing;
    company.standing = computeStanding(company);
    if (before !== company.standing) {
        pushCompanyEvent(corpState.eventLog, company, 'standing_changed', {
            from: before, to: company.standing, cause: 'ownership',
        }, nowSeconds);
    }
}
