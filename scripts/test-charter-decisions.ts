// scripts/test-charter-decisions.ts
// The three charter rules the user set on 2026-10-06:
//   1. Revoking a rogue company's charter ends the break while it is under
//      half its clock, and hastens the split once it is past half.
//   2. Charters from before terms existed get the long (8-day) term.
//   3. Trade companies pay the state in credits, plus a small political
//      capital trickle (the merchant lobby's favour at court).
// Run: npx tsx scripts/test-charter-decisions.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries } from '../lib/politics/registry';
import { ensureGovernments, getGovernment } from '../lib/government/government-service';
import { CHARTER_TECH_ID, ROGUE_GRACE_SECONDS, ensureCharterFields, rogueProgress } from '../lib/economy/corporate/charter-service';
import { ensureCorporateState } from '../lib/economy/corporate/company-registry';
import { grantCharter } from '../lib/economy/corporate/charter-orders';
import { revokeAgainstRogue, tickRogueCompanies } from '../lib/economy/corporate/rogue-service';
import { tickMissionServices } from '../lib/economy/corporate/mission-services';
import { LEGACY_CHARTER_TERM_DAYS } from '../lib/economy/corporate/charter-types';
import { GALACTIC_DAY_SIM_SECONDS } from '../lib/time/time-config';
import { resetChronicleBuffer } from '../lib/narrative/chronicle';
import type { CharterTerms } from '../lib/economy/corporate/charter-types';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const realLog = console.log;
console.log = () => {};
initRegistries();
const world = getGameWorldState() as any;
ensureEmpirePostures(world);
ensureGovernments(world);
const corp = ensureCorporateState(world);
if (!(world.secessionCrises instanceof Map)) world.secessionCrises = new Map();
if (!world.nowSeconds || world.nowSeconds <= 0) world.nowSeconds = 1_000_000;
resetChronicleBuffer();

const FOUNDER = 'faction-aurelian';
world.tech.set(FOUNDER, {
    factionId: FOUNDER, unlockedTechIds: [CHARTER_TECH_ID], activeEffects: [], activeSlots: [],
    maxSlots: 1, globalModifiers: {}, researchPoints: 0, lockedTechIds: [],
});
const reserves = world.economy.factions.get(FOUNDER).reserves as Record<string, number>;
reserves.CREDITS = 2_000_000;
const capital = world.economy.factions.get(FOUNDER).capitalSystemId ?? [...world.movement.systems.keys()][0];

let seq = 0;
function charter(mission: CharterTerms['mission']): any {
    getGovernment(world, FOUNDER)!.politicalCapital = 400;
    const result = grantCharter(world, FOUNDER, {
        baseName: `Test ${mission} ${seq++}`, headquartersSystemId: capital, foundingCapital: 100_000,
        terms: {
            mission, territory: 'domestic', rights: ['build_infrastructure'],
            ownership: { government: 100, privateInvestors: 0, foreignInvestors: 0, publicShares: 0 },
            profitShareToState: 0.15,
        },
    });
    assert.ok(result.ok, (result as any).error);
    return (result as any).company;
}

/** A company that went rogue `fraction` of the way through its clock ago. */
function rogueAt(fraction: number): any {
    const c = charter('shipbuilding');
    c.hasGoneRogue = true;
    c.rogueSince = world.nowSeconds - fraction * ROGUE_GRACE_SECONDS;
    return c;
}

console.log = realLog;
console.log('\nCharter decisions');

test('revoking under half the rogue clock ends the break', () => {
    const c = rogueAt(0.3);
    assert.ok(Math.abs(rogueProgress(c, world.nowSeconds) - 0.3) < 1e-9);
    assert.strictEqual(revokeAgainstRogue(world, c), 'stopped');
    assert.strictEqual(c.hasGoneRogue, false);
    assert.strictEqual(c.rogueSince, undefined);
    c.charterRevocationPending = true; // what the order handler does next
    world.nowSeconds += ROGUE_GRACE_SECONDS * 2;
    const breaks = tickRogueCompanies(world).filter((b: any) => b.companyId === c.id);
    assert.strictEqual(breaks.length, 0, 'it winds down; it never breaks away');
});

test('revoking past half the rogue clock hastens the split to the next cycle', () => {
    const c = rogueAt(0.6);
    assert.strictEqual(revokeAgainstRogue(world, c), 'hastened');
    assert.strictEqual(c.hasGoneRogue, true);
    assert.ok(rogueProgress(c, world.nowSeconds) >= 1, 'the clock has run out');
    const breaks = tickRogueCompanies(world).filter((b: any) => b.companyId === c.id);
    assert.strictEqual(breaks.length, 1, 'it breaks away on the very next tick');
});

test('exactly half counts as too far gone', () => {
    assert.strictEqual(revokeAgainstRogue(world, rogueAt(0.5)), 'hastened');
});

test('a company that is not rogue is untouched by the rule', () => {
    const c = charter('shipbuilding');
    assert.strictEqual(revokeAgainstRogue(world, c), 'not_rogue');
    assert.strictEqual(c.hasGoneRogue ?? false, false);
});

test('a charter from before terms existed gets the 8-day term', () => {
    const c = charter('mining');
    delete c.charterTermDays;
    delete c.charterExpiresAt;
    ensureCharterFields(c, world.nowSeconds);
    assert.strictEqual(c.charterTermDays, LEGACY_CHARTER_TERM_DAYS);
    assert.strictEqual(LEGACY_CHARTER_TERM_DAYS, 8);
    assert.strictEqual(c.charterExpiresAt, world.nowSeconds + 8 * GALACTIC_DAY_SIM_SECONDS);
});

test('trade stations pay credits, plus a small political capital trickle', () => {
    const c = charter('trade');
    c.loyalty = 100;
    for (let i = 0; i < 3; i++) {
        c.assets.push({ id: `casset-trade-${i}`, type: 'trade_station', systemId: capital, value: 10_000, incomePerTick: 300, upkeepPerTick: 50, builtAt: world.nowSeconds - 1 });
    }
    // Only this company should pay: park every other company's service.
    for (const other of corp.companies.values()) if (other !== c) (other as any).loyalty = 0;
    const gov = getGovernment(world, FOUNDER)!;
    gov.politicalCapital = 10;
    const creditsBefore = reserves.CREDITS;
    tickMissionServices(world);
    assert.ok(Math.abs(gov.politicalCapital - 10.225) < 1e-9, `three stations at 0.075 PC each: ${gov.politicalCapital}`);
    assert.strictEqual(Math.round(reserves.CREDITS - creditsBefore), 300, 'three stations at 100cr each, full loyalty');
    assert.match(c.lastService?.summary ?? '', /paid the treasury 300cr and won the government 0.2[23] political capital/);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
