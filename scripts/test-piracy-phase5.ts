// scripts/test-piracy-phase5.ts
// Pirate system Phase 5 verification — the protection economy: the merchant's
// comparison, contracts and breaches, tribute, network control, the second
// truth on the map, tolls, and the Stage IV vote.
// Run: npx tsx scripts/test-piracy-phase5.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Corridor, Fleet, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import { RNG } from '../lib/trade-system/rng';
import {
    breachContract,
    computeNetworkControl,
    contractCovering,
    escortAlternativeCostPerHour,
    expectedLossPerHour,
    imposeTribute,
    protectionIsWorthIt,
    protectionQuote,
    signProtectionContract,
    tickProtection,
    CONTROL_TOLL,
} from '../lib/piracy/protection-service';
import {
    eligibleStage,
    ensurePiracyState,
    foundOrganization,
    winsStageVote,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, BASE_KINDS } from '../lib/piracy/base-service';
import { tickPirateRaids } from '../lib/piracy/raid-service';
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

function makeFleet(id: string, systemId: string, factionId: string, strength = 1.0, orgId?: string): Fleet {
    return {
        id, factionId, name: id, currentSystemId: systemId, destinationSystemId: null,
        organizationId: orgId ?? null,
        activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [],
        doctrine: {
            type: 'Raider', deviationFromPosture: 0, preferredLayers: ['hyperlane'],
            retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1,
        },
        postureId: 'Expansionist', strength, basePower: 100, composition: { interceptor: 2 },
        hyperdriveProfile: {} as never, isDetectable: true,
    };
}

const AGREEMENT: TradeAgreement = {
    id: 'agr-1', aFactionId: 'faction-a', bFactionId: 'faction-b',
    resource: Resource.RARES, volumePerHour: 100, startTick: 0, endTick: 999_999,
    priceFormula: 'market',
};

function makeWorld(nowSeconds = 100_000): GameWorldState {
    const route: TradeRoute = {
        id: 'route-1', agreementId: 'agr-1', path: ['sys-lane', 'sys-b'], theatreId: 'T1',
        exposureScore: 0, piracyRisk: 0.35, blockadeRisk: 0, deepSpaceRisk: 0,
        escortLevel: 0, routePriority: 30,
    };
    const corridor: Corridor = {
        id: 'corr-1', name: 'The Reach', nodeIds: ['sys-lane', 'sys-b'],
        chokepointIds: [], militarizationLevel: 0, denialFieldActive: false,
    };
    return {
        nowSeconds,
        movement: {
            systems: new Map([
                ['sys-lane', makeSystem('sys-lane', ['sys-b'])],
                ['sys-b', makeSystem('sys-b', ['sys-lane', 'sys-c'])],
                ['sys-c', makeSystem('sys-c', ['sys-b'])],
            ]),
            fleets: new Map<string, Fleet>(),
            corridors: new Map([[corridor.id, corridor]]),
            planets: new Map(),
            tradeSegments: new Map(),
            gates: new Map(),
            nowSeconds,
        },
        economy: {
            tradeRoutes: new Map([[route.id, route]]),
            tradeAgreements: new Map([[AGREEMENT.id, AGREEMENT]]),
            factions: new Map([
                ['faction-a', { id: 'faction-a', reserves: { CREDITS: 5_000_000 } }],
            ]),
            policies: new Map(),
            piracyFleets: new Map(),
        },
        corporate: { companies: new Map() },
        espionage: { shadowEconomyNodes: new Map() },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            protectionContracts: new Map(), tributes: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        },
    } as unknown as GameWorldState;
}

/** A corsair network: three bases, three ships, a contact, camped on the lane. */
function network(world: GameWorldState, raiders = 3): PirateOrganization {
    const org = foundOrganization(world, 'sys-lane', []);
    org.treasury = 200_000;
    org.infamy = 45;
    for (let i = 1; i <= raiders; i++) {
        const id = `pirate-${i}`;
        world.movement.fleets.set(id, makeFleet(id, 'sys-lane', PIRATE_FACTION_ID, 1.0, org.id));
        org.fleetIds.push(id);
    }
    org.relations['faction-a'] = {
        factionId: 'faction-a', standing: 30, agreements: [],
        lastContactTick: world.nowSeconds, secret: false,
    };
    establishBase(world, org, 'hideout', 'sys-lane');
    establishBase(world, org, 'smuggler_port', 'sys-b');
    establishBase(world, org, 'hidden_lane', 'sys-lane');
    world.nowSeconds += BASE_KINDS.hidden_lane.buildSeconds;
    org.stage = 3;
    // Network control counts grey-market share alongside protection coverage
    // (Phase 6), so a band that fences nothing controls less of the criminal
    // economy than one that does. A band big enough to toll a corridor is a
    // band that also moves the goods.
    org.blackMarketLiquidity = 2_000;
    return org;
}

const routeOf = (world: GameWorldState) => world.economy.tradeRoutes.get('route-1')!;
const routesOf = (world: GameWorldState) => [...world.economy.tradeRoutes.values()];

// ─── 1. The merchant's comparison ────────────────────────────────────────────

console.log('\n[1] the comparison');
{
    const world = makeWorld();
    const org = network(world);
    const route = routeOf(world);

    const loss = expectedLossPerHour(world, route);
    check('an exposed lane has a real expected loss', loss > 0, `${loss}`);

    const safer = expectedLossPerHour(world, { ...route, escortLevel: 8 });
    check('escorts cut the expected loss', safer < loss, `${safer} vs ${loss}`);

    const quote = protectionQuote(world, org, route);
    check('the band prices under the honest alternative',
        quote < escortAlternativeCostPerHour(world, route),
        `${quote} vs ${Math.round(escortAlternativeCostPerHour(world, route))}`);
    check('and paying beats not paying', protectionIsWorthIt(world, org, route));

    const exclusive = protectionQuote(world, org, route, true);
    check('fighting off rivals too costs more', exclusive > quote, `${exclusive} vs ${quote}`);

    const feared = { ...org, infamy: 95 } as PirateOrganization;
    check('a feared band charges more than an unknown one',
        protectionQuote(world, feared, route) > quote);

    // Nothing to protect against: the racket has nothing to sell.
    const calm = { ...route, piracyRisk: 0, escortLevel: 0 };
    check('a safe lane is not worth protecting', !protectionIsWorthIt(world, org, calm));
}

// ─── 2. Signing ──────────────────────────────────────────────────────────────

console.log('\n[2] contracts');
{
    const world = makeWorld();
    const org = network(world);

    org.stage = 2;
    check('a mere fleet cannot sell protection',
        signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']) === null);

    org.stage = 3;
    const contract = signProtectionContract(world, org, 'faction-a', 'faction', ['route-1'])!;
    check('a corsair network can', !!contract);
    check('the lane is marked as covered', routeOf(world).protectedByOrgId === org.id);
    check('the contract is findable by route', contractCovering(world, 'route-1')?.id === contract.id);
    check('the client is now a contact', (org.relations['faction-a']?.standing ?? 0) > 30);

    const merchants = org.factions.find(f => f.doctrine === 'merchant')!;
    const raiders = org.factions.find(f => f.doctrine === 'raider')!;
    check('the merchant wing is pleased', merchants.satisfaction > 50, `${merchants.satisfaction}`);
    check('the raider wing is not', raiders.satisfaction < 50, `${raiders.satisfaction}`);
}

// ─── 3. Collection ───────────────────────────────────────────────────────────

console.log('\n[3] collection');
{
    const world = makeWorld();
    const org = network(world);
    const contract = signProtectionContract(world, org, 'faction-a', 'faction', ['route-1'])!;
    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;

    const creditsBefore = reserves.CREDITS;
    const treasuryBefore = org.treasury;
    const riskBefore = routeOf(world).piracyRisk;

    tickProtection(world, 3600);

    check('the client pays', reserves.CREDITS < creditsBefore, `${reserves.CREDITS}`);
    check('the band is paid', org.treasury > treasuryBefore);
    // The fee is the floor of what a client hands over: a band that also
    // controls the ground tolls the same cargo on top of protecting it.
    check('at least the agreed fee changes hands',
        (creditsBefore - reserves.CREDITS) >= contract.feePerHour - 1,
        `${creditsBefore - reserves.CREDITS} vs fee ${contract.feePerHour}`);
    check('every credit the client loses reaches the band',
        Math.abs((creditsBefore - reserves.CREDITS) - (org.treasury - treasuryBefore)) < 1,
        `${creditsBefore - reserves.CREDITS} vs ${org.treasury - treasuryBefore}`);
    check('and the lane actually gets safer', routeOf(world).piracyRisk < riskBefore,
        `${routeOf(world).piracyRisk} vs ${riskBefore}`);

    // A client who cannot pay is not a client.
    reserves.CREDITS = 0;
    tickProtection(world, 3600);
    check('a default ends the arrangement', !contractCovering(world, 'route-1'));
    check('and the lane loses its cover', !routeOf(world).protectedByOrgId);
}

// ─── 4. A band does not eat its own clients ──────────────────────────────────

console.log('\n[4] the bargain');
{
    const world = makeWorld();
    const org = network(world);
    org.doctrine = 'raider';

    // Unprotected: the lane gets raided.
    let raidedBefore = 0;
    for (let i = 0; i < 20; i++) {
        world.nowSeconds += 3600;
        const { outcomes } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
        raidedBefore += outcomes.length;
    }
    check('an uncovered lane gets raided', raidedBefore > 0, `${raidedBefore} raids`);

    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);
    let raidedAfter = 0;
    for (let i = 0; i < 20; i++) {
        world.nowSeconds += 3600;
        const { outcomes } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
        raidedAfter += outcomes.length;
    }
    check('a covered one does not', raidedAfter === 0, `${raidedAfter} raids`);
}

// ─── 5. Breach ───────────────────────────────────────────────────────────────

console.log('\n[5] breach');
{
    const world = makeWorld();
    const org = network(world);
    const first = signProtectionContract(world, org, 'faction-a', 'faction', ['route-1'])!;

    // A second client, so the reputational damage has somewhere to land.
    world.economy.tradeRoutes.set('route-2', { ...routeOf(world), id: 'route-2', agreementId: 'agr-1' });
    const second = signProtectionContract(world, org, 'faction-b', 'faction', ['route-2'])!;
    const secondFeeBefore = second.feePerHour;
    const loyaltyBefore = org.crewLoyalty;

    breachContract(world, first.id);

    check('the breached contract is dead', !!first.breachedAtSeconds);
    check('the client is furious', (org.relations['faction-a']?.standing ?? 0) < 0,
        `${org.relations['faction-a']?.standing}`);
    check('the crews notice', org.crewLoyalty < loyaltyBefore);
    check('every other client re-prices', second.feePerHour < secondFeeBefore,
        `${second.feePerHour} vs ${secondFeeBefore}`);
    check('the breached lane is no longer covered', !contractCovering(world, 'route-1'));
}

// ─── 6. Network control ──────────────────────────────────────────────────────

console.log('\n[6] network control');
{
    const world = makeWorld();
    const org = network(world);

    const bare = computeNetworkControl(world, org);
    check('bases and lanes alone are worth something', bare > 0, `${bare.toFixed(1)}`);

    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);
    const withContract = computeNetworkControl(world, org);
    check('running the region\'s commerce is worth more', withContract > bare,
        `${withContract.toFixed(1)} vs ${bare.toFixed(1)}`);

    // Control survives losing the fleet — that is the point of the metric.
    for (const id of [...org.fleetIds]) world.movement.fleets.delete(id);
    org.fleetIds = [];
    const afterDefeat = computeNetworkControl(world, org);
    check('control survives military defeat', afterDefeat > 0, `${afterDefeat.toFixed(1)}`);
    check('though it is diminished', afterDefeat < withContract);
}

// ─── 7. The second truth on the map ──────────────────────────────────────────

console.log('\n[7] influence');
{
    const world = makeWorld();
    const org = network(world);
    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);
    world.movement.systems.get('sys-lane')!.ownerFactionId = 'faction-a';

    tickProtection(world, 3600);

    const lane = world.movement.systems.get('sys-lane')!;
    check('the owner still owns the system', lane.ownerFactionId === 'faction-a');
    check('but the band has a grip on it', (lane.pirateInfluence?.[org.id] ?? 0) > 0,
        JSON.stringify(lane.pirateInfluence));
    check('the corridor records it too',
        (world.movement.corridors.get('corr-1')!.pirateControlByOrg?.[org.id] ?? 0) > 0);

    const untouched = world.movement.systems.get('sys-c')!;
    check('ground they do not work is untouched', !untouched.pirateInfluence?.[org.id]);
}

// ─── 8. Tolls ────────────────────────────────────────────────────────────────

console.log('\n[8] tolls');
{
    // A band that covers a small share of a busy region is a nuisance, not a
    // government: give it four lanes to be irrelevant to.
    const thin = makeWorld();
    const minor = network(thin);
    for (let i = 2; i <= 5; i++) {
        thin.economy.tradeRoutes.set(`route-${i}`, {
            ...routeOf(thin), id: `route-${i}`, path: ['sys-c'],
        });
    }
    signProtectionContract(thin, minor, 'faction-a', 'faction', ['route-1']);
    tickProtection(thin, 3600);
    check('a band that runs a fraction of the commerce cannot toll',
        minor.networkControl < CONTROL_TOLL, `${minor.networkControl.toFixed(1)}`);

    const thinReserves = thin.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const minorBefore = thinReserves.CREDITS;
    tickProtection(thin, 3600);
    const minorTake = minorBefore - thinReserves.CREDITS;
    check('it only collects what it was contracted for',
        Math.abs(minorTake - contractCovering(thin, 'route-1')!.feePerHour) < 1,
        `${minorTake}`);

    // A band that runs all of it is a government in everything but name.
    const world = makeWorld();
    const org = network(world);
    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);
    tickProtection(world, 3600);
    check('a band that runs the whole corridor clears the toll threshold',
        org.networkControl >= CONTROL_TOLL, `${org.networkControl.toFixed(1)}`);

    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;
    const treasuryBefore = org.treasury;

    tickProtection(world, 3600);

    const take = before - reserves.CREDITS;
    check('a dominant band charges for passage', org.treasury > treasuryBefore);
    check('and takes more than the protection fee alone',
        take > contractCovering(world, 'route-1')!.feePerHour, `${take}`);
}

// ─── 9. Tribute and Stage IV ─────────────────────────────────────────────────

console.log('\n[9] tribute');
{
    const world = makeWorld();
    const org = network(world, 8);

    check('a corsair network cannot tax a whole system',
        imposeTribute(world, org, 'faction-a', 'sys-b') === null);

    org.stage = 4;
    const tribute = imposeTribute(world, org, 'faction-a', 'sys-b')!;
    check('a confederacy can', !!tribute);
    check('the demand is priced', tribute.creditsPerHour > 0, `${tribute.creditsPerHour}`);

    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;
    tickProtection(world, 3600);
    check('and it is collected', reserves.CREDITS < before);
}

// ─── 10. The Stage IV vote ───────────────────────────────────────────────────

console.log('\n[10] the vote');
{
    const world = makeWorld();
    const org = network(world, 8);
    org.infamy = 80;
    org.crewLoyalty = 70;
    org.networkControl = 90;
    for (let i = 4; i <= 6; i++) {
        establishBase(world, org, i === 4 ? 'derelict_station' : 'frontier_port', i === 4 ? 'sys-c' : 'sys-b');
    }
    // Enough bases for the confederacy gate, however they were acquired.
    org.baseIds = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

    // A band run by people who want to be left alone stays a network.
    for (const wing of org.factions) wing.pressure = wing.doctrine === 'traditionalist' ? 60 : 10;
    check('traditionalists block the confederacy', !winsStageVote(org, 4));
    check('so the stage is out of reach', eligibleStage(org) === 3, `${eligibleStage(org)}`);

    for (const wing of org.factions) wing.pressure = wing.doctrine === 'merchant' ? 60 : 10;
    check('a merchant plurality votes it through', winsStageVote(org, 4));
    check('and the confederacy is reachable', eligibleStage(org) >= 4, `${eligibleStage(org)}`);

    // Raiders want the loot, not the obligations of statehood.
    for (const wing of org.factions) wing.pressure = wing.doctrine === 'raider' ? 60 : 10;
    check('raiders back the confederacy', winsStageVote(org, 4));
    check('but refuse the state', !winsStageVote(org, 5));
}

// ─── 11. Determinism ─────────────────────────────────────────────────────────

console.log('\n[11] determinism');
{
    const run = () => {
        const world = makeWorld();
        const org = network(world);
        signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);
        for (let i = 0; i < 30; i++) {
            world.nowSeconds += 3600;
            tickProtection(world, 3600);
        }
        return `${org.treasury.toFixed(2)}|${org.networkControl.toFixed(4)}`;
    };
    check('the same racket earns the same money', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
