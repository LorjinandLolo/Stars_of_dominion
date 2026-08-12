// scripts/test-piracy-phase7.ts
// Pirate system Phase 7 verification — sponsorship, the exposure ladder and its
// consequences, letters of marque, pirate diplomacy, and sponsor interference.
// Run: npx tsx scripts/test-piracy-phase7.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import {
    backSuccessor,
    cutSponsorship,
    exposureStep,
    issueMarque,
    negotiate,
    openSponsorship,
    recognizedBy,
    revokeMarque,
    setOperation,
    sponsoredIntensity,
    sponsorshipsBy,
    tickSponsorship,
} from '../lib/piracy/sponsorship-service';
import {
    eligibleStage,
    ensurePiracyState,
    foundOrganization,
    isRecognized,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
import { establishBase, BASE_KINDS } from '../lib/piracy/base-service';
import { choosePosture } from '../lib/piracy/raid-service';
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
    id: 'agr-1', aFactionId: 'faction-victim', bFactionId: 'faction-b',
    resource: Resource.RARES, volumePerHour: 100, startTick: 0, endTick: 999_999,
    priceFormula: 'market',
};

function makeWorld(nowSeconds = 300_000): GameWorldState {
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
                ['faction-sponsor', { id: 'faction-sponsor', name: 'Sponsor', reserves: { CREDITS: 2_000_000 } }],
                ['faction-victim', { id: 'faction-victim', name: 'Victim', reserves: { CREDITS: 2_000_000 } }],
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
            empires: new Map([
                ['faction-sponsor', { factionId: 'faction-sponsor', publicTrust: 60 }],
            ]),
            activeStories: new Map(),
            publishedStories: [],
            tick: 0,
        },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: {
            organizations: new Map(), bases: new Map(), hostages: new Map(),
            protectionContracts: new Map(), tributes: new Map(),
            blackMarkets: new Map(), smugglingRuns: new Map(), sponsorships: new Map(),
            opportunityIndex: new Map(), emergenceLog: [],
        },
    } as unknown as GameWorldState;
}

/** A band worth buying: a corsair network with ships and somewhere to hide. */
function band(world: GameWorldState): PirateOrganization {
    const org = foundOrganization(world, 'sys-lane', []);
    org.treasury = 100_000;
    org.stage = 3;
    org.infamy = 45;
    org.crewLoyalty = 70;
    for (let i = 1; i <= 3; i++) {
        world.movement.fleets.set(`pirate-${i}`, makeFleet(`pirate-${i}`, 'sys-lane', org.id));
        org.fleetIds.push(`pirate-${i}`);
    }
    establishBase(world, org, 'hideout', 'sys-lane');
    world.nowSeconds += BASE_KINDS.hideout.buildSeconds;
    org.lastRaidAtSeconds = world.nowSeconds;
    return org;
}

function atWar(world: GameWorldState, a: string, b: string, level = 6) {
    world.rivalries.set('riv-1', {
        empireAId: a, empireBId: b, rivalryScore: 50, escalationLevel: level,
    } as never);
}

/** Run the sponsorship tick, keeping the band visibly active. */
function runTicks(world: GameWorldState, org: PirateOrganization, n: number) {
    for (let i = 0; i < n; i++) {
        world.nowSeconds += 3600;
        org.lastRaidAtSeconds = world.nowSeconds;
        tickSponsorship(world, 3600);
    }
}

// ─── 1. Opening a sponsorship ────────────────────────────────────────────────

console.log('\n[1] sponsorship');
{
    const world = makeWorld();
    const org = band(world);

    const sponsorship = openSponsorship(world, org, 'faction-sponsor', {
        targetFactionId: 'faction-victim',
        intensity: 'harassment',
        fundingPerHour: 800,
    })!;

    check('a sponsorship opens', !!sponsorship);
    check('it starts invisible', sponsorship.attributionState === 'invisible');
    check('with no evidence against anyone', sponsorship.evidence === 0);
    check('the sponsor is now a contact', (org.relations['faction-sponsor']?.standing ?? 0) > 0);
    check('and the arrangement is secret', org.relations['faction-sponsor']?.secret === true);

    const corsairs = org.factions.find(f => f.doctrine === 'corsair')!;
    const traditionalists = org.factions.find(f => f.doctrine === 'traditionalist')!;
    check('the corsair wing is delighted', corsairs.satisfaction > 50, `${corsairs.satisfaction}`);
    check('the traditionalists are not', traditionalists.satisfaction < 50,
        `${traditionalists.satisfaction}`);

    // Amending rather than stacking.
    const again = openSponsorship(world, org, 'faction-sponsor', { intensity: 'blockade' })!;
    check('a second offer amends the first', again.id === sponsorship.id);
    check('the intensity changed', again.intensity === 'blockade');
    check('only one arrangement exists', sponsorshipsBy(world, 'faction-sponsor').length === 1);
}

// ─── 2. Paying for it ────────────────────────────────────────────────────────

console.log('\n[2] funding');
{
    const world = makeWorld();
    const org = band(world);
    openSponsorship(world, org, 'faction-sponsor', { fundingPerHour: 1_000 });

    const reserves = world.economy.factions.get('faction-sponsor')!.reserves as Record<string, number>;
    const before = reserves.CREDITS;
    const treasuryBefore = org.treasury;
    const loyaltyBefore = org.crewLoyalty;

    runTicks(world, org, 1);

    check('the sponsor pays', reserves.CREDITS === before - 1_000, `${reserves.CREDITS}`);
    check('the band is funded', org.treasury > treasuryBefore);
    check('crews resent being somebody\'s asset', org.crewLoyalty < loyaltyBefore,
        `${org.crewLoyalty}`);

    // A sponsor who runs dry is not a sponsor.
    reserves.CREDITS = 0;
    runTicks(world, org, 1);
    check('an insolvent sponsor is dropped', sponsorshipsBy(world, 'faction-sponsor').length === 0);
}

// ─── 3. The exposure ladder ──────────────────────────────────────────────────

console.log('\n[3] the ladder');
{
    check('the rungs are ordered', exposureStep(0.1) === 'invisible'
        && exposureStep(0.3) === 'suspected'
        && exposureStep(0.6) === 'attributed'
        && exposureStep(0.9) === 'exposed');

    const world = makeWorld();
    const org = band(world);
    openSponsorship(world, org, 'faction-sponsor', {
        targetFactionId: 'faction-victim',
        intensity: 'blockade',
        fundingPerHour: 100,
    });

    const seen: string[] = [];
    for (let i = 0; i < 400; i++) {
        world.nowSeconds += 3600;
        org.lastRaidAtSeconds = world.nowSeconds;
        tickSponsorship(world, 3600);
        const s = sponsorshipsBy(world, 'faction-sponsor')[0];
        if (!s) break;
        const step = exposureStep(s.evidence);
        if (seen[seen.length - 1] !== step) seen.push(step);
        if (step === 'exposed') break;
    }

    check('proof accumulates through every rung in order',
        seen.join('>') === 'invisible>suspected>attributed>exposed', seen.join('>'));
}

// ─── 4. Intensity is the clock ───────────────────────────────────────────────

console.log('\n[4] intensity');
{
    const evidenceAfter = (intensity: 'harassment' | 'blockade') => {
        const world = makeWorld();
        const org = band(world);
        openSponsorship(world, org, 'faction-sponsor', {
            targetFactionId: 'faction-victim', intensity, fundingPerHour: 100,
        });
        runTicks(world, org, 40);
        return sponsorshipsBy(world, 'faction-sponsor')[0]?.evidence ?? 0;
    };

    const quiet = evidenceAfter('harassment');
    const loud = evidenceAfter('blockade');
    check('a blockade is far easier to trace than harassment', loud > quiet * 3,
        `${loud.toFixed(4)} vs ${quiet.toFixed(4)}`);
    check('but harassment is not free either', quiet > 0, `${quiet}`);
}

// ─── 5. Tradecraft and leaks ─────────────────────────────────────────────────

console.log('\n[5] tradecraft');
{
    const evidenceWith = (setup: (w: GameWorldState, o: PirateOrganization) => void) => {
        const world = makeWorld();
        const org = band(world);
        openSponsorship(world, org, 'faction-sponsor', {
            targetFactionId: 'faction-victim', intensity: 'economicDisruption', fundingPerHour: 100,
        });
        setup(world, org);
        runTicks(world, org, 30);
        return sponsorshipsBy(world, 'faction-sponsor')[0]?.evidence ?? 0;
    };

    const baseline = evidenceWith(() => {});
    const careful = evidenceWith(w => {
        w.espionage.factionIntel.set('faction-sponsor', {
            factionId: 'faction-sponsor', counterIntelStrength: 90, internalSecurity: 90,
        } as never);
    });
    check('good tradecraft slows the trail', careful < baseline,
        `${careful.toFixed(4)} vs ${baseline.toFixed(4)}`);

    const hunted = evidenceWith(w => {
        w.espionage.factionIntel.set('faction-victim', {
            factionId: 'faction-victim', counterIntelStrength: 100,
        } as never);
    });
    check('a victim who is looking speeds it up', hunted > baseline,
        `${hunted.toFixed(4)} vs ${baseline.toFixed(4)}`);

    const leaky = evidenceWith((w, o) => {
        for (const base of ensurePiracyState(w).bases.values()) base.compromisedByFactionId = 'faction-victim';
        void o;
    });
    check('a turned base is the fastest way to be found out', leaky > baseline * 5,
        `${leaky.toFixed(4)} vs ${baseline.toFixed(4)}`);

    // Cold trails go cold: a band that stops raiding stops generating proof.
    const world = makeWorld();
    const org = band(world);
    openSponsorship(world, org, 'faction-sponsor', {
        targetFactionId: 'faction-victim', intensity: 'blockade', fundingPerHour: 100,
    });
    runTicks(world, org, 30);
    const hot = sponsorshipsBy(world, 'faction-sponsor')[0].evidence;
    for (let i = 0; i < 40; i++) {
        world.nowSeconds += 3600;   // no raids: the band has gone quiet
        tickSponsorship(world, 3600);
    }
    check('lying low lets the trail cool',
        sponsorshipsBy(world, 'faction-sponsor')[0].evidence < hot,
        `${sponsorshipsBy(world, 'faction-sponsor')[0].evidence.toFixed(4)} vs ${hot.toFixed(4)}`);
}

// ─── 6. Consequences ─────────────────────────────────────────────────────────

console.log('\n[6] exposure');
{
    const world = makeWorld();
    const org = band(world);
    atWar(world, 'faction-sponsor', 'faction-victim', 2);
    const sponsorship = openSponsorship(world, org, 'faction-sponsor', {
        targetFactionId: 'faction-victim', intensity: 'blockade', fundingPerHour: 100,
    })!;

    const trustBefore = world.press.empires.get('faction-sponsor')!.publicTrust;
    const rivalryBefore = world.rivalries.get('riv-1')!.rivalryScore;
    const corsairsBefore = org.factions.find(f => f.doctrine === 'corsair')!.satisfaction;

    sponsorship.evidence = 0.9;
    runTicks(world, org, 1);

    check('the state is exposed', sponsorship.attributionState === 'exposed');
    check('the press has the story', world.press.activeStories.size > 0);
    check('the sponsor pays at home', world.press.empires.get('faction-sponsor')!.publicTrust < trustBefore,
        `${world.press.empires.get('faction-sponsor')!.publicTrust}`);
    check('the victim has a grievance', world.rivalries.get('riv-1')!.rivalryScore > rivalryBefore);
    check('and the rivalry escalates', world.rivalries.get('riv-1')!.escalationLevel > 2);
    check('there is a formal attribution record',
        world.espionage.attributionRecords.some(r =>
            r.suspectedFactionId === 'faction-sponsor' && r.attributionState === 'exposed'));

    // Both sides are damaged — that is the point.
    check('the corsair wing is humiliated',
        org.factions.find(f => f.doctrine === 'corsair')!.satisfaction < corsairsBefore);
    check('the traditionalists are vindicated',
        org.factions.find(f => f.doctrine === 'traditionalist')!.satisfaction > 30);
    check('and the band is hunted harder', org.heat > 0, `${org.heat}`);
}

// ─── 7. Letters of marque ────────────────────────────────────────────────────

console.log('\n[7] privateering');
{
    const world = makeWorld();
    const org = band(world);

    check('a marque without a war is refused',
        issueMarque(world, org, 'faction-sponsor', 'faction-victim') === null);

    atWar(world, 'faction-sponsor', 'faction-victim');
    const marque = issueMarque(world, org, 'faction-sponsor', 'faction-victim')!;
    check('a marque in wartime is issued', !!marque);
    check('it is not covert', marque.covert === false);
    check('the arrangement is public', org.relations['faction-sponsor']?.secret === false);
    check('it is a privateering agreement',
        org.relations['faction-sponsor']?.agreements.includes('privateering'));

    // Nothing to hide means nothing to find.
    runTicks(world, org, 60);
    check('an open commission never accrues evidence', marque.evidence === 0, `${marque.evidence}`);
    check('and never becomes an exposure', marque.attributionState === 'invisible');

    const raidersBefore = org.factions.find(f => f.doctrine === 'raider')!.satisfaction;
    revokeMarque(world, marque.id);
    check('revoking ends the commission', sponsorshipsBy(world, 'faction-sponsor').length === 0);
    check('leaving an armed fleet with nothing to do',
        org.factions.find(f => f.doctrine === 'raider')!.satisfaction > raidersBefore);
}

// ─── 8. The sponsor sets the intensity, the band chooses how ─────────────────

console.log('\n[8] operations');
{
    const world = makeWorld();
    const org = band(world);
    org.doctrine = 'smuggler';   // would skim if left alone
    org.heat = 10;

    check('left alone, a smuggler skims', choosePosture(org, ROUTE) === 'skim');

    const sponsorship = openSponsorship(world, org, 'faction-sponsor', {
        targetFactionId: 'faction-victim', intensity: 'blockade',
    })!;
    check('the sponsorship is aimed at somebody',
        sponsoredIntensity(world, org, 'faction-victim') === 'blockade');
    check('a band paid to blockade strangles the lane',
        choosePosture(org, ROUTE, sponsoredIntensity(world, org, 'faction-victim')) === 'strangle');

    setOperation(world, sponsorship.id, 'harassment', 'faction-victim');
    check('dialling it down eases the squeeze',
        choosePosture(org, ROUTE, sponsoredIntensity(world, org, 'faction-victim')) === 'skim');

    check('a third party\'s cargo is not covered by the contract',
        sponsoredIntensity(world, org, 'faction-b') === null);
}

// ─── 9. Being dropped ────────────────────────────────────────────────────────

console.log('\n[9] abandonment');
{
    const world = makeWorld();
    const org = band(world);
    const sponsorship = openSponsorship(world, org, 'faction-sponsor', { fundingPerHour: 500 })!;
    const standingBefore = org.relations['faction-sponsor']!.standing;
    const raidersBefore = org.factions.find(f => f.doctrine === 'raider')!.satisfaction;

    cutSponsorship(world, sponsorship.id);

    check('the arrangement is gone', sponsorshipsBy(world, 'faction-sponsor').length === 0);
    check('the band remembers being dropped',
        org.relations['faction-sponsor']!.standing < standingBefore);
    check('and the raider wing gets its argument back',
        org.factions.find(f => f.doctrine === 'raider')!.satisfaction > raidersBefore);
}

// ─── 10. Pirate diplomacy ────────────────────────────────────────────────────

console.log('\n[10] diplomacy');
{
    const world = makeWorld();
    const org = band(world);
    org.infamy = 60;
    org.networkControl = 40;
    org.heat = 20;

    const lowball = negotiate(world, org, 'faction-victim', {
        kind: 'nonAggression', paymentPerHour: 10,
    });
    check('a band with leverage refuses a lowball', !lowball.accepted);
    check('and names its price', (lowball.counterPerHour ?? 0) > 10, `${lowball.counterPerHour}`);

    const deal = negotiate(world, org, 'faction-victim', {
        kind: 'nonAggression', paymentPerHour: lowball.counterPerHour,
    });
    check('meeting the price closes the deal', deal.accepted);
    check('the agreement is on the books',
        org.relations['faction-victim']?.agreements.includes('nonAggression'));

    // Leverage cuts both ways: a hunted band asks for less.
    const hunted = band(makeWorld());
    hunted.infamy = 60;
    hunted.networkControl = 40;
    hunted.heat = 90;
    const cheap = negotiate(makeWorld(), hunted, 'faction-victim', {
        kind: 'nonAggression', paymentPerHour: 10,
    });
    check('a band everyone is hunting negotiates from weakness',
        (cheap.counterPerHour ?? Infinity) < (lowball.counterPerHour ?? 0),
        `${cheap.counterPerHour} vs ${lowball.counterPerHour}`);
}

// ─── 11. Recognition and Stage V ─────────────────────────────────────────────

console.log('\n[11] recognition');
{
    const world = makeWorld();
    const org = band(world);
    org.stage = 4;
    org.infamy = 80;
    org.networkControl = 80;
    org.crewLoyalty = 70;
    org.baseIds = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    for (let i = 4; i <= 8; i++) {
        world.movement.fleets.set(`pirate-${i}`, makeFleet(`pirate-${i}`, 'sys-lane', org.id));
        org.fleetIds.push(`pirate-${i}`);
    }
    for (const wing of org.factions) wing.pressure = wing.doctrine === 'merchant' ? 60 : 10;
    org.relations['faction-victim'] = {
        factionId: 'faction-victim', standing: 40, agreements: [],
        lastContactTick: world.nowSeconds, secret: false,
    };

    check('a confederacy is not yet a state', !isRecognized(org));
    check('and cannot become one unrecognized', eligibleStage(org) === 4, `${eligibleStage(org)}`);

    const early = negotiate(world, org, 'faction-sponsor', { kind: 'recognition' });
    check('only a would-be state can ask for recognition', !early.accepted, early.reason);

    org.stage = 5;
    const recognized = negotiate(world, org, 'faction-sponsor', { kind: 'recognition' });
    org.stage = 4;
    check('a Stage V band can be recognized', recognized.accepted);
    check('the recognition is recorded', isRecognized(org));
    check('and names who granted it', recognizedBy(org).includes('faction-sponsor'));
    check('with recognition in hand, statehood is reachable', eligibleStage(org) === 5,
        `${eligibleStage(org)}`);
}

// ─── 12. Sponsor interference ────────────────────────────────────────────────

console.log('\n[12] interference');
{
    const world = makeWorld();
    const org = band(world);
    const sponsorship = openSponsorship(world, org, 'faction-sponsor', { fundingPerHour: 100 })!;

    check('a mere paymaster cannot pick the leadership',
        !backSuccessor(world, org, 'faction-sponsor', 'merchant'));

    org.relations['faction-sponsor']!.standing = 80;
    const merchantsBefore = org.factions.find(f => f.doctrine === 'merchant')!.pressure;
    const evidenceBefore = sponsorship.evidence;

    check('a patron can', backSuccessor(world, org, 'faction-sponsor', 'merchant'));
    check('the favoured wing gains ground',
        org.factions.find(f => f.doctrine === 'merchant')!.pressure > merchantsBefore);
    check('shares still sum to 100',
        Math.abs(org.factions.reduce((s, f) => s + f.pressure, 0) - 100) < 1e-6);
    check('and meddling is itself evidence', sponsorship.evidence > evidenceBefore,
        `${sponsorship.evidence}`);
}

// ─── 13. Determinism ─────────────────────────────────────────────────────────

console.log('\n[13] determinism');
{
    const run = () => {
        const world = makeWorld();
        const org = band(world);
        org.crewLoyalty = 20;   // leaky enough to exercise the seeded roll
        openSponsorship(world, org, 'faction-sponsor', {
            targetFactionId: 'faction-victim', intensity: 'economicDisruption', fundingPerHour: 200,
        });
        runTicks(world, org, 40);
        const s = sponsorshipsBy(world, 'faction-sponsor')[0];
        return `${s?.evidence.toFixed(6)}|${s?.attributionState}`;
    };
    check('the same conspiracy unravels the same way', run() === run());
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
