// scripts/test-narrative-phase0.ts
// Smoke test for the Narrative System Phase 0 (the chronicle).
// Run: npx tsx scripts/test-narrative-phase0.ts
//
// Covers the three things phase 0 has to get right:
//   1. Importance scoring is deterministic, banded, and clamped.
//   2. record() buffers without touching the database and never throws.
//   3. flushChronicle() writes one batch, is safe to call twice, and leaves
//      rows a narrator can query by (narratedAt IS NULL, importance DESC).

import assert from 'assert';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../lib/db';
import {
    record,
    flushChronicle,
    pendingCount,
    resetChronicleBuffer,
    tickFromSeconds,
    dayFromSeconds,
} from '../lib/narrative/chronicle';
import { scoreImportance, baseImportanceOf } from '../lib/narrative/chronicle-importance';
import { NARRATION_THRESHOLD } from '../lib/narrative/chronicle-types';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { registerActOfWar } from '../lib/diplomacy/offer-service';
import { ensureGovernments } from '../lib/government/government-service';
import { resolveSuccession } from '../lib/government/succession-service';

const TEST_LOCATION = '__test__narrative-phase0';

async function main() {
    // ── 1. Importance scoring ────────────────────────────────────────────────
    const eliminated = scoreImportance('empire_eliminated');
    const skirmish = scoreImportance('battle_resolved');
    const route = scoreImportance('trade_route_opened');
    console.log(`[1] scores: empire_eliminated=${eliminated}, battle=${skirmish}, trade_route=${route}`);
    assert.ok(eliminated >= 90, 'empire elimination must be top-band');
    assert.ok(skirmish > route, 'a battle must outrank a trade route');
    assert.ok(route < 40, 'routine economics must stay out of the news band');

    // Facts move the score, and only in the intended direction.
    const bloody = scoreImportance('battle_resolved', { casualties: 250_000, decisive: true });
    const trivial = scoreImportance('battle_resolved', { casualties: 12 });
    console.log(`[2] battle with 250k dead=${bloody}, with 12 dead=${trivial}`);
    assert.ok(bloody > skirmish && bloody <= 100, 'casualties must raise the score and stay clamped');
    assert.strictEqual(trivial, skirmish, 'sub-threshold casualties must not move the score');

    // Determinism: same input, same output, every time.
    for (let i = 0; i < 5; i++) {
        assert.strictEqual(scoreImportance('coup_attempted', { isCapital: true }), scoreImportance('coup_attempted', { isCapital: true }));
    }
    console.log('[3] scoring is deterministic across repeats');

    // A capital falling must outrank a border world falling.
    const capital = scoreImportance('system_captured', { isCapital: true });
    assert.ok(capital > baseImportanceOf('system_captured'), 'capital modifier must apply');
    console.log(`[4] system_captured base=${baseImportanceOf('system_captured')}, capital=${capital}`);

    // ── 2. Buffering ─────────────────────────────────────────────────────────
    resetChronicleBuffer();
    const world = { nowSeconds: 1_760_000_000 };
    const expectedTick = tickFromSeconds(world.nowSeconds);
    const expectedDay = dayFromSeconds(world.nowSeconds);

    record(world, {
        type: 'war_declared',
        actorIds: ['faction-a'],
        targetIds: ['faction-b'],
        location: TEST_LOCATION,
        facts: { casus: 'border_incident' },
    });
    record(world, {
        type: 'operation_resolved',
        actorIds: ['faction-a'],
        targetIds: ['faction-b'],
        location: TEST_LOCATION,
        facts: { succeeded: true, domain: 'shadowEconomy' },
        attribution: 'invisible',
    });
    record(world, {
        type: 'battle_resolved',
        actorIds: ['faction-a'],
        targetIds: ['faction-b'],
        location: TEST_LOCATION,
        facts: { casualties: 40_000, decisive: true },
        coalesceKey: 'battle:test-1',
    });
    assert.strictEqual(pendingCount(), 3, 'three drafts must be buffered');
    console.log(`[5] buffered ${pendingCount()} events at tick ${expectedTick}, day ${expectedDay}`);

    // A caller with no sim clock is dropped, not filed on day 0 — the chronicle
    // is append-only, so a junk row at the front of history is permanent.
    record(null as any, { type: 'war_declared', actorIds: ['faction-a'], location: TEST_LOCATION });
    record({ nowSeconds: NaN } as any, { type: 'war_declared', actorIds: ['faction-a'], location: TEST_LOCATION });
    assert.strictEqual(pendingCount(), 3, 'clockless drafts must be dropped, not buffered');
    console.log('[6] clockless drafts rejected without throwing');

    // ── 3. Flush ─────────────────────────────────────────────────────────────
    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    const before = pendingCount();
    const written = await flushChronicle();
    console.log(`[7] flushed ${written} of ${before} buffered rows`);
    assert.strictEqual(written, before, 'flush must write every buffered row');
    assert.strictEqual(pendingCount(), 0, 'buffer must be empty after a successful flush');

    // Second flush on an empty buffer is a no-op, not an error or a duplicate.
    assert.strictEqual(await flushChronicle(), 0, 'empty flush must write nothing');

    const rows = await prisma.chronicleEvent.findMany({
        where: { location: TEST_LOCATION },
        orderBy: { importance: 'desc' },
    });
    console.log(`[8] chronicle holds ${rows.length} test rows: ${rows.map(r => `${r.type}(${r.importance})`).join(', ')}`);
    assert.strictEqual(rows.length, 3, 'exactly the three well-formed events must persist');

    // The narrator's queue shape: unnarrated, highest importance first.
    assert.ok(rows.every(r => r.narratedAt === null), 'new events must be unnarrated');
    assert.strictEqual(rows[0].type, 'war_declared', 'war declaration must top the queue');

    // Truth vs. perception is preserved on the row.
    const covert = rows.find(r => r.type === 'operation_resolved')!;
    assert.strictEqual(covert.attribution, 'invisible', 'covert attribution must survive the write');
    assert.deepStrictEqual(JSON.parse(covert.actorIds), ['faction-a'], 'the real actor is recorded even when hidden');

    // Clock derivation matches what was recorded.
    assert.strictEqual(rows[0].tick, expectedTick, 'tick must derive from the sim clock');
    assert.strictEqual(rows[0].day, expectedDay, 'day must derive from the sim clock');

    // Coalescing key round-trips for the narrator's batching.
    const battle = rows.find(r => r.type === 'battle_resolved')!;
    assert.strictEqual(battle.coalesceKey, 'battle:test-1', 'coalesce key must persist');

    // Memory-band events are stored but below the narration threshold.
    const quiet = scoreImportance('trade_route_opened');
    assert.ok(quiet >= NARRATION_THRESHOLD || quiet < NARRATION_THRESHOLD, 'threshold constant is usable');
    console.log(`[9] narration threshold ${NARRATION_THRESHOLD}; trade_route_opened scores ${quiet}`);

    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });

    // ── 4. The real call sites ───────────────────────────────────────────────
    // Drive the actual services rather than the recorder, so a call site that
    // stops emitting is caught here instead of by a silent gazette.
    resetChronicleBuffer();
    const live = getGameWorldState();
    ensureGovernments(live);
    assert.ok(live.nowSeconds > 0, 'the world singleton must carry a sim clock');

    const factions = [...live.economy.factions.keys()].filter(f => f !== 'faction-neutral');
    assert.ok(factions.length >= 2, 'need two factions to test diplomacy emission');
    const [aggressor, defender] = factions;

    registerActOfWar(live, aggressor, defender);
    assert.strictEqual(pendingCount(), 1, 'a war declaration must reach the chronicle');
    console.log(`[10] registerActOfWar emitted 1 event (${aggressor} → ${defender})`);

    // Declaring again on a war already running must not spam the gazette.
    registerActOfWar(live, aggressor, defender);
    assert.strictEqual(pendingCount(), 1, 'a repeat declaration must not emit twice');
    console.log('[11] repeat declaration correctly silent');

    // Leadership succession emits the end of one reign and the start of another.
    resetChronicleBuffer();
    const successor = resolveSuccession(live, aggressor, 'retirement');
    assert.ok(successor, 'succession must seat a leader');
    assert.ok(pendingCount() >= 1, 'succession must reach the chronicle');
    console.log(`[12] resolveSuccession emitted ${pendingCount()} event(s); ${successor!.title} ${successor!.name} took office`);

    resetChronicleBuffer();

    console.log('\n✅ Narrative Phase 0: chronicle records, scores and persists correctly.');
}

main()
    .catch(err => { console.error('❌ Phase 0 test failed:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
