// scripts/test-piracy-phase8.ts
// Pirate system Phase 8 verification — succession, fracture into civil war,
// mergers, legitimization into a real state, and what an empire does with the
// pirates it catches.
// Run: npx tsx scripts/test-piracy-phase8.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import {
    canLegitimize,
    fractureOrganization,
    legitimize,
    openSuccession,
    removeLeader,
    shouldFracture,
    tickPirateSuccession,
    tryMerge,
} from '../lib/piracy/succession-service';
import {
    captureCrew,
    claimBounty,
    disposeCapture,
    offerAmnesty,
    openBounties,
    postBounty,
    tickInformants,
} from '../lib/piracy/counter-piracy-service';
import {
    activeOrganizations,
    ensurePiracyState,
    foundOrganization,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, BASE_KINDS } from '../lib/piracy/base-service';
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

function makeWorld(nowSeconds = 400_000): GameWorldState {
    return {
        nowSeconds,
        movement: {
            systems: new Map([
                ['sys-lane', makeSystem('sys-lane', ['sys-b'])],
                ['sys-b', makeSystem('sys-b', ['sys-lane', 'sys-c'])],
                ['sys-c', makeSystem('sys-c', ['sys-b'])],
            ]),
            fleets: new Map<string, Fleet>(),
            corridors: new Map(),
            planets: new Map([['p1', { id: 'p1', systemId: 'sys-lane' } as never]]),
            tradeSegments: new Map(),
            gates: new Map(),
            nowSeconds,
        },
        economy: {
            tradeRoutes: new Map([[ROUTE.id, { ...ROUTE }]]),
            tradeAgreements: new Map([[AGREEMENT.id, AGREEMENT]]),
            markets: new Map(),
            factions: new Map([
                ['faction-a', { id: 'faction-a', name: 'Aurelia', reserves: { CREDITS: 2_000_000 } }],
                ['faction-b', { id: 'faction-b', name: 'Bellum', reserves: { CREDITS: 2_000_000 } }],
            ]),
            policies: new Map(),
            piracyFleets: new Map(),
        },
        corporate: { companies: new Map() },
        espionage: {
            shadowEconomyNodes: new Map(), attributionRecords: [], factionIntel: new Map(),
            reports: new Map(), agents: new Map(), intelNetworks: new Map(),
            operations: new Map(), boardOpportunities: new Map(), regionEscalation: new Map(),
        },
        press: {
            empires: new Map(), activeStories: new Map(), publishedStories: [], tick: 0,
        },
        leadership: { leaders: new Map(), recruitmentPool: [], nowSeconds },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            protectionContracts: new Map(), tributes: new Map(),
            blackMarkets: new Map(), smugglingRuns: new Map(), sponsorships: new Map(),
            successions: new Map(), captures: new Map(), bounties: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        },
    } as unknown as GameWorldState;
}

function band(world: GameWorldState, systemId = 'sys-lane', fleets = 4): PirateOrganization {
    const org = foundOrganization(world, systemId, []);
    org.treasury = 100_000;
    org.stage = 3;
    org.infamy = 50;
    org.crewLoyalty = 70;
    for (let i = 1; i <= fleets; i++) {
        const id = `pirate-${org.id}-${i}`;
        world.movement.fleets.set(id, makeFleet(id, systemId, org.id));
        org.fleetIds.push(id);
    }
    establishBase(world, org, 'hideout', systemId);
    world.nowSeconds += BASE_KINDS.hideout.buildSeconds;
    return org;
}

function setWings(org: PirateOrganization, shares: Partial<Record<PirateDoctrine, number>>) {
    for (const wing of org.factions) wing.pressure = shares[wing.doctrine] ?? 0;
}

// ─── 1. Uncontested succession ───────────────────────────────────────────────

console.log('\n[1] succession');
{
    const world = makeWorld();
    const org = band(world);
    setWings(org, { merchant: 60, raider: 20, corsair: 20 });
    const loyaltyBefore = org.crewLoyalty;

    removeLeader(world, org, 'killed');

    check('a clear plurality takes over at once', !!org.leader);
    check('under the wing that had the votes', org.leader?.doctrine === 'merchant');
    check('at a modest cost to the crews', org.crewLoyalty < loyaltyBefore
        && org.crewLoyalty > loyaltyBefore - 10, `${org.crewLoyalty}`);
    check('there is no open contest', !ensurePiracyState(world).successions.has(org.id));
}

// ─── 2. Contested succession ─────────────────────────────────────────────────

console.log('\n[2] contest');
{
    const world = makeWorld();
    const org = band(world);
    setWings(org, { raider: 35, merchant: 35, smuggler: 30 });
    const loyaltyBefore = org.crewLoyalty;

    removeLeader(world, org, 'killed');

    const contest = ensurePiracyState(world).successions.get(org.id)!;
    check('with no plurality the wings fight it out', !!contest);
    check('the band has nobody in command', org.leader === null);
    check('and the crews pay heavily for it', org.crewLoyalty <= loyaltyBefore - 20,
        `${org.crewLoyalty}`);
    check('two contenders are named', contest.contenders.length === 2);

    world.nowSeconds = contest.resolvesAtSeconds + 1;
    tickPirateSuccession(world, 3600);
    check('the contest eventually settles', !!org.leader);
    check('and the winner sets the band\'s direction',
        contest.contenders.includes(org.doctrine), org.doctrine);
}

// ─── 3. Losing a captain ─────────────────────────────────────────────────────

console.log('\n[3] capture of a leader');
{
    const world = makeWorld();
    const org = band(world);
    setWings(org, { raider: 40, merchant: 35, smuggler: 25 });
    const leaderName = org.leader!.name;

    const capture = captureCrew(world, org, 'faction-a', 0.5, { takeLeader: true });

    check('the captain is taken', capture.leaderName === leaderName);
    check('the chair is empty', org.leader === null || !!ensurePiracyState(world).successions.get(org.id));
    check('and the crews are shaken', org.crewLoyalty < 70, `${org.crewLoyalty}`);
}

// ─── 4. Fracture ─────────────────────────────────────────────────────────────

console.log('\n[4] fracture');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 6);
    establishBase(world, org, 'derelict_station', 'sys-b');
    setWings(org, { raider: 45, merchant: 40, smuggler: 15 });
    org.crewLoyalty = 20;
    org.factions.find(f => f.doctrine === 'raider')!.satisfaction = 15;
    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);

    check('the seam is open', shouldFracture(world, org));

    const parentInfamy = org.infamy;
    const successors = fractureOrganization(world, org);

    check('the band splits', successors.length >= 2, `${successors.length}`);
    check('the parent is gone', !!org.dissolvedAtSeconds);
    check('the ships are divided, not duplicated',
        successors.reduce((sum, s) => sum + s.fleetIds.length, 0) <= 6,
        `${successors.map(s => s.fleetIds.length).join('+')}`);
    check('every raider has a new owner',
        [...world.movement.fleets.values()]
            .filter(f => f.factionId === PIRATE_FACTION_ID)
            .every(f => successors.some(s => s.id === f.organizationId)));
    check('reputation is destroyed in aggregate',
        successors.reduce((sum, s) => sum + s.infamy, 0) <= parentInfamy + 1e-6,
        `${successors.map(s => s.infamy.toFixed(1)).join('+')} vs ${parentInfamy}`);
    check('clients do not follow a broken band',
        successors.every(s => s.networkControl < org.networkControl + 1e-6));
    check('the contract is void',
        ensurePiracyState(world).protectionContracts.size === 0);
    check('and the covered lane loses its cover',
        !world.economy.tradeRoutes.get('route-1')!.protectedByOrgId);
    check('each successor is run by the wing that made it',
        successors.every(s => s.doctrine === s.factions.reduce((t, f) => f.pressure > t.pressure ? f : t, s.factions[0]).doctrine));
}

// ─── 5. Fracture needs a real seam ───────────────────────────────────────────

console.log('\n[5] cohesion holds');
{
    const world = makeWorld();
    const org = band(world);
    setWings(org, { merchant: 80, raider: 10, smuggler: 10 });
    org.crewLoyalty = 10;
    check('one dominant wing does not split, however unhappy', !shouldFracture(world, org));

    setWings(org, { merchant: 40, raider: 40, smuggler: 20 });
    org.crewLoyalty = 80;
    for (const wing of org.factions) wing.satisfaction = 70;
    check('two big happy wings do not split either', !shouldFracture(world, org));
}

// ─── 6. Mergers ──────────────────────────────────────────────────────────────

console.log('\n[6] mergers');
{
    const world = makeWorld();
    const big = band(world, 'sys-lane', 5);
    const small = band(world, 'sys-lane', 2);
    big.doctrine = 'smuggler';
    small.doctrine = 'merchant';

    check('gangs do not merge', tryMerge(world, big, small) === null);

    big.stage = 4;
    const merged = tryMerge(world, big, small);
    check('a confederacy absorbs a compatible neighbour', merged?.id === big.id);
    check('the smaller band is gone', !!small.dissolvedAtSeconds);
    check('its ships fly under the survivor', big.fleetIds.length === 7, `${big.fleetIds.length}`);
    check('and every one of them knows it',
        big.fleetIds.every(id => world.movement.fleets.get(id)?.organizationId === big.id));

    // Incompatible doctrines do not share a command structure.
    const world2 = makeWorld();
    const raiders = band(world2, 'sys-lane', 5);
    const traditionalists = band(world2, 'sys-lane', 2);
    raiders.stage = 4;
    raiders.doctrine = 'raider';
    traditionalists.doctrine = 'traditionalist';
    check('people who want to be left alone are not absorbed',
        tryMerge(world2, raiders, traditionalists) === null);
}

// ─── 7. Legitimization gates ─────────────────────────────────────────────────

console.log('\n[7] the road to statehood');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 8);
    org.stage = 4;
    org.networkControl = 80;
    setWings(org, { merchant: 40, corsair: 30, traditionalist: 30 });

    check('a confederacy cannot simply declare itself', !canLegitimize(world, org).ok);

    org.stage = 5;
    check('nor can an unrecognized state', !canLegitimize(world, org).ok,
        canLegitimize(world, org).reason);

    for (const factionId of ['faction-a', 'faction-b']) {
        org.relations[factionId] = {
            factionId, standing: 50, agreements: ['recognition'],
            lastContactTick: world.nowSeconds, secret: false,
        };
    }
    check('two recognitions and the crews\' consent is enough', canLegitimize(world, org).ok);

    setWings(org, { traditionalist: 70, merchant: 20, corsair: 10 });
    check('a band run by traditionalists refuses the crown', !canLegitimize(world, org).ok);
}

// ─── 8. Legitimization ───────────────────────────────────────────────────────

console.log('\n[8] statehood');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 8);
    org.stage = 5;
    org.networkControl = 80;
    org.treasury = 250_000;
    org.leader!.ruthlessness = 80;
    setWings(org, { merchant: 40, corsair: 25, smuggler: 15, traditionalist: 20 });
    for (const factionId of ['faction-a', 'faction-b']) {
        org.relations[factionId] = {
            factionId, standing: 50, agreements: ['recognition'],
            lastContactTick: world.nowSeconds, secret: false,
        };
    }
    world.movement.systems.get('sys-lane')!.pirateInfluence = { [org.id]: 80 };
    world.movement.systems.get('sys-lane')!.ownerFactionId = 'faction-a';
    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1']);

    const result = legitimize(world, org)!;

    check('a state is founded', !!result && world.economy.factions.has(result.factionId));
    const faction = world.economy.factions.get(result.factionId)!;
    check('it inherits the treasury',
        (faction.reserves as Record<string, number>).CREDITS === 250_000);
    check('everyone remembers what it was', (faction.infamy ?? 0) > 0, `${faction.infamy}`);
    check('ground it already ran becomes territory',
        world.movement.systems.get('sys-lane')!.ownerFactionId === result.factionId);
    check('the fleets fly a real flag',
        [...world.movement.fleets.values()].some(f => f.factionId === result.factionId));
    check('the captain becomes an officer of the state they invented',
        world.leadership.leaders.size > 0);
    check('protection fees stop being protection fees',
        ensurePiracyState(world).protectionContracts.size === 0);
    check('the band itself is finished', !!org.dissolvedAtSeconds);
    check('and it is on the record as having gone straight',
        org.legitimizedAsFactionId === result.factionId);

    check('the wing that never wanted a patron walks out', !!result.splinter);
    check('and considers the new state a traitor',
        (result.splinter!.relations[result.factionId]?.standing ?? 0) < 0);
}

// ─── 9. Bounties ─────────────────────────────────────────────────────────────

console.log('\n[9] bounties');
{
    const world = makeWorld();
    const org = band(world);
    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;
    const heatBefore = org.heat;

    check('a token bounty is not worth posting',
        postBounty(world, 'faction-a', { organizationId: org.id }, 10) === null);

    const bounty = postBounty(world, 'faction-a', { organizationId: org.id }, 20_000)!;
    check('a serious one is posted', !!bounty);
    check('the money is escrowed', reserves.CREDITS === before - 20_000);
    check('a price on your head is attention', org.heat > heatBefore, `${org.heat}`);
    check('and the poster specifically wants you',
        (org.heatByFaction['faction-a'] ?? 0) > 0);
    check('it is claimable', openBounties(world, org.id).length === 1);

    // Pirate-on-pirate claiming is legal and consolidates the region.
    const rival = band(world, 'sys-c', 2);
    const bReserves = world.economy.factions.get('faction-b')!.reserves as Record<string, number>;
    const bBefore = bReserves.CREDITS;
    const paid = claimBounty(world, bounty.id, 'faction-b');
    check('somebody collects', paid === 20_000);
    check('the claimant is paid', bReserves.CREDITS === bBefore + 20_000);
    check('and the bounty is closed', openBounties(world, org.id).length === 0);
    void rival;
}

// ─── 10. Dispositions ────────────────────────────────────────────────────────

console.log('\n[10] captured crews');
{
    const world = makeWorld();
    const org = band(world);
    world.movement.systems.get('sys-lane')!.ownerFactionId = 'faction-a';
    world.movement.systems.get('sys-lane')!.lawlessness = 80;

    const hanged = captureCrew(world, org, 'faction-a', 1);
    disposeCapture(world, hanged.id, 'execute');
    check('an execution buys deterrence',
        (world.movement.systems.get('sys-lane')!.lawlessness ?? 0) < 80,
        `${world.movement.systems.get('sys-lane')!.lawlessness}`);
    check('and a blood feud', (org.relations['faction-a']?.standing ?? 0) < 0,
        `${org.relations['faction-a']?.standing}`);

    const recruited = captureCrew(world, org, 'faction-a', 1, { takeLeader: false });
    const reserves = world.economy.factions.get('faction-a')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;
    disposeCapture(world, recruited.id, 'recruit');
    check('recruits are worth something', reserves.CREDITS > before);

    // A captain who is turned rather than hanged can end up an admiral.
    const world2 = makeWorld();
    const org2 = band(world2);
    const captain = captureCrew(world2, org2, 'faction-a', 1, { takeLeader: true });
    const arc = disposeCapture(world2, captain.id, 'recruit');
    check('a turned captain joins the leadership pool', !!arc.leaderId);
    check('carrying their history with them',
        (world2.leadership.leaders.get(arc.leaderId!) as never as { traits: string[] })
            .traits.includes('former_pirate'));
}

// ─── 11. Informants ──────────────────────────────────────────────────────────

console.log('\n[11] informants');
{
    const world = makeWorld();
    const org = band(world);
    establishBase(world, org, 'derelict_station', 'sys-b');
    establishBase(world, org, 'smuggler_port', 'sys-lane');

    const capture = captureCrew(world, org, 'faction-a', 1);
    disposeCapture(world, capture.id, 'informant');

    const known = () => [...ensurePiracyState(world).bases.values()]
        .filter(b => b.knownToFactionIds.includes('faction-a')).length;
    check('an informant gives up where they slept', known() >= 1, `${known()}`);

    const first = known();
    for (let i = 0; i < 5; i++) {
        world.nowSeconds += 3600;
        tickInformants(world, 3600);
    }
    check('and keeps talking', known() > first, `${known()} vs ${first}`);

    // Being found out collapses the feed.
    org.heat = 100;
    let burned = false;
    for (let i = 0; i < 400 && !burned; i++) {
        world.nowSeconds += 3600;
        tickInformants(world, 3600);
        burned = !ensurePiracyState(world).captures.has(capture.id);
    }
    check('a hunted band eventually finds its traitor', burned);
}

// ─── 12. Amnesty ─────────────────────────────────────────────────────────────

console.log('\n[12] amnesty');
{
    const world = makeWorld();
    const org = band(world, 'sys-lane', 6);
    setWings(org, { merchant: 40, smuggler: 30, raider: 30 });
    org.heat = 80;
    for (const wing of org.factions) wing.satisfaction = 20;
    const fleetsBefore = org.fleetIds.length;

    const result = offerAmnesty(world, org, 'faction-a');

    check('the wings that wanted out come in', result.accepted, result.wings.join(','));
    check('the merchants accept', result.wings.includes('merchant'));
    check('the raiders do not', !result.wings.includes('raider'));
    check('they take their ships with them', org.fleetIds.length < fleetsBefore,
        `${org.fleetIds.length} vs ${fleetsBefore}`);
    check('which now fly for the amnesty-giver',
        [...world.movement.fleets.values()].some(f => f.factionId === 'faction-a'));
    check('and the remainder is run by whoever refused',
        org.doctrine === 'raider', org.doctrine);
}

// ─── 13. Determinism ─────────────────────────────────────────────────────────

console.log('\n[13] determinism');
{
    const run = () => {
        const world = makeWorld();
        const org = band(world, 'sys-lane', 6);
        setWings(org, { raider: 40, merchant: 35, smuggler: 25 });
        org.crewLoyalty = 25;
        for (const wing of org.factions) wing.satisfaction = 20;
        for (let i = 0; i < 20; i++) {
            world.nowSeconds += 3600;
            tickPirateSuccession(world, 3600);
        }
        return activeOrganizations(world)
            .map(o => `${o.name}:${o.doctrine}:${o.fleetIds.length}:${o.infamy.toFixed(2)}`)
            .sort()
            .join('|');
    };
    check('the same band comes apart the same way', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
