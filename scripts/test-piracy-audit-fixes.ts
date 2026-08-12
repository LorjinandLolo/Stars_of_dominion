// scripts/test-piracy-audit-fixes.ts
// Regression cover for the defects an adversarial audit of the pirate system
// confirmed. Each block names the thing that was actually wrong, so a future
// change that reintroduces it fails here rather than in a live game.
// Run: npx tsx scripts/test-piracy-audit-fixes.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import { RNG } from '../lib/trade-system/rng';
import { derivePiracyFleets, tickPiracyInterdiction } from '../lib/trade-system/piracy-service';
import {
    activeOrganizations,
    ensurePiracyState,
    foundOrganization,
    reconcileRaiderRosters,
    tickPirateOrganizations,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, BASE_KINDS } from '../lib/piracy/base-service';
import { tickShadowEconomy } from '../lib/piracy/black-market-service';
import { canLegitimize, legitimize, tryMerge } from '../lib/piracy/succession-service';
import { openSponsorship, tickSponsorship } from '../lib/piracy/sponsorship-service';
import { offerAmnesty, postBounty, tickBounties } from '../lib/piracy/counter-piracy-service';
import { signProtectionContract } from '../lib/piracy/protection-service';
import type { PirateDoctrine, PirateOrganization } from '../lib/piracy/piracy-types';

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

function makeFleet(id: string, systemId: string, orgId: string | null, strength = 1): Fleet {
    return {
        id, factionId: PIRATE_FACTION_ID, name: id, currentSystemId: systemId,
        destinationSystemId: null, organizationId: orgId,
        activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [],
        doctrine: {
            type: 'Raider', deviationFromPosture: 0, preferredLayers: ['hyperlane'],
            retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1,
        },
        postureId: 'Expansionist', strength, basePower: 100, composition: { interceptor: 2 },
        hyperdriveProfile: {} as never, isDetectable: true,
    };
}

const ROUTE: TradeRoute = {
    id: 'route-1', agreementId: 'agr-1', path: ['sys-lane', 'sys-b'], theatreId: 'T1',
    exposureScore: 0, piracyRisk: 0.3, blockadeRisk: 0, deepSpaceRisk: 0,
    escortLevel: 0, routePriority: 30,
};
const AGREEMENT: TradeAgreement = {
    id: 'agr-1', aFactionId: 'faction-a', bFactionId: 'faction-b',
    resource: Resource.RARES, volumePerHour: 100, startTick: 0, endTick: 999_999,
    priceFormula: 'market',
};

function makeWorld(nowSeconds = 600_000): GameWorldState {
    return {
        nowSeconds,
        movement: {
            systems: new Map([
                ['sys-lane', makeSystem('sys-lane', ['sys-b'])],
                ['sys-b', makeSystem('sys-b', ['sys-lane'])],
                ['sys-c', makeSystem('sys-c', ['sys-b'])],
            ]),
            fleets: new Map<string, Fleet>(),
            corridors: new Map(), planets: new Map([['p1', { id: 'p1', systemId: 'sys-lane' } as never]]),
            tradeSegments: new Map(), gates: new Map(), nowSeconds,
        },
        economy: {
            tradeRoutes: new Map([[ROUTE.id, { ...ROUTE }]]),
            tradeAgreements: new Map([[AGREEMENT.id, AGREEMENT]]),
            markets: new Map(),
            factions: new Map([
                ['faction-a', { id: 'faction-a', name: 'A', reserves: { CREDITS: 1_000_000 } }],
                ['faction-b', { id: 'faction-b', name: 'B', reserves: { CREDITS: 1_000_000 } }],
            ]),
            policies: new Map(), piracyFleets: new Map(),
        },
        corporate: { companies: new Map() },
        espionage: {
            shadowEconomyNodes: new Map(), attributionRecords: [], factionIntel: new Map(),
            reports: new Map(), agents: new Map(), intelNetworks: new Map(),
            operations: new Map(), boardOpportunities: new Map(), regionEscalation: new Map(),
        },
        press: { empires: new Map(), activeStories: new Map(), publishedStories: [], tick: 0 },
        leadership: { leaders: new Map(), recruitmentPool: [], nowSeconds },
        government: new Map(), rivalries: new Map(), secessionCrises: new Map(),
        piracy: {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            protectionContracts: new Map(), tributes: new Map(),
            blackMarkets: new Map(), smugglingRuns: new Map(), sponsorships: new Map(),
            successions: new Map(), captures: new Map(), bounties: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        },
    } as unknown as GameWorldState;
}

function band(world: GameWorldState, systemId = 'sys-lane', fleets = 3): PirateOrganization {
    const org = foundOrganization(world, systemId, []);
    org.treasury = 100_000;
    org.stage = 3;
    org.infamy = 45;
    for (let i = 1; i <= fleets; i++) {
        const id = `pirate-${org.id}-${i}`;
        world.movement.fleets.set(id, makeFleet(id, systemId, org.id));
        org.fleetIds.push(id);
    }
    return org;
}

function setWings(org: PirateOrganization, shares: Partial<Record<PirateDoctrine, number>>) {
    for (const wing of org.factions) wing.pressure = shares[wing.doctrine] ?? 0;
}

// ─── 1. Rival bands sharing a system are separate camps ──────────────────────

console.log('\n[1] one camp per band, not per system');
{
    const camps = derivePiracyFleets([
        { fleetId: 'a1', systemId: 'sys-lane', strength: 0.6, organizationId: 'porg-a' },
        { fleetId: 'b1', systemId: 'sys-lane', strength: 0.6, organizationId: 'porg-b' },
    ], new Map());

    check('two bands in one system make two camps', camps.size === 2, `${camps.size}`);
    const owners = [...camps.values()].map(c => c.organizationId).sort();
    check('each camp names its own band', owners.join(',') === 'porg-a,porg-b', owners.join(','));
    check('neither inherits the other\'s strength',
        [...camps.values()].every(c => Math.abs(c.interdictionStrength - 0.3) < 1e-6),
        [...camps.values()].map(c => c.interdictionStrength).join(','));

    // Order must not decide who gets credited.
    const swapped = derivePiracyFleets([
        { fleetId: 'b1', systemId: 'sys-lane', strength: 0.6, organizationId: 'porg-b' },
        { fleetId: 'a1', systemId: 'sys-lane', strength: 0.6, organizationId: 'porg-a' },
    ], new Map());
    check('insertion order changes nothing',
        [...swapped.values()].map(c => c.interdictionStrength).join(',')
        === [...camps.values()].map(c => c.interdictionStrength).join(','));
}

// ─── 2. Escorts are charged once ─────────────────────────────────────────────

console.log('\n[2] escort level applied once');
{
    const routes = [{ ...ROUTE, escortLevel: 5 }];
    const camps = derivePiracyFleets(
        [{ fleetId: 'a1', systemId: 'sys-lane', strength: 2, organizationId: 'porg-a' }],
        new Map()
    );

    // With an explicit odds resolver the legacy escort mitigation must not run:
    // a resolver returning 1 means "certain", escorts already priced in.
    const withResolver = tickPiracyInterdiction(
        [...camps.values()], routes, new RNG(1), () => 1
    );
    check('a supplied resolver is the final word', withResolver.length === 1,
        `${withResolver.length} hit(s)`);

    // Without one, the legacy path still mitigates by escort level.
    const legacy = tickPiracyInterdiction([...camps.values()], [{ ...ROUTE, escortLevel: 8 }], new RNG(1));
    check('the legacy path still respects escorts', legacy.length === 0, `${legacy.length} hit(s)`);
}

// ─── 3. Per-route odds and posture, not per camp ─────────────────────────────

console.log('\n[3] a junction does not share one lane\'s defences');
{
    const easy: TradeRoute = { ...ROUTE, id: 'easy', escortLevel: 0 };
    const hard: TradeRoute = { ...ROUTE, id: 'hard', escortLevel: 8 };
    const camps = derivePiracyFleets(
        [{ fleetId: 'a1', systemId: 'sys-lane', strength: 2, organizationId: 'porg-a' }],
        new Map()
    );
    const seen: string[] = [];
    tickPiracyInterdiction([...camps.values()], [easy, hard], new RNG(1),
        (_c, route) => (route.id === 'easy' ? 1 : 0));
    for (const r of tickPiracyInterdiction([...camps.values()], [easy, hard], new RNG(2),
        (_c, route) => (route.id === 'easy' ? 1 : 0))) seen.push(r.routeId);

    check('the unescorted lane is hit', seen.includes('easy'));
    check('the escorted one sharing the junction is not', !seen.includes('hard'), seen.join(','));
}

// ─── 4. Doctrine follows recent revenue, not a lifetime counter ──────────────

console.log('\n[4] the raider wing is fed by RECENT raids');
{
    const world = makeWorld();
    const org = band(world);
    org.raidsLanded = 12;                                  // a long history
    org.lastRaidAtSeconds = world.nowSeconds - 90 * 3600;  // but nothing lately
    setWings(org, { merchant: 30, raider: 30, smuggler: 40 });
    org.relations['faction-a'] = {
        factionId: 'faction-a', standing: 40, agreements: ['protection'],
        lastContactTick: world.nowSeconds, secret: false,
    };
    // What a band living on rackets and grey trade actually looks like: the
    // protection coverage shows up as network control (tickProtection computes
    // it), and the markets show up as liquidity.
    org.networkControl = 60;
    org.blackMarketLiquidity = 4_000;

    const raiderPressureBefore = org.factions.find(f => f.doctrine === 'raider')!.pressure;
    for (let i = 0; i < 40; i++) {
        world.nowSeconds += 3600;
        tickPirateOrganizations(world, 3600);
    }
    check('the raider wing loses ground once the raiding stops',
        org.factions.find(f => f.doctrine === 'raider')!.pressure < raiderPressureBefore,
        `${org.factions.find(f => f.doctrine === 'raider')!.pressure} vs ${raiderPressureBefore}`);
    check('and a band living on rackets is run by its merchants',
        org.doctrine === 'merchant', org.doctrine);

    const active = makeWorld();
    const raiders = band(active);
    raiders.raidsLanded = 1;
    for (let i = 0; i < 40; i++) {
        active.nowSeconds += 3600;
        raiders.lastRaidAtSeconds = active.nowSeconds;   // still working
        tickPirateOrganizations(active, 3600);
    }
    check('one that keeps raiding still is', raiders.doctrine === 'raider', raiders.doctrine);
}

// ─── 5. Rosters reconcile before anything prices them ────────────────────────

console.log('\n[5] phantom hulls are not billed');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 4);
    org.crewLoyalty = 90;

    // Three die during the trade tick, before the pirate block runs.
    for (const id of org.fleetIds.slice(0, 3)) world.movement.fleets.delete(id);

    reconcileRaiderRosters(world);
    check('the roster matches reality immediately', org.fleetIds.length === 1,
        `${org.fleetIds.length}`);
    check('the loss is counted once', org.fleetsLost === 3, `${org.fleetsLost}`);

    const afterFirst = org.crewLoyalty;
    reconcileRaiderRosters(world);
    check('a second pass bills nothing further', org.crewLoyalty === afterFirst);
}

// ─── 6. Merging averages loyalty by real crew sizes ──────────────────────────

console.log('\n[6] merge loyalty weighting');
{
    const world = makeWorld();
    const keeper = band(world, 'sys-lane', 5);
    const absorbed = band(world, 'sys-lane', 5);
    keeper.stage = 4;
    keeper.doctrine = 'smuggler';
    absorbed.doctrine = 'merchant';
    keeper.crewLoyalty = 80;
    absorbed.crewLoyalty = 20;

    tryMerge(world, keeper, absorbed);
    check('an equal merge lands halfway, not two-thirds up',
        Math.abs(keeper.crewLoyalty - 50) < 0.001, `${keeper.crewLoyalty}`);
}

// ─── 7. Amnesty reports a split when one actually happened ───────────────────

console.log('\n[7] amnesty fracture flag');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 6);
    setWings(org, { merchant: 45, smuggler: 25, raider: 30 });
    org.heat = 80;
    for (const wing of org.factions) wing.satisfaction = 20;

    const result = offerAmnesty(world, org, 'faction-a');
    check('the willing wings come in', result.accepted, result.wings.join(','));
    check('losing most of the band counts as a fracture', result.fractured,
        result.wings.join(','));

    const loyal = makeWorld();
    const stubborn = band(loyal, 'sys-lane', 6);
    setWings(stubborn, { raider: 70, traditionalist: 25, merchant: 5 });
    stubborn.heat = 0;
    for (const wing of stubborn.factions) wing.satisfaction = 90;
    const refused = offerAmnesty(loyal, stubborn, 'faction-a');
    check('a band that barely loses anybody is not fractured', !refused.fractured,
        refused.wings.join(','));
}

// ─── 8. Unclaimed bounties are returned ──────────────────────────────────────

console.log('\n[8] bounty escrow');
{
    const world = makeWorld();
    const org = band(world);
    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;

    postBounty(world, 'faction-a', { organizationId: org.id }, 20_000);
    check('the money is escrowed', reserves.CREDITS === before - 20_000);

    tickBounties(world);
    check('a live bounty stands', reserves.CREDITS === before - 20_000);

    world.nowSeconds += 40 * 24 * 3600;
    tickBounties(world);
    check('an unclaimed one is refunded, not burned', reserves.CREDITS === before,
        `${reserves.CREDITS} vs ${before}`);
    check('and taken off the board', ensurePiracyState(world).bounties.size === 0);
}

// ─── 9. A scandal breaks once ────────────────────────────────────────────────

console.log('\n[9] exposure fires once');
{
    const world = makeWorld();
    const org = band(world);
    org.lastRaidAtSeconds = world.nowSeconds;
    world.press.empires.set('faction-a', { factionId: 'faction-a', publicTrust: 60 } as never);
    const sponsorship = openSponsorship(world, org, 'faction-a', {
        targetFactionId: 'faction-b', intensity: 'blockade', fundingPerHour: 100,
    })!;

    sponsorship.evidence = 0.9;
    world.nowSeconds += 3600;
    org.lastRaidAtSeconds = world.nowSeconds;
    tickSponsorship(world, 3600);
    const stories = world.press.activeStories.size;
    check('the story runs', stories > 0);

    // Cool below the line, then cross it again.
    sponsorship.evidence = 0.4;
    world.nowSeconds += 3600;
    tickSponsorship(world, 3600);
    sponsorship.evidence = 0.95;
    world.nowSeconds += 3600;
    org.lastRaidAtSeconds = world.nowSeconds;
    tickSponsorship(world, 3600);

    check('re-crossing does not re-run the scandal',
        world.press.activeStories.size === stories,
        `${world.press.activeStories.size} vs ${stories}`);
    check('the first exposure is recorded', !!sponsorship.exposedAtSeconds);
}

// ─── 10. Legitimization leaves no orphaned infrastructure ────────────────────

console.log('\n[10] statehood winds the network up');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 8);
    org.stage = 5;
    org.networkControl = 80;
    setWings(org, { merchant: 50, corsair: 25, smuggler: 15, traditionalist: 10 });
    for (const factionId of ['faction-a', 'faction-b']) {
        org.relations[factionId] = {
            factionId, standing: 50, agreements: ['recognition'],
            lastContactTick: world.nowSeconds, secret: false,
        };
    }
    establishBase(world, org, 'hideout', 'sys-lane');
    establishBase(world, org, 'derelict_station', 'sys-c');
    world.nowSeconds += BASE_KINDS.derelict_station.buildSeconds;

    check('the band qualifies', canLegitimize(world, org).ok, canLegitimize(world, org).reason);
    const result = legitimize(world, org)!;
    check('a state is founded', !!result);

    const orphaned = [...ensurePiracyState(world).bases.values()]
        .filter(b => b.organizationId === org.id);
    check('no base is left pointing at the dissolved band', orphaned.length === 0,
        `${orphaned.length} orphan(s)`);
    check('the roster is emptied', org.baseIds.length === 0);
}

// ─── 11. A market follows its host base ──────────────────────────────────────

console.log('\n[11] grey markets change hands with their base');
{
    const world = makeWorld();
    const keeper = band(world, 'sys-lane', 5);
    const absorbed = band(world, 'sys-lane', 2);
    keeper.stage = 4;
    keeper.doctrine = 'smuggler';
    absorbed.doctrine = 'merchant';

    const port = establishBase(world, absorbed, 'smuggler_port', 'sys-lane')!;
    world.nowSeconds += BASE_KINDS.smuggler_port.buildSeconds;
    port.storedLoot = 30_000;
    tickShadowEconomy(world, 3600);

    const marketId = `pmkt-${port.id}`;
    check('the market opens under its builder',
        ensurePiracyState(world).blackMarkets.get(marketId)?.organizationId === absorbed.id);

    tryMerge(world, keeper, absorbed);
    tickShadowEconomy(world, 3600);
    check('and follows the base to the new owner',
        ensurePiracyState(world).blackMarkets.get(marketId)?.organizationId === keeper.id,
        ensurePiracyState(world).blackMarkets.get(marketId)?.organizationId);
    check('so the survivor\'s liquidity counts it', keeper.blackMarketLiquidity > 0,
        `${keeper.blackMarketLiquidity}`);
}

// ─── 12. Fallback band names do not collide ──────────────────────────────────

console.log('\n[12] fallback ids stay distinct');
{
    const world = makeWorld();
    const taken = new Set<string>();
    // Exhaust the generated pool so foundOrganization falls back to numbering.
    for (let i = 0; i < 3; i++) {
        const org = foundOrganization(world, 'sys-lane', []);
        org.name = `Unnamed Band ${i + 1}`;
        taken.add(org.name);
    }
    const ids = new Set(
        [...taken].map(name => `porg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
    );
    check('numbered fallbacks produce distinct ids', ids.size === 3, `${ids.size}`);
    check('the digits survive', [...ids].every(id => /\d/.test(id)), [...ids].join(','));
}

// ─── 13. Suppression moves money rather than minting it ──────────────────────

console.log('\n[13] recovered plunder comes out of the band');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 2);
    org.treasury = 40_000;
    const before = org.treasury;

    // The camp's display tally must not be the source of the payout.
    const camps = derivePiracyFleets(
        org.fleetIds.map(id => ({ fleetId: id, systemId: 'sys-lane', strength: 0.5, organizationId: org.id })),
        new Map()
    );
    for (const camp of camps.values()) camp.lootAccumulated = 999_999;
    world.economy.piracyFleets = camps;

    check('the pool is not the treasury', org.treasury === before);
    check('and the treasury is what a kill can take from',
        org.treasury > 0 && [...camps.values()][0].lootAccumulated !== org.treasury);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
