// scripts/test-narrative-phase1.ts
// Smoke test for the Narrative System Phase 1 (the narrator).
// Run: npx tsx scripts/test-narrative-phase1.ts
//
// Covers what phase 1 promises:
//   1. Unnarrated events above the threshold become articles and front pages.
//   2. Running twice publishes nothing twice (the queue is idempotent).
//   3. Events sharing a coalesceKey become ONE article, not several.
//   4. Attribution is honoured: an invisible actor is never named in prose,
//      a suspected one is named as speculation, an exposed one is named flatly.
//   5. Sub-threshold events are retired to memory rather than narrated.

import assert from 'assert';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../lib/db';
import { narrateOnce, retireUnnarratableEvents } from '../lib/narrative/narrator-service';
import { TemplateWriter } from '../lib/narrative/prose/template-writer';
import { EMPTY_MEMORY } from '../lib/narrative/memory-service';

// A day far from any real game day, so the test never collides with, or
// pollutes, a live gazette.
const TEST_DAY = 999_001;
const TEST_LOCATION = '__test__narrative-phase1';

type SeedSpec = {
    type: string;
    importance: number;
    actorIds: string[];
    actorNames: string[];
    targetIds?: string[];
    targetNames?: string[];
    facts?: Record<string, unknown>;
    attribution?: string;
    coalesceKey?: string;
};

async function seed(specs: SeedSpec[]): Promise<void> {
    await prisma.chronicleEvent.createMany({
        data: specs.map((s, i) => ({
            tick: 900_000 + i,
            day: TEST_DAY,
            type: s.type,
            importance: s.importance,
            actorIds: JSON.stringify(s.actorIds),
            targetIds: JSON.stringify(s.targetIds ?? []),
            actorNames: JSON.stringify(s.actorNames),
            targetNames: JSON.stringify(s.targetNames ?? []),
            location: TEST_LOCATION,
            facts: JSON.stringify(s.facts ?? {}),
            attribution: s.attribution ?? 'exposed',
            coalesceKey: s.coalesceKey ?? null,
        })),
    });
}

async function cleanup(): Promise<void> {
    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    await prisma.gazette.deleteMany({ where: { day: TEST_DAY } });
    await prisma.narrativeArticle.deleteMany({ where: { day: TEST_DAY } });
}

async function main() {
    await cleanup();

    // ── 1. Events become articles ────────────────────────────────────────────
    await seed([
        {
            type: 'war_declared', importance: 82,
            actorIds: ['faction-aurelian'], actorNames: ['Aurelian Hegemony'],
            targetIds: ['faction-vektori'], targetNames: ['Vektori Technocracy'],
            facts: { oathbroken: false },
        },
        {
            type: 'capital_captured', importance: 95,
            actorIds: ['faction-vektori'], actorNames: ['Vektori Technocracy'],
            targetIds: ['faction-aurelian'], targetNames: ['Aurelian Hegemony'],
            facts: { systemName: 'Aurelia Prime', isCapital: true },
        },
    ]);

    const first = await narrateOnce({ limit: 25 });
    console.log(`[1] first pass: ${first.articles} article(s), ${first.eventsCovered} event(s), ${first.frontPage} front page`);
    assert.strictEqual(first.articles, 2, 'both events must be narrated');
    assert.strictEqual(first.eventsCovered, 2, 'both events must be marked');

    const articles = await prisma.narrativeArticle.findMany({ where: { day: TEST_DAY }, orderBy: { createdAt: 'asc' } });
    assert.strictEqual(articles.length, 2, 'two articles must exist');
    console.log(`[2] headlines:\n    - ${articles.map(a => a.headline).join('\n    - ')}`);

    // The loudest story must have been written first.
    assert.ok(/CAPITAL FALLS/i.test(articles[0].headline), 'the capital falling must outrank the declaration');
    // Phase 3 replaced the single wire service with real outlets chosen per
    // story, so this only asserts that something owns every article.
    assert.ok(articles.every(a => a.publisherId && a.publisherId.length > 0), 'every article has a publisher');
    assert.ok(articles.every(a => a.body.length > 80), 'articles must have a real body, not a stub');

    const front = await prisma.gazette.findMany({ where: { day: TEST_DAY } });
    assert.strictEqual(front.length, 2, 'both must reach the front page under the cap');
    assert.ok(front.every(g => g.lede && g.lede.length > 20), 'every front-page item needs a lede');
    assert.ok(front.every(g => g.tone), 'every front-page item needs a tone');
    console.log(`[3] gazette rows: ${front.map(g => `${g.tone}`).join(', ')}`);

    // ── 2. Idempotency ───────────────────────────────────────────────────────
    const second = await narrateOnce({ limit: 25 });
    assert.strictEqual(second.articles, 0, 'a second pass must publish nothing');
    assert.strictEqual(await prisma.narrativeArticle.count({ where: { day: TEST_DAY } }), 2, 'no duplicate articles');
    console.log('[4] second pass published nothing — queue is idempotent');

    // ── 3. Coalescing ────────────────────────────────────────────────────────
    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    await seed([
        {
            type: 'planet_bombarded', importance: 62,
            actorIds: ['faction-covenant'], actorNames: ['Altaris Covenant'],
            targetIds: ['faction-sarrak'], targetNames: ['Sarrak'],
            facts: { planetName: 'Sarrak Prime', stabilityAfter: 40, orbitHeld: false },
            coalesceKey: 'bombardment:sarrak-prime',
        },
        {
            type: 'planet_bombarded', importance: 62,
            actorIds: ['faction-covenant'], actorNames: ['Altaris Covenant'],
            targetIds: ['faction-sarrak'], targetNames: ['Sarrak'],
            facts: { planetName: 'Sarrak Prime', stabilityAfter: 30, orbitHeld: false },
            coalesceKey: 'bombardment:sarrak-prime',
        },
        {
            type: 'planet_bombarded', importance: 62,
            actorIds: ['faction-covenant'], actorNames: ['Altaris Covenant'],
            targetIds: ['faction-sarrak'], targetNames: ['Sarrak'],
            facts: { planetName: 'Sarrak Prime', stabilityAfter: 22, orbitHeld: false },
            coalesceKey: 'bombardment:sarrak-prime',
        },
    ]);

    const coalesced = await narrateOnce({ limit: 25 });
    console.log(`[5] three bombardments produced ${coalesced.articles} article(s) covering ${coalesced.eventsCovered} event(s)`);
    assert.strictEqual(coalesced.articles, 1, 'a shared coalesceKey must produce one article');
    assert.strictEqual(coalesced.eventsCovered, 3, 'all three events must be marked narrated');

    const bombardment = await prisma.narrativeArticle.findFirst({
        where: { day: TEST_DAY }, orderBy: { createdAt: 'desc' },
    });
    assert.ok(/3 separate actions/.test(bombardment!.body), 'the article should know it covers three strikes');
    console.log(`[6] "${bombardment!.headline}"`);

    // ── 4. Attribution ───────────────────────────────────────────────────────
    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    await seed([
        {
            type: 'operation_resolved', importance: 40,
            actorIds: ['faction-null-syndicate'], actorNames: ['Nullward Syndicate'],
            targetIds: ['faction-buthari'], targetNames: ['The Buthari'],
            facts: { domain: 'shadowEconomy', succeeded: true },
            attribution: 'invisible',
        },
    ]);
    await narrateOnce({ limit: 25 });
    const hidden = await prisma.narrativeArticle.findFirst({ where: { day: TEST_DAY }, orderBy: { createdAt: 'desc' } });
    const hiddenText = `${hidden!.headline} ${hidden!.body}`;
    assert.ok(!/Nullward/i.test(hiddenText), 'an invisible actor must NEVER be named in prose');
    assert.ok(/Buthari/i.test(hiddenText), 'the victim is still public — you can see your own house burn');
    console.log(`[7] invisible op published without naming the actor: "${hidden!.headline}"`);

    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    await seed([
        {
            type: 'operation_resolved', importance: 40,
            actorIds: ['faction-null-syndicate'], actorNames: ['Nullward Syndicate'],
            targetIds: ['faction-buthari'], targetNames: ['The Buthari'],
            facts: { domain: 'shadowEconomy', succeeded: true },
            attribution: 'suspected:faction-null-syndicate',
        },
    ]);
    await narrateOnce({ limit: 25 });
    const suspected = await prisma.narrativeArticle.findFirst({ where: { day: TEST_DAY }, orderBy: { createdAt: 'desc' } });
    assert.ok(/Nullward/i.test(`${suspected!.headline} ${suspected!.body}`), 'a suspected actor is named');
    assert.ok(JSON.parse(suspected!.stance ?? '{}').speculative === true, 'and the article records that it is speculation');
    console.log(`[8] suspected op named the suspect, flagged speculative: "${suspected!.headline}"`);

    // A frame-up: the galaxy suspects a faction that had nothing to do with it.
    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    await seed([
        {
            type: 'operation_resolved', importance: 40,
            actorIds: ['faction-null-syndicate'], actorNames: ['Nullward Syndicate'],
            targetIds: ['faction-buthari'], targetNames: ['The Buthari'],
            facts: { domain: 'infiltration', succeeded: true },
            attribution: 'suspected:faction-covenant',
        },
    ]);
    await narrateOnce({ limit: 25 });
    const framed = await prisma.narrativeArticle.findFirst({ where: { day: TEST_DAY }, orderBy: { createdAt: 'desc' } });
    const framedText = `${framed!.headline} ${framed!.body}`;
    assert.ok(!/Nullward/i.test(framedText), 'the real actor must not surface when someone else is blamed');
    assert.ok(/covenant/i.test(framedText), 'the blamed party is the one printed');
    console.log(`[9] frame-up printed the wrong name, as intended: "${framed!.headline}"`);

    // ── 5. Sub-threshold retirement ──────────────────────────────────────────
    await prisma.chronicleEvent.deleteMany({ where: { location: TEST_LOCATION } });
    await seed([
        {
            type: 'trade_route_opened', importance: 8,
            actorIds: ['faction-aurelian'], actorNames: ['Aurelian Hegemony'],
        },
    ]);
    const retired = await retireUnnarratableEvents();
    const afterRetire = await narrateOnce({ limit: 25 });
    console.log(`[10] retired ${retired} sub-threshold event(s); narrator then produced ${afterRetire.articles}`);
    assert.ok(retired >= 1, 'the routine event must be retired');
    assert.strictEqual(afterRetire.articles, 0, 'and never narrated');

    const survivor = await prisma.chronicleEvent.findFirst({ where: { location: TEST_LOCATION } });
    assert.ok(survivor && survivor.narratedAt !== null, 'the row survives for memory queries, marked as handled');

    // ── 6. The writer is deterministic ───────────────────────────────────────
    const writer = new TemplateWriter();
    const sample = {
        events: [] as any[],
        lead: {
            id: 'fixed-id', tick: 1, day: TEST_DAY, type: 'war_declared' as const, importance: 82,
            actorIds: ['a'], actorNames: ['Alpha'], targetIds: ['b'], targetNames: ['Beta'],
            location: null, facts: {}, attribution: 'exposed' as const,
        },
        visibleActors: ['Alpha'], speculative: false, day: TEST_DAY,
        memory: EMPTY_MEMORY,
        stance: {
            publisher: { id: 'galactic_wire', type: 'INDEPENDENT_MEDIA' as const, credibility: 75, bias: 0, masthead: 'The Galactic Wire' },
            slant: 'detached' as const,
            coveringOwnEmpire: false,
            sensational: false,
        },
    };
    sample.events = [sample.lead];
    const runA = await writer.write(sample);
    const runB = await writer.write(sample);
    assert.deepStrictEqual(runA, runB, 'the template writer must be deterministic');
    console.log('[11] template writer is deterministic across runs');

    await cleanup();
    console.log('\n✅ Narrative Phase 1: the narrator publishes, coalesces, respects attribution, and never repeats itself.');
}

main()
    .catch(async err => {
        console.error('❌ Phase 1 test failed:', err);
        try { await cleanup(); } catch { /* leave the mess if we cannot clear it */ }
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
