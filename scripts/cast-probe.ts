// scripts/cast-probe.ts
// The named cabinet, step 1: a claimed empire draws written people into its
// seats, nobody is drawn twice, a friend's seat is never touched, the pool
// runs out and the engine takes over, the card and the proposals speak in
// the character's own words, and it all survives the snapshot.
//
// Run:  npx tsx scripts/cast-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { CAST, castState, characterOf, drawCast, drawCastForClaimed, nextCharacterFor } from '../lib/leadership/cast';
import { CABINET_PORTFOLIOS } from '../lib/government/types';
import { ensureCabinets, generateCabinetAdvice, getMinister, tickCabinets } from '../lib/government/cabinet-service';
import { ministerLine, ministerSays } from '../lib/government/minister-voices';
import { getGovernment } from '../lib/government/government-service';
import { runAdvisorDesk } from '../lib/ai/advisor-desk';
import { openProposals } from '../lib/delegation/advisor-proposals';
import { getOrCreateRivalry } from '../lib/diplomacy/offer-service';
import { WAR, warCandidates } from '../lib/ai/war-ai';
import { CIV_BANKING, CIV_SARRAK } from '../lib/factions/civ-ids';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    // ── The data ────────────────────────────────────────────────────────────
    check('six written people, one per office', CAST.length === 6 && CABINET_PORTFOLIOS.every(p => CAST.some(c => c.portfolio === p)));
    check('every character has bio, want, fear and an appointment line', CAST.every(c => c.bio && c.want && c.fear && c.lines.appointed?.loyal?.length));
    check('starting numbers are in range', CAST.every(c => Object.values(c.numbers).every(n => n >= 0 && n <= 100)));
    const vane = CAST.find(c => c.id === 'thessaly-vane')!;
    check('a character\'s own line beats the office persona', ministerLine('defence', 'idle_peace', 'loyal', {}, 0, vane.id) === vane.lines.idle_peace!.loyal![0]);
    check('…and falls back to the persona where they have no line', ministerLine('defence', 'siege_defending', 'loyal', { world: 'X' }, 0, vane.id).includes('X'));
    check('…and falls back to their own loyal line before the persona\'s register', ministerLine('defence', 'morning', 'brutus', {}, 0, vane.id) === vane.lines.morning!.loyal![0]);

    // ── The draw ────────────────────────────────────────────────────────────
    seedSimulation('cast');
    const quiet = quietConsole(line => line.startsWith('[Government]') || line.startsWith('[Advisors]') || line.startsWith('[AI Orders]') || line.startsWith('[Order]'));
    let world: any = bootSoakWorld();
    const ids = empireIds(world);
    const civ = (id: string) => world.economy.factions.get(id)?.civilizationId;
    const plain = ids.filter(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)) && id !== 'faction-buthari');
    const human = plain.includes('faction-movanites') ? 'faction-movanites' : plain[0];
    const second = plain.find(id => id !== human)!;
    const [ai, prey] = ids.filter(id => id !== human && id !== second);
    ensureCabinets(world);
    check('plant: nobody is drawn before a claim', Object.keys(castState(world).drawn).length === 0);
    const before = CABINET_PORTFOLIOS.map(p => getMinister(world, human, p)!.id);

    world.claimedFactionIds = [human];
    ensureCabinets(world);
    const after = CABINET_PORTFOLIOS.map(p => getMinister(world, human, p)!);
    check('the claimed empire has six written ministers', after.every(m => !!characterOf(m)), after.map(m => m.characterId ?? 'engine').join(','));
    check('each sits in the seat they were written for', after.every(m => characterOf(m)!.portfolio === m.portfolio));
    check('the generated ministers stood aside (retired, no grudge)', before.every(id => world.leadership.leaders.get(id)?.status === 'retired' && world.leadership.leaders.get(id)?.history.some((h: any) => /Stood aside/.test(h.description))));
    check('the character\'s numbers and background are on the leader', after.every(m => m.loyalty === characterOf(m)!.numbers.loyalty && m.background === characterOf(m)!.background && m.age === characterOf(m)!.age));
    check('the draw is recorded', CAST.every(c => castState(world).drawn[c.id] === human) && castState(world).factions[human] === true);
    check('a second bootstrap draws nobody twice', (ensureCabinets(world), CABINET_PORTFOLIOS.map(p => getMinister(world, human, p)!.id).join() === after.map(m => m.id).join()));

    // ── The pool runs out ───────────────────────────────────────────────────
    world.claimedFactionIds = [human, second];
    tickCabinets(world, 60);
    const secondCabinet = CABINET_PORTFOLIOS.map(p => getMinister(world, second, p)!);
    check('a later claim finds the pool empty and keeps the engine\'s people', secondCabinet.every(m => !characterOf(m)) && castState(world).factions[second] === true);
    check('nextCharacterFor is empty for every seat now', CABINET_PORTFOLIOS.every(p => !nextCharacterFor(world, second, p)));

    // ── The card and the proposals speak in their words ─────────────────────
    world.economy.factions.get(human).reserves.CREDITS = 500_000;
    const advice = generateCabinetAdvice(world, human);
    const defenceCard = advice.find(a => a.portfolio === 'defence')!;
    check('the cabinet card is Vane\'s own idle line', defenceCard.ministerName === 'Thessaly Vane' && vane.lines.idle_peace!.loyal!.includes(defenceCard.advice), defenceCard.advice);
    const economyCard = advice.find(a => a.portfolio === 'economy')!;
    const solvay = CAST.find(c => c.id === 'wen-solvay')!;
    check('the Treasury card is Solvay\'s', economyCard.ministerName === 'Wen Solvay' && Object.values(solvay.lines).some(h => Object.values(h).some(ls => ls!.includes(economyCard.advice))), economyCard.advice);

    const DAY = 86400;
    world.aiWar ??= { firstSeenSeconds: world.nowSeconds, factions: {} };
    world.nowSeconds += (WAR.graceDays + 1) * DAY;
    const plantFleet = (owner: string, power: number) => {
        const id = `probe-fleet-${owner}`;
        world.movement.fleets.set(id, { id, name: id, factionId: owner, currentSystemId: world.economy.factions.get(owner).capitalSystemId,
            destinationSystemId: null, plannedPath: [], basePower: power, strength: 1, composition: { destroyer: 6 } });
    };
    plantFleet(human, 4000); plantFleet(ai, 4000);
    for (const id of ids) if (id !== human) (getOrCreateRivalry(world, human, id) as any).rivalryScore = 90;
    (getOrCreateRivalry(world, ai, prey) as any).rivalryScore = 90;
    const gov: any = getGovernment(world, human);
    gov.politicalCapital = 100; gov.politicalCapitalCap = 100; gov.warFatigue = 0;
    world.economy.factions.get(human).reserves.METALS = 500_000;
    world.claimedFactionIds = [human];
    if (warCandidates(world, human)[0]) {
        runAdvisorDesk(world);
        const warP = openProposals(world, human).find(p => p.actionId === 'DIP_DECLARE_WAR');
        check('the war proposal opens with Vane, in her own words', !!warP && warP.detail.startsWith('Thessaly Vane: “') && vane.lines.war_proposal!.loyal!.some(l => l.split('{target}').every(part => warP.detail.includes(part))), warP?.detail.slice(0, 140));
    } else {
        check('plant: a war candidate', false, 'none');
    }
    check('ministerSays carries the character through the minister record', ministerSays(getMinister(world, human, 'foreign'), 'foreign', 'morning').includes('undressed it for you'));

    // ── The snapshot ────────────────────────────────────────────────────────
    const back: any = deserializeWorld(serializeWorld(world));
    check('characterId and the draw survive the snapshot', CABINET_PORTFOLIOS.every(p => !!characterOf(getMinister(back, human, p))) && back.cast?.drawn?.['thessaly-vane'] === human);

    // ── A friend's seat is never touched ────────────────────────────────────
    // bootSoakWorld() is ONE shared world: reset the draw and run it again on
    // the second empire with a friend in the Admiralty chair.
    castState(world).drawn = {}; castState(world).factions = {};
    const held: any = getMinister(world, second, 'defence');
    held.seatId = 'seat-friend';
    const r = drawCast(world, second);
    check('a seat held by a friend is skipped', getMinister(world, second, 'defence')!.id === held.id && !r.seated.some(s => s.portfolio === 'defence'), r.seated.map(s => s.portfolio).join(','));
    check('…and the admiral stays undrawn for the next court', !castState(world).drawn['thessaly-vane'] && r.seated.length === 5);
    quiet.restore();

    console.log('\ncast probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`cast probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
