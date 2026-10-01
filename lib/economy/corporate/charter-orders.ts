/**
 * lib/economy/corporate/charter-orders.ts
 * The acts of state a government performs on a charter: granting one and
 * seizing one.
 *
 * WORKER-SIDE. These are the single implementations behind the player's
 * CORP_FOUND_CHARTER / CORP_NATIONALIZE orders (scripts/game-loop.ts) and the
 * AI government's own decisions (lib/ai/charter-ai.ts) — one path, so an AI
 * empire pays exactly what a player pays and leaves the same record.
 */

import type { GameWorldState } from '../../game-world-state';
import { getGovernment, spendPoliticalCapital } from '../../government/government-service';
import { hasTechFlag } from '../../tech/flags';
import * as chronicle from '../../narrative/chronicle';
import type { CharteredCompany } from './company-types';
import type { CharterTerms } from './charter-types';
import {
    MIN_LEGITIMACY_TO_CHARTER,
    charterCorporation,
    priceCharter,
    validateCharter,
} from './charter-service';
import { ensureCorporateState, getOrCreateFactionState, registerCompany } from './company-registry';
import { afterOwnershipChange } from './shareholder-service';

export type CharterOrderResult =
    | { ok: true; company: CharteredCompany }
    | { ok: false; error: string };

export interface GrantCharterParams {
    baseName: string;
    headquartersSystemId: string;
    terms: CharterTerms;
    /** Total credits subscribed at founding, all classes of holder together. */
    foundingCapital: number;
}

/**
 * Grant a charter: validate it, check the government may write it, build the
 * company, then charge for it. The company is built BEFORE anything is spent,
 * so the state never pays for a charter that fails to exist.
 */
export function grantCharter(
    world: GameWorldState,
    factionId: string,
    params: GrantCharterParams
): CharterOrderResult {
    const corp = ensureCorporateState(world);
    const { terms } = params;
    const capital = Math.floor(Number(params.foundingCapital) || 0);

    const invalid = validateCharter(terms, params.baseName ?? '', capital);
    if (invalid) return { ok: false, error: invalid };

    const gov = getGovernment(world, factionId);
    if (gov && gov.legitimacy < MIN_LEGITIMACY_TO_CHARTER) {
        return { ok: false, error: 'The government lacks the standing to grant a charter.' };
    }
    if (!hasTechFlag(world, factionId, 'ENABLE_CORPORATE_CHARTERS')) {
        return { ok: false, error: 'Chartering requires the "Trade Route Initialization" technology.' };
    }

    const price = priceCharter(terms, capital);
    const reserves = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    if (!reserves || (reserves['CREDITS'] ?? 0) < price.stateCapital) {
        return {
            ok: false,
            error: `The treasury must subscribe ${price.stateCapital.toLocaleString()} credits for its ${terms.ownership.government}% stake.`,
        };
    }

    const factionState = getOrCreateFactionState(corp, factionId);
    let company: CharteredCompany;
    try {
        company = charterCorporation(
            {
                baseName: params.baseName,
                foundingFactionId: factionId,
                headquartersSystemId: params.headquartersSystemId,
                terms,
                foundingCapital: capital,
                nowSeconds: world.nowSeconds,
                unlockedTechIds: new Set<string>(world.tech?.get?.(factionId)?.unlockedTechIds ?? []),
            },
            factionState
        );
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Charter failed.' };
    }

    if (!spendPoliticalCapital(world, factionId, price.politicalCapital, `granting the ${params.baseName} charter`)) {
        // charterCorporation registered the company on the founder's portfolio;
        // undo that, since the charter is not being granted.
        delete factionState.companySharesOwned[company.id];
        factionState.charteredCompanyIds = factionState.charteredCompanyIds.filter(id => id !== company.id);
        return { ok: false, error: `Granting a charter on these terms costs ${price.politicalCapital} political capital.` };
    }
    // The state subscribes its own share of the founding capital; the rest is
    // raised from investors and arrives as company treasury.
    reserves['CREDITS'] -= price.stateCapital;

    registerCompany(corp, company);
    corp.eventLog.push({
        type: 'chartered',
        companyId: company.id,
        payload: {
            name: company.charter.fullName,
            mission: terms.mission,
            territory: terms.territory,
            rights: terms.rights,
            personality: company.personality,
        },
        timestamp: world.nowSeconds,
    });
    chronicle.record(world, {
        type: 'charter_granted',
        actorIds: [factionId],
        location: company.headquartersSystemId,
        facts: {
            companyName: company.charter.fullName,
            systemName: world.movement.systems.get(company.headquartersSystemId)?.name ?? null,
            mission: terms.mission,
            territory: terms.territory,
            rights: terms.rights.length,
            stateStake: terms.ownership.government,
            capital,
        },
    });
    return { ok: true, company };
}

/** Political capital a nationalisation costs, before compensation. */
export function nationalizationCost(company: CharteredCompany): number {
    return 40 + Math.round((company.influence ?? 0) * 0.5);
}

/** Credits owed to every holder that is not the seizing government. */
export function nationalizationCompensation(company: CharteredCompany, factionId: string): number {
    return Object.entries(company.shareholders)
        .filter(([holderId, shares]) => holderId !== factionId && shares > 0)
        .reduce((sum, [, shares]) => sum + shares * company.sharePrice, 0);
}

/**
 * The state seizes the company outright. Expensive in political capital and in
 * every relationship the company was part of — and the one certain way to stop
 * a rogue company before it breaks away.
 */
export function nationalizeCompany(
    world: GameWorldState,
    factionId: string,
    companyId: string
): CharterOrderResult {
    const corp = ensureCorporateState(world);
    const company = corp.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    if (company.foundingFactionId !== factionId) {
        return { ok: false, error: 'Only the chartering government can nationalise a company.' };
    }
    if (company.nationalized) return { ok: false, error: 'That company is already in state hands.' };

    // Price the buy-out and check affordability BEFORE any money or stock
    // moves — a half-executed seizure would pay holders out of a treasury that
    // could not cover them.
    const outsideHolders = Object.entries(company.shareholders)
        .filter(([holderId, shares]) => holderId !== factionId && shares > 0);
    const compensation = nationalizationCompensation(company, factionId);
    const reserves = world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined;
    if (!reserves || (reserves['CREDITS'] ?? 0) < compensation) {
        return { ok: false, error: `Compensating shareholders requires ${Math.ceil(compensation).toLocaleString()} credits.` };
    }
    const cost = nationalizationCost(company);
    if (!spendPoliticalCapital(world, factionId, cost, `nationalising ${company.charter.fullName}`)) {
        return { ok: false, error: `Nationalisation costs ${cost} political capital.` };
    }

    reserves['CREDITS'] -= compensation;
    for (const [holderId, shares] of outsideHolders) {
        const holderReserves = world.economy.factions.get(holderId)?.reserves as Record<string, number> | undefined;
        if (holderReserves) holderReserves['CREDITS'] = (holderReserves['CREDITS'] ?? 0) + shares * company.sharePrice;
        const st = corp.factionStates.get(holderId);
        if (st) delete st.companySharesOwned[company.id];
    }

    const wasRogue = Boolean(company.hasGoneRogue);
    company.shareholders = { [factionId]: company.sharesOutstanding };
    getOrCreateFactionState(corp, factionId).companySharesOwned[company.id] = company.sharesOutstanding;
    company.nationalized = true;
    company.autonomyLevel = 0;
    company.hasGoneRogue = false;
    company.rogueSince = undefined;
    company.loyalty = 100;
    company.profitShareToState = 0.6;
    afterOwnershipChange(corp, company, world.nowSeconds);
    corp.eventLog.push({
        type: 'nationalized',
        companyId: company.id,
        payload: { compensation: Math.round(compensation), politicalCapital: cost },
        timestamp: world.nowSeconds,
    });
    chronicle.record(world, {
        type: 'company_nationalized',
        actorIds: [factionId],
        location: company.headquartersSystemId,
        facts: {
            companyName: company.charter.fullName,
            compensation: Math.round(compensation),
            wasRogue,
        },
    });

    // Seizing private property is never free politically.
    const gov = getGovernment(world, factionId);
    if (gov) gov.approval = Math.max(0, gov.approval - 6);
    return { ok: true, company };
}
