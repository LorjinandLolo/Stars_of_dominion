// scripts/test-piracy-phase9.ts
// Pirate system Phase 9 verification — the visibility filter that the whole
// system's asymmetry depends on, the pirate player's own view and orders, and
// the six endgame objectives.
// Run: npx tsx scripts/test-piracy-phase9.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import {
    buildPirateDashboard,
    buildPirateView,
    hasContact,
    publicPiracyState,
} from '../lib/piracy/pirate-view';
import {
    ensurePiracyState,
    foundOrganization,
    playedOrganization,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, discoverBase, BASE_KINDS } from '../lib/piracy/base-service';
import { signProtectionContract } from '../lib/piracy/protection-service';
import { openSponsorship, issueMarque } from '../lib/piracy/sponsorship-service';
import { cleanWorldForSave } from '../lib/persistence/save-service';
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

function makeWorld(nowSeconds = 500_000): GameWorldState {
    return {
        nowSeconds,
        movement: {
            systems: new Map([
                ['sys-lane', makeSystem('sys-lane', ['sys-b'])],
                ['sys-b', makeSystem('sys-b', ['sys-lane'])],
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
                ['faction-a', { id: 'faction-a', name: 'Aurelia', reserves: { CREDITS: 1_000_000 } }],
                ['faction-b', { id: 'faction-b', name: 'Bellum', reserves: { CREDITS: 1_000_000 } }],
                ['faction-c', { id: 'faction-c', name: 'Cassia', reserves: { CREDITS: 1_000_000 } }],
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
        press: { empires: new Map(), activeStories: new Map(), publishedStories: [], tick: 0 },
        leadership: { leaders: new Map(), recruitmentPool: [], nowSeconds },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        construction: { planets: new Map(), spaceBuildQueue: [], nowSeconds },
        tech: new Map(),
        combat: { recruitmentJobs: [] },
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
    org.treasury = 80_000;
    org.stage = 3;
    org.infamy = 50;
    for (let i = 1; i <= fleets; i++) {
        const id = `pirate-${org.id}-${i}`;
        world.movement.fleets.set(id, makeFleet(id, systemId, org.id));
        org.fleetIds.push(id);
    }
    establishBase(world, org, 'hideout', systemId);
    world.nowSeconds += BASE_KINDS.hideout.buildSeconds;
    return org;
}

// ─── 1. Deny by default ──────────────────────────────────────────────────────

console.log('\n[1] contact');
{
    const world = makeWorld();
    const org = band(world);

    check('a band nobody has met is invisible', !hasContact(world, org, 'faction-a'));
    check('and does not appear in their view',
        buildPirateView(world, 'faction-a').organizations.length === 0);

    org.heatByFaction['faction-a'] = 20;   // they raided us
    check('being raided is contact', hasContact(world, org, 'faction-a'));
    check('but not for a bystander', !hasContact(world, org, 'faction-b'));

    const view = buildPirateView(world, 'faction-a');
    check('the victim now sees a name', view.organizations.length === 1);
    check('and how badly they want them', view.organizations[0].heatToward === 20);
    check('a bystander still sees nothing',
        buildPirateView(world, 'faction-b').organizations.length === 0);
}

// ─── 2. Familiarity gates detail ─────────────────────────────────────────────

console.log('\n[2] how much is visible');
{
    const world = makeWorld();
    const org = band(world);
    org.networkControl = 70;
    org.heatByFaction['faction-a'] = 10;

    const raidedOnly = buildPirateView(world, 'faction-a').organizations[0];
    check('a band you have only been raided by is a rumour with a name',
        raidedOnly.stage === null && raidedOnly.networkControl === null,
        `${raidedOnly.stage}/${raidedOnly.networkControl}`);

    org.relations['faction-a'] = {
        factionId: 'faction-a', standing: 30, agreements: ['nonAggression'],
        lastContactTick: world.nowSeconds, secret: true,
    };
    const dealtWith = buildPirateView(world, 'faction-a').organizations[0];
    check('dealing with them reveals their shape', dealtWith.stage === 3);
    check('and our own agreements', dealtWith.ourAgreements.includes('nonAggression'));

    const base = [...ensurePiracyState(world).bases.values()][0];
    base.compromisedByFactionId = 'faction-a';
    const infiltrated = buildPirateView(world, 'faction-a').organizations[0];
    check('somebody inside reveals how much they run',
        infiltrated.networkControl === 70, `${infiltrated.networkControl}`);
}

// ─── 3. Bases ────────────────────────────────────────────────────────────────

console.log('\n[3] hidden bases stay hidden');
{
    const world = makeWorld();
    const org = band(world);
    establishBase(world, org, 'smuggler_port', 'sys-b');
    org.heatByFaction['faction-a'] = 10;

    check('the band really does have two bases', org.baseIds.length === 2);
    check('but a hunter sees none of them',
        buildPirateView(world, 'faction-a').bases.length === 0);

    const [first] = [...ensurePiracyState(world).bases.values()];
    discoverBase(first, 'faction-a');
    const view = buildPirateView(world, 'faction-a');
    check('finding one reveals exactly one', view.bases.length === 1);
    check('with its kind and location', !!view.bases[0].kind && !!view.bases[0].systemId);
    check('and a rival learns nothing from it',
        buildPirateView(world, 'faction-b').bases.length === 0);
}

// ─── 4. The exposure ladder is the visibility rule ───────────────────────────

console.log('\n[4] covert sponsorship');
{
    const world = makeWorld();
    const org = band(world);
    org.heatByFaction['faction-b'] = 10;
    const sponsorship = openSponsorship(world, org, 'faction-a', {
        targetFactionId: 'faction-b', intensity: 'blockade', fundingPerHour: 500,
    })!;

    const sponsorView = buildPirateView(world, 'faction-a');
    check('the sponsor sees their own arrangement in full',
        sponsorView.ownSponsorships.length === 1);
    check('including how close they are to being caught',
        sponsorView.ownSponsorships[0].exposure === 'invisible');

    const victimView = buildPirateView(world, 'faction-b');
    check('the victim sees no conspiracy at all',
        victimView.suspectedSponsorships.length === 0);
    check('and certainly no sponsor name',
        !JSON.stringify(victimView).includes('faction-a'));

    sponsorship.evidence = 0.35;   // suspected
    const suspects = buildPirateView(world, 'faction-b').suspectedSponsorships;
    check('a suspicion appears once there is a trail', suspects.length === 1);
    check('but it does not yet name anybody', suspects[0].suspectedFactionId === null);

    sponsorship.evidence = 0.9;    // exposed
    const exposed = buildPirateView(world, 'faction-b').suspectedSponsorships;
    check('proof names the sponsor', exposed[0].suspectedFactionId === 'faction-a');

    // A marque was never a secret.
    const world2 = makeWorld();
    const org2 = band(world2);
    org2.heatByFaction['faction-b'] = 10;
    world2.rivalries.set('r', {
        empireAId: 'faction-a', empireBId: 'faction-b', rivalryScore: 50, escalationLevel: 6,
    } as never);
    issueMarque(world2, org2, 'faction-a', 'faction-b');
    check('an open commission is visible to its target immediately',
        buildPirateView(world2, 'faction-b').suspectedSponsorships[0]?.suspectedFactionId === 'faction-a');
}

// ─── 5. Contracts ────────────────────────────────────────────────────────────

console.log('\n[5] secret contracts');
{
    const world = makeWorld();
    const org = band(world);
    org.heatByFaction['faction-b'] = 10;
    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1'], { secret: true });

    check('the payer sees what they signed',
        buildPirateView(world, 'faction-a').contracts.length === 1);
    check('a rival who knows the band does not',
        buildPirateView(world, 'faction-b').contracts.length === 0);
}

// ─── 6. The shared snapshot carries nothing sensitive ────────────────────────

console.log('\n[6] the session snapshot');
{
    const world = makeWorld();
    const org = band(world);
    org.relations['faction-a'] = {
        factionId: 'faction-a', standing: 50, agreements: ['secretContract'],
        lastContactTick: world.nowSeconds, secret: true,
    };
    openSponsorship(world, org, 'faction-a', { targetFactionId: 'faction-b', covert: true });
    signProtectionContract(world, org, 'faction-a', 'faction', ['route-1'], { secret: true });

    const shared = cleanWorldForSave(world);
    const blob = JSON.stringify(shared.piracy ?? {});

    check('no bases ride in the shared snapshot', shared.piracy.bases.size === 0);
    check('no sponsorships either', shared.piracy.sponsorships.size === 0);
    check('nor contracts', shared.piracy.protectionContracts.size === 0);
    check('nor the emergence log', shared.piracy.emergenceLog.length === 0);
    check('and no band\'s private dealings', !blob.includes('secretContract'));
    check('the band still has a public name',
        [...shared.piracy.organizations.values()][0]?.name === org.name);
    check('the live world is untouched', ensurePiracyState(world).bases.size > 0);

    const publicView = publicPiracyState(world);
    check('the public projection is names and fame only',
        publicView.organizations.every(o => Object.keys(o).length <= 5));
}

// ─── 7. The pirate player's dashboard ────────────────────────────────────────

console.log('\n[7] playing a band');
{
    const world = makeWorld();
    const org = band(world);
    org.playerFactionId = 'faction-pirate-player';

    check('the player owns their band',
        playedOrganization(world, 'faction-pirate-player')?.id === org.id);
    check('and nobody else does', playedOrganization(world, 'faction-a') === null);

    const dashboard = buildPirateDashboard(world, org.id)!;
    check('the dashboard exists', !!dashboard);
    check('it reports the five metrics',
        dashboard.infamy >= 0 && dashboard.heat >= 0 && dashboard.networkControl >= 0
        && dashboard.blackMarketLiquidity >= 0 && dashboard.crewLoyalty >= 0);
    check('it shows the wings', dashboard.wings.length === 5);
    check('and the base network', dashboard.bases.length === 1);
    check('and capacity, so over-extension is legible',
        dashboard.supportableFleets > 0 && dashboard.fleets === 4);
    check('it does NOT report a territory count',
        !('systemsOwned' in dashboard) && !('territory' in dashboard));

    const view = buildPirateView(world, 'faction-pirate-player');
    check('the player\'s own view names the band they play',
        view.playedOrganizationId === org.id);
}

// ─── 8. Determinism ──────────────────────────────────────────────────────────

console.log('\n[8] determinism');
{
    const run = () => {
        const world = makeWorld();
        const org = band(world);
        org.heatByFaction['faction-a'] = 15;
        return JSON.stringify(buildPirateView(world, 'faction-a'));
    };
    check('the same world yields the same view', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
