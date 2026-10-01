// scripts/approval-probe.ts
// Does a government left alone stay governable?
//
// Until 2026-10 the answer was no. Every interest group of every empire sat at
// zero satisfaction, public trust sat at zero, approval was therefore zero
// galaxy-wide, political capital never accrued, and untouched AI empires split
// apart in their first weeks. Several separate loops were each running to a
// rail; this probe is the regression test for all of them, in three parts:
//
//   1. the mechanisms — each loop, shown to settle instead of run away;
//   2. the outcome — a season of the real strategic tick in the shape of the
//      playtest (ten empires claimed by players who never touch a thing, so
//      everything is delegated, and four run by the AI) ends with every empire
//      standing and governable;
//   3. the repair — a galaxy the collapse already flattened is put back.
//
// What it cannot see: expansion. Survey timers read the wall clock, so in a
// soak nobody ever colonises and every empire stays at two worlds. Anything
// that only goes wrong in a large empire is not tested here.
//
// Run:  npx tsx scripts/approval-probe.ts            (a full season, 1260 ticks)
//       npx tsx scripts/approval-probe.ts 400        (shorter)
//       npx tsx scripts/approval-probe.ts 1260 b     (a different seed)

import {
    SEASON_TICKS, TICK_SECONDS, bootSoakWorld, empireIds, quietConsole, recalculateSystemControl,
    seedSimulation, stepSoak,
} from './soak-harness';
import { drainBuffer, resetChronicleBuffer } from '../lib/narrative/chronicle';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { getPublicTrust, pushWorldStory, tickPress } from '../lib/press-system/integration';
import { weightedBlocSatisfaction } from '../lib/government/government-service';
import { computeBlocOutlook, tickBlocDrift } from '../lib/politics/politics-service';
import { targetedEspionagePressure } from '../lib/espionage/pressure';
import { tickOperations } from '../lib/espionage/espionage-service';
import { tickSanctions } from '../lib/diplomacy/sanctions-service';
import { openDebate, resolveDebate } from '../lib/politics/debate-service';
import { tickGovernors } from '../lib/government/governor-service';
import { repairApprovalCollapse } from '../lib/government/approval-repair';
import { tickPressSystem } from '../lib/press-system/simulation';
import { calculateViralSpread, isCirculating, propagateEffects } from '../lib/press-system/propagation';
import { runPressOffice } from '../lib/press-system/press-office';
import { PressConfig } from '../lib/press-system/config';
import {
    InvestigationStage, PressFactionType, StorySource, StoryTruth,
    type PublishedStory, type SimulationState, type Story,
} from '../lib/press-system/types';

const ticks = Math.max(1, Number(process.argv[2]) || SEASON_TICKS);
const seed = process.argv[3] ?? 'a';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}
function section(title: string): void { results.push(`\n ${title}`); }

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function worldsOf(world: any, factionId: string): number {
    return [...world.construction.planets.values()].filter((p: any) => p.ownerId === factionId).length;
}

interface Reading {
    id: string;
    approval: number;
    blocs: number;
    trust: number;
    legitimacy: number;
    capital: number;
    cohesion: number;
    coup: number;
    pressure: number;
    corruption: number;
    worlds: number;
}

function read(world: any, id: string): Reading {
    const gov = world.government.get(id);
    return {
        id,
        approval: gov?.approval ?? 0,
        blocs: weightedBlocSatisfaction(world, id),
        trust: getPublicTrust(world, id),
        legitimacy: gov?.legitimacy ?? 0,
        capital: gov?.politicalCapital ?? 0,
        cohesion: gov?.cohesion ?? 0,
        coup: gov?.coupPressure ?? 0,
        pressure: world.press?.empires?.get(id)?.informationPressure ?? 0,
        corruption: gov?.corruption ?? 0,
        worlds: worldsOf(world, id),
    };
}

// ── A press system small enough to reason about ──────────────────────────────

function miniPress(empires: string[], systems: string[], outlets = 3): SimulationState {
    const state: SimulationState = {
        tick: 0,
        empires: new Map(),
        planets: new Map(),
        pressFactions: new Map(),
        activeStories: new Map(),
        publishedStories: [],
        crises: new Map(),
        investigations: new Map(),
        campaigns: new Map(),
        quarantinedPlanets: new Set(),
        jammedSystems: new Set(),
        counterNarratives: new Map(),
    };
    for (const id of empires) {
        state.empires.set(id, {
            id, publicTrust: 60, informationPressure: 0, activeCrises: new Set(),
            credibility: 60, mediaFreedom: 50, narrativeInfluence: 30,
        });
    }
    systems.forEach((sys, i) => {
        state.planets.set(`planet_${sys}`, {
            id: `planet_${sys}`, ownerId: empires[0], stability: 70, happiness: 60, fear: 10, radicalization: 5,
            position: { x: i, y: 0 },
        });
    });
    state.pressFactions.set('wire', { id: 'wire', type: PressFactionType.INDEPENDENT_MEDIA, credibility: 75, bias: 0, cooldowns: new Map() });
    for (let i = 0; i < outlets; i++) {
        state.pressFactions.set(`rival${i}_STATE`, {
            id: `rival${i}_STATE`, type: PressFactionType.STATE_MEDIA, affiliatedEmpireId: `rival${i}`,
            credibility: 60, bias: 100, cooldowns: new Map(),
        });
    }
    return state;
}

function story(id: string, target: string, magnitude: number, evidence = 55): Story {
    return {
        id, source: StorySource.WAR_REPORT, truth: StoryTruth.TRUE, targetEmpireId: target,
        subject: id, baseMagnitude: magnitude, evidenceStrength: evidence, tickCreated: 0,
    };
}

function publication(storyId: string, publisherId: string, origin: string, viral = 0.5): PublishedStory {
    return {
        id: `PUB_${publisherId}_${storyId}`, storyId, publisherId, tickPublished: 0, viralFactor: viral,
        originPlanetId: origin, transmissionMap: new Map([[origin, 100]]), jammedSystems: new Set(),
    };
}

/**
 * Part 1 — every loop that used to run away. Runs on a COPY of the freshly
 * booted world: several of these checks tick a system for a season or more,
 * and the season in Part 2 has to start from a galaxy nobody has aged.
 */
function mechanisms(world: any, originals: string[]): void {
    const [victim, bystander, spy] = originals;
    const victimPosture = world.movement.empirePostures.get(victim);
    const bystanderPosture = world.movement.empirePostures.get(bystander);
    const gov = world.government.get(victim);
    const snapshot = JSON.stringify(victimPosture.blocs);
    const sat = () => victimPosture.blocs.map((b: any) => b.satisfaction);

    // ── Covert pressure ──────────────────────────────────────────────────────
    section('covert pressure is charged to the empire it is aimed at');
    const before = { victim: targetedEspionagePressure(world, victim), bystander: targetedEspionagePressure(world, bystander) };
    for (let i = 0; i < 4; i++) {
        world.espionage.operations.set(`op-probe-${i}`, {
            id: `op-probe-${i}`, actorFactionId: spy, targetFactionId: victim,
            targetRegionId: world.economy.factions.get(victim)?.capitalSystemId ?? 'x',
            domain: 'politicalSubversion', definitionId: 'incite_rebellion', investmentLevel: 1, riskLevel: 0.5,
            startedAt: new Date(world.nowSeconds * 1000).toISOString(),
            completesAt: new Date((world.nowSeconds + 10 * 86400) * 1000).toISOString(),
            status: 'active', attributionState: 'invisible',
        });
    }
    check('four live operations saturate pressure on their target',
        before.victim === 0 && targetedEspionagePressure(world, victim) >= 0.99, `${targetedEspionagePressure(world, victim)}`);
    check('and put none on an empire nobody is spying on',
        before.bystander === 0 && targetedEspionagePressure(world, bystander) === 0);
    const ambient = world.shared.espionagePressure;
    tickOperations(world, 3600);
    check('live operations no longer feed the galaxy-wide scalar',
        world.shared.espionagePressure <= ambient, `${ambient} -> ${world.shared.espionagePressure}`);
    check('the targeted empire\'s blocs carry an espionage driver',
        computeBlocOutlook(victimPosture.blocs[0], victimPosture, world, victim).drivers.some(d => d.id === 'espionage' && d.points < -10));
    check('the bystander\'s do not',
        !computeBlocOutlook(bystanderPosture.blocs[0], bystanderPosture, world, bystander).drivers.some(d => d.id === 'espionage'));

    // ── Interest groups ──────────────────────────────────────────────────────
    section('an interest group settles where its circumstances put it');
    const savedFatigue = gov.warFatigue;
    gov.warFatigue = 100;
    for (let i = 0; i < 400; i++) tickBlocDrift(victim, world, TICK_SECONDS);
    const settled = sat();
    for (let i = 0; i < 50; i++) tickBlocDrift(victim, world, TICK_SECONDS);
    const later = sat();
    check('under maximum war exhaustion and saturated espionage every bloc settles at its target',
        victimPosture.blocs.every((b: any, i: number) => Math.abs(settled[i] - later[i]) < 0.01 && Math.abs(b.satisfaction - b.target) < 0.5),
        JSON.stringify(settled.map((s: number) => Math.round(s))));
    check('and the empire as a whole is unhappy, not dead',
        weightedBlocSatisfaction(world, victim) > 15 && weightedBlocSatisfaction(world, victim) < 45,
        weightedBlocSatisfaction(world, victim).toFixed(1));

    victimPosture.blocs.forEach((b: any) => { b.satisfaction = 80; });
    tickBlocDrift(victim, world, TICK_SECONDS);
    const oneStep = sat();
    victimPosture.blocs.forEach((b: any) => { b.satisfaction = 80; });
    for (let i = 0; i < 6; i++) tickBlocDrift(victim, world, TICK_SECONDS / 6);
    check('the step does not depend on how the time is sliced',
        sat().every((s: number, i: number) => Math.abs(s - oneStep[i]) < 1e-6));

    gov.warFatigue = savedFatigue;
    for (let i = 0; i < 4; i++) world.espionage.operations.delete(`op-probe-${i}`);

    // Embargoes are a driver the panel can show, not a hidden deduction.
    const trade = victimPosture.blocs.find((b: any) => b.id === 'trade');
    const sanctions = world.diplomacy.sanctions;
    const savedSanctions = new Map(sanctions);
    sanctions.clear();
    const free = computeBlocOutlook(trade, victimPosture, world, victim).target;
    for (const imposer of originals.slice(1, 4)) {
        sanctions.set(`${imposer}|${victim}`, { id: `${imposer}|${victim}`, imposerId: imposer, targetId: victim, startedAt: world.nowSeconds });
    }
    const embargoed = computeBlocOutlook(trade, victimPosture, world, victim);
    check('three embargoes show up as a driver on the merchants',
        embargoed.drivers.some(d => d.id === 'embargoed' && d.points <= -20) && embargoed.target < free,
        `${free.toFixed(0)} -> ${embargoed.target.toFixed(0)}`);
    const held = trade.satisfaction;
    tickSanctions(world);
    check('and the sanctions tick itself no longer touches satisfaction', trade.satisfaction === held);
    // Embargoed by everyone and embargoing everyone back: one ceiling, not two.
    for (const other of originals.slice(1)) {
        sanctions.set(`${other}|${victim}`, { id: `${other}|${victim}`, imposerId: other, targetId: victim, startedAt: world.nowSeconds });
        sanctions.set(`${victim}|${other}`, { id: `${victim}|${other}`, imposerId: victim, targetId: other, startedAt: world.nowSeconds });
    }
    const pariah = computeBlocOutlook(trade, victimPosture, world, victim);
    const embargoCost = pariah.drivers.filter(d => d.id === 'embargoed' || d.id === 'enforcing').reduce((s, d) => s + d.points, 0);
    check('a galaxy-wide mutual embargo still leaves the merchants somewhere to stand',
        pariah.target > 0 && embargoCost >= -40.001 && embargoCost <= -39.999, `target ${pariah.target.toFixed(1)}, embargo drivers ${embargoCost.toFixed(1)}`);
    sanctions.clear();
    for (const [k, v] of savedSanctions) sanctions.set(k, v);

    // A chamber that has just answered a question is not asked it again the
    // next morning.
    const savedQuestions = JSON.stringify(victimPosture.openQuestions ?? []);
    const savedCapital = gov.politicalCapital;
    victimPosture.openQuestions = [];
    victimPosture.settledQuestions = {};
    gov.politicalCapital = 100;
    const first = openDebate(world, victim, 'espionage_exposed_on_us', { aggressor: spy }, spy);
    const answered = first ? resolveDebate(world, victim, first.id, 'quiet_expulsion') : { ok: false };
    check('a settled question is not reopened by the very next exposure',
        !!first && answered.ok && openDebate(world, victim, 'espionage_exposed_on_us', { aggressor: spy }, spy) === null);
    check('but the same question about a different aggressor still is',
        openDebate(world, victim, 'espionage_exposed_on_us', { aggressor: bystander }, bystander) !== null);
    world.nowSeconds += 16 * 86400;
    check('and a Galactic Day later it can be asked again',
        openDebate(world, victim, 'espionage_exposed_on_us', { aggressor: spy }, spy) !== null);
    world.nowSeconds -= 16 * 86400;

    // The same question answered the same way forty times moves influence
    // from the losers to the winners until the losers have none left to give —
    // and stops there. It must not go on to squeeze the blocs that had no
    // stake in it.
    victimPosture.blocs = JSON.parse(snapshot);
    const stakes: Record<string, number> = { military: 1, religious: 1, frontier: 1, trade: -1, science: -1, alien_minorities: -1 };
    const seated = new Map<string, number>(victimPosture.blocs.map((b: any) => [b.id, b.influence]));
    const savedLegitimacy = gov.legitimacy;
    for (let i = 0; i < 40; i++) {
        victimPosture.openQuestions = [];
        victimPosture.settledQuestions = {};
        gov.politicalCapital = 100;
        const asked = openDebate(world, victim, 'espionage_exposed_on_us', { aggressor: spy }, spy);
        if (asked) resolveDebate(world, victim, asked.id, 'demand_reckoning');
    }
    const ground = victimPosture.blocs.filter((b: any) => b.influence <= 3.5).length;
    const bystanders = victimPosture.blocs.filter((b: any) => !(b.id in stakes));
    check('forty identical votes do not grind the chamber down',
        ground * 2 < victimPosture.blocs.length
        && bystanders.every((b: any) => Math.abs(b.influence - (seated.get(b.id) ?? 0)) < 0.01)
        && Math.abs(victimPosture.blocs.reduce((s: number, b: any) => s + b.influence, 0) - 100) < 0.01,
        `${ground} of ${victimPosture.blocs.length} at the floor; ${victimPosture.blocs.map((b: any) => `${b.id} ${b.influence.toFixed(1)}`).join(', ')}`);
    gov.legitimacy = savedLegitimacy;

    victimPosture.openQuestions = JSON.parse(savedQuestions);
    victimPosture.settledQuestions = {};
    gov.politicalCapital = savedCapital;
    victimPosture.blocs = JSON.parse(snapshot);

    // ── The press cycle ──────────────────────────────────────────────────────
    section('the press cycle is bounded');
    const adj = new Map<string, string[]>([['A', ['B']], ['B', ['A', 'C']], ['C', ['B']]]);
    const mini = miniPress(['emp'], ['A', 'B', 'C']);
    let pub = publication('s1', 'wire', 'planet_A', 1);
    let peakNeighbour = 0;
    let lifetime = 0;
    for (let t = 1; t <= 600; t++) {
        pub = { ...pub, transmissionMap: calculateViralSpread(pub, mini.planets, adj, new Set(), new Set(), new Map(), 6) };
        peakNeighbour = Math.max(peakNeighbour, pub.transmissionMap.get('planet_B') ?? 0);
        if ([...pub.transmissionMap.values()].some(v => v > 0)) lifetime = t;
    }
    check('a story on adjacent worlds dies', lifetime < 400 && [...pub.transmissionMap.values()].every(v => v === 0), `still alive at tick ${lifetime}`);
    check('and is never louder next door than where it broke',
        peakNeighbour > 0 && peakNeighbour <= 100 * PressConfig.propagation.hopAttenuation, peakNeighbour.toFixed(1));

    const one = propagateEffects(1, [publication('s1', 'wire', 'planet_A')], mini.planets, mini.empires).empirePressure.get('emp') ?? 0;
    const fifteen = propagateEffects(1,
        Array.from({ length: 15 }, (_, i) => publication('s1', `outlet${i}`, 'planet_A')), mini.planets, mini.empires,
    ).empirePressure.get('emp') ?? 0;
    check('fifteen outlets repeating one story are one story', one > 0 && Math.abs(fifteen - one) < 1e-9, `${one} vs ${fifteen}`);

    const big = miniPress(['emp'], ['A', 'B', 'C', 'D', 'E', 'F']);
    const small = miniPress(['emp'], ['A']);
    const onSix = propagateEffects(1, [publication('s1', 'wire', 'planet_A')], big.planets, big.empires).empirePressure.get('emp') ?? 0;
    const onOne = propagateEffects(1, [publication('s1', 'wire', 'planet_A')], small.planets, small.empires).empirePressure.get('emp') ?? 0;
    check('a story gripping one world of six weighs a sixth of one gripping the whole empire',
        Math.abs(onSix - onOne / 6) < 1e-9, `${onOne} vs ${onSix}`);

    // A whole cycle, with a press office at its desk as every AI and every
    // delegated empire has: a coup breaks, every outlet runs it once, pressure
    // rises, stays under the crisis line, and drains away again.
    let cycle = miniPress(['emp'], ['A'], 13);
    cycle.activeStories.set('coup', story('coup', 'emp', 95));
    let peak = 0;
    for (let t = 1; t <= 400; t++) {
        cycle = tickPressSystem(cycle, 6, 7, new Map([['A', []]])).newState;
        runPressOffice({ press: cycle } as any, 'emp');
        peak = Math.max(peak, cycle.empires.get('emp')!.informationPressure);
    }

    // The live feed is capped, so a publication falls off the end of it while
    // its story is still in the pool — which is what used to make every outlet
    // run the story again, at full intensity, every tick.
    let rerun = miniPress(['emp'], ['A'], 13);
    rerun.activeStories.set('coup', story('coup', 'emp', 95));
    let publicationsMade = 0;
    for (let t = 1; t <= 30; t++) {
        const feedBefore = new Set(rerun.publishedStories.map(p => p.id));
        rerun = tickPressSystem(rerun, 6, 7, new Map([['A', []]])).newState;
        publicationsMade += rerun.publishedStories.filter(p => p.storyId === 'coup' && !feedBefore.has(p.id)).length;
        if (t % 3 === 0) rerun.publishedStories = [];
    }
    check('each outlet runs a story once, even after it falls off the feed',
        publicationsMade === 14 && rerun.activeStories.has('coup'), `${publicationsMade} publications from 14 outlets`);
    check('one major story raises pressure without reaching the crisis line',
        peak > 5 && peak < PressConfig.thresholds.crisisTriggerPressure, `peak ${peak.toFixed(1)}`);
    check('and the pressure drains away afterwards',
        cycle.empires.get('emp')!.informationPressure < 1, cycle.empires.get('emp')!.informationPressure.toFixed(2));
    check('audiences calm down again',
        Math.abs(cycle.planets.get('planet_A')!.stability - PressConfig.audience.restingStability) < 1
        && Math.abs(cycle.planets.get('planet_A')!.radicalization - PressConfig.audience.restingRadicalization) < 1,
        `stability ${cycle.planets.get('planet_A')!.stability.toFixed(1)}`);

    // The feed, through the real tickPress on the whole galaxy: sixteen outlets,
    // so a story arrives fifteen times over. A coup breaks, then a dozen other
    // stories about other empires — which used to push every copy of the coup
    // off the feed, at full intensity, within four ticks.
    recalculateSystemControl(world);
    pushWorldStory(world, { targetEmpireId: victim, subject: 'probe: a coup', magnitude: 95 });
    tickPress(world, 900_000);
    const coupId = [...world.press.activeStories.values()].find((s: any) => s.subject === 'probe: a coup')?.id;
    for (let n = 0; n < 12; n++) {
        pushWorldStory(world, { targetEmpireId: originals[1 + (n % (originals.length - 1))], subject: `probe: later story ${n}`, magnitude: 70 });
        tickPress(world, 900_001 + n);
    }
    const feed: PublishedStory[] = world.press.publishedStories;
    check('a major story is still in the news after a dozen later ones break',
        !!coupId && feed.some(p => p.storyId === coupId && isCirculating(p)),
        `${feed.filter(p => p.storyId === coupId).length} of ${feed.length} feed rows`);
    check('and the feed carries one row per story per epicentre, not one per outlet',
        feed.length > 0 && new Set(feed.map(p => `${p.storyId}|${p.originPlanetId}`)).size === feed.length,
        `${feed.length} rows`);

    // ── The press office ─────────────────────────────────────────────────────
    section('a press office answers when nobody is at the desk');
    const desk = miniPress(['emp'], ['A']);
    desk.investigations.set('inv', {
        id: 'inv', targetEmpireId: 'emp', investigatorId: 'wire', subject: 'Missing Military Funds',
        stage: InvestigationStage.RUMOUR, progress: 0, evidence: 20, startedTick: 0, updatedTick: 0, resolved: false,
    });
    desk.activeStories.set('thin', story('thin', 'emp', 60, 20));
    desk.crises.set('c1', { id: 'c1', storyId: 'thin', targetEmpireId: 'emp', deadlineTick: 24, severity: 80, resolved: false });
    desk.empires.get('emp')!.informationPressure = 80;
    const deskWorld: any = { press: desk };
    check('a rumour is left alone, and a crisis is not answered the tick it breaks',
        runPressOffice(deskWorld, 'emp').length === 0
        && !desk.investigations.get('inv')!.resolved && !desk.crises.get('c1')!.resolved);
    desk.tick = 4; // a sim day later: the player and the rivals have had their window
    runPressOffice(deskWorld, 'emp');
    check('a crisis over a thin story is denied, and the denial holds',
        desk.crises.get('c1')!.resolved && desk.crises.get('c1')!.choiceMade === 'DENY' && desk.empires.get('emp')!.publicTrust === 60);
    desk.investigations.get('inv')!.stage = InvestigationStage.INQUIRY;
    runPressOffice(deskWorld, 'emp');
    check('a formal inquiry gets cooperation — a little trust, never a scandal',
        desk.investigations.get('inv')!.resolved && desk.empires.get('emp')!.publicTrust === 57);
    check('and there is nothing left on the desk', runPressOffice(deskWorld, 'emp').length === 0);

    // ── Governors ────────────────────────────────────────────────────────────
    section('a poor governor wears a world down to restless, not into revolt');
    const capital: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === victim && p.governorId);
    const governor: any = capital && world.leadership.leaders.get(capital.governorId);
    if (capital && governor) {
        const saved = { stability: capital.stability, happiness: capital.happiness, competence: governor.competence, corruption: governor.corruption, loyalty: governor.loyalty };
        governor.competence = 30; governor.corruption = 50; governor.loyalty = 80;
        capital.stability = 90; capital.happiness = 90;
        for (let i = 0; i < 1260; i++) tickGovernors(world, TICK_SECONDS);
        check('a season under an incompetent, corrupt governor leaves stability at 50',
            capital.stability === 50 && capital.happiness === 50, `stability ${capital.stability}, happiness ${capital.happiness}`);
        governor.competence = 90; governor.corruption = 0;
        for (let i = 0; i < 400; i++) tickGovernors(world, TICK_SECONDS);
        check('and a good one still lifts it all the way', capital.stability === 100);
        Object.assign(governor, { competence: saved.competence, corruption: saved.corruption, loyalty: saved.loyalty });
        capital.stability = saved.stability; capital.happiness = saved.happiness;
    } else {
        check('a governed capital exists to test on', false);
    }
}

/** What the bug did to a galaxy: every stock of the approval layer on the floor. */
function flatten(world: any, originals: string[]): void {
    world.shared.espionagePressure = 1;
    for (const id of originals) {
        for (const bloc of world.movement.empirePostures.get(id).blocs) bloc.satisfaction = 0;
        const empire = world.press.empires.get(id);
        empire.publicTrust = 0; empire.informationPressure = 100; empire.credibility = 0;
        const gov = world.government.get(id);
        gov.approval = 0; gov.legitimacy = 0; gov.coupPressure = 90;
    }
    for (const record of world.planetCohesion.values()) record.cohesion = 5;
    for (let i = 0; i < 60; i++) world.press.activeStories.set(`RUMOR_${i}`, story(`RUMOR_${i}`, originals[i % originals.length], 30));
    world.press.publishedStories = Array.from({ length: 50 }, (_, i) =>
        publication(`RUMOR_${i}`, 'galactic_wire', [...world.press.planets.keys()][0]));
}

/** Part 3 — flatten a healthy galaxy the way the bug did, then repair it. */
function repair(world: any, originals: string[]): void {
    section('a healthy galaxy is left exactly as it is');
    const healthy = JSON.stringify(originals.map(id => read(world, id)));
    const untouched = repairApprovalCollapse(world);
    check('nothing is restored and nothing changes',
        !untouched.applied && JSON.stringify(originals.map(id => read(world, id))) === healthy);

    section('a collapsed galaxy is put back');
    world.appliedRepairs = [];
    flatten(world, originals);
    // ...and the two things only a long collapse produced: a world the planet
    // rails ruined, and a chamber one question ground down.
    const ruined: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === originals[0]);
    ruined.stability = 0; ruined.unrest = 100; ruined.happiness = 0;
    const ruinedGovernor: any = ruined.governorId ? world.leadership.leaders.get(ruined.governorId) : undefined;
    if (ruinedGovernor) ruinedGovernor.loyalty = 0;
    const groundDown = world.movement.empirePostures.get(originals[1]).blocs;
    groundDown.forEach((b: any, i: number) => { b.influence = i < 3 ? 82 / 3 : 3; });

    const report = repairApprovalCollapse(world);
    const after = originals.map(id => read(world, id)).filter(r => r.worlds > 0);
    check('every flattened empire is restored', report.applied && report.restored.length === originals.length,
        `${report.restored.length} of ${originals.length}`);
    // Not everyone lands in the same place: an empire with four live
    // operations against it is restored to what THAT supports, not to par.
    check('approval is back out of the zone where legitimacy bleeds, and tolerable for most',
        after.every(r => r.approval >= 30) && median(after.map(r => r.approval)) >= 40,
        after.map(r => Math.round(r.approval)).join(' '));
    check('trust, legitimacy and the officers are back to working values',
        after.every(r => r.trust >= 50 && r.legitimacy >= 50 && r.coup <= 40));
    check('worlds are steadied at the cohesion their conditions support',
        [...world.planetCohesion.values()].every((r: any) => r.cohesion > 5 || !originals.includes(r.factionId)));
    check('a ruined world is brought back to restless, and its governor with it',
        ruined.stability >= 50 && ruined.unrest <= 10 && ruined.happiness >= 50 && (!ruinedGovernor || ruinedGovernor.loyalty >= 50),
        `stability ${ruined.stability}, unrest ${ruined.unrest}`);
    check('a chamber ground down to the floor is reseated',
        groundDown.filter((b: any) => b.influence <= 3.5).length * 2 < groundDown.length
        && Math.abs(groundDown.reduce((s: number, b: any) => s + b.influence, 0) - 100) < 0.01,
        groundDown.map((b: any) => b.influence.toFixed(1)).join(' '));
    // A story a live investigation still points at is deliberately kept — but
    // marked as already run by every outlet, so it does not break again as new.
    const pinned = new Set([...world.press.investigations.values()]
        .filter((inv: any) => !inv.resolved && inv.storyId).map((inv: any) => inv.storyId));
    const kept: any[] = [...world.press.activeStories.values()];
    check('the news cycle starts clean',
        world.press.publishedStories.length === 0
        && kept.every(s => pinned.has(s.id) && s.raisedCrisis === true && (s.carriedBy?.length ?? 0) >= world.press.pressFactions.size)
        && originals.every(id => world.press.empires.get(id).informationPressure === 0)
        && world.shared.espionagePressure === 0,
        `${kept.length} stories left: ${kept.map(s => s.id).join(', ')}`);

    // The marker, not the healed numbers, is what stops a second run: collapse
    // the galaxy again after a save round trip and it must be left alone.
    const reloaded: any = deserializeWorld(serializeWorld(world));
    flatten(reloaded, originals);
    const flat = JSON.stringify(originals.map(id => read(reloaded, id)));
    const again = repairApprovalCollapse(reloaded);
    check('and it only ever runs once, even across a save and a fresh collapse',
        !again.applied && JSON.stringify(originals.map(id => read(reloaded, id))) === flat);
}

/** Put the console back before reporting a crash: main() runs with it silenced. */
let restoreConsole = () => {};

/** Empires claimed by a player in the season run; the rest are played by the AI. */
const HUMAN_SEATS = 10;

async function main() {
    seedSimulation(seed);
    const quiet = quietConsole();
    restoreConsole = quiet.restore;
    let world = bootSoakWorld();
    const originals = empireIds(world);

    mechanisms(deserializeWorld(serializeWorld(world)), originals);
    resetChronicleBuffer();
    const mechanismResults = results.splice(0);

    // ── Part 2: a season in the shape of the playtest, nothing scripted ──────
    // Ten empires are claimed and their players never issue an order, so every
    // system is delegated (the default for a faction with no record); four are
    // run by the AI. The two paths answer the same desks through different
    // code, and a season with nobody claimed only ever tests one of them.
    const humans = originals.slice(0, HUMAN_SEATS);
    world.claimedFactionIds = [...humans];
    const events: Record<string, number> = {};
    const checkpoints: Array<{ tick: number; rows: Reading[]; ambient: number }> = [];
    const everZero = new Set<string>();
    const lowestApproval = new Map<string, number>();
    const heldDown = new Map<string, number>();
    let overTheLine = 0;
    let empireTicks = 0;

    for (let i = 1; i <= ticks; i++) {
        ({ world } = await stepSoak(world, i));
        for (const row of drainBuffer().rows) events[row.type] = (events[row.type] ?? 0) + 1;

        for (const id of originals) {
            const g = world.government.get(id);
            if (!g || worldsOf(world, id) === 0) continue;
            // After the first sim week: approval starts from whatever the seed
            // dealt and takes a few days to find its level.
            if (i > 28) lowestApproval.set(id, Math.min(lowestApproval.get(id) ?? 100, g.approval));
            if (i > 20 && g.approval < 1) everZero.add(id);
            empireTicks++;
            if ((world.press.empires.get(id)?.informationPressure ?? 0) > PressConfig.thresholds.crisisTriggerPressure) overTheLine++;
            // A bloc sitting far below what its drivers say is a bloc something
            // is deducting from behind the model's back.
            for (const bloc of world.movement.empirePostures.get(id)?.blocs ?? []) {
                if ((bloc.target ?? 50) - bloc.satisfaction > 20) {
                    heldDown.set(`${id}/${bloc.id}`, (heldDown.get(`${id}/${bloc.id}`) ?? 0) + 1);
                }
            }
        }
        if (i % Math.max(1, Math.floor(ticks / 6)) === 0 || i === ticks) {
            checkpoints.push({ tick: i, rows: originals.map(id => read(world, id)), ambient: world.shared.espionagePressure });
        }
    }

    const final = checkpoints[checkpoints.length - 1].rows;
    const standing = final.filter(r => r.worlds > 0).sort((a, b) => a.approval - b.approval);
    const approvals = standing.map(r => r.approval);
    const worstHeld = [...heldDown.entries()].sort((a, b) => b[1] - a[1])[0];

    section('the season');
    check('every empire is still standing', standing.length === originals.length,
        `${originals.length - standing.length} lost every world`);
    check('no approval was ever pinned at zero', everZero.size === 0, [...everZero].join(', '));
    check('median approval is in a playable band (40–75)',
        median(approvals) >= 40 && median(approvals) <= 75, median(approvals).toFixed(1));
    // Per empire, not on the median: four empires on the floor hide easily
    // behind ten that are fine.
    const dipped = standing.filter(r => (lowestApproval.get(r.id) ?? 100) < 30);
    check('no government ever dips under the line where legitimacy bleeds (30)',
        dipped.length === 0, dipped.map(r => `${r.id} ${Math.round(lowestApproval.get(r.id) ?? 0)}`).join(', '));
    check('every empire keeps the public\'s trust (30 or better at the end)', standing.every(r => r.trust >= 30),
        standing.filter(r => r.trust < 30).map(r => `${r.id} ${Math.round(r.trust)}`).join(', '));
    check('no cabinet is left to rot (corruption under 60 everywhere)', standing.every(r => r.corruption < 60),
        standing.filter(r => r.corruption >= 60).map(r => `${r.id} ${Math.round(r.corruption)}`).join(', '));
    check('no government is left without a mandate', standing.every(r => r.legitimacy >= 30),
        standing.filter(r => r.legitimacy < 30).map(r => `${r.id} ${Math.round(r.legitimacy)}`).join(', '));
    check('political capital accrued for most empires',
        standing.filter(r => r.capital > 10).length >= Math.ceil(standing.length * 0.6),
        `${standing.filter(r => r.capital > 10).length} of ${standing.length}`);
    check('no empire is coming apart (cohesion 40 or better everywhere)', standing.every(r => r.cohesion >= 40),
        standing.filter(r => r.cohesion < 40).map(r => `${r.id} ${Math.round(r.cohesion)}`).join(', '));
    check('nobody seceded from an empire at peace',
        (events.secession_declared ?? 0) === 0 && (events.civil_war_started ?? 0) === 0,
        `secessions ${events.secession_declared ?? 0}, civil wars ${events.civil_war_started ?? 0}`);
    check('information pressure is over the crisis line less than 5% of the time',
        overTheLine / Math.max(1, empireTicks) < 0.05, `${(100 * overTheLine / Math.max(1, empireTicks)).toFixed(1)}%`);
    check('no interest group is held far below what its drivers say',
        !worstHeld || worstHeld[1] / ticks < 0.1, worstHeld ? `${worstHeld[0]} for ${worstHeld[1]} ticks` : '');
    check('the galaxy-wide pressure scalar is not pinned', checkpoints.every(c => c.ambient < 0.95),
        checkpoints.map(c => c.ambient.toFixed(2)).join(' '));
    const errors = [...quiet.complaints.entries()].sort((a, b) => b[1] - a[1]);
    check('nothing threw', errors.length === 0);
    const seasonResults = results.splice(0);

    repair(world, originals);
    const repairResults = results.splice(0);
    quiet.restore();

    console.log(`\nApproval probe — ${ticks} strategic ticks (${(ticks * 24 / 60 / 24).toFixed(1)} real days), seed ${seed}, ${humans.length} empires claimed (everything delegated) + ${originals.length - humans.length} AI`);
    console.log('\nPart 1 — the mechanisms');
    for (const line of mechanismResults) console.log(line);

    console.log('\nPart 2 — a season with nobody at the controls');
    console.log('  tick  approval min/med/max   blocs med  trust med  legit min/med   PC med  cohesion min/med  coupP max  press max  standing');
    for (const c of checkpoints) {
        const alive = c.rows.filter(r => r.worlds > 0);
        const col = (pick: (r: Reading) => number) => alive.map(pick);
        const f = (n: number) => String(Math.round(n)).padStart(3);
        console.log(
            `  ${String(c.tick).padStart(4)}  ${f(Math.min(...col(r => r.approval)))} /${f(median(col(r => r.approval)))} /${f(Math.max(...col(r => r.approval)))}        ${f(median(col(r => r.blocs)))}        ${f(median(col(r => r.trust)))}     ${f(Math.min(...col(r => r.legitimacy)))} /${f(median(col(r => r.legitimacy)))}      ${f(median(col(r => r.capital)))}        ${f(Math.min(...col(r => r.cohesion)))} /${f(median(col(r => r.cohesion)))}        ${f(Math.max(...col(r => r.coup)))}        ${f(Math.max(...col(r => r.pressure)))}     ${String(alive.length).padStart(2)}/${originals.length}`
        );
    }

    console.log('\n  empire                         worlds approval  blocs  trust  legit    PC  cohesion  coupP  press  corrupt  lowest approval');
    for (const r of final) {
        console.log(
            `  ${`${r.id} ${humans.includes(r.id) ? '(human)' : '(AI)'}`.padEnd(30)} ${String(r.worlds).padStart(5)} ${r.approval.toFixed(0).padStart(8)} ${r.blocs.toFixed(0).padStart(6)} ${r.trust.toFixed(0).padStart(6)} ${r.legitimacy.toFixed(0).padStart(6)} ${r.capital.toFixed(0).padStart(5)} ${r.cohesion.toFixed(0).padStart(9)} ${r.coup.toFixed(0).padStart(6)} ${r.pressure.toFixed(0).padStart(6)} ${r.corruption.toFixed(0).padStart(8)} ${(lowestApproval.get(r.id) ?? 0).toFixed(0).padStart(16)}`
        );
    }

    // Why the least approved empire is where it is, in the model's own words.
    const worst = standing[0];
    if (worst) {
        const posture = world.movement.empirePostures.get(worst.id);
        console.log(`\n  least approved empire: ${worst.id} (approval ${worst.approval.toFixed(0)})`);
        for (const bloc of [...posture.blocs].sort((a: any, b: any) => b.influence - a.influence)) {
            const outlook = computeBlocOutlook(bloc, posture, world, worst.id);
            console.log(`    ${bloc.name.padEnd(22)} ${String(Math.round(bloc.influence)).padStart(3)}% influence  ${String(Math.round(bloc.satisfaction)).padStart(3)} → ${String(Math.round(outlook.target)).padStart(3)}   ${outlook.drivers.slice(0, 3).map(d => `${d.label} ${d.points >= 0 ? '+' : ''}${d.points.toFixed(0)}`).join('; ')}`);
        }
    }

    const tally = ['secession_declared', 'civil_war_started', 'coup_attempted', 'government_changed', 'scandal_confirmed', 'investigation_published', 'leader_died']
        .map(t => `${t}=${events[t] ?? 0}`).join('  ');
    console.log(`\n  chronicle: ${tally}`);
    console.log(`  console.error lines: ${errors.length} distinct`);
    for (const [line, n] of errors.slice(0, 10)) console.log(`   ×${n}  ${line}`);
    for (const line of seasonResults) console.log(line);

    console.log('\nPart 3 — the repair');
    for (const line of repairResults) console.log(line);

    console.log(failures === 0 ? '\nPASS — an empire left alone stays governable.\n' : `\n${failures} FAILED\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { restoreConsole(); console.error('THREW:', e); process.exit(1); });
