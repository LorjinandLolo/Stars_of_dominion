// scripts/test-titles-phase1.ts
// Seasons & Titles Phase 1 verification — seasons actually run, one closer,
// seeded scheduling, no dead air between seasons.
// Run: npx tsx scripts/test-titles-phase1.ts

import type { GameWorldState } from '../lib/game-world-state';
import { defaultSharedState } from '../lib/game-world-state';
import {
    endSeason,
    fromISO,
    getActiveModifiers,
    scheduleNextSeason,
    tickSeasonModifiers,
} from '../lib/seasons/season-service';
import { calculateFactionPrestige, rankFactions } from '../lib/seasons/prestige';
import { emptyTitleState, ensureTitleState, hasTitle, titlesOf } from '../lib/titles/title-service';
import { drainNotifications } from '../lib/time/notification-hooks';
import { Resource } from '../lib/trade-system/types';
import config from '../lib/movement/movement-config.json';

const DAY = 86_400;
const seasonCfg = config.seasons;

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${label}`);
    } else {
        failed++;
        console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWorld(factionIds: string[] = ['factionA', 'factionB', 'factionC']): GameWorldState {
    const factions = new Map<string, any>();
    for (const id of factionIds) {
        factions.set(id, { factionId: id, reserves: { [Resource.CREDITS]: 0 }, production: {} });
    }
    return {
        shared: defaultSharedState(),
        movement: {
            systems: new Map(), fleets: new Map(), tradeSegments: new Map(),
            gates: new Map(), empirePostures: new Map(factionIds.map(id => [id, {} as any])),
        },
        economy: { factions, planets: new Map() },
        construction: { planets: new Map() },
        tech: new Map(),
        milestones: new Map(),
        titles: emptyTitleState(),
        activeSeason: null,
        seasonHistory: [],
        hallOfFame: [],
        territoryHistory: [],
        legacyPrestigeBonuses: new Map(),
        victoryState: null,
        nowSeconds: 1_000_000,
    } as unknown as GameWorldState;
}

/** Give a faction enough state to rank above the others. */
function makeStrong(world: GameWorldState, factionId: string, systems: number, credits: number) {
    for (let i = 0; i < systems; i++) {
        world.movement.systems.set(`${factionId}-sys-${i}`, {
            id: `${factionId}-sys-${i}`, ownerFactionId: factionId,
        } as any);
    }
    world.economy.factions.get(factionId)!.reserves[Resource.CREDITS] = credits;
}

/** Advance the world clock and run the season tick, in tick-sized steps. */
function advance(world: GameWorldState, seconds: number, step = 6 * 3600) {
    let remaining = seconds;
    while (remaining > 0) {
        const delta = Math.min(step, remaining);
        world.nowSeconds += delta;
        tickSeasonModifiers(world, delta);
        remaining -= delta;
    }
}

// ─── 1. A world with no season starts one ─────────────────────────────────────

console.log('\n[1] seasons start themselves');
{
    const world = makeWorld();
    check('a fresh world has no season', world.activeSeason === null);

    tickSeasonModifiers(world, 3600);
    check('the first tick announces season 1', world.activeSeason?.seasonNumber === 1,
        `${world.activeSeason?.seasonNumber}`);
    check('it starts in the announced phase', world.activeSeason?.phase === 'announced');
    check('announced seasons expose no active modifiers', getActiveModifiers(world).length === 0);
    check('2-3 modifiers were drawn',
        (world.activeSeason?.modifiers.length ?? 0) >= 2 && (world.activeSeason?.modifiers.length ?? 0) <= seasonCfg.maxActiveModifiers,
        `${world.activeSeason?.modifiers.length}`);
}

// ─── 2. Seeded scheduling ─────────────────────────────────────────────────────

console.log('\n[2] scheduling is deterministic');
{
    const a = scheduleNextSeason(4, makeWorld());
    const b = scheduleNextSeason(4, makeWorld());
    check('the same season number draws the same modifiers',
        JSON.stringify(a.modifiers) === JSON.stringify(b.modifiers));

    const c = scheduleNextSeason(5, makeWorld());
    check('a different season number draws differently',
        JSON.stringify(a.modifiers) !== JSON.stringify(c.modifiers));

    const ids = a.modifiers.map(m => m.id);
    check('no modifier is drawn twice', new Set(ids).size === ids.length);
}

// ─── 3. Phase progression and pressure ────────────────────────────────────────

console.log('\n[3] the season runs');
{
    const world = makeWorld();
    tickSeasonModifiers(world, 3600);

    advance(world, seasonCfg.announcementLeadDays * DAY);
    check('the season activates after the announcement lead', world.activeSeason?.phase === 'active',
        `${world.activeSeason?.phase}`);
    check('active modifiers are exposed to the UI', getActiveModifiers(world).length > 0);
    check('modifier rates are written to shared state',
        Object.keys(world.shared.seasonalModifiers).length > 0);

    const before = { ...world.shared };
    const affected = world.activeSeason!.modifiers[0].affectedVariable as keyof typeof world.shared;
    advance(world, 10 * DAY);
    check('pressure moves the affected shared variable',
        (world.shared[affected] as number) < (before[affected] as number),
        `${before[affected]} -> ${world.shared[affected]}`);
    check('the day counter advances', world.shared.seasonDayElapsed > 9,
        `${world.shared.seasonDayElapsed}`);

    advance(world, (seasonCfg.durationDays * 0.85 - 10) * DAY);
    check('the last 20% enters the ending phase', world.activeSeason?.phase === 'ending',
        `${world.activeSeason?.phase}`);
}

// ─── 4. The close ─────────────────────────────────────────────────────────────

console.log('\n[4] season close');
{
    drainNotifications();
    const world = makeWorld();
    makeStrong(world, 'factionA', 12, 90_000);
    makeStrong(world, 'factionB', 6, 30_000);
    makeStrong(world, 'factionC', 2, 1_000);

    tickSeasonModifiers(world, 3600);
    const firstSeasonId = world.activeSeason!.id;

    advance(world, (seasonCfg.announcementLeadDays + seasonCfg.durationDays + 1) * DAY);

    check('the season archived to history', world.seasonHistory.length === 1, `${world.seasonHistory.length}`);
    check('the season archived to the hall of fame', world.hallOfFame.length === 1);
    check('a territory snapshot was taken', world.territoryHistory.length === 1);

    check('a new season is already in flight', world.activeSeason !== null);
    check('it is the next season number', world.activeSeason?.seasonNumber === 2,
        `${world.activeSeason?.seasonNumber}`);
    check('it is not the season that just closed', world.activeSeason?.id !== firstSeasonId);
    check('seasonal pressure was cleared',
        Object.keys(world.shared.seasonalModifiers).length === 0);

    check('the strongest faction took Grand Sovereign',
        hasTitle(world, 'season_grand_sovereign', 'factionA'));
    check('second place took Exarch', hasTitle(world, 'season_exarch', 'factionB'));
    check('third place took Legate', hasTitle(world, 'season_legate', 'factionC'));
    check('rank titles are not handed to everyone',
        !hasTitle(world, 'season_grand_sovereign', 'factionB'));

    const bonuses = world.legacyPrestigeBonuses.get('factionA');
    check('the winner got legacy bonuses', bonuses !== undefined);
    check('bonuses respect the config cap',
        Object.values(bonuses ?? {}).every(v => v <= 1 + seasonCfg.rewards.permanentBonusCap / 100),
        JSON.stringify(bonuses));

    const record = world.seasonHistory[0];
    check('the record names the season', record.seasonNumber === 1);
    check('outcomes were recorded per faction',
        Object.keys(record.factionOutcomes).length === 3, `${Object.keys(record.factionOutcomes).length}`);
    check('the narrative is not the old placeholder',
        !record.narrative.includes('The galaxy endures'), record.narrative);

    const notes = drainNotifications().filter(n => n.title.startsWith('SEASON'));
    check('exactly one close announcement fired', notes.length === 1, `${notes.length}`);
}

// ─── 5. Rank titles repeat across seasons ─────────────────────────────────────

console.log('\n[5] rank titles are per-season');
{
    const world = makeWorld();
    makeStrong(world, 'factionA', 12, 90_000);
    makeStrong(world, 'factionB', 3, 5_000);

    tickSeasonModifiers(world, 3600);
    const fullSeason = (seasonCfg.announcementLeadDays + seasonCfg.durationDays + 1) * DAY;
    advance(world, fullSeason);
    advance(world, fullSeason);

    const sovereigns = titlesOf(world, 'factionA').filter(a => a.titleId === 'season_grand_sovereign');
    check('two seasons produce two Grand Sovereign entries', sovereigns.length === 2, `${sovereigns.length}`);
    check('each is stamped with its own season',
        new Set(sovereigns.map(s => s.seasonNumber)).size === 2,
        sovereigns.map(s => s.seasonNumber).join(','));
    check('history holds both seasons', world.seasonHistory.length === 2, `${world.seasonHistory.length}`);
    check('season numbers run consecutively',
        world.seasonHistory.map(r => r.seasonNumber).join(',') === '1,2',
        world.seasonHistory.map(r => r.seasonNumber).join(','));
    check('legacy bonuses were replaced, not stacked',
        world.legacyPrestigeBonuses.size <= 3, `${world.legacyPrestigeBonuses.size}`);
}

// ─── 6. One closer ────────────────────────────────────────────────────────────

console.log('\n[6] a single close path');
{
    const world = makeWorld();
    makeStrong(world, 'factionA', 5, 10_000);
    tickSeasonModifiers(world, 3600);

    // The debug path: call endSeason directly, as the API route does.
    const record = endSeason(world);
    check('endSeason returns the closed record', record?.seasonNumber === 1);
    check('the closer scheduled the next season itself', world.activeSeason?.seasonNumber === 2,
        `${world.activeSeason?.seasonNumber}`);
    check('archives are written once', world.seasonHistory.length === 1 && world.hallOfFame.length === 1);

    const noSeason = makeWorld();
    check('closing with no season in flight is a no-op', endSeason(noSeason) === null);
    check('and does not invent one', noSeason.activeSeason === null);
}

// ─── 7. Crown ratification hook ───────────────────────────────────────────────

console.log('\n[7] crown ratification at close');
{
    const world = makeWorld();
    makeStrong(world, 'factionA', 5, 10_000);
    tickSeasonModifiers(world, 3600);

    // Phase 2 fills currentHolders; the closer must already handle it.
    const titles = ensureTitleState(world);
    titles.currentHolders.set('held_anvil', {
        titleId: 'held_anvil', subjectId: 'factionA',
        awardedAtSeconds: world.nowSeconds, seasonNumber: 1,
        lostAtSeconds: null, ratified: false,
    });
    titles.challenges.set('held_anvil', { challengerId: 'factionB', dwellCount: 2 });

    endSeason(world);

    const ratified = titles.ledger.filter(a => a.titleId === 'held_anvil' && a.ratified);
    check('the held crown was ratified into the ledger', ratified.length === 1, `${ratified.length}`);
    check('the crown itself carries into the new season',
        titles.currentHolders.get('held_anvil')?.subjectId === 'factionA');
    check('challenge progress does not survive the boundary', titles.challenges.size === 0);
    check('the ratified hold names the season it was won in',
        world.seasonHistory[0].factionOutcomes['factionA'].earnedTitles.some(t => t.includes('Season 1')),
        JSON.stringify(world.seasonHistory[0].factionOutcomes['factionA'].earnedTitles));
}

// ─── 8. Prestige ──────────────────────────────────────────────────────────────

console.log('\n[8] prestige ranking');
{
    const world = makeWorld();
    makeStrong(world, 'factionA', 10, 50_000);
    makeStrong(world, 'factionB', 4, 5_000);

    check('a bigger empire scores higher',
        calculateFactionPrestige('factionA', world) > calculateFactionPrestige('factionB', world));
    check('an unknown faction scores zero', calculateFactionPrestige('nobody', world) === 0);

    const ranked = rankFactions(world);
    check('ranking is ordered best first', ranked[0].factionId === 'factionA');
    check('every ranked faction appears', ranked.length === 3, `${ranked.length}`);

    const pirateWorld = makeWorld(['factionA', 'faction-pirates', 'faction-neutral']);
    makeStrong(pirateWorld, 'faction-pirates', 30, 500_000);
    const pirateRanked = rankFactions(pirateWorld);
    check('pirates and neutrals are not ranked', pirateRanked.length === 1,
        pirateRanked.map(r => r.factionId).join(','));
}

// ─── 9. Restart safety ────────────────────────────────────────────────────────

console.log('\n[9] restart safety');
{
    // A world loaded well past its season end must close cleanly, not stall.
    const world = makeWorld();
    makeStrong(world, 'factionA', 5, 10_000);
    tickSeasonModifiers(world, 3600);

    world.nowSeconds += (seasonCfg.announcementLeadDays + seasonCfg.durationDays + 30) * DAY;
    tickSeasonModifiers(world, 6 * 3600);

    check('an overdue season closes on the next tick', world.seasonHistory.length === 1,
        `${world.seasonHistory.length}`);
    check('and the successor is scheduled', world.activeSeason?.seasonNumber === 2);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
