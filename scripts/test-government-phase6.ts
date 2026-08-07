// scripts/test-government-phase6.ts
// Smoke test for Government & Leadership Phase 6.1 (Empire Cohesion substrate).
// Run: npx tsx scripts/test-government-phase6.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, tickGovernments, getGovernment } from '../lib/government/government-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors, getGovernor } from '../lib/government/governor-service';
import {
    ensureCohesion,
    tickCohesion,
    computeCohesionDrivers,
    distancesFromCapital,
    getPlanetCohesion,
    weakestWorlds,
    isFactionAtWar,
} from '../lib/government/cohesion-service';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;
const DAY = 4 * TICK;

function main() {
    initRegistries();

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);
    ensureCohesion(world);

    const factionId = 'faction-aurelian';
    const gov = getGovernment(world, factionId)!;
    const planets = [...world.construction.planets.values()].filter(p => p.ownerId === factionId);
    assert.ok(planets.length > 0, 'fixture faction owns no worlds');

    // ── Records seeded for every owned world ─────────────────────────────────
    const seeded = planets.map(p => getPlanetCohesion(world, p.id)).filter(Boolean);
    console.log(`[1] cohesion seeded for ${seeded.length}/${planets.length} worlds; ${world.planetCohesion.size} records total`);
    assert.strictEqual(seeded.length, planets.length, 'every owned world needs a cohesion record');

    // ── Drivers are named and signed ─────────────────────────────────────────
    const home = planets[0];
    const { drivers, target } = computeCohesionDrivers(world, home.id);
    console.log(`[2] ${home.id} target ${target.toFixed(1)} from: ${drivers.slice(0, 4).map(d => `${d.label} (${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(1)})`).join(', ')}`);
    assert.ok(drivers.length >= 4, 'a world should have several named drivers');
    assert.ok(drivers.every(d => d.label.length > 3), 'every driver must be readable');
    // Sorted by magnitude so the UI can truncate safely.
    for (let i = 1; i < drivers.length; i++) {
        assert.ok(Math.abs(drivers[i - 1].delta) >= Math.abs(drivers[i].delta), 'drivers must be sorted by magnitude');
    }
    const summed = 50 + drivers.reduce((s, d) => s + d.delta, 0);
    assert.ok(Math.abs(Math.max(0, Math.min(100, summed)) - target) < 0.01, 'target must equal the sum of its drivers');

    // ── Distance from the capital is real graph distance ─────────────────────
    const { distances, metric } = distancesFromCapital(world, factionId);
    const capital = world.economy.factions.get(factionId)!.capitalSystemId!;
    const laneCount = [...world.movement.systems.values()].filter(s => (s.hyperlaneNeighbors ?? []).length > 0).length;
    const far = [...distances.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`[3] distance from ${capital}: ${distances.size} systems measured via "${metric}" (${laneCount} systems have hyperlanes), capital=${distances.get(capital)}, furthest=${far?.[1]}`);
    assert.strictEqual(distances.get(capital), 0, 'the capital is zero jumps from itself');
    assert.strictEqual(metric, laneCount > 0 ? 'lanes' : 'grid', 'metric should reflect whether the lane graph exists');
    assert.ok(distances.size > 1, 'every system should get a distance, by lanes or by grid');
    assert.ok((far?.[1] ?? 0) > 0, 'somewhere should be further away than the capital');

    // ── Approval and cohesion are genuinely different questions ──────────────
    // A well-run, contented empire whose government is despised.
    for (const bloc of world.movement.empirePostures.get(factionId)!.blocs) bloc.satisfaction = 5;
    gov.legitimacy = 85;
    gov.corruption = 0;
    for (const planet of planets) {
        planet.stability = 90;
        planet.happiness = 90;
        planet.unrest = 0;
    }
    tickGovernments(world, TICK);
    tickCohesion(world, DAY * 40);
    const hatedButHeld = { approval: gov.approval, cohesion: gov.cohesion };
    console.log(`[4] despised government, contented worlds: approval ${hatedButHeld.approval.toFixed(1)}, cohesion ${hatedButHeld.cohesion.toFixed(1)}`);
    assert.ok(gov.approval < 40, 'furious interest groups should sink approval');
    assert.ok(gov.cohesion > gov.approval + 15, 'cohesion must be able to hold far above approval');

    // ── A prosperous-looking empire whose frontier is leaving ────────────────
    const frontier = [...world.planetCohesion.values()]
        .filter(r => r.factionId === factionId)
        .sort((a, b) => b.distanceFromCapital - a.distanceFromCapital)[0];
    const frontierPlanet = world.construction.planets.get(frontier.planetId)!;
    frontierPlanet.unrest = 95;
    frontierPlanet.stability = 10;
    frontierPlanet.happiness = 15;
    const frontierGovernor = getGovernor(world, frontier.planetId);
    if (frontierGovernor) frontierGovernor.loyalty = 2;

    const beforeCohesion = frontier.cohesion;
    tickCohesion(world, DAY);
    console.log(`[5] frontier world after one bad day: cohesion ${beforeCohesion.toFixed(1)} -> ${frontier.cohesion.toFixed(1)}, target ${frontier.target.toFixed(1)}, trend ${frontier.trend.toFixed(2)}/day`);
    assert.ok(frontier.target < 25, 'unrest, collapse and a disloyal governor should crater the target');
    assert.ok(frontier.cohesion > frontier.target, 'cohesion must LAG its target — that lag is the early warning');
    assert.ok(frontier.trend < 0, 'the trend should show it falling');

    // ── It is a slow stock, not a recalculation ──────────────────────────────
    const oneDayDrop = beforeCohesion - frontier.cohesion;
    console.log(`[6] one day of drift moved it ${oneDayDrop.toFixed(2)} points (capped by design)`);
    assert.ok(oneDayDrop <= 3.01, 'cohesion must not snap to its target in a single day');

    tickCohesion(world, DAY * 30);
    console.log(`[7] thirty days later: cohesion ${frontier.cohesion.toFixed(1)}, stage "${frontier.stage}"`);
    assert.ok(frontier.cohesion <= frontier.target + 0.01, 'given time it should reach the target');
    assert.strictEqual(frontier.stage, 'separatist', 'a world at this cohesion is separatist');

    // ── The empire number is population-weighted, and names its causes ───────
    console.log(`[8] empire cohesion ${gov.cohesion.toFixed(1)} (${gov.cohesionTrend >= 0 ? '+' : ''}${gov.cohesionTrend.toFixed(2)}/day) driven by: ${gov.cohesionDrivers.slice(0, 3).map(d => `${d.label} ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(1)}`).join(', ')}`);
    assert.ok(gov.cohesionDrivers.length > 0, 'the empire aggregate must explain itself');
    const worst = weakestWorlds(world, factionId, 3);
    assert.strictEqual(worst[0].planetId, frontier.planetId, 'the collapsing world should top the worry list');
    console.log(`[9] weakest worlds: ${worst.map(w => `${w.planetId.slice(-6)} ${Math.round(w.cohesion)} (${w.stage})`).join(', ')}`);

    // ── Per-faction stability and war fatigue are now authoritative ──────────
    const peaceful = getGovernment(world, 'faction-covenant')!;
    world.shared.warFatigue = 100;          // galaxy-wide scalar says total war
    world.shared.stability = 0;             // ...and total collapse
    peaceful.warFatigue = 0;
    tickCohesion(world, DAY * 3);
    console.log(`[10] galaxy scalars at warFatigue=100/stability=0, but a peaceful empire reads warFatigue ${peaceful.warFatigue.toFixed(1)}, stability ${peaceful.stability.toFixed(1)} (at war: ${isFactionAtWar(world, 'faction-covenant')})`);
    assert.strictEqual(peaceful.warFatigue, 0, 'a peaceful empire must not inherit the galaxy war fatigue');
    assert.ok(peaceful.stability > 0, 'stability must come from its own worlds, not world.shared');

    // ── Persistence ──────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    const restoredRecord = getPlanetCohesion(restored, frontier.planetId)!;
    assert.ok(restoredRecord, 'cohesion lost in round-trip');
    assert.strictEqual(Math.round(restoredRecord.cohesion), Math.round(frontier.cohesion), 'cohesion value lost in round-trip');
    assert.ok(restoredRecord.drivers.length > 0, 'drivers lost in round-trip');
    assert.ok(getGovernment(restored, factionId)!.cohesionDrivers.length > 0, 'empire drivers lost in round-trip');

    // A pre-6.1 snapshot has no map at all.
    const legacy: any = JSON.parse(serializeWorld(world));
    delete legacy.planetCohesion;
    const backfilled = deserializeWorld(JSON.stringify(legacy));
    assert.ok(backfilled.planetCohesion instanceof Map, 'backfill did not restore the cohesion map');
    ensureCohesion(backfilled);
    assert.ok(getPlanetCohesion(backfilled, frontier.planetId), 'ensureCohesion did not reseed after backfill');
    console.log('[11] snapshot round-trip and pre-6.1 backfill both hold');

    console.log('\nPASS — Government Phase 6.1: cohesion is per-world, lags its target, and always names its causes.');
}

main();
