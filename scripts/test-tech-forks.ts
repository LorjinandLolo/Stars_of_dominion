// scripts/test-tech-forks.ts
// Forks of no return: a fork is decided when research STARTS, the options it
// closes are named, and everything that needed them is closed with them.
// Run: npx tsx scripts/test-tech-forks.ts

import assert from 'assert';
import '../lib/tech/techData';
import { registry, TechEngine } from '../lib/tech/engine';
import { closedTechIds, closedBy, forkCost, forkLabel, forksOf, requiredForkOption } from '../lib/tech/forks';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const all = registry.getAll();
const byId = new Map(all.map(t => [t.id, t] as const));
const forks = forksOf(all);
const espT2 = forks.get('espionage_t2_path')!;
const [optA, optB] = espT2.options;

/** A state with every prerequisite of `techId` researched and one free slot. */
function readyFor(techId: string) {
    let state = TechEngine.initPlayerState('faction-test');
    const need = new Set<string>();
    const stack = [...(byId.get(techId)!.prerequisites ?? [])];
    while (stack.length) { const id = stack.pop()!; if (need.has(id)) continue; need.add(id); stack.push(...(byId.get(id)!.prerequisites ?? [])); }
    state.unlockedTechIds = [...need];
    if (state.activeSlots.length < 2) {
        state.activeSlots.push({ slotId: 'slot-test-2', techId: null, startTime: 0, progressHours: 0, ticksCompleted: 0, ticksRequired: 0, status: 'empty' } as any);
    }
    return state;
}

console.log('\nTech forks');

test('every tree has its two forks, named for players', () => {
    assert.strictEqual(forks.size, 10);
    assert.strictEqual(forkLabel(espT2), 'Specialization fork');
    assert.ok([...forks.values()].every(f => f.options.length >= 2));
});

test('starting research on a fork option closes the others at once', () => {
    let state = readyFor(optA.id);
    state = TechEngine.assignResearch(state, state.activeSlots[0].slotId, optA.id, 1000);
    assert.ok(state.lockedTechIds.includes(optB.id), 'the rival is locked the moment research starts');
    assert.throws(() => TechEngine.assignResearch(state, state.activeSlots[1].slotId, optB.id, 1000), /mutually exclusive/);
});

test('a rival already researching on an old snapshot never completes', () => {
    let state = readyFor(optA.id);
    state.activeSlots[0] = { ...state.activeSlots[0], techId: optA.id, status: 'researching', progressHours: 1e6, ticksCompleted: 99, ticksRequired: 1 } as any;
    state.activeSlots[1] = { ...state.activeSlots[1], techId: optB.id, status: 'researching', progressHours: 1e6, ticksCompleted: 99, ticksRequired: 1 } as any;
    state.lockedTechIds = [optB.id]; // A was committed first
    const done = TechEngine.tickResearch(state, 3600 * 24);
    assert.ok(done.unlockedTechIds.includes(optA.id));
    assert.ok(!done.unlockedTechIds.includes(optB.id), 'both options of one fork must never be held');
});

test('everything that needs a closed option is closed with it', () => {
    const closed = closedTechIds(all, [optB.id]);
    const needsB = all.filter(t => (t.prerequisites ?? []).includes(optB.id));
    assert.ok(needsB.length > 0);
    for (const t of needsB) assert.ok(closed.has(t.id), `${t.name} needs ${optB.name}`);
    const deep = [...closed].find(id => id !== optB.id && !needsB.some(n => n.id === id));
    if (deep) assert.strictEqual(closedBy(all, byId, deep, new Set([optB.id]))?.id, optB.id, 'and names the choice that closed it');
});

test('the cost of a choice is its rivals and what only they lead to', () => {
    const cost = forkCost(all, optA.id, [])!;
    assert.deepStrictEqual(cost.rivals.map(r => r.id), [optB.id]);
    assert.ok(cost.downstream.length > 0);
    assert.ok(cost.downstream.every(t => closedTechIds(all, [optB.id]).has(t.id)));
    assert.ok(!cost.downstream.some(t => closedTechIds(all, [optA.id]).has(t.id) && !closedTechIds(all, [optB.id]).has(t.id)),
        'nothing on the chosen side is listed as lost');
    assert.strictEqual(forkCost(all, all.find(t => !t.mutuallyExclusiveGroup)!.id, []), null);
});

test('a tech behind an undecided fork names the option it needs', () => {
    const behindB = all.find(t => (t.prerequisites ?? []).includes(optB.id))!;
    assert.strictEqual(requiredForkOption(byId, behindB.id, new Set())?.id, optB.id);
    assert.strictEqual(requiredForkOption(byId, behindB.id, new Set([espT2.group])), null, 'decided forks are not mentioned');
});

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
