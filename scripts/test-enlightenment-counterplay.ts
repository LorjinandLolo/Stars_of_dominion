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
import { processEmpireIntelligenceTurn } from '../lib/ai/intelligence-ai-service';
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
