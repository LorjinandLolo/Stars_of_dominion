// scripts/test-government-phase4.ts
// Smoke test for Government & Leadership Phase 4 (parliament, elections, coups).
// Run: npx tsx scripts/test-government-phase4.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries, governmentRegistry } from '../lib/politics/registry';
import { ensureGovernments, getGovernment, grantPoliticalCapital } from '../lib/government/government-service';
import { ensureHeadsOfState, getHeadOfState } from '../lib/government/succession-service';
import { ensureCabinets, getMinister } from '../lib/government/cabinet-service';
import { ensureGovernors } from '../lib/government/governor-service';
import { enactPolicy } from '../lib/government/policy-service';
import {
    hasParliament,
    isElected,
    computeParties,
    projectSupport,
    lobbyParty,
    resolveBill,
    decreePolicy,
    tickParliament,
    holdElection,
    LOBBY_PARTY_COST,
} from '../lib/government/parliament-service';
import {
    assessCoupRisk,
    tickCoups,
    attemptCoup,
    purgeOfficers,
    COUP_ATTEMPT_THRESHOLD,
} from '../lib/government/coup-service';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;
const DAY = 4 * TICK;

function main() {
    initRegistries();
    assert.ok(governmentRegistry.get('military_junta'), 'military_junta profile missing');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);

    const democrat = 'faction-vektori';    // vektori_senate: senate 90, exec 10
    const autocrat = 'faction-aurelian';   // aurelian_autocracy: senate 0, exec 100
    const demGov = getGovernment(world, democrat)!;
    const autGov = getGovernment(world, autocrat)!;

    // ── Which governments legislate ──────────────────────────────────────────
    console.log(`[1] ${demGov.institutionName}: senate ${demGov.senatePower}, parliament=${hasParliament(demGov)}, elected=${isElected(demGov)} | ${autGov.institutionName}: senate ${autGov.senatePower}, parliament=${hasParliament(autGov)}`);
    assert.strictEqual(hasParliament(demGov), true, 'a senate government must legislate');
    assert.strictEqual(hasParliament(autGov), false, 'an autocracy answers to no chamber');

    // ── Chamber composition tracks the blocs ─────────────────────────────────
    demGov.parties = computeParties(world, democrat);
    const seatTotal = demGov.parties.reduce((s, p) => s + p.seats, 0);
    console.log(`[2] chamber: ${demGov.parties.length} parties, ${seatTotal.toFixed(1)}% seats total — ${demGov.parties.map(p => `${p.name} ${p.seats.toFixed(0)}%`).join(', ')}`);
    assert.ok(Math.abs(seatTotal - 100) < 0.01, 'seats must sum to 100');
    assert.strictEqual(demGov.parties.length, world.movement.empirePostures.get(democrat)!.blocs.length, 'every bloc should hold seats');

    // ── A hostile chamber rejects a bill ─────────────────────────────────────
    grantPoliticalCapital(world, democrat, 200, 'test grant');
    for (const bloc of world.movement.empirePostures.get(democrat)!.blocs) bloc.satisfaction = 10;
    demGov.approval = 20;
    demGov.parties = computeParties(world, democrat);

    const proposal = enactPolicy(world, democrat, 'militarize');
    assert.ok(proposal.ok && proposal.tabled, 'the bill should have been tabled, not enacted');
    assert.ok(!demGov.activePolicies.includes('militarize'), 'a tabled bill must not take effect yet');
    const hostileBill = demGov.bills.find(b => b.policyId === 'militarize' && b.status === 'pending')!;
    console.log(`[3] tabled "${hostileBill.policyName}" before a hostile chamber: ${Math.round(hostileBill.projectedSupport)}% projected`);
    assert.ok(hostileBill.projectedSupport < 50, 'an angry chamber should not back this');

    // ── Lobbying swings votes ────────────────────────────────────────────────
    const supportBefore = projectSupport(world, demGov, hostileBill);
    const capitalBefore = demGov.politicalCapital;
    const target = demGov.parties.reduce((a, b) => (a.seats > b.seats ? a : b));
    const lobbied = lobbyParty(world, democrat, hostileBill.id, target.id);
    assert.ok(lobbied.ok, `lobbying failed: ${lobbied.message}`);
    console.log(`[4] whipped ${target.name} (${target.seats.toFixed(0)}% of seats): support ${Math.round(supportBefore)}% -> ${Math.round(lobbied.projectedSupport ?? 0)}%, capital ${capitalBefore.toFixed(0)} -> ${demGov.politicalCapital.toFixed(0)}`);
    assert.ok((lobbied.projectedSupport ?? 0) > supportBefore, 'lobbying should move the count');
    assert.strictEqual(Math.round(capitalBefore - demGov.politicalCapital), LOBBY_PARTY_COST, 'lobbying should cost capital');
    assert.strictEqual(lobbyParty(world, democrat, hostileBill.id, target.id).ok, false, 'a party cannot be whipped twice on one bill');

    // ── The vote resolves ────────────────────────────────────────────────────
    const legitimacyBefore = demGov.legitimacy;
    resolveBill(world, demGov, hostileBill);
    console.log(`[5] division: ${hostileBill.status} at ${Math.round(hostileBill.projectedSupport)}%, legitimacy ${legitimacyBefore.toFixed(1)} -> ${demGov.legitimacy.toFixed(1)}`);
    assert.strictEqual(hostileBill.status, 'failed', 'the chamber should have defeated this');
    assert.ok(demGov.legitimacy < legitimacyBefore, 'losing a division should cost legitimacy');
    assert.ok(!demGov.activePolicies.includes('militarize'), 'a defeated bill must not take effect');

    // ── A friendly chamber passes one ────────────────────────────────────────
    for (const bloc of world.movement.empirePostures.get(democrat)!.blocs) bloc.satisfaction = 85;
    demGov.approval = 70;
    demGov.parties = computeParties(world, democrat);
    const welfare = enactPolicy(world, democrat, 'welfare_expansion');
    assert.ok(welfare.tabled, 'should be tabled');
    const friendlyBill = demGov.bills.find(b => b.policyId === 'welfare_expansion' && b.status === 'pending')!;
    friendlyBill.resolvesAtSeconds = world.nowSeconds - 1; // debate is over
    tickParliament(world, TICK);
    console.log(`[6] friendly chamber: ${friendlyBill.status} at ${Math.round(friendlyBill.projectedSupport)}%`);
    assert.strictEqual(friendlyBill.status, 'passed', 'a supportive chamber should pass welfare');
    assert.ok(demGov.activePolicies.includes('welfare_expansion'), 'a passed bill must take effect');

    // ── Decree bypasses the chamber, at a price ──────────────────────────────
    grantPoliticalCapital(world, democrat, 200, 'test grant');
    const decreeLegitimacy = demGov.legitimacy;
    const decreePressure = demGov.coupPressure;
    const decree = decreePolicy(world, democrat, 'research_push');
    console.log(`[7] decree: ok=${decree.ok} cost=${decree.cost}, legitimacy ${decreeLegitimacy.toFixed(1)} -> ${demGov.legitimacy.toFixed(1)}, coup pressure ${decreePressure.toFixed(1)} -> ${demGov.coupPressure.toFixed(1)}`);
    assert.ok(decree.ok, `decree failed: ${decree.message}`);
    assert.ok(demGov.activePolicies.includes('research_push'), 'a decree should take effect at once');
    assert.ok(demGov.legitimacy < decreeLegitimacy, 'ruling past the chamber should cost legitimacy');
    assert.ok(demGov.coupPressure > decreePressure, 'sidelining institutions should worry the officers');

    // ── Elections ────────────────────────────────────────────────────────────
    const incumbent = getHeadOfState(world, democrat)!;
    demGov.approval = 95;
    demGov.legitimacy = 95;
    incumbent.popularity = 95;
    const won = holdElection(world, demGov, incumbent);
    console.log(`[8] popular incumbent ${incumbent.name} re-elected: ${won}`);
    assert.strictEqual(won, true, 'a government at 95% approval should win');
    assert.strictEqual(getHeadOfState(world, democrat)!.id, incumbent.id, 're-election should keep the incumbent');
    assert.ok((demGov.termEndsAtSeconds ?? 0) > world.nowSeconds, 'a new term should be set');

    demGov.approval = 5;
    demGov.legitimacy = 10;
    const loser = getHeadOfState(world, democrat)!;
    loser.popularity = 5;
    const survived = holdElection(world, demGov, loser);
    const afterElection = getHeadOfState(world, democrat)!;
    console.log(`[9] despised incumbent survived: ${survived}; office now held by ${afterElection.title} ${afterElection.name}`);
    assert.strictEqual(survived, false, 'a government at 5% approval should lose');
    assert.notStrictEqual(afterElection.id, loser.id, 'the loser should have left office');
    assert.strictEqual(world.leadership.leaders.get(loser.id)!.departureCause, 'election_defeat');

    // ── Coup pressure builds from real causes ────────────────────────────────
    const military = world.movement.empirePostures.get(autocrat)!.blocs.find(b => b.id === 'military')!;
    military.satisfaction = 5;
    military.influence = 40;
    autGov.legitimacy = 15;
    autGov.corruption = 80;
    const defence = getMinister(world, autocrat, 'defence')!;
    defence.loyalty = 5;
    defence.ambitionDrive = 95;

    const risk = assessCoupRisk(world, autocrat);
    console.log(`[10] coup drivers: ${risk.drivers.join(' | ')} (trend ${risk.trendPerDay.toFixed(2)}/day)`);
    assert.ok(risk.trendPerDay > 0, 'these conditions should build pressure');
    assert.ok(risk.drivers.length >= 3, 'the player should be able to read why');

    autGov.coupPressure = 0;
    tickCoups(world, DAY * 5);
    console.log(`[11] pressure after 5 days: ${autGov.coupPressure.toFixed(1)}`);
    assert.ok(autGov.coupPressure > 0, 'pressure did not accumulate');

    // A healthy government cools off instead.
    const calm = getGovernment(world, 'faction-covenant')!;
    const calmMilitary = world.movement.empirePostures.get('faction-covenant')!.blocs.find(b => b.id === 'military')!;
    calmMilitary.satisfaction = 85;
    calm.legitimacy = 85;
    calm.corruption = 5;
    calm.coupPressure = 40;
    tickCoups(world, DAY * 5);
    console.log(`[12] contented empire pressure: 40 -> ${calm.coupPressure.toFixed(1)}`);
    assert.ok(calm.coupPressure < 40, 'a legitimate government with a happy army should cool off');

    // ── Purge buys pressure down ─────────────────────────────────────────────
    grantPoliticalCapital(world, autocrat, 100, 'test grant');
    autGov.coupPressure = 70;
    const purge = purgeOfficers(world, autocrat);
    console.log(`[13] purge: ok=${purge.ok}, pressure 70 -> ${autGov.coupPressure.toFixed(1)}, military satisfaction now ${military.satisfaction.toFixed(1)}`);
    assert.ok(purge.ok, `purge failed: ${purge.message}`);
    assert.ok(autGov.coupPressure < 70, 'a purge should reduce pressure');

    // ── A coup that succeeds rewrites the state ──────────────────────────────
    const beforeLeader = getHeadOfState(world, autocrat)!;
    autGov.coupPressure = 100;
    autGov.legitimacy = 5;
    beforeLeader.politicalSkill = 0;
    defence.loyalty = 0;

    let outcome = attemptCoup(world, autGov);
    // The roll is seeded on the sim clock; advance it until the plot lands so the
    // test exercises the success path deterministically.
    let guard = 0;
    while (!outcome.succeeded && guard++ < 50) {
        world.nowSeconds += 3600;
        autGov.coupPressure = 100;
        outcome = attemptCoup(world, autGov);
    }
    assert.ok(outcome.succeeded, 'a maximally pressured government should eventually fall');
    console.log(`[14] coup: ${outcome.message}`);
    assert.strictEqual(autGov.governmentId, 'military_junta', 'the junta should have taken over');
    assert.strictEqual(autGov.institutionName, 'Supreme Command Council');
    assert.strictEqual(autGov.senatePower, 0, 'a junta answers to no chamber');
    assert.notStrictEqual(getHeadOfState(world, autocrat)!.id, beforeLeader.id, 'the old leader should be gone');
    assert.strictEqual(world.leadership.leaders.get(beforeLeader.id)!.departureCause, 'overthrown');
    const ideology = world.movement.empirePostures.get(autocrat)!.ideology;
    assert.ok(ideology.militarism_pacifism >= 25, 'a junta should push the empire militarist');

    // ── Persistence ──────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    const restoredDem = getGovernment(restored, democrat)!;
    assert.ok(restoredDem.parties.length > 0, 'chamber lost in round-trip');
    assert.ok(restoredDem.bills.length > 0, 'bills lost in round-trip');
    assert.strictEqual(getGovernment(restored, autocrat)!.governmentId, 'military_junta', 'junta lost in round-trip');
    console.log('[15] snapshot round-trip keeps the chamber, its bills and the new regime');

    console.log('\nPASS — Government Phase 4: chambers vote, voters decide, and armies remove governments that ignore both.');
}

main();
