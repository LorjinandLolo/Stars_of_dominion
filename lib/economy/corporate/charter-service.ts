/**
 * lib/economy/corporate/charter-service.ts
 * Founding, backfill and the derived read-model for Charter Corporations.
 *
 * Pure functions only — nothing here touches the world. The registry tick and
 * the order handlers own all world mutation.
 */

import type { CharteredCompany, FactionCorporateState, CompanyEvent } from './company-types';
import { CharterPower, Resource } from './company-types';
import {
    type CharterTerms,
    type CorporateAsset,
    type CorporateMission,
    type CorporatePersonality,
    type CorporateRight,
    type CorporateStanding,
    type MilitaryTier,
    type OperatingTerritory,
    type OwnershipPlan,
    type RenewalAsk,
    MILITARY_TIERS,
    SHARE_CLASSES,
    CHARTER_TERM_OPTIONS,
    DEFAULT_CHARTER_TERM_DAYS,
    LEGACY_CHARTER_TERM_DAYS,
} from './charter-types';
import {
    MISSION_DEFS,
    TERRITORY_DEFS,
    RIGHT_DEFS,
    PERSONALITY_DEFS,
} from './charter-catalog';
import { techIdsHaveFlag } from '../../tech/flags';
import { GALACTIC_DAY_SIM_SECONDS, atLeastAGalacticDay } from '../../time/time-config';

// ─── Configuration ───────────────────────────────────────────────────────────

export const INITIAL_SHARES = 1_000_000;
export const INITIAL_SHARE_PRICE = 10;
/** Smallest capital subscription that will float a charter. */
export const MIN_FOUNDING_CAPITAL = 20_000;
/**
 * Smallest stake the founding government may hold. A charter the state owns
 * none of cost it no credits at all — every penny came from investors — which
 * made founding a company free. The crown's share is the price of the seal.
 */
export const MIN_STATE_STAKE_PERCENT = 10;
/** Technology gate for chartering — tier-1 trade tech. */
export const CHARTER_TECH_ID = 'eco_t1_2';
/** Government approval required before a charter may be granted. */
export const MIN_LEGITIMACY_TO_CHARTER = 25;
/**
 * How long the founder has to answer a rogue company before it breaks away
 * (rogue-service.ts). Lives here, not there, because the client shows the
 * countdown and must not import the worker-side service.
 */
export const ROGUE_GRACE_SECONDS = atLeastAGalacticDay(3 * 86_400);

/**
 * Below this share of the rogue clock, revoking the charter ends the break
 * (the company winds down as an ordinary revocation). At or above it, the
 * board is too far gone: revoking only tells it the state has given up, and it
 * breaks away on the next strategic tick. The user's rule, 2026-10-06.
 */
export const REVOKE_STOPS_ROGUE_BELOW = 0.5;

/** How far along its rogue clock a company is, 0–1; 0 when it is not rogue. */
export function rogueProgress(company: Pick<CharteredCompany, 'hasGoneRogue' | 'rogueSince'>, nowSeconds: number): number {
    if (!company.hasGoneRogue || typeof company.rogueSince !== 'number') return 0;
    return Math.max(0, Math.min(1, (nowSeconds - company.rogueSince) / ROGUE_GRACE_SECONDS));
}

const GROWTH_LOG_CAP = 30;

// ─── Deterministic RNG ───────────────────────────────────────────────────────

export function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Mulberry32 keyed on a string. Every stochastic corporate decision derives its
 * stream from (companyId, purpose, tick) so a replayed world reaches the same
 * boardroom outcomes.
 */
export function seededRandom(seed: string): () => number {
    let a = hashString(seed);
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Pick one entry from a weighted table using a 0–1 roll. */
export function weightedPick<T extends string>(
    weights: Partial<Record<T, number>>,
    roll: number
): T | null {
    const entries = (Object.entries(weights) as [T, number][]).filter(([, w]) => w > 0);
    if (entries.length === 0) return null;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let cursor = roll * total;
    for (const [key, weight] of entries) {
        cursor -= weight;
        if (cursor <= 0) return key;
    }
    return entries[entries.length - 1][0];
}

// ─── Charter validation ──────────────────────────────────────────────────────

export interface CharterCostBreakdown {
    /** Political capital the founding government must spend. */
    politicalCapital: number;
    /** Credits the state subscribes as its share of the founding capital. */
    stateCapital: number;
    /** Total founding capital raised from all sources. */
    totalCapital: number;
}

/**
 * What a charter as written costs to grant. Rights and reach are priced in
 * political capital because their real price is control, not money.
 */
export function priceCharter(terms: CharterTerms, foundingCapital: number): CharterCostBreakdown {
    const territoryDef = TERRITORY_DEFS[terms.territory];
    const rightsCost = terms.rights.reduce((sum, r) => sum + (RIGHT_DEFS[r]?.charterCost ?? 0), 0);
    // A high state profit share is a concession the investors have to be talked
    // into: it costs political capital to write into the charter.
    const shareCost = Math.round(terms.profitShareToState * 40);
    return {
        politicalCapital: territoryDef.charterCost + rightsCost + shareCost,
        stateCapital: Math.round(foundingCapital * (terms.ownership.government / 100)),
        totalCapital: foundingCapital,
    };
}

/** Returns an error string, or null if the charter as written is legal. */
export function validateCharter(
    terms: CharterTerms,
    baseName: string,
    foundingCapital: number
): string | null {
    if (!baseName || baseName.trim().length < 3) return 'The charter needs a name of at least three characters.';
    const o = terms.ownership;
    const total = o.government + o.privateInvestors + o.foreignInvestors + o.publicShares;
    if (Math.abs(total - 100) > 0.01) return `Ownership must total 100% (currently ${total}%).`;
    if ([o.government, o.privateInvestors, o.foreignInvestors, o.publicShares].some(v => v < 0)) {
        return 'Ownership shares cannot be negative.';
    }
    if (o.government < MIN_STATE_STAKE_PERCENT) {
        return `The state must subscribe at least ${MIN_STATE_STAKE_PERCENT}% of its own charter.`;
    }
    if (terms.termDays !== undefined && !CHARTER_TERM_OPTIONS.includes(terms.termDays)) {
        return `A charter is granted for ${CHARTER_TERM_OPTIONS.join(', ')} Galactic Days.`;
    }
    if (foundingCapital < MIN_FOUNDING_CAPITAL) {
        return `Founding capital must be at least ${MIN_FOUNDING_CAPITAL.toLocaleString()} credits.`;
    }
    if (terms.profitShareToState < 0 || terms.profitShareToState > 0.6) {
        return 'The state\'s profit share must be between 0% and 60% — no investor subscribes above that.';
    }
    // Political rights are meaningless without somewhere to exercise them.
    const politicalRights: CorporateRight[] = ['administer_territories', 'govern_colonies'];
    if (terms.rights.some(r => politicalRights.includes(r)) && terms.territory === 'domestic') {
        return 'Territorial administration rights require a frontier charter or wider.';
    }
    if (terms.rights.includes('private_fleets') && !terms.rights.includes('armed_escorts')) {
        return 'A private fleet requires the right to arm escorts first.';
    }
    if (terms.rights.includes('govern_colonies') && !terms.rights.includes('establish_colonies')) {
        return 'Governing colonies requires the right to establish them.';
    }
    return null;
}

// ─── Personality assignment ──────────────────────────────────────────────────

/**
 * A company's character comes from what it was chartered to do, who paid for
 * it, and what it was allowed to arm itself with. State money makes loyalists;
 * foreign money makes profit-seekers; military rights make militarists.
 */
export function deriveInitialPersonality(
    mission: CorporateMission,
    ownership: OwnershipPlan,
    rights: CorporateRight[],
    seed: string
): CorporatePersonality {
    const weights: Partial<Record<CorporatePersonality, number>> = {};
    const bump = (p: CorporatePersonality, n: number) => { weights[p] = (weights[p] ?? 0) + n; };

    for (const p of MISSION_DEFS[mission].personalityBias) bump(p, 3);

    bump('state_loyalist', ownership.government * 0.12);
    bump('profit_driven', ownership.privateInvestors * 0.08);
    bump('profit_driven', ownership.foreignInvestors * 0.06);
    bump('monopolist', ownership.foreignInvestors * 0.04);
    bump('humanitarian', ownership.publicShares * 0.06);
    bump('conservative', ownership.publicShares * 0.03);

    const militaryRights = rights.filter(r => RIGHT_DEFS[r]?.category === 'military').length;
    const politicalRights = rights.filter(r => RIGHT_DEFS[r]?.category === 'political').length;
    bump('militarist', militaryRights * 1.6);
    bump('monopolist', politicalRights * 1.2);
    bump('corrupt', politicalRights * 0.8);
    bump('expansionist', rights.includes('establish_colonies') ? 3 : 0);
    bump('innovative', mission === 'research' ? 3 : 0);

    return weightedPick(weights, seededRandom(`${seed}:personality`)()) ?? 'profit_driven';
}

// ─── Founding ────────────────────────────────────────────────────────────────

export interface CharterFoundingParams {
    baseName: string;
    foundingFactionId: string;
    headquartersSystemId: string;
    terms: CharterTerms;
    /** Total credits subscribed at founding (state + private + foreign + public). */
    foundingCapital: number;
    nowSeconds: number;
    unlockedTechIds?: Set<string>;
}

/**
 * Grant a charter. Throws with a player-readable message when the charter is
 * illegal or the founder is not technologically ready.
 */
export function charterCorporation(
    params: CharterFoundingParams,
    factionState: FactionCorporateState
): CharteredCompany {
    const { baseName, foundingFactionId, headquartersSystemId, terms, foundingCapital, nowSeconds } = params;

    // Flag rather than id, so a later tech (or a diffusion grant) can also open
    // chartering without this call site learning its id. CHARTER_TECH_ID remains
    // the tech that grants it today.
    if (!techIdsHaveFlag(params.unlockedTechIds, 'ENABLE_CORPORATE_CHARTERS')) {
        throw new Error('Faction lacks "Trade Route Initialization" technology to grant a charter.');
    }
    const invalid = validateCharter(terms, baseName, foundingCapital);
    if (invalid) throw new Error(invalid);

    const id = `company-${baseName.toLowerCase().replace(/\s+/g, '-')}-${nowSeconds}`;

    // Legacy CharterPower flags are derived from the new rights so every Phase-14
    // consumer (toll collection, colony unrest, the old UI) keeps working.
    const powers = derivePowersFromRights(terms.rights);
    const personality = deriveInitialPersonality(terms.mission, terms.ownership, terms.rights, id);
    const termDays = terms.termDays ?? DEFAULT_CHARTER_TERM_DAYS;

    // Shares are split by the ownership plan. Real empires hold their stake
    // under their faction id; the other classes hold theirs under synthetic
    // keys that can never collide with a faction record.
    const shareholders: Record<string, number> = {};
    const alloc = (key: string, pct: number) => {
        const shares = Math.round(INITIAL_SHARES * (pct / 100));
        if (shares > 0) shareholders[key] = (shareholders[key] ?? 0) + shares;
    };
    alloc(foundingFactionId, terms.ownership.government);
    alloc('class:private_investors', terms.ownership.privateInvestors);
    alloc('class:foreign_investors', terms.ownership.foreignInvestors);
    alloc('class:public_shares', terms.ownership.publicShares);

    const company: CharteredCompany = {
        id,
        charter: {
            baseName,
            fullName: `${baseName} Charter Company`,
            powers,
        },
        foundingFactionId,
        headquartersSystemId,
        foundedAt: nowSeconds,

        treasury: foundingCapital,
        sharesOutstanding: INITIAL_SHARES,
        sharePrice: Math.max(0.01, foundingCapital / INITIAL_SHARES),
        shareholders,
        dividendsPaidTotal: 0,
        pendingProfit: 0,

        monopolyRights: {},
        infrastructureOwned: [],
        corporateColonies: [],

        privateFleetSize: terms.rights.includes('armed_escorts') ? 8 : 2,
        activeTradeRouteIds: [],

        // A company that is mostly privately held starts further from the leash.
        autonomyLevel: Math.round(10 + (100 - terms.ownership.government) * 0.15),
        corruptionIndex: 0,
        charterRevocationPending: false,

        // Charter layer
        mission: terms.mission,
        territory: terms.territory,
        rights: [...terms.rights],
        personality,
        profitShareToState: terms.profitShareToState,
        stateRemittanceTotal: 0,
        influence: 0,
        // A long grant is security for the board; a short one is a leash.
        loyalty: Math.round(55 + terms.ownership.government * 0.35 + termLoyaltyBonus(termDays)),
        charterTermDays: termDays,
        charterExpiresAt: nowSeconds + termDays * GALACTIC_DAY_SIM_SECONDS,
        renewalCount: 0,
        refusedDemands: 0,
        grantedDemands: 0,
        standing: 'instrument',
        assets: [],
        presenceSystemIds: [headquartersSystemId],
        operatingFactionIds: [],
        lastGrowthAt: nowSeconds,
        lastDemandAt: nowSeconds,
        lastCrisisAt: nowSeconds,
        lastProposalAt: nowSeconds,
        growthLog: [],
        debt: 0,
        megaprojectIncome: 0,
        stateMegaprojectIncome: 0,
        nationalized: false,
    };

    if (powers.includes(CharterPower.GOVERNANCE)) {
        company.corporateColonies.push(headquartersSystemId);
    }
    // A nominal monopoly at the seat of business — the historical pattern.
    company.monopolyRights[Resource.METALS] = [headquartersSystemId];
    company.monopolyRights[Resource.FOOD] = [headquartersSystemId];

    factionState.charteredCompanyIds.push(company.id);
    factionState.companySharesOwned[company.id] = shareholders[foundingFactionId] ?? 0;

    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);

    return company;
}

/** Map the granted rights onto the three legacy quasi-sovereign power flags. */
export function derivePowersFromRights(rights: CorporateRight[]): CharterPower[] {
    const powers: CharterPower[] = [CharterPower.MONOPOLY];
    const military: CorporateRight[] = ['armed_escorts', 'security_forces', 'mercenary_recruitment', 'defensive_stations', 'private_fleets'];
    const governance: CorporateRight[] = ['establish_colonies', 'administer_territories', 'govern_colonies'];
    if (rights.some(r => military.includes(r))) powers.push(CharterPower.PARAMILITARY);
    if (rights.some(r => governance.includes(r))) powers.push(CharterPower.GOVERNANCE);
    return powers;
}

// ─── Backfill ────────────────────────────────────────────────────────────────

/**
 * Give a pre-charter-layer company the fields the new simulation assumes.
 * Idempotent — safe to run on every world load.
 */
export function ensureCharterFields(company: CharteredCompany, nowSeconds: number): void {
    const powers = company.charter?.powers ?? [];

    if (!company.rights) {
        // Reconstruct plausible rights from the legacy power flags so an old
        // company keeps roughly the capabilities it was granted.
        const rights: CorporateRight[] = ['build_infrastructure', 'collect_fees'];
        if (powers.includes(CharterPower.PARAMILITARY)) rights.push('armed_escorts', 'security_forces');
        if (powers.includes(CharterPower.GOVERNANCE)) rights.push('establish_colonies', 'own_stations');
        company.rights = rights;
    }
    if (!company.mission) company.mission = 'trade';
    if (!company.territory) company.territory = powers.includes(CharterPower.GOVERNANCE) ? 'frontier' : 'domestic';
    if (!company.personality) {
        company.personality = deriveInitialPersonality(
            company.mission,
            { government: 100, privateInvestors: 0, foreignInvestors: 0, publicShares: 0 },
            company.rights,
            company.id
        );
    }
    if (typeof company.profitShareToState !== 'number') company.profitShareToState = 0.15;
    if (typeof company.stateRemittanceTotal !== 'number') company.stateRemittanceTotal = 0;
    if (typeof company.loyalty !== 'number') company.loyalty = Math.max(0, 100 - (company.autonomyLevel ?? 0));
    if (typeof company.refusedDemands !== 'number') company.refusedDemands = 0;
    if (typeof company.grantedDemands !== 'number') company.grantedDemands = 0;
    if (!Array.isArray(company.assets)) company.assets = [];
    if (!Array.isArray(company.presenceSystemIds)) {
        company.presenceSystemIds = [company.headquartersSystemId];
    }
    if (!Array.isArray(company.operatingFactionIds)) company.operatingFactionIds = [];
    if (!Array.isArray(company.growthLog)) company.growthLog = [];
    if (typeof company.lastGrowthAt !== 'number') company.lastGrowthAt = nowSeconds;
    if (typeof company.lastDemandAt !== 'number') company.lastDemandAt = nowSeconds;
    if (typeof company.lastCrisisAt !== 'number') company.lastCrisisAt = nowSeconds;
    if (typeof company.lastProposalAt !== 'number') company.lastProposalAt = nowSeconds;
    if (typeof company.debt !== 'number') company.debt = 0;
    if (typeof company.megaprojectIncome !== 'number') company.megaprojectIncome = 0;
    if (typeof company.stateMegaprojectIncome !== 'number') company.stateMegaprojectIncome = 0;
    if (typeof company.nationalized !== 'boolean') company.nationalized = false;
    // Charters written before terms existed were perpetual; they now run the
    // LONG term (8 Galactic Days, the user's call 2026-10-06) from the moment
    // the snapshot is first loaded, so the first renewals arrive late rather
    // than all at once.
    if (typeof company.charterTermDays !== 'number') company.charterTermDays = LEGACY_CHARTER_TERM_DAYS;
    if (typeof company.charterExpiresAt !== 'number') {
        company.charterExpiresAt = nowSeconds + company.charterTermDays * GALACTIC_DAY_SIM_SECONDS;
    }
    if (typeof company.renewalCount !== 'number') company.renewalCount = 0;

    company.influence = computeInfluence(company);
    company.standing = computeStanding(company);
}

// ─── Derived read-model ──────────────────────────────────────────────────────

/**
 * Political weight, 0–100. Every term is something the company visibly does in
 * the world, so a player can reason about why a company matters — and which
 * lever shrinks it.
 */
export function computeInfluence(company: CharteredCompany): number {
    const assets = company.assets ?? [];
    const rights = company.rights ?? [];

    // Employment — colonies and works employ people, and employers get listened to.
    const employment = Math.min(25, company.corporateColonies.length * 5 + assets.length * 1.4);
    // Revenue the state actually banks from it.
    const fiscal = Math.min(20, Math.sqrt(Math.max(0, company.stateRemittanceTotal ?? 0)) / 45);
    // Infrastructure ownership.
    const infra = Math.min(15, (assets.length + company.infrastructureOwned.length) * 1.1);
    // Trade volume.
    const trade = Math.min(15, company.activeTradeRouteIds.length * 1.5
        + new Set(Object.values(company.monopolyRights).flat()).size * 0.8);
    // Shareholder reach — money that is not the founder's buys outside voices.
    const outside = 100 - ownershipPercent(company, company.foundingFactionId);
    const shareholders = Math.min(15, outside * 0.13);
    // Arms.
    const military = Math.min(10, militaryTier(company).tier * 2);
    // The charter itself confers standing.
    const chartered = Math.min(10, rights.reduce((s, r) => s + (RIGHT_DEFS[r]?.influenceWeight ?? 0), 0) * 0.09);
    // A government in debt to a company listens to it, and a company with
    // seats in the chamber does not need to be listened to — it votes.
    const creditor = Math.min(15, (company.stateLoan ?? 0) / 10_000);
    const seated = Math.min(10, (company.senateSeats ?? 0) * 0.6);

    return Math.round(Math.max(0, Math.min(100,
        employment + fiscal + infra + trade + shareholders + military + chartered + creditor + seated
    )));
}

/** Where the company sits on the instrument → partner → power → rival arc. */
export function computeStanding(company: CharteredCompany): CorporateStanding {
    const influence = company.influence ?? 0;
    const autonomy = company.autonomyLevel ?? 0;
    const loyalty = company.loyalty ?? 100;

    if (company.hasGoneRogue || (autonomy >= 80 && loyalty < 25)) return 'rogue';
    if (autonomy >= 60 && influence >= 50 && loyalty < 50) return 'rival';
    if (influence >= 45 || autonomy >= 55) return 'power';
    if (influence >= 20) return 'partner';
    return 'instrument';
}

/** Loyalty a company starts with for the length of its grant. */
export function termLoyaltyBonus(termDays: number): number {
    if (termDays <= CHARTER_TERM_OPTIONS[0]) return -6;
    if (termDays >= CHARTER_TERM_OPTIONS[CHARTER_TERM_OPTIONS.length - 1]) return 6;
    return 0;
}

/** Whether an asset is working: not raided, not occupied. */
export function isAssetActive(asset: CorporateAsset, nowSeconds: number): boolean {
    return !(asset.disruptedUntil && asset.disruptedUntil > nowSeconds);
}

/** The company's working assets. */
export function activeAssets(company: CharteredCompany, nowSeconds: number): CorporateAsset[] {
    return (company.assets ?? []).filter(a => isAssetActive(a, nowSeconds));
}

/**
 * Whether the company is in a condition to serve the state that chartered it:
 * not rogue, not revoked, and loyal enough to bother. A nationalised company
 * always serves.
 */
export function servesTheState(company: CharteredCompany): boolean {
    if (company.hasGoneRogue || company.charterRevocationPending) return false;
    return company.nationalized === true || (company.loyalty ?? 50) >= 40;
}

// ─── Prices the ledger shows ─────────────────────────────────────────────────
// These live here, not in the worker-side services that charge them, because
// the client prints them on buttons and must not import those services.

/** Most a bank will lend the state, whatever its vault holds. */
export const CREDIT_LINE_CAP = 150_000;
/** Share of its own treasury a bank will put at the state's disposal. */
export const CREDIT_LINE_TREASURY_SHARE = 0.5;

/**
 * Credits a banking company would still lend the state today.
 *
 * The line is sized on what the bank is worth, and money it has lent the
 * state is still the bank's — an asset, owed back. Sizing it on the vault
 * alone (as until 2026-10-06) counted every drawing twice, once as cash gone
 * and again as debt: "30,000cr on offer" fell to nothing after a 20,000
 * drawing, so the line could only ever be taken in one go.
 */
export function creditLineAvailable(company: CharteredCompany): number {
    if (company.mission !== 'banking' || !servesTheState(company)) return 0;
    const owed = company.stateLoan ?? 0;
    const line = Math.min(CREDIT_LINE_CAP, (company.treasury + owed) * CREDIT_LINE_TREASURY_SHARE);
    return Math.max(0, Math.floor(line - owed));
}

/** Political capital to renew a charter unchanged over the board's objection. */
export function asWrittenCost(company: CharteredCompany, ask: RenewalAsk): number {
    return ask.kind === 'none' ? 0 : 5 + Math.round((company.influence ?? 0) * 0.15);
}

/** Political capital to dictate tighter terms at renewal. */
export function stateTermsCost(company: CharteredCompany): number {
    return 15 + Math.round((company.influence ?? 0) * 0.3);
}

/** How long a foreign majority must hold before the charter can be moved. */
export const REFLAG_HOLD_SECONDS = GALACTIC_DAY_SIM_SECONDS;

/** Political capital to take a company under a new flag. */
export function reflagCost(company: CharteredCompany): number {
    return 30 + Math.round((company.influence ?? 0) * 0.3);
}

/** Sim-seconds at which `factionId` may reflag this company, or null if it cannot. */
export function reflagReadyAt(company: CharteredCompany, factionId: string): number | null {
    const held = company.boardControl;
    if (!held || held.holderId !== factionId || factionId === company.foundingFactionId) return null;
    return held.since + REFLAG_HOLD_SECONDS;
}

/** Highest private-military rung the granted rights allow. */
export function militaryCap(rights: CorporateRight[]): 0 | 1 | 2 | 3 | 4 | 5 {
    if (rights.includes('private_fleets')) return 5;
    if (rights.includes('defensive_stations') || rights.includes('mercenary_recruitment')) return 4;
    if (rights.includes('armed_escorts')) return 3;
    if (rights.includes('security_forces')) return 1;
    return 0;
}

/** Fleet-size ladder, clamped by what the charter permits. */
export function militaryTier(company: CharteredCompany): MilitaryTier {
    const size = company.privateFleetSize ?? 0;
    const raw: 0 | 1 | 2 | 3 | 4 | 5 =
        size >= 80 ? 5 :
        size >= 60 ? 4 :
        size >= 40 ? 3 :
        size >= 20 ? 2 :
        size >= 5 ? 1 : 0;
    const cap = militaryCap(company.rights ?? []);
    const tier = (Math.min(raw, cap) as 0 | 1 | 2 | 3 | 4 | 5);
    return { tier, label: MILITARY_TIERS[tier] };
}

/** Largest fleet the charter permits, in the same 0–100 scale. */
export function maxFleetSize(company: CharteredCompany): number {
    const cap = militaryCap(company.rights ?? []);
    return [0, 19, 39, 59, 79, 100][cap];
}

/** A holder's stake as a percentage of shares outstanding. */
export function ownershipPercent(company: CharteredCompany, holderId: string): number {
    const total = Math.max(1, company.sharesOutstanding);
    return ((company.shareholders[holderId] ?? 0) / total) * 100;
}

export interface OwnershipRow {
    holderId: string;
    /** 'government' when this is the founding empire, 'class' for synthetic
     *  classes, 'foreign' for another empire holding stock. */
    kind: 'government' | 'foreign' | 'class';
    shares: number;
    percent: number;
}

/** Full cap table, largest holder first. */
export function ownershipBreakdown(company: CharteredCompany): OwnershipRow[] {
    const total = Math.max(1, company.sharesOutstanding);
    return Object.entries(company.shareholders)
        .filter(([, shares]) => shares > 0)
        .map(([holderId, shares]) => ({
            holderId,
            kind: (holderId === company.foundingFactionId
                ? 'government'
                : (SHARE_CLASSES as string[]).includes(holderId) ? 'class' : 'foreign') as OwnershipRow['kind'],
            shares,
            percent: (shares / total) * 100,
        }))
        .sort((a, b) => b.shares - a.shares);
}

/** Who controls the board: the largest holder, and whether they hold a majority. */
export function boardControl(company: CharteredCompany): { holderId: string; percent: number; majority: boolean } {
    const rows = ownershipBreakdown(company);
    const top = rows[0];
    if (!top) return { holderId: company.foundingFactionId, percent: 0, majority: false };
    return { holderId: top.holderId, percent: top.percent, majority: top.percent > 50 };
}

/** Net asset value: what the company is actually worth today. */
export function netAssetValue(company: CharteredCompany): number {
    const assetValue = (company.assets ?? []).reduce((s, a) => s + a.value, 0);
    const infraValue = company.infrastructureOwned.length * 5_000;
    return Math.max(0, company.treasury + assetValue + infraValue - (company.debt ?? 0));
}

/** Market capitalisation at the last computed share price. */
export function marketCap(company: CharteredCompany): number {
    return company.sharePrice * company.sharesOutstanding;
}

/** Append to the bounded autonomous-decision log. */
export function logCorporateAction(
    company: CharteredCompany,
    record: { type: import('./charter-types').CorporateActionType; summary: string; timestamp: number }
): void {
    if (!company.growthLog) company.growthLog = [];
    company.growthLog.push({ ...record, companyId: company.id });
    if (company.growthLog.length > GROWTH_LOG_CAP) {
        company.growthLog = company.growthLog.slice(-GROWTH_LOG_CAP);
    }
}

/** Push a company event onto the shared bounded log. */
export function pushCompanyEvent(
    events: CompanyEvent[],
    company: CharteredCompany,
    type: CompanyEvent['type'],
    payload: Record<string, unknown>,
    nowSeconds: number
): void {
    events.push({ type, companyId: company.id, payload, timestamp: nowSeconds });
}

/** Personality definition for a company, with a safe fallback. */
export function personalityOf(company: CharteredCompany) {
    return PERSONALITY_DEFS[company.personality ?? 'profit_driven'];
}

/** Mission definition for a company, with a safe fallback. */
export function missionOf(company: CharteredCompany) {
    return MISSION_DEFS[company.mission ?? 'trade'];
}

/** Territory definition for a company, with a safe fallback. */
export function territoryOf(company: CharteredCompany) {
    return TERRITORY_DEFS[company.territory ?? 'domestic'];
}

/** Whether the charter grants a specific right. */
export function hasRight(company: CharteredCompany, right: CorporateRight): boolean {
    return (company.rights ?? []).includes(right);
}

/** Charter territory ordering, used when a demand widens the remit one step. */
export const TERRITORY_LADDER: OperatingTerritory[] = ['domestic', 'frontier', 'allied', 'neutral', 'galactic'];
