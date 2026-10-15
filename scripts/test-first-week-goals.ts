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
import { DEED_POLICIES_PROPOSED, DEED_RESEARCH_STARTED, DEED_SHIPS_COMMISSIONED, DEED_TROOPS_RAISED } from '../lib/tech/deed-metrics';
import { PANEL_TIPS } from '../lib/tutorial/panel-tips';
import { MANUAL_DATA } from '../lib/manual/manual-data';
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

test('three next steps follow the first week: a policy, troops, a third world', () => {
    const next = FIRST_WEEK_GOALS.filter(g => g.phase === 'next').map(g => g.id);
    assert.deepStrictEqual(next, ['enact_policy', 'raise_troops', 'three_worlds']);
    assert.deepStrictEqual(FIRST_WEEK_GOALS.slice(-3).map(g => g.id), next, 'next steps come last');
});

test('next steps advance on a policy, on troops, and on owning three worlds', () => {
    const world = freshWorld();
    const firstWeek = Object.fromEntries(FIRST_WEEK_GOALS.filter(g => g.phase !== 'next').map(g => [g.id, 1]));
    world.firstWeekGoals.set(F, { index: 0, completedAt: firstWeek });
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'enact_policy');
    assert.strictEqual(currentGoal(world, F)!.deepLink.tab, 'government');
    bumpMetric(world, F, DEED_POLICIES_PROPOSED);
    tickFirstWeekGoals(world);
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'raise_troops');
    bumpMetric(world, F, DEED_TROOPS_RAISED, 5);
    tickFirstWeekGoals(world);
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'three_worlds');
    world.construction.planets.set('a', { id: 'a', ownerId: F });
    world.construction.planets.set('b', { id: 'b', ownerId: F });
    world.construction.planets.set('x', { id: 'x', ownerId: 'someone-else' });
    assert.strictEqual(currentGoal(world, F)!.progress, 2);
    tickFirstWeekGoals(world);
    assert.strictEqual(currentGoal(world, F)!.goal.id, 'three_worlds', 'two worlds is not three');
    world.construction.planets.set('c', { id: 'c', ownerId: F });
    const done = tickFirstWeekGoals(world);
    assert.deepStrictEqual(done.map(a => a.completed.id), ['three_worlds']);
    assert.strictEqual(done[0].next, null);
    assert.strictEqual(currentGoal(world, F), null);
});

test('every panel tip is short, and none duplicates the research fork explainer', () => {
    const tabs = PANEL_TIPS.map(t => t.tab);
    assert.strictEqual(new Set(tabs).size, tabs.length, 'one tip per tab');
    assert.ok(!tabs.includes('tech'));
    for (const tip of PANEL_TIPS) {
        assert.ok(tip.lines.length >= 2 && tip.lines.length <= 3, `${tip.tab}: 2-3 lines`);
        for (const line of tip.lines) assert.ok(line.length <= 200, `${tip.tab}: line too long (${line.length})`);
        assert.ok(MANUAL_DATA.some(sec => sec.id === tip.manual), `${tip.tab}: "Read more" points at missing chapter ${tip.manual}`);
    }
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
