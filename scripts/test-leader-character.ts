// scripts/test-leader-character.ts
// Leaders as characters: skill tiers, careers that fit a seat, growth in office
// up to a fixed potential, and a tier-up written into their history.
// Run: npx tsx scripts/test-leader-character.ts

import assert from 'assert';
import { generateLeader } from '../lib/leadership/leader-generator';
import {
    backgroundOf, fitsSeat, potentialOf, seatSkill, skillTier, temperamentOf, SEAT_FIT_BONUS, SKILL_GROWTH_PER_DAY,
} from '../lib/leadership/character';
import { tickLeaderGrowth } from '../lib/leadership/leader-growth';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e: any) { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

const leaders = Array.from({ length: 300 }, (_, i) =>
    generateLeader({ factionId: 'f', role: (['Admiral', 'Governor', 'DiplomaticEnvoy', 'EconomicMinister'] as const)[i % 4], seed: `s${i}`, nowSeconds: 0 }));

test('tiers run Novice to Legendary at 35 / 55 / 70 / 85', () => {
    assert.deepStrictEqual([0, 34, 35, 54, 55, 69, 70, 84, 85, 100].map(v => skillTier(v).label),
        ['Novice', 'Novice', 'Capable', 'Capable', 'Seasoned', 'Seasoned', 'Expert', 'Expert', 'Legendary', 'Legendary']);
});

test('a character is stable: same leader, same career and potential', () => {
    const l = leaders[7];
    assert.strictEqual(backgroundOf(l).id, backgroundOf({ ...l }).id);
    assert.strictEqual(potentialOf(l), potentialOf({ ...l }));
});

test('careers mostly follow the role, and every career appears', () => {
    const admirals = leaders.filter(l => l.role === 'Admiral');
    const military = admirals.filter(l => ['fleet_veteran', 'career_officer'].includes(backgroundOf(l).id)).length;
    assert.ok(military / admirals.length > 0.55, `${military}/${admirals.length} admirals came up through the military`);
    assert.ok(new Set(leaders.map(l => backgroundOf(l).id)).size >= 10);
});

test('potential is never below current skill, and some leaders have room to grow', () => {
    assert.ok(leaders.every(l => potentialOf(l) >= (l.competence ?? 50)));
    const room = leaders.filter(l => skillTier(potentialOf(l)).rank > skillTier(l.competence ?? 50).rank).length;
    assert.ok(room > leaders.length * 0.3, `${room} of ${leaders.length} can reach a higher tier`);
});

test('a career that fits the seat adds the fit bonus there and nowhere else', () => {
    const diplomat = leaders.find(l => backgroundOf(l).id === 'diplomat')!;
    diplomat.competence = 60;
    assert.ok(fitsSeat(diplomat, 'foreign'));
    assert.strictEqual(seatSkill(diplomat, 'foreign'), 60 + SEAT_FIT_BONUS);
    assert.strictEqual(seatSkill(diplomat, 'defence'), 60);
});

test('temperament reads the numbers: an ambitious disloyal minister is a schemer', () => {
    assert.strictEqual(temperamentOf({ loyalty: 30, ambitionDrive: 85, corruption: 5 }).label, 'Schemer');
    assert.strictEqual(temperamentOf({ loyalty: 90, ambitionDrive: 40, corruption: 5 }).label, 'Loyalist');
});

test('seated ministers grow in office, stop at potential, and record a new tier', () => {
    const minister: any = { ...leaders[3], competence: 68, potential: 75, status: 'active', history: [] };
    const world: any = {
        nowSeconds: 1000,
        claimedFactionIds: [],
        leadership: { leaders: new Map([[minister.id, minister]]), recruitmentPool: [] },
        government: new Map([['f', { factionId: 'f', cabinet: { economy: minister.id } }]]),
        construction: { planets: new Map() },
    };
    tickLeaderGrowth(world, 86400 * 10);
    assert.strictEqual(minister.competence, 68 + SKILL_GROWTH_PER_DAY * 10);
    assert.ok(minister.history.some((h: any) => /Became Expert/.test(h.description)), 'tier-up recorded');
    tickLeaderGrowth(world, 86400 * 100);
    assert.strictEqual(minister.competence, 75, 'capped at potential');
});

test('an unseated candidate does not grow', () => {
    const bench: any = { ...leaders[4], competence: 50, status: 'active', history: [] };
    const world: any = {
        nowSeconds: 0, claimedFactionIds: [],
        leadership: { leaders: new Map([[bench.id, bench]]), recruitmentPool: [] },
        government: new Map([['f', { factionId: 'f', cabinet: {} }]]),
        construction: { planets: new Map() },
    };
    tickLeaderGrowth(world, 86400 * 10);
    assert.strictEqual(bench.competence, 50);
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
