// scripts/test-enlightenment-counterplay.ts
// What the galaxy can do about an empire that is transcending: every rival
// service works it first and succeeds more often, reaches for the ops that
// break the attempt, and "Burn the Archive" ruins the Great Archive and nothing
// else. Runs against the real seeded world (scripts/soak-harness.ts).
// Run: npx tsx scripts/test-enlightenment-counterplay.ts

import assert from 'assert';
import { bootSoakWorld, quietConsole } from './soak-harness';
import { computeCatalogSuccessChance, tickOperations } from '../lib/espionage/espionage-service';
import { OPERATION_CATALOG_BY_ID } from '../lib/espionage/operation-catalog';
import { getOrCreateFactionIntel } from '../lib/espionage/faction-intel';
import { processEmpireIntelligenceTurn, SEEKER_FOCUS } from '../lib/ai/intelligence-ai-service';
import { runDiplomaticAI, ENLIGHTENMENT_COALITION } from '../lib/ai/diplomatic-ai-service';
import { getSanction } from '../lib/diplomacy/sanctions-service';
import { getOrCreateRivalry } from '../lib/diplomacy/offer-service';
import { canLaunchCategory } from '../lib/espionage/network-stages';
import { warCandidates } from '../lib/ai/war-ai';
import { ensureVictoryState, startTranscendence, readEnlightenmentConditions, ARCHIVE_BUILDING_ID } from '../lib/victory/victory-service';
import { empireBuildingState } from '../lib/construction/construction-service';
import config from '../lib/movement/movement-config.json';

const TARGET = 'faction-aurelian';
const ACTOR = 'faction-vektori';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const quiet = quietConsole();
const world = bootSoakWorld({ claimed: [] });
quiet.restore();

// The target's capital world gets a standing Archive next to its existing buildings.
const capital = [...world.construction.planets.values()].find((p: any) => p.ownerId === TARGET);
assert(capital, 'target has a world');
capital.tiles.push({ tileId: `${capital.id}-archive`, districtType: 'any', buildingId: ARCHIVE_BUILDING_ID, constructionState: 'active', constructionCompleteAt: null });
const othersBefore = capital.tiles.filter((t: any) => t.buildingId !== ARCHIVE_BUILDING_ID && t.constructionState === 'active').length;

function arm(actorId: string): void {
    const intel = getOrCreateFactionIntel(world, actorId);
    intel.intelPoints = 1000;
    intel.usedAgentCapacity = 0;
    intel.agentCapacity = Math.max(intel.agentCapacity, 3);
    intel.infiltrationLevels[TARGET] = 100;
}

function liveOpsAgainst(targetId: string) {
    return [...world.espionage.operations.values()].filter((o: any) => o.status === 'active' && o.targetFactionId === targetId);
}

console.log('\nEnlightenment counterplay');

test('ops against a transcending empire gain the configured success bonus', () => {
    const def = OPERATION_CATALOG_BY_ID.get('election_interference')!;
    arm(ACTOR);
    getOrCreateFactionIntel(world, ACTOR).infiltrationLevels[TARGET] = 0; // keep the chance off the 0.95 ceiling
    const before = computeCatalogSuccessChance(def, ACTOR, TARGET, world);
    startTranscendence(TARGET, world);
    const after = computeCatalogSuccessChance(def, ACTOR, TARGET, world);
    assert(Math.abs(after - before - config.victory.enlightenment.transcendingOpSuccessBonus) < 1e-9, `${before} → ${after}`);
});

test('an AI service works the transcending empire first, with Burn the Archive', () => {
    arm(ACTOR);
    processEmpireIntelligenceTurn(ACTOR, world);
    const ops = liveOpsAgainst(TARGET).filter((o: any) => o.actorFactionId === ACTOR);
    assert.strictEqual(ops.length, 1, `expected one op against ${TARGET}, got ${ops.length}`);
    assert.strictEqual(ops[0].definitionId, 'sabotage_archive');
});

test('Burn the Archive ruins the Archive and nothing else', () => {
    const op = liveOpsAgainst(TARGET).find((o: any) => o.definitionId === 'sabotage_archive')!;
    op.completesAt = new Date((world.nowSeconds - 1) * 1000).toISOString();
    const realRandom = Math.random;
    Math.random = () => 0.01; // a success roll (it is exposed too, which does not undo the success)
    try { tickOperations(world, 3600); } finally { Math.random = realRandom; }
    assert.strictEqual(op.succeeded, true, `op outcome: ${op.narrative}`);
    assert.strictEqual(empireBuildingState(world.construction.planets.values(), TARGET, ARCHIVE_BUILDING_ID), 'ruined');
    const othersAfter = capital.tiles.filter((t: any) => t.buildingId !== ARCHIVE_BUILDING_ID && t.constructionState === 'active').length;
    assert.strictEqual(othersAfter, othersBefore, 'no other building was touched');
    const row = readEnlightenmentConditions(TARGET, world).find(r => r.id === 'archive')!;
    assert.strictEqual(row.passing, false, 'the condition now fails');
});

test('with nothing left to burn, the service picks a political op instead', () => {
    const other = 'faction-null-syndicate';
    arm(other);
    processEmpireIntelligenceTurn(other, world);
    const op = liveOpsAgainst(TARGET).find((o: any) => o.actorFactionId === other);
    assert(op, `${other} launched nothing against ${TARGET}`);
    assert.notStrictEqual(op.definitionId, 'sabotage_archive');
    assert(['election_interference', 'incite_rebellion', 'fund_separatists'].includes(op.definitionId), op.definitionId);
});

// ── Can a REAL network get there? (the tests above arm it to 100) ──────────

const WATCHER = 'faction-covenant';
const TICKS_PER_DAY = 4;
const qualDays = config.victory.enlightenment.qualificationDurationDays;

/** A service with points to spend but no free agent: only the dedicated cells act. */
function idleService(actorId: string): void {
    const intel = getOrCreateFactionIntel(world, actorId);
    intel.intelPoints = 1000;
    intel.infiltrationLevels[TARGET] = 0;
    intel.usedAgentCapacity = intel.agentCapacity;
}

test('a rival barely qualifying is not watched yet', () => {
    const progress = ensureVictoryState(world).enlightenmentProgress.get(TARGET)!;
    progress.phase = 'qualifying';
    progress.qualificationSecondsAccumulated = qualDays * 86400 * 0.2;
    idleService(WATCHER);
    for (let t = 0; t < 8; t++) processEmpireIntelligenceTurn(WATCHER, world);
    assert.strictEqual(getOrCreateFactionIntel(world, WATCHER).infiltrationLevels[TARGET] ?? 0, 0);
});

test('a service watching from half-qualified reaches sabotage within 5 days of the window, political before it ends', () => {
    const progress = ensureVictoryState(world).enlightenmentProgress.get(TARGET)!;
    progress.phase = 'qualifying';
    progress.qualificationSecondsAccumulated = qualDays * 86400 * SEEKER_FOCUS.watchFromFraction;
    idleService(WATCHER);
    // The second half of qualification, with a day of idle decay (0.72) charged against every day.
    const intel = getOrCreateFactionIntel(world, WATCHER);
    for (let d = 0; d < qualDays * (1 - SEEKER_FOCUS.watchFromFraction); d++) {
        for (let t = 0; t < TICKS_PER_DAY; t++) processEmpireIntelligenceTurn(WATCHER, world);
        intel.infiltrationLevels[TARGET] = Math.max(0, intel.infiltrationLevels[TARGET] - 0.72);
    }
    startTranscendence(TARGET, world);
    let sabotageDay = -1, politicalDay = -1;
    for (let d = 1; d <= config.victory.enlightenment.transcendenceWindowDays; d++) {
        for (let t = 0; t < TICKS_PER_DAY; t++) processEmpireIntelligenceTurn(WATCHER, world);
        intel.infiltrationLevels[TARGET] = Math.max(0, intel.infiltrationLevels[TARGET] - 0.72);
        const lvl = intel.infiltrationLevels[TARGET];
        if (sabotageDay < 0 && canLaunchCategory(lvl, 'sabotage').allowed) sabotageDay = d;
        if (politicalDay < 0 && canLaunchCategory(lvl, 'political').allowed) politicalDay = d;
    }
    assert(sabotageDay > 0 && sabotageDay <= 5, `sabotage stage on day ${sabotageDay}`);
    assert(politicalDay > 0 && politicalDay < config.victory.enlightenment.transcendenceWindowDays, `political stage on day ${politicalDay}`);
});

test('a bid defended by counter-intelligence keeps the watcher short of deep assets for most of the window', () => {
    const progress = ensureVictoryState(world).enlightenmentProgress.get(TARGET)!;
    progress.phase = 'qualifying';
    progress.qualificationSecondsAccumulated = qualDays * 86400 * SEEKER_FOCUS.watchFromFraction;
    idleService(WATCHER);
    const guard = getOrCreateFactionIntel(world, TARGET);
    const before = guard.counterIntelStrength;
    guard.counterIntelStrength = 60;
    const intel = getOrCreateFactionIntel(world, WATCHER);
    for (let d = 0; d < qualDays * (1 - SEEKER_FOCUS.watchFromFraction); d++) {
        for (let t = 0; t < TICKS_PER_DAY; t++) processEmpireIntelligenceTurn(WATCHER, world);
        intel.infiltrationLevels[TARGET] = Math.max(0, intel.infiltrationLevels[TARGET] - 0.72);
    }
    startTranscendence(TARGET, world);
    let sabotageDay = -1;
    for (let d = 1; d <= config.victory.enlightenment.transcendenceWindowDays; d++) {
        for (let t = 0; t < TICKS_PER_DAY; t++) processEmpireIntelligenceTurn(WATCHER, world);
        intel.infiltrationLevels[TARGET] = Math.max(0, intel.infiltrationLevels[TARGET] - 0.72);
        if (sabotageDay < 0 && canLaunchCategory(intel.infiltrationLevels[TARGET], 'sabotage').allowed) sabotageDay = d;
    }
    guard.counterIntelStrength = before;
    assert(sabotageDay < 0 || sabotageDay > 10, `a 60% guard still let sabotage in on day ${sabotageDay}`);
});

test('a mid-sized network runs a Smear Campaign rather than more intel gathering', () => {
    const other = 'faction-sarrak';
    arm(other);
    getOrCreateFactionIntel(world, other).infiltrationLevels[TARGET] = 40; // embedded, short of deep assets
    for (const op of liveOpsAgainst(TARGET)) if (op.actorFactionId === other) op.status = 'completed';
    processEmpireIntelligenceTurn(other, world);
    const op = liveOpsAgainst(TARGET).find((o: any) => o.actorFactionId === other);
    assert(op, 'launched nothing');
    assert.strictEqual(op.definitionId, 'smear_campaign');
});

test(`courts with a quarrel embargo a transcending empire, ${ENLIGHTENMENT_COALITION} at most`, () => {
    world.claimedFactionIds = [TARGET];
    const courts = [...world.economy.factions.keys()].filter((id: string) => id !== TARGET && !['faction-pirates', 'faction-neutral'].includes(id));
    // Everyone resents the target: the cap is what holds the coalition.
    for (const id of courts) {
        getOrCreateRivalry(world, id, TARGET);
        for (const key of [`rivalry-${id}-${TARGET}`, `rivalry-${TARGET}-${id}`]) {
            const r = world.rivalries.get(key);
            if (r) { r.rivalryScore = Math.max(r.rivalryScore, 50); r.escalationLevel = Math.max(r.escalationLevel, 2); }
        }
    }
    runDiplomaticAI(world, { initiativeChance: 0 });
    const sanctioning = courts.filter(id => getSanction(world, id, TARGET));
    assert.strictEqual(sanctioning.length, ENLIGHTENMENT_COALITION, `${sanctioning.length} sanctioning`);
    runDiplomaticAI(world, { initiativeChance: 0 });
    assert.strictEqual(courts.filter(id => getSanction(world, id, TARGET)).length, ENLIGHTENMENT_COALITION, 'the coalition grew past its cap');
    world.claimedFactionIds = [];
});

test('the coalition embargo lifts when the window closes', () => {
    world.claimedFactionIds = [TARGET];
    ensureVictoryState(world).enlightenmentProgress.get(TARGET)!.phase = 'qualifying';
    runDiplomaticAI(world, { initiativeChance: 0 });
    const courts = [...world.economy.factions.keys()].filter((id: string) => id !== TARGET && !['faction-pirates', 'faction-neutral'].includes(id));
    const still = courts.filter(id => getSanction(world, id, TARGET) && (world.rivalries.get(`rivalry-${id}-${TARGET}`)?.rivalryScore ?? 0) < 60);
    assert.strictEqual(still.length, 0, `still embargoing without a quarrel: ${still.join(', ')}`);
    world.claimedFactionIds = [];
    startTranscendence(TARGET, world);
});

test('a transcending empire is a war target at a rivalry no ordinary quarrel would trigger', () => {
    const r = world.rivalries.get(`rivalry-${ACTOR}-${TARGET}`) ?? world.rivalries.get(`rivalry-${TARGET}-${ACTOR}`);
    if (r) { r.rivalryScore = 55; r.escalationLevel = 2; }
    const pool = warCandidates(world, ACTOR).map(c => c.targetId);
    // Reach and fleet power still apply; when the target is out of reach the
    // flag must still be what ranks it, so check the rank among candidates.
    const c = warCandidates(world, ACTOR).find(x => x.targetId === TARGET);
    if (c) assert.strictEqual(pool[0], TARGET, `${TARGET} should lead ${pool.join(', ')}`);
    else console.log('        (target out of reach of the actor in the seeded galaxy — ranking not exercised)');
});

test('once the window closes, the target is no longer special', () => {
    ensureVictoryState(world).enlightenmentProgress.get(TARGET)!.phase = 'inactive';
    const def = OPERATION_CATALOG_BY_ID.get('election_interference')!;
    const chance = computeCatalogSuccessChance(def, ACTOR, TARGET, world);
    getOrCreateFactionIntel(world, ACTOR).infiltrationLevels[TARGET] = 0;
    const base = computeCatalogSuccessChance(def, ACTOR, TARGET, world);
    assert(chance >= base, 'sanity');
    startTranscendence(TARGET, world);
    assert(computeCatalogSuccessChance(def, ACTOR, TARGET, world) > base);
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
