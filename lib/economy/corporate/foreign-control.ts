/**
 * lib/economy/corporate/foreign-control.ts
 * A company can be taken through its own share register.
 *
 * WORKER-SIDE. `tickBoardControl` runs once per strategic tick;
 * `reflagCharter` is the CORP_REFLAG order and the AI's equivalent.
 *
 * Buying stock in somebody else's company was already possible. What it bought
 * was dividends. Now a foreign empire that holds a board majority, and keeps it
 * for a Galactic Day, can move the charter to its own flag — the company, its
 * works and its remittance change hands without a shot fired. The founder is
 * told the moment the majority forms and has that day to answer: buy the stock
 * back, or nationalise and pay the raider out at market.
 */

import type { GameWorldState } from '../../game-world-state';
import { fireNotification } from '../../time/notification-hooks';
import { spendPoliticalCapital } from '../../government/government-service';
import * as chronicle from '../../narrative/chronicle';
import type { CharteredCompany } from './company-types';
import { ensureCorporateState } from './company-registry';
import { boardControl, pushCompanyEvent, reflagCost, reflagReadyAt } from './charter-service';
import { transferCharter } from './rogue-service';

function isEmpire(world: GameWorldState, id: string): boolean {
    return !id.startsWith('class:') && world.economy.factions.has(id);
}

/**
 * Note who commands each board and since when, and warn a founder the moment a
 * foreign empire takes a majority of one of its companies.
 */
export function tickBoardControl(world: GameWorldState): void {
    const corp = ensureCorporateState(world);
    const now = world.nowSeconds;

    for (const company of corp.companies.values()) {
        const control = boardControl(company);
        const holder = control.majority && isEmpire(world, control.holderId) ? control.holderId : null;

        if (!holder) { company.boardControl = undefined; continue; }
        if (company.boardControl?.holderId === holder) continue;

        company.boardControl = { holderId: holder, since: now };
        if (holder === company.foundingFactionId || company.nationalized) continue;

        try {
            fireNotification({
                id: `corp-board-${company.id}-${holder}-${now}`,
                factionId: company.foundingFactionId,
                category: 'politics',
                priority: 'urgent',
                title: 'FOREIGN POWER CONTROLS A COMPANY BOARD',
                body: `${world.economy.factions.get(holder)?.name ?? holder} now holds a majority of ${company.charter.fullName}. `
                    + `In one Galactic Day it can move the charter to its own flag. Buy the stock back, or nationalise the company.`,
                createdAt: new Date(now * 1000).toISOString(),
                read: false,
                linkToTab: 'corporate',
                payload: { companyId: company.id, holderId: holder },
            } as any);
        } catch { /* notification queue absent in tests */ }
    }
}

/**
 * A foreign majority holder takes the company under its own flag.
 */
export function reflagCharter(
    world: GameWorldState,
    factionId: string,
    companyId: string
): { ok: true; company: CharteredCompany } | { ok: false; error: string } {
    const corp = ensureCorporateState(world);
    const company = corp.companies.get(companyId);
    if (!company) return { ok: false, error: 'Company not found.' };
    if (company.foundingFactionId === factionId) return { ok: false, error: 'That company already flies your flag.' };
    if (company.nationalized) return { ok: false, error: 'A nationalised company has no board to command.' };

    const control = boardControl(company);
    if (control.holderId !== factionId || !control.majority) {
        return { ok: false, error: `You do not hold a majority of ${company.charter.fullName}.` };
    }
    const readyAt = reflagReadyAt(company, factionId);
    if (readyAt === null || world.nowSeconds < readyAt) {
        return { ok: false, error: 'The board must be yours for one Galactic Day before the charter can be moved.' };
    }
    const cost = reflagCost(company);
    if (!spendPoliticalCapital(world, factionId, cost, `taking ${company.charter.fullName} under the flag`)) {
        return { ok: false, error: `Moving the charter costs ${cost} political capital.` };
    }

    const oldFounder = company.foundingFactionId;
    const name = company.charter.fullName;
    chronicle.record(world, {
        type: 'company_broke_away',
        actorIds: [oldFounder],
        targetIds: [factionId],
        location: company.headquartersSystemId,
        facts: { companyName: name, worldsSeceding: 0, fleetsDefected: 0, defected: true, byTakeover: true },
    });
    pushCompanyEvent(corp.eventLog, company, 'reflagged', { from: oldFounder, to: factionId }, world.nowSeconds);

    transferCharter(world, corp, company, factionId);
    // Bought, not courted: the new owner starts with the board it paid for.
    company.loyalty = 75;
    company.autonomyLevel = 35;
    company.boardControl = { holderId: factionId, since: world.nowSeconds };

    const oldGov = world.government?.get?.(oldFounder);
    if (oldGov) {
        oldGov.legitimacy = Math.max(0, oldGov.legitimacy - 3);
        oldGov.history.push({ timestamp: world.nowSeconds, event: `${name} was bought out from under the state and reflagged abroad.` });
        if (oldGov.history.length > 60) oldGov.history.splice(0, oldGov.history.length - 60);
    }
    try {
        fireNotification({
            id: `corp-reflag-${company.id}-${world.nowSeconds}`,
            factionId: oldFounder,
            category: 'politics',
            priority: 'urgent',
            title: 'COMPANY TAKEN UNDER A FOREIGN FLAG',
            body: `${world.economy.factions.get(factionId)?.name ?? factionId} has moved the charter of ${name} to its own government. Its works inside your borders are now a foreign company's, and yours to tax, ban or seize.`,
            createdAt: new Date(world.nowSeconds * 1000).toISOString(),
            read: false,
            linkToTab: 'corporate',
            payload: { companyId: company.id },
        } as any);
    } catch { /* notification queue absent in tests */ }

    return { ok: true, company };
}
