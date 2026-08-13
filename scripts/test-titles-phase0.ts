// scripts/test-titles-phase0.ts
// Seasons & Titles Phase 0 verification — registry, ledger, trigger buffer,
// milestone-first migration, defeat-status latch.
// Run: npx tsx scripts/test-titles-phase0.ts

import type { GameWorldState } from '../lib/game-world-state';
import { defaultSharedState } from '../lib/game-world-state';
import {
    awardTitle,
    checkMilestoneFirsts,
    drainTitleTriggers,
    emptyTitleState,
    ensureTitleState,
    hasTitle,
    latchDefeatStatus,
    migrateLegacyMilestones,
    notifyTitleTrigger,
    tickTitles,
    titlesOf,
} from '../lib/titles/title-service';
import { TRIGGER } from '../lib/titles/catalog';
import { drainNotifications } from '../lib/time/notification-hooks';
import { mapsToRecords, recordsToMaps } from '../lib/persistence/save-service';
import { Resource } from '../lib/trade-system/types';

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

function makeWorld(factionIds: string[] = ['factionA', 'factionB']): GameWorldState {
    const factions = new Map<string, any>();
    for (const id of factionIds) {
        factions.set(id, { factionId: id, reserves: { [Resource.CREDITS]: 0 }, production: {} });
    }
    return {
        shared: defaultSharedState(),
        movement: { systems: new Map(), fleets: new Map() },
        economy: { factions, planets: new Map() },
        construction: { planets: new Map() },
        tech: new Map(),
        milestones: new Map(),
        titles: emptyTitleState(),
        activeSeason: null,
        seasonHistory: [],
        hallOfFame: [],
        legacyPrestigeBonuses: new Map(),
        nowSeconds: 1_000_000,
    } as unknown as GameWorldState;
}

function giveSystems(world: GameWorldState, factionId: string, count: number) {
    for (let i = 0; i < count; i++) {
        world.movement.systems.set(`${factionId}-sys-${i}`, {
            id: `${factionId}-sys-${i}`, ownerFactionId: factionId,
        } as any);
    }
}

function giveFleet(world: GameWorldState, factionId: string, basePower: number) {
    world.movement.fleets.set(`${factionId}-fleet`, {
        id: `${factionId}-fleet`, factionId, basePower, strength: 1,
    } as any);
}

// ─── 1. Awarding and dedup ────────────────────────────────────────────────────

console.log('\n[1] awarding and dedup');
{
    const world = makeWorld();

    const first = awardTitle(world, 'earned_ironbound', 'factionA');
    check('a known title is awarded', first !== null);
    check('award is stamped with the sim clock, not wall clock',
        first?.awardedAtSeconds === 1_000_000, `${first?.awardedAtSeconds}`);
    check('earned titles are ratified on award', first?.ratified === true);
    check('a held slot is not created for an earned title',
        ensureTitleState(world).currentHolders.size === 0);

    const again = awardTitle(world, 'earned_ironbound', 'factionA');
    check('the same title is not awarded twice to one subject', again === null);
    check('the ledger holds exactly one entry', ensureTitleState(world).ledger.length === 1);

    const other = awardTitle(world, 'earned_ironbound', 'factionB');
    check('a repeatable title can go to another faction', other !== null);

    const unknown = awardTitle(world, 'no_such_title', 'factionA');
    check('an unknown titleId awards nothing', unknown === null);
    check('titlesOf returns only that subject\'s awards',
        titlesOf(world, 'factionA').length === 1, `${titlesOf(world, 'factionA').length}`);
}

// ─── 2. Uniqueness — galactic firsts ──────────────────────────────────────────

console.log('\n[2] unique titles are galaxy-wide firsts');
{
    const world = makeWorld();
    const a = awardTitle(world, 'earned_first_oracle', 'factionA');
    const b = awardTitle(world, 'earned_first_oracle', 'factionB');
    check('the first claimant gets it', a !== null);
    check('the second claimant does not', b === null);
    check('only one ledger entry exists', ensureTitleState(world).ledger.length === 1);
    check('the holder is the first claimant', hasTitle(world, 'earned_first_oracle', 'factionA'));
}

// ─── 3. Trigger buffer ────────────────────────────────────────────────────────

console.log('\n[3] trigger buffer');
{
    const world = makeWorld();

    notifyTitleTrigger(TRIGGER.CIVIL_WAR_SURVIVED_INTACT, 'factionA');
    check('buffering alone awards nothing', !hasTitle(world, 'earned_ironbound', 'factionA'));

    const awarded = drainTitleTriggers(world);
    check('draining awards the catalog title', awarded.length === 1, `${awarded.length}`);
    check('the right subject got it', hasTitle(world, 'earned_ironbound', 'factionA'));

    const second = drainTitleTriggers(world);
    check('the buffer is empty after a drain', second.length === 0);

    notifyTitleTrigger(TRIGGER.CIVIL_WAR_SURVIVED_INTACT, 'factionA');
    check('a repeat trigger for the same subject awards nothing', drainTitleTriggers(world).length === 0);

    notifyTitleTrigger('trigger_nothing_consumes', 'factionA');
    check('an unconsumed trigger is a no-op', drainTitleTriggers(world).length === 0);

    notifyTitleTrigger(TRIGGER.LEADER_TOOK_OFFICE_BY_COUP, 'leader-7');
    drainTitleTriggers(world);
    check('leader epithets use the same path', hasTitle(world, 'epithet_usurper', 'leader-7'));
}

// ─── 4. Milestone firsts ──────────────────────────────────────────────────────

console.log('\n[4] milestone firsts');
{
    const world = makeWorld();
    giveSystems(world, 'factionA', 9);
    checkMilestoneFirsts(world);
    check('nine systems is not ten', !hasTitle(world, 'earned_first_hegemon', 'factionA'));

    giveSystems(world, 'factionA', 10);
    checkMilestoneFirsts(world);
    check('ten systems takes the Hegemon title', hasTitle(world, 'earned_first_hegemon', 'factionA'));

    giveSystems(world, 'factionB', 12);
    checkMilestoneFirsts(world);
    check('a later, larger empire does not take a claimed first',
        !hasTitle(world, 'earned_first_hegemon', 'factionB'));

    for (let i = 0; i < 5; i++) checkMilestoneFirsts(world);
    check('re-evaluating never duplicates the award',
        ensureTitleState(world).ledger.filter(a => a.titleId === 'earned_first_hegemon').length === 1);

    world.economy.factions.get('factionB')!.reserves[Resource.CREDITS] = 50_000;
    giveFleet(world, 'factionB', 1600);
    world.tech.set('factionB', { unlockedTechIds: new Array(15).fill('t') } as any);
    checkMilestoneFirsts(world);
    check('credits threshold awards Tycoon', hasTitle(world, 'earned_first_tycoon', 'factionB'));
    check('fleet power threshold awards Titan', hasTitle(world, 'earned_first_titan', 'factionB'));
    check('tech count threshold awards Oracle', hasTitle(world, 'earned_first_oracle', 'factionB'));
}

// ─── 5. Pirates and neutrals are excluded ─────────────────────────────────────

console.log('\n[5] excluded factions');
{
    const world = makeWorld(['faction-pirates', 'faction-neutral']);
    giveSystems(world, 'faction-pirates', 20);
    giveSystems(world, 'faction-neutral', 20);
    checkMilestoneFirsts(world);
    check('pirates take no titles', !hasTitle(world, 'earned_first_hegemon', 'faction-pirates'));
    check('neutrals take no titles', !hasTitle(world, 'earned_first_hegemon', 'faction-neutral'));
}

// ─── 6. Legacy milestone migration ────────────────────────────────────────────

console.log('\n[6] legacy migration');
{
    const world = makeWorld();
    world.milestones.set('HEGEMON_10_SYSTEMS', { factionId: 'factionA', unlockedAt: '2026-01-01T00:00:00Z' });
    world.milestones.set('TYCOON_50K_CREDITS', { factionId: 'factionB', unlockedAt: '2026-01-01T00:00:00Z' });

    migrateLegacyMilestones(world);
    check('legacy milestones become ledger awards', hasTitle(world, 'earned_first_hegemon', 'factionA'));
    check('each legacy holder keeps their own title', hasTitle(world, 'earned_first_tycoon', 'factionB'));
    check('the retired map is drained', world.milestones.size === 0);

    migrateLegacyMilestones(world);
    check('migration is idempotent', ensureTitleState(world).ledger.length === 2);

    // A migrated first must block a live claimant.
    giveSystems(world, 'factionB', 12);
    checkMilestoneFirsts(world);
    check('a migrated first is still a first',
        !hasTitle(world, 'earned_first_hegemon', 'factionB'));
}

// ─── 7. Defeat-status latch ───────────────────────────────────────────────────

console.log('\n[7] defeat latch');
{
    const world = makeWorld();
    check('the first non-ALIVE status is a transition', latchDefeatStatus(world, 'factionA', 'DYING'));
    check('the same status again is silent', !latchDefeatStatus(world, 'factionA', 'DYING'));
    check('the same status stays silent for many ticks',
        [1, 2, 3, 4, 5].every(() => !latchDefeatStatus(world, 'factionA', 'DYING')));
    check('an escalation is a transition', latchDefeatStatus(world, 'factionA', 'ELIMINATED'));
    check('a recovery is a transition', latchDefeatStatus(world, 'factionA', 'ALIVE'));
    check('a faction that was never in trouble stays silent',
        !latchDefeatStatus(world, 'factionB', 'ALIVE'));
    check('another faction latches independently',
        latchDefeatStatus(world, 'factionB', 'DYING'));
}

// ─── 8. Notifications: one per award, none on repeat ──────────────────────────

console.log('\n[8] announcements');
{
    drainNotifications();
    const world = makeWorld();
    giveSystems(world, 'factionA', 10);

    for (let i = 0; i < 5; i++) tickTitles(world);

    const notes = drainNotifications().filter(n => n.title === 'GALACTIC FIRST');
    check('a sustained condition announces exactly once', notes.length === 1, `${notes.length}`);
    check('the notification id is stable, not clock-stamped',
        notes[0]?.id === 'title-earned_first_hegemon-factionA', `${notes[0]?.id}`);
    check('the announcement timestamp comes off the sim clock',
        notes[0]?.createdAt === new Date(1_000_000 * 1000).toISOString(), `${notes[0]?.createdAt}`);
}

// ─── 9. Persistence shape ─────────────────────────────────────────────────────

console.log('\n[9] snapshot round-trip');
{
    const world = makeWorld();
    awardTitle(world, 'earned_ironbound', 'factionA');
    latchDefeatStatus(world, 'factionA', 'DYING');

    // Same Map⇄object pass the save service uses.
    const round = recordsToMaps(JSON.parse(JSON.stringify(mapsToRecords(world)))) as GameWorldState;

    check('the ledger survives serialization', hasTitle(round, 'earned_ironbound', 'factionA'));
    check('the latch map survives as a Map',
        ensureTitleState(round).defeatStatuses.get('factionA') === 'DYING');
    check('a restored world does not re-announce',
        !latchDefeatStatus(round, 'factionA', 'DYING'));
}

// ─── 10. Pre-phase-0 snapshots ────────────────────────────────────────────────

console.log('\n[10] snapshots written before the registry existed');
{
    const world = makeWorld();
    delete (world as GameWorldState & { titles?: unknown }).titles;

    const state = ensureTitleState(world);
    check('ensureTitleState builds the aggregate', state.ledger.length === 0);
    check('tickTitles runs on an unmigrated world', (() => {
        try { tickTitles(world); return true; } catch { return false; }
    })());
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 1 - 1 : 1);
