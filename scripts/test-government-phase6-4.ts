// scripts/test-government-phase6-4.ts
// Smoke test for Government & Leadership Phase 6.4 (civil war / faction fission).
// Run: npx tsx scripts/test-government-phase6-4.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment } from '../lib/government/government-service';
import { ensureHeadsOfState, getHeadOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors, getGovernor } from '../lib/government/governor-service';
import { ensureCohesion, tickCohesion, getPlanetCohesion } from '../lib/government/cohesion-service';
import { formSecessionCrises, openSecessions, tickSecession } from '../lib/government/secession-service';
import { tickCivilWar, fissionEmpire, breakawayStatesOf } from '../lib/government/civil-war-service';
import { isAtWar } from '../lib/diplomacy/offer-service';
import { Resource } from '../lib/trade-system/types';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;

function alienate(world: any, planetId: string) {
    const planet = world.construction.planets.get(planetId);
    planet.unrest = 98;
    planet.stability = 3;
    planet.happiness = 8;
    const governor = getGovernor(world, planetId);
    if (governor) governor.loyalty = 2;
    tickCohesion(world, TICK);
    const record = getPlanetCohesion(world, planetId)!;
    record.cohesion = 4;
    return record;
}

function main() {
    initRegistries();

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);
    ensureCohesion(world);
    world.nowSeconds = 1_800_000_000;

    const parentId = 'faction-aurelian';
    const parentGov = getGovernment(world, parentId)!;
    const parentEconomy = world.economy.factions.get(parentId)!;
    const parentPlanets = [...world.construction.planets.values()].filter(p => p.ownerId === parentId);
    assert.ok(parentPlanets.length >= 3, 'need worlds to lose');

    // Give the region a fleet to defect with.
    const seceding = [parentPlanets[0], parentPlanets[1]];
    const regionSystem = seceding[0].systemId;
    const fleetId = 'test-fleet-loyalist';
    world.movement.fleets.set(fleetId, {
        id: fleetId,
        name: 'Border Squadron',
        factionId: parentId,
        currentSystemId: regionSystem,
        destinationSystemId: null,
        plannedPath: [],
        transitProgress: 0,
        strength: 1,
        orders: [],
        etaSeconds: 0,
        activeLayer: null,
        isDetectable: true,
        postureId: 'Consolidating',
        doctrine: { type: 'Balanced', deviationFromPosture: 0, preferredLayers: [], retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1 },
        basePower: 100,
        composition: { interceptor: 2 },
        hyperdriveProfile: {} as any,
    } as any);

    // ── Drive the region all the way to open revolt ──────────────────────────
    for (const planet of seceding) alienate(world, planet.id);
    formSecessionCrises(world);
    const crisis = openSecessions(world, parentId)[0];
    assert.ok(crisis, 'a secession crisis should form');

    world.nowSeconds = crisis.deadlineSeconds + 1;
    tickSecession(world, TICK);
    assert.strictEqual(crisis.status, 'escalated', 'an unanswered crisis escalates');
    console.log(`[1] ${crisis.name} escalated — breakaway will be ${crisis.rebelFactionId}`);

    // ── The grace period is the last chance to end it ────────────────────────
    tickCivilWar(world, TICK);
    console.log(`[2] inside the grace window: state created? ${world.economy.factions.has(crisis.rebelFactionId!)}`);
    assert.ok(!world.economy.factions.has(crisis.rebelFactionId!), 'fission should wait out the grace period');

    // ── Fission ──────────────────────────────────────────────────────────────
    const treasuryBefore = (parentEconomy.reserves as any)[Resource.CREDITS];
    const parentWorldsBefore = [...world.construction.planets.values()].filter(p => p.ownerId === parentId).length;
    const legitimacyBefore = parentGov.legitimacy;

    world.nowSeconds += 3 * 86400;
    tickCivilWar(world, TICK);

    const rebelId = crisis.rebelFactionId!;
    const rebel = world.economy.factions.get(rebelId);
    assert.ok(rebel, 'the breakaway state should exist');
    console.log(`[3] "${rebel!.name}" founded — capital ${rebel!.capitalSystemId}, treasury ${Math.round((rebel!.reserves as any)[Resource.CREDITS])}`);

    // Territory actually moved.
    const rebelWorlds = [...world.construction.planets.values()].filter(p => p.ownerId === rebelId);
    const parentWorldsAfter = [...world.construction.planets.values()].filter(p => p.ownerId === parentId).length;
    console.log(`[4] territory: parent ${parentWorldsBefore} -> ${parentWorldsAfter} worlds, breakaway holds ${rebelWorlds.length}`);
    assert.strictEqual(rebelWorlds.length, seceding.length, 'the region should have changed hands');
    assert.strictEqual(parentWorldsAfter, parentWorldsBefore - seceding.length, 'the parent should have lost exactly those worlds');
    for (const planet of seceding) {
        assert.strictEqual(world.economy.planets.get(planet.id)?.factionId ?? rebelId, rebelId, 'the economy copy of ownership must move too');
    }

    // Treasury split by population, not evenly.
    const treasuryAfter = (parentEconomy.reserves as any)[Resource.CREDITS];
    console.log(`[5] treasury split: parent ${Math.round(treasuryBefore)} -> ${Math.round(treasuryAfter)}, breakaway took ${Math.round((rebel!.reserves as any)[Resource.CREDITS])}`);
    assert.ok(treasuryAfter < treasuryBefore, 'the breakaway takes its share');
    assert.ok((rebel!.reserves as any)[Resource.CREDITS] > 0, 'a new state needs money');

    // Forces stationed in the region change sides.
    const defected = world.movement.fleets.get(fleetId)!;
    console.log(`[6] the Border Squadron now flies for ${defected.factionId === rebelId ? 'the breakaway' : 'the empire'}`);
    assert.strictEqual(defected.factionId, rebelId, 'fleets in the region should defect');

    // ── It is a real state, not a rebel stack ───────────────────────────────
    const rebelGov = getGovernment(world, rebelId);
    const rebelHead = getHeadOfState(world, rebelId);
    const rebelPosture = world.movement.empirePostures.get(rebelId);
    console.log(`[7] ${rebelGov!.institutionName} under ${rebelHead!.title} ${rebelHead!.name} — approval ${rebelGov!.approval}, legitimacy ${rebelGov!.legitimacy}, cohesion ${rebelGov!.cohesion}`);
    assert.ok(rebelGov, 'the breakaway needs a government');
    assert.ok(rebelHead, 'the breakaway needs a head of state');
    assert.strictEqual(rebelHead!.factionId, rebelId, 'its leader belongs to it');
    assert.ok(rebelPosture, 'the breakaway needs a political posture');
    assert.ok(rebelPosture!.blocs.length > 0, 'and interest groups of its own');

    // The governor who led the revolt is the one who now runs the country.
    if (crisis.leaderId) {
        assert.strictEqual(rebelHead!.id, crisis.leaderId, 'the leader of the revolt should lead the state');
        console.log(`[8] ${rebelHead!.name} led the revolt and now leads the state`);
    }

    // It is less centralist than what it left.
    const parentPosture = world.movement.empirePostures.get(parentId)!;
    console.log(`[9] centralisation: parent ${Math.round(parentPosture.ideology.centralization_autonomy)}, breakaway ${Math.round(rebelPosture!.ideology.centralization_autonomy)}`);
    assert.ok(
        rebelPosture!.ideology.centralization_autonomy < parentPosture.ideology.centralization_autonomy,
        'an independence movement is less centralist than the state it left'
    );

    // ── And it is at war ────────────────────────────────────────────────────
    console.log(`[10] at war with the empire it left: ${isAtWar(world, parentId, rebelId)}`);
    assert.ok(isAtWar(world, parentId, rebelId), 'fission means civil war');

    // ── The worlds that left are content; the ones that stayed are shaken ────
    const rebelCohesion = getPlanetCohesion(world, seceding[0].id)!;
    console.log(`[11] the seceded world reads cohesion ${Math.round(rebelCohesion.cohesion)} under its new flag, and legitimacy of the old capital fell ${legitimacyBefore.toFixed(0)} -> ${parentGov.legitimacy.toFixed(0)}`);
    assert.strictEqual(rebelCohesion.factionId, rebelId, 'cohesion records follow the territory');
    assert.ok(rebelCohesion.cohesion > 60, 'a world that got what it wanted is cohesive');
    assert.ok(parentGov.legitimacy < legitimacyBefore, 'losing half your empire costs legitimacy');

    // ── Collapse is not game over ───────────────────────────────────────────
    assert.ok(parentWorldsAfter > 0, 'the parent keeps playing');
    assert.ok(getGovernment(world, parentId), 'the parent still has a government');
    assert.deepStrictEqual(breakawayStatesOf(world, parentId), [rebelId], 'the parent can see what broke away');
    console.log(`[12] the empire plays on with ${parentWorldsAfter} worlds and one rival made of its own territory`);

    // ── Idempotence ─────────────────────────────────────────────────────────
    const factionCount = world.economy.factions.size;
    tickCivilWar(world, TICK);
    assert.strictEqual(world.economy.factions.size, factionCount, 'a state cannot secede twice');
    assert.strictEqual(fissionEmpire(world, crisis.id).ok, false, 'refission must be refused');

    // ── Persistence ─────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    assert.ok(restored.economy.factions.get(rebelId), 'the breakaway state lost in round-trip');
    assert.ok(getGovernment(restored, rebelId), 'its government lost in round-trip');
    assert.strictEqual(
        [...restored.construction.planets.values()].filter(p => p.ownerId === rebelId).length,
        seceding.length,
        'its territory lost in round-trip'
    );
    console.log('[13] the new state survives a snapshot round-trip');

    console.log('\nPASS — Government Phase 6.4: empires split into real states, and the loser keeps playing.');
}

main();
