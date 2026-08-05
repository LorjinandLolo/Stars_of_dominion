// scripts/test-government-phase2.ts
// Smoke test for Government & Leadership Phase 2 (head of state + succession).
// Run: npx tsx scripts/test-government-phase2.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, tickGovernments, getGovernment, grantPoliticalCapital } from '../lib/government/government-service';
import {
    ensureHeadsOfState,
    getHeadOfState,
    tickLeadership,
    resolveSuccession,
    refillRecruitmentPool,
} from '../lib/government/succession-service';
import { generateLeader, generateCandidatePool } from '../lib/leadership/leader-generator';
import { LeadershipService } from '../lib/leadership/leadership-service';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;
const DAY = 4 * TICK;

function main() {
    initRegistries();

    // ── Generator is deterministic ───────────────────────────────────────────
    const a = generateLeader({ factionId: 'faction-test', role: 'HeadOfState', seed: 'x', nowSeconds: 0, governmentTags: ['democracy'] });
    const b = generateLeader({ factionId: 'faction-test', role: 'HeadOfState', seed: 'x', nowSeconds: 0, governmentTags: ['democracy'] });
    const c = generateLeader({ factionId: 'faction-test', role: 'HeadOfState', seed: 'y', nowSeconds: 0, governmentTags: ['democracy'] });
    console.log(`[1] generator: "${a.title} ${a.name}" age ${a.age} health ${a.health} skill ${a.politicalSkill} traits=${a.traits.join(',')}`);
    assert.deepStrictEqual(a, b, 'same seed must produce the same leader');
    assert.notStrictEqual(a.id, c.id, 'different seeds must produce different leaders');
    assert.ok(a.traits.length >= 1, 'leaders should carry at least one trait');
    assert.ok(['Chancellor', 'President', 'First Minister'].includes(a.title!), 'democracy should get a democratic title');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);
    ensureHeadsOfState(world);

    const factionId = 'faction-aurelian';
    const gov = getGovernment(world, factionId)!;
    const leader = getHeadOfState(world, factionId)!;
    console.log(`[2] seated: ${leader.title} ${leader.name} (age ${leader.age}, health ${leader.health}) for ${gov.institutionName}`);
    assert.ok(leader, 'no head of state seated');
    assert.strictEqual(gov.headOfStateId, leader.id, 'government does not point at its leader');
    assert.strictEqual(leader.role, 'HeadOfState');
    assert.ok(['Imperator', 'Sovereign', 'High Regent', 'Lord Executor', 'Prefect', 'High Steward'].includes(leader.title!), `autocracy got an odd title: ${leader.title}`);

    // Idempotent: a second bootstrap must not replace the sitting leader.
    ensureHeadsOfState(world);
    assert.strictEqual(getHeadOfState(world, factionId)!.id, leader.id, 'bootstrap replaced a sitting leader');

    // ── Recruitment pool is finally populated ────────────────────────────────
    const pool = world.leadership.recruitmentPool.filter(l => l.factionId === factionId);
    console.log(`[3] recruitment pool for ${factionId}: ${pool.length} candidates — ${pool.map(l => `${l.name} (${l.role}, skill ${l.politicalSkill})`).join('; ')}`);
    assert.ok(pool.length >= 3, 'recruitment pool should be stocked');

    const hired = pool[0];
    LeadershipService.recruitLeader(world, hired.id, factionId);
    assert.ok(world.leadership.leaders.has(hired.id), 'LEADER_RECRUIT path still cannot hire anyone');
    console.log(`[4] recruited ${hired.name} from the pool — LEADER_RECRUIT is live`);
    refillRecruitmentPool(world, factionId);
    assert.ok(world.leadership.recruitmentPool.filter(l => l.factionId === factionId).length >= 3, 'pool did not refill');

    // ── Leader shapes the government ─────────────────────────────────────────
    leader.politicalSkill = 90;
    leader.popularity = 90;
    gov.politicalCapital = 0;
    tickGovernments(world, DAY);
    const skilledGain = gov.politicalCapital;

    leader.politicalSkill = 10;
    leader.popularity = 10;
    gov.politicalCapital = 0;
    tickGovernments(world, DAY);
    const unskilledGain = gov.politicalCapital;
    console.log(`[5] capital in one day: skilled+popular ${skilledGain.toFixed(2)} vs unskilled+unpopular ${unskilledGain.toFixed(2)}`);
    assert.ok(skilledGain > unskilledGain, 'the head of state should matter to capital accrual');

    // ── Ageing and decline ───────────────────────────────────────────────────
    leader.politicalSkill = 60;
    leader.popularity = 60;
    const ageBefore = leader.age!;
    const healthBefore = leader.health!;
    tickLeadership(world, DAY * 10);
    console.log(`[6] after 10 days: age ${ageBefore.toFixed(1)} -> ${leader.age!.toFixed(1)}, health ${healthBefore.toFixed(1)} -> ${leader.health!.toFixed(1)}`);
    assert.ok(leader.age! > ageBefore, 'leader did not age');
    assert.ok(leader.health! < healthBefore, 'health did not decline');

    // ── Death in office → succession ─────────────────────────────────────────
    grantPoliticalCapital(world, factionId, 60, 'test grant');
    const capitalBefore = gov.politicalCapital;
    const legitimacyBefore = gov.legitimacy;
    leader.health = 0;
    tickLeadership(world, TICK);

    const successor = getHeadOfState(world, factionId)!;
    console.log(`[7] succession: ${leader.name} -> ${successor.title} ${successor.name}; legitimacy ${legitimacyBefore.toFixed(1)} -> ${gov.legitimacy.toFixed(1)}, capital ${capitalBefore.toFixed(1)} -> ${gov.politicalCapital.toFixed(1)}`);
    assert.notStrictEqual(successor.id, leader.id, 'no successor took office');
    assert.strictEqual(world.leadership.leaders.get(leader.id)!.status, 'deceased', 'the dead leader is still listed active');
    assert.strictEqual(world.leadership.leaders.get(leader.id)!.departureCause, 'death');
    assert.ok(gov.legitimacy < legitimacyBefore, 'a death in office should cost legitimacy');
    assert.ok(gov.politicalCapital < capitalBefore, 'a new administration should not inherit full capital');
    assert.strictEqual(successor.role, 'HeadOfState');
    assert.ok(successor.title, 'successor has no title');
    assert.ok(gov.history.some(h => h.event.includes(successor.name)), 'succession not recorded in government history');

    // ── Retirement is cheaper than death ─────────────────────────────────────
    const vektori = 'faction-vektori';
    const vGov = getGovernment(world, vektori)!;
    const vLegitimacyBefore = vGov.legitimacy;
    resolveSuccession(world, vektori, 'retirement');
    const retirementCost = vLegitimacyBefore - vGov.legitimacy;
    console.log(`[8] retirement cost ${retirementCost.toFixed(1)} legitimacy vs ${(legitimacyBefore - gov.legitimacy).toFixed(1)} for a death`);
    assert.ok(retirementCost > 0 && retirementCost < (legitimacyBefore - gov.legitimacy), 'retirement should cost less than dying in office');

    // ── Empty bench still produces a successor ───────────────────────────────
    world.leadership.recruitmentPool = world.leadership.recruitmentPool.filter(l => l.factionId !== factionId);
    const emergency = resolveSuccession(world, factionId, 'resignation');
    assert.ok(emergency, 'an empty bench must still yield a head of state');
    console.log(`[9] empty bench: state produced ${emergency!.title} ${emergency!.name}`);

    // ── Persistence ──────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    const restoredLeader = getHeadOfState(restored, factionId);
    assert.ok(restoredLeader, 'head of state lost in snapshot round-trip');
    assert.strictEqual(restoredLeader!.id, getGovernment(restored, factionId)!.headOfStateId);
    assert.ok(restored.leadership.recruitmentPool.length > 0, 'recruitment pool lost in round-trip');
    console.log('[10] snapshot round-trip keeps the office and the bench');

    // Candidate pools stay deterministic across generations.
    const genA = generateCandidatePool('faction-x', 3, 7, 0);
    const genB = generateCandidatePool('faction-x', 3, 7, 0);
    assert.deepStrictEqual(genA.map(l => l.id), genB.map(l => l.id), 'candidate pools must be deterministic');

    console.log('\nPASS — Government Phase 2: heads of state age, die, and are succeeded.');
}

main();
