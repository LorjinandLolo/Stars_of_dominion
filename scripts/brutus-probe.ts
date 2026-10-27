// scripts/brutus-probe.ts
// The named cabinet, step 3: a written minister can plot, join, report, leak
// and take money; and a friend's seat makes them a courtier who stays at
// court, keeps their arc, and gets the chair back when the friend leaves.
//
// Run:  npx tsx scripts/brutus-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { registerCharacter, characterOf, castState, type CabinetCharacter } from '../lib/leadership/cast';
import { runCharacterArcs, arcStateOf } from '../lib/government/arcs';
import { lettersOf } from '../lib/government/letters';
import { ensureCabinets, getMinister, dismissMinister } from '../lib/government/cabinet-service';
import { getGovernment } from '../lib/government/government-service';
import { syncHumanMinisters } from '../lib/government/human-ministers';
import { plotsOf, plotByLeader, startLeaderPlot } from '../lib/government/plots';
import { openCrisis } from '../lib/government/crisis';
import { record, resetChronicleBuffer, peekBuffer } from '../lib/narrative/chronicle';
import { CIV_BANKING, CIV_SARRAK } from '../lib/factions/civ-ids';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const DAY = 86400;

async function main() {
    seedSimulation('brutus');
    const quiet = quietConsole(line => /^\[(Government|Advisors|AI Orders|Order|Cast|Cabinet|Seats|Crisis)\]/.test(line));
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const civ = (id: string) => world.economy.factions.get(id)?.civilizationId;
    const plain = ids.filter(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)) && id !== 'faction-buthari');
    const human = plain.includes('faction-movanites') ? 'faction-movanites' : plain[0];
    const other = ids.find(id => id !== human)!;
    world.claimedFactionIds = [human];
    ensureCabinets(world);
    const gov: any = getGovernment(world, human);
    const run = (days = 0) => { world.nowSeconds += days * DAY; const r = runCharacterArcs(world, [...peekBuffer()]); resetChronicleBuffer(); return r; };
    run(); // first stages written

    // ── A courtier: a friend takes the Admiralty ────────────────────────────
    const vane = getMinister(world, human, 'defence')!;
    const seat = { id: 'seat-friend', factionId: human, portfolio: 'defence', persona: 'Your Friend' };
    syncHumanMinisters(world, [seat]);
    check('the friend has the chair; Vane stays at court as a courtier', getMinister(world, human, 'defence')!.name === 'Your Friend' && world.leadership.leaders.get(vane.id)?.courtier === true && vane.status === 'active' && !vane.portfolio && !world.leadership.recruitmentPool.some((l: any) => l.id === vane.id));
    let moved = run(0);
    check('…her arc notices: a letter from the corridor', arcStateOf(vane)?.stage === 'courtier' && lettersOf(world, human).some(l => l.fromLeaderId === vane.id && l.subject === 'From the corridor'), moved.map(r => `${r.name}:${r.to}`).join(', '));
    run(1); run(0);
    check('…and she stays a courtier while the friend sits', ['courtier_still', 'serving_again', 'courtier'].includes(arcStateOf(vane)!.stage) && vane.courtier === true, arcStateOf(vane)?.stage);

    // A courtier joins a plot against you. Marrow-Ngata opens one by hand.
    const marrow = getMinister(world, human, 'foreign')!;
    const opened = startLeaderPlot(world, human, marrow.id, 'coup');
    check('a written minister can open a plot without a seat', opened.ok && !!plotByLeader(world, human, marrow.id) && opened.plot!.plotterSeatId === `leader:${marrow.id}`, opened.message);
    run(7); run(0);
    const plotA = plotByLeader(world, human, marrow.id)!;
    check('the courtier admiral joined it', plotA.recruits[vane.id] === 'joined', JSON.stringify(plotA.recruits));
    // Ness, in his chair and 'serving': no standing report. Push him to 'insured', which reports every plot.
    const ness = getMinister(world, human, 'intelligence')!;
    (ness as any).arc = { stage: 'insured', sinceSeconds: world.nowSeconds };
    moved = run(0);
    check('the Desk in its insured stage reports the plot, naming the plotter', plotA.recruits[ness.id] === 'reported' && (gov.loyaltyReports ?? []).some((r: any) => r.suspectLeaderId === marrow.id && r.reporterName === ness.name), moved.filter(r => r.leaderId === ness.id).map(r => r.did.join('/')).join(', '));
    check('…and only once', (run(0), (gov.loyaltyReports ?? []).filter((r: any) => r.suspectLeaderId === marrow.id).length === 1));

    // The friend leaves: the chair is Vane's again.
    syncHumanMinisters(world, []);
    check('when the friend leaves, the courtier takes the chair back', getMinister(world, human, 'defence')!.id === vane.id && vane.courtier === false && vane.portfolio === 'defence' && vane.history.some(h => /Returned/.test(h.description)));
    run(0);
    check('…and her arc is back to serving', arcStateOf(vane)?.stage === 'serving', arcStateOf(vane)?.stage);
    for (const p of plotsOf(world, human)) p.status = 'spent';
    world.plots = new Map();

    // ── Brutus: dismissed after going public, Vane plots a coup ─────────────
    (vane as any).arc = { stage: 'public', sinceSeconds: world.nowSeconds };
    dismissMinister(world, human, 'defence');
    moved = run(0);
    const plotV = plotByLeader(world, human, vane.id);
    check('dismissed after going public, she opens a military plot', arcStateOf(vane)?.stage === 'plotting' && !!plotV && plotV.kind === 'coup', moved.filter(r => r.leaderId === vane.id).map(r => `${r.to}:${r.did.join('/')}`).join(', '));
    check('…with a letter about the Admiralty club', lettersOf(world, human).some(l => l.fromLeaderId === vane.id && /club/.test(l.body)));
    // Make the court rotten and its ministers disloyal, so the approaches land and the strike is allowed.
    for (const m of world.leadership.leaders.values()) if (m.factionId === human && m.id !== vane.id && m.status === 'active' && m.portfolio) { m.loyalty = 5; m.ambitionDrive = 90; m.corruption = 60; }
    gov.legitimacy = 20; gov.cohesion = 30; gov.coupPressure = 60;
    (ness as any).arc = { stage: 'serving', sinceSeconds: world.nowSeconds, done: true }; // the Desk looks away for this test
    const approachesBefore = Object.keys(plotV!.recruits).length;
    run(1);
    const afterOne = Object.keys(plotV!.recruits).length;
    run(0);
    check('one approach a day, not more', afterOne === approachesBefore + 1 && Object.keys(plotV!.recruits).length === afterOne, `${approachesBefore} → ${afterOne} → ${Object.keys(plotV!.recruits).length}`);
    let struck = false;
    for (let d = 0; d < 30 && !struck; d++) { run(1); struck = plotV!.status === 'struck'; }
    check('she strikes when the plot is ready: the crisis window opens', struck && !!openCrisis(world, human) && openCrisis(world, human)!.plotterLeaderId === vane.id, `${plotV!.status} recruits=${JSON.stringify(plotV!.recruits)}`);
    run(0);
    check('…and her arc ends at struck', arcStateOf(vane)?.stage === 'struck' && arcStateOf(vane)?.done === true, arcStateOf(vane)?.stage);

    // ── leak and take_bribe, on a synthetic character ───────────────────────
    const venal: CabinetCharacter = {
        id: 'probe-venal', name: 'Pell Arvanitakis', portfolio: 'economy', fits: ['any'], portrait: 'x', age: 38, background: 'merchant_house',
        numbers: { loyalty: 50, competence: 60, corruption: 45, ambitionDrive: 50, politicalSkill: 40 }, bio: 'x', want: 'x', fear: 'x', lines: {},
        arc: { stages: [
            { id: 'serving', on: [{ when: { on: 'day', after: 0 }, to: 'bought', does: [{ do: 'take_bribe', corruption: 20, sum: 40000 }, { do: 'leak', to: 'rival' }] }] },
            { id: 'bought', end: true },
        ] },
    };
    registerCharacter(venal);
    const pell: any = { id: 'leader-probe-venal', factionId: human, name: venal.name, role: 'Minister', level: 1, xp: 0, loyalty: 50, status: 'active', traits: [], history: [], competence: 60, corruption: 45, ambitionDrive: 50, characterId: venal.id, portfolio: 'economy' };
    world.leadership.leaders.set(pell.id, pell);
    resetChronicleBuffer();
    world.nowSeconds += DAY;
    moved = runCharacterArcs(world, []);
    check('take_bribe: corruption rises', pell.corruption === 65, String(pell.corruption));
    check('…and an unattributed rumour goes into the chronicle', [...peekBuffer()].some(r => r.type === 'scandal_confirmed' && r.attribution === 'invisible' && JSON.parse(r.facts).minister === venal.name));
    check('leak: a tie to the bitterest rival', !!pell.foreignTie && pell.foreignTie.factionId !== human && world.economy.factions.has(pell.foreignTie.factionId), JSON.stringify(pell.foreignTie));
    resetChronicleBuffer();
    // A sharp Desk catches it within a season; a dull one is slower. Seeded, so the day is fixed.
    const desk = getMinister(world, human, 'intelligence')!; desk.competence = 100;
    (desk as any).arc = { stage: 'serving', sinceSeconds: world.nowSeconds, done: true };
    let caughtDay = -1;
    for (let d = 1; d <= 400 && caughtDay < 0; d++) { world.nowSeconds += DAY; runCharacterArcs(world, []); if (pell.foreignTie.caught) caughtDay = d; }
    check('…the Desk catches the letters and names him in a loyalty report', caughtDay > 0 && (gov.loyaltyReports ?? []).some((r: any) => r.suspectLeaderId === pell.id && /writing to/.test(r.text)), `day ${caughtDay}`);
    const reportsAfter = (gov.loyaltyReports ?? []).filter((r: any) => r.suspectLeaderId === pell.id).length;
    for (let d = 0; d < 30; d++) { world.nowSeconds += DAY; runCharacterArcs(world, []); }
    check('…once', (gov.loyaltyReports ?? []).filter((r: any) => r.suspectLeaderId === pell.id).length === reportsAfter);

    quiet.restore();
    console.log('\nbrutus probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`brutus probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
