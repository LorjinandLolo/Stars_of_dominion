// scripts/test-piracy-phase4.ts
// Pirate system Phase 4 verification — operations: posture, raid types, raid
// odds, and the marks a raid leaves behind (captured hulls, sabotaged segments,
// terror, hostages).
// Run: npx tsx scripts/test-piracy-phase4.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode, TradeSegment } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import { RNG } from '../lib/trade-system/rng';
import { simulateTradeFlows } from '../lib/trade-system/trade';
import {
    chooseRaidType,
    choosePosture,
    payRansom,
    raidOdds,
    tickHostages,
    tickPirateRaids,
    RAID_PROFILES,
} from '../lib/piracy/raid-service';
import {
    ensurePiracyState,
    foundOrganization,
    recordRaid,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, BASE_KINDS } from '../lib/piracy/base-service';
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

function makeSystem(id: string, neighbours: string[] = [], tags: string[] = []): SystemNode {
    return {
        id, name: id, q: 0, r: 0, tags,
        tagReveal: { allTags: [], revealedAt: {} },
        hyperlaneNeighbors: neighbours, tradeSegmentIds: [], corridorIds: [],
        instability: 0, escalationLevel: 0, security: 20, tradeValue: 60, lawlessness: 70,
    };
}

function makeFleet(id: string, systemId: string, factionId: string, strength = 0.8, orgId?: string): Fleet {
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

const ROUTE: TradeRoute = {
    id: 'route-1', agreementId: 'agr-1', path: ['sys-lane', 'sys-b'], theatreId: 'T1',
    exposureScore: 0, piracyRisk: 0.2, blockadeRisk: 0, deepSpaceRisk: 0,
    escortLevel: 0, routePriority: 30,
};

const AGREEMENT: TradeAgreement = {
    id: 'agr-1', aFactionId: 'faction-a', bFactionId: 'faction-b',
    resource: Resource.RARES, volumePerHour: 100, startTick: 0, endTick: 999,
    priceFormula: 'market',
};

function makeWorld(nowSeconds = 100_000): GameWorldState {
    const route: TradeRoute = { ...ROUTE };
    const segment: TradeSegment = {
        id: 'seg-1', fromSystemId: 'sys-lane', toSystemId: 'sys-b',
        throughput: 1, status: 'active', isReroute: false, integrity: 1, isFlashing: false,
    };
    return {
        nowSeconds,
        movement: {
            systems: new Map([
                ['sys-lane', makeSystem('sys-lane', ['sys-b'])],
                ['sys-b', makeSystem('sys-b', ['sys-lane'])],
                ['sys-c', makeSystem('sys-c', ['sys-b'])],
            ]),
            fleets: new Map<string, Fleet>(),
            corridors: new Map(),
            planets: new Map(),
            tradeSegments: new Map([[segment.id, segment]]),
            gates: new Map(),
            nowSeconds,
        },
        economy: {
            tradeRoutes: new Map([[route.id, route]]),
            tradeAgreements: new Map([[AGREEMENT.id, AGREEMENT]]),
            factions: new Map([
                ['faction-a', { id: 'faction-a', reserves: { CREDITS: 200_000 } }],
            ]),
            policies: new Map(),
            piracyFleets: new Map(),
        },
        espionage: { shadowEconomyNodes: new Map() },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        },
    } as unknown as GameWorldState;
}

/** A band camped on the lane, strong enough that raids land. */
function campedBand(world: GameWorldState, raiders = 3): PirateOrganization {
    const org = foundOrganization(world, 'sys-lane', []);
    org.treasury = 50_000;
    for (let i = 1; i <= raiders; i++) {
        const id = `pirate-${i}`;
        world.movement.fleets.set(id, makeFleet(id, 'sys-lane', PIRATE_FACTION_ID, 1.0, org.id));
        org.fleetIds.push(id);
    }
    return org;
}

function routesOf(world: GameWorldState): TradeRoute[] {
    return [...world.economy.tradeRoutes.values()];
}

// ─── 1. Posture ──────────────────────────────────────────────────────────────

console.log('\n[1] posture');
{
    const world = makeWorld();
    const org = campedBand(world);

    org.doctrine = 'raider';
    org.factions.find(f => f.doctrine === 'raider')!.pressure = 60;
    org.heat = 10;
    check('a confident raider wing strangles the lane',
        choosePosture(org, ROUTE) === 'strangle', choosePosture(org, ROUTE));

    org.heat = 80;
    check('a hunted band eases off to a skim',
        choosePosture(org, ROUTE) === 'skim', choosePosture(org, ROUTE));

    org.heat = 10;
    org.doctrine = 'smuggler';
    check('smugglers skim by nature', choosePosture(org, ROUTE) === 'skim');

    org.doctrine = 'traditionalist';
    check('a heavily escorted lane is not worth provoking',
        choosePosture(org, { ...ROUTE, escortLevel: 6 }) === 'skim');
    check('an unescorted one is', choosePosture(org, ROUTE) === 'prey');
}

// ─── 2. Raid type selection ──────────────────────────────────────────────────

console.log('\n[2] raid type');
{
    const world = makeWorld();
    const org = campedBand(world);
    org.stage = 1;
    org.doctrine = 'raider';

    const gangTypes = new Set(
        Array.from({ length: 30 }, (_, i) => chooseRaidType(org, new RNG(i), true))
    );
    check('a gang can only rob', [...gangTypes].every(t => RAID_PROFILES[t].minStage <= 1),
        [...gangTypes].join(','));

    org.stage = 3;
    org.heat = 5;
    const networkTypes = new Set(
        Array.from({ length: 30 }, (_, i) => chooseRaidType(org, new RNG(i), true))
    );
    check('a corsair network reaches for worse things', networkTypes.size > 1,
        [...networkTypes].join(','));

    org.heat = 90;
    const panicTypes = new Set(
        Array.from({ length: 30 }, (_, i) => chooseRaidType(org, new RNG(i), true))
    );
    check('a band under maximum heat stops making headlines',
        [...panicTypes].every(t => RAID_PROFILES[t].heat <= 0.5), [...panicTypes].join(','));
}

// ─── 3. Raid odds ────────────────────────────────────────────────────────────

console.log('\n[3] raid odds');
{
    const world = makeWorld();
    const org = campedBand(world);
    const camp = {
        id: 'piracy-sys-lane', systemId: 'sys-lane', interdictionStrength: 0.8,
        actorType: 'pirate' as const, sponsorFactionId: null, targetedResources: [],
        lootAccumulated: 0, isDetected: false, organizationId: org.id,
        raiderFleetIds: ['pirate-1'],
    };

    const bare = raidOdds(world, org, camp, ROUTE);
    check('an unescorted lane is easy pickings', bare > 0.4, `${bare.toFixed(2)}`);

    const escorted = raidOdds(world, org, camp, { ...ROUTE, escortLevel: 8 });
    check('escorts cut the odds', escorted < bare, `${escorted.toFixed(2)} vs ${bare.toFixed(2)}`);

    world.movement.fleets.set('navy-1', makeFleet('navy-1', 'sys-lane', 'faction-a', 1.0));
    const garrisoned = raidOdds(world, org, camp, ROUTE);
    check('a warship parked on the camp cuts them further',
        garrisoned < bare, `${garrisoned.toFixed(2)} vs ${bare.toFixed(2)}`);

    world.movement.fleets.delete('navy-1');
    world.movement.systems.get('sys-lane')!.tags.push('throat');
    const ambush = raidOdds(world, org, camp, ROUTE);
    check('a chokepoint lets them ambush instead of chase',
        ambush > bare, `${ambush.toFixed(2)} vs ${bare.toFixed(2)}`);
}

// ─── 4. Posture drives the siphon ────────────────────────────────────────────

console.log('\n[4] siphon');
{
    const runWith = (doctrine: 'raider' | 'smuggler', heat: number) => {
        const world = makeWorld();
        const org = campedBand(world);
        org.doctrine = doctrine;
        org.factions.find(f => f.doctrine === 'raider')!.pressure = 60;
        org.heat = heat;
        org.stage = 2;
        let total = 0;
        for (let i = 0; i < 25; i++) {
            world.nowSeconds += 3600;
            const { lossByRoute } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
            total += lossByRoute.get('route-1') ?? 0;
        }
        return total;
    };

    const strangled = runWith('raider', 5);
    const skimmed = runWith('smuggler', 5);
    check('strangling takes far more than skimming', strangled > skimmed * 2,
        `strangle ${Math.round(strangled)} vs skim ${Math.round(skimmed)}`);
    check('a skim still takes something', skimmed > 0, `${skimmed}`);
}

// ─── 5. Capture puts a hull in their hands ───────────────────────────────────

console.log('\n[5] capture');
{
    const world = makeWorld();
    const org = campedBand(world);
    org.doctrine = 'raider';
    org.stage = 2;
    org.heat = 0;
    // Give them the berths so a prize does not get refused for lack of crew.
    establishBase(world, org, 'derelict_station', 'sys-lane');
    world.nowSeconds += BASE_KINDS.derelict_station.buildSeconds;

    const before = org.fleetIds.length;
    let captured = false;
    for (let i = 0; i < 40 && !captured; i++) {
        world.nowSeconds += 3600;
        const { outcomes } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
        captured = outcomes.some(o => o.type === 'capture');
    }
    check('a raider wing eventually takes a hull', captured);
    check('the prize joins their fleet', org.fleetIds.length > before,
        `${before} -> ${org.fleetIds.length}`);
    check('and flies under the pirate flag',
        org.fleetIds.every(id => world.movement.fleets.get(id)?.factionId === PIRATE_FACTION_ID));
}

// ─── 6. Sabotage degrades the lane itself ────────────────────────────────────

console.log('\n[6] sabotage');
{
    const world = makeWorld();
    const org = campedBand(world);
    org.doctrine = 'smuggler';   // robbery + sabotage only
    org.stage = 2;
    const segment = world.movement.tradeSegments.get('seg-1')!;

    let sabotaged = false;
    for (let i = 0; i < 60 && !sabotaged; i++) {
        world.nowSeconds += 3600;
        const { outcomes } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
        sabotaged = outcomes.some(o => o.type === 'sabotage');
    }
    check('smugglers sabotage rather than burn', sabotaged);
    check('the segment is damaged', segment.integrity < 1, `${segment.integrity}`);
}

// ─── 7. Destruction buys fear, not loot ──────────────────────────────────────

console.log('\n[7] terror');
{
    const world = makeWorld();
    const org = campedBand(world);
    org.doctrine = 'raider';
    org.stage = 2;
    org.heat = 0;
    const route = world.economy.tradeRoutes.get('route-1')!;

    let destroyed = false;
    let lootFromDestruction = 0;
    for (let i = 0; i < 60 && !destroyed; i++) {
        world.nowSeconds += 3600;
        org.heat = 0;   // hold the wing's nerve so it keeps choosing violence
        const { outcomes } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
        const hit = outcomes.find(o => o.type === 'destruction');
        if (hit) {
            destroyed = true;
            lootFromDestruction = hit.valueLost;
        }
    }
    check('the raider wing eventually burns a convoy', destroyed);
    check('destruction takes nothing home', lootFromDestruction === 0, `${lootFromDestruction}`);
    check('but leaves the corridor afraid', (route.terror ?? 0) > 0, `${route.terror}`);

    // Terror suppresses the traffic that would otherwise use the lane.
    const flows = simulateTradeFlows(
        [route], world.economy.tradeAgreements, new Map(), new Map(), new Map(), new Map(),
        new RNG(1), new Set(['route-1'])
    );
    check('and the lane carries less as a result',
        (flows.deliveredRatio.get('route-1') ?? 1) < 1,
        `${flows.deliveredRatio.get('route-1')}`);

    const beforeDecay = route.terror ?? 0;
    for (let i = 0; i < 20; i++) {
        world.nowSeconds += 3600;
        world.movement.fleets.clear();          // nobody left to raid
        tickPirateRaids(world, routesOf(world), new RNG(99), 3600);
    }
    check('fear fades once the raiding stops', (route.terror ?? 0) < beforeDecay,
        `${route.terror} vs ${beforeDecay}`);
}

// ─── 8. Hostages ─────────────────────────────────────────────────────────────

console.log('\n[8] hostages');
{
    const world = makeWorld();
    const org = campedBand(world);
    org.doctrine = 'corsair';
    org.stage = 3;
    org.heat = 0;

    // A hostage can only be taken by a band with the reach for it.
    let taken = false;
    for (let i = 0; i < 80 && !taken; i++) {
        world.nowSeconds += 3600;
        org.heat = 0;
        tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
        taken = ensurePiracyState(world).hostages.size > 0;
    }
    check('a corsair network takes hostages', taken);

    const deal = [...ensurePiracyState(world).hostages.values()][0];
    check('the demand names a victim and a price',
        deal.victimFactionId === 'faction-a' && deal.demandCredits > 0, `${deal?.demandCredits}`);

    const treasuryBefore = org.treasury;
    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const creditsBefore = reserves.CREDITS;

    check('paying the ransom works', payRansom(world, deal.id));
    check('the credits change hands', reserves.CREDITS === creditsBefore - deal.demandCredits);
    check('the band is paid', org.treasury === treasuryBefore + deal.demandCredits);
    check('the deal is closed', deal.status === 'ransomed');
    check('and a band that keeps its word is worth talking to again',
        (org.relations['faction-a']?.standing ?? 0) > 0);
    check('paying twice is refused', !payRansom(world, deal.id));
}

// ─── 9. Refusing a ransom ────────────────────────────────────────────────────

console.log('\n[9] refusal');
{
    const world = makeWorld();
    const org = campedBand(world);
    const piracy = ensurePiracyState(world);
    piracy.hostages.set('phost-1', {
        id: 'phost-1', organizationId: org.id, victimFactionId: 'faction-a',
        routeId: 'route-1', demandCredits: 5_000,
        takenAtSeconds: world.nowSeconds, expiresAtSeconds: world.nowSeconds + 3600,
        status: 'held',
    });
    const infamyBefore = org.infamy;

    tickHostages(world);
    check('the deal stands while the window is open',
        piracy.hostages.get('phost-1')!.status === 'held');

    world.nowSeconds += 7200;
    tickHostages(world);
    check('refusing kills the hostage', piracy.hostages.get('phost-1')!.status === 'killed');
    check('which makes the band notorious', org.infamy > infamyBefore);
    check('and the victim a blood enemy', org.relations['faction-a']?.standing === -100);
}

// ─── 10. Raid type changes what a raid costs ─────────────────────────────────

console.log('\n[10] raid weighting');
{
    const world = makeWorld();
    const quiet = foundOrganization(world, 'sys-lane', []);
    const loud = foundOrganization(world, 'sys-b', []);

    recordRaid(world, quiet.id, { valueLost: 4_000, victimFactionId: 'faction-a', raidType: 'robbery' });
    recordRaid(world, loud.id, { valueLost: 4_000, victimFactionId: 'faction-a', raidType: 'destruction' });

    check('the same haul makes a destroyer far more infamous',
        loud.infamy > quiet.infamy * 2, `${loud.infamy.toFixed(2)} vs ${quiet.infamy.toFixed(2)}`);
    check('and far more hunted', loud.heat > quiet.heat * 2,
        `${loud.heat.toFixed(2)} vs ${quiet.heat.toFixed(2)}`);
    check('the victim wants the destroyer specifically',
        (loud.heatByFaction['faction-a'] ?? 0) > (quiet.heatByFaction['faction-a'] ?? 0));
}

// ─── 11. No double taxation ──────────────────────────────────────────────────

console.log('\n[11] single settlement');
{
    // A route a modelled raid already hit must not also pay the abstract
    // piracyRisk roll, which stands in for raiding that is NOT modelled.
    const route: TradeRoute = { ...ROUTE, piracyRisk: 0.95, escortLevel: 0 };
    const agreements = new Map([[AGREEMENT.id, AGREEMENT]]);

    const unraided = simulateTradeFlows(
        [{ ...route }], agreements, new Map(), new Map(), new Map(), new Map(),
        new RNG(3), new Set()
    );
    const raided = simulateTradeFlows(
        [{ ...route }], agreements, new Map(), new Map(), new Map(), new Map(),
        new RNG(3), new Set(['route-1'])
    );

    check('an unraided route pays the abstract risk',
        (unraided.deliveredRatio.get('route-1') ?? 1) < 1,
        `${unraided.deliveredRatio.get('route-1')}`);
    check('a raided route does not pay it twice',
        (raided.deliveredRatio.get('route-1') ?? 0) === 1,
        `${raided.deliveredRatio.get('route-1')}`);
}

// ─── 12. Determinism ─────────────────────────────────────────────────────────

console.log('\n[12] determinism');
{
    const run = () => {
        const world = makeWorld();
        const org = campedBand(world);
        org.doctrine = 'raider';
        org.stage = 3;
        const log: string[] = [];
        for (let i = 0; i < 30; i++) {
            world.nowSeconds += 3600;
            const { outcomes } = tickPirateRaids(world, routesOf(world), new RNG(i + 1), 3600);
            for (const o of outcomes) log.push(`${o.type}:${o.posture}:${o.volumeLost}:${o.valueLost}`);
        }
        return log.join('|');
    };
    check('the same band raids the same way twice', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
