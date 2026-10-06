// scripts/test-policy-slots.ts
// A government carries at most POLICY_SLOTS policies: active ones plus bills
// before the chamber. Covers the direct path (autocracy), the chamber path
// (tabled bills hold a slot), decrees, repeal, and a pre-limit snapshot that
// is already over it.
// Run: npx tsx scripts/test-policy-slots.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment, grantPoliticalCapital } from '../lib/government/government-service';
import { evaluatePolicy, enactPolicy, repealPolicy } from '../lib/government/policy-service';
import { computeParties, decreePolicy, resolveBill } from '../lib/government/parliament-service';
import { POLICY_SLOTS, policySlotsUsed } from '../lib/government/policy-slots';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quietLog = console.log;
initRegistries();
const world = getGameWorldState();
ensureEmpirePostures(world);
ensureGovernments(world);

const AUTOCRAT = 'faction-aurelian'; // no chamber: policies take effect at once
const SENATE = 'faction-vektori';    // elected senate: policies go to a vote
const rich = (id: string) => grantPoliticalCapital(world, id, 1000, 'test grant');
const silently = <T>(fn: () => T): T => { console.log = () => {}; try { return fn(); } finally { console.log = quietLog; } };

console.log(`\nPolicy slots (${POLICY_SLOTS})`);

test('an autocracy fills its slots, then the next policy is refused for want of one', () => {
    const gov = getGovernment(world, AUTOCRAT)!;
    gov.activePolicies = [];
    const order = ['open_trade', 'research_push', 'state_censorship', 'world_preservation'];
    for (const id of order.slice(0, POLICY_SLOTS)) {
        rich(AUTOCRAT);
        assert.strictEqual(silently(() => enactPolicy(world, AUTOCRAT, id)).ok, true, `${id} should enact`);
    }
    rich(AUTOCRAT);
    const refused = evaluatePolicy(world, AUTOCRAT, order[POLICY_SLOTS]);
    assert.strictEqual(refused.ok, false);
    assert.strictEqual(refused.reason, 'no_policy_slot');
    const capitalBefore = gov.politicalCapital;
    assert.strictEqual(silently(() => enactPolicy(world, AUTOCRAT, order[POLICY_SLOTS])).ok, false);
    assert.strictEqual(gov.politicalCapital, capitalBefore, 'a refused enact costs nothing');
    assert.strictEqual(gov.activePolicies.length, POLICY_SLOTS);
});

test('a full slate is reported before a short treasury', () => {
    const gov = getGovernment(world, AUTOCRAT)!;
    gov.politicalCapital = 0;
    assert.strictEqual(evaluatePolicy(world, AUTOCRAT, 'world_preservation').reason, 'no_policy_slot');
});

test('repealing one frees the slot', () => {
    const gov = getGovernment(world, AUTOCRAT)!;
    rich(AUTOCRAT);
    assert.strictEqual(silently(() => repealPolicy(world, AUTOCRAT, gov.activePolicies[0])).ok, true);
    rich(AUTOCRAT);
    assert.strictEqual(evaluatePolicy(world, AUTOCRAT, 'world_preservation').ok, true);
});

test('a bill before the chamber holds its slot', () => {
    const gov = getGovernment(world, SENATE)!;
    gov.activePolicies = [];
    gov.bills = [];
    for (const id of ['open_trade', 'research_push']) { rich(SENATE); silently(() => enactPolicy(world, SENATE, id)); }
    assert.strictEqual(gov.activePolicies.length, 0, 'a senate votes first');
    assert.strictEqual(policySlotsUsed(gov), 2, 'two pending bills');
    rich(SENATE);
    assert.strictEqual(silently(() => enactPolicy(world, SENATE, 'equal_citizenship')).ok, true, 'third slot');
    rich(SENATE);
    assert.strictEqual(evaluatePolicy(world, SENATE, 'world_preservation').reason, 'no_policy_slot');
});

test('a decree can overtake its own pending bill, but not take a fourth slot', () => {
    const gov = getGovernment(world, SENATE)!;
    rich(SENATE);
    const own = silently(() => decreePolicy(world, SENATE, 'open_trade'));
    assert.strictEqual(own.ok, true, own.message);
    rich(SENATE);
    const fourth = silently(() => decreePolicy(world, SENATE, 'world_preservation'));
    assert.strictEqual(fourth.ok, false);
    assert.match(fourth.message ?? '', /slot/);
    assert(policySlotsUsed(gov) <= POLICY_SLOTS);
});

test('a snapshot already over the limit keeps its policies but a passing bill lapses', () => {
    const gov = getGovernment(world, SENATE)!;
    gov.activePolicies = ['open_trade', 'research_push', 'equal_citizenship', 'world_preservation'];
    // Civil Reforms carries this senate comfortably (test-government-phase1).
    const bill = { id: 'bill-old', policyId: 'civil_reforms', policyName: 'Civil Reforms', tabledAtSeconds: 0, resolvesAtSeconds: 0, projectedSupport: 100, lobbied: [], status: 'pending' as const };
    gov.bills = [bill];
    // A content chamber, as in test-government-phase1, so the vote itself carries.
    for (const bloc of world.movement.empirePostures.get(SENATE)!.blocs) bloc.satisfaction = 90;
    gov.parties = computeParties(world, SENATE);
    silently(() => resolveBill(world, gov, bill));
    assert.strictEqual(gov.activePolicies.length, 4, 'nothing is repealed for them');
    assert.strictEqual(gov.activePolicies.includes('civil_reforms'), false);
    assert.strictEqual(bill.status, 'failed');
    const last = gov.history[gov.history.length - 1]?.event ?? '';
    assert.match(last, /lapsed/, `it must fail for want of a slot, not on the vote: "${last}"`);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
