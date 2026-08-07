// scripts/test-government-phase6-2.ts
// Smoke test for Government & Leadership Phase 6.2 (escalation ladder).
// Run: npx tsx scripts/test-government-phase6-2.ts

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
    tickDefiance,
    raiseDefiance,
    answerDefiance,
    openDefiance,
    getCohesionModifiers,
} from '../lib/government/defiance-service';
import { DEFIANCE_OPTIONS } from '../lib/government/defiance-types';
import { getFactionEconomyMods } from '../lib/economy/economy-service';
import { Resource } from '../lib/trade-system/types';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;
const DAY = 4 * TICK;

/**
 * Advance the sim clock and tick, the way the worker does. The defiance roll is
 * seeded on the clock hour, so a test that ticks without moving nowSeconds keeps
 * re-rolling the identical dice.
 */
function advance(world: any, ticks: number) {
    for (let i = 0; i < ticks; i++) {
        world.nowSeconds += TICK;
        tickCohesion(world, TICK);
        tickDefiance(world, TICK);
    }
}

/**
 * Drive a world's cohesion straight to the floor. Ticks cohesion once so the
 * drivers reflect the new conditions — a crisis quotes them as its causes.
 */
function collapse(world: any, planetId: string) {
    const planet = world.construction.planets.get(planetId);
    planet.unrest = 95;
    planet.stability = 5;
    planet.happiness = 10;
    const governor = getGovernor(world, planetId);
    if (governor) governor.loyalty = 3;

    tickCohesion(world, TICK);
    const record = getPlanetCohesion(world, planetId)!;
    record.cohesion = 12;
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

    // The defiance roll is seeded on the sim clock, and a fresh world starts at
    // wall-clock time — pin it so this test is reproducible run to run.
    world.nowSeconds = 1_800_000_000;

    const factionId = 'faction-aurelian';
    const gov = getGovernment(world, factionId)!;
    const planets = [...world.construction.planets.values()].filter(p => p.ownerId === factionId);
    assert.ok(planets.length >= 3, 'need a few worlds for this test');

    // ── Stage 2: institutional decay is passive and mechanical ───────────────
    gov.cohesion = 90;
    const healthy = getCohesionModifiers(world, factionId);
    gov.cohesion = 10;
    const failing = getCohesionModifiers(world, factionId);
    console.log(`[1] institutional decay: cohesion 90 gives tax ${(healthy.tax_income ?? 0).toFixed(3)}, cohesion 10 gives tax ${(failing.tax_income ?? 0).toFixed(3)} / production ${(failing.production ?? 0).toFixed(3)}`);
    assert.ok((healthy.tax_income ?? 0) === 0, 'a cohesive empire should collect normally');
    assert.ok((failing.tax_income ?? 0) < -0.2, 'a fracturing empire should struggle to collect');

    const econ = getFactionEconomyMods(world, factionId);
    console.log(`[2] the economy feels it: tax multiplier x${econ.tax.toFixed(3)}`);
    assert.ok(econ.tax < 1, 'cohesion loss must reach the economy tick');
    gov.cohesion = 60;

    // ── Stage 3: a collapsed world refuses the centre ────────────────────────
    const target = planets[0];
    collapse(world, target.id);
    const ticksToRefusal = (() => {
        for (let i = 1; i <= 40; i++) {
            advance(world, 1);
            if (openDefiance(world, factionId).length > 0) return i;
        }
        return -1;
    })();

    const open = openDefiance(world, factionId);
    console.log(`[3] world sat at cohesion 12 for ${ticksToRefusal} ticks (${(ticksToRefusal / 4).toFixed(1)} days) before refusing: "${open[0]?.title}"`);
    assert.ok(open.length > 0, 'a collapsed world should eventually refuse');
    const crisis = open[0];
    assert.ok(crisis.causes.length > 0, 'a crisis must carry the reasons it happened');
    console.log(`[4] traceable causes: ${crisis.causes.join(' | ')}`);

    // Healthy worlds stay quiet.
    const quiet = [...world.planetCohesion.values()].filter(r => r.factionId === factionId && r.cohesion > 60);
    assert.ok(!open.some(e => quiet.some(q => q.planetId === e.planetId)), 'contented worlds must not riot');

    // One crisis per world at a time.
    assert.strictEqual(raiseDefiance(world, target.id), undefined, 'a world cannot open two crises at once');

    // ── The costs are real ───────────────────────────────────────────────────
    gov.politicalCapital = 0;
    const broke = answerDefiance(world, factionId, crisis.id, 'negotiate');
    console.log(`[5] answering with no capital: ok=${broke.ok} — "${broke.message}"`);
    assert.strictEqual(broke.ok, false, 'answers must be gated on political capital');
    assert.strictEqual(openDefiance(world, factionId).length, open.length, 'a refused answer must not resolve the crisis');

    // ── Negotiate: it works, and it costs forever ────────────────────────────
    grantPoliticalCapital(world, factionId, 200, 'test grant');
    const record = getPlanetCohesion(world, target.id)!;
    const cohesionBefore = record.cohesion;
    const negotiated = answerDefiance(world, factionId, crisis.id, 'negotiate');
    console.log(`[6] negotiate: ${negotiated.outcome} — cohesion ${cohesionBefore.toFixed(1)} -> ${record.cohesion.toFixed(1)}, autonomy ${record.autonomy}`);
    assert.ok(negotiated.ok, `negotiate failed: ${negotiated.message}`);
    assert.ok(record.cohesion > cohesionBefore, 'concessions should steady the world');
    assert.strictEqual(record.autonomy, 25, 'negotiating grants autonomy');
    assert.strictEqual(openDefiance(world, factionId).length, 0, 'the crisis should be resolved');

    const autonomyCost = getCohesionModifiers(world, factionId);
    console.log(`[7] the concession has a standing price: tax ${(autonomyCost.tax_income ?? 0).toFixed(3)}`);
    assert.ok((autonomyCost.tax_income ?? 0) < 0, 'granted autonomy must cost revenue permanently');

    // ── Ignoring is an answer, and the worst one ─────────────────────────────
    const second = planets[1];
    collapse(world, second.id);
    const ignored = raiseDefiance(world, second.id)!;
    assert.ok(ignored, 'second crisis should open');
    const ignoredRecord = getPlanetCohesion(world, second.id)!;
    const beforeIgnore = { cohesion: ignoredRecord.cohesion, legitimacy: gov.legitimacy };

    world.nowSeconds = ignored.expiresAtSeconds + 1;
    tickDefiance(world, TICK);
    console.log(`[8] left unanswered: status "${ignored.status}" — cohesion ${beforeIgnore.cohesion.toFixed(1)} -> ${ignoredRecord.cohesion.toFixed(1)}, legitimacy ${beforeIgnore.legitimacy.toFixed(1)} -> ${gov.legitimacy.toFixed(1)}`);
    assert.strictEqual(ignored.status, 'ignored', 'an expired crisis is ignored, not forgotten');
    assert.ok(ignoredRecord.cohesion < beforeIgnore.cohesion, 'silence should cost cohesion');
    assert.ok(gov.legitimacy < beforeIgnore.legitimacy, 'silence should cost legitimacy');

    // ── Force works locally and is seen everywhere ───────────────────────────
    const third = planets[2];
    collapse(world, third.id);
    const forceCrisis = raiseDefiance(world, third.id)!;
    const otherWorlds = [...world.planetCohesion.values()]
        .filter(r => r.factionId === factionId && r.planetId !== third.id);
    const watchingBefore = otherWorlds.map(r => r.cohesion);
    const thirdPlanet = world.construction.planets.get(third.id)!;
    const unrestBefore = thirdPlanet.unrest;

    grantPoliticalCapital(world, factionId, 200, 'test grant');
    const forced = answerDefiance(world, factionId, forceCrisis.id, 'send_military');
    const watchingAfter = otherWorlds.map(r => r.cohesion);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    console.log(`[9] send military: ${forced.outcome} — local unrest ${unrestBefore.toFixed(0)} -> ${thirdPlanet.unrest.toFixed(0)}, watching worlds total cohesion ${sum(watchingBefore).toFixed(1)} -> ${sum(watchingAfter).toFixed(1)}`);
    assert.ok(forced.ok, 'force should be available');
    assert.ok(thirdPlanet.unrest < unrestBefore, 'force should suppress local unrest');
    // Summed, not per-world: a world already at zero cannot fall further.
    assert.ok(sum(watchingAfter) < sum(watchingBefore), 'the rest of the empire should take note');

    // ── Bribery spends real credits ──────────────────────────────────────────
    const fourth = planets[3] ?? planets[0];
    const fourthRecord = getPlanetCohesion(world, fourth.id)!;
    fourthRecord.autonomy = 0;
    collapse(world, fourth.id);
    const bribeCrisis = raiseDefiance(world, fourth.id);
    if (bribeCrisis) {
        const reserves = world.economy.factions.get(factionId)!.reserves as Record<string, number>;
        reserves[Resource.CREDITS] = 100;
        const tooPoor = answerDefiance(world, factionId, bribeCrisis.id, 'bribe');
        assert.strictEqual(tooPoor.ok, false, 'a bribe needs the money to exist');

        reserves[Resource.CREDITS] = 50_000;
        const before = reserves[Resource.CREDITS];
        const bribed = answerDefiance(world, factionId, bribeCrisis.id, 'bribe');
        console.log(`[10] bribe: ${bribed.outcome} — treasury ${before} -> ${reserves[Resource.CREDITS]}`);
        assert.ok(bribed.ok, `bribe failed: ${bribed.message}`);
        assert.strictEqual(before - reserves[Resource.CREDITS], 4000, 'a bribe must actually spend credits');
    }

    // ── The option table is what the UI mirrors ──────────────────────────────
    assert.strictEqual(DEFIANCE_OPTIONS.length, 5, 'the doc lists five answers');
    console.log(`[11] answers available: ${DEFIANCE_OPTIONS.map(o => `${o.label} (${o.politicalCapital}PC${o.credits ? ` + ${o.credits}cr` : ''})`).join(', ')}`);

    // ── Persistence ──────────────────────────────────────────────────────────
    collapse(world, planets[0].id);
    const survivor = raiseDefiance(world, planets[0].id);
    const restored = deserializeWorld(serializeWorld(world));
    assert.ok(restored.defianceEvents instanceof Map, 'defiance map lost in round-trip');
    if (survivor) {
        const restoredEvent = restored.defianceEvents.get(survivor.id);
        assert.ok(restoredEvent, 'open crisis lost in round-trip');
        assert.strictEqual(restoredEvent!.causes.length, survivor.causes.length, 'crisis causes lost in round-trip');
    }
    assert.ok((restored.planetCohesion.get(target.id)?.autonomy ?? 0) > 0, 'granted autonomy lost in round-trip');

    const legacy: any = JSON.parse(serializeWorld(world));
    delete legacy.defianceEvents;
    const backfilled = deserializeWorld(JSON.stringify(legacy));
    assert.ok(backfilled.defianceEvents instanceof Map, 'backfill did not restore the defiance map');
    console.log('[12] snapshot round-trip and pre-6.2 backfill both hold');

    console.log('\nPASS — Government Phase 6.2: worlds refuse, the state decays, and every answer costs something.');
}

main();
