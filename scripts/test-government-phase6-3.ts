// scripts/test-government-phase6-3.ts
// Smoke test for Government & Leadership Phase 6.3 (secession crisis).
// Run: npx tsx scripts/test-government-phase6-3.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment, grantPoliticalCapital } from '../lib/government/government-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors, getGovernor } from '../lib/government/governor-service';
import { ensureCohesion, tickCohesion, getPlanetCohesion } from '../lib/government/cohesion-service';
import {
    tickSecession,
    formSecessionCrises,
    openSecessions,
    grantConcession,
    suppressSecession,
} from '../lib/government/secession-service';
import { SECESSION_DEMANDS, SECESSION_SETTLE_THRESHOLD } from '../lib/government/secession-types';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;

/** Push a world past the point of asking for redress. */
function alienate(world: any, planetId: string) {
    const planet = world.construction.planets.get(planetId);
    planet.unrest = 98;
    planet.stability = 3;
    planet.happiness = 8;
    const governor = getGovernor(world, planetId);
    if (governor) governor.loyalty = 4;
    tickCohesion(world, TICK);
    const record = getPlanetCohesion(world, planetId)!;
    record.cohesion = 5;
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

    const factionId = 'faction-aurelian';
    const gov = getGovernment(world, factionId)!;
    const planets = [...world.construction.planets.values()].filter(p => p.ownerId === factionId);
    assert.ok(planets.length >= 3, 'need a few worlds');

    // ── One angry world is not a crisis ──────────────────────────────────────
    alienate(world, planets[0].id);
    formSecessionCrises(world);
    console.log(`[1] one separatist world: ${openSecessions(world, factionId).length} crises (a discipline problem, not a secession)`);
    assert.strictEqual(openSecessions(world, factionId).length, 0, 'a single world should not form a region');

    // ── A region is ─────────────────────────────────────────────────────────
    alienate(world, planets[1].id);
    alienate(world, planets[2].id);
    formSecessionCrises(world);
    const crises = openSecessions(world, factionId);
    assert.strictEqual(crises.length, 1, 'neighbouring separatist worlds should form one crisis');
    const crisis = crises[0];
    console.log(`[2] ${crisis.name}: ${crisis.planetIds.length} worlds, independence ${Math.round(crisis.independenceSupport)}%, governor loyalty ${Math.round(crisis.governorLoyalty)}%, military ${Math.round(crisis.militaryLoyalty)}%`);
    assert.ok(crisis.planetIds.length >= 2, 'a region is more than one world');
    assert.ok(crisis.independenceSupport > 50, 'a collapsed region should want out');
    assert.ok(crisis.causes.length > 0, 'a crisis must carry the reasons it happened');
    assert.ok(crisis.demands.length >= 3, 'there must be room to bargain');
    console.log(`[3] causes: ${crisis.causes.join(' | ')}`);
    console.log(`[4] they will accept: ${crisis.demands.join(', ')}${crisis.leaderName ? ` — led by Governor ${crisis.leaderName}` : ''}`);

    // Worlds already in a crisis are not double-counted.
    formSecessionCrises(world);
    assert.strictEqual(openSecessions(world, factionId).length, 1, 'a world cannot be in two crises');

    // ── Concessions cost capital ────────────────────────────────────────────
    gov.politicalCapital = 0;
    const broke = grantConcession(world, factionId, crisis.id, 'autonomy');
    console.log(`[5] conceding with no capital: ok=${broke.ok} — "${broke.message}"`);
    assert.strictEqual(broke.ok, false, 'concessions must be gated on political capital');

    // ── Negotiating the region back into the empire ─────────────────────────
    grantPoliticalCapital(world, factionId, 300, 'test grant');
    const supportBefore = crisis.independenceSupport;
    const first = grantConcession(world, factionId, crisis.id, crisis.demands[0]);
    console.log(`[6] conceded ${crisis.demands[0]}: ${first.outcome}`);
    assert.ok(first.ok, `concession failed: ${first.message}`);
    assert.ok(crisis.independenceSupport < supportBefore, 'a concession should cool the region');

    assert.strictEqual(
        grantConcession(world, factionId, crisis.id, crisis.demands[0]).ok,
        false,
        'the same concession cannot be made twice'
    );

    // The autonomy they were granted shows up on the worlds themselves.
    const autonomyGranted = crisis.planetIds
        .map(id => getPlanetCohesion(world, id)?.autonomy ?? 0)
        .every(a => a > 0);
    assert.ok(autonomyGranted || crisis.granted[0] === 'military_exemption', 'concessions must reach the worlds');

    // Keep conceding until they settle.
    let settled = first.settled ?? false;
    for (const demand of SECESSION_DEMANDS.map(d => d.id)) {
        if (settled) break;
        if (crisis.granted.includes(demand)) continue;
        const result = grantConcession(world, factionId, crisis.id, demand);
        if (!result.ok) continue;
        settled = result.settled ?? false;
    }
    console.log(`[7] after ${crisis.granted.length} concessions: status "${crisis.status}", independence ${Math.round(crisis.independenceSupport)}%`);
    assert.strictEqual(crisis.status, 'settled', 'enough concessions should settle the crisis');
    assert.ok(crisis.independenceSupport <= SECESSION_SETTLE_THRESHOLD, 'settling means support fell below the threshold');
    assert.ok(gov.legitimacy > 0, 'a government that can make a deal keeps its standing');

    // ── Force: the garrison may refuse ──────────────────────────────────────
    const second = [planets[0].id, planets[1].id];
    for (const id of second) {
        const record = getPlanetCohesion(world, id)!;
        record.autonomy = 0;
        alienate(world, id);
    }
    formSecessionCrises(world);
    const forceCrisis = openSecessions(world, factionId)[0];
    assert.ok(forceCrisis, 'a new crisis should form');

    forceCrisis.militaryLoyalty = 0; // troops will not fire on their neighbours
    grantPoliticalCapital(world, factionId, 300, 'test grant');
    const refused = suppressSecession(world, factionId, forceCrisis.id);
    console.log(`[8] ordering a disloyal garrison in: ${refused.outcome}`);
    assert.ok(refused.ok, 'the order should be issued');
    assert.strictEqual(forceCrisis.status, 'open', 'a refused order does not end the crisis');
    assert.ok(forceCrisis.independenceSupport > 0, 'refusal emboldens the region');

    forceCrisis.militaryLoyalty = 100; // now they will
    const others = [...world.planetCohesion.values()]
        .filter((r: any) => r.factionId === factionId && !forceCrisis.planetIds.includes(r.planetId));
    const watchingBefore = others.reduce((s: number, r: any) => s + r.cohesion, 0);
    const crushed = suppressSecession(world, factionId, forceCrisis.id);
    const watchingAfter = others.reduce((s: number, r: any) => s + r.cohesion, 0);
    console.log(`[9] with a loyal garrison: ${crushed.outcome} — watching worlds ${watchingBefore.toFixed(1)} -> ${watchingAfter.toFixed(1)}`);
    assert.strictEqual(forceCrisis.status, 'suppressed', 'force should end the crisis');
    assert.ok(watchingAfter < watchingBefore, 'the rest of the empire should take note');

    // ── Escalation revives the dead secession service ───────────────────────
    const third = [planets[0].id, planets[2].id];
    for (const id of third) {
        const record = getPlanetCohesion(world, id)!;
        record.autonomy = 0;
        alienate(world, id);
    }
    formSecessionCrises(world);
    const doomed = openSecessions(world, factionId)[0];
    assert.ok(doomed, 'a third crisis should form');

    world.nowSeconds = doomed.deadlineSeconds + 1;
    tickSecession(world, TICK);
    console.log(`[10] deadline passed with nothing offered: status "${doomed.status}" — ${doomed.outcome}`);
    assert.strictEqual(doomed.status, 'escalated', 'an unanswered region stops asking');
    assert.ok(doomed.rebelFactionId, 'escalation must name the breakaway faction for Phase 6.4');

    const armed = doomed.planetIds
        .map(id => (world.construction.planets.get(id) as any)?.rebelGarrison)
        .filter(Boolean);
    console.log(`[11] rebel garrisons spawned on ${armed.length}/${doomed.planetIds.length} worlds — first: ${armed[0]?.troops} troops, fort level ${armed[0]?.fortificationLevel}`);
    assert.ok(armed.length > 0, 'spawnRebelGarrison should have armed the region');
    assert.ok(armed[0].troops > 0, 'rebels need troops');

    // ── Persistence ─────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    assert.ok(restored.secessionCrises instanceof Map, 'crisis map lost in round-trip');
    const restoredCrisis = restored.secessionCrises.get(doomed.id);
    assert.ok(restoredCrisis, 'escalated crisis lost in round-trip');
    assert.strictEqual(restoredCrisis!.rebelFactionId, doomed.rebelFactionId, 'rebel faction id lost in round-trip');

    const legacy: any = JSON.parse(serializeWorld(world));
    delete legacy.secessionCrises;
    const backfilled = deserializeWorld(JSON.stringify(legacy));
    assert.ok(backfilled.secessionCrises instanceof Map, 'backfill did not restore the crisis map');
    console.log('[12] snapshot round-trip and pre-6.3 backfill both hold');

    console.log('\nPASS — Government Phase 6.3: regions negotiate, and the ones nobody answers stop asking.');
}

main();
