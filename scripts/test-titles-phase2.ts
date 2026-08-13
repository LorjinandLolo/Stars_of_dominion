// scripts/test-titles-phase2.ts
// Seasons & Titles Phase 2 verification — held titles: metrics, hysteresis,
// crown transfer, ratification, tenure.
// Run: npx tsx scripts/test-titles-phase2.ts

import type { GameWorldState } from '../lib/game-world-state';
import { defaultSharedState } from '../lib/game-world-state';
import {
    crownCounts,
    crownStandings,
    crownsHeldBy,
    evaluateCrowns,
} from '../lib/titles/crown-service';
import {
    COUNTER_FLEET_POWER_DESTROYED,
    METRICS,
    drainMetricCounters,
    notifyTitleMetric,
    readCounter,
} from '../lib/titles/metrics';
import { emptyTitleState, ensureTitleState, hasTitle, tickTitles } from '../lib/titles/title-service';
import { TITLE_CATALOG } from '../lib/titles/catalog';
import { endSeason, scheduleNextSeason } from '../lib/seasons/season-service';
import { drainNotifications } from '../lib/time/notification-hooks';
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

function makeWorld(factionIds: string[] = ['factionA', 'factionB', 'factionC']): GameWorldState {
    const factions = new Map<string, any>();
    for (const id of factionIds) {
        factions.set(id, { factionId: id, reserves: { [Resource.CREDITS]: 0 }, production: {} });
    }
    return {
        shared: defaultSharedState(),
        movement: {
            systems: new Map(), fleets: new Map(), tradeSegments: new Map(),
            gates: new Map(), corridors: new Map(),
            empirePostures: new Map(factionIds.map(id => [id, { blocs: [] } as any])),
        },
        economy: {
            factions, planets: new Map(),
            tradeRoutes: new Map(), tradeAgreements: new Map(),
        },
        construction: { planets: new Map() },
        espionage: { intelNetworks: new Map() },
        piracy: { organizations: new Map() },
        press: { empires: new Map() },
        tech: new Map(),
        treaties: new Map(),
        tradePacts: new Map(),
        rivalries: new Map(),
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

/** Set a faction's total fleet power by giving it one fleet. */
function setFleetPower(world: GameWorldState, factionId: string, power: number) {
    world.movement.fleets.set(`fleet-${factionId}`, {
        id: `fleet-${factionId}`, factionId, basePower: power, strength: 1,
    } as any);
}

/** Run n crown evaluations at the current clock. */
function evaluate(world: GameWorldState, times = 1) {
    for (let i = 0; i < times; i++) evaluateCrowns(world);
}

function holderOf(world: GameWorldState, titleId: string): string | null {
    return ensureTitleState(world).currentHolders.get(titleId)?.subjectId ?? null;
}

// ─── 1. Vacant crowns are claimed immediately ─────────────────────────────────

console.log('\n[1] claiming a vacant crown');
{
    const world = makeWorld();
    setFleetPower(world, 'factionA', 1000);
    setFleetPower(world, 'factionB', 400);

    evaluate(world);
    check('the leader takes an unheld crown at once', holderOf(world, 'held_arsenal') === 'factionA',
        `${holderOf(world, 'held_arsenal')}`);
    check('no dwell is required for a vacant crown',
        ensureTitleState(world).challenges.has('held_arsenal') === false);
    check('the hold is recorded in the ledger',
        hasTitle(world, 'held_arsenal', 'factionA'));
    check('a hold is not ratified on claim',
        ensureTitleState(world).currentHolders.get('held_arsenal')?.ratified === false);
    check('only the crown that has a leader is filled',
        holderOf(world, 'held_trade_dominance') === null);
}

// ─── 2. Hysteresis ────────────────────────────────────────────────────────────

console.log('\n[2] hysteresis');
{
    const world = makeWorld();
    setFleetPower(world, 'factionA', 1000);
    setFleetPower(world, 'factionB', 400);
    evaluate(world);

    // A lead inside the margin never starts a challenge.
    setFleetPower(world, 'factionB', 1050); // +5%, margin is 10%
    evaluate(world, 5);
    check('a lead inside the margin does not take the crown',
        holderOf(world, 'held_arsenal') === 'factionA');
    check('and does not even open a challenge',
        !ensureTitleState(world).challenges.has('held_arsenal'));

    // Clearing the margin starts the dwell count, but does not transfer yet.
    setFleetPower(world, 'factionB', 2000);
    evaluate(world);
    check('clearing the margin opens a challenge',
        ensureTitleState(world).challenges.get('held_arsenal')?.challengerId === 'factionB');
    check('the crown does not move on the first evaluation',
        holderOf(world, 'held_arsenal') === 'factionA');
    evaluate(world);
    check('nor on the second', holderOf(world, 'held_arsenal') === 'factionA',
        `dwell ${ensureTitleState(world).challenges.get('held_arsenal')?.dwellCount}`);
    evaluate(world);
    check('the third sustained evaluation takes it',
        holderOf(world, 'held_arsenal') === 'factionB');
    check('the challenge is cleared after the transfer',
        !ensureTitleState(world).challenges.has('held_arsenal'));

    // Dropping back mid-challenge resets progress.
    setFleetPower(world, 'factionA', 5000);
    evaluate(world, 2);
    check('a partial challenge is recorded',
        ensureTitleState(world).challenges.get('held_arsenal')?.dwellCount === 2);
    setFleetPower(world, 'factionA', 100);
    evaluate(world);
    check('falling back inside the margin resets the dwell count',
        !ensureTitleState(world).challenges.has('held_arsenal'));
    check('and the crown stayed put', holderOf(world, 'held_arsenal') === 'factionB');
}

// ─── 3. A rotating cast of challengers never wins ─────────────────────────────

console.log('\n[3] one sustained rival, not a rotating cast');
{
    const world = makeWorld();
    setFleetPower(world, 'factionA', 1000);
    evaluate(world);

    setFleetPower(world, 'factionB', 5000);
    evaluate(world);
    setFleetPower(world, 'factionB', 0);
    setFleetPower(world, 'factionC', 6000);
    evaluate(world);
    check('a new challenger restarts the count',
        ensureTitleState(world).challenges.get('held_arsenal')?.dwellCount === 1,
        `${ensureTitleState(world).challenges.get('held_arsenal')?.dwellCount}`);
    check('the crown has not moved', holderOf(world, 'held_arsenal') === 'factionA');
}

// ─── 4. Losing the metric entirely ────────────────────────────────────────────

console.log('\n[4] a holder who stops scoring');
{
    const world = makeWorld();
    setFleetPower(world, 'factionA', 1000);
    evaluate(world);
    check('factionA holds', holderOf(world, 'held_arsenal') === 'factionA');

    world.movement.fleets.clear();
    evaluate(world);
    check('a holder with no score loses the crown outright',
        holderOf(world, 'held_arsenal') === null);
    const award = ensureTitleState(world).ledger.find(a => a.titleId === 'held_arsenal');
    check('the ledger records when the hold ended', award?.lostAtSeconds !== null);
    check('but the award itself is never deleted', award !== undefined);

    // And a rival inheriting it does so without any dwell.
    setFleetPower(world, 'factionB', 50);
    evaluate(world);
    check('a vacated crown is reclaimed immediately',
        holderOf(world, 'held_arsenal') === 'factionB');
}

// ─── 5. Metrics measure what they claim ───────────────────────────────────────

console.log('\n[5] metrics');
{
    const world = makeWorld();

    // Chokepoints: geography, not size. factionB owns two corridor chokepoints;
    // factionA owns eight ordinary systems and nothing strategic.
    for (let i = 0; i < 8; i++) {
        world.movement.systems.set(`plain-${i}`, { id: `plain-${i}`, ownerFactionId: 'factionA' } as any);
    }
    world.movement.systems.set('choke-1', { id: 'choke-1', ownerFactionId: 'factionB' } as any);
    world.movement.systems.set('choke-2', { id: 'choke-2', ownerFactionId: 'factionB' } as any);
    world.movement.corridors.set('cor-1', {
        id: 'cor-1', nodeIds: ['choke-1', 'choke-2'], chokepointIds: ['choke-1', 'choke-2'],
    } as any);

    const choke = METRICS.chokepoint_control.evaluate(world);
    check('two chokepoints beat eight ordinary systems',
        (choke.get('factionB') ?? 0) > (choke.get('factionA') ?? 0),
        `${choke.get('factionB')} vs ${choke.get('factionA')}`);

    // Foreign transit: you score for other people's trade crossing your space.
    world.economy.tradeAgreements.set('agr-1', {
        id: 'agr-1', aFactionId: 'factionA', bFactionId: 'factionC', volumePerHour: 100,
    } as any);
    world.economy.tradeRoutes.set('route-1', {
        id: 'route-1', agreementId: 'agr-1', path: ['plain-0', 'choke-1'],
    } as any);
    const transit = METRICS.foreign_transit_volume.evaluate(world);
    check('the bystander scores the transit volume', transit.get('factionB') === 100,
        `${transit.get('factionB')}`);
    check('the trading parties score nothing for their own lane',
        (transit.get('factionA') ?? 0) === 0 && (transit.get('factionC') ?? 0) === 0);

    // Tech web: a tech only you hold is worth more than one everybody holds.
    const solo = makeWorld(['factionA', 'factionB']);
    // A holds one tech nobody else has; B holds two that everyone has.
    solo.tech.set('factionA', { unlockedTechIds: ['rare-1', 'common-1'] } as any);
    solo.tech.set('factionB', { unlockedTechIds: ['common-1', 'common-2'] } as any);
    solo.tech.set('factionC', { unlockedTechIds: ['common-1', 'common-2'] } as any);
    const web = METRICS.tech_web_weight.evaluate(solo);
    check('rarity outweighs raw count', (web.get('factionA') ?? 0) > (web.get('factionB') ?? 0),
        `${web.get('factionA')} vs ${web.get('factionB')}`);

    // Happiness needs a real empire behind it.
    const happy = makeWorld();
    happy.construction.planets.set('p1', { id: 'p1', ownerId: 'factionA', happiness: 100 } as any);
    for (let i = 0; i < 3; i++) {
        happy.construction.planets.set(`q${i}`, { id: `q${i}`, ownerId: 'factionB', happiness: 70 } as any);
    }
    const happiness = METRICS.avg_happiness.evaluate(happy);
    check('a one-planet empire does not take the happiness crown',
        (happiness.get('factionA') ?? 0) === 0, `${happiness.get('factionA')}`);
    check('three planets qualify', happiness.get('factionB') === 70);

    // Peace streak: at war scores zero, and the clock restarts from the war.
    const peace = makeWorld();
    peace.rivalries.set('r1', {
        id: 'r1', empireAId: 'factionA', empireBId: 'factionB', escalationLevel: 7,
    } as any);
    let streak = METRICS.peace_streak_seconds.evaluate(peace);
    check('a faction at war has no peace streak', streak.get('factionA') === 0);
    check('an uninvolved faction starts its streak at zero', streak.get('factionC') === 0);

    peace.rivalries.clear();
    peace.nowSeconds += 5 * 86_400;
    streak = METRICS.peace_streak_seconds.evaluate(peace);
    check('the streak grows once the war ends', streak.get('factionA') === 5 * 86_400,
        `${streak.get('factionA')}`);
}

// ─── 6. The season kill tally ─────────────────────────────────────────────────

console.log('\n[6] the Reaper\'s Toll counter');
{
    const world = makeWorld();
    notifyTitleMetric(COUNTER_FLEET_POWER_DESTROYED, 'factionA', 300);
    notifyTitleMetric(COUNTER_FLEET_POWER_DESTROYED, 'factionA', 200);
    notifyTitleMetric(COUNTER_FLEET_POWER_DESTROYED, 'factionB', 100);
    drainMetricCounters(world);

    check('kills accumulate per faction',
        readCounter(world, COUNTER_FLEET_POWER_DESTROYED, 'factionA') === 500,
        `${readCounter(world, COUNTER_FLEET_POWER_DESTROYED, 'factionA')}`);
    check('draining twice does not double-count',
        (drainMetricCounters(world), readCounter(world, COUNTER_FLEET_POWER_DESTROYED, 'factionA')) === 500);

    evaluate(world);
    check('the killer takes the villain crown', holderOf(world, 'held_reapers_toll') === 'factionA');

    world.activeSeason = scheduleNextSeason(1, world);
    endSeason(world);
    check('the tally resets at the season boundary',
        readCounter(world, COUNTER_FLEET_POWER_DESTROYED, 'factionA') === 0,
        `${readCounter(world, COUNTER_FLEET_POWER_DESTROYED, 'factionA')}`);
    check('but the crown itself carries over',
        holderOf(world, 'held_reapers_toll') === 'factionA');
}

// ─── 7. Pirate organizations hold crowns ──────────────────────────────────────

console.log('\n[7] a crown held by something that is not a state');
{
    const world = makeWorld();
    world.piracy.organizations.set('org-crimson', { id: 'org-crimson', infamy: 80 } as any);
    world.piracy.organizations.set('org-minor', { id: 'org-minor', infamy: 10 } as any);
    setFleetPower(world, 'factionA', 9999);

    evaluate(world);
    check('the pirate organization holds Scourge of the Lanes',
        holderOf(world, 'held_scourge') === 'org-crimson', `${holderOf(world, 'held_scourge')}`);
    check('the biggest navy does not take it',
        holderOf(world, 'held_scourge') !== 'factionA');
    check('the catalog entry names a non-faction subject',
        TITLE_CATALOG.held_scourge.subject === 'pirate_org');
    check('crown queries work for organizations',
        crownsHeldBy(world, 'org-crimson').some(d => d.id === 'held_scourge'));
}

// ─── 8. Ratification, tenure, Dynasty and Regicide ────────────────────────────

console.log('\n[8] ratification and tenure');
{
    const world = makeWorld();
    setFleetPower(world, 'factionA', 1000);
    world.activeSeason = scheduleNextSeason(1, world);
    evaluate(world);

    endSeason(world);
    const titles = ensureTitleState(world);
    check('the hold is ratified at close',
        titles.ledger.filter(a => a.titleId === 'held_arsenal' && a.ratified).length >= 1);
    check('tenure starts at one', titles.crownTenure.get('held_arsenal|factionA') === 1);
    check('the crown carries into the new season',
        holderOf(world, 'held_arsenal') === 'factionA');
    check('the season record names the ratified crown',
        world.seasonHistory[0].factionOutcomes['factionA'].earnedTitles
            .some(t => t.includes('Season 1')),
        JSON.stringify(world.seasonHistory[0].factionOutcomes['factionA'].earnedTitles));

    // Two more closes make it a Dynasty.
    endSeason(world);
    endSeason(world);
    check('tenure counts consecutive closes',
        titles.crownTenure.get('held_arsenal|factionA') === 3,
        `${titles.crownTenure.get('held_arsenal|factionA')}`);
    tickTitles(world); // drains the Dynasty trigger
    check('three seasons running is a Dynasty', hasTitle(world, 'earned_dynasty', 'factionA'));

    // Taking it off a long holder is a Regicide.
    setFleetPower(world, 'factionB', 100_000);
    evaluate(world, 3);
    check('the crown changed hands', holderOf(world, 'held_arsenal') === 'factionB');
    tickTitles(world);
    check('taking it off a long holder is a Regicide',
        hasTitle(world, 'earned_regicide', 'factionB'));
    check('the deposed holder loses its tenure',
        titles.crownTenure.get('held_arsenal|factionA') === undefined);
}

// ─── 9. Standings and counts for the UI ───────────────────────────────────────

console.log('\n[9] standings');
{
    const world = makeWorld();
    setFleetPower(world, 'factionA', 1000);
    world.piracy.organizations.set('org-crimson', { id: 'org-crimson', infamy: 50 } as any);
    evaluate(world);
    setFleetPower(world, 'factionB', 5000);
    evaluate(world);

    const standings = crownStandings(world);
    const arsenal = standings.find(s => s.titleId === 'held_arsenal')!;
    check('standings name the holder', arsenal.holderId === 'factionA');
    check('standings name the challenger', arsenal.challengerId === 'factionB');
    check('standings report dwell progress',
        arsenal.dwellCount === 1 && arsenal.dwellRequired === 3,
        `${arsenal.dwellCount}/${arsenal.dwellRequired}`);
    check('standings carry a leaderboard', arsenal.leaderboard.length === 2);
    check('every catalogued crown appears in the standings',
        standings.length === Object.values(TITLE_CATALOG).filter(d => d.kind === 'held').length,
        `${standings.length}`);

    const counts = crownCounts(world);
    check('crown counts are the season scoreboard', counts.get('factionA') === 1);
    check('organizations count too', counts.get('org-crimson') === 1);
}

// ─── 10. Cosmetics only, and one event per transition ─────────────────────────

console.log('\n[10] invariants');
{
    const world = makeWorld();
    drainNotifications();
    setFleetPower(world, 'factionA', 1000);
    evaluate(world);

    const claimNotes = drainNotifications().filter(n => n.title.includes('CROWN'));
    check('claiming a crown fires exactly one event', claimNotes.length === 1, `${claimNotes.length}`);
    check('the event carries the cosmetic badge',
        (claimNotes[0]?.payload as any)?.badge === TITLE_CATALOG.held_arsenal.cosmetic?.badge);

    evaluate(world, 4);
    check('holding it quietly fires nothing',
        drainNotifications().filter(n => n.title.includes('CROWN')).length === 0);

    check('no crown grants a mechanical modifier',
        Object.values(TITLE_CATALOG)
            .filter(d => d.kind === 'held')
            .every(d => !('bonus' in d) && !('modifiers' in d)));
    check('legacy bonuses are untouched by holding a crown',
        world.legacyPrestigeBonuses.size === 0);
}

// ─── 11. Snapshots that predate the state a metric reads ──────────────────────

console.log('\n[11] sparse worlds');
{
    // Metrics run against every snapshot the game has ever written, including
    // ones with no espionage, press, piracy or diplomacy state at all.
    const sparse = {
        shared: defaultSharedState(),
        movement: { systems: new Map(), fleets: new Map() },
        economy: { factions: new Map([['factionA', { factionId: 'factionA', reserves: {} }]]) },
        tech: new Map(),
        titles: emptyTitleState(),
        activeSeason: null,
        seasonHistory: [],
        nowSeconds: 500,
    } as unknown as GameWorldState;

    let threw: unknown = null;
    try {
        evaluateCrowns(sparse);
        crownStandings(sparse);
        for (const metric of Object.values(METRICS)) metric.evaluate(sparse);
    } catch (e) {
        threw = e;
    }
    check('no metric throws on a world missing its sub-state', threw === null,
        threw instanceof Error ? threw.message : String(threw));
    check('crowns with nothing to score stay vacant',
        ensureTitleState(sparse).currentHolders.size === 0);

    // A world with no factions at all — the state a fresh boot passes through.
    const empty = { titles: emptyTitleState(), nowSeconds: 0 } as unknown as GameWorldState;
    let emptyThrew: unknown = null;
    try {
        evaluateCrowns(empty);
    } catch (e) {
        emptyThrew = e;
    }
    check('an empty world evaluates cleanly', emptyThrew === null,
        emptyThrew instanceof Error ? emptyThrew.message : String(emptyThrew));
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
