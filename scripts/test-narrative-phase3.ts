// scripts/test-narrative-phase3.ts
// Smoke test for the Narrative System Phase 3 (voices and truth).
// Run: npx tsx scripts/test-narrative-phase3.ts
//
// Phase 3 makes the same facts read differently depending on who is printing
// them, and puts a model behind the prose without letting the model become a
// single point of failure.
//
// Covers:
//   1. Publisher selection follows incentive: unattributable acts go to the
//      pirate press, victories to the winner's state media, embarrassments to
//      the independents.
//   2. The chosen outlet's voice actually reaches the page, and is recorded.
//   3. State media covering its own setback does not deny it, but frames it.
//   4. The LLM writer degrades to the template on every failure mode, and
//      never publishes a name it was not given.
//   5. Budget caps hold: past the ceiling, prose keeps coming from templates.
//   6. Investigations reaching publication become chronicle events, and the
//      exposé cites the coverage that came before it.

import assert from 'assert';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../lib/db';
import { narrateOnce } from '../lib/narrative/narrator-service';
import { TemplateWriter } from '../lib/narrative/prose/template-writer';
import { LlmWriter } from '../lib/narrative/prose/llm-writer';
import { selectPublisher, stanceFor, clearPublisherCache, type Publisher } from '../lib/narrative/press-voices';
import { EMPTY_MEMORY } from '../lib/narrative/memory-service';
import type { NarratableEvent, NarrationRequest } from '../lib/narrative/prose/prose-types';

const TEST_DAY = 999_003;
const LOC = '__test__narrative-phase3';
const BASE_TICK = 700_000;

const RED = 'faction-test-red';
const BLUE = 'faction-test-blue';

const PUBLISHERS: Publisher[] = [
    { id: 'galactic_wire', type: 'INDEPENDENT_MEDIA', credibility: 75, bias: 0, masthead: 'The Galactic Wire' },
    { id: 'free_signal', type: 'PIRATE_PRESS', credibility: 40, bias: -100, masthead: 'Free Signal' },
    { id: `${RED}_STATE`, type: 'STATE_MEDIA', affiliatedEmpireId: RED, credibility: 60, bias: 100, masthead: 'Red Compact State Media' },
    { id: `${BLUE}_STATE`, type: 'STATE_MEDIA', affiliatedEmpireId: BLUE, credibility: 60, bias: 100, masthead: 'Blue Union State Media' },
];

function evt(over: Partial<NarratableEvent> = {}): NarratableEvent {
    return {
        id: 'evt-test', tick: BASE_TICK, day: TEST_DAY,
        type: 'system_captured' as any, importance: 58,
        actorIds: [RED], actorNames: ['Red Compact'],
        targetIds: [BLUE], targetNames: ['Blue Union'],
        location: LOC, facts: { systemName: 'Kessel' }, attribution: 'exposed',
        ...over,
    };
}

function req(event: NarratableEvent, publisher: Publisher, visibleActors?: string[]): NarrationRequest {
    return {
        events: [event],
        lead: event,
        visibleActors: visibleActors ?? event.actorNames,
        speculative: event.attribution.startsWith('suspected:'),
        day: event.day,
        memory: EMPTY_MEMORY,
        stance: stanceFor(event, publisher),
    };
}

async function cleanup(): Promise<void> {
    await prisma.chronicleEvent.deleteMany({ where: { location: LOC } });
    await prisma.narrativeArticle.deleteMany({ where: { day: TEST_DAY } });
    await prisma.gazette.deleteMany({ where: { day: TEST_DAY } });
}

async function main() {
    await cleanup();
    clearPublisherCache();

    // ── 1. Selection follows incentive ───────────────────────────────────────
    const hidden = selectPublisher(evt({ type: 'operation_resolved' as any, attribution: 'invisible' }), PUBLISHERS);
    assert.strictEqual(hidden.type, 'PIRATE_PRESS', 'an unattributable act belongs to the outlet willing to speculate');
    console.log(`[1] unattributable act went to ${hidden.masthead}`);

    const victory = selectPublisher(evt({ type: 'capital_captured' as any }), PUBLISHERS);
    assert.strictEqual(victory.affiliatedEmpireId, RED, "a victory is told by the winner's own media");
    console.log(`[2] capture went to ${victory.masthead}`);

    const grievance = selectPublisher(evt({ type: 'planet_bombarded' as any }), PUBLISHERS);
    assert.strictEqual(grievance.affiliatedEmpireId, BLUE, 'being bombed is a story the victim tells');
    console.log(`[3] bombardment went to ${grievance.masthead}`);

    const exposure = selectPublisher(evt({ type: 'operation_exposed' as any }), PUBLISHERS);
    assert.strictEqual(exposure.type, 'INDEPENDENT_MEDIA', 'nobody breaks their own scandal');
    console.log(`[4] exposure went to ${exposure.masthead}`);

    // A state medium nobody believes cannot carry the win.
    const discredited = PUBLISHERS.map(p =>
        p.affiliatedEmpireId === RED ? { ...p, credibility: 20 } : p);
    const fallenBack = selectPublisher(evt({ type: 'capital_captured' as any }), discredited);
    assert.strictEqual(fallenBack.type, 'INDEPENDENT_MEDIA', 'a discredited outlet loses the story');
    console.log(`[5] with credibility 20, the win went to ${fallenBack.masthead} instead`);

    // ── 2. Voice reaches the page ────────────────────────────────────────────
    const writer = new TemplateWriter();
    const wire = PUBLISHERS[0], pirate = PUBLISHERS[1], redState = PUBLISHERS[2], blueState = PUBLISHERS[3];

    const asWire = await writer.write(req(evt(), wire));
    const asPirate = await writer.write(req(evt(), pirate));
    const asRed = await writer.write(req(evt(), redState));

    assert.notStrictEqual(asWire.body, asPirate.body, 'different outlets must not file identical copy');
    assert.notStrictEqual(asWire.body, asRed.body, 'state media must read differently from the wire');
    assert.ok(/Free Signal/.test(asPirate.body), 'the pirate outlet signs its own insinuation');
    assert.ok(/Red Compact State Media/.test(asRed.body), 'state media puts its name to the framing');
    console.log(`[6] three outlets, three stories:\n    WIRE:   …${asWire.body.slice(-70)}\n    PIRATE: …${asPirate.body.slice(-70)}\n    STATE:  …${asRed.body.slice(-70)}`);

    // ── 3. State media covering its own setback ──────────────────────────────
    const setback = evt({ type: 'planet_bombarded' as any, facts: { planetName: 'Blue Prime', stabilityAfter: 15, orbitHeld: false } });
    const asVictim = await writer.write(req(setback, blueState));
    assert.ok(/no cause for alarm|responding/i.test(asVictim.body), 'state media frames its own setback rather than denying it');
    assert.ok(/Blue Prime/.test(asVictim.body), 'and still reports the facts');
    console.log(`[7] victim state media: …${asVictim.body.slice(-90)}`);

    // ── 4. The LLM writer degrades safely ────────────────────────────────────
    // Point it at a daemon that is not there. Every failure mode ends in prose.
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:9';
    const brokenLlm = new LlmWriter({ provider: 'ollama', minImportance: 0, maxCallsPerHour: 10, maxCallsPerDay: 10 });
    const degraded = await brokenLlm.write(req(evt(), wire));
    assert.ok(degraded.body.length > 40, 'an unreachable model must still produce an article');
    assert.strictEqual(degraded.provider, 'template', 'and it must be honest about who wrote it');
    console.log(`[8] unreachable model degraded to template: "${degraded.headline}"`);

    // Below the importance floor the model is not called at all.
    const cheap = new LlmWriter({ provider: 'ollama', minImportance: 90 });
    const cheapResult = await cheap.write(req(evt({ importance: 30 }), wire));
    assert.strictEqual(cheapResult.provider, 'template', 'routine news does not spend the model budget');
    assert.deepStrictEqual(cheap.budgetSpent(), { hour: 0, day: 0 }, 'and no call was made');
    console.log('[9] a routine story spent no model budget');

    // ── 5. Budget caps ───────────────────────────────────────────────────────
    const capped = new LlmWriter({ provider: 'ollama', minImportance: 0, maxCallsPerHour: 2, maxCallsPerDay: 100 });
    for (let i = 0; i < 5; i++) await capped.write(req(evt(), wire));
    const spent = capped.budgetSpent();
    assert.strictEqual(spent.hour, 2, 'the hourly ceiling must hold');
    console.log(`[10] five stories, ${spent.hour} model calls — the cap held and the rest came from templates`);

    // ── 6. Investigations become history, and cite what came before ──────────
    // Prior coverage the exposé can point at.
    await prisma.chronicleEvent.create({
        data: {
            tick: BASE_TICK, day: TEST_DAY, type: 'operation_exposed', importance: 80,
            actorIds: JSON.stringify([RED]), targetIds: JSON.stringify([BLUE]),
            actorNames: JSON.stringify(['Red Compact']), targetNames: JSON.stringify(['Blue Union']),
            location: LOC, facts: JSON.stringify({ domain: 'infiltration' }),
            attribution: 'exposed', narratedAt: new Date(),
        },
    });
    const priorEvent = await prisma.chronicleEvent.findFirst({ where: { location: LOC } });
    await prisma.narrativeArticle.create({
        data: {
            eventIds: JSON.stringify([priorEvent!.id]),
            publisherId: 'galactic_wire', kind: 'news', day: TEST_DAY,
            headline: 'EXPOSED: Red Compact caught running infiltration operations against Blue Union',
            body: 'Earlier coverage.',
        },
    });

    // The investigation lands.
    await prisma.chronicleEvent.create({
        data: {
            tick: BASE_TICK + 5, day: TEST_DAY, type: 'investigation_published', importance: 64,
            actorIds: JSON.stringify(['galactic_wire']), targetIds: JSON.stringify([BLUE]),
            actorNames: JSON.stringify(['The Galactic Wire']), targetNames: JSON.stringify(['Blue Union']),
            location: LOC, facts: JSON.stringify({ subject: 'diverted reconstruction funds', evidence: 78, obstructions: 2 }),
            attribution: 'exposed',
        },
    });

    const summary = await narrateOnce({ limit: 25 });
    console.log(`[11] narrator published ${summary.articles} article(s)`);

    const expose = await prisma.narrativeArticle.findFirst({
        where: { day: TEST_DAY, kind: 'investigation' },
    });
    assert.ok(expose, 'a published investigation must produce an investigation article, not plain news');
    assert.ok(/diverted reconstruction funds/.test(expose!.body), 'the exposé states its subject');
    assert.ok(/2 occasions/.test(expose!.body), 'stonewalling is part of the story');
    assert.ok(/Readers may recall/.test(expose!.body), 'and it cites the coverage that came before');
    console.log(`[12] "${expose!.headline}"\n     ${expose!.body.split('\n\n')[0].slice(0, 150)}…`);

    const stance = JSON.parse(expose!.stance ?? '{}');
    assert.ok(stance.masthead, 'the article records which masthead ran it');
    assert.ok(stance.publisherType, 'and what kind of outlet it was');
    console.log(`[13] filed by ${stance.masthead} (${stance.publisherType}), slant ${stance.slant}`);

    await cleanup();
    console.log('\n✅ Narrative Phase 3: the same facts, different mastheads — and the model can fail without the paper stopping.');
}

main()
    .catch(async err => {
        console.error('❌ Phase 3 test failed:', err);
        try { await cleanup(); } catch { /* leave the mess if we cannot clear it */ }
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
