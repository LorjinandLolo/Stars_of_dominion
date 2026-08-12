// scripts/test-piracy-phase6.ts
// Pirate system Phase 6 verification — the shadow economy: grey markets and
// their paper trail, smuggling and customs, the intelligence marketplace
// (including the lies), faction infamy, and the shadow pathway it feeds.
// Run: npx tsx scripts/test-piracy-phase6.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import { Market, Resource } from '../lib/trade-system/types';
import {
    blackMarketPrice,
    buyFromBlackMarket,
    enforceCustoms,
    marketsOf,
    openSmugglingRun,
    sellIntel,
    sellToBlackMarket,
    smugglingCapacity,
    tickShadowEconomy,
    tickShadowPathways,
} from '../lib/piracy/black-market-service';
import {
    ensurePiracyState,
    foundOrganization,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, BASE_KINDS } from '../lib/piracy/base-service';
import { computeNetworkControl } from '../lib/piracy/protection-service';
import type { PirateOrganization } from '../lib/piracy/piracy-types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSystem(id: string, neighbours: string[] = []): SystemNode {
    return {
        id, name: id, q: 0, r: 0, tags: [],
        tagReveal: { allTags: [], revealedAt: {} },
        hyperlaneNeighbors: neighbours, tradeSegmentIds: [], corridorIds: [],
        instability: 0, escalationLevel: 0, security: 20, tradeValue: 60, lawlessness: 70,
    };
}

function makeFleet(id: string, systemId: string, orgId: string): Fleet {
    return {
        id, factionId: PIRATE_FACTION_ID, name: id, currentSystemId: systemId,
        destinationSystemId: null, organizationId: orgId,
        activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [],
        doctrine: {
            type: 'Raider', deviationFromPosture: 0, preferredLayers: ['hyperlane'],
            retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1,
        },
        postureId: 'Expansionist', strength: 1, basePower: 100, composition: { interceptor: 2 },
        hyperdriveProfile: {} as never, isDetectable: true,
    };
}

function makeWorld(nowSeconds = 200_000): GameWorldState {
    const rares: Market = {
        theatreId: 'galactic', resource: Resource.RARES, supply: 1000, demand: 1000,
        basePrice: 20, volatility: 0.1, currentPrice: 20,
    };
    return {
        nowSeconds,
        movement: {
            systems: new Map([
                ['sys-port', makeSystem('sys-port', ['sys-b'])],
                ['sys-b', makeSystem('sys-b', ['sys-port'])],
            ]),
            fleets: new Map<string, Fleet>(),
            corridors: new Map(),
            planets: new Map([['p1', { id: 'p1', systemId: 'sys-port' } as never]]),
            tradeSegments: new Map(),
            gates: new Map(),
            nowSeconds,
        },
        economy: {
            // A smuggler port needs commerce within reach to be worth having,
            // so the fixture gives the region a lane to prey on.
            tradeRoutes: new Map([['route-1', {
                id: 'route-1', agreementId: 'agr-1', path: ['sys-port', 'sys-b'],
                theatreId: 'T1', exposureScore: 0, piracyRisk: 0.2, blockadeRisk: 0,
                deepSpaceRisk: 0, escortLevel: 0, routePriority: 20,
            }]]),
            tradeAgreements: new Map([['agr-1', {
                id: 'agr-1', aFactionId: 'faction-a', bFactionId: 'faction-b',
                resource: Resource.RARES, volumePerHour: 100, startTick: 0,
                endTick: 999_999, priceFormula: 'market',
            }]]),
            markets: new Map([['galactic:RARES', rares]]),
            factions: new Map([
                ['faction-a', {
                    id: 'faction-a', name: 'Aurelia',
                    reserves: { CREDITS: 1_000_000, RARES: 500 },
                }],
                ['faction-b', {
                    id: 'faction-b', name: 'Bellum',
                    reserves: { CREDITS: 1_000_000 },
                }],
            ]),
            policies: new Map(),
            piracyFleets: new Map(),
        },
        corporate: { companies: new Map() },
        espionage: {
            shadowEconomyNodes: new Map(),
            attributionRecords: [],
            factionIntel: new Map(),
            reports: new Map(),
            agents: new Map(),
            intelNetworks: new Map(),
            operations: new Map(),
            boardOpportunities: new Map(),
            regionEscalation: new Map(),
        },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            protectionContracts: new Map(), tributes: new Map(),
            blackMarkets: new Map(), smugglingRuns: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        },
    } as unknown as GameWorldState;
}

/** A band with a smuggler port and loot banked behind the counter. */
function fence(world: GameWorldState, loot = 40_000): PirateOrganization {
    const org = foundOrganization(world, 'sys-port', []);
    org.treasury = 300_000;
    org.stage = 3;
    org.infamy = 50;
    world.movement.fleets.set('pirate-1', makeFleet('pirate-1', 'sys-port', org.id));
    org.fleetIds.push('pirate-1');

    const port = establishBase(world, org, 'smuggler_port', 'sys-port')!;
    world.nowSeconds += BASE_KINDS.smuggler_port.buildSeconds;
    port.storedLoot = loot;
    tickShadowEconomy(world, 3600);
    return org;
}

const marketOf = (world: GameWorldState, org: PirateOrganization) => marketsOf(world, org.id)[0];

// ─── 1. Markets open behind the counter ──────────────────────────────────────

console.log('\n[1] markets');
{
    const world = makeWorld();
    const org = foundOrganization(world, 'sys-port', []);
    org.treasury = 300_000;
    org.stage = 3;

    tickShadowEconomy(world, 3600);
    check('a band with no market base has no market', marketsOf(world, org.id).length === 0);

    const port = establishBase(world, org, 'smuggler_port', 'sys-port')!;
    tickShadowEconomy(world, 3600);
    check('an unbuilt port opens nothing', marketsOf(world, org.id).length === 0);

    world.nowSeconds += BASE_KINDS.smuggler_port.buildSeconds;
    port.storedLoot = 40_000;
    tickShadowEconomy(world, 3600);

    const market = marketOf(world, org);
    check('a built port opens a grey market', !!market);
    check('loot on the shelves becomes goods', (market.stock[Resource.RARES] ?? 0) > 0,
        JSON.stringify(market.stock));
    check('and leaves the vault', port.storedLoot < 40_000, `${port.storedLoot}`);
    check('the market has throughput', market.liquidity > 0, `${market.liquidity}`);
}

// ─── 2. Illegal resource = cheaper resource ──────────────────────────────────

console.log('\n[2] pricing');
{
    const world = makeWorld();
    const org = fence(world);
    const market = marketOf(world, org);

    const legal = world.economy.markets.get('galactic:RARES')!.currentPrice;
    const grey = blackMarketPrice(world, market, Resource.RARES);
    check('the grey price undercuts the legal one', grey < legal, `${grey} vs ${legal}`);
    check('but not absurdly', grey > legal * 0.3, `${grey}`);

    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const creditsBefore = reserves.CREDITS;
    const raresBefore = reserves.RARES;
    const treasuryBefore = org.treasury;

    const result = buyFromBlackMarket(world, market.id, 'faction-a', Resource.RARES, 10);
    check('the purchase goes through', result.ok, result.reason);
    check('the buyer gets the goods', reserves.RARES > raresBefore);
    check('and pays for them', reserves.CREDITS < creditsBefore);
    check('the band is paid', org.treasury > treasuryBefore);
    check('at the discounted price',
        Math.abs(result.creditsPaid - result.unitsBought * grey) < 0.01,
        `${result.creditsPaid}`);

    const empty = buyFromBlackMarket(world, market.id, 'faction-a', Resource.CHEMICALS, 5);
    check('you cannot buy what is not on the shelves', !empty.ok);
}

// ─── 3. The paper trail ──────────────────────────────────────────────────────

console.log('\n[3] traceability');
{
    const world = makeWorld();
    const org = fence(world, 400_000);
    const market = marketOf(world, org);
    const buyer = world.economy.factions.get('faction-a')!;

    // A large illegal purchase looks exactly like a large illegal purchase.
    const big = buyFromBlackMarket(world, market.id, 'faction-a', Resource.RARES, 5_000);
    check('a large buy clears', big.ok, big.reason);
    check('buying at all makes an empire more compromised', (buyer.infamy ?? 0) > 0,
        `${buyer.infamy}`);

    let traced = false;
    for (let i = 0; i < 30 && !traced; i++) {
        world.nowSeconds += 3600;
        tickShadowEconomy(world, 3600);
        const r = buyFromBlackMarket(world, market.id, 'faction-a', Resource.RARES, 500);
        traced = traced || r.traced;
    }
    check('a repeat customer is eventually identified', traced);
    check('and the espionage system has a record of it',
        world.espionage.attributionRecords.some(r => r.suspectedFactionId === 'faction-a'));
    check('a faction that never dealt is clean',
        (world.economy.factions.get('faction-b')!.infamy ?? 0) === 0);
}

// ─── 4. Selling into the market ──────────────────────────────────────────────

console.log('\n[4] laundering');
{
    const world = makeWorld();
    const org = fence(world);
    const market = marketOf(world, org);
    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const raresBefore = reserves.RARES;
    const creditsBefore = reserves.CREDITS;

    const result = sellToBlackMarket(world, market.id, 'faction-a', Resource.RARES, 50);
    check('a faction can dump goods into the grey market', result.ok, result.reason);
    check('the goods leave', reserves.RARES < raresBefore);
    check('credits arrive', reserves.CREDITS > creditsBefore);
    check('the fence pays under its own asking price',
        result.creditsPaid < result.unitsBought * blackMarketPrice(world, market, Resource.RARES),
        `${result.creditsPaid}`);
}

// ─── 5. Smuggling ────────────────────────────────────────────────────────────

console.log('\n[5] smuggling');
{
    const world = makeWorld();
    const org = fence(world);
    check('a port gives real capacity', smugglingCapacity(world, org) > 0);

    const plain = openSmugglingRun(world, org, 'faction-b', Resource.RARES, 10)!;
    check('a run opens', !!plain);
    check('the client is now compromised',
        (world.economy.factions.get('faction-b')!.infamy ?? 0) > 0);

    // Sanction the client: the same cargo is now worth far more to move.
    const sanctioned = makeWorld();
    const org2 = fence(sanctioned);
    sanctioned.economy.policies.set('faction-a', {
        sanctions: new Set(['faction-b']), embargoes: [],
    } as never);
    const premium = openSmugglingRun(sanctioned, org2, 'faction-b', Resource.RARES, 10)!;
    check('an embargo makes smuggling far more lucrative',
        premium.freightPremiumPerHour > plain.freightPremiumPerHour * 2,
        `${premium.freightPremiumPerHour} vs ${plain.freightPremiumPerHour}`);

    // Collection.
    const reserves = sanctioned.economy.factions.get('faction-b')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;
    const treasuryBefore = org2.treasury;
    sanctioned.nowSeconds += 3600;
    tickShadowEconomy(sanctioned, 3600);
    check('the client pays the freight premium', reserves.CREDITS < before);
    check('the band collects it', org2.treasury > treasuryBefore);

    // Capacity is finite.
    const capacity = smugglingCapacity(world, org);
    openSmugglingRun(world, org, 'faction-b', Resource.RARES, capacity * 2);
    const overflow = openSmugglingRun(world, org, 'faction-b', Resource.RARES, 50);
    check('a band cannot move more than its ports can handle', overflow === null);
}

// ─── 6. Customs ──────────────────────────────────────────────────────────────

console.log('\n[6] customs');
{
    const world = makeWorld();
    const org = fence(world);
    // Blown cover: a band with no concealment left is easy to catch.
    for (const base of ensurePiracyState(world).bases.values()) base.concealment = 0;
    const run = openSmugglingRun(world, org, 'faction-b', Resource.RARES, 10)!;

    let caught = false;
    for (let i = 0; i < 30 && !caught; i++) {
        world.nowSeconds += 3600;
        caught = enforceCustoms(world, 'faction-a', 'sys-port', 5).length > 0;
    }
    check('customs eventually intercepts a run', caught);
    check('the run is marked', !!run.interceptedAtSeconds);
    check('the seizure names the SHIPPER, not the carrier',
        world.espionage.attributionRecords.some(r => r.suspectedFactionId === 'faction-b'));

    const treasuryBefore = org.treasury;
    world.nowSeconds += 3600;
    tickShadowEconomy(world, 3600);
    check('an intercepted run stops paying', org.treasury === treasuryBefore);
}

// ─── 7. The intelligence marketplace ─────────────────────────────────────────

console.log('\n[7] intel');
{
    const world = makeWorld();
    const org = fence(world);
    org.networkControl = 60;

    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;

    const sale = sellIntel(world, org, 'faction-a', 'faction-b', 'military');
    check('a corsair network can sell what it knows', sale.ok, sale.reason);
    check('the buyer pays', reserves.CREDITS === before - sale.price);
    check('a report lands in their files', world.espionage.reports.has(sale.reportId!));

    const gang = foundOrganization(world, 'sys-b', []);
    check('a gang has no network to sell from',
        !sellIntel(world, gang, 'faction-a', 'faction-b', 'military').ok);

    // A band that dislikes its customer sells a convincing lie, and the
    // displayed confidence stays high on purpose.
    const hostile = makeWorld();
    const liar = fence(hostile);
    liar.networkControl = 60;
    liar.relations['faction-a'] = {
        factionId: 'faction-a', standing: -60, agreements: [],
        lastContactTick: hostile.nowSeconds, secret: false,
    };
    let soldLie = false;
    for (let i = 0; i < 20 && !soldLie; i++) {
        hostile.nowSeconds += 3600;
        const s = sellIntel(hostile, liar, 'faction-a', 'faction-b', 'military');
        const report = s.reportId ? hostile.espionage.reports.get(s.reportId) : undefined;
        if (report && !report.accurate) soldLie = true;
    }
    check('a band with a grudge sells falsified intelligence', soldLie);
}

// ─── 8. Liquidity is a power metric ──────────────────────────────────────────

console.log('\n[8] liquidity');
{
    const world = makeWorld();
    const org = fence(world);
    check('running a market is liquidity', org.blackMarketLiquidity > 0,
        `${org.blackMarketLiquidity}`);

    const withMarket = computeNetworkControl(world, org);
    org.blackMarketLiquidity = 0;
    const without = computeNetworkControl(world, org);
    check('and it counts toward network control', withMarket > without,
        `${withMarket.toFixed(1)} vs ${without.toFixed(1)}`);

    // The survival property: no ships, still a power.
    org.blackMarketLiquidity = 200;
    world.movement.fleets.clear();
    org.fleetIds = [];
    check('a band with markets and no fleets is dormant, not dead',
        computeNetworkControl(world, org) > 0);
}

// ─── 9. Espionage shadow nodes become real infrastructure ────────────────────

console.log('\n[9] shadow hubs');
{
    const world = makeWorld();
    world.espionage.shadowEconomyNodes.set('sys-b', {
        systemId: 'sys-b',
        factionId: 'faction-a',
        piracyChancePerHour: 0.1,
        smugglingCapacity: 0.5,
        insuranceCostInflation: 0.1,
        expiresAt: new Date((world.nowSeconds + 86_400) * 1000).toISOString(),
    } as never);

    tickShadowEconomy(world, 3600);

    const bases = [...ensurePiracyState(world).bases.values()];
    check('an operation that bought hidden activity built something real',
        bases.some(b => b.systemId === 'sys-b' && b.kind === 'underground_market'),
        bases.map(b => `${b.kind}@${b.systemId}`).join(','));

    const owner = [...ensurePiracyState(world).organizations.values()]
        .find(o => o.baseIds.some(id => ensurePiracyState(world).bases.get(id)?.systemId === 'sys-b'))!;
    check('a band runs it, not the sponsor', !!owner);
    check('and the band knows who paid', (owner.relations['faction-a']?.standing ?? 0) > 0);
    check('the arrangement is secret', owner.relations['faction-a']?.secret === true);

    tickShadowEconomy(world, 3600);
    check('a second tick does not build a duplicate',
        [...ensurePiracyState(world).bases.values()]
            .filter(b => b.systemId === 'sys-b' && b.kind === 'underground_market').length === 1);
}

// ─── 10. The shadow pathway finally has an input ─────────────────────────────

console.log('\n[10] shadow pathway');
{
    const world = makeWorld();
    const faction = world.economy.factions.get('faction-a')!;
    // The ladder promotes an empire to its highest eligible rank on ANY branch,
    // so a fabulously rich state is a Financial Hegemon whatever else it does.
    // A modest treasury is what makes the shadow branch its best claim.
    (faction.reserves as Record<string, number>).CREDITS = 6_000;

    faction.infamy = 5;
    tickShadowPathways(world);
    check('a clean empire is not on the shadow ladder', faction.pathwayId !== 'shadow',
        `${faction.pathwayId}`);

    faction.infamy = 55;
    tickShadowPathways(world);
    check('a compromised one is', faction.pathwayId === 'shadow', `${faction.pathwayId}`);
    check('at the rank its infamy earned', (faction.pathwayRank ?? 0) >= 2,
        `${faction.pathwayRank}`);

    faction.infamy = 96;
    tickShadowPathways(world);
    check('the worst of them becomes a pirate king', (faction.pathwayRank ?? 0) === 4,
        `${faction.pathwayRank}`);

    // Wealth outranks infamy, which is the ladder's own rule rather than ours.
    const tycoon = world.economy.factions.get('faction-b')!;
    tycoon.infamy = 55;
    tickShadowPathways(world);
    check('a rich empire is measured by its money first', tycoon.pathwayId === 'mercantile',
        `${tycoon.pathwayId}`);
}

// ─── 11. Infamy fades ────────────────────────────────────────────────────────

console.log('\n[11] decay');
{
    const world = makeWorld();
    const faction = world.economy.factions.get('faction-a')!;
    faction.infamy = 40;

    for (let i = 0; i < 20; i++) {
        world.nowSeconds += 3600;
        tickShadowEconomy(world, 3600);
    }
    check('an empire that stops dealing recovers its name', (faction.infamy ?? 0) < 40,
        `${faction.infamy}`);
}

// ─── 12. Determinism ─────────────────────────────────────────────────────────

console.log('\n[12] determinism');
{
    const run = () => {
        const world = makeWorld();
        const org = fence(world, 200_000);
        const market = marketOf(world, org);
        const log: string[] = [];
        for (let i = 0; i < 20; i++) {
            world.nowSeconds += 3600;
            tickShadowEconomy(world, 3600);
            const r = buyFromBlackMarket(world, market.id, 'faction-a', Resource.RARES, 100);
            log.push(`${r.ok}:${Math.round(r.creditsPaid)}:${r.traced}`);
        }
        return log.join('|');
    };
    check('the same market yields the same trades', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
