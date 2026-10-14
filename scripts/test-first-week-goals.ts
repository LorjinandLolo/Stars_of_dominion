// scripts/test-first-week-goals.ts
// The first-week goals as a tutorial: a research goal after the first
// warships, records from before it read correctly, the card knows when the
// goal's work is under way, and the research council never decides a fork.
// Run: npx tsx scripts/test-first-week-goals.ts

import assert from 'assert';
import '../lib/tech/techData';
import { registry, TechEngine } from '../lib/tech/engine';
import { StrategicAIService } from '../lib/ai/strategic-ai-service';
import { bumpMetric } from '../lib/tech/history-ledger';
import { DEED_RESEARCH_STARTED, DEED_SHIPS_COMMISSIONED } from '../lib/tech/deed-metrics';
import { FIRST_WEEK_GOALS, currentGoal, tickFirstWeekGoals } from '../lib/goals/first-week-goals';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const F = 'faction-test';

function freshWorld(): any {
    return {
        nowSeconds: 1_000_000,
        claimedFactionIds: [F],
        firstWeekGoals: new Map(),
        techHistory: new Map(),
        tech: new Map(),
        combat: { recruitmentJobs: [] },
        movement: { systems: new Map(), fleets: new Map(), explorationOrders: [] },
        construction: { planets: new Map() },
        economy: { factions: new Map() },
    };
}

test('research is goal 2, right after the first warships', () => {
    assert.deepStrictEqual(FIRST_WEEK_GOALS.slice(0, 2).map(g => g.id), ['commission_ships', 'start_research']);
    for (const g of FIRST_WEEK_GOALS) {
        assert.ok(g.takes && g.meanwhile, `${g.id} needs takes and meanwhile`);
    }
});

test('takes lines are read from the catalogs, not left as placeholders', () => {
    const ships = FIRST_WEEK_GOALS.find(g => g.id === 'commission_ships')!;
    const yard = FIRST_WEEK_GOALS.find(g => g.id === 'build_shipyard')!;
    assert.match(ships.takes, /^About \d+ minutes for a corvette$/, ships.takes);
    assert.match(yard.takes, /^Station \d+ minutes, then the yard \dh \d+m$/, yard.takes);
});

test('warships, then a research choice, advance in order', () => {
    const world = freshWorld();
    tickFirstWeekGoals(world);
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'commission_ships');
    bumpMetric(world, F, DEED_SHIPS_COMMISSIONED);
    const advances = tickFirstWeekGoals(world);
    assert.deepStrictEqual(advances.map(a => a.completed.id), ['commission_ships']);
    const now = currentGoal(world, F)!;
    assert.strictEqual(now.goal.id, 'start_research');
    assert.strictEqual(now.deepLink.tab, 'tech');
    bumpMetric(world, F, DEED_RESEARCH_STARTED);
    tickFirstWeekGoals(world);
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'survey_three');
});

test('a record from before the research goal lands on it, and its old goals are not announced again', () => {
    const world = freshWorld();
    // Old shape: commission, survey and settle done, index 3 of the five-goal list.
    world.firstWeekGoals.set(F, { index: 3, completedAt: { commission_ships: 1, survey_three: 2, settle_world: 3 } });
    const goal = currentGoal(world, F)!;
    assert.strictEqual(goal.goal.id, 'start_research');
    assert.strictEqual(goal.number, 2);
    bumpMetric(world, F, DEED_RESEARCH_STARTED);
    const advances = tickFirstWeekGoals(world);
    assert.deepStrictEqual(advances.map(a => a.completed.id), ['start_research']);
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'build_shipyard');
});

test('the card counts down warships already on the slip', () => {
    const world = freshWorld();
    tickFirstWeekGoals(world);
    assert.strictEqual(currentGoal(world, F)!.waiting, null);
    world.combat.recruitmentJobs.push(
        { factionId: F, classKey: 'corvette', designName: 'Picket', completesAt: world.nowSeconds + 9000 },
        { factionId: F, unitType: 'INFANTRY', completesAt: world.nowSeconds + 10 },       // ground army: not a warship
        { factionId: 'someone-else', classKey: 'corvette', completesAt: world.nowSeconds + 5 },
    );
    const waiting = currentGoal(world, F)!.waiting!;
    assert.strictEqual(waiting.label, 'Picket commissioning');
    assert.strictEqual(waiting.completesAt, world.nowSeconds + 9000);
});

test('the Spaceyard goal counts the station it needs first', () => {
    const world = freshWorld();
    world.firstWeekGoals.set(F, { index: 0, completedAt: { commission_ships: 1, start_research: 1, survey_three: 1, settle_world: 1 } });
    world.construction.planets.set('p1', {
        id: 'p1', ownerId: F,
        orbital: { buildQueue: [{ structureId: 'space_station', completesAtSeconds: world.nowSeconds + 36000 }] },
    });
    const goal = currentGoal(world, F)!;
    assert.strictEqual(goal.goal.id, 'build_shipyard');
    assert.strictEqual(goal.waiting?.label, 'Space Station in orbit');
});

test('the research council never starts a fork option', () => {
    const world = freshWorld();
    let state = TechEngine.initPlayerState(F);
    world.tech.set(F, state);
    let picks = 0;
    for (let i = 0; i < 60; i++) {
        StrategicAIService.manageResearch(F, world, { avoidForks: true });
        state = world.tech.get(F);
        const slot = state.activeSlots[0];
        if (!slot.techId) break;
        const tech = registry.get(slot.techId)!;
        assert.ok(!tech.mutuallyExclusiveGroup, `council picked fork option ${tech.id}`);
        picks++;
        state.unlockedTechIds.push(slot.techId);
        slot.techId = null;
        slot.status = 'empty';
    }
    assert.ok(picks > 10, `council made only ${picks} picks`);
    assert.strictEqual((state.lockedTechIds ?? []).length, 0, 'no fork was closed');
});

test('a player assignment clears the council tag', () => {
    const state: any = TechEngine.initPlayerState(F);
    const first = registry.getAll().find(t => !(t.prerequisites ?? []).length && !t.mutuallyExclusiveGroup)!;
    state.activeSlots[0].startedBy = 'council';
    const next = TechEngine.assignResearch(state, 'slot-1', first.id, 0);
    assert.strictEqual(next.activeSlots[0].startedBy, undefined);
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
