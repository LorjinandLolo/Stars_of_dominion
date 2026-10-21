// scripts/crisis-probe.ts
// The strike and the days after: does a coup crisis open with the right
// sides, do the verbs move it, and do all three endings land?
//
// lib/government/crisis.ts + crisis-view.ts. A plot with enough inside and a
// rotten empire strikes; actors start where loyalty puts them; the ruler
// secures with political capital and arrests with a roll, the plotter
// secures with favours and seizes the capital with the larger weight, a
// human colleague picks a side; the ruler can flee once. Then three worlds:
// the throne holds (plotter exiled, network purged), the plotter wins (the
// throne changes hands, the old ministers go), and a stalemate splits the
// empire under the plotter. Every ending leaves the worker the claims work
// as a PendingCrisisOutcome.
//
// Run:  npx tsx scripts/crisis-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { syncHumanMinisters, seatLeaderId } from '../lib/government/human-ministers';
import { startPlot, soundOut, answerInvitation, OFFICERS_ACTOR_ID } from '../lib/government/plots';
import {
    strikePlot, openCrisis, secureActor, arrestActor, seizeCapital, fleeToFleet, chooseSide, tickCoupCrises, resolveCrisis, ensureCrises,
} from '../lib/government/crisis';
import { tally, decisiveSide, deadlineOutcome, CRISIS_WINDOW_SECONDS, FLEE_EXTENSION_SECONDS, SECURE_COST_PC } from '../lib/government/crisis-view';
import { getMinister } from '../lib/government/cabinet-service';
import { getGovernment } from '../lib/government/government-service';
import { getHeadOfState } from '../lib/government/succession-service';
import { serializeWorld, deserializeWorld, cleanWorldForSave } from '../lib/persistence/save-service';
import { isAtWar } from '../lib/diplomacy/offer-service';

let failures = 0;
const results: string[] = [];
function dice(...rolls: number[]): () => number { let i = 0; return () => rolls[Math.min(i++, rolls.length - 1)]; }
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** A fresh court with Brutus and Cassius seated, a loaded plot, and a rotten government. */
function plant(seed: string) {
    seedSimulation(seed);
    const world = bootSoakWorld();
    // The soak boot hands back one world: an earlier scenario's crisis and
    // plot must not bleed into this one.
    world.coupCrises = new Map(); world.plots = new Map(); world.pendingCrisisOutcomes = [];
    const [human] = empireIds(world);
    world.claimedFactionIds = [human];
    const brutus = { id: `seat-b-${seed}`, factionId: human, portfolio: 'defence', persona: 'Brutus' };
    const cassius = { id: `seat-c-${seed}`, factionId: human, portfolio: 'foreign', persona: 'Cassius' };
    syncHumanMinisters(world, [brutus, cassius]);
    const gov: any = getGovernment(world, human);
    gov.politicalCapital = 100; gov.politicalCapitalCap = 100;
    // Loyalties: economy loyal, science and interior disloyal, intelligence middling.
    const set = (p: string, loyalty: number) => { const m = getMinister(world, human, p as any)!; m.loyalty = loyalty; m.corruption = loyalty < 40 ? 70 : 0; m.ambitionDrive = loyalty < 40 ? 80 : 30; };
    set('economy', 90); set('science', 10); set('interior', 15); set('intelligence', 50);
    const military: any = world.movement.empirePostures.get(human)?.blocs?.find((b: any) => b.id === 'military');
    military.satisfaction = 30;
    startPlot(world, human, brutus.id, 'coup');
    soundOut(world, human, brutus.id, getMinister(world, human, 'science')!.id, dice(0.0));
    world.nowSeconds += 86400;
    soundOut(world, human, brutus.id, OFFICERS_ACTOR_ID);
    gov.legitimacy = 30; gov.cohesion = 70; gov.coupPressure = 20;
    return { world, human, brutus, cassius, gov, military };
}

async function main() {
    const quiet = quietConsole(line => line.startsWith('[Crisis]') || line.startsWith('[Government] CIVIL WAR'));

    // ── 1. The strike and the opening sides ─────────────────────────────────
    let { world, human, brutus, cassius, gov } = plant('crisis-a');
    check('no strike without a plot', !strikePlot(world, human, 'seat-nobody').ok);
    const struck = strikePlot(world, human, brutus.id);
    const crisis = openCrisis(world, human)!;
    check('the plot strikes and a crisis opens', struck.ok && !!crisis && crisis.status === 'open', struck.message);
    check('…and the plot is marked struck, not open for more sounding', !soundOut(world, human, brutus.id, getMinister(world, human, 'economy')!.id).ok);
    check('…and cannot strike twice', !strikePlot(world, human, brutus.id).ok);
    const side = (id: string) => crisis.actors.find(a => a.id === id)?.side;
    check('a conspirator stands with the plot', side(getMinister(world, human, 'science')!.id) === 'plotter');
    check('a disloyal minister never approached still leans to the plot', side(getMinister(world, human, 'interior')!.id) === 'plotter');
    check('a loyal minister stands with the throne', side(getMinister(world, human, 'economy')!.id) === 'ruler');
    check('a middling minister is undecided', side(getMinister(world, human, 'intelligence')!.id) === 'undecided');
    check('a joined officer corps stands with the plot, weighing three', side(OFFICERS_ACTOR_ID) === 'plotter' && crisis.actors.find(a => a.id === OFFICERS_ACTOR_ID)?.weight === 3);
    check('a human colleague starts undecided', side(seatLeaderId(cassius.id)) === 'undecided');
    check('favours equal conspirators', crisis.favours === 2, `${crisis.favours}`);
    check('the capital starts with the throne', crisis.capitalHeldBy === 'ruler');
    check('the deadline is the window', crisis.deadlineSeconds - crisis.openedAtSeconds === CRISIS_WINDOW_SECONDS);

    // ── 2. The verbs ────────────────────────────────────────────────────────
    const intel = getMinister(world, human, 'intelligence')!;
    const pcBefore = gov.politicalCapital;
    const s1 = secureActor(world, crisis, 'ruler', intel.id);
    check('the ruler secures an undecided minister for political capital', s1.ok && side(intel.id) === 'ruler' && gov.politicalCapital === pcBefore - SECURE_COST_PC, s1.message);
    check('…and cannot secure them twice', !secureActor(world, crisis, 'plotter', intel.id, brutus.id).ok);
    check('the plotter cannot secure a decided actor', !secureActor(world, crisis, 'plotter', getMinister(world, human, 'economy')!.id, brutus.id).ok);
    check('a stranger seat cannot act as the plotter', !secureActor(world, crisis, 'plotter', intel.id, 'seat-nobody').ok);
    const science = getMinister(world, human, 'science')!;
    const a1 = arrestActor(world, crisis, science.id, dice(0.1));
    check('an arrest that lands takes the actor out of the balance', a1.ok && crisis.actors.find(a => a.id === science.id)?.weight === 0, a1.message);
    const interior = getMinister(world, human, 'interior')!;
    const legBefore = gov.legitimacy;
    const a2 = arrestActor(world, crisis, interior.id, dice(0.9));
    check('a failed arrest hardens the actor and costs legitimacy', a2.ok && side(interior.id) === 'plotter' && crisis.actors.find(a => a.id === interior.id)?.locked === true && gov.legitimacy === legBefore - 3, a2.message);
    check('the officer corps cannot be arrested', !arrestActor(world, crisis, OFFICERS_ACTOR_ID).ok);
    const c1 = chooseSide(world, crisis, cassius.id, 'plotter');
    check('a human colleague picks a side', c1.ok && side(seatLeaderId(cassius.id)) === 'plotter');
    check('the plotter cannot "pick a side"', !chooseSide(world, crisis, brutus.id, 'plotter').ok);
    const t = tally(crisis);
    check('no seizing the capital without the larger weight', (t.plotter > t.ruler) === seizeCapital(world, crisis, brutus.id).ok, `plot ${t.plotter} vs throne ${t.ruler}`);
    const f1 = fleeToFleet(world, crisis);
    check('the ruler flees once: capital to the plot, deadline longer', f1.ok && crisis.rulerFled && crisis.capitalHeldBy === 'plotter' && crisis.deadlineSeconds - crisis.openedAtSeconds === CRISIS_WINDOW_SECONDS + FLEE_EXTENSION_SECONDS);
    check('…and not twice', !fleeToFleet(world, crisis).ok);
    world = deserializeWorld(serializeWorld(world));
    check('the crisis survives the worker round trip', openCrisis(world, human)?.actors.length === crisis.actors.length);
    const pub: any = cleanWorldForSave(world);
    check('the crisis is public news (kept in the snapshot)', pub.coupCrises?.size === 1);

    // ── 3. The throne holds ─────────────────────────────────────────────────
    ({ world, human, brutus, cassius, gov } = plant('crisis-b'));
    strikePlot(world, human, brutus.id);
    let cr = openCrisis(world, human)!;
    for (const a of cr.actors) if (a.id !== cr.plotterLeaderId) a.side = 'ruler';
    cr.capitalHeldBy = 'ruler';
    check('a decisive share with the capital ends it early', decisiveSide(cr) === 'ruler');
    const resolved = tickCoupCrises(world);
    const plotterLeader = world.leadership.leaders.get(cr.plotterLeaderId)!;
    check('the throne holds', resolved.length === 1 && cr.status === 'resolved' && cr.outcome === 'ruler_holds');
    check('the plotter is out of office', plotterLeader.status === 'retired' && getMinister(world, human, 'defence')?.id !== cr.plotterLeaderId && !!getMinister(world, human, 'defence'));
    const pending = (world as any).pendingCrisisOutcomes;
    check('the worker is told to clear the plotter\'s seat', pending?.length === 1 && pending[0].outcome === 'ruler_holds' && pending[0].removeSeatIds.includes(brutus.id));
    check('the plot is gone', !(world as any).plots?.has(cr.plotId));

    // ── 4. The plotter wins ─────────────────────────────────────────────────
    ({ world, human, brutus, cassius, gov } = plant('crisis-c'));
    strikePlot(world, human, brutus.id);
    cr = openCrisis(world, human)!;
    const oldRuler = getHeadOfState(world, human)!;
    const loyalEconomy = getMinister(world, human, 'economy')!;
    for (const a of cr.actors) a.side = a.id === loyalEconomy.id ? 'ruler' : 'plotter';
    cr.capitalHeldBy = 'plotter';
    tickCoupCrises(world);
    check('the plotter takes the throne', cr.outcome === 'plotter_wins' && getHeadOfState(world, human)?.id === cr.plotterLeaderId);
    check('the old ruler is deposed', oldRuler.status === 'retired' && oldRuler.departureCause === 'overthrown');
    check('the new ruler is no longer a seat', world.leadership.leaders.get(cr.plotterLeaderId)?.seatId === undefined);
    check('the old regime\'s loyal minister is gone, the chair refilled', loyalEconomy.status === 'retired' && !!getMinister(world, human, 'economy') && getMinister(world, human, 'economy')!.id !== loyalEconomy.id);
    check('legitimacy and capital reset as after any coup', gov.legitimacy === 35 && gov.politicalCapital === 0);
    const p2 = (world as any).pendingCrisisOutcomes?.[0];
    check('the worker is told to move the throne\'s claim', p2?.outcome === 'plotter_wins' && p2.throne?.factionId === human && p2.removeSeatIds.includes(brutus.id));

    // ── 5. Stalemate: the empire splits ─────────────────────────────────────
    ({ world, human, brutus, cassius, gov } = plant('crisis-d'));
    // Give the plot a governor with a world that is not the capital. A
    // capital-only start has none: take a neutral world and a pool leader.
    const planets: any[] = [...world.construction.planets.values()];
    const anyWorld: any = planets.find((p: any) => p.ownerId === human && p.planetType !== 'capital')
        ?? planets.find((p: any) => (!p.ownerId || p.ownerId === 'faction-neutral') && p.planetType !== 'capital');
    anyWorld.ownerId = human;
    const econPlanet: any = world.economy.planets.get(anyWorld.id);
    if (econPlanet) econPlanet.factionId = human;
    const pool: any[] = world.leadership.recruitmentPool;
    const gi = pool.findIndex((l: any) => l.factionId === human);
    const gl: any = gi >= 0 ? pool.splice(gi, 1)[0] : { id: `gov-probe-${human}`, factionId: human, name: 'Provincial Governor', role: 'Governor', level: 1, xp: 0, loyalty: 20, status: 'active', traits: [], history: [] };
    gl.role = 'Governor'; gl.status = 'active'; gl.assignmentId = anyWorld.id; gl.portfolio = undefined;
    world.leadership.leaders.set(gl.id, gl);
    anyWorld.governorId = gl.id;
    strikePlot(world, human, brutus.id);
    cr = openCrisis(world, human)!;
    const governor = cr.actors.find(a => a.kind === 'governor');
    check('plant: a governor is in the balance', !!governor, anyWorld?.name);
    for (const a of cr.actors) a.side = 'undecided';
    if (governor) governor.side = 'plotter';
    cr.capitalHeldBy = 'ruler';
    // Balance the weights so neither side has it at the deadline: the ruler holds the capital but less weight.
    const econ = cr.actors.find(a => a.kind === 'minister' && a.id !== cr.plotterLeaderId)!;
    econ.side = 'ruler'; econ.weight = 0.5;
    world.nowSeconds = cr.deadlineSeconds + 1;
    check('a deadline with the capital on one side and the weight on the other is a stalemate', deadlineOutcome(cr) === 'civil_war');
    const factionsBefore = world.economy.factions.size;
    tickCoupCrises(world);
    const p3 = (world as any).pendingCrisisOutcomes?.[0];
    check('the empire splits under the plotter', cr.outcome === 'civil_war' && world.economy.factions.size === factionsBefore + 1 && !!p3?.rebelFactionId, cr.log[cr.log.length - 1]?.text);
    if (p3?.rebelFactionId) {
        check('the plotter heads the new state', getHeadOfState(world, p3.rebelFactionId)?.id === cr.plotterLeaderId);
        check('the two are at war', isAtWar(world, human, p3.rebelFactionId));
        check('the governor\'s world went with them', (world.construction.planets.get(anyWorld.id) as any)?.ownerId === p3.rebelFactionId);
    }

    // ── 6. A stalemate with nothing to split holds the throne ───────────────
    ({ world, human, brutus } = plant('crisis-e'));
    strikePlot(world, human, brutus.id);
    cr = openCrisis(world, human)!;
    for (const a of cr.actors) a.side = a.kind === 'governor' ? 'ruler' : 'undecided';
    cr.capitalHeldBy = 'plotter';
    const r = resolveCrisis(world, cr, 'civil_war');
    check('no governor with the plot: a stalemate falls to the throne', r.outcome === 'ruler_holds' && cr.outcome === 'ruler_holds');

    quiet.restore();
    console.log('\ncrisis probe\n' + results.join('\n'));
    if (quiet.complaints.size) {
        console.log('\ncomplaints:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`crisis probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
