// scripts/test-piracy-phase3.ts
// Pirate system Phase 3 verification — the base network: placement, capability
// mix, concealment and discovery, base-gated capacity and repair, rollup, and
// hidden lanes as restricted corridors.
// Run: npx tsx scripts/test-piracy-phase3.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, PlanetNode, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import {
    BASE_KINDS,
    baseIsOperational,
    basesOf,
    canEstablishBase,
    establishBase,
    knownBases,
    raidBase,
    removeBase,
    rollupStatus,
    tickPirateBases,
} from '../lib/piracy/base-service';
import {
    eligibleStage,
    ensurePiracyState,
    foundOrganization,
    supportableFleets,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { findPath } from '../lib/movement/movement-service';

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

interface SystemSpec {
    id: string;
    neighbours?: string[];
    owner?: string;
    security?: number;
    lawlessness?: number;
    tags?: string[];
}

function makeSystem(spec: SystemSpec): SystemNode {
    return {
        id: spec.id, name: spec.id, q: 0, r: 0,
        tags: spec.tags ?? [],
        tagReveal: { allTags: [], revealedAt: {} },
        hyperlaneNeighbors: spec.neighbours ?? [],
        tradeSegmentIds: [], corridorIds: [],
        ownerFactionId: spec.owner,
        instability: 0, escalationLevel: 0,
        security: spec.security ?? 50,
        tradeValue: 40,
        lawlessness: spec.lawlessness ?? 0,
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
        postureId: 'Expansionist', strength, basePower: 100,
        composition: { interceptor: 2 },
        hyperdriveProfile: {
            hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
            trade: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
            corridor: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
            gate: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
            deepSpace: { speedMultiplier: 0.5, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 },
        },
        isDetectable: true,
    };
}

function makeWorld(specs: SystemSpec[], nowSeconds = 100_000): GameWorldState {
    const systems = new Map<string, SystemNode>();
    for (const s of specs) systems.set(s.id, makeSystem(s));

    const route: TradeRoute = {
        id: 'route-1', agreementId: 'agr-route-1', path: ['sys-lane', 'sys-b'],
        theatreId: 'T1', exposureScore: 0, piracyRisk: 0, blockadeRisk: 0,
        deepSpaceRisk: 0, escortLevel: 0, routePriority: 20,
    };
    const agreement: TradeAgreement = {
        id: 'agr-route-1', aFactionId: 'faction-a', bFactionId: 'faction-b',
        resource: Resource.RARES, volumePerHour: 10, startTick: 0, endTick: 999,
        priceFormula: 'market',
    };

    return {
        nowSeconds,
        movement: {
            systems,
            fleets: new Map<string, Fleet>(),
            corridors: new Map(),
            planets: new Map<string, PlanetNode>(),
            tradeSegments: new Map(),
            gates: new Map(),
            nowSeconds,
        },
        economy: {
            tradeRoutes: new Map([[route.id, route]]),
            tradeAgreements: new Map([[agreement.id, agreement]]),
            factions: new Map([['faction-a', { id: 'faction-a', reserves: { CREDITS: 0 } }]]),
            policies: new Map(),
        },
        espionage: { shadowEconomyNodes: new Map() },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: { organizations: new Map(), bases: new Map(), opportunityIndex: new Map(), emergenceLog: [] },
    } as unknown as GameWorldState;
}

const LAWLESS_GALAXY: SystemSpec[] = [
    { id: 'sys-lane', neighbours: ['sys-b', 'sys-c'], lawlessness: 80 },
    { id: 'sys-b', neighbours: ['sys-lane', 'sys-d'], owner: 'faction-a', security: 20 },
    { id: 'sys-c', neighbours: ['sys-lane'], lawlessness: 30, tags: ['ruins'] },
    { id: 'sys-d', neighbours: ['sys-b'], owner: 'faction-a', security: 80 },
];

function bandWithTreasury(world: GameWorldState, credits: number) {
    const org = foundOrganization(world, 'sys-lane', []);
    org.treasury = credits;
    return org;
}

// ─── 1. Placement rules ──────────────────────────────────────────────────────

console.log('\n[1] placement');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);

    check('a hideout needs lawless or unowned ground',
        canEstablishBase(world, org, 'hideout', 'sys-lane').ok);
    check('and is refused on orderly owned ground',
        !canEstablishBase(world, org, 'hideout', 'sys-d').ok,
        canEstablishBase(world, org, 'hideout', 'sys-d').reason);

    check('a derelict station needs something to reactivate',
        canEstablishBase(world, org, 'derelict_station', 'sys-c').ok);
    check('and is refused in empty space',
        !canEstablishBase(world, org, 'derelict_station', 'sys-lane').ok);

    check('a frontier port needs a settlement that looks away',
        canEstablishBase(world, org, 'frontier_port', 'sys-b').ok);
    check('an honestly run port refuses one',
        !canEstablishBase(world, org, 'frontier_port', 'sys-d').ok);

    // The same well-run port becomes available once its governor is bought.
    world.government.set('faction-a', { corruption: 80, cohesion: 50, warFatigue: 0 } as never);
    check('corruption opens the honest port',
        canEstablishBase(world, org, 'frontier_port', 'sys-d').ok);

    check('a shipyard needs an existing network',
        !canEstablishBase(world, org, 'secret_shipyard', 'sys-lane').ok,
        canEstablishBase(world, org, 'secret_shipyard', 'sys-lane').reason);

    check('a smuggler port needs commerce within reach',
        canEstablishBase(world, org, 'smuggler_port', 'sys-lane').ok);

    check('a safe house needs contacts a gang does not have',
        !canEstablishBase(world, org, 'safe_house', 'sys-b').ok);

    check('an underground market needs somebody to trade with',
        !canEstablishBase(world, org, 'underground_market', 'sys-lane').ok);
    world.movement.planets.set('p1', { id: 'p1', systemId: 'sys-lane' } as PlanetNode);
    check('and is available once a world is there',
        canEstablishBase(world, org, 'underground_market', 'sys-lane').ok);
}

// ─── 2. Establishing costs and build time ────────────────────────────────────

console.log('\n[2] construction');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 3_000);

    const poor = establishBase(world, org, 'smuggler_port', 'sys-lane');
    check('a band cannot buy what it cannot afford', poor === null);

    const hideout = establishBase(world, org, 'hideout', 'sys-lane')!;
    check('a hideout is affordable', !!hideout);
    check('the cost leaves the treasury', org.treasury === 3_000 - BASE_KINDS.hideout.cost, `${org.treasury}`);
    check('the base joins the network', org.baseIds.includes(hideout.id));
    check('it is inert while under construction', !baseIsOperational(hideout, world));

    world.nowSeconds += BASE_KINDS.hideout.buildSeconds;
    check('and operational once built', baseIsOperational(hideout, world));

    check('a second identical base in the same system is refused',
        !canEstablishBase(world, org, 'hideout', 'sys-lane').ok);
}

// ─── 3. Berths gate how many raiders a band can hold ─────────────────────────

console.log('\n[3] capacity');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    const baseline = supportableFleets(world, org);
    check('a band with no bases still holds a couple of ships', baseline === 2, `${baseline}`);

    const station = establishBase(world, org, 'derelict_station', 'sys-c')!;
    check('an unbuilt base adds no capacity', supportableFleets(world, org) === baseline);

    world.nowSeconds += BASE_KINDS.derelict_station.buildSeconds;
    check('berths raise capacity once built',
        supportableFleets(world, org) === baseline + BASE_KINDS.derelict_station.berths,
        `${supportableFleets(world, org)}`);

    removeBase(world, station.id, 'test');
    check('losing the base takes the capacity back', supportableFleets(world, org) === baseline);
}

// ─── 4. Repair is a base capability, not a map tag ───────────────────────────

console.log('\n[4] repair');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    world.movement.fleets.set('pirate-1', makeFleet('pirate-1', 'sys-c', PIRATE_FACTION_ID, 0.5, org.id));
    org.fleetIds.push('pirate-1');
    org.lastRaidAtSeconds = world.nowSeconds;

    // A corsair_den tag alone no longer heals anyone.
    world.movement.systems.get('sys-c')!.tags.push('corsair_den');
    tickPirateBases(world, 3600);
    check('a lawless system does not repair raiders by itself',
        world.movement.fleets.get('pirate-1')!.strength === 0.5,
        `${world.movement.fleets.get('pirate-1')!.strength}`);

    const station = establishBase(world, org, 'derelict_station', 'sys-c')!;
    world.nowSeconds += BASE_KINDS.derelict_station.buildSeconds;
    tickPirateBases(world, 3600);
    check('a base the band owns does repair them',
        world.movement.fleets.get('pirate-1')!.strength > 0.5,
        `${world.movement.fleets.get('pirate-1')!.strength}`);

    const healed = world.movement.fleets.get('pirate-1')!.strength;
    removeBase(world, station.id, 'test');
    tickPirateBases(world, 3600);
    check('taking the base makes their losses permanent',
        world.movement.fleets.get('pirate-1')!.strength === healed,
        `${world.movement.fleets.get('pirate-1')!.strength}`);
}

// ─── 5. Concealment and discovery ────────────────────────────────────────────

console.log('\n[5] concealment');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    const hideout = establishBase(world, org, 'hideout', 'sys-lane')!;
    world.nowSeconds += BASE_KINDS.hideout.buildSeconds;

    org.lastRaidAtSeconds = world.nowSeconds;   // actively working
    const before = hideout.concealment;
    tickPirateBases(world, 3600);
    check('using the place burns cover', hideout.concealment < before,
        `${hideout.concealment} vs ${before}`);

    const used = hideout.concealment;
    org.lastRaidAtSeconds = world.nowSeconds - 48 * 3600;   // lying low
    tickPirateBases(world, 3600);
    check('lying low rebuilds it', hideout.concealment > used,
        `${hideout.concealment} vs ${used}`);

    // A blown hideout in a system full of hostile warships gets found.
    hideout.concealment = 0;
    world.movement.fleets.set('navy-1', makeFleet('navy-1', 'sys-lane', 'faction-a'));
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
        world.nowSeconds += 3600;
        org.lastRaidAtSeconds = world.nowSeconds;
        tickPirateBases(world, 3600);
        found = hideout.knownToFactionIds.includes('faction-a');
    }
    check('a hostile fleet on top of an exposed base finds it', found);
    check('and the base shows up in what that faction knows',
        knownBases(world, 'faction-a').some(b => b.id === hideout.id));
    check('another faction is still in the dark', knownBases(world, 'faction-b').length === 0);
}

// ─── 6. Raiding a base ───────────────────────────────────────────────────────

console.log('\n[6] raiding a base');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    const port = establishBase(world, org, 'smuggler_port', 'sys-lane')!;
    world.nowSeconds += BASE_KINDS.smuggler_port.buildSeconds;
    port.storedLoot = 9_000;

    const seized = raidBase(world, port.id, 'faction-a');
    check('the attacker seizes the stored loot', seized === 9_000, `${seized}`);
    check('the credits land in their treasury',
        (world.economy.factions.get('faction-a')!.reserves as Record<string, number>).CREDITS === 9_000);
    check('the base survives one raid', ensurePiracyState(world).bases.has(port.id));
    check('but its cover is gone', port.concealment === 0);
    check('and it is damaged', port.integrity < 1, `${port.integrity}`);

    raidBase(world, port.id, 'faction-a');
    raidBase(world, port.id, 'faction-a');
    check('repeated raids destroy it', !ensurePiracyState(world).bases.has(port.id));
    check('and the network shrinks', !org.baseIds.includes(port.id));
}

// ─── 7. Rollup ───────────────────────────────────────────────────────────────

console.log('\n[7] rollup');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    const a = establishBase(world, org, 'hideout', 'sys-lane')!;
    const b = establishBase(world, org, 'derelict_station', 'sys-c')!;
    const c = establishBase(world, org, 'smuggler_port', 'sys-lane')!;
    check('the band has a network', basesOf(world, org).length === 3);

    check('knowing nothing is no basis for a strike',
        !rollupStatus(world, org, 'faction-a').canRollup);

    a.knownToFactionIds.push('faction-a');
    check('one node out of three is not enough',
        !rollupStatus(world, org, 'faction-a').canRollup,
        `${rollupStatus(world, org, 'faction-a').coverage}`);

    b.compromisedByFactionId = 'faction-a';
    const status = rollupStatus(world, org, 'faction-a');
    check('two of three clears the threshold', status.canRollup, `${status.coverage}`);
    check('the strike list names the known nodes', status.knownBaseIds.length === 2);
    check('the third node is still hidden', !status.knownBaseIds.includes(c.id));

    check('a rival faction cannot use that map',
        !rollupStatus(world, org, 'faction-b').canRollup);
}

// ─── 8. Hidden lanes ─────────────────────────────────────────────────────────

console.log('\n[8] hidden lanes');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    const lane = establishBase(world, org, 'hidden_lane', 'sys-lane')!;

    check('the lane connects two systems that are not neighbours',
        !!lane.laneEndpoints && lane.laneEndpoints[0] === 'sys-lane');
    check('it is carried by a restricted corridor', !!lane.corridorId);
    const corridor = world.movement.corridors.get(lane.corridorId!)!;
    check('restricted to its owner', corridor.restrictedToOrgId === org.id);

    const [from, to] = lane.laneEndpoints!;
    const raider = makeFleet('pirate-1', from, PIRATE_FACTION_ID, 0.8, org.id);
    const navy = makeFleet('navy-1', from, 'faction-a');
    world.movement.fleets.set(raider.id, raider);
    world.movement.fleets.set(navy.id, navy);

    const pirateRoute = findPath(raider, to, ['hyperlane', 'corridor'], world.movement);
    const navyRoute = findPath(navy, to, ['hyperlane', 'corridor'], world.movement);

    check('the owner can run the shortcut',
        pirateRoute.canReach && pirateRoute.path.length === 2,
        `${pirateRoute.path.join('>')}`);
    check('everyone else has to take the long way',
        navyRoute.path.length > pirateRoute.path.length,
        `navy ${navyRoute.path.join('>')} vs pirate ${pirateRoute.path.join('>')}`);

    removeBase(world, lane.id, 'test');
    check('losing the lane removes the corridor', !world.movement.corridors.has(lane.corridorId!));
}

// ─── 9. Acquisition and upkeep ───────────────────────────────────────────────

console.log('\n[9] acquisition');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 5_000);
    org.doctrine = 'raider';
    org.lastRaidAtSeconds = world.nowSeconds;

    tickPirateBases(world, 3600);
    check('a band with loot buys somewhere to hide', basesOf(world, org).length === 1);
    check('the raider wing bought a hideout first', basesOf(world, org)[0].kind === 'hideout');

    // Upkeep on a network it cannot pay for costs it the network.
    const rich = makeWorld(LAWLESS_GALAXY);
    const band = bandWithTreasury(rich, 20_000);
    band.doctrine = 'raider';
    const held = establishBase(rich, band, 'derelict_station', 'sys-c')!;
    rich.nowSeconds += BASE_KINDS.derelict_station.buildSeconds;
    band.treasury = -1;
    tickPirateBases(rich, 3600);
    check('a band that cannot pay strips a base for parts',
        !ensurePiracyState(rich).bases.has(held.id));
    check('and gets something back for it', band.treasury > 0, `${band.treasury}`);
}

// ─── 10. pirate_station is an asset, not a condition ─────────────────────────

console.log('\n[10] station tag');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    const port = establishBase(world, org, 'smuggler_port', 'sys-lane')!;
    world.nowSeconds += BASE_KINDS.smuggler_port.buildSeconds;
    const sys = world.movement.systems.get('sys-lane')!;

    tickPirateBases(world, 3600);
    check('a concealed installation is not on the map', !sys.tags.includes('pirate_station'));

    port.concealment = 0;
    tickPirateBases(world, 3600);
    check('a fully exposed one is', sys.tags.includes('pirate_station'));

    removeBase(world, port.id, 'test');
    tickPirateBases(world, 3600);
    check('and the tag goes with the base', !sys.tags.includes('pirate_station'));
}

// ─── 10b. Stage III is now reachable ─────────────────────────────────────────
// The headline unlock of this phase: a base network is what turns a raiding
// outfit into an institution other actors deal with.

console.log('\n[10b] corsair network');
{
    const world = makeWorld(LAWLESS_GALAXY);
    const org = bandWithTreasury(world, 100_000);
    for (let i = 1; i <= 3; i++) {
        world.movement.fleets.set(`pirate-${i}`, makeFleet(`pirate-${i}`, 'sys-lane', PIRATE_FACTION_ID, 0.6, org.id));
        org.fleetIds.push(`pirate-${i}`);
    }
    org.infamy = 40;
    org.relations['faction-a'] = {
        factionId: 'faction-a', standing: 40, agreements: [], lastContactTick: 0, secret: false,
    };

    check('ships, fame and a contact alone still leave a fleet', eligibleStage(org) === 2,
        `${eligibleStage(org)}`);

    establishBase(world, org, 'hideout', 'sys-lane');
    establishBase(world, org, 'derelict_station', 'sys-c');
    establishBase(world, org, 'smuggler_port', 'sys-lane');
    world.nowSeconds += BASE_KINDS.smuggler_port.buildSeconds;

    check('three bases makes it a corsair network', eligibleStage(org) === 3, `${eligibleStage(org)}`);

    removeBase(world, basesOf(world, org)[0].id, 'test');
    check('losing a node takes the network status back', eligibleStage(org) === 2,
        `${eligibleStage(org)}`);
}

// ─── 11. Determinism ─────────────────────────────────────────────────────────

console.log('\n[11] determinism');
{
    const run = () => {
        const world = makeWorld(LAWLESS_GALAXY);
        const org = bandWithTreasury(world, 60_000);
        org.doctrine = 'smuggler';
        world.movement.fleets.set('navy-1', makeFleet('navy-1', 'sys-lane', 'faction-a'));
        for (let i = 0; i < 60; i++) {
            world.nowSeconds += 3600;
            org.lastRaidAtSeconds = world.nowSeconds;
            tickPirateBases(world, 3600);
        }
        return basesOf(world, org)
            .map(b => `${b.kind}@${b.systemId}:${b.concealment.toFixed(3)}:${b.knownToFactionIds.join(',')}`)
            .sort()
            .join('|');
    };
    check('the same band builds and loses the same network', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
