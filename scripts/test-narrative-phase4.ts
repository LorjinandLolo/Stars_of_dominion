// scripts/test-narrative-phase4.ts
// Smoke test for the Narrative System Phase 4 (history features).
// Run: npx tsx scripts/test-narrative-phase4.ts
//
// Phase 4 is the payoff: the galaxy stops producing only news and starts
// producing a past — named ages, obituaries that summarise a career, and an
// archive players can read back through.
//
// Covers:
//   1. A closed era is named once from what defined it, and the name sticks.
//   2. An era still in progress is NOT written up — the present is not history.
//   3. An era with a single pivotal event is not a chapter.
//   4. A leader's death is filed as an obituary and carries their record.
//   5. A leader with nothing on the record gets an honest obituary, not a blank.
//   6. Articles are filed under the right kind, which is what the archive
//      groups by.

import assert from 'assert';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../lib/db';
import { writeRetrospectives, listEras, careerOf } from '../lib/narrative/retrospective-service';
import { narrateOnce } from '../lib/narrative/narrator-service';

const TEST_DAY = 999_004;
const LOC = '__test__narrative-phase4';
const BASE = 600_000;

const RED = 'faction-test-red';
const BLUE = 'faction-test-blue';

type Spec = {
    type: string;
    importance: number;
    tickOffset: number;
    actor?: string; actorName?: string;
    target?: string; targetName?: string;
    facts?: Record<string, unknown>;
    narrated?: boolean;
};

async function seed(specs: Spec[]): Promise<void> {
    await prisma.chronicleEvent.createMany({
        data: specs.map(s => ({
            tick: BASE + s.tickOffset,
            day: TEST_DAY,
            type: s.type,
            importance: s.importance,
            actorIds: JSON.stringify(s.actor ? [s.actor] : []),
            targetIds: JSON.stringify(s.target ? [s.target] : []),
            actorNames: JSON.stringify(s.actorName ? [s.actorName] : []),
            targetNames: JSON.stringify(s.targetName ? [s.targetName] : []),
            location: LOC,
            facts: JSON.stringify(s.facts ?? {}),
            attribution: 'exposed',
            narratedAt: s.narrated ? new Date() : null,
        })),
    });
}

async function cleanup(): Promise<void> {
    await prisma.chronicleEvent.deleteMany({ where: { location: LOC } });
    await prisma.narrativeArticle.deleteMany({ where: { day: TEST_DAY } });
    await prisma.gazette.deleteMany({ where: { day: TEST_DAY } });
    await prisma.feud.deleteMany({ where: { OR: [{ factionAId: { startsWith: 'faction-test-' } }, { factionBId: { startsWith: 'faction-test-' } }] } });
}

async function main() {
    await cleanup();

    // ── 1. A closed era gets named ───────────────────────────────────────────
    // Two pivotal events close together, then a long silence.
    await seed([
        { type: 'capital_captured', importance: 95, tickOffset: 0, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', facts: { systemName: 'Kessel' }, narrated: true },
        { type: 'civil_war_started', importance: 92, tickOffset: 20, actor: BLUE, actorName: 'Blue Union', target: BLUE, targetName: 'Blue Union', facts: { rebelName: 'Free Blue' }, narrated: true },
        // Far enough ahead that the era above is closed and this one is current.
        { type: 'war_declared', importance: 82, tickOffset: 4000, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', narrated: true },
    ]);

    const written = await writeRetrospectives(BASE + 4000);
    console.log(`[1] wrote ${written} retrospective(s)`);
    assert.strictEqual(written, 1, 'exactly the one closed era should be written up');

    // Scoped by start tick, not by count: a real galaxy may already have
    // retrospectives of its own, and this test must not care.
    const ours = (await listEras()).filter(e => e.startTick === BASE);
    assert.strictEqual(ours.length, 1, 'our era is on record exactly once');
    console.log(`[2] era named "${ours[0].name}" (ticks ${ours[0].startTick}–${ours[0].endTick}, ${ours[0].pivotCount} pivots)`);
    assert.ok(/Division/.test(ours[0].name), 'a civil war should define the age it happened in');

    const retro = await prisma.narrativeArticle.findFirst({ where: { day: TEST_DAY, kind: 'retrospective' } });
    assert.ok(retro, 'the retrospective must exist as an article');
    assert.ok(/Kessel/.test(retro!.body), 'the retrospective recounts what happened in the era');
    assert.ok(/split in two/.test(retro!.body), 'including the civil war');
    console.log(`[3] "${retro!.headline}"\n     ${retro!.body.split('\n\n')[0].slice(0, 170)}…`);

    // Named once: a second pass must not rename or duplicate.
    const again = await writeRetrospectives(BASE + 4000);
    assert.strictEqual(again, 0, 'an era already named is left alone');
    assert.strictEqual((await listEras()).filter(e => e.startTick === BASE).length, 1, 'and not duplicated');
    console.log('[4] a second pass named nothing — era names are stable');

    // ── 2. The present is not history ────────────────────────────────────────
    // The tick-4000 war is its own era, but nothing has closed it yet.
    assert.ok(!(await listEras()).some(e => e.startTick === BASE + 4000), 'the ongoing era must not be written up');
    console.log('[5] the era still in progress was left unwritten');

    // ── 3. One event is not a chapter ────────────────────────────────────────
    await cleanup();
    await seed([
        { type: 'capital_captured', importance: 95, tickOffset: 0, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', narrated: true },
    ]);
    const before = (await listEras()).length;
    await writeRetrospectives(BASE + 4000);
    assert.strictEqual((await listEras()).length, before, 'a single event is not an age');
    console.log('[6] a lone pivotal event did not become an era');

    // ── 4. Obituaries carry a career ─────────────────────────────────────────
    await cleanup();
    // What the empire did during the leader's tenure...
    await seed([
        { type: 'war_declared', importance: 82, tickOffset: 0, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', narrated: true },
        { type: 'capital_captured', importance: 95, tickOffset: 10, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', facts: { systemName: 'Kessel' }, narrated: true },
        { type: 'war_ended', importance: 74, tickOffset: 20, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union', narrated: true },
    ]);

    const career = await careerOf({ factionId: RED, fromTick: BASE - 100, toTick: BASE + 30 });
    console.log(`[7] career assembled: ${career.length} entries — ${career[0]}`);
    assert.ok(career.length >= 3, 'a full tenure should surface several entries');

    // ...and then they die.
    await seed([
        { type: 'leader_died', importance: 55, tickOffset: 30, actor: RED, actorName: 'Red Compact', facts: { leaderName: 'Chancellor Vex Ordane', title: 'Chancellor', cause: 'death', yearsInOffice: 8 } },
    ]);

    await narrateOnce({ limit: 25 });
    const obit = await prisma.narrativeArticle.findFirst({ where: { day: TEST_DAY, kind: 'obituary' } });
    assert.ok(obit, 'a leader dying must be filed as an obituary, not plain news');
    assert.ok(/Vex Ordane/.test(obit!.headline), 'the obituary names them');
    assert.ok(/after 8 years/.test(obit!.body), 'and states how long they served');
    assert.ok(/Their tenure covered/.test(obit!.body), 'and summarises the record');
    assert.ok(/Kessel/.test(obit!.body), 'drawn from what actually happened');
    console.log(`[8] "${obit!.headline}"\n     ${obit!.body.split('\n\n')[0].slice(0, 200)}…`);

    // ── 5. An empty record is admitted, not faked ────────────────────────────
    await cleanup();
    await seed([
        { type: 'leader_died', importance: 55, tickOffset: 0, actor: 'faction-test-quiet', actorName: 'Quiet Reach', facts: { leaderName: 'Administrator Pell', title: 'Administrator', cause: 'retirement', yearsInOffice: 3 } },
    ]);
    await narrateOnce({ limit: 25 });
    const thin = await prisma.narrativeArticle.findFirst({ where: { day: TEST_DAY, kind: 'obituary' } });
    assert.ok(thin, 'the quiet leader still gets an obituary');
    assert.ok(/thinner than their supporters/.test(thin!.body), 'an empty record is admitted rather than invented');
    console.log(`[9] uneventful tenure handled honestly: …${thin!.body.slice(0, 140)}…`);

    // ── 6. Kinds are what the archive groups by ──────────────────────────────
    await cleanup();
    await seed([
        { type: 'war_declared', importance: 82, tickOffset: 0, actor: RED, actorName: 'Red Compact', target: BLUE, targetName: 'Blue Union' },
        { type: 'leader_died', importance: 55, tickOffset: 1, actor: RED, actorName: 'Red Compact', facts: { leaderName: 'Chancellor Vex Ordane', cause: 'death' } },
        { type: 'investigation_published', importance: 64, tickOffset: 2, actor: 'galactic_wire', actorName: 'The Galactic Wire', target: BLUE, targetName: 'Blue Union', facts: { subject: 'missing funds', evidence: 60 } },
    ]);
    await narrateOnce({ limit: 25 });

    const kinds = await prisma.narrativeArticle.groupBy({
        by: ['kind'],
        where: { day: TEST_DAY },
        _count: { kind: true },
    });
    const byKind = Object.fromEntries(kinds.map(k => [k.kind, k._count.kind]));
    console.log(`[10] archive kinds: ${JSON.stringify(byKind)}`);
    assert.strictEqual(byKind.news, 1, 'a war declaration is news');
    assert.strictEqual(byKind.obituary, 1, 'a death is an obituary');
    assert.strictEqual(byKind.investigation, 1, 'a published investigation is an exposé');

    await cleanup();
    console.log('\n✅ Narrative Phase 4: the galaxy has a past — named ages, remembered leaders, and an archive to read them in.');
}

main()
    .catch(async err => {
        console.error('❌ Phase 4 test failed:', err);
        try { await cleanup(); } catch { /* leave the mess if we cannot clear it */ }
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
