// scripts/research-reward-probe.ts
// Rewards paid in research hours must move the bar the worker reads. They used
// to land in progressHours, which only debug tools read, so an outpost dig, a
// lab experiment and a native gift logged "pushed X forward" and changed nothing.
// Here a real ruins crisis and a real native grant run, then a strategic tick
// proves a boosted project really unlocks.
//
// Run:  npx tsx scripts/research-reward-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { executeOrder } from './game-loop';
import { contextFor } from '../lib/outposts/outpost-service';
import { openCrisisOfKind, resolveCrisis } from '../lib/outposts/crises';
import { createOutpostState } from '../lib/outposts/outpost-map';
import { grantResearchHours } from '../lib/natives/natives';
import { addResearchHours, registry, ticksForTech } from '../lib/tech/engine';
import { TICK_INTERVAL_HOURS } from '../lib/time/time-config';
import { EXPERIMENT_MIN_HOURS, EXPERIMENT_SHARE } from '../lib/outposts/outpost-catalog';
import '../lib/tech/techData';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('research-reward');
    const realLog = console.log;
    const quiet = quietConsole();
    let world: any = bootSoakWorld();
    const human = empireIds(world)[0];
    world.claimedFactionIds = [human];
    world.economy.factions.get(human).reserves.CREDITS = 1_000_000;

    const tech = registry.getAll().find(t => !t.prerequisites?.length && !t.mutuallyExclusiveGroup)!;
    executeOrder(world, 'TECH_START_RESEARCH', { techId: tech.id }, human);
    const slotOf = (w: any) => w.tech.get(human).activeSlots.find((s: any) => s.techId === tech.id);
    const slot = slotOf(world);
    check('research is running', !!slot && slot.ticksRequired === ticksForTech(tech));

    // ── The pure conversion ──────────────────────────────────────────────────
    const unit = { ticksCompleted: 1, ticksRequired: 10 };
    addResearchHours(unit, TICK_INTERVAL_HOURS * 2);
    check('hours become ticks', unit.ticksCompleted === 3, `${unit.ticksCompleted}`);
    addResearchHours(unit, 1000);
    check('capped at the finish', unit.ticksCompleted === 10);

    // ── A real dig ───────────────────────────────────────────────────────────
    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === human);
    const state: any = createOutpostState(planet, world.nowSeconds);
    planet.outpost = state;
    state.tier = 1;
    state.cells[0].terrain = 'ruin';
    delete state.cells[0].module;
    const ctx = contextFor(world, planet, state);
    const crisis = openCrisisOfKind(state, ctx, 'ruins')!;
    check('the ruins crisis opens', !!crisis);
    const before = slot.ticksCompleted ?? 0;
    resolveCrisis(state, ctx, crisis.id, 'excavate', 'player');
    const hours = Math.max(EXPERIMENT_MIN_HOURS, tech.researchCost * EXPERIMENT_SHARE) * 3;
    const gained = (slot.ticksCompleted ?? 0) - before;
    check('excavating moves the bar', Math.abs(gained - hours / TICK_INTERVAL_HOURS) < 1e-9, `${gained.toFixed(2)} ticks of ${slot.ticksRequired}`);

    // ── A native gift ────────────────────────────────────────────────────────
    const beforeGift = slot.ticksCompleted;
    grantResearchHours(world, human, 12);
    check('a native gift moves the bar', slot.ticksCompleted - beforeGift === 2, `${slot.ticksCompleted - beforeGift}`);

    // ── It really finishes ───────────────────────────────────────────────────
    addResearchHours(slot, 100_000);
    ({ world } = await stepSoak(world, 1));
    check('a boosted project unlocks on the next tick', world.tech.get(human).unlockedTechIds.includes(tech.id));
    check('and frees the slot', !slotOf(world));

    quiet.restore();
    console.log = realLog;
    console.log(results.join('\n'));
    console.log(`\n${results.length - failures} passed, ${failures} failed.`);
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
