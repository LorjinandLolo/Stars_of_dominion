/**
 * scripts/test-tech-phase0.ts
 *
 * Tech migration Phase 0 — research completion.
 *
 * Before this phase, TechEngine.assignResearch never set slot.ticksRequired and
 * the worker's completion check treated a falsy requirement as "never ready", so
 * research never completed in the live game. This exercises the real worker path
 * (runStrategicTick -> step4_research) rather than the debug-only
 * TechEngine.tickResearch, and asserts:
 *
 *   1. assignResearch converts researchCost (hours) into ticks
 *   2. a tech actually completes on the worker path
 *   3. modifier effects reach globalModifiers
 *   4. mutually exclusive siblings are locked (identity forks enforced)
 *   5. the slot is freed, so a faction can research more than once
 *   6. slots persisted before the fix heal on the next tick
 *
 * Run: npx tsx scripts/test-tech-phase0.ts
 */
import { TechEngine, registry, applyUnlock, ticksForTech } from '../lib/tech/engine';
import '../lib/tech/techData'; // side effect: registers all tech trees
import { runStrategicTick } from '../lib/time/tick-processor';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { TICK_INTERVAL_HOURS } from '../lib/time/time-config';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
    if (cond) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

const TICK_SECONDS = TICK_INTERVAL_HOURS * 3600;

async function advance(world: any, ticks: number, from: number) {
    let t = from;
    for (let i = 0; i < ticks; i++) {
        t += TICK_SECONDS;
        await runStrategicTick(new Date(t * 1000), i, world);
    }
    return t;
}

async function main() {
    const world: any = getGameWorldState();
    let clock = world.nowSeconds ?? 0;

    // ── 1. Tick conversion ──────────────────────────────────────────────────
    // eco_t1_1 "Automated Mining Systems": 50h, +5% eco_production_mult.
    const TECH = 'eco_t1_1';
    const def = registry.get(TECH)!;
    const FACTION = 'phase0-faction';

    console.log(`\n[1] assignResearch — ${def.name} (${def.researchCost}h, tick = ${TICK_INTERVAL_HOURS}h)`);
    let state = TechEngine.initPlayerState(FACTION);
    state = TechEngine.assignResearch(state, 'slot-1', TECH, clock);
    const assigned = state.activeSlots[0];
    const expected = Math.ceil(def.researchCost / TICK_INTERVAL_HOURS);

    check('ticksRequired is set, not 0', assigned.ticksRequired > 0, `got ${assigned.ticksRequired}`);
    check(`ticksRequired = ceil(${def.researchCost}/${TICK_INTERVAL_HOURS}) = ${expected}`,
        assigned.ticksRequired === expected, `got ${assigned.ticksRequired}`);
    check('ticksForTech agrees with assignResearch', ticksForTech(def) === assigned.ticksRequired);
    check('status is researching', assigned.status === 'researching');

    world.tech.set(FACTION, state);

    // ── 2/3. Completion on the real worker path ─────────────────────────────
    console.log(`\n[2] runStrategicTick x${expected} — the live worker path`);
    clock = await advance(world, expected, clock);

    const after = world.tech.get(FACTION)!;
    check('tech unlocked', after.unlockedTechIds.includes(TECH),
        `unlocked = [${after.unlockedTechIds.join(', ')}]`);
    check('eco_production_mult reached globalModifiers (1.05)',
        Math.abs((after.globalModifiers['eco_production_mult'] ?? 0) - 1.05) < 1e-9,
        `got ${after.globalModifiers['eco_production_mult']}`);

    // ── 5. Slot freed ───────────────────────────────────────────────────────
    console.log('\n[3] slot freed for reuse');
    const freed = after.activeSlots[0];
    check('techId cleared', freed.techId === null, `got ${freed.techId}`);
    check('slot is assignable (empty status or null techId)',
        freed.status === 'empty' || freed.techId === null, `status ${freed.status}`);
    const second = TechEngine.assignResearch(after, 'slot-1', 'eco_t1_2', clock);
    check('a second research can start', second.activeSlots[0].techId === 'eco_t1_2');

    // ── 4. Identity forks ───────────────────────────────────────────────────
    console.log('\n[4] mutual exclusivity through the shared unlock path');
    const fork = TechEngine.initPlayerState('phase0-fork');
    applyUnlock(fork, 'mil_t2_ovr_1'); // Heavy Armor Doctrine — military_t2_path
    const rivals = registry.getAll()
        .filter(t => t.mutuallyExclusiveGroup === 'military_t2_path' && t.id !== 'mil_t2_ovr_1')
        .map(t => t.id);

    check('fork group has rivals', rivals.length > 0, `members: ${rivals.join(', ')}`);
    check('every rival locked', rivals.every(id => fork.lockedTechIds.includes(id)),
        `locked = [${fork.lockedTechIds.join(', ')}]`);
    let rejected = false;
    try { TechEngine.assignResearch(fork, 'slot-1', rivals[0], clock); } catch { rejected = true; }
    check('assignResearch rejects a locked rival', rejected);

    // ── 6. Repair pass for slots saved before the fix ───────────────────────
    console.log('\n[5] repair pass — legacy slot with ticksRequired = 0');
    const STUCK = 'phase0-stuck';
    world.tech.set(STUCK, {
        factionId: STUCK,
        unlockedTechIds: [],
        activeEffects: [],
        activeSlots: [{
            slotId: 'slot-1', techId: TECH, startTime: 0, progressHours: 0,
            ticksCompleted: 0, ticksRequired: 0, status: 'researching',
        }],
        maxSlots: 1,
        globalModifiers: {},
        researchPoints: 0,
        lockedTechIds: [],
    });

    clock = await advance(world, 1, clock);
    const healed = world.tech.get(STUCK)!.activeSlots[0];
    check('ticksRequired derived on the next tick', healed.ticksRequired === expected,
        `got ${healed.ticksRequired}`);

    clock = await advance(world, expected, clock);
    check('previously stuck faction completes',
        world.tech.get(STUCK)!.unlockedTechIds.includes(TECH),
        `unlocked = [${world.tech.get(STUCK)!.unlockedTechIds.join(', ')}]`);

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('THREW:', e); process.exit(1); });
