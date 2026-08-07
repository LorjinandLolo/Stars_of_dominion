// scripts/test-splinter-ai.ts
// Regression test for the strategic AI's stance system — specifically that a
// fresh breakaway state behaves like one instead of running a great power's
// playbook on two besieged worlds.
// Run: npx tsx scripts/test-splinter-ai.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment, getFactionStability } from '../lib/government/government-service';
import { ensureHeadsOfState } from '../lib/government/succession-service';
import { ensureCabinets } from '../lib/government/cabinet-service';
import { ensureGovernors, getGovernor } from '../lib/government/governor-service';
import { ensureCohesion, tickCohesion, getPlanetCohesion } from '../lib/government/cohesion-service';
import { formSecessionCrises, openSecessions, tickSecession } from '../lib/government/secession-service';
import { tickCivilWar, breakawayOrigin } from '../lib/government/civil-war-service';
import { StrategicAIService } from '../lib/ai/strategic-ai-service';
import { getOrCreateRivalry } from '../lib/diplomacy/offer-service';
import { Resource } from '../lib/trade-system/types';

const TICK = 6 * 60 * 60;

function alienate(world: any, planetId: string) {
    const planet = world.construction.planets.get(planetId);
    planet.unrest = 98;
    planet.stability = 3;
    planet.happiness = 8;
    const governor = getGovernor(world, planetId);
    if (governor) governor.loyalty = 2;
    tickCohesion(world, TICK);
    getPlanetCohesion(world, planetId)!.cohesion = 4;
}

function activeOps(world: any, factionId: string): number {
    return [...world.espionage.operations.values()]
        .filter((op: any) => op.actorFactionId === factionId && op.status === 'active').length;
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

    // ── A healthy great power plays normally ─────────────────────────────────
    const healthy = StrategicAIService.assessStance(parentId, world);
    console.log(`[1] a settled empire: stance "${healthy.stance}"${healthy.reasons.length ? ` (${healthy.reasons.join(', ')})` : ''}`);
    assert.strictEqual(healthy.stance, 'normal', 'a healthy empire should play the normal game');

    // ── Produce a breakaway ──────────────────────────────────────────────────
    const parentPlanets = [...world.construction.planets.values()].filter(p => p.ownerId === parentId);
    for (const planet of [parentPlanets[0], parentPlanets[1]]) alienate(world, planet.id);
    formSecessionCrises(world);
    const crisis = openSecessions(world, parentId)[0];
    world.nowSeconds = crisis.deadlineSeconds + 1;
    tickSecession(world, TICK);
    world.nowSeconds += 3 * 86400;
    tickCivilWar(world, TICK);

    const rebelId = crisis.rebelFactionId!;
    assert.ok(world.economy.factions.has(rebelId), 'the breakaway should exist');
    const origin = breakawayOrigin(world, rebelId)!;
    console.log(`[2] ${world.economy.factions.get(rebelId)!.name} founded ${(origin.ageSeconds / 86400).toFixed(1)} days ago, at war with ${origin.parentFactionId}`);
    assert.strictEqual(origin.parentFactionId, parentId, 'its origin should be traceable');

    // ── It knows it is fighting for its life ─────────────────────────────────
    const assessment = StrategicAIService.assessStance(rebelId, world);
    console.log(`[3] the breakaway's stance: "${assessment.stance}" — ${assessment.reasons.join(', ')}`);
    assert.strictEqual(assessment.stance, 'survival', 'a newborn state at war on two worlds is in survival');
    assert.ok(assessment.reasons.length >= 2, 'and it should be able to say why');

    // ── Survival means no covert adventures ──────────────────────────────────
    // Give it money so the refusal is a choice, not poverty.
    (world.economy.factions.get(rebelId)!.reserves as any)[Resource.CREDITS] = 100_000;
    for (let i = 0; i < 20; i++) StrategicAIService.processEmpireTurn(rebelId, world);
    console.log(`[4] after 20 AI turns at war: ${activeOps(world, rebelId)} covert operations launched`);
    assert.strictEqual(activeOps(world, rebelId), 0, 'a state in survival runs no black ops');

    // ── It builds to hold, not to grow ───────────────────────────────────────
    const rebelWorlds = [...world.construction.planets.values()].filter(p => p.ownerId === rebelId);
    const queued = rebelWorlds.flatMap(p => p.buildQueue.map((o: any) => o.buildingId));
    console.log(`[5] its build queues: ${queued.join(', ') || '(empty)'}`);
    assert.ok(queued.length > 0, 'it should still be building something');
    assert.ok(queued.every(b => b === 'security_hub'), 'a besieged state builds order, not research labs');
    assert.ok(rebelWorlds.every(p => p.buildQueue.length <= 1), 'and one thing at a time');

    // ── Its doctrines are defensive ──────────────────────────────────────────
    const doctrines = world.doctrines.get(rebelId)!;
    assert.ok(doctrines, 'the breakaway should have doctrines set');
    console.log(`[6] doctrines: military=${doctrines.activeDoctrines.military}, economic=${doctrines.activeDoctrines.economic}, intelligence=${doctrines.activeDoctrines.intelligence}`);
    assert.strictEqual(doctrines.activeDoctrines.military, 'doctrine_military_defensive', 'it should be defending');
    assert.strictEqual(doctrines.activeDoctrines.economic, 'doctrine_economic_consolidation', 'it should be consolidating');
    assert.strictEqual(doctrines.activeDoctrines.intelligence, 'doctrine_intel_defensive', 'and watching its own back');

    // ── It does not staff a great power's court ──────────────────────────────
    const rebelLeaders = [...world.leadership.leaders.values()]
        .filter(l => l.factionId === rebelId && l.status === 'active').length;
    console.log(`[7] leaders on the books: ${rebelLeaders} (a great power would keep ten)`);
    assert.ok(rebelLeaders <= 6, 'a survival-stance state keeps a small government');

    // ── Once the war ends and it settles, it opens up again ──────────────────
    for (const rivalry of world.rivalries.values()) {
        if (rivalry.empireAId === rebelId || rivalry.empireBId === rebelId) {
            rivalry.rivalryScore = 10;
            rivalry.escalationLevel = 1;
        }
    }
    const rebelGov = getGovernment(world, rebelId)!;
    rebelGov.cohesion = 80;
    world.nowSeconds += 20 * 86400; // no longer newly founded
    const settled = StrategicAIService.assessStance(rebelId, world);
    console.log(`[8] at peace, cohesive, ${(breakawayOrigin(world, rebelId)!.ageSeconds / 86400).toFixed(0)} days old: stance "${settled.stance}"`);
    assert.notStrictEqual(settled.stance, 'survival', 'peace and cohesion should end the emergency');

    // ── The espionage gates apply to everyone, not just splinters ────────────
    const bigPower = getGovernment(world, 'faction-vektori')!;
    bigPower.cohesion = 80;
    (world.economy.factions.get('faction-vektori')!.reserves as any)[Resource.CREDITS] = 100_000;
    // Rivalries are created lazily, so give it a real one to act on.
    const feud = getOrCreateRivalry(world, 'faction-vektori', 'faction-covenant');
    feud.rivalryScore = 90;
    feud.escalationLevel = 6;
    for (const id of [`rivalry-faction-vektori-faction-covenant`, `rivalry-faction-covenant-faction-vektori`]) {
        const r = world.rivalries.get(id);
        if (r) { r.rivalryScore = 90; r.escalationLevel = 6; }
    }
    for (let i = 0; i < 40; i++) StrategicAIService.processEmpireTurn('faction-vektori', world);
    const bigOps = activeOps(world, 'faction-vektori');
    console.log(`[9] a great power over 40 turns at high tension: ${bigOps} concurrent operations (cap 3)`);
    assert.ok(bigOps > 0, 'a normal-stance empire at high tension should actually run operations');
    assert.ok(bigOps <= 3, 'the concurrency cap must hold — the old code had none');

    // Poverty stops operations regardless of stance.
    (world.economy.factions.get('faction-vektori')!.reserves as any)[Resource.CREDITS] = 100;
    const before = activeOps(world, 'faction-vektori');
    for (const op of world.espionage.operations.values()) {
        if (op.actorFactionId === 'faction-vektori') op.status = 'resolved';
    }
    for (let i = 0; i < 10; i++) StrategicAIService.processEmpireTurn('faction-vektori', world);
    console.log(`[10] with an empty treasury: ${activeOps(world, 'faction-vektori')} operations (was ${before})`);
    assert.strictEqual(activeOps(world, 'faction-vektori'), 0, 'a broke empire cannot fund covert work');

    // ── Doctrines read this empire's stability, not the galaxy's ─────────────
    world.shared.stability = 0;
    const own = getFactionStability(world, 'faction-covenant');
    console.log(`[11] galaxy-wide stability 0, but faction-covenant reads ${own.toFixed(1)}`);
    assert.ok(own > 0, 'AI decisions should key off the empire\'s own condition');

    console.log('\nPASS — splinter AI: a breakaway plays for survival, and nobody runs free unlimited black ops.');
}

main();
