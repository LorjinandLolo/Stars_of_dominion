// lib/piracy/black-market-service.ts
// Pirate system Phase 6 — the shadow economy.
//
// Design: docs/pirate-system/shadow-economy.md.
//
// Piracy only becomes an economy when the loot has somewhere to go. Four
// channels turn stolen cargo into power: black markets, smuggling, the
// intelligence marketplace, and the corporations that make all three
// respectable. Each of them is useful to the empires that publicly hunt pirates,
// which is exactly why the system is hard to legislate away.

import type { GameWorldState } from '../game-world-state';
import { Resource } from '../trade-system/types';
import { RNG, seedFromString } from '../trade-system/rng';
import { generateImmediateReport } from '../espionage/intel-reports';
import { evaluatePathwayProgression, type PathwayId } from '../mechanics/pathway-logic';
import {
    activeOrganizations,
    ensurePiracyState,
    foundOrganization,
    nearestOrganization,
} from './organization-service';
import { basesOf, baseIsOperational, establishBase, BASE_KINDS } from './base-service';
import { ownsInformation } from './protection-service';
import type {
    BlackMarket,
    PirateBase,
    PirateOrganization,
    SmugglingRun,
} from './piracy-types';

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Base discount a grey market offers against the legal price. */
const BASE_DISCOUNT = 0.3;
/** Extra discount a market with deep liquidity can afford to give. */
const LIQUIDITY_DISCOUNT_BONUS = 0.2;
const MAX_DISCOUNT = 0.6;

/** Credits of throughput per unit of base storage, per hour. */
const LIQUIDITY_PER_STORAGE = 0.05;
/** Credits a unit of cargo is worth when no legal market quotes it. */
const FALLBACK_UNIT_PRICE = 12;

/** Chance per purchase that a buyer is identified, before modifiers. */
const BASE_TRACEABILITY = 0.12;
/** Buying more than the market can clear in one go is conspicuous. */
const OVERSIZE_TRACE_PENALTY = 0.5;
/** Each prior traced purchase makes the next one likelier to be caught. */
const REPEAT_TRACE_STEP = 0.06;

/** Faction infamy gained per traced purchase and per smuggling contract. */
const INFAMY_PER_TRACED_PURCHASE = 4;
const INFAMY_PER_SMUGGLING_RUN = 2;
const INFAMY_PER_BLACK_MARKET_DEAL = 1;
const FACTION_INFAMY_DECAY_PER_HOUR = 0.02;

/** Freight premium as a fraction of cargo value, by how illegal the move is. */
const PREMIUM_BASE = 0.15;
const PREMIUM_UNDER_SANCTIONS = 0.55;

const SMUGGLING_RUN_SECONDS = 14 * 24 * 3600;

/** How much of an intel product's price a band can command per point of network. */
const INTEL_PRICE_PER_CONTROL = 90;
/** Standing below which a band is willing to sell a buyer a convincing lie. */
const LIE_STANDING_THRESHOLD = 0;

// ─── Markets ─────────────────────────────────────────────────────────────────

/** Bases that can host a grey market at all. */
function marketHosts(world: GameWorldState, org: PirateOrganization): PirateBase[] {
    return basesOf(world, org).filter(base =>
        baseIsOperational(base, world)
        && (base.kind === 'underground_market' || base.kind === 'smuggler_port')
    );
}

export function marketsOf(world: GameWorldState, organizationId: string): BlackMarket[] {
    return [...ensurePiracyState(world).blackMarkets.values()]
        .filter(m => m.organizationId === organizationId);
}

export function marketAt(world: GameWorldState, systemId: string): BlackMarket | null {
    for (const market of ensurePiracyState(world).blackMarkets.values()) {
        if (market.systemId === systemId) return market;
    }
    return null;
}

/** The legal price the grey price is quoted against. */
function legalPrice(world: GameWorldState, resource: string): number {
    const market = world.economy?.markets?.get(`galactic:${resource}`);
    return market?.currentPrice ?? FALLBACK_UNIT_PRICE;
}

/** What a buyer pays per unit here. Illegal resource = cheaper resource. */
export function blackMarketPrice(world: GameWorldState, market: BlackMarket, resource: string): number {
    return legalPrice(world, resource) * (1 - market.discount);
}

/**
 * Open, stock and re-price the grey markets. Loot banked at a market base is
 * what there is to sell; a market with nothing on the shelves is just a room.
 */
function refreshMarkets(world: GameWorldState, org: PirateOrganization, hours: number): void {
    const piracy = ensurePiracyState(world);

    for (const base of marketHosts(world, org)) {
        const id = `pmkt-${base.id}`;
        let market = piracy.blackMarkets.get(id);
        if (!market) {
            market = {
                id,
                organizationId: org.id,
                hostBaseId: base.id,
                systemId: base.systemId,
                stock: {},
                discount: BASE_DISCOUNT,
                liquidity: 0,
                traceability: BASE_TRACEABILITY,
                knownToFactionIds: [...base.knownToFactionIds],
            };
            piracy.blackMarkets.set(id, market);
            console.log(`[Piracy] ${org.name} opens a grey market at ${base.systemId}`);
        }

        // A market follows its host base. Bases change hands — merger, fracture,
        // the splinter at legitimization — and the market id is derived from the
        // base, so without this the record kept naming the old, now-dissolved
        // band forever while being restocked by the new owner.
        market.organizationId = org.id;

        // Throughput scales with the storage behind the counter.
        market.liquidity = BASE_KINDS[base.kind].storage * LIQUIDITY_PER_STORAGE;
        // A deep market can undercut harder; a thin one cannot afford to.
        const depth = Math.min(1, market.liquidity / 2_000);
        market.discount = Math.min(MAX_DISCOUNT, BASE_DISCOUNT + LIQUIDITY_DISCOUNT_BONUS * depth);
        // Cover carries over from the base: a market in a burned port is a trap.
        market.traceability = Math.min(1, BASE_TRACEABILITY + (1 - base.concealment) * 0.4);
        market.knownToFactionIds = [...new Set([...market.knownToFactionIds, ...base.knownToFactionIds])];

        // Convert banked loot into goods on the shelves.
        const converted = Math.min(base.storedLoot, market.liquidity * hours);
        if (converted > 0) {
            base.storedLoot -= converted;
            const resource = Resource.RARES;
            const units = converted / Math.max(1, legalPrice(world, resource));
            market.stock[resource] = (market.stock[resource] ?? 0) + units;
        }
    }

    // A market whose host is gone is gone.
    for (const market of [...piracy.blackMarkets.values()]) {
        if (market.organizationId !== org.id) continue;
        if (!piracy.bases.has(market.hostBaseId)) piracy.blackMarkets.delete(market.id);
    }
}

export interface PurchaseResult {
    ok: boolean;
    reason?: string;
    unitsBought: number;
    creditsPaid: number;
    /** True when the buyer was identified. Consequences follow. */
    traced: boolean;
}

/**
 * Buy stolen goods. A player doing this is making a correct decision with a
 * hidden bill attached: the discount is real, and so is the paper trail.
 */
export function buyFromBlackMarket(
    world: GameWorldState,
    marketId: string,
    buyerFactionId: string,
    resource: string,
    units: number
): PurchaseResult {
    const piracy = ensurePiracyState(world);
    const market = piracy.blackMarkets.get(marketId);
    if (!market) return { ok: false, reason: 'no such market', unitsBought: 0, creditsPaid: 0, traced: false };

    const available = market.stock[resource] ?? 0;
    const bought = Math.min(units, available);
    if (bought <= 0) return { ok: false, reason: 'nothing on the shelves', unitsBought: 0, creditsPaid: 0, traced: false };

    const price = blackMarketPrice(world, market, resource);
    const cost = bought * price;

    const buyer = world.economy?.factions?.get(buyerFactionId);
    const reserves = buyer?.reserves as Record<string, number> | undefined;
    if (!reserves || (reserves[Resource.CREDITS] ?? 0) < cost) {
        return { ok: false, reason: 'cannot pay', unitsBought: 0, creditsPaid: 0, traced: false };
    }

    reserves[Resource.CREDITS] -= cost;
    reserves[resource] = (reserves[resource] ?? 0) + bought;
    market.stock[resource] = available - bought;

    const org = piracy.organizations.get(market.organizationId);
    if (org) {
        org.treasury += cost;
        org.blackMarketLiquidity = market.liquidity;
    }

    // Buying more than the market clears in an hour is a large illegal purchase
    // that looks exactly like a large illegal purchase.
    const oversize = cost > market.liquidity ? OVERSIZE_TRACE_PENALTY : 0;
    const priorDeals = (buyer?.infamy ?? 0) / INFAMY_PER_TRACED_PURCHASE;
    const counterIntel = world.espionage?.factionIntel?.get(buyerFactionId)?.counterIntelStrength ?? 0;
    const chance = Math.max(0, Math.min(0.95,
        (market.traceability + oversize + priorDeals * REPEAT_TRACE_STEP) * (1 - counterIntel / 200)
    ));

    const rng = new RNG(seedFromString(`piracy|trace|${marketId}|${buyerFactionId}|${world.nowSeconds}`));
    const traced = rng.check(chance);

    if (buyer) {
        buyer.infamy = Math.min(100, (buyer.infamy ?? 0)
            + (traced ? INFAMY_PER_TRACED_PURCHASE : INFAMY_PER_BLACK_MARKET_DEAL));
    }
    if (traced) recordShadowAttribution(world, buyerFactionId, market.systemId, 'black-market purchase');

    return { ok: true, unitsBought: bought, creditsPaid: cost, traced };
}

/** Sell into the grey market — dumping embargoed goods, or laundering seizures. */
export function sellToBlackMarket(
    world: GameWorldState,
    marketId: string,
    sellerFactionId: string,
    resource: string,
    units: number
): PurchaseResult {
    const piracy = ensurePiracyState(world);
    const market = piracy.blackMarkets.get(marketId);
    if (!market) return { ok: false, reason: 'no such market', unitsBought: 0, creditsPaid: 0, traced: false };

    const reserves = world.economy?.factions?.get(sellerFactionId)?.reserves as Record<string, number> | undefined;
    const held = reserves?.[resource] ?? 0;
    const sold = Math.min(units, held);
    if (!reserves || sold <= 0) return { ok: false, reason: 'nothing to sell', unitsBought: 0, creditsPaid: 0, traced: false };

    // A fence pays under its own asking price; that spread is the band's cut.
    const proceeds = sold * blackMarketPrice(world, market, resource) * 0.7;
    const org = piracy.organizations.get(market.organizationId);
    if (!org || org.treasury < proceeds) {
        return { ok: false, reason: 'the market cannot cover it', unitsBought: 0, creditsPaid: 0, traced: false };
    }

    reserves[resource] = held - sold;
    reserves[Resource.CREDITS] = (reserves[Resource.CREDITS] ?? 0) + proceeds;
    org.treasury -= proceeds;
    market.stock[resource] = (market.stock[resource] ?? 0) + sold;

    return { ok: true, unitsBought: sold, creditsPaid: proceeds, traced: false };
}

/**
 * Record that a faction was seen doing business it should not have been. Rides
 * the espionage system's existing suspicion ladder rather than inventing one.
 */
function recordShadowAttribution(
    world: GameWorldState,
    factionId: string,
    systemId: string,
    what: string
): void {
    const records = world.espionage?.attributionRecords;
    if (!Array.isArray(records)) return;
    records.push({
        operationId: `shadow-${systemId}-${world.nowSeconds}`,
        suspectedFactionId: factionId,
        attributionState: 'suspected',
        probability: 0.6,
        tensionApplied: 0,
        resolvedAt: new Date(world.nowSeconds * 1000).toISOString(),
    });
    console.log(`[Piracy] ${factionId} traced to a ${what} at ${systemId}`);
}

// ─── Smuggling ───────────────────────────────────────────────────────────────

/** Factions someone has sanctioned or embargoed. Their trade is worth smuggling. */
function sanctionedFactions(world: GameWorldState): Set<string> {
    const out = new Set<string>();
    const policies = world.economy?.policies;
    if (!(policies instanceof Map)) return out;
    for (const policy of policies.values()) {
        const targets = policy.sanctions as unknown;
        if (targets instanceof Set) for (const id of targets) out.add(id as string);
        else if (Array.isArray(targets)) for (const id of targets) out.add(id as string);
        for (const embargo of policy.embargoes ?? []) out.add(embargo.factionId);
    }
    return out;
}

/** Units per hour a band can move outside the law. */
export function smugglingCapacity(world: GameWorldState, org: PirateOrganization): number {
    return basesOf(world, org)
        .filter(b => baseIsOperational(b, world))
        .reduce((sum, b) => {
            if (b.kind === 'smuggler_port') return sum + 40;
            if (b.kind === 'hidden_lane') return sum + 25;
            if (b.kind === 'underground_market') return sum + 10;
            return sum;
        }, 0);
}

/**
 * Open a smuggling run for a client. The tighter the barrier the client is
 * evading, the higher the premium — so sanctioning a faction with a friendly
 * band nearby creates pirate income rather than compliance.
 */
export function openSmugglingRun(
    world: GameWorldState,
    org: PirateOrganization,
    clientFactionId: string,
    resource: string,
    unitsPerHour: number
): SmugglingRun | null {
    if (org.stage < 3) return null;
    const capacity = smugglingCapacity(world, org);
    if (capacity <= 0) return null;

    const piracy = ensurePiracyState(world);
    const used = [...piracy.smugglingRuns.values()]
        .filter(r => r.organizationId === org.id && !r.interceptedAtSeconds)
        .reduce((sum, r) => sum + r.unitsPerHour, 0);
    const room = capacity - used;
    if (room <= 0) return null;

    const units = Math.min(unitsPerHour, room);
    const barrier = sanctionedFactions(world).has(clientFactionId)
        ? PREMIUM_UNDER_SANCTIONS
        : PREMIUM_BASE;

    // A band can open more than one run for the same client in the same tick,
    // so the id needs a discriminator — without one the second silently
    // overwrote the first and the capacity ceiling could be walked straight
    // through.
    const sequence = [...piracy.smugglingRuns.keys()]
        .filter(id => id.startsWith(`psmug-${org.id}-${clientFactionId}-${world.nowSeconds}`)).length;

    const run: SmugglingRun = {
        id: `psmug-${org.id}-${clientFactionId}-${world.nowSeconds}-${sequence}`,
        organizationId: org.id,
        clientFactionId,
        resource,
        unitsPerHour: units,
        freightPremiumPerHour: units * legalPrice(world, resource) * barrier,
        path: basesOf(world, org).map(b => b.systemId),
        startedAtSeconds: world.nowSeconds,
        expiresAtSeconds: world.nowSeconds + SMUGGLING_RUN_SECONDS,
    };
    piracy.smugglingRuns.set(run.id, run);

    const client = world.economy?.factions?.get(clientFactionId);
    if (client) client.infamy = Math.min(100, (client.infamy ?? 0) + INFAMY_PER_SMUGGLING_RUN);

    console.log(`[Piracy] ${org.name} runs ${resource} for ${clientFactionId}`);
    return run;
}

/**
 * Customs enforcement at a chokepoint a faction actually controls. Success
 * seizes the cargo and names the SHIPPER, not the band that carried it.
 */
export function enforceCustoms(
    world: GameWorldState,
    factionId: string,
    systemId: string,
    level: number
): SmugglingRun[] {
    const piracy = ensurePiracyState(world);
    const caught: SmugglingRun[] = [];
    const surveillance = world.espionage?.factionIntel?.get(factionId)?.surveillanceStrength ?? 0;

    for (const run of piracy.smugglingRuns.values()) {
        if (run.interceptedAtSeconds) continue;
        if (!run.path.includes(systemId)) continue;

        const org = piracy.organizations.get(run.organizationId);
        const concealment = org
            ? basesOf(world, org).reduce((best, b) => Math.max(best, b.concealment), 0)
            : 0.5;
        const chance = Math.max(0, Math.min(0.95,
            (0.15 + level * 0.1 + surveillance / 300) * (1 - concealment)
        ));

        const rng = new RNG(seedFromString(`piracy|customs|${run.id}|${systemId}|${world.nowSeconds}`));
        if (!rng.check(chance)) continue;

        run.interceptedAtSeconds = world.nowSeconds;
        run.interceptedByFactionId = factionId;
        caught.push(run);
        recordShadowAttribution(world, run.clientFactionId, systemId, 'smuggling run');
    }
    return caught;
}

// ─── The intelligence marketplace ────────────────────────────────────────────

export interface IntelSale {
    ok: boolean;
    reason?: string;
    price: number;
    reportId?: string;
}

/**
 * Sell what a band knows. Pirates see merchant schedules because they hunt
 * them and fleet movements because they hide from them — and a band with a low
 * opinion of its buyer will happily sell a convincing lie, using the espionage
 * system's own falsification machinery.
 */
export function sellIntel(
    world: GameWorldState,
    org: PirateOrganization,
    buyerFactionId: string,
    aboutFactionId: string,
    domain: 'military' | 'political' | 'scientific'
): IntelSale {
    if (org.stage < 3) return { ok: false, reason: 'no network to sell from', price: 0 };

    const price = Math.round(Math.max(500, org.networkControl * INTEL_PRICE_PER_CONTROL));
    const reserves = world.economy?.factions?.get(buyerFactionId)?.reserves as Record<string, number> | undefined;
    if (!reserves || (reserves[Resource.CREDITS] ?? 0) < price) {
        return { ok: false, reason: 'cannot pay', price };
    }

    const report = generateImmediateReport(buyerFactionId, aboutFactionId, domain, world);
    if (!report) return { ok: false, reason: 'nothing worth selling', price };

    reserves[Resource.CREDITS] -= price;
    org.treasury += price;

    // A band that does not like its customer sells them something plausible and
    // wrong. `confidence` — what the buyer sees — stays high on purpose.
    const standing = org.relations[buyerFactionId]?.standing ?? 0;
    if (standing < LIE_STANDING_THRESHOLD) {
        const rng = new RNG(seedFromString(`piracy|lie|${org.id}|${buyerFactionId}|${world.nowSeconds}`));
        if (rng.check(0.6)) report.accurate = false;
    }

    // The band now knows what the buyer wanted to know, which is worth more
    // than the fee to anyone else asking.
    const buyer = world.economy?.factions?.get(buyerFactionId);
    if (buyer) buyer.infamy = Math.min(100, (buyer.infamy ?? 0) + INFAMY_PER_BLACK_MARKET_DEAL);

    return { ok: true, price, reportId: report.id };
}

/** Whether a band's transit data is exclusive enough to be worth buying. */
export function intelIsExclusive(org: PirateOrganization): boolean {
    return ownsInformation(org);
}

// ─── Espionage shadow nodes become real infrastructure ───────────────────────

/**
 * An empire that runs a `shadowEconomy` operation is not conjuring abstract
 * "hidden activity" — it is paying somebody to build a grey market, and that
 * somebody keeps the keys. Every active ShadowEconomyNode hands an underground
 * market to the band working that ground, founding one if none exists.
 *
 * This is what makes the sponsorship exposure ladder in Phase 7 have something
 * to find: the node names its sponsor, and the base it produced outlives the op.
 */
function adoptShadowNodes(world: GameWorldState): void {
    const nodes = world.espionage?.shadowEconomyNodes;
    if (!(nodes instanceof Map)) return;

    for (const node of nodes.values()) {
        if (new Date(node.expiresAt).getTime() / 1000 <= world.nowSeconds) continue;

        const existing = basesInSystemOwnedByAnyBand(world, node.systemId);
        if (existing) continue;

        const host = nearestOrganization(world, node.systemId, 3)
            ?? foundOrganization(world, node.systemId, [], 'sponsored');

        // The sponsor paid for it, so the band does not: this arrives free, and
        // the band remembers who provided it.
        const built = establishBase(world, host, 'underground_market', node.systemId, { free: true });
        if (!built) continue;

        const relation = host.relations[node.factionId];
        if (relation) relation.standing = Math.min(100, relation.standing + 20);
        else host.relations[node.factionId] = {
            factionId: node.factionId, standing: 20, agreements: ['secretContract'],
            lastContactTick: world.nowSeconds, secret: true,
        };
        console.log(`[Piracy] ${node.factionId}'s shadow hub at ${node.systemId} is run by ${host.name}`);
    }
}

function basesInSystemOwnedByAnyBand(world: GameWorldState, systemId: string): boolean {
    for (const base of ensurePiracyState(world).bases.values()) {
        if (base.systemId === systemId && base.kind === 'underground_market') return true;
    }
    return false;
}

// ─── Step 11g — the shadow tick ──────────────────────────────────────────────

export function tickShadowEconomy(world: GameWorldState, deltaSeconds: number): void {
    const piracy = ensurePiracyState(world);
    const hours = Math.max(0, deltaSeconds / 3600);
    if (hours <= 0) return;

    adoptShadowNodes(world);

    for (const org of activeOrganizations(world)) {
        refreshMarkets(world, org, hours);

        // Liquidity is the survival stat: a band with markets and no fleets is
        // dormant, not dead.
        org.blackMarketLiquidity = marketsOf(world, org.id)
            .reduce((sum, market) => sum + market.liquidity, 0);
    }

    // Smuggling: collect the freight premium, expire finished runs.
    for (const run of [...piracy.smugglingRuns.values()]) {
        const org = piracy.organizations.get(run.organizationId);
        const done = world.nowSeconds >= run.expiresAtSeconds || !!run.interceptedAtSeconds;
        if (!org || org.dissolvedAtSeconds || done) {
            if (done) piracy.smugglingRuns.delete(run.id);
            continue;
        }
        const due = run.freightPremiumPerHour * hours;
        const reserves = world.economy?.factions?.get(run.clientFactionId)?.reserves as Record<string, number> | undefined;
        if (reserves && (reserves[Resource.CREDITS] ?? 0) >= due) {
            reserves[Resource.CREDITS] -= due;
            org.treasury += due;
        } else {
            piracy.smugglingRuns.delete(run.id);
        }
    }

    // A quiet empire's reputation recovers; an active one's does not.
    for (const faction of world.economy?.factions?.values() ?? []) {
        if (faction.infamy === undefined) continue;
        faction.infamy = Math.max(0, faction.infamy - FACTION_INFAMY_DECAY_PER_HOUR * hours);
    }

    tickShadowPathways(world);
}

/**
 * Advance each empire along the societal ladder in lib/mechanics/pathway-logic.ts.
 *
 * That ladder has existed since before this system, complete with a `shadow`
 * branch gated on an `infamy` metric — and it was dead code: nothing computed
 * infamy and nothing ever called evaluatePathwayProgression. Now that dealing
 * with pirates produces infamy, the branch has an input and the ladder has a
 * caller. An empire that buys enough stolen cargo becomes, formally, a
 * smuggling power.
 */
export function tickShadowPathways(world: GameWorldState): void {
    const militaryScore = new Map<string, number>();
    for (const fleet of world.movement.fleets.values()) {
        const power = ((fleet.basePower ?? 0) * (fleet.strength ?? 0)) / 100;
        militaryScore.set(fleet.factionId, (militaryScore.get(fleet.factionId) ?? 0) + power);
    }

    for (const faction of world.economy?.factions?.values() ?? []) {
        const reserves = faction.reserves as Record<string, number> | undefined;
        const result = evaluatePathwayProgression(
            (faction.pathwayId as PathwayId) ?? 'sovereign',
            faction.pathwayRank ?? 0,
            {
                wealth: reserves?.[Resource.CREDITS] ?? 0,
                infamy: faction.infamy ?? 0,
                legitimacy: world.government?.get(faction.id)?.legitimacy ?? 0,
                militaryScore: militaryScore.get(faction.id) ?? 0,
            }
        );

        if (result.newPathway) faction.pathwayId = result.newPathway;
        if (result.newRank !== undefined) {
            faction.pathwayRank = result.newRank;
            const pathway = faction.pathwayId ?? 'sovereign';
            console.log(`[Pathway] ${faction.name} reaches rank ${result.newRank} of the ${pathway} ladder`);
        }
    }
}
