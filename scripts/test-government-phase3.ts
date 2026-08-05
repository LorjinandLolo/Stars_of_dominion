// scripts/test-government-phase3.ts
// Smoke test for Government & Leadership Phase 3 (cabinet, governors, legacy).
// Run: npx tsx scripts/test-government-phase3.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries, ambitionRegistry } from '../lib/politics/registry';
import { ensureGovernments, tickGovernments, getGovernment } from '../lib/government/government-service';
import { ensureHeadsOfState, getHeadOfState, resolveSuccession, tickLeadership } from '../lib/government/succession-service';
import {
    ensureCabinets,
    tickCabinets,
    getMinister,
    appointMinister,
    dismissMinister,
    generateCabinetAdvice,
    getCabinetModifiers,
} from '../lib/government/cabinet-service';
import { ensureGovernors, tickGovernors, getGovernor, appointGovernor } from '../lib/government/governor-service';
import { measureAmbitionMetric, tickAmbitions } from '../lib/government/legacy-service';
import { getGovernmentModifiers } from '../lib/government/modifiers';
import { getFactionEconomyMods } from '../lib/economy/economy-service';
import { CABINET_PORTFOLIOS } from '../lib/government/types';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;
const DAY = 4 * TICK;

function main() {
    initRegistries();
    console.log(`[1] ambition catalog: ${ambitionRegistry.getAll().length} definitions — ${ambitionRegistry.getAll().map(a => a.id).join(', ')}`);
    assert.ok(ambitionRegistry.getAll().length >= 6, 'expected a real ambition catalog');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);
    ensureCabinets(world);
    ensureGovernors(world);

    const factionId = 'faction-aurelian';
    const gov = getGovernment(world, factionId)!;

    // ── Cabinet ──────────────────────────────────────────────────────────────
    const seated = CABINET_PORTFOLIOS.map(p => getMinister(world, factionId, p));
    console.log(`[2] cabinet: ${seated.map((m, i) => `${CABINET_PORTFOLIOS[i]}=${m?.name}`).join(', ')}`);
    assert.ok(seated.every(Boolean), 'every portfolio should be filled');
    assert.ok(seated.every(m => m!.portfolio && m!.role === 'Minister'), 'ministers must carry their portfolio');
    const uniqueIds = new Set(seated.map(m => m!.id));
    assert.strictEqual(uniqueIds.size, seated.length, 'one person cannot hold two briefs');

    ensureCabinets(world);
    assert.strictEqual(getMinister(world, factionId, 'economy')!.id, seated[1]!.id, 'bootstrap replaced a sitting minister');

    // ── Cabinet effects reach the economy ────────────────────────────────────
    const economyMinister = getMinister(world, factionId, 'economy')!;
    economyMinister.competence = 100;
    const strongMods = getCabinetModifiers(world, factionId);
    economyMinister.competence = 0;
    const weakMods = getCabinetModifiers(world, factionId);
    console.log(`[3] economy ministry production modifier: competent ${strongMods.production.toFixed(3)} vs incompetent ${weakMods.production.toFixed(3)}`);
    assert.ok(strongMods.production > weakMods.production, 'the economy minister should matter');

    economyMinister.competence = 90;
    const econMods = getFactionEconomyMods(world, factionId);
    console.log(`[4] economy mods with cabinet: production x${econMods.production.toFixed(3)}, tax x${econMods.tax.toFixed(3)}`);
    assert.ok(econMods.production > 1, 'cabinet production bonus never reached the economy');

    const scienceMinister = getMinister(world, factionId, 'science')!;
    scienceMinister.competence = 100;
    assert.ok(getGovernmentModifiers(world, factionId).research_speed > 0, 'science ministry should buy research tempo');

    // ── Advice ───────────────────────────────────────────────────────────────
    const advice = generateCabinetAdvice(world, factionId);
    console.log(`[5] cabinet debate: ${advice.length} positions, e.g. ${advice[0].portfolioLabel} (${advice[0].ministerName}, reliability ${advice[0].reliability}): "${advice[0].advice}"`);
    assert.strictEqual(advice.length, CABINET_PORTFOLIOS.length, 'every minister should speak');
    assert.ok(advice.every(a => a.advice.length > 10), 'advice should be substantive');

    // ── Appoint / dismiss ────────────────────────────────────────────────────
    const bench = world.leadership.recruitmentPool.filter(l => l.factionId === factionId);
    assert.ok(bench.length > 0, 'no bench to appoint from');
    const appointed = appointMinister(world, factionId, 'foreign', bench[0].id);
    assert.ok(appointed.ok, `appointment failed: ${appointed.message}`);
    assert.strictEqual(getMinister(world, factionId, 'foreign')!.id, bench[0].id, 'appointment did not take effect');
    console.log(`[6] appointed ${bench[0].name} to Foreign Affairs`);

    const headId = gov.headOfStateId!;
    const illegal = appointMinister(world, factionId, 'defence', headId);
    assert.strictEqual(illegal.ok, false, 'the head of state must not hold a portfolio');

    const dismissedName = getMinister(world, factionId, 'defence')!.name;
    const dismissal = dismissMinister(world, factionId, 'defence');
    assert.ok(dismissal.ok, 'dismissal failed');
    const replacement = getMinister(world, factionId, 'defence')!;
    assert.notStrictEqual(replacement.name, dismissedName, 'the seat did not refill');
    console.log(`[7] dismissed ${dismissedName} from Defence; ${replacement.name} took the brief`);

    // ── Corruption and loyalty drift ─────────────────────────────────────────
    for (const portfolio of CABINET_PORTFOLIOS) {
        const minister = getMinister(world, factionId, portfolio)!;
        minister.ambitionDrive = 95;
        minister.corruption = 20;
    }
    getMinister(world, factionId, 'intelligence')!.competence = 0; // no oversight
    const corruptionBefore = gov.corruption;
    tickCabinets(world, DAY * 10);
    console.log(`[8] empire corruption after 10 days of unwatched ministers: ${corruptionBefore.toFixed(1)} -> ${gov.corruption.toFixed(1)}`);
    assert.ok(gov.corruption > corruptionBefore, 'corruption should creep without oversight');
    assert.ok(gov.cabinetAdvice.length > 0, 'cabinet advice snapshot not stored for the client');

    // ── Governors ────────────────────────────────────────────────────────────
    const planets = [...world.construction.planets.values()].filter(p => p.ownerId === factionId);
    assert.ok(planets.length > 0, 'faction has no planets to govern');
    const planet = planets[0];
    const governor = getGovernor(world, planet.id)!;
    console.log(`[9] ${planet.id} governed by ${governor.name} (competence ${governor.competence}, loyalty ${governor.loyalty})`);
    assert.ok(governor, 'planet has no governor');
    assert.strictEqual(governor.assignmentId, planet.id, 'governor is not assigned to the planet');

    governor.competence = 100;
    governor.corruption = 0;
    planet.stability = 50;
    tickGovernors(world, DAY * 5);
    console.log(`[10] competent governor moved stability 50 -> ${planet.stability.toFixed(1)}`);
    assert.ok(planet.stability > 50, 'a competent governor should raise stability');

    governor.loyalty = 5;
    governor.ambitionDrive = 95;
    planet.stability = 20;
    planet.unrest = 0;
    tickGovernors(world, DAY * 5);
    console.log(`[11] disloyal governor let unrest reach ${planet.unrest.toFixed(1)}`);
    assert.ok(planet.unrest > 0, 'a disloyal governor should let unrest build');

    const benchGovernor = world.leadership.recruitmentPool.filter(l => l.factionId === factionId)[0];
    const swap = appointGovernor(world, factionId, planet.id, benchGovernor.id);
    assert.ok(swap.ok, `governor appointment failed: ${swap.message}`);
    assert.strictEqual(planet.governorId, benchGovernor.id, 'governor swap did not take');

    // ── Legacy ───────────────────────────────────────────────────────────────
    const leader = getHeadOfState(world, factionId)!;
    console.log(`[12] ${leader.title} ${leader.name} ambitions: ${gov.ambitions.map(a => `${a.name} (${a.mode} ${a.target})`).join('; ')}`);
    assert.strictEqual(gov.ambitions.length, 3, 'a leader should hold three ambitions');
    assert.ok(gov.ambitions.every(a => !a.completed), 'nothing should be complete at the start');

    // Force one to completion and check the payout.
    const target = gov.ambitions[0];
    target.metric = 'planets_owned';
    target.mode = 'absolute';
    const current = measureAmbitionMetric(world, factionId, target.metric);
    assert.ok(current > 0, 'fixture faction should own planets to measure against');
    target.target = current;
    const prestigeBefore = gov.legacy.prestige;
    const capitalBefore = gov.politicalCapital;
    tickAmbitions(world, gov, leader);
    console.log(`[13] "${target.name}" completed: prestige ${prestigeBefore} -> ${gov.legacy.prestige}, capital ${capitalBefore.toFixed(1)} -> ${gov.politicalCapital.toFixed(1)}, bonuses ${JSON.stringify(gov.legacy.bonuses)}`);
    assert.ok(target.completed, 'ambition did not complete');
    assert.ok(gov.legacy.prestige > prestigeBefore, 'prestige not awarded');
    assert.ok(gov.politicalCapital > capitalBefore, 'political capital not paid out');
    assert.ok(gov.legacy.chronicle.some(c => c.ambition === target.name), 'chronicle not written');

    // Paying out twice would be a duplication bug.
    const prestigeAfter = gov.legacy.prestige;
    tickAmbitions(world, gov, leader);
    assert.strictEqual(gov.legacy.prestige, prestigeAfter, 'ambition paid out twice');

    // Legacy bonuses outlive the leader.
    const bonusesBefore = JSON.stringify(gov.legacy.bonuses);
    resolveSuccession(world, factionId, 'retirement');
    console.log(`[14] after succession: legacy bonuses ${JSON.stringify(gov.legacy.bonuses)}, new ambitions ${gov.ambitions.length}, completed ${gov.ambitions.filter(a => a.completed).length}`);
    assert.strictEqual(JSON.stringify(gov.legacy.bonuses), bonusesBefore, 'legacy bonuses did not survive succession');
    assert.strictEqual(gov.ambitions.length, 3, 'the new administration needs its own ambitions');
    assert.ok(gov.ambitions.every(a => !a.completed), 'new ambitions should start fresh');

    // ── Full tick + persistence ──────────────────────────────────────────────
    tickGovernments(world, TICK);
    tickLeadership(world, TICK);
    tickCabinets(world, TICK);
    tickGovernors(world, TICK);

    const restored = deserializeWorld(serializeWorld(world));
    const restoredGov = getGovernment(restored, factionId)!;
    assert.ok(getMinister(restored, factionId, 'economy'), 'cabinet lost in round-trip');
    assert.strictEqual(restoredGov.ambitions.length, 3, 'ambitions lost in round-trip');
    assert.ok(restoredGov.legacy.prestige > 0, 'legacy prestige lost in round-trip');
    assert.ok(getGovernor(restored, planet.id), 'governor lost in round-trip');
    console.log('[15] snapshot round-trip keeps cabinet, governors, ambitions and legacy');

    console.log('\nPASS — Government Phase 3: cabinet governs, governors run worlds, legacy outlives leaders.');
}

main();
