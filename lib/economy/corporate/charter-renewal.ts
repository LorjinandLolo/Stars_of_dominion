/**
 * lib/economy/corporate/charter-renewal.ts
 * Charters run out.
 *
 * WORKER-SIDE (it notifies, and winds companies up). Called from the strategic
 * tick; the order handler, the delegation runner and the AI all answer through
 * `resolveRenewal`.
 *
 * A charter is granted for a term. One Galactic Day before it expires the board
 * comes back to the table with whatever its weight lets it ask for, and the
 * government answers: grant it, renew the paper as it stands, tighten the terms,
 * or let the charter lapse. That makes the relationship a scheduled negotiation
 * instead of a stream of demands at random — and it is the one moment a state
 * can take ground back without seizing the company.
 *
 * Silence renews on the company's terms. A player who was away does not come
 * back to a dissolved company; they come back to a slightly worse charter.
 */

import type { GameWorldState } from '../../game-world-state';
import { GALACTIC_DAY_SIM_SECONDS } from '../../time/time-config';
import { fireNotification } from '../../time/notification-hooks';
import { spendPoliticalCapital } from '../../government/government-service';
import * as chronicle from '../../narrative/chronicle';
import type { CharteredCompany } from './company-types';
import type { CorporateWorldState } from './company-registry';
import { ensureCorporateState } from './company-registry';
import type {
    CharterRenewal,
    CorporateRight,
    RenewalAsk,
    RenewalResponse,
} from './charter-types';
import { DEFAULT_CHARTER_TERM_DAYS } from './charter-types';
import { ASSET_DEFS, MISSION_DEFS, RIGHT_DEFS, TERRITORY_DEFS } from './charter-catalog';
import {
    TERRITORY_LADDER,
    asWrittenCost,
    computeInfluence,
    computeStanding,
    derivePowersFromRights,
    militaryCap,
    netAssetValue,
    pushCompanyEvent,
    seededRandom,
    stateTermsCost,
} from './charter-service';

// ─── Configuration ───────────────────────────────────────────────────────────

/** How long before expiry the board comes to the table. */
export const RENEWAL_WINDOW_SECONDS = GALACTIC_DAY_SIM_SECONDS;
/** Influence below which a company asks for nothing but its paper back. */
const MIN_INFLUENCE_TO_ASK = 20;
/** Points of state profit share a renewal can move, either way. */
const PROFIT_SHARE_STEP = 0.05;
/** Settled renewals kept for the record. */
const MAX_SETTLED_KEPT = 20;

/** Rights a board asks for once it has what its mission needs, in order. */
const ASK_LADDER: CorporateRight[] = [
    'collect_fees', 'security_forces', 'own_stations', 'armed_escorts',
    'negotiate_agreements', 'defensive_stations', 'collect_tariffs',
];

/**
 * Whether a company told to disband would simply decline. Distance from the
 * leash plus resentment, or enough guns and weight to make the point moot.
 */
export function wouldDefyLapse(company: CharteredCompany): boolean {
    const autonomy = company.autonomyLevel ?? 0;
    const loyalty = company.loyalty ?? 50;
    if (autonomy >= 60 && loyalty < 40) return true;
    return militaryCap(company.rights ?? []) >= 3 && (company.influence ?? 0) >= 50 && loyalty < 55;
}

// ─── The ask ─────────────────────────────────────────────────────────────────

/** The next right this company would want written in, if any. */
function nextRightWanted(company: CharteredCompany): CorporateRight | undefined {
    const held = new Set(company.rights ?? []);
    // First whatever its own mission cannot build without.
    for (const type of MISSION_DEFS[company.mission ?? 'trade'].assetTypes) {
        const needed = ASSET_DEFS[type].requiredRight;
        if (needed && !held.has(needed)) return needed;
    }
    return ASK_LADDER.find(r => !held.has(r));
}

/**
 * What the board asks for at renewal. A weightless company asks for nothing; a
 * significant one asks for money, a right, or room — deterministically, so a
 * replayed world sits down to the same negotiation.
 */
export function draftRenewalAsk(company: CharteredCompany): RenewalAsk {
    if ((company.influence ?? 0) < MIN_INFLUENCE_TO_ASK) {
        return { kind: 'none', text: 'The board asks only that the charter be renewed as it stands.' };
    }

    const options: RenewalAsk[] = [];
    if ((company.profitShareToState ?? 0) >= PROFIT_SHARE_STEP) {
        options.push({
            kind: 'profit_share',
            text: `The board asks that the state's share of profit be cut by ${Math.round(PROFIT_SHARE_STEP * 100)} points in the renewed charter.`,
        });
    }
    const right = nextRightWanted(company);
    if (right) {
        options.push({
            kind: 'right',
            right,
            text: `The board asks that the renewed charter grant the right to ${RIGHT_DEFS[right].name.toLowerCase()}.`,
        });
    }
    const step = TERRITORY_LADDER.indexOf(company.territory ?? 'domestic');
    if ((company.influence ?? 0) >= 40 && step >= 0 && step < TERRITORY_LADDER.length - 1) {
        const wider = TERRITORY_DEFS[TERRITORY_LADDER[step + 1]];
        options.push({
            kind: 'territory',
            text: `The board asks that the renewed charter extend its remit to ${wider.name.toLowerCase()}.`,
        });
    }
    if (options.length === 0) {
        return { kind: 'none', text: 'The board asks only that the charter be renewed as it stands.' };
    }

    const roll = seededRandom(`${company.id}:renewal:${company.renewalCount ?? 0}`)();
    return options[Math.floor(roll * options.length)] ?? options[0];
}

function applyAsk(company: CharteredCompany, ask: RenewalAsk): void {
    switch (ask.kind) {
        case 'profit_share':
            company.profitShareToState = Math.max(0, (company.profitShareToState ?? 0) - PROFIT_SHARE_STEP);
            break;
        case 'right':
            if (ask.right && !(company.rights ?? []).includes(ask.right)) {
                company.rights = [...(company.rights ?? []), ask.right];
                company.charter.powers = derivePowersFromRights(company.rights);
            }
            break;
        case 'territory': {
            const step = TERRITORY_LADDER.indexOf(company.territory ?? 'domestic');
            if (step >= 0 && step < TERRITORY_LADDER.length - 1) company.territory = TERRITORY_LADDER[step + 1];
            break;
        }
        case 'none':
            break;
    }
}

// ─── Outcomes ────────────────────────────────────────────────────────────────

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

function extendCharter(world: GameWorldState, company: CharteredCompany): void {
    const term = (company.charterTermDays ?? DEFAULT_CHARTER_TERM_DAYS) * GALACTIC_DAY_SIM_SECONDS;
    company.charterExpiresAt = Math.max(world.nowSeconds, company.charterExpiresAt ?? world.nowSeconds) + term;
    company.renewalCount = (company.renewalCount ?? 0) + 1;
}

/**
 * Wind a company up in an orderly fashion: call in what the state owes it, pay
 * the shareholders what is left, and strike it from the register.
 */
export function windDownCompany(world: GameWorldState, corp: CorporateWorldState, company: CharteredCompany): number {
    const reservesOf = (id: string) =>
        world.economy.factions.get(id)?.reserves as Record<string, number> | undefined;

    // The bank's paper does not die with the bank: the state settles first.
    const founderReserves = reservesOf(company.foundingFactionId);
    const owed = Math.min(company.stateLoan ?? 0, Math.max(0, founderReserves?.['CREDITS'] ?? 0));
    if (owed > 0 && founderReserves) {
        founderReserves['CREDITS'] -= owed;
        company.treasury += owed;
    }
    company.stateLoan = 0;

    // A forced sale realises half the book value of the works.
    const assetValue = (company.assets ?? []).reduce((s, a) => s + a.value, 0);
    const proceeds = Math.max(0, netAssetValue(company) - assetValue * 0.5);

    const total = Math.max(1, company.sharesOutstanding);
    for (const [holderId, shares] of Object.entries(company.shareholders)) {
        if (shares <= 0) continue;
        const reserves = reservesOf(holderId);
        if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + proceeds * (shares / total);
        const state = corp.factionStates.get(holderId);
        if (state) {
            delete state.companySharesOwned[company.id];
            state.charteredCompanyIds = state.charteredCompanyIds.filter(id => id !== company.id);
        }
    }
    const founderState = corp.factionStates.get(company.foundingFactionId);
    if (founderState) {
        founderState.charteredCompanyIds = founderState.charteredCompanyIds.filter(id => id !== company.id);
    }

    corp.companies.delete(company.id);
    for (const [key, rivalry] of corp.rivalries) {
        if (rivalry.companyAId === company.id || rivalry.companyBId === company.id) corp.rivalries.delete(key);
    }
    for (const [key, demand] of corp.demands) {
        if (demand.companyId === company.id && demand.status === 'pending') corp.demands.delete(key);
    }
    for (const [key, crisis] of corp.crises) {
        if (crisis.companyId === company.id && crisis.status === 'pending') corp.crises.delete(key);
    }
    for (const [key, policy] of corp.hostPolicies) {
        if (policy.companyId === company.id) corp.hostPolicies.delete(key);
    }
    return proceeds;
}

export type RenewalResult = { ok: true; outcome: string } | { ok: false; error: string };

/**
 * The government answers a renewal. `unanswered` is the deadline path: the
 * charter renews on the board's terms and the board draws its own conclusions
 * about who is running the relationship.
 */
export function resolveRenewal(
    world: GameWorldState,
    renewalId: string,
    response: RenewalResponse,
    unanswered = false
): RenewalResult {
    const corp = ensureCorporateState(world);
    const renewal = corp.renewals.get(renewalId);
    if (!renewal) return { ok: false, error: 'That renewal is no longer on the table.' };
    if (renewal.status !== 'pending') return { ok: false, error: 'That renewal has already been settled.' };
    const company = corp.companies.get(renewal.companyId);
    if (!company) {
        renewal.status = 'lapsed';
        return { ok: false, error: 'The company no longer exists.' };
    }
    const name = company.charter.fullName;
    let outcome: string;

    switch (response) {
        case 'company_terms': {
            applyAsk(company, renewal.ask);
            if (unanswered) {
                company.autonomyLevel = clamp100(company.autonomyLevel + 6);
                outcome = `${name} renewed its own charter on its own terms; nobody at the ministry answered.`;
            } else {
                company.loyalty = clamp100((company.loyalty ?? 50) + (renewal.ask.kind === 'none' ? 4 : 10));
                company.autonomyLevel = clamp100(company.autonomyLevel + (renewal.ask.kind === 'none' ? 0 : 3));
                outcome = `${name} renewed on the board's terms.`;
            }
            break;
        }
        case 'as_written': {
            const cost = asWrittenCost(company, renewal.ask);
            if (cost > 0 && !spendPoliticalCapital(world, renewal.factionId, cost, `renewing the ${company.charter.baseName} charter unchanged`)) {
                return { ok: false, error: `Renewing unchanged over the board's objection costs ${cost} political capital.` };
            }
            if (renewal.ask.kind === 'none') {
                company.loyalty = clamp100((company.loyalty ?? 50) + 2);
            } else {
                company.loyalty = clamp100((company.loyalty ?? 50) - 6);
                company.autonomyLevel = clamp100(company.autonomyLevel + 2);
            }
            outcome = `${name} renewed as written.`;
            break;
        }
        case 'state_terms': {
            if (company.boardIndependent) {
                return { ok: false, error: 'The board no longer answers to the ministry; it will not be dictated to.' };
            }
            const cost = stateTermsCost(company);
            if (!spendPoliticalCapital(world, renewal.factionId, cost, `rewriting the ${company.charter.baseName} charter`)) {
                return { ok: false, error: `Dictating terms costs ${cost} political capital.` };
            }
            company.profitShareToState = Math.min(0.6, (company.profitShareToState ?? 0) + PROFIT_SHARE_STEP);
            company.autonomyLevel = clamp100(company.autonomyLevel - 10);
            company.loyalty = clamp100((company.loyalty ?? 50) - 12);
            outcome = `${name} renewed on the state's terms.`;
            break;
        }
        case 'lapse': {
            renewal.status = 'lapsed';
            renewal.resolvedAs = 'lapse';
            if (wouldDefyLapse(company)) {
                // The paper has expired; the company has not.
                company.hasGoneRogue = true;
                company.autonomyLevel = Math.max(company.autonomyLevel, 85);
                company.loyalty = clamp100((company.loyalty ?? 50) - 20);
                company.standing = computeStanding(company);
                pushCompanyEvent(corp.eventLog, company, 'charter_lapsed', { defied: true }, world.nowSeconds);
                return { ok: true, outcome: `${name} refuses to disband. It is operating without a charter.` };
            }
            const founderId = company.foundingFactionId;
            const proceeds = windDownCompany(world, corp, company);
            chronicle.record(world, {
                type: 'charter_revoked',
                actorIds: [founderId],
                location: company.headquartersSystemId,
                facts: { companyName: name, lapsed: true, proceeds: Math.round(proceeds) },
            });
            corp.eventLog.push({
                type: 'charter_lapsed',
                companyId: company.id,
                payload: { defied: false, proceeds: Math.round(proceeds) },
                timestamp: world.nowSeconds,
            });
            return { ok: true, outcome: `${name} was wound up; shareholders were paid ${Math.round(proceeds).toLocaleString()}cr.` };
        }
    }

    extendCharter(world, company);
    renewal.status = 'renewed';
    renewal.resolvedAs = response;
    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);
    pushCompanyEvent(corp.eventLog, company, 'charter_renewed', {
        response, ask: renewal.ask.kind, unanswered, expiresAt: company.charterExpiresAt,
    }, world.nowSeconds);
    return { ok: true, outcome };
}

// ─── Tick ────────────────────────────────────────────────────────────────────

/**
 * Bring charters that are about to expire to the table, and renew on the
 * board's terms any that the government never answered.
 */
export function tickCharterRenewals(world: GameWorldState): void {
    const corp = ensureCorporateState(world);
    const now = world.nowSeconds;

    const pendingByCompany = new Map<string, CharterRenewal>();
    for (const renewal of corp.renewals.values()) {
        if (renewal.status === 'pending') pendingByCompany.set(renewal.companyId, renewal);
    }

    const companies = [...corp.companies.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const company of companies) {
        const pending = pendingByCompany.get(company.id);

        // State property has no charter to renew, and a company that has
        // stopped recognising its charter is not going to ask for another.
        if (company.nationalized || company.hasGoneRogue || company.charterRevocationPending) {
            if (pending) pending.status = 'lapsed';
            if (company.nationalized && typeof company.charterExpiresAt === 'number' && company.charterExpiresAt <= now) {
                company.charterExpiresAt = now + (company.charterTermDays ?? DEFAULT_CHARTER_TERM_DAYS) * GALACTIC_DAY_SIM_SECONDS;
            }
            continue;
        }
        if (typeof company.charterExpiresAt !== 'number') continue;

        if (pending) {
            if (now >= pending.expiresAt) resolveRenewal(world, pending.id, 'company_terms', true);
            continue;
        }
        if (now < company.charterExpiresAt - RENEWAL_WINDOW_SECONDS) continue;

        const renewal: CharterRenewal = {
            id: `cren-${company.id}-${company.renewalCount ?? 0}`,
            companyId: company.id,
            factionId: company.foundingFactionId,
            issuedAt: now,
            // Never less than a full day to answer, even if the tick that
            // noticed came late.
            expiresAt: Math.max(company.charterExpiresAt, now + RENEWAL_WINDOW_SECONDS),
            ask: draftRenewalAsk(company),
            status: 'pending',
        };
        corp.renewals.set(renewal.id, renewal);

        try {
            fireNotification({
                id: renewal.id,
                factionId: renewal.factionId,
                category: 'politics',
                priority: 'normal',
                title: 'CHARTER UP FOR RENEWAL',
                body: `The charter of ${company.charter.fullName} expires in one Galactic Day. ${renewal.ask.text} Unanswered, it renews on the board's terms.`,
                createdAt: new Date(now * 1000).toISOString(),
                read: false,
                linkToTab: 'corporate',
                payload: { companyId: company.id, renewalId: renewal.id },
            } as any);
        } catch { /* notification queue absent in tests */ }
    }

    const settled = [...corp.renewals.values()]
        .filter(r => r.status !== 'pending')
        .sort((a, b) => a.issuedAt - b.issuedAt);
    while (settled.length > MAX_SETTLED_KEPT) {
        const oldest = settled.shift();
        if (oldest) corp.renewals.delete(oldest.id);
    }
}
