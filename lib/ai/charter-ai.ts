/**
 * lib/ai/charter-ai.ts
 * How an AI government deals with charter companies.
 *
 * Until this existed no AI empire ever chartered anything, which left the
 * cross-empire half of the corporate layer — rivalries, foreign operations,
 * host policy, buy-outs across a border — with nothing to run on unless two
 * humans both founded companies. An AI government now does what a player does:
 * answers its companies' demands, settles their crises, decides on their
 * megaprojects, renews their charters, buys into foreign companies on its own
 * soil, and grants charters of its own.
 *
 * Every spend goes through the same functions a player's orders do
 * (lib/economy/corporate/charter-orders.ts and the resolve* services), so an AI
 * pays what a player pays. Nothing here uses Math.random: choices are seeded on
 * (faction, tick) so a replayed world charters the same companies.
 */

import type { GameWorldState } from '../game-world-state';
import type { AIStance } from './strategic-ai-service';
import { CivilizationRegistry } from '../civilization/registry';
import { getGovernment } from '../government/government-service';
import { hasTechFlag } from '../tech/flags';
import { RNG, seedFromString } from '../trade-system/rng';
import { tickFromSeconds } from '../narrative/chronicle';
import { ensureCorporateState } from '../economy/corporate/company-registry';
import type { CorporateWorldState } from '../economy/corporate/company-registry';
import { resolveDemand, type DemandResponse } from '../economy/corporate/corporate-politics';
import { resolveCorporateCrisis, respondToMegaproject } from '../economy/corporate/corporate-events';
import { grantCharter, nationalizeCompany } from '../economy/corporate/charter-orders';
import { priceCharter, reflagReadyAt } from '../economy/corporate/charter-service';
import { resolveRenewal } from '../economy/corporate/charter-renewal';
import { reflagCharter } from '../economy/corporate/foreign-control';
import { buyShares } from '../economy/corporate/shareholder-service';
import { CHARTER_NAME_PREFIXES, DEMAND_DEFS } from '../economy/corporate/charter-catalog';
import {
    SOVEREIGNTY_DEMANDS,
    type CharterTerms,
    type CorporateMission,
    type CorporateRight,
    type CrisisOption,
    type OperatingTerritory,
    type RenewalResponse,
} from '../economy/corporate/charter-types';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Chance per strategic tick that a government able to charter actually does. */
const CHARTER_CHANCE_PER_TICK = 0.2;
/** Worlds at which an empire is big enough to run a second company. */
const SECOND_COMPANY_WORLDS = 6;
/** The treasury must cover the state's subscription this many times over. */
const CHARTER_TREASURY_COVER = 3;
/** Political capital kept in hand after granting a charter. */
const CHARTER_CAPITAL_BUFFER = 10;
/** The treasury must cover any corporate payout this many times over. */
const PAYOUT_TREASURY_COVER = 3;
/** Credits an AI will not let a crisis response take it below. */
const CRISIS_TREASURY_FLOOR = 10_000;
/** Treasury above which an AI starts buying into foreign companies on its soil. */
const INVEST_ABROAD_TREASURY = 400_000;
/** Chance per tick that it does, and the share of a company it buys at a time. */
const INVEST_ABROAD_CHANCE = 0.3;
const INVEST_ABROAD_BLOCK = 0.05;

/** The minimum rights each mission needs to be able to build anything at all. */
const MISSION_RIGHTS: Record<CorporateMission, CorporateRight[]> = {
    trade: ['build_infrastructure', 'own_stations', 'collect_fees'],
    logistics: ['build_infrastructure', 'own_stations'],
    mining: ['build_infrastructure', 'purchase_land'],
    extraction: ['build_infrastructure', 'purchase_land'],
    colonization: ['build_infrastructure', 'establish_colonies', 'own_stations'],
    shipbuilding: ['build_infrastructure', 'armed_escorts'],
    banking: ['collect_fees'],
    research: ['build_infrastructure'],
};

/** Missions whose work is out past the border. */
const FRONTIER_MISSIONS = new Set<CorporateMission>(['colonization', 'mining', 'extraction']);

function creditsOf(world: GameWorldState, factionId: string): number {
    return (world.economy.factions.get(factionId)?.reserves as Record<string, number> | undefined)?.['CREDITS'] ?? 0;
}

// ─── Answering its companies ─────────────────────────────────────────────────

/**
 * A company asking for a commercial favour gets it if the treasury can carry
 * it. A company asking for a piece of the state gets talked down if the
 * government has the capital to bargain, and refused otherwise — an AI does not
 * give away senate seats, but it does not slam the door three times running and
 * then act surprised either.
 */
function answerDemands(world: GameWorldState, corp: CorporateWorldState, factionId: string, log: string[]): void {
    const demands = [...corp.demands.values()]
        .filter(d => d.factionId === factionId && d.status === 'pending')
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const demand of demands) {
        const def = DEMAND_DEFS[demand.type];
        const payout = Math.max(0, -(def.stateOnAccept.credits ?? 0));
        const affordable = creditsOf(world, factionId) >= payout * PAYOUT_TREASURY_COVER;

        const preferences: DemandResponse[] = SOVEREIGNTY_DEMANDS.includes(demand.type)
            ? ['negotiate', 'reject']
            : affordable ? ['accept'] : ['negotiate', 'reject'];

        for (const response of preferences) {
            const result = resolveDemand(corp, demand.id, response, world, world.nowSeconds);
            if (!result.ok) continue;
            log.push(`${response} demand ${demand.type}`);
            break;
        }
    }
}

/** How an option looks to a government that wants its company loyal and leashed. */
function scoreCrisisOption(option: CrisisOption): number {
    const e = option.effects;
    return (e.loyalty ?? 0)
        - (e.autonomy ?? 0) * 1.5
        + (e.approval ?? 0) * 2
        - (e.corruption ?? 0) * 0.5
        - (option.creditCost ?? 0) / 5_000
        - (option.politicalCapitalCost ?? 0) * 0.3;
}

function answerCrises(world: GameWorldState, corp: CorporateWorldState, factionId: string, log: string[]): void {
    const crises = [...corp.crises.values()]
        .filter(c => c.factionId === factionId && c.status === 'pending')
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const crisis of crises) {
        const ranked = [...crisis.options]
            .filter(o => creditsOf(world, factionId) - (o.creditCost ?? 0) >= CRISIS_TREASURY_FLOOR || !o.creditCost)
            .sort((a, b) => scoreCrisisOption(b) - scoreCrisisOption(a) || a.id.localeCompare(b.id));
        for (const option of ranked) {
            const result = resolveCorporateCrisis(corp, crisis.id, option.id, world, world.nowSeconds);
            if (!result.ok) continue;
            log.push(`settled ${crisis.type} via ${option.id}`);
            break;
        }
    }
}

function answerProposals(world: GameWorldState, corp: CorporateWorldState, factionId: string, log: string[]): void {
    const proposals = [...corp.megaprojects.values()]
        .filter(p => p.factionId === factionId && (p.status === 'proposed' || p.status === 'delayed'))
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const proposal of proposals) {
        const stateCost = proposal.totalCost * proposal.stateShare;
        const credits = creditsOf(world, factionId);
        const preferences = credits >= stateCost * PAYOUT_TREASURY_COVER ? ['approve', 'modify', 'reject'] as const
            : credits >= stateCost * 0.5 * PAYOUT_TREASURY_COVER ? ['modify', 'reject'] as const
                : ['reject'] as const;
        for (const response of preferences) {
            const result = respondToMegaproject(corp, proposal.id, response, world, world.nowSeconds);
            if (!result.ok) continue;
            log.push(`${response} megaproject ${proposal.name}`);
            break;
        }
    }
}

/**
 * A rogue company is on a clock (rogue-service.ts). The one certain answer is
 * to seize it; a government that cannot afford to simply loses it.
 */
function answerRogues(world: GameWorldState, corp: CorporateWorldState, factionId: string, log: string[]): void {
    const rogues = [...corp.companies.values()]
        .filter(c => c.foundingFactionId === factionId && c.hasGoneRogue && !c.nationalized)
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const company of rogues) {
        const result = nationalizeCompany(world, factionId, company.id);
        if (result.ok) log.push(`nationalised rogue ${company.charter.fullName}`);
    }
}

/**
 * A charter up for renewal. A board the government cannot afford to cross gets
 * what it asked for; a small, loyal one is renewed as written if the capital is
 * there. An AI never lets a charter lapse and never dictates — it has no way to
 * judge what that would cost it a season from now.
 */
function answerRenewals(world: GameWorldState, corp: CorporateWorldState, factionId: string, log: string[]): void {
    const renewals = [...corp.renewals.values()]
        .filter(r => r.factionId === factionId && r.status === 'pending')
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const renewal of renewals) {
        const company = corp.companies.get(renewal.companyId);
        const mustAppease = !company || (company.loyalty ?? 50) < 45 || (company.influence ?? 0) >= 45;
        const preferences: RenewalResponse[] = renewal.ask.kind === 'none' || mustAppease
            ? ['company_terms']
            : ['as_written', 'company_terms'];
        for (const response of preferences) {
            const result = resolveRenewal(world, renewal.id, response);
            if (!result.ok) continue;
            log.push(`renewal ${response}: ${result.outcome}`);
            break;
        }
    }
}

/**
 * Foreign companies working inside this empire's borders are worth owning a
 * piece of — and, if enough of the stock is loose, worth owning outright. A
 * rich AI in good order buys the float a block at a time, and moves the charter
 * to its own flag once the board has been its for a Galactic Day.
 */
function investAbroad(
    world: GameWorldState,
    corp: CorporateWorldState,
    factionId: string,
    stance: AIStance,
    log: string[]
): void {
    // Same gate as chartering: the treasury threshold below is what actually
    // decides whether an empire has capital to deploy abroad.
    if (stance === 'survival') return;
    const foreign = [...corp.companies.values()]
        .filter(c => c.foundingFactionId !== factionId && !c.nationalized
            && (c.operatingFactionIds ?? []).includes(factionId))
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const company of foreign) {
        const readyAt = reflagReadyAt(company, factionId);
        if (readyAt !== null && world.nowSeconds >= readyAt) {
            const moved = reflagCharter(world, factionId, company.id);
            if (moved.ok) log.push(`reflagged ${company.charter.fullName}`);
            continue;
        }

        if (creditsOf(world, factionId) < INVEST_ABROAD_TREASURY) continue;
        const rng = new RNG(seedFromString(`invest-ai|${factionId}|${company.id}|${tickFromSeconds(world.nowSeconds)}`));
        if (rng.next() > INVEST_ABROAD_CHANCE) continue;
        const block = Math.floor(company.sharesOutstanding * INVEST_ABROAD_BLOCK);
        const bought = buyShares(corp, world, company.id, factionId, block, world.nowSeconds);
        if (bought.ok) log.push(`bought ${bought.shares} shares of ${company.charter.fullName}`);
    }
}

// ─── Granting charters ───────────────────────────────────────────────────────

/** What this empire would charter a company to do, from its own temperament. */
export function pickMission(world: GameWorldState, factionId: string, rng: RNG): CorporateMission {
    const civId = world.economy.factions.get(factionId)?.civilizationId;
    const biases: string[] = (civId ? CivilizationRegistry.getCivilization(civId)?.doctrineBiases?.economic : null) ?? [];
    const posture = world.movement.empirePostures.get(factionId)?.current;

    if (biases.includes('mercantile') || biases.includes('free_market')) return 'trade';
    if (biases.includes('resource_tribute') || biases.includes('biological_extraction')) return 'extraction';
    if (posture === 'Militarist') return 'shipbuilding';
    if (posture === 'Expansionist' || biases.includes('expansionist')) return 'colonization';

    const fallback: CorporateMission[] = ['mining', 'trade', 'logistics'];
    return fallback[rng.nextInt(0, fallback.length - 1)];
}

/** The charter an AI government writes for a mission: minimal, and half its own. */
export function draftCharter(mission: CorporateMission): CharterTerms {
    const territory: OperatingTerritory = FRONTIER_MISSIONS.has(mission) ? 'frontier' : 'domestic';
    return {
        mission,
        territory,
        rights: [...MISSION_RIGHTS[mission]],
        // A bare majority: the state keeps the board, and leaves enough float
        // for foreign money to make the company somebody else's business too.
        ownership: { government: 50, privateInvestors: 30, foreignInvestors: 10, publicShares: 10 },
        profitShareToState: 0.15,
    };
}

function pickName(corp: CorporateWorldState, rng: RNG): string | null {
    const taken = new Set([...corp.companies.values()].map(c => c.charter.baseName));
    const free = CHARTER_NAME_PREFIXES.filter(name => !taken.has(name));
    if (free.length === 0) return null;
    return free[rng.nextInt(0, free.length - 1)];
}

function maybeCharter(
    world: GameWorldState,
    corp: CorporateWorldState,
    factionId: string,
    stance: AIStance,
    log: string[]
): void {
    // A state fighting for its life does not hand out monopolies. A merely
    // small one may: every empire starts on a single world, so waiting for the
    // AI's "normal" stance (four worlds or more) meant no AI ever chartered at
    // all. Legitimacy, political capital and the treasury are the real gates,
    // and grantCharter checks all three.
    if (stance === 'survival') return;
    if (!hasTechFlag(world, factionId, 'ENABLE_CORPORATE_CHARTERS')) return;

    const worlds = [...world.construction.planets.values()].filter(p => p.ownerId === factionId).length;
    const cap = worlds >= SECOND_COMPANY_WORLDS ? 2 : 1;
    const existing = [...corp.companies.values()].filter(c => c.foundingFactionId === factionId).length;
    if (existing >= cap) return;

    const rng = new RNG(seedFromString(`charter-ai|${factionId}|${tickFromSeconds(world.nowSeconds)}`));
    if (rng.next() > CHARTER_CHANCE_PER_TICK) return;

    const faction = world.economy.factions.get(factionId);
    const headquartersSystemId = faction?.capitalSystemId && world.movement.systems.has(faction.capitalSystemId)
        ? faction.capitalSystemId
        : [...world.movement.systems.values()].find(s => s.ownerFactionId === factionId)?.id;
    if (!headquartersSystemId) return;

    const terms = draftCharter(pickMission(world, factionId, rng));
    const credits = creditsOf(world, factionId);
    const foundingCapital = Math.max(40_000, Math.min(120_000, Math.round(credits * 0.2 / 1_000) * 1_000));
    const price = priceCharter(terms, foundingCapital);

    if (credits < price.stateCapital * CHARTER_TREASURY_COVER) return;
    const gov = getGovernment(world, factionId);
    if (!gov || gov.politicalCapital < price.politicalCapital + CHARTER_CAPITAL_BUFFER) return;

    const baseName = pickName(corp, rng);
    if (!baseName) return;

    const result = grantCharter(world, factionId, { baseName, headquartersSystemId, terms, foundingCapital });
    if (result.ok) {
        log.push(`chartered ${result.company.charter.fullName} (${terms.mission}/${terms.territory})`);
    }
}

// ─── Turn ────────────────────────────────────────────────────────────────────

/**
 * One AI government's corporate turn. Returns what it did, for the worker log.
 * The caller is responsible for the AI gate — this must never run for a faction
 * a human holds.
 */
export function runCharterAI(world: GameWorldState, factionId: string, stance: AIStance): string[] {
    const corp = ensureCorporateState(world);
    const log: string[] = [];

    answerRogues(world, corp, factionId, log);
    answerDemands(world, corp, factionId, log);
    answerCrises(world, corp, factionId, log);
    answerProposals(world, corp, factionId, log);
    answerRenewals(world, corp, factionId, log);
    investAbroad(world, corp, factionId, stance, log);
    maybeCharter(world, corp, factionId, stance, log);

    return log;
}
