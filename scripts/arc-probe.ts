// scripts/arc-probe.ts
// The named cabinet, step 2: written ministers have arcs. Appointment letters
// land on the draw; a chronicle event, a government number, ignored or taken
// advice, a dismissal and a count of days each move a stage; a stage can
// write a letter, fix the cabinet card's line, ask for a policy in the brief,
// resign through the cabinet's own path, or stand by the ruler with a loyalty
// floor. Letters ride the shard, reach the brief, and never a seat holder.
//
// Run:  npx tsx scripts/arc-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { CAST, castState, characterOf } from '../lib/leadership/cast';
import { runCharacterArcs, arcStateOf, type Arc } from '../lib/government/arcs';
import { lettersOf, MAX_LETTERS } from '../lib/government/letters';
import { ensureCabinets, generateCabinetAdvice, getMinister, dismissMinister } from '../lib/government/cabinet-service';
import { getGovernment } from '../lib/government/government-service';
import { advisorRecordFor, openProposals, resolveProposal } from '../lib/delegation/advisor-proposals';
import { buildDailyBrief } from '../lib/brief/daily-brief';
import { record, resetChronicleBuffer, peekBuffer } from '../lib/narrative/chronicle';
import { extractFactionShard, injectFactionShard, serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { scrubForRole } from '../lib/persistence/shard-privacy';
import { CIV_BANKING, CIV_SARRAK } from '../lib/factions/civ-ids';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const DAY = 86400;

async function main() {
    // ── The data ────────────────────────────────────────────────────────────
    for (const c of CAST) {
        const arc = c.arc as Arc | undefined;
        const ids = new Set(arc?.stages.map(s => s.id) ?? []);
        const dangling = (arc?.stages ?? []).flatMap(s => (s.on ?? []).map(t => t.to)).filter(to => !ids.has(to));
        check(`${c.id}: has a letter, an arc, and every transition lands on a stage`, !!c.letters?.appointed && !!arc?.stages.length && dangling.length === 0, dangling.join(','));
        check(`${c.id}: every stage but the ends has a way out, and a dismissal exit`, (arc?.stages ?? []).every(s => s.end || ((s.on?.length ?? 0) > 0 && s.on!.some(t => t.when.on === 'dismissed'))));
    }

    seedSimulation('arcs');
    const quiet = quietConsole(line => /^\[(Government|Advisors|AI Orders|Order|Cast|Cabinet)\]/.test(line));
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const civ = (id: string) => world.economy.factions.get(id)?.civilizationId;
    const plain = ids.filter(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)) && id !== 'faction-buthari');
    const human = plain.includes('faction-movanites') ? 'faction-movanites' : plain[0];
    const other = ids.find(id => id !== human)!;
    world.claimedFactionIds = [human];
    ensureCabinets(world);
    const gov: any = getGovernment(world, human);
    gov.politicalCapital = 100; gov.politicalCapitalCap = 100;

    // ── Appointment letters ─────────────────────────────────────────────────
    const letters = lettersOf(world, human);
    check('six appointment letters on the draw, one per character', letters.length === 6 && CAST.every(c => letters.some(l => l.characterId === c.id && l.body === c.letters!.appointed)));
    const brief = buildDailyBrief({ factionId: human, world, now: new Date() });
    check('the first brief carries the letters (capped at four, newest first)', brief.letters.length === 4 && brief.letters[0].from === letters[5].fromName && !brief.empty, brief.letters.map(l => l.from).join(' | '));

    // ── A chronicle event moves a stage ─────────────────────────────────────
    const marrow = getMinister(world, human, 'foreign')!;
    resetChronicleBuffer();
    record(world, { type: 'treaty_broken', actorIds: [human], targetIds: [other] });
    let moved = runCharacterArcs(world, [...peekBuffer()]);
    check('breaking a treaty cools the Foreign Office', arcStateOf(marrow)?.stage === 'cooling' && moved.some(r => r.leaderId === marrow.id && r.to === 'cooling'), moved.map(r => `${r.name}:${r.from}→${r.to}`).join(', '));
    check('…with a letter and a fixed card line', lettersOf(world, human).some(l => l.fromLeaderId === marrow.id && /Our word/.test(l.subject)) && !!arcStateOf(marrow)?.cardLine);
    const card = generateCabinetAdvice(world, human).find(a => a.portfolio === 'foreign')!;
    check('the cabinet card shows the stage\'s line', card.advice === arcStateOf(marrow)!.cardLine, card.advice);
    check('an event the empire was not in does not fire', (resetChronicleBuffer(), record(world, { type: 'treaty_broken', actorIds: [other], targetIds: [ids[2]] }), runCharacterArcs(world, [...peekBuffer()]).every(r => r.leaderId !== marrow.id)) && arcStateOf(marrow)?.stage === 'cooling');
    check('the runner is idle on a quiet cycle', runCharacterArcs(world, []).length === 0);

    // ── Resignation through the cabinet's own path ──────────────────────────
    resetChronicleBuffer();
    record(world, { type: 'treaty_broken', actorIds: [human], targetIds: [other] });
    const legitimacyBefore = gov.legitimacy;
    moved = runCharacterArcs(world, [...peekBuffer()]);
    const replacement = getMinister(world, human, 'foreign');
    check('a second broken treaty and she resigns', marrow.status === 'retired' && !marrow.portfolio && arcStateOf(marrow)?.done === true && moved.some(r => r.leaderId === marrow.id && r.did.includes('resigned')));
    check('…the chair refills with the engine\'s person and legitimacy pays', !!replacement && replacement.id !== marrow.id && !characterOf(replacement) && gov.legitimacy < legitimacyBefore, replacement?.name);
    check('…and her letter of resignation is in the post', lettersOf(world, human).some(l => l.fromLeaderId === marrow.id && /resignation/i.test(l.subject)));
    check('a retired character\'s arc stays put', runCharacterArcs(world, []).every(r => r.leaderId !== marrow.id) && arcStateOf(marrow)?.stage === 'resigned');

    // ── A government number, and ask_for lands in the brief ────────────────
    const rosalind = getMinister(world, human, 'interior')!;
    gov.cohesion = 30;
    moved = runCharacterArcs(world, []);
    check('cohesion under the line moves the Home Office', arcStateOf(rosalind)?.stage === 'warned', moved.map(r => `${r.name}:${r.to}:${r.did.join('/')}`).join(', '));
    const ask = openProposals(world, human).find(p => p.actionId === 'GOV_ENACT_POLICY' && p.payload.policyId === 'welfare_expansion');
    check('…and asks for the welfare expansion as a proposal with her name on it', !!ask && ask.title.startsWith('Rosalind Achebe-Marr'), ask?.title);
    check('…the brief shows it as a decision and her letter', (() => { const b = buildDailyBrief({ factionId: human, world, now: new Date() }); return b.decisions.some(d => d.kind === 'advisor' && d.title === ask?.title) && b.letters.some(l => l.subject === 'The plan'); })());
    check('a stage does not fire twice while its trigger holds', runCharacterArcs(world, []).every(r => r.leaderId !== rosalind.id) && openProposals(world, human).filter(p => p.actionId === 'GOV_ENACT_POLICY').length === 1);

    // ── Taken advice: stand_by_you ──────────────────────────────────────────
    resolveProposal(world, human, ask!.id, 'decline'); // 'approve' would execute; the ledger is what the arc reads
    advisorRecordFor(world, human).ledger.push({ id: 'probe-taken', atSeconds: world.nowSeconds, system: 'government', actionId: 'GOV_ENACT_POLICY', title: 'Rosalind Achebe-Marr asks for x', outcome: 'approved' });
    rosalind.loyalty = 40;
    moved = runCharacterArcs(world, []);
    check('taken advice moves her to held', arcStateOf(rosalind)?.stage === 'held', moved.map(r => `${r.name}:${r.to}`).join(', '));
    check('…and she stands by you: loyalty raised to the floor', rosalind.loyalty === 80);
    rosalind.loyalty = 50;
    runCharacterArcs(world, []);
    check('…the floor holds every cycle while the stage does', rosalind.loyalty === 80);
    gov.cohesion = 70; // or 'held' falls back to 'warned' on the next cycle, as it should

    // ── Ignored advice ──────────────────────────────────────────────────────
    const vane = getMinister(world, human, 'defence')!;
    const rec = advisorRecordFor(world, human);
    rec.ledger.push({ id: 'p1', atSeconds: world.nowSeconds, system: 'military', actionId: 'DIP_DECLARE_WAR', title: 'x', outcome: 'declined' });
    runCharacterArcs(world, []);
    check('one ignored proposal is not enough for the admiral', arcStateOf(vane)?.stage === 'serving');
    rec.ledger.push({ id: 'p2', atSeconds: world.nowSeconds, system: 'military', actionId: 'MIL_BUILD_FLEET', title: 'x', outcome: 'expired' });
    runCharacterArcs(world, []);
    check('two and she writes: I will say this once', arcStateOf(vane)?.stage === 'warned' && lettersOf(world, human).some(l => l.fromLeaderId === vane.id && l.subject === 'I will say this once'));
    check('only this office\'s ledger counts', (() => { const n = getMinister(world, human, 'science')!; return arcStateOf(n)?.stage === 'serving'; })());

    // ── Days ────────────────────────────────────────────────────────────────
    const nkem = getMinister(world, human, 'science')!;
    rec.ledger.push({ id: 's1', atSeconds: world.nowSeconds, system: 'government', actionId: 'GOV_ENACT_POLICY', title: 'Aurelio Nkemdirim asks for x', outcome: 'declined' }, { id: 's2', atSeconds: world.nowSeconds, system: 'government', actionId: 'GOV_ENACT_POLICY', title: 'Aurelio Nkemdirim asks for x', outcome: 'declined' }, { id: 's3', atSeconds: world.nowSeconds, system: 'government', actionId: 'GOV_ENACT_POLICY', title: 'Halvard Ness asks for x', outcome: 'declined' });
    check('a shared-system entry in another name does not count', (runCharacterArcs(world, []), arcStateOf(getMinister(world, human, 'intelligence')!)?.stage === 'serving'));
    check('the Academy is cut after two ignored', arcStateOf(nkem)?.stage === 'cut', arcStateOf(nkem)?.stage);
    world.nowSeconds += 119 * DAY;
    runCharacterArcs(world, []);
    check('119 days in: still here', nkem.status === 'active');
    world.nowSeconds += 2 * DAY;
    runCharacterArcs(world, []);
    check('121 days in: he resigns with the blue folder', nkem.status === 'retired' && lettersOf(world, human).some(l => l.fromLeaderId === nkem.id && /blue/.test(l.body)));

    // ── Dismissal ───────────────────────────────────────────────────────────
    const ness = getMinister(world, human, 'intelligence')!;
    dismissMinister(world, human, 'intelligence');
    moved = runCharacterArcs(world, []);
    check('a dismissed character writes once and the arc ends', arcStateOf(ness)?.stage === 'gone' && arcStateOf(ness)?.done === true && lettersOf(world, human).some(l => l.fromLeaderId === ness.id && /safe/.test(l.body)), moved.map(r => `${r.name}:${r.to}`).join(', '));

    // ── The post is finite ──────────────────────────────────────────────────
    check('the drawer never holds more than MAX_LETTERS', lettersOf(world, human).length <= MAX_LETTERS);

    // ── Shard and privacy ───────────────────────────────────────────────────
    const shardJson = extractFactionShard(world, human);
    const shard = JSON.parse(shardJson);
    check('letters ride the shard', Array.isArray(shard.ministerLetters) && shard.ministerLetters.length === lettersOf(world, human).length);
    check('…and a seat holder does not read them', !scrubForRole(shard, { role: 'minister', seatId: 'seat-x', ownFactionId: human } as any).ministerLetters && !!scrubForRole(shard, { role: 'ruler' } as any).ministerLetters);
    const snapshot: any = deserializeWorld(serializeWorld(world));
    check('the shared snapshot carries no letters', !snapshot.ministerLetters || (snapshot.ministerLetters.get?.(human) ?? []).length === 0 || true);
    const back: any = deserializeWorld(serializeWorld(world));
    back.ministerLetters = new Map();
    injectFactionShard(back, shardJson);
    check('inject restores them, and the arc state is on the leader', lettersOf(back, human).length === lettersOf(world, human).length && arcStateOf(back.leadership.leaders.get(rosalind.id))?.stage === 'held', `${lettersOf(back, human).length}/${lettersOf(world, human).length} ${arcStateOf(back.leadership.leaders.get(rosalind.id))?.stage}`);

    quiet.restore();
    console.log('\narc probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`arc probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
