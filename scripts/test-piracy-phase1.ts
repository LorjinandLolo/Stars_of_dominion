// scripts/test-piracy-phase1.ts
// Pirate system Phase 1 verification — the organization entity, its metrics,
// its stages, and the adoption pass that gives existing raiders an owner.
// Run: npx tsx scripts/test-piracy-phase1.ts

import type { GameWorldState } from '../lib/game-world-state';
import type { Fleet, SystemNode } from '../lib/movement/types';
import {
    activeOrganizations,
    adoptOrphanRaiders,
    eligibleStage,
    ensurePiracyState,
    foundOrganization,
    recordRaid,
    tickPirateMetrics,
    tickPirateOrganizations,
    PIRATE_FACTION_ID,
} from '../lib/piracy/organization-service';
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
// The organization service reads only the movement fleets/systems, the sim
// clock and its own aggregate, so a partial world is the honest fixture here.

function makeSystem(id: string, neighbours: string[]): SystemNode {
    return {
        id, name: id, q: 0, r: 0, tags: [],
        tagReveal: { allTags: [], revealedAt: {} },
        hyperlaneNeighbors: neighbours,
        tradeSegmentIds: [], corridorIds: [],
        instability: 0, escalationLevel: 0,
    };
}

function makeRaider(id: string, systemId: string, strength = 0.5): Fleet {
    return {
        id, factionId: PIRATE_FACTION_ID, name: 'Raider',
        currentSystemId: systemId, destinationSystemId: null,
        activeLayer: null, transitProgress: 0, etaSeconds: 0, plannedPath: [],
        orders: [],
        doctrine: {
            type: 'Raider', deviationFromPosture: 0, preferredLayers: ['hyperlane'],
            retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1,
        },
        postureId: 'Expansionist', strength, basePower: 100, composition: {},
        hyperdriveProfile: {} as never, isDetectable: true,
    };
}

function makeWorld(nowSeconds = 3600): GameWorldState {
    const systems = new Map<string, SystemNode>([
        ['sys-alpha', makeSystem('sys-alpha', ['sys-beta'])],
        ['sys-beta', makeSystem('sys-beta', ['sys-alpha'])],
        ['sys-far', makeSystem('sys-far', [])],
    ]);
    return {
        nowSeconds,
        movement: { systems, fleets: new Map<string, Fleet>() },
        piracy: { organizations: new Map() },
    } as unknown as GameWorldState;
}

function addRaider(world: GameWorldState, id: string, systemId: string): Fleet {
    const fleet = makeRaider(id, systemId);
    world.movement.fleets.set(id, fleet);
    return fleet;
}

/** Drive the organization pass n times without waiting on a real clock. */
function runTicks(world: GameWorldState, n: number, deltaSeconds = 3600) {
    for (let i = 0; i < n; i++) {
        world.nowSeconds += deltaSeconds;
        tickPirateMetrics(world, deltaSeconds);
        tickPirateOrganizations(world, deltaSeconds);
    }
}

// ─── 1. Adoption ─────────────────────────────────────────────────────────────

console.log('\n[1] adoption');
{
    const world = makeWorld();
    addRaider(world, 'pirate-1', 'sys-alpha');
    adoptOrphanRaiders(world);

    const orgs = activeOrganizations(world);
    check('an unaffiliated raider founds a band', orgs.length === 1, `${orgs.length} orgs`);
    check('the fleet is bound to it', world.movement.fleets.get('pirate-1')!.organizationId === orgs[0].id);
    check('the band has a name', !!orgs[0].name && orgs[0].name.length > 3, orgs[0]?.name);
    check('the band has a leader', orgs[0].leader !== null);
    check('it starts as a Stage I gang', orgs[0].stage === 1);

    addRaider(world, 'pirate-2', 'sys-alpha');
    adoptOrphanRaiders(world);
    check('a second raider in the same system joins rather than splits',
        activeOrganizations(world).length === 1, `${activeOrganizations(world).length} orgs`);
    check('membership grew', activeOrganizations(world)[0].fleetIds.length === 2);

    addRaider(world, 'pirate-3', 'sys-beta');
    adoptOrphanRaiders(world);
    check('a raider one hop away joins the neighbouring band',
        activeOrganizations(world).length === 1, `${activeOrganizations(world).length} orgs`);

    addRaider(world, 'pirate-4', 'sys-far');
    adoptOrphanRaiders(world);
    check('a raider with no band in reach founds its own',
        activeOrganizations(world).length === 2, `${activeOrganizations(world).length} orgs`);
}

// ─── 2. Losses reconcile ─────────────────────────────────────────────────────

console.log('\n[2] fleet losses');
{
    const world = makeWorld();
    addRaider(world, 'pirate-1', 'sys-alpha');
    addRaider(world, 'pirate-2', 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];
    const loyaltyBefore = org.crewLoyalty;

    world.movement.fleets.delete('pirate-2');   // suppressed, as tickPiracy does
    adoptOrphanRaiders(world);

    check('a destroyed raider leaves the roster', org.fleetIds.length === 1, `${org.fleetIds.length}`);
    check('the loss is counted', org.fleetsLost === 1);
    check('losing ships costs crew loyalty', org.crewLoyalty < loyaltyBefore, `${org.crewLoyalty}`);
}

// ─── 3. Raid accounting ──────────────────────────────────────────────────────

console.log('\n[3] raid accounting');
{
    const world = makeWorld();
    addRaider(world, 'pirate-1', 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];

    recordRaid(world, org.id, { valueLost: 3600, victimFactionId: 'faction-a' });

    check('loot lands in the treasury', org.treasury === 3600, `${org.treasury}`);
    check('the raid is counted', org.raidsLanded === 1);
    check('infamy rises with the take', org.infamy > 0, `${org.infamy}`);
    check('infamy is capped per raid', org.infamy <= 2, `${org.infamy}`);
    check('heat rises', org.heat > 0, `${org.heat}`);
    check('the victim specifically wants them dead',
        (org.heatByFaction['faction-a'] ?? 0) > 0, JSON.stringify(org.heatByFaction));
    check('bystanders do not', org.heatByFaction['faction-b'] === undefined);
}

// ─── 4. Decay ────────────────────────────────────────────────────────────────

console.log('\n[4] metric decay');
{
    const world = makeWorld();
    addRaider(world, 'pirate-1', 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];
    org.infamy = 50;
    org.heat = 50;
    org.heatByFaction = { 'faction-a': 50 };

    // Just raided: heat cools at the base rate.
    org.lastRaidAtSeconds = world.nowSeconds;
    tickPirateMetrics(world, 3600);
    const hotHeat = org.heat;
    check('infamy decays', org.infamy < 50, `${org.infamy}`);
    check('heat cools while active', hotHeat < 50, `${hotHeat}`);

    // Lying low: heat cools much faster.
    org.heat = 50;
    org.lastRaidAtSeconds = world.nowSeconds - 24 * 3600;
    tickPirateMetrics(world, 3600);
    check('heat cools faster once the raids stop', org.heat < hotHeat, `${org.heat} vs ${hotHeat}`);
    check('per-faction heat cools too', (org.heatByFaction['faction-a'] ?? 0) < 50);
}

// ─── 5. Stages ───────────────────────────────────────────────────────────────

console.log('\n[5] stage gates');
{
    const world = makeWorld();
    for (let i = 1; i <= 3; i++) addRaider(world, `pirate-${i}`, 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];

    org.infamy = 5;
    check('three ships alone is still a gang', eligibleStage(org) === 1, `${eligibleStage(org)}`);

    org.infamy = 20;
    check('three ships and a reputation is a fleet', eligibleStage(org) === 2, `${eligibleStage(org)}`);

    runTicks(world, 1);
    check('promotion lands on the next pass', org.stage === 2, `${org.stage}`);

    // Stage III wants bases, which do not exist until Phase 3 — a corsair
    // network cannot be reached by infamy and contacts alone.
    org.infamy = 90;
    org.relations['faction-a'] = {
        factionId: 'faction-a', standing: 40, agreements: [], lastContactTick: 0, secret: false,
    };
    check('Stage III is gated on a base network', eligibleStage(org) === 2, `${eligibleStage(org)}`);
}

// ─── 6. Demotion is not instant ──────────────────────────────────────────────

console.log('\n[6] demotion');
{
    const world = makeWorld();
    for (let i = 1; i <= 3; i++) addRaider(world, `pirate-${i}`, 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];
    org.infamy = 40;
    runTicks(world, 1);
    check('starts at Stage II', org.stage === 2, `${org.stage}`);

    world.movement.fleets.delete('pirate-3');   // now below the 3-ship gate
    runTicks(world, 1);
    org.infamy = 40;                            // hold infamy above the gate
    check('one bad tick does not demote', org.stage === 2, `${org.stage}`);

    runTicks(world, 2);
    check('three consecutive ticks below the gate does', org.stage === 1, `${org.stage}`);
}

// ─── 7. Internal drift ───────────────────────────────────────────────────────

console.log('\n[7] internal politics');
{
    const world = makeWorld();
    addRaider(world, 'pirate-1', 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];

    for (let i = 0; i < 20; i++) recordRaid(world, org.id, { valueLost: 2000, victimFactionId: 'faction-a' });
    runTicks(world, 15);

    const sum = org.factions.reduce((acc, f) => acc + f.pressure, 0);
    check('pressure shares stay normalized', Math.abs(sum - 100) < 1e-6, `${sum}`);

    const raiders = org.factions.find(f => f.doctrine === 'raider')!;
    check('a band that lives on raiding is run by raiders',
        org.doctrine === 'raider', `${org.doctrine} (raider pressure ${raiders.pressure.toFixed(1)})`);
    check('the raider wing is content', raiders.satisfaction > 50, `${raiders.satisfaction}`);
}

// ─── 8. Dissolution ──────────────────────────────────────────────────────────

console.log('\n[8] dissolution');
{
    const world = makeWorld();
    addRaider(world, 'pirate-1', 'sys-alpha');
    adoptOrphanRaiders(world);
    const org = activeOrganizations(world)[0];

    world.movement.fleets.delete('pirate-1');
    runTicks(world, 1);
    check('no ships and no money ends the band', !!org.dissolvedAtSeconds);
    check('it stops counting as active', activeOrganizations(world).length === 0);
    check('it is still nameable for now', ensurePiracyState(world).organizations.has(org.id));

    runTicks(world, 60);
    check('it is forgotten after the grace window', !ensurePiracyState(world).organizations.has(org.id));
}

// ─── 9. Determinism ──────────────────────────────────────────────────────────

console.log('\n[9] determinism');
{
    const build = (): PirateOrganization => {
        const world = makeWorld(7200);
        return foundOrganization(world, 'sys-alpha', []);
    };
    const a = build();
    const b = build();
    check('the same clock founds the same band', a.name === b.name, `${a.name} vs ${b.name}`);
    check('with the same captain', a.leader?.name === b.leader?.name, `${a.leader?.name} vs ${b.leader?.name}`);
    check('and the same competence', a.leader?.competence === b.leader?.competence);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
