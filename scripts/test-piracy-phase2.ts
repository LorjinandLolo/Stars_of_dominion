// scripts/test-piracy-phase2.ts
// Pirate system Phase 2 verification — the Piracy Opportunity Index, the
// lawlessness ratchet, and emergence with origins and attribution.
// Run: npx tsx scripts/test-piracy-phase2.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import { Resource, TradeAgreement, TradeRoute } from '../lib/trade-system/types';
import { computeOpportunityIndex } from '../lib/piracy/opportunity-index';
import {
    determineOrigin,
    tickPiracyEmergence,
    tickPiracyOpportunity,
} from '../lib/piracy/emergence-service';
import {
    activeOrganizations,
    ensurePiracyState,
    foundOrganization,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';

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
    tradeValue?: number;
    instability?: number;
    escalationLevel?: number;
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
        instability: spec.instability ?? 0,
        escalationLevel: spec.escalationLevel ?? 0,
        security: spec.security ?? 50,
        tradeValue: spec.tradeValue ?? 0,
        lawlessness: spec.lawlessness ?? 0,
    };
}

function makeRoute(id: string, path: string[], escortLevel = 0, priority = 20): TradeRoute {
    return {
        id, agreementId: `agr-${id}`, path, theatreId: 'T1',
        exposureScore: 0, piracyRisk: 0, blockadeRisk: 0, deepSpaceRisk: 0,
        escortLevel, routePriority: priority,
    };
}

function makeAgreement(id: string, resource: Resource): TradeAgreement {
    return {
        id: `agr-${id}`, aFactionId: 'faction-a', bFactionId: 'faction-b',
        resource, volumePerHour: 10, startTick: 0, endTick: 1000, priceFormula: 'market',
    };
}

interface WorldSpec {
    systems: SystemSpec[];
    routes?: TradeRoute[];
    agreements?: TradeAgreement[];
    capitalSystemId?: string;
    governmentCohesion?: number;
    governmentCorruption?: number;
    atWarWith?: string;
    sanctioned?: boolean;
    shadowNodeSystemId?: string;
}

function makeWorld(spec: WorldSpec, nowSeconds = 3600): GameWorldState {
    const systems = new Map<string, SystemNode>();
    for (const s of spec.systems) systems.set(s.id, makeSystem(s));

    const world = {
        nowSeconds,
        movement: { systems, fleets: new Map<string, Fleet>(), corridors: new Map() },
        economy: {
            tradeRoutes: new Map((spec.routes ?? []).map(r => [r.id, r])),
            tradeAgreements: new Map((spec.agreements ?? []).map(a => [a.id, a])),
            factions: new Map([['faction-a', {
                id: 'faction-a', name: 'A', capitalSystemId: spec.capitalSystemId ?? 'sys-core',
            }]]),
            policies: new Map(),
        },
        espionage: { shadowEconomyNodes: new Map() },
        government: new Map(),
        rivalries: new Map(),
        secessionCrises: new Map(),
        piracy: { organizations: new Map(), opportunityIndex: new Map(), emergenceLog: [] },
    } as unknown as GameWorldState;

    if (spec.governmentCohesion !== undefined || spec.governmentCorruption !== undefined) {
        world.government.set('faction-a', {
            cohesion: spec.governmentCohesion ?? 50,
            corruption: spec.governmentCorruption ?? 0,
            warFatigue: 0,
        } as never);
    }
    if (spec.atWarWith) {
        world.rivalries.set('riv-1', {
            empireAId: 'faction-a', empireBId: spec.atWarWith, escalationLevel: 7,
        } as never);
    }
    if (spec.sanctioned) {
        world.economy.policies.set('faction-b', {
            sanctions: new Set(['faction-a']), embargoes: [],
        } as never);
    }
    if (spec.shadowNodeSystemId) {
        world.espionage.shadowEconomyNodes.set(spec.shadowNodeSystemId, {
            systemId: spec.shadowNodeSystemId, factionId: 'faction-c',
        } as never);
    }
    return world;
}

function addFleet(world: GameWorldState, id: string, systemId: string, factionId: string, strength = 0.8) {
    world.movement.fleets.set(id, {
        id, factionId, name: id, currentSystemId: systemId, destinationSystemId: null,
        activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [], orders: [],
        doctrine: {
            type: 'Raider', deviationFromPosture: 0, preferredLayers: ['hyperlane'],
            retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1,
        },
        postureId: 'Expansionist', strength, basePower: 100, composition: {},
        hyperdriveProfile: {} as never, isDetectable: true,
    } as Fleet);
}

/** The classic bad frontier: a fat unescorted lane nobody is watching. */
function juicyLaneWorld(): GameWorldState {
    return makeWorld({
        systems: [
            { id: 'sys-core', owner: 'faction-a', security: 90, tradeValue: 40 },
            { id: 'sys-a', neighbours: ['sys-core', 'sys-lane'], owner: 'faction-a', security: 60 },
            { id: 'sys-b', neighbours: ['sys-lane'], owner: 'faction-a', security: 60 },
            {
                id: 'sys-lane', neighbours: ['sys-a', 'sys-b'], owner: 'faction-a',
                security: 10, tradeValue: 90, instability: 60,
            },
            { id: 'sys-void', security: 5, tradeValue: 0, instability: 80 },
        ],
        routes: [makeRoute('route-1', ['sys-core', 'sys-a', 'sys-lane', 'sys-b'], 0, 30)],
        agreements: [makeAgreement('route-1', Resource.RARES)],
        governmentCohesion: 40,
    });
}

// ─── 1. The index measures the right thing ───────────────────────────────────

console.log('\n[1] opportunity index');
{
    const world = juicyLaneWorld();
    const index = computeOpportunityIndex(world);
    const lane = index.get('sys-lane')!;
    const voidSys = index.get('sys-void')!;
    const core = index.get('sys-core')!;

    check('a fat unescorted lane outscores an empty lawless void',
        lane.poi > voidSys.poi, `lane ${lane.poi.toFixed(1)} vs void ${voidSys.poi.toFixed(1)}`);
    check('an empty void scores nothing at all', voidSys.poi === 0, `${voidSys.poi}`);
    check('a defended capital is unattractive', core.poi < lane.poi, `${core.poi.toFixed(1)}`);
    check('the lane reads as genuinely dangerous', lane.poi > 10, `${lane.poi.toFixed(1)}`);
    check('the index is bounded', lane.poi <= 100 && lane.poi >= 0);
}

// ─── 2. Escorts and garrisons suppress opportunity ───────────────────────────

console.log('\n[2] counters');
{
    const before = computeOpportunityIndex(juicyLaneWorld()).get('sys-lane')!.poi;

    const escorted = juicyLaneWorld();
    escorted.economy.tradeRoutes.get('route-1')!.escortLevel = 8;
    const withEscorts = computeOpportunityIndex(escorted).get('sys-lane')!.poi;
    check('escorting the lane cuts opportunity', withEscorts < before,
        `${withEscorts.toFixed(1)} vs ${before.toFixed(1)}`);

    const garrisoned = juicyLaneWorld();
    addFleet(garrisoned, 'navy-1', 'sys-lane', 'faction-a', 1.0);
    const withGarrison = computeOpportunityIndex(garrisoned).get('sys-lane')!.poi;
    check('garrisoning the lane cuts opportunity', withGarrison < before,
        `${withGarrison.toFixed(1)} vs ${before.toFixed(1)}`);

    const secured = juicyLaneWorld();
    secured.movement.systems.get('sys-lane')!.security = 95;
    const withSecurity = computeOpportunityIndex(secured).get('sys-lane')!.poi;
    check('raising local security cuts opportunity', withSecurity < before,
        `${withSecurity.toFixed(1)} vs ${before.toFixed(1)}`);

    const quiet = juicyLaneWorld();
    quiet.movement.systems.get('sys-lane')!.instability = 0;
    quiet.government.set('faction-a', { cohesion: 100, corruption: 0, warFatigue: 0 } as never);
    const withOrder = computeOpportunityIndex(quiet).get('sys-lane')!.poi;
    check('a cohesive owner cuts opportunity', withOrder < before,
        `${withOrder.toFixed(1)} vs ${before.toFixed(1)}`);

    const noCargo = juicyLaneWorld();
    noCargo.economy.tradeRoutes.clear();
    noCargo.movement.systems.get('sys-lane')!.tradeValue = 0;
    check('nothing worth stealing means no opportunity at all',
        computeOpportunityIndex(noCargo).get('sys-lane')!.poi === 0);
}

// ─── 3. Chokepoints amplify ──────────────────────────────────────────────────

console.log('\n[3] chokepoints');
{
    const plain = computeOpportunityIndex(juicyLaneWorld()).get('sys-lane')!.poi;
    const choke = juicyLaneWorld();
    choke.movement.systems.get('sys-lane')!.tags.push('throat');
    const amplified = computeOpportunityIndex(choke).get('sys-lane')!.poi;
    check('a throat is worth more than open space', amplified > plain,
        `${amplified.toFixed(1)} vs ${plain.toFixed(1)}`);
}

// ─── 4. Attribution ──────────────────────────────────────────────────────────

console.log('\n[4] attribution');
{
    const world = juicyLaneWorld();
    const lane = computeOpportunityIndex(world).get('sys-lane')!;
    check('the reading names a dominant factor',
        ['value', 'exposure', 'instability'].includes(lane.dominantFactor), lane.dominantFactor);
    check('and the specific input behind it', !!lane.dominantInput, lane.dominantInput);

    const seeded = juicyLaneWorld();
    seeded.espionage.shadowEconomyNodes.set('sys-lane', {
        systemId: 'sys-lane', factionId: 'faction-c',
    } as never);
    const blamed = computeOpportunityIndex(seeded).get('sys-lane')!;
    check('a deliberately planted shadow node names its sponsor',
        blamed.blamedFactionId === 'faction-c', `${blamed.blamedFactionId}`);
}

// ─── 5. Origins ──────────────────────────────────────────────────────────────

console.log('\n[5] origins');
{
    const base = juicyLaneWorld();
    const sys = base.movement.systems.get('sys-lane')!;
    const plain = computeOpportunityIndex(base).get('sys-lane')!;
    check('a neglected frontier produces desperation',
        determineOrigin(base, sys, plain) === 'frontier_desperation');

    check('a shadow node produces a sponsored band',
        determineOrigin(base, sys, { ...plain, dominantInput: 'shadowEconomyNode' }) === 'sponsored');
    check('sanctions produce a smuggling syndicate',
        determineOrigin(base, sys, { ...plain, dominantInput: 'sanctions' }) === 'smuggler_syndicate');
    check('a war produces refugees',
        determineOrigin(base, sys, { ...plain, dominantInput: 'ownerAtWar' }) === 'war_refugee');

    const seceding = juicyLaneWorld();
    seceding.secessionCrises.set('crisis-1', { factionId: 'faction-a', systemIds: ['sys-lane'] } as never);
    check('a seceding region produces a remnant',
        determineOrigin(seceding, sys, plain) === 'secession_remnant');
}

// ─── 6. The lawlessness ratchet ──────────────────────────────────────────────

console.log('\n[6] lawlessness ratchet');
{
    const world = juicyLaneWorld();
    const lane = world.movement.systems.get('sys-lane')!;

    tickPiracyOpportunity(world, 3600);
    check('opportunity nobody exploits does not compound', (lane.lawlessness ?? 0) === 0,
        `${lane.lawlessness}`);
    check('the reading is cached on the system', (lane.piracyOpportunity ?? 0) > 0);
    check('and in the piracy aggregate',
        (ensurePiracyState(world).opportunityIndex.get('sys-lane') ?? 0) > 0);

    addFleet(world, 'pirate-1', 'sys-lane', PIRATE_FACTION_ID, 0.5);
    for (let i = 0; i < 5; i++) {
        world.nowSeconds += 3600;
        tickPiracyOpportunity(world, 3600);
    }
    const withRaiders = lane.lawlessness ?? 0;
    check('raiders working a rich lane make it lawless', withRaiders > 0, `${withRaiders}`);

    addFleet(world, 'navy-1', 'sys-lane', 'faction-a', 1.0);
    world.nowSeconds += 3600;
    tickPiracyOpportunity(world, 3600);
    check('a patrol burns lawlessness back off', (lane.lawlessness ?? 0) < withRaiders,
        `${lane.lawlessness} vs ${withRaiders}`);
}

// ─── 7. Corsair dens come and go ─────────────────────────────────────────────

console.log('\n[7] corsair dens');
{
    const world = juicyLaneWorld();
    const lane = world.movement.systems.get('sys-lane')!;
    lane.lawlessness = 99;
    addFleet(world, 'pirate-1', 'sys-lane', PIRATE_FACTION_ID, 0.5);

    tickPiracyOpportunity(world, 3600);
    check('fully lawless ground becomes a corsair den', lane.tags.includes('corsair_den'));
    check('but not a pirate station — that is a built asset with an owner',
        !lane.tags.includes('pirate_station'));

    world.movement.fleets.delete('pirate-1');
    addFleet(world, 'navy-1', 'sys-lane', 'faction-a', 1.0);
    for (let i = 0; i < 12; i++) {
        world.nowSeconds += 3600;
        tickPiracyOpportunity(world, 3600);
    }
    check('a pacified system loses the den', !lane.tags.includes('corsair_den'),
        `lawlessness ${lane.lawlessness}`);
}

// ─── 8. Emergence ────────────────────────────────────────────────────────────

console.log('\n[8] emergence');
{
    const world = juicyLaneWorld();
    // The per-tick chance is deliberately low, so run a season and look at where
    // the raiders actually landed rather than at a single lucky roll.
    for (let i = 0; i < 400; i++) {
        world.nowSeconds += 3600;
        const index = tickPiracyOpportunity(world, 3600);
        tickPiracyEmergence(world, index);
    }

    const log = ensurePiracyState(world).emergenceLog;
    const bySystem = new Map<string, number>();
    for (const record of log) bySystem.set(record.systemId, (bySystem.get(record.systemId) ?? 0) + 1);

    check('raiders eventually appear', log.length > 0, `${log.length} emergences`);
    check('the richest, weakest system draws the most',
        (bySystem.get('sys-lane') ?? 0) >= Math.max(...[...bySystem.values()]),
        [...bySystem].map(([k, v]) => `${k}=${v}`).join(' '));
    check('nothing emerges in the worthless void', !bySystem.has('sys-void'));
    check('nothing emerges at the defended capital', !bySystem.has('sys-core'));
    check('every raider belongs to a band',
        [...world.movement.fleets.values()]
            .filter(f => f.factionId === PIRATE_FACTION_ID)
            .every(f => !!f.organizationId));
    check('the log records why', !!log[0]?.dominantInput, log[0]?.dominantInput);
    check('the first band is not an absorption', log[0]?.absorbed === false);
    check('bands stay far fewer than emergences',
        activeOrganizations(world).length <= log.length, `${activeOrganizations(world).length} orgs`);
}

// ─── 8b. Absorption ──────────────────────────────────────────────────────────
// Emergence is rare by design, so waiting for a second lucky roll would leave
// the absorption path untested. Seed a band two hops out and force the roll.

console.log('\n[8b] absorption');
{
    const world = juicyLaneWorld();
    const band = foundOrganization(world, 'sys-b', [], 'frontier_desperation');
    addFleet(world, 'pirate-existing', 'sys-b', PIRATE_FACTION_ID, 0.5);
    band.fleetIds.push('pirate-existing');
    world.movement.fleets.get('pirate-existing')!.organizationId = band.id;

    for (let i = 0; i < 400 && ensurePiracyState(world).emergenceLog.length === 0; i++) {
        world.nowSeconds += 3600;
        const index = tickPiracyOpportunity(world, 3600);
        tickPiracyEmergence(world, index);
    }
    const record = ensurePiracyState(world).emergenceLog[0];

    check('a party emerged', !!record);
    check('the band already working the region absorbs it', record?.absorbed === true);
    check('no rival band was founded', activeOrganizations(world).length === 1,
        `${activeOrganizations(world).length} orgs`);
    check('the absorbing band grew', band.fleetIds.length === 2, `${band.fleetIds.length}`);

    // A band already carrying more than it can support does not take on more —
    // the newcomers strike out on their own rather than join a mutiny.
    const crowded = juicyLaneWorld();
    const full = foundOrganization(crowded, 'sys-b', [], 'frontier_desperation');
    for (let i = 0; i < 4; i++) {
        addFleet(crowded, `pirate-full-${i}`, 'sys-b', PIRATE_FACTION_ID, 0.5);
        full.fleetIds.push(`pirate-full-${i}`);
        crowded.movement.fleets.get(`pirate-full-${i}`)!.organizationId = full.id;
    }
    for (let i = 0; i < 400 && ensurePiracyState(crowded).emergenceLog.length === 0; i++) {
        crowded.nowSeconds += 3600;
        const index = tickPiracyOpportunity(crowded, 3600);
        tickPiracyEmergence(crowded, index);
    }
    check('an over-extended band does not absorb',
        ensurePiracyState(crowded).emergenceLog[0]?.absorbed === false);
    check('a rival band forms instead', activeOrganizations(crowded).length === 2,
        `${activeOrganizations(crowded).length} orgs`);
}

// ─── 9. Determinism ──────────────────────────────────────────────────────────

console.log('\n[9] determinism');
{
    const run = () => {
        const world = juicyLaneWorld();
        for (let i = 0; i < 120; i++) {
            world.nowSeconds += 3600;
            const index = tickPiracyOpportunity(world, 3600);
            tickPiracyEmergence(world, index);
        }
        return ensurePiracyState(world).emergenceLog
            .map(r => `${r.systemId}@${r.atSeconds}:${r.origin}`)
            .join('|');
    };
    const a = run();
    const b = run();
    check('the same galaxy grows the same pirates', a === b, `${a} vs ${b}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
