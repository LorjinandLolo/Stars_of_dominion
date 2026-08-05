// scripts/test-government-phase1.ts
// Smoke test for Government & Leadership Phase 1 (political capital + policies).
// Run: npx tsx scripts/test-government-phase1.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import {
    ensureGovernments,
    tickGovernments,
    getGovernment,
    grantPoliticalCapital,
    recomputeApproval,
} from '../lib/government/government-service';
import {
    listPolicies,
    evaluatePolicy,
    enactPolicy,
    repealPolicy,
    getPolicyModifiers,
    policyEnactCost,
} from '../lib/government/policy-service';
import { getFactionEconomyMods } from '../lib/economy/economy-service';
import { computeParties, resolveBill } from '../lib/government/parliament-service';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;

function main() {
    initRegistries();

    // ── Catalog ──────────────────────────────────────────────────────────────
    const catalog = listPolicies();
    console.log(`[1] policy catalog: ${catalog.length} policies — ${catalog.map(p => p.id).join(', ')}`);
    assert.ok(catalog.length >= 10, 'expected a real policy catalog');
    assert.ok(catalog.every(p => policyEnactCost(p) > 0), 'every policy needs a political capital cost');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);

    const autocrat = 'faction-aurelian';   // aurelian_autocracy: exec 100, no senate
    const democrat = 'faction-vektori';    // vektori_senate: elected, senate 90
    const gov = getGovernment(world, autocrat)!;
    assert.ok(gov, 'autocrat government missing');
    // strictEqual on length, not deepStrictEqual on the array: the latter's
    // `asserts actual is T` signature narrows activePolicies to never[].
    assert.strictEqual(gov.activePolicies.length, 0, 'no policies should be active at seed');

    // ── Capital gate ─────────────────────────────────────────────────────────
    const broke = evaluatePolicy(world, autocrat, 'militarize');
    console.log(`[2] enact with 0 PC: ok=${broke.ok} reason=${broke.reason}`);
    assert.strictEqual(broke.ok, false);
    assert.strictEqual(broke.reason, 'insufficient_political_capital');

    const enactFails = enactPolicy(world, autocrat, 'militarize');
    assert.strictEqual(enactFails.ok, false, 'enact must respect the capital gate');
    assert.strictEqual(gov.activePolicies.length, 0, 'rejected enact must not activate the policy');

    // ── Accrual ──────────────────────────────────────────────────────────────
    tickGovernments(world, TICK * 4 * 5); // five in-game days
    console.log(`[3] after 5 days: PC ${gov.politicalCapital.toFixed(1)} / ${gov.politicalCapitalCap}`);
    assert.ok(gov.politicalCapital > 0, 'political capital did not accrue');

    // ── Enact ────────────────────────────────────────────────────────────────
    grantPoliticalCapital(world, autocrat, 100, 'test grant');
    const posture = world.movement.empirePostures.get(autocrat)!;
    const militarismBefore = posture.ideology.militarism_pacifism;
    const capitalBefore = gov.politicalCapital;

    const enacted = enactPolicy(world, autocrat, 'militarize');
    console.log(`[4] enact militarize: ok=${enacted.ok} cost=${enacted.cost}, PC ${capitalBefore.toFixed(1)} -> ${gov.politicalCapital.toFixed(1)}, militarism ${militarismBefore} -> ${posture.ideology.militarism_pacifism}`);
    assert.ok(enacted.ok, 'enact should succeed once capital is available');
    assert.ok(gov.activePolicies.includes('militarize'), 'policy not recorded as active');
    assert.strictEqual(Math.round(capitalBefore - gov.politicalCapital), enacted.cost, 'capital not charged correctly');
    assert.ok(posture.ideology.militarism_pacifism > militarismBefore, 'ideology did not shift');

    const dup = enactPolicy(world, autocrat, 'militarize');
    assert.strictEqual(dup.reason, 'already_active', 'double enactment should be refused');

    // ── Effects reach the economy ────────────────────────────────────────────
    const mods = getPolicyModifiers(world, autocrat);
    const econ = getFactionEconomyMods(world, autocrat);
    console.log(`[5] policy modifiers: production ${mods.production}, upkeep ${mods.upkeep}, approval ${mods.approval} — economy production x${econ.production.toFixed(3)}, upkeep x${econ.upkeep.toFixed(3)}`);
    assert.ok(mods.production > 0, 'production effect not aggregated');
    assert.ok(econ.production > 1, 'policy production bonus never reached the economy');
    assert.ok(econ.upkeep > 1, 'policy upkeep penalty never reached the economy');

    // Approval carries the policy's political cost.
    const approvalWith = recomputeApproval(world, autocrat);
    gov.activePolicies = [];
    const approvalWithout = recomputeApproval(world, autocrat);
    gov.activePolicies = ['militarize'];
    console.log(`[6] approval with policy ${approvalWith.toFixed(1)} vs without ${approvalWithout.toFixed(1)}`);
    assert.ok(approvalWith < approvalWithout, 'unpopular policy should cost approval');

    // ── Government form gates policy ─────────────────────────────────────────
    grantPoliticalCapital(world, democrat, 100, 'test grant');
    const martial = evaluatePolicy(world, democrat, 'permanent_martial_law');
    console.log(`[7] martial law under the Vektori Senate: ok=${martial.ok} reason=${martial.reason} — "${martial.message}"`);
    assert.strictEqual(martial.ok, false, 'senate_system must forbid permanent martial law');
    assert.strictEqual(martial.reason, 'restricted_by_government');

    const reforms = enactPolicy(world, democrat, 'civil_reforms');
    assert.ok(reforms.ok, 'a democracy should be able to propose civil reforms');
    // Phase 4: the Vektori Senate has real power, so this is tabled, not enacted.
    assert.ok(reforms.tabled, 'a parliamentary government must put policy to a vote');
    const vGovBills = getGovernment(world, democrat)!;
    const bill = vGovBills.bills.find(b => b.policyId === 'civil_reforms')!;
    assert.ok(bill, 'no bill was tabled');

    // A content chamber passes it; the vote itself is exercised in the Phase 4 test.
    for (const bloc of world.movement.empirePostures.get(democrat)!.blocs) bloc.satisfaction = 90;
    vGovBills.parties = computeParties(world, democrat);
    resolveBill(world, vGovBills, bill);
    assert.strictEqual(bill.status, 'passed', `the chamber rejected civil reforms (${Math.round(bill.projectedSupport)}% support)`);
    console.log(`[8] Vektori civil reforms tabled for ${reforms.cost} PC, passed with ${Math.round(bill.projectedSupport)}% of seats`);

    // ── Repeal ───────────────────────────────────────────────────────────────
    const militarismAfterEnact = posture.ideology.militarism_pacifism;
    grantPoliticalCapital(world, autocrat, 50, 'test grant');
    const repealed = repealPolicy(world, autocrat, 'militarize');
    console.log(`[9] repeal militarize: ok=${repealed.ok} cost=${repealed.cost}, militarism ${militarismAfterEnact} -> ${posture.ideology.militarism_pacifism}`);
    assert.ok(repealed.ok, 'repeal failed');
    assert.ok(!gov.activePolicies.includes('militarize'), 'policy still active after repeal');
    assert.ok(posture.ideology.militarism_pacifism < militarismAfterEnact, 'repeal should walk the ideology back');
    assert.ok(posture.ideology.militarism_pacifism > militarismBefore, 'repeal should not erase the imprint entirely');
    assert.strictEqual(repealPolicy(world, autocrat, 'militarize').reason, 'not_active', 'double repeal should be refused');

    // ── Persistence ──────────────────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    const restoredGov = getGovernment(restored, democrat)!;
    assert.deepStrictEqual(restoredGov.activePolicies, ['civil_reforms'], 'active policies lost in round-trip');
    assert.ok(getPolicyModifiers(restored, democrat).legitimacy_drift > 0, 'policy effects lost in round-trip');
    console.log('[10] snapshot round-trip keeps active policies and their effects');

    console.log('\nPASS — Government Phase 1: political capital gates policy, effects reach the economy.');
}

main();
