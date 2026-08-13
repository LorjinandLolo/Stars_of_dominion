// scripts/test-narrative-phase2.ts
// Smoke test for the Narrative System Phase 2 (derived memory).
// Run: npx tsx scripts/test-narrative-phase2.ts
//
// The phase exists to make one sentence possible: "this is the fourth such
// incident, in what observers now call the X Question." So the test manufactures
// a quarrel and checks the sentence actually reaches print.
//
// Covers:
//   1. Repeated hostility between a pair becomes a Feud, named once and kept.
//   2. Deniability protects you from history: invisible ops build no feud.
//   3. An isolated clash is not a feud (the threshold means something).
//   4. Feuds go dormant when the shooting stops.
//   5. The feud, prior coverage, firsts and reversals reach the article.
//   6. Context raises effective importance and is recorded on the article.
//   7. Eras segment history at the quiet stretches.

import assert from 'assert';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../lib/db';
import { deriveFeuds, feudBetween, memoryFor, segmentEras } from '../lib/narrative/memory-service';
import { narrateOnce } from '../lib/narrative/narrator-service';

const TEST_DAY = 999_002;
const LOC = '__test__narrative-phase2';
const LOC_B = '__test__narrative-phase2-b';
const BASE_TICK = 800_000;

const RED = 'faction-test-red';
const BLUE = 'faction-test-blue';
const GREY = 'faction-test-grey';

type Spec = {
    type: string;
    importance: number;
    actor: string; actorName: string;
    target?: string; targetName?: string;
    tickOffset: number;
    facts?: Record<string, unknown>;
    attribution?: string;
    location?: string;
    narrated?: boolean;
};

async function seed(specs: Spec[]): Promise<void> {
    await prisma.chronicleEvent.createMany({
        data: specs.map(s => ({
            tick: BASE_TICK + s.tickOffset,
            day: TEST_DAY,
            type: s.type,
            importance: s.importance,
            actorIds: JSON.stringify([s.actor]),
            targetIds: JSON.stringify(s.target ? [s.target] : []),
            actorNames: JSON.stringify([s.actorName]),
            targetNames: JSON.stringify(s.targetName ? [s.targetName] : []),
            location: s.location ?? LOC,
            facts: JSON.stringify(s.facts ?? {}),
            attribution: s.attribution ?? 'exposed',
            narratedAt: s.narrated ? new Date() : null,
        })),
    });
}

async function cleanup(): Promise<void> {
    await prisma.chronicleEvent.deleteMany({ where: { location: { in: [LOC, LOC_B] } } });
    await prisma.narrativeArticle.deleteMany({ where: { day: TEST_DAY } });
    await prisma.gazette.deleteMany({ where: { day: TEST_DAY } });
    await prisma.feud.deleteMany({ where: { OR: [{ factionAId: { startsWith: 'faction-test-' } }, { factionBId: { startsWith: 'faction-test-' } }] } });
}

async function main() {
    await cleanup();

    // ── 1. A quarrel becomes a feud ──────────────────────────────────────────
    // Four public clashes, three of them over the same world.
    await seed([
        { type: 'battle_resolved', importance: 45, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', tickOffset: 0, facts: { planetName: 'Kessel' } },
        { type: 'system_captured', importance: 58, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', tickOffset: 10, facts: { systemName: 'Kessel' } },
        { type: 'planet_bombarded', importance: 62, actor: BLUE, actorName: 'Blue Union', target: RED, targetName: 'Red Compact', tickOffset: 20, facts: { planetName: 'Kessel' } },
        { type: 'treaty_broken', importance: 74, actor: BLUE, actorName: 'Blue Union', target: RED, targetName: 'Red Compact', tickOffset: 30, facts: { treatyType: 'non_aggression' } },
    ]);

    const active = await deriveFeuds(BASE_TICK + 30);
    console.log(`[1] deriveFeuds found ${active} active feud(s)`);
    assert.ok(active >= 1, 'four hostile exchanges must produce a feud');

    const feud = await feudBetween(RED, BLUE);
    assert.ok(feud, 'the feud must be findable in either direction');
    assert.strictEqual(feud!.eventCount, 4, 'all four clashes count');
    assert.strictEqual(feud!.status, 'active', 'recent fighting means an active feud');
    console.log(`[2] feud named "${feud!.epithet}" — ${feud!.eventCount} incidents, ${feud!.highlights.length} highlights`);
    assert.ok(/Kessel/.test(feud!.epithet), 'the contested world should give the feud its name');

    // Order must not matter, and the name must not churn on recomputation.
    assert.deepStrictEqual(await feudBetween(BLUE, RED), feud, 'the pair is unordered');
    await deriveFeuds(BASE_TICK + 30);
    const reNamed = await feudBetween(RED, BLUE);
    assert.strictEqual(reNamed!.epithet, feud!.epithet, 'an epithet is coined once and kept');
    console.log('[3] feud name is stable across recomputation');

    // ── 2. Deniability protects you from history ─────────────────────────────
    await seed([
        { type: 'operation_exposed', importance: 66, actor: GREY, actorName: 'Grey Cartel', target: BLUE, targetName: 'Blue Union', tickOffset: 40, attribution: 'invisible' },
        { type: 'operation_exposed', importance: 66, actor: GREY, actorName: 'Grey Cartel', target: BLUE, targetName: 'Blue Union', tickOffset: 41, attribution: 'invisible' },
        { type: 'operation_exposed', importance: 66, actor: GREY, actorName: 'Grey Cartel', target: BLUE, targetName: 'Blue Union', tickOffset: 42, attribution: 'invisible' },
        { type: 'operation_exposed', importance: 66, actor: GREY, actorName: 'Grey Cartel', target: BLUE, targetName: 'Blue Union', tickOffset: 43, attribution: 'invisible' },
    ]);
    await deriveFeuds(BASE_TICK + 43);
    assert.strictEqual(await feudBetween(GREY, BLUE), null, 'unattributable acts must build no grudge');
    console.log('[4] four invisible operations produced no feud — deniability holds');

    // The same four, once the galaxy can see them, do build one.
    await prisma.chronicleEvent.updateMany({
        where: { location: LOC, attribution: 'invisible' },
        data: { attribution: 'exposed' },
    });
    await deriveFeuds(BASE_TICK + 43);
    const nowVisible = await feudBetween(GREY, BLUE);
    assert.ok(nowVisible, 'the same acts, attributed, do build a grudge');
    console.log(`[5] once exposed, the same acts produced "${nowVisible!.epithet}"`);

    // ── 3. One clash is not a feud ───────────────────────────────────────────
    const LONER = 'faction-test-loner';
    await seed([
        { type: 'battle_resolved', importance: 45, actor: LONER, actorName: 'Loner Reach', target: BLUE, targetName: 'Blue Union', tickOffset: 50 },
    ]);
    await deriveFeuds(BASE_TICK + 50);
    assert.strictEqual(await feudBetween(LONER, BLUE), null, 'a single clash is not a rivalry');
    console.log('[6] an isolated clash stayed below the feud threshold');

    // ── 4. Feuds cool ────────────────────────────────────────────────────────
    // Recompute far in the future: nothing recent, so the quarrel goes quiet.
    await deriveFeuds(BASE_TICK + 30 + 4 * 61);
    const cooled = await feudBetween(RED, BLUE);
    assert.strictEqual(cooled!.status, 'dormant', 'a feud with no recent incident goes dormant');
    console.log(`[7] with no fresh incidents the feud went ${cooled!.status}`);

    // ── 5. Memory reaches the article ────────────────────────────────────────
    await prisma.chronicleEvent.deleteMany({ where: { location: { in: [LOC, LOC_B] } } });
    await prisma.feud.deleteMany({ where: { OR: [{ factionAId: { startsWith: 'faction-test-' } }, { factionBId: { startsWith: 'faction-test-' } }] } });

    // A history the galaxy already reported on...
    await seed([
        { type: 'capital_captured', importance: 95, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', tickOffset: 0, facts: { systemName: 'Kessel' }, narrated: true },
        { type: 'battle_resolved', importance: 45, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', tickOffset: 5, facts: { planetName: 'Kessel' } },
        { type: 'system_captured', importance: 58, actor: BLUE, actorName: 'Blue Union', target: RED, targetName: 'Red Compact', tickOffset: 10, facts: { systemName: 'Kessel' } },
    ]);
    // ...including a published article, so precedent has something to cite.
    const priorEvent = await prisma.chronicleEvent.findFirst({ where: { location: LOC, type: 'capital_captured' } });
    await prisma.narrativeArticle.create({
        data: {
            eventIds: JSON.stringify([priorEvent!.id]),
            publisherId: 'galactic-wire',
            kind: 'news',
            headline: 'THE CAPITAL FALLS: Kessel taken by Red Compact',
            body: 'Earlier coverage.',
            day: TEST_DAY,
        },
    });

    // The newest clash, unnarrated, is what the narrator will write about.
    await seed([
        { type: 'planet_bombarded', importance: 62, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', tickOffset: 15, facts: { planetName: 'Kessel', stabilityAfter: 20, orbitHeld: false } },
    ]);
    await deriveFeuds(BASE_TICK + 15);

    const memory = await memoryFor({
        eventIds: ['nonexistent'],
        type: 'planet_bombarded',
        actorIds: [RED], targetIds: [BLUE],
        location: LOC,
        tick: BASE_TICK + 15,
        attribution: 'exposed',
    });
    console.log(`[8] memory: feud=${memory.feud?.epithet ?? 'none'}, precedents=${memory.precedents.length}, reversal=${memory.isReversal}, bonus=+${memory.importanceBonus}`);
    assert.ok(memory.feud, 'the running quarrel must be found');
    assert.ok(memory.precedents.length >= 1, 'prior coverage of the same place must be cited');
    assert.ok(memory.isReversal, 'ground that has changed hands before is a reversal');
    assert.ok(memory.importanceBonus > 0, 'context must raise importance');

    const summary = await narrateOnce({ limit: 25 });
    console.log(`[9] narrator published ${summary.articles} article(s)`);
    // Pick the bombardment specifically: articles are now written in
    // context-boosted order, so "the most recent row" is the quietest story.
    const article = await prisma.narrativeArticle.findFirst({
        where: { day: TEST_DAY, kind: 'news', headline: { contains: 'orbital bombardment' } },
    });
    assert.ok(article, 'the new clash must have been written up');
    console.log(`[10] "${article!.headline}"\n     …${article!.body.split('\n\n').pop()}`);

    assert.ok(/incident between the two powers/.test(article!.body), 'the article must place the event in its quarrel');
    assert.ok(/Kessel/.test(article!.body), 'and name the quarrel');
    assert.ok(/Readers may recall/.test(article!.body), 'and cite prior coverage');

    const stance = JSON.parse(article!.stance ?? '{}');
    assert.ok(stance.feud, 'the feud is recorded on the article for later use');
    assert.ok(stance.effectiveImportance > 62, 'context-boosted importance is recorded');
    console.log(`[11] stance: feud="${stance.feud}", effectiveImportance=${stance.effectiveImportance}, cited=${stance.citedPrecedents.length}`);

    // ── 6. A galactic first says so ──────────────────────────────────────────
    const firstMemory = await memoryFor({
        eventIds: [],
        type: 'pirate_state_recognized', // nothing of the kind seeded
        actorIds: [RED], targetIds: [],
        location: null,
        tick: BASE_TICK + 20,
        attribution: 'exposed',
        importance: 76,
    });
    assert.ok(firstMemory.isGalacticFirst, 'an unprecedented notable event is a galactic first');
    console.log(`[12] unprecedented event flagged as a galactic first (+${firstMemory.importanceBonus})`);

    // A routine event with no precedent is NOT history — every galaxy has a
    // first skirmish and nobody writes it down that way.
    const routineFirst = await memoryFor({
        eventIds: [],
        type: 'trade_route_lost',
        actorIds: [RED], targetIds: [],
        location: null,
        tick: BASE_TICK + 20,
        attribution: 'exposed',
        importance: 24,
    });
    assert.strictEqual(routineFirst.isGalacticFirst, false, 'a routine first is not a galactic first');
    console.log('[12b] a routine unprecedented event correctly claimed nothing');

    // ── 7. Eras ──────────────────────────────────────────────────────────────
    await seed([
        { type: 'empire_eliminated', importance: 98, actor: RED, actorName: 'Red Compact', tickOffset: 2000, location: LOC_B },
        { type: 'civil_war_started', importance: 92, actor: BLUE, actorName: 'Blue Union', tickOffset: 2005, location: LOC_B },
    ]);
    const eras = await segmentEras();
    console.log(`[13] history segments into ${eras.length} era(s)`);
    assert.ok(eras.length >= 2, 'a long quiet stretch must close a chapter');

    await cleanup();
    console.log('\n✅ Narrative Phase 2: the galaxy remembers — feuds form, cool, and colour the news.');
}

main()
    .catch(async err => {
        console.error('❌ Phase 2 test failed:', err);
        try { await cleanup(); } catch { /* leave the mess if we cannot clear it */ }
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
