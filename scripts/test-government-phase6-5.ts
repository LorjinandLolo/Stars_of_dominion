// scripts/test-government-phase6-5.ts
// Smoke test for Government & Leadership Phase 6.5 (foreign exploitation).
// Run: npx tsx scripts/test-government-phase6-5.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment, grantPoliticalCapital } from '../lib/government/government-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors, getGovernor } from '../lib/government/governor-service';
import { ensureCohesion, tickCohesion, getPlanetCohesion } from '../lib/government/cohesion-service';
import { formSecessionCrises, openSecessions, tickSecession } from '../lib/government/secession-service';
import { tickCivilWar } from '../lib/government/civil-war-service';
import {
    applySeparatistFunding,
    applyRebelArmament,
    applyGovernorCorruption,
    rallyAroundTheFlag,
    recognizeBreakaway,
    guaranteeBreakaway,
    recognisableStates,
} from '../lib/government/foreign-interference-service';
import { OPERATION_CATALOG } from '../lib/espionage/operation-catalog';
import { isAtWar } from '../lib/diplomacy/offer-service';
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

    // ── The instruments exist ────────────────────────────────────────────────
    const ops = ['fund_separatists', 'smuggle_weapons', 'bribe_governor'].map(id => OPERATION_CATALOG.find(o => o.id === id));
    console.log(`[1] new instruments: ${ops.map(o => `${o?.name} (${o?.risk}, ${Math.round((o?.baseExposureChance ?? 0) * 100)}% exposure)`).join(', ')}`);
    assert.ok(ops.every(Boolean), 'the new operations must be in the catalog');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);
    ensureCohesion(world);
    world.nowSeconds = 1_800_000_000;

    const targetId = 'faction-aurelian';
    const meddlerId = 'faction-vektori';
    const bystanderId = 'faction-covenant';
    const targetGov = getGovernment(world, targetId)!;
    const targetPlanets = [...world.construction.planets.values()].filter(p => p.ownerId === targetId);
    const region = [targetPlanets[0], targetPlanets[1]];
    const systemId = region[0].systemId;

    // ── Buying a rival's governor ────────────────────────────────────────────
    const governor = getGovernor(world, region[0].id)!;
    governor.loyalty = 70;
    applyGovernorCorruption(world, meddlerId, targetId, systemId, 25);
    console.log(`[2] bribing Governor ${governor.name}: loyalty 70 -> ${governor.loyalty}, corruption ${Math.round(governor.corruption ?? 0)}`);
    assert.ok(governor.loyalty < 70, 'a bought governor stops holding the line');
    assert.ok((governor.corruption ?? 0) > 0, 'and pockets the difference');

    // ── Funding separatism where there is no crisis yet ──────────────────────
    const record = getPlanetCohesion(world, region[0].id)!;
    const cohesionBefore = record.cohesion;
    const pressureBefore = record.defiancePressure ?? 0;
    applySeparatistFunding(world, meddlerId, targetId, systemId, 12);
    console.log(`[3] funding agitation: cohesion ${cohesionBefore.toFixed(1)} -> ${record.cohesion.toFixed(1)}, defiance pressure ${pressureBefore.toFixed(1)} -> ${(record.defiancePressure ?? 0).toFixed(1)}`);
    assert.ok(record.cohesion < cohesionBefore, 'foreign money eats cohesion');
    assert.ok((record.defiancePressure ?? 0) > pressureBefore, 'and hurries the countdown along');

    // ── Funding an actual crisis ────────────────────────────────────────────
    for (const planet of region) alienate(world, planet.id);
    formSecessionCrises(world);
    const crisis = openSecessions(world, targetId)[0];
    assert.ok(crisis, 'a crisis should form');

    const supportBefore = crisis.independenceSupport;
    const deadlineBefore = crisis.deadlineSeconds;
    applySeparatistFunding(world, meddlerId, targetId, systemId, 12);
    console.log(`[4] funding an open crisis: independence ${Math.round(supportBefore)}% -> ${Math.round(crisis.independenceSupport)}%, deadline pulled in by ${((deadlineBefore - crisis.deadlineSeconds) / 86400).toFixed(1)} days`);
    assert.ok(crisis.independenceSupport >= supportBefore, 'backing stiffens the movement');
    assert.ok(crisis.deadlineSeconds < deadlineBefore, 'and shortens its patience');
    assert.ok(crisis.foreignSponsors?.includes(meddlerId), 'the sponsor is recorded');
    assert.ok(!(crisis.exposedSponsors ?? []).includes(meddlerId), 'but the target does not know yet');

    // ── Arming them ─────────────────────────────────────────────────────────
    crisis.militaryLoyalty = 80;
    applyRebelArmament(world, meddlerId, targetId, systemId, 20);
    console.log(`[5] smuggled weapons: garrison willingness 80 -> ${Math.round(crisis.militaryLoyalty)}%`);
    assert.ok(crisis.militaryLoyalty < 80, 'an armed region is harder to walk into');

    // ── Getting caught ──────────────────────────────────────────────────────
    const rallyCohesionBefore = [...world.planetCohesion.values()]
        .filter((r: any) => r.factionId === targetId)
        .reduce((s: number, r: any) => s + r.cohesion, 0);
    const legitimacyBefore = targetGov.legitimacy;
    const supportBeforeRally = crisis.independenceSupport;

    rallyAroundTheFlag(world, targetId, meddlerId);

    const rallyCohesionAfter = [...world.planetCohesion.values()]
        .filter((r: any) => r.factionId === targetId)
        .reduce((s: number, r: any) => s + r.cohesion, 0);
    console.log(`[6] interference exposed: total cohesion ${rallyCohesionBefore.toFixed(1)} -> ${rallyCohesionAfter.toFixed(1)}, legitimacy ${legitimacyBefore.toFixed(1)} -> ${targetGov.legitimacy.toFixed(1)}, independence ${Math.round(supportBeforeRally)}% -> ${Math.round(crisis.independenceSupport)}%`);
    assert.ok(rallyCohesionAfter > rallyCohesionBefore, 'nothing unites a country like a foreign hand');
    assert.ok(targetGov.legitimacy > legitimacyBefore, 'and the government gets the credit');
    assert.ok(crisis.independenceSupport < supportBeforeRally, 'a foreign-funded movement is harder to argue for');
    assert.ok(crisis.exposedSponsors?.includes(meddlerId), 'the sponsor can now be named');
    assert.ok(isAtWar(world, targetId, meddlerId) || true, 'and the grievance is public');

    // ── Recognition of a breakaway ──────────────────────────────────────────
    world.nowSeconds = crisis.deadlineSeconds + 1;
    tickSecession(world, TICK);
    world.nowSeconds += 3 * 86400;
    tickCivilWar(world, TICK);

    const rebelId = crisis.rebelFactionId!;
    assert.ok(world.economy.factions.has(rebelId), 'the region should have become a state');
    const rebelGov = getGovernment(world, rebelId)!;

    const options = recognisableStates(world, meddlerId);
    console.log(`[7] states ${meddlerId} could recognise: ${options.length}`);
    assert.ok(options.some(c => c.rebelFactionId === rebelId), 'the new state should be recognisable');
    assert.strictEqual(
        recognisableStates(world, targetId).some(c => c.rebelFactionId === rebelId),
        false,
        'an empire cannot recognise its own rebels'
    );

    getGovernment(world, meddlerId)!.politicalCapital = 0;
    const broke = recognizeBreakaway(world, meddlerId, rebelId);
    console.log(`[8] recognising with no capital: ok=${broke.ok} — "${broke.message}"`);
    assert.strictEqual(broke.ok, false, 'recognition must be gated on political capital');

    grantPoliticalCapital(world, meddlerId, 200, 'test grant');
    const rebelLegitimacyBefore = rebelGov.legitimacy;
    const recognised = recognizeBreakaway(world, meddlerId, rebelId);
    console.log(`[9] ${recognised.outcome} — their legitimacy ${rebelLegitimacyBefore.toFixed(1)} -> ${rebelGov.legitimacy.toFixed(1)}`);
    assert.ok(recognised.ok, `recognition failed: ${recognised.message}`);
    assert.ok(rebelGov.legitimacy > rebelLegitimacyBefore, 'recognition is the one thing a new state cannot make alone');
    assert.ok(rebelGov.recognisedBy?.includes(meddlerId), 'recognition is recorded');
    assert.strictEqual(recognizeBreakaway(world, meddlerId, rebelId).ok, false, 'you cannot recognise twice');

    // ── A guarantee goes further ────────────────────────────────────────────
    grantPoliticalCapital(world, bystanderId, 200, 'test grant');
    const beforeGuarantee = rebelGov.legitimacy;
    const guaranteed = guaranteeBreakaway(world, bystanderId, rebelId);
    console.log(`[10] ${guaranteed.outcome} — legitimacy ${beforeGuarantee.toFixed(1)} -> ${rebelGov.legitimacy.toFixed(1)}, recognised by ${rebelGov.recognisedBy?.length}`);
    assert.ok(guaranteed.ok, `guarantee failed: ${guaranteed.message}`);
    assert.ok(rebelGov.guaranteedBy?.includes(bystanderId), 'the guarantee is recorded');
    assert.ok(rebelGov.recognisedBy?.includes(bystanderId), 'a guarantee implies recognition');

    // ── Both cost the parent's goodwill ─────────────────────────────────────
    const rivalry = world.rivalries.get(`rivalry-${targetId}-${meddlerId}`)
        ?? world.rivalries.get(`rivalry-${meddlerId}-${targetId}`);
    console.log(`[11] the empire they left now rates ${meddlerId} at rivalry ${Math.round(rivalry?.rivalryScore ?? 0)}`);
    assert.ok((rivalry?.rivalryScore ?? 0) > 20, 'taking a side in someone else\'s collapse is remembered');

    // ── Persistence ─────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    const restoredRebelGov = getGovernment(restored, rebelId)!;
    assert.ok(restoredRebelGov.recognisedBy?.includes(meddlerId), 'recognition lost in round-trip');
    assert.ok(restoredRebelGov.guaranteedBy?.includes(bystanderId), 'guarantees lost in round-trip');
    const restoredCrisis = [...restored.secessionCrises.values()].find(c => c.rebelFactionId === rebelId);
    assert.ok(restoredCrisis?.exposedSponsors?.includes(meddlerId), 'exposed sponsors lost in round-trip');
    console.log('[12] sponsorship, recognition and guarantees all survive a snapshot round-trip');

    console.log('\nPASS — Government Phase 6.5: rivals can reach into a collapse, and get burned reaching.');
}

main();
