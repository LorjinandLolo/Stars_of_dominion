/**
 * lib/economy/corporate/corporate-ai.ts
 * The company decides for itself.
 *
 * Every growth cycle a Charter Corporation looks at its books, its charter and
 * its personality, and spends its own capital without being asked. The player
 * never places a corporate station; they set the policy that makes stations
 * attractive — or unaffordable.
 *
 * Competition between companies lives here too: rivals in the same trade fight
 * price wars and buy each other, which is how the galaxy ends up with a handful
 * of very large firms nobody planned.
 */

import type { GameWorldState } from '../../game-world-state';
import type { CharteredCompany, CompanyEvent } from './company-types';
import type { CorporateWorldState } from './company-registry';
import type {
    CorporateActionType,
    CorporateAsset,
    CorporateAssetType,
    CorporateRivalry,
} from './charter-types';
import { ASSET_DEFS, RIGHT_DEFS } from './charter-catalog';
import {
    computeInfluence,
    computeStanding,
    hasRight,
    logCorporateAction,
    maxFleetSize,
    missionOf,
    personalityOf,
    pushCompanyEvent,
    seededRandom,
    territoryOf,
    weightedPick,
} from './charter-service';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Sim-seconds between autonomous decisions. "Every few days." */
export const GROWTH_INTERVAL_SECONDS = 2 * 86_400;
/** Treasury below which the company stops expanding and starts worrying. */
const DISTRESS_TREASURY = 5_000;
/** Rivalry intensity at which a price war opens. */
const PRICE_WAR_THRESHOLD = 60;

// ─── Candidate systems ───────────────────────────────────────────────────────

/**
 * Systems the charter actually permits the company to move into, cheapest
 * expansion first. Domestic charters stay inside the founder's borders;
 * frontier charters take unclaimed space; the wider charters may cross borders,
 * subject to the host's policy.
 */
function candidateSystems(company: CharteredCompany, world: GameWorldState, corpState: CorporateWorldState): string[] {
    const territory = territoryOf(company);
    const present = new Set(company.presenceSystemIds ?? []);
    if (present.size >= territory.reachCap) return [];

    const out: string[] = [];
    for (const sys of world.movement.systems.values()) {
        if (present.has(sys.id)) continue;
        const owner = sys.ownerFactionId;
        const isHome = owner === company.foundingFactionId;
        const isUnclaimed = !owner;
        const isForeign = !!owner && owner !== company.foundingFactionId;

        if (isForeign) {
            if (!territory.foreignOperations) continue;
            // A host that has banned or nationalised the company is closed to it.
            const policy = corpState.hostPolicies.get(`${owner}:${company.id}`);
            if (policy && (policy.stance === 'banned' || policy.stance === 'nationalized')) continue;
            if (company.territory === 'allied') {
                // Allied charters may only enter empires the founder has a
                // standing treaty with.
                if (!hasTreatyWith(world, company.foundingFactionId, owner!)) continue;
            }
        } else if (isUnclaimed) {
            if (company.territory === 'domestic') continue;
        } else if (!isHome) {
            continue;
        }
        out.push(sys.id);
    }
    return out;
}

/** Whether two empires hold any treaty — used to gate 'allied' charters. */
function hasTreatyWith(world: GameWorldState, a: string, b: string): boolean {
    for (const treaty of world.treaties?.values?.() ?? []) {
        const parties = (treaty as any).partyIds ?? [(treaty as any).aFactionId, (treaty as any).bFactionId];
        if (Array.isArray(parties) && parties.includes(a) && parties.includes(b)) return true;
    }
    return false;
}

// ─── Individual growth actions ───────────────────────────────────────────────

/** Asset types this company is chartered and equipped to build, cheapest first. */
function buildableAssets(company: CharteredCompany): CorporateAssetType[] {
    return missionOf(company).assetTypes
        .filter(type => {
            const def = ASSET_DEFS[type];
            return !def.requiredRight || hasRight(company, def.requiredRight);
        })
        .sort((a, b) => ASSET_DEFS[a].cost - ASSET_DEFS[b].cost);
}

function buildAsset(
    company: CharteredCompany,
    world: GameWorldState,
    corpState: CorporateWorldState,
    roll: () => number,
    nowSeconds: number
): boolean {
    const options = buildableAssets(company);
    if (options.length === 0) return false;

    const costMultiplier = missionOf(company).expansionCostMultiplier;
    const spendable = company.treasury * (1 - personalityOf(company).reserveFloor);
    const affordable = options.filter(t => ASSET_DEFS[t].cost * costMultiplier <= spendable);
    if (affordable.length === 0) return false;

    // Prefer the most capable asset it can comfortably afford.
    const type = affordable[affordable.length - 1];
    const def = ASSET_DEFS[type];
    const cost = Math.round(def.cost * costMultiplier);

    // Site it in a new system if the charter still has reach, otherwise deepen
    // an existing holding.
    const candidates = candidateSystems(company, world, corpState);
    const systemId = candidates.length > 0
        ? candidates[Math.floor(roll() * candidates.length)]
        : (company.presenceSystemIds ?? [company.headquartersSystemId])[0];

    const asset: CorporateAsset = {
        id: `casset-${company.id}-${nowSeconds}-${Math.floor(roll() * 100000)}`,
        type,
        systemId,
        value: cost,
        incomePerTick: Math.round(def.incomePerTick * missionOf(company).revenueMultiplier),
        upkeepPerTick: def.upkeepPerTick,
        builtAt: nowSeconds,
    };

    company.treasury -= cost;
    // Corporate assets are tracked in `assets`, NOT in `infrastructureOwned` —
    // the legacy list carries its own flat valuation and upkeep, so putting an
    // asset in both would count its value and its costs twice.
    (company.assets ??= []).push(asset);
    if (!(company.presenceSystemIds ??= []).includes(systemId)) {
        company.presenceSystemIds.push(systemId);
    }

    // A colony seed is a settlement, not a depot — it becomes a corporate colony.
    if (type === 'colony_seed' && !company.corporateColonies.includes(systemId)) {
        company.corporateColonies.push(systemId);
    }

    const sysName = world.movement.systems.get(systemId)?.name ?? systemId;
    logCorporateAction(company, {
        type: 'built_asset',
        summary: `Built a ${def.name.toLowerCase()} at ${sysName} for ${cost.toLocaleString()}cr.`,
        timestamp: nowSeconds,
    });
    registerForeignPresence(company, world, systemId);
    return true;
}

/** Track which empires the company now operates inside. */
function registerForeignPresence(company: CharteredCompany, world: GameWorldState, systemId: string): void {
    const owner = world.movement.systems.get(systemId)?.ownerFactionId;
    if (!owner || owner === company.foundingFactionId) return;
    if (!(company.operatingFactionIds ??= []).includes(owner)) {
        company.operatingFactionIds.push(owner);
    }
}

function openRoute(company: CharteredCompany, world: GameWorldState, nowSeconds: number): boolean {
    const routes = company.activeTradeRouteIds
        .map(id => world.economy.tradeRoutes?.get(id))
        .filter(Boolean) as any[];
    if (routes.length === 0) return false;

    const cost = 12_000;
    if (company.treasury - cost < company.treasury * personalityOf(company).reserveFloor) return false;

    // Money spent on hulls and handling: the lane carries more, and is safer.
    const route = routes.reduce((worst, r) => (r.piracyRisk > worst.piracyRisk ? r : worst), routes[0]);
    company.treasury -= cost;
    route.routePriority = Math.min(100, (route.routePriority ?? 1) * 1.15 + 0.5);
    route.piracyRisk = Math.max(0, (route.piracyRisk ?? 0) - 0.05);

    logCorporateAction(company, {
        type: 'opened_route',
        summary: `Invested ${cost.toLocaleString()}cr expanding freight capacity on its busiest lane.`,
        timestamp: nowSeconds,
    });
    return true;
}

function enterMarket(
    company: CharteredCompany,
    world: GameWorldState,
    corpState: CorporateWorldState,
    roll: () => number,
    nowSeconds: number
): boolean {
    const candidates = candidateSystems(company, world, corpState);
    if (candidates.length === 0) return false;
    const cost = 9_000;
    if (company.treasury - cost < company.treasury * personalityOf(company).reserveFloor) return false;

    const systemId = candidates[Math.floor(roll() * candidates.length)];
    company.treasury -= cost;
    (company.presenceSystemIds ??= []).push(systemId);
    registerForeignPresence(company, world, systemId);

    const sys = world.movement.systems.get(systemId);
    const owner = sys?.ownerFactionId;
    const where = owner && owner !== company.foundingFactionId
        ? `${sys?.name ?? systemId}, inside foreign territory`
        : (sys?.name ?? systemId);
    logCorporateAction(company, {
        type: 'entered_market',
        summary: `Opened a commercial office at ${where}.`,
        timestamp: nowSeconds,
    });
    return true;
}

function expandFleet(company: CharteredCompany, nowSeconds: number): boolean {
    const cap = maxFleetSize(company);
    if (company.privateFleetSize >= cap) return false;
    const cost = 15_000;
    if (company.treasury - cost < company.treasury * personalityOf(company).reserveFloor) return false;

    company.treasury -= cost;
    company.privateFleetSize = Math.min(cap, company.privateFleetSize + 10);
    // Arming itself is the single clearest step away from the leash.
    company.autonomyLevel = Math.min(100, company.autonomyLevel + 2);

    logCorporateAction(company, {
        type: 'expanded_fleet',
        summary: `Commissioned additional escorts — private security now at ${company.privateFleetSize}/100.`,
        timestamp: nowSeconds,
    });
    return true;
}

function hireWorkers(company: CharteredCompany, world: GameWorldState, nowSeconds: number): boolean {
    const cost = 6_000;
    if (company.treasury - cost < company.treasury * personalityOf(company).reserveFloor) return false;
    company.treasury -= cost;

    // Payroll in the systems it operates: unrest eases where the company hires.
    let touched = 0;
    for (const planet of world.economy.planets.values()) {
        if (!(company.presenceSystemIds ?? []).includes(planet.systemId)) continue;
        planet.instability = Math.max(0, (planet.instability ?? 0) - 1.5);
        touched++;
    }
    logCorporateAction(company, {
        type: 'hired_workers',
        summary: touched > 0
            ? `Expanded payroll across ${touched} world(s) in its operating area.`
            : 'Expanded payroll ahead of the next season of works.',
        timestamp: nowSeconds,
    });
    return true;
}

function fundResearch(company: CharteredCompany, world: GameWorldState, nowSeconds: number): boolean {
    const cost = 18_000;
    if (company.treasury - cost < company.treasury * personalityOf(company).reserveFloor) return false;
    company.treasury -= cost;

    // A loyal company shares its findings with the state that chartered it.
    // A disloyal one keeps the patents and books the licensing revenue.
    const loyalty = company.loyalty ?? 50;
    if (loyalty >= 50) {
        const tech = world.tech?.get?.(company.foundingFactionId);
        const slot = tech?.activeSlots?.find(s => s.status === 'researching');
        if (slot) {
            slot.progressHours += 24;
            slot.ticksCompleted = Math.min(slot.ticksRequired, slot.ticksCompleted + 1);
        }
        logCorporateAction(company, {
            type: 'funded_research',
            summary: 'Funded a corporate laboratory and shared the findings with the ministry.',
            timestamp: nowSeconds,
        });
    } else {
        (company.assets ??= []).push({
            id: `casset-${company.id}-patent-${nowSeconds}`,
            type: 'research_lab',
            systemId: company.headquartersSystemId,
            value: cost,
            incomePerTick: 260,
            upkeepPerTick: 40,
            builtAt: nowSeconds,
        });
        logCorporateAction(company, {
            type: 'funded_research',
            summary: 'Funded proprietary research. The patents were not filed with the ministry.',
            timestamp: nowSeconds,
        });
    }
    return true;
}

function bribeOfficials(company: CharteredCompany, world: GameWorldState, nowSeconds: number): boolean {
    const cost = 10_000;
    if (company.treasury < cost) return false;
    company.treasury -= cost;
    company.corruptionIndex = Math.min(100, company.corruptionIndex + 6);
    company.influence = Math.min(100, (company.influence ?? 0) + 3);

    const gov = world.government?.get?.(company.foundingFactionId);
    if (gov) gov.corruption = Math.min(100, (gov.corruption ?? 0) + 2);

    logCorporateAction(company, {
        type: 'bribed_officials',
        summary: 'Retained a number of ministry officials as "commercial advisors".',
        timestamp: nowSeconds,
    });
    return true;
}

function improveColony(company: CharteredCompany, world: GameWorldState, nowSeconds: number): boolean {
    if (company.corporateColonies.length === 0) return false;
    const cost = 14_000;
    if (company.treasury - cost < company.treasury * personalityOf(company).reserveFloor) return false;
    company.treasury -= cost;

    for (const planet of world.economy.planets.values()) {
        if (!company.corporateColonies.includes(planet.systemId)) continue;
        planet.instability = Math.max(0, (planet.instability ?? 0) - 4);
    }
    company.corruptionIndex = Math.max(0, company.corruptionIndex - 3);
    logCorporateAction(company, {
        type: 'improved_colony',
        summary: 'Built housing, clinics and water works across its colonial holdings.',
        timestamp: nowSeconds,
    });
    return true;
}

function hoardReserves(company: CharteredCompany, nowSeconds: number): boolean {
    logCorporateAction(company, {
        type: 'hoarded_reserves',
        summary: `Declined to expand this cycle; reserves held at ${Math.round(company.treasury).toLocaleString()}cr.`,
        timestamp: nowSeconds,
    });
    return true;
}

function withholdInvestment(company: CharteredCompany, nowSeconds: number): boolean {
    // An investment strike: the state's cut shrinks until relations improve.
    company.loyalty = Math.max(0, (company.loyalty ?? 50) - 3);
    logCorporateAction(company, {
        type: 'withheld_investment',
        summary: 'Suspended new capital commitments pending "clarity on the fiscal environment".',
        timestamp: nowSeconds,
    });
    return true;
}

// ─── Competition ─────────────────────────────────────────────────────────────

function rivalryKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Companies chasing the same trade in overlapping space. */
function findRivals(company: CharteredCompany, corpState: CorporateWorldState): CharteredCompany[] {
    const mine = new Set(company.presenceSystemIds ?? []);
    const rivals: CharteredCompany[] = [];
    for (const other of corpState.companies.values()) {
        if (other.id === company.id) continue;
        const sameTrade = other.mission === company.mission;
        const overlap = (other.presenceSystemIds ?? []).some(s => mine.has(s));
        if (sameTrade || overlap) rivals.push(other);
    }
    return rivals;
}

/**
 * Escalate the standing rivalry between two companies. Intensity climbs while
 * they share markets; past a threshold it becomes an open price war that costs
 * both of them real money.
 */
export function escalateRivalry(
    corpState: CorporateWorldState,
    a: CharteredCompany,
    b: CharteredCompany,
    nowSeconds: number
): CorporateRivalry {
    const id = rivalryKey(a.id, b.id);
    let rivalry = corpState.rivalries.get(id);
    if (!rivalry) {
        rivalry = {
            id,
            companyAId: id.split('|')[0],
            companyBId: id.split('|')[1],
            intensity: 10,
            priceWar: false,
            startedAt: nowSeconds,
            lastEscalationAt: nowSeconds,
        };
        corpState.rivalries.set(id, rivalry);
    }
    rivalry.intensity = Math.min(100, rivalry.intensity + 12);
    rivalry.lastEscalationAt = nowSeconds;
    rivalry.priceWar = rivalry.intensity >= PRICE_WAR_THRESHOLD;
    return rivalry;
}

function startPriceWar(
    company: CharteredCompany,
    corpState: CorporateWorldState,
    roll: () => number,
    nowSeconds: number
): boolean {
    const rivals = findRivals(company, corpState);
    if (rivals.length === 0) return false;
    const target = rivals[Math.floor(roll() * rivals.length)];

    const rivalry = escalateRivalry(corpState, company, target, nowSeconds);
    // Undercutting is paid for out of margin — the aggressor bleeds less because
    // it chose the timing.
    const bite = 8_000;
    company.treasury -= bite;
    target.treasury -= bite * 1.4;
    target.loyalty = Math.max(0, (target.loyalty ?? 50) - 1);

    logCorporateAction(company, {
        type: 'price_war',
        summary: `Opened a price war against ${target.charter.fullName} (rivalry ${Math.round(rivalry.intensity)}%).`,
        timestamp: nowSeconds,
    });
    return true;
}

/**
 * Buy a smaller rival outright. Assets, colonies, monopolies and debts transfer;
 * the acquired charter is dissolved and its shareholders are paid off.
 */
export function acquireCompany(
    corpState: CorporateWorldState,
    buyer: CharteredCompany,
    target: CharteredCompany,
    world: GameWorldState,
    nowSeconds: number
): boolean {
    const price = Math.max(20_000, Math.round(netWorth(target) * 1.2));
    if (buyer.treasury < price) return false;

    buyer.treasury -= price;

    // Pay the target's shareholders out of the purchase price.
    const totalShares = Math.max(1, target.sharesOutstanding);
    for (const [holderId, shares] of Object.entries(target.shareholders)) {
        if (shares <= 0) continue;
        const payout = price * (shares / totalShares);
        const reserves = world.economy.factions.get(holderId)?.reserves as Record<string, number> | undefined;
        if (reserves) reserves['CREDITS'] = (reserves['CREDITS'] ?? 0) + payout;
        const st = corpState.factionStates.get(holderId);
        if (st) {
            delete st.companySharesOwned[target.id];
            st.charteredCompanyIds = st.charteredCompanyIds.filter(cid => cid !== target.id);
        }
    }

    buyer.assets = [...(buyer.assets ?? []), ...(target.assets ?? [])];
    buyer.infrastructureOwned = [...buyer.infrastructureOwned, ...target.infrastructureOwned];
    buyer.corporateColonies = [...new Set([...buyer.corporateColonies, ...target.corporateColonies])];
    buyer.presenceSystemIds = [...new Set([...(buyer.presenceSystemIds ?? []), ...(target.presenceSystemIds ?? [])])];
    buyer.operatingFactionIds = [...new Set([...(buyer.operatingFactionIds ?? []), ...(target.operatingFactionIds ?? [])])];
    buyer.privateFleetSize = Math.min(maxFleetSize(buyer), buyer.privateFleetSize + Math.round(target.privateFleetSize * 0.5));
    buyer.debt = (buyer.debt ?? 0) + (target.debt ?? 0);
    for (const [resource, systems] of Object.entries(target.monopolyRights)) {
        const key = resource as keyof typeof buyer.monopolyRights;
        buyer.monopolyRights[key] = [...new Set([...(buyer.monopolyRights[key] ?? []), ...(systems ?? [])])];
    }

    corpState.companies.delete(target.id);
    for (const [key, rivalry] of corpState.rivalries) {
        if (rivalry.companyAId === target.id || rivalry.companyBId === target.id) corpState.rivalries.delete(key);
    }
    // Any pending business against the dissolved charter dies with it.
    for (const [key, demand] of corpState.demands) {
        if (demand.companyId === target.id && demand.status === 'pending') corpState.demands.delete(key);
    }
    for (const [key, crisis] of corpState.crises) {
        if (crisis.companyId === target.id && crisis.status === 'pending') corpState.crises.delete(key);
    }

    logCorporateAction(buyer, {
        type: 'acquired_rival',
        summary: `Acquired ${target.charter.fullName} for ${price.toLocaleString()}cr.`,
        timestamp: nowSeconds,
    });
    pushCompanyEvent(corpState.eventLog, buyer, 'merged', {
        acquiredId: target.id,
        acquiredName: target.charter.fullName,
        price,
    }, nowSeconds);
    return true;
}

/** Rough going-concern value, used to price acquisitions. */
function netWorth(company: CharteredCompany): number {
    const assets = (company.assets ?? []).reduce((s, a) => s + a.value, 0);
    return Math.max(0, company.treasury + assets - (company.debt ?? 0));
}

function tryAcquireRival(
    company: CharteredCompany,
    corpState: CorporateWorldState,
    world: GameWorldState,
    roll: () => number,
    nowSeconds: number
): boolean {
    const affordable = findRivals(company, corpState)
        .filter(r => netWorth(r) * 1.2 <= company.treasury)
        .sort((a, b) => netWorth(b) - netWorth(a));
    if (affordable.length === 0) return false;
    const target = affordable[Math.floor(roll() * Math.min(2, affordable.length))] ?? affordable[0];
    return acquireCompany(corpState, company, target, world, nowSeconds);
}

// ─── The growth cycle ────────────────────────────────────────────────────────

/**
 * One autonomous decision. Returns true if the company did something.
 *
 * Personality supplies the weights; solvency, the charter and the state of the
 * world decide which of those weights are actually available. A militarist with
 * no military rights builds warehouses instead — and resents it.
 */
export function runGrowthCycle(
    company: CharteredCompany,
    world: GameWorldState,
    corpState: CorporateWorldState,
    nowSeconds: number
): boolean {
    if (company.nationalized || company.charterRevocationPending) return false;

    const personality = personalityOf(company);
    const roll = seededRandom(`${company.id}:growth:${Math.floor(nowSeconds / GROWTH_INTERVAL_SECONDS)}`);

    // A company in distress does not expand; it retrenches.
    if (company.treasury < DISTRESS_TREASURY) {
        withholdInvestment(company, nowSeconds);
        company.lastGrowthAt = nowSeconds;
        return true;
    }

    const weights: Partial<Record<CorporateActionType, number>> = { ...personality.weights };

    // Prune what the company cannot legally or practically do this cycle.
    if (buildableAssets(company).length === 0) delete weights.built_asset;
    if (company.activeTradeRouteIds.length === 0) delete weights.opened_route;
    if (company.privateFleetSize >= maxFleetSize(company)) delete weights.expanded_fleet;
    if (company.corporateColonies.length === 0) delete weights.improved_colony;
    if (findRivals(company, corpState).length === 0) {
        delete weights.acquired_rival;
        delete weights.price_war;
    }
    if (candidateSystems(company, world, corpState).length === 0) delete weights.entered_market;
    // A loyal company does not strike against its own charter.
    if ((company.loyalty ?? 50) > 40) delete weights.withheld_investment;

    const executors: Record<CorporateActionType, () => boolean> = {
        built_asset: () => buildAsset(company, world, corpState, roll, nowSeconds),
        opened_route: () => openRoute(company, world, nowSeconds),
        entered_market: () => enterMarket(company, world, corpState, roll, nowSeconds),
        expanded_fleet: () => expandFleet(company, nowSeconds),
        hired_workers: () => hireWorkers(company, world, nowSeconds),
        funded_research: () => fundResearch(company, world, nowSeconds),
        bribed_officials: () => bribeOfficials(company, world, nowSeconds),
        improved_colony: () => improveColony(company, world, nowSeconds),
        hoarded_reserves: () => hoardReserves(company, nowSeconds),
        acquired_rival: () => tryAcquireRival(company, corpState, world, roll, nowSeconds),
        price_war: () => startPriceWar(company, corpState, roll, nowSeconds),
        withheld_investment: () => withholdInvestment(company, nowSeconds),
    };

    // Try the personality's preference; if it turns out to be unaffordable,
    // fall through to the next-best option rather than idling the whole cycle.
    let acted = false;
    const remaining = { ...weights };
    for (let attempt = 0; attempt < 4 && !acted; attempt++) {
        const choice = weightedPick(remaining, roll());
        if (!choice) break;
        delete remaining[choice];
        acted = executors[choice]();
    }
    if (!acted) acted = hoardReserves(company, nowSeconds);

    // Charter reach and personality both push the company away from the leash.
    const drift = territoryOf(company).autonomyDrift * personality.autonomyDrift * 0.4
        + (company.rights ?? []).reduce((s, r) => s + (RIGHT_DRIFT[r] ?? 0), 0);
    company.autonomyLevel = Math.max(0, Math.min(100, company.autonomyLevel + drift));
    company.corruptionIndex = Math.max(0, Math.min(100,
        company.corruptionIndex + 0.4 * personality.corruptionDrift - (company.nationalized ? 2 : 0)));

    company.influence = computeInfluence(company);
    const before = company.standing;
    company.standing = computeStanding(company);
    if (before !== company.standing) {
        pushCompanyEvent(corpState.eventLog, company, 'standing_changed', {
            from: before, to: company.standing, influence: company.influence,
        }, nowSeconds);
    }

    company.lastGrowthAt = nowSeconds;
    pushCompanyEvent(corpState.eventLog, company, 'grew', {
        summary: company.growthLog?.[company.growthLog.length - 1]?.summary ?? '',
        treasury: Math.round(company.treasury),
    }, nowSeconds);
    return acted;
}

/** Per-cycle autonomy contribution of each granted right. */
const RIGHT_DRIFT: Partial<Record<string, number>> = Object.fromEntries(
    Object.entries(RIGHT_DEFS).map(([id, def]) => [id, def.autonomyWeight * 0.25])
);

/**
 * Rivalries cool off on their own. Without this, one shared market in the early
 * game would leave two companies permanently at war over it.
 */
export function decayRivalries(corpState: CorporateWorldState, nowSeconds: number, events: CompanyEvent[]): void {
    for (const [key, rivalry] of corpState.rivalries) {
        const idle = nowSeconds - rivalry.lastEscalationAt;
        if (idle < GROWTH_INTERVAL_SECONDS) continue;
        rivalry.intensity = Math.max(0, rivalry.intensity - 5);
        rivalry.priceWar = rivalry.intensity >= PRICE_WAR_THRESHOLD;
        if (rivalry.intensity <= 0) corpState.rivalries.delete(key);
    }
    void events;
}
