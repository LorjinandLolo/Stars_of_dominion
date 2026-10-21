// scripts/plot-probe.ts
// Brutus: can a seated minister conspire, and does the court find out the way
// the design says it does?
//
// lib/government/plots.ts + plot-view.ts + shard-privacy.ts. Two friends sit
// in one cabinet; one plots. Sounding out the disloyal recruits them, the
// loyal report to the ruler's desk (sometimes naming the plotter), a human
// colleague is invited and answers for themselves, one approach a day, and a
// plot may not strike while the empire stands well. A second plotter's
// approach to someone already inside the first plot warns the FIRST plot,
// not the ruler. The ruler's shard projection carries no plot; the
// plotter's carries only theirs; an invitee sees the invitation and nothing
// of the plotter's books.
//
// Run:  npx tsx scripts/plot-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { syncHumanMinisters, seatLeaderId } from '../lib/government/human-ministers';
import {
    startPlot, soundOut, answerInvitation, abandonPlot, plotActors, plotBySeat, strikeReadiness, invitationsFor, noteSeat,
    OFFICERS_ACTOR_ID, SOUND_OUT_EVERY_SECONDS, soundOutOdds,
} from '../lib/government/plots';
import { getMinister } from '../lib/government/cabinet-service';
import { getGovernment } from '../lib/government/government-service';
import { extractFactionShard, serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { scrubForRole } from '../lib/persistence/shard-privacy';
import { drainNotifications } from '../lib/time/notification-hooks';

let failures = 0;
const results: string[] = [];
/** A die that rolls these values in order, then the last one forever. */
function dice(...rolls: number[]): () => number { let i = 0; return () => rolls[Math.min(i++, rolls.length - 1)]; }
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('plots');
    const quiet = quietConsole(line => line.startsWith('[Plot]'));
    let world = bootSoakWorld();
    const [human] = empireIds(world);
    world.claimedFactionIds = [human];
    const DAY = 86400;

    // Two friends in the cabinet: Brutus (defence) and Cassius (foreign).
    const brutus = { id: 'seat-b', factionId: human, portfolio: 'defence', persona: 'Brutus' };
    const cassius = { id: 'seat-c', factionId: human, portfolio: 'foreign', persona: 'Cassius' };
    syncHumanMinisters(world, [brutus, cassius]);
    const gov: any = getGovernment(world, human);

    // ── Odds behave ─────────────────────────────────────────────────────────
    const loyalOdds = soundOutOdds({ loyalty: 90, corruption: 0, ambitionDrive: 20 });
    const rottenOdds = soundOutOdds({ loyalty: 10, corruption: 80, ambitionDrive: 90 });
    check('a loyal, clean minister never joins and likely reports', loyalOdds.join === 0 && loyalOdds.report > 0.5, JSON.stringify(loyalOdds));
    check('a disloyal, corrupt, ambitious one likely joins and never reports', rottenOdds.join > 0.8 && rottenOdds.report === 0, JSON.stringify(rottenOdds));

    // ── Start ───────────────────────────────────────────────────────────────
    check('the ruler cannot plot (no seat)', !startPlot(world, human, 'seat-nobody', 'coup').ok);
    const started = startPlot(world, human, brutus.id, 'coup');
    check('Brutus starts a plot', started.ok && !!plotBySeat(world, human, brutus.id), started.message);
    check('…and not two', !startPlot(world, human, brutus.id, 'coup').ok);
    const plot = plotBySeat(world, human, brutus.id)!;
    const actors = plotActors(world, human, plot);
    check('the actors are the other ministers, the officer corps, and Cassius as a player', actors.some(a => a.kind === 'minister') && actors.some(a => a.id === OFFICERS_ACTOR_ID) && actors.some(a => a.kind === 'human' && a.humanSeatId === cassius.id)
        && !actors.some(a => a.id === seatLeaderId(brutus.id)), actors.map(a => `${a.kind}:${a.name}`).join(', '));

    // ── Sound out: a loyal minister reports, naming Brutus ──────────────────
    const economy = getMinister(world, human, 'economy')!;
    economy.loyalty = 95; economy.corruption = 0; economy.ambitionDrive = 10;
    const r1 = soundOut(world, human, brutus.id, economy.id, dice(0.9, 0.1, 0.1)); // no join, then reports, and names Brutus
    check('a loyal minister refuses and reports', r1.ok && plot.recruits[economy.id] === 'reported', r1.message);
    check('the report sits on the ruler\'s loyalty desk', (gov.loyaltyReports?.length ?? 0) === 1 && gov.loyaltyReports[0].reporterName === economy.name, gov.loyaltyReports?.[0]?.text);
    check('one approach a day', !soundOut(world, human, brutus.id, OFFICERS_ACTOR_ID).ok);
    const rulerNotes = drainNotifications(human) as any[];
    check('…and rings the ruler\'s bell', rulerNotes.some(n => n.title === 'A LOYAL SERVANT REPORTS'));

    // ── Next day: a disloyal governor joins ─────────────────────────────────
    world.nowSeconds += DAY;
    const science = getMinister(world, human, 'science')!;
    science.loyalty = 10; science.corruption = 80; science.ambitionDrive = 90;
    const r2 = soundOut(world, human, brutus.id, science.id, () => 0.1);
    check('a disloyal minister joins', r2.ok && plot.recruits[science.id] === 'joined', r2.message);
    check('…and their shown loyalty number did not move', science.loyalty === 10);

    // ── The officer corps follows its satisfaction ──────────────────────────
    world.nowSeconds += DAY;
    const military: any = world.movement.empirePostures.get(human)?.blocs?.find((b: any) => b.id === 'military');
    military.satisfaction = 20;
    const r3 = soundOut(world, human, brutus.id, OFFICERS_ACTOR_ID);
    check('a discontented officer corps joins', r3.ok && plot.recruits[OFFICERS_ACTOR_ID] === 'joined', r3.message);

    // ── Cassius is invited and answers for himself ──────────────────────────
    world.nowSeconds += DAY;
    const cassiusLeader = seatLeaderId(cassius.id);
    const r4 = soundOut(world, human, brutus.id, cassiusLeader);
    check('a human colleague is invited, not rolled', r4.ok && plot.recruits[cassiusLeader] === 'invited', r4.message);
    check('Cassius sees the invitation', invitationsFor(world, human, cassius.id).length === 1 && invitationsFor(world, human, cassius.id)[0].plotterName === 'Brutus');
    check('a stranger cannot answer it', !answerInvitation(world, human, 'seat-nobody', plot.id, 'join').ok);
    const a1 = answerInvitation(world, human, cassius.id, plot.id, 'join');
    check('Cassius joins', a1.ok && plot.recruits[cassiusLeader] === 'joined');

    // ── The gate: inside enough, but the empire stands well ─────────────────
    gov.coupPressure = 10; gov.legitimacy = 80; gov.cohesion = 80;
    const notYet = strikeReadiness(world, plot);
    check('enough inside, but no strike while the empire stands well', !notYet.ok && notYet.recruits >= 2 && notYet.reasons.some(r => r.includes('stands too well')), notYet.reasons.join(' '));
    gov.legitimacy = 30;
    check('rot opens the gate', strikeReadiness(world, plot).ok);

    // ── Privacy: shard projections by role ──────────────────────────────────
    noteSeat(world, brutus.id, 'private word', true);
    const shard = JSON.parse(extractFactionShard(world, human));
    check('the faction shard carries the plot and the note', Array.isArray(shard.plots) && shard.plots.length === 1 && shard.seatNotes?.[brutus.id]?.text === 'private word');
    const forRuler = scrubForRole(shard, { role: 'ruler' });
    check('the ruler is served no plot and no seat note', forRuler.plots === undefined && forRuler.seatNotes === undefined);
    const forBrutus = scrubForRole(shard, { role: 'minister', seatId: brutus.id });
    check('Brutus is served his own plot and his own note', forBrutus.plots?.length === 1 && forBrutus.plots[0].recruits[science.id] === 'joined' && forBrutus.seatNotes?.[brutus.id]?.text === 'private word');
    // Cassius joined already; make a fresh invitation to test the invitee view.
    world.nowSeconds += DAY;
    const casca = { id: 'seat-k', factionId: human, portfolio: 'interior', persona: 'Casca' };
    syncHumanMinisters(world, [brutus, cassius, casca]);
    soundOut(world, human, brutus.id, seatLeaderId(casca.id));
    const shard2 = JSON.parse(extractFactionShard(world, human));
    const forCasca = scrubForRole(shard2, { role: 'minister', seatId: casca.id });
    check('an invitee sees the invitation and none of the plotter\'s books',
        forCasca.plots?.length === 1 && forCasca.plots[0].recruits[seatLeaderId(casca.id)] === 'invited' && Object.keys(forCasca.plots[0].recruits).length === 1 && forCasca.plots[0].plotterSeatId === '');
    check('the plot survives the worker round trip', (() => { const w2 = deserializeWorld(serializeWorld(world)); return w2.plots?.get(plot.id)?.recruits[science.id] === 'joined'; })());

    // ── Two plots: the conspiracy protects itself ───────────────────────────
    world.nowSeconds += DAY;
    const p2 = startPlot(world, human, cassius.id, 'coup');
    check('a second minister may plot too (no cap)', p2.ok);
    const r5 = soundOut(world, human, cassius.id, science.id, dice(0.95, 0.0)); // refuses Cassius, reports — to Brutus' plot, not the ruler
    check('an actor inside plot A who refuses plot B warns plot A, not the ruler',
        r5.ok && plot.warnings.length === 1 && plot.warnings[0].text.includes('Cassius') && (gov.loyaltyReports?.length ?? 0) === 1, plot.warnings[0]?.text);

    // ── Abandon ─────────────────────────────────────────────────────────────
    const burned = abandonPlot(world, human, brutus.id);
    check('a plot can be burned', burned.ok && !plotBySeat(world, human, brutus.id));
    check('…and started again tomorrow', startPlot(world, human, brutus.id, 'secession').ok);

    quiet.restore();
    console.log('\nplot probe\n' + results.join('\n'));
    if (quiet.complaints.size) {
        console.log('\ncomplaints:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`plot probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
