// scripts/seat-probe.ts
// A friend in the cabinet: does the government seat them, leave their numbers
// alone, and let the chair go back to the AI when they leave?
//
// lib/government/human-ministers.ts + lib/government/seat-scope.ts. The
// database side (FactionSeat rows, the invite that makes one, the order
// queue's seat check) is exercised in the browser with DEV 1 and DEV 3; this
// probe covers everything the worker and the sim do with a seat once it
// exists, on a soak world, plus the scope table itself.
//
// Run:  npx tsx scripts/seat-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { syncHumanMinisters, seatLeaderId, HUMAN_MINISTER_LOYALTY, seatsOf } from '../lib/government/human-ministers';
import { getMinister, tickCabinets } from '../lib/government/cabinet-service';
import { assessCoupRisk } from '../lib/government/coup-service';
import { seatAllows, seatRefusal, SOVEREIGN_ONLY } from '../lib/government/seat-scope';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { getGovernment } from '../lib/government/government-service';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('seats');
    const quiet = quietConsole(line => line.startsWith('[Seats]'));
    let world = bootSoakWorld();
    const [human] = empireIds(world);
    world.claimedFactionIds = [human];
    const DAY = 86400;

    // ── Scope table ─────────────────────────────────────────────────────────
    check('defence covers fleet orders', seatAllows('defence', 'MIL_MOVE_FLEET') && seatAllows('defence', 'MIL_BUILD_FLEET'));
    check('defence does not cover the treasury or research', !seatAllows('defence', 'ECON_MARKET_BUY') && !seatAllows('defence', 'TECH_START_RESEARCH'));
    check('foreign covers envoys and treaties', seatAllows('foreign', 'DIP_SEND_ENVOY') && seatAllows('foreign', 'DIP_PROPOSE_TREATY'));
    check('nobody declares war but the ruler', [...SOVEREIGN_ONLY].includes('DIP_DECLARE_WAR') && !seatAllows('foreign', 'DIP_DECLARE_WAR') && !seatAllows('defence', 'DIP_DECLARE_WAR'));
    check('no seat touches delegation, the advisors or the cabinet', !seatAllows('interior', 'GOV_SET_DELEGATION') && !seatAllows('interior', 'ADV_RESOLVE_PROPOSAL') && !seatAllows('interior', 'GOV_DISMISS_MINISTER'));
    check('an unknown portfolio covers nothing', !seatAllows('treasury', 'ECON_MARKET_BUY'));
    check('refusals read as a sentence', seatRefusal('defence', 'DIP_DECLARE_WAR').includes('head of state') && seatRefusal('defence', 'TECH_START_RESEARCH').includes('defence'));

    // ── Seating ─────────────────────────────────────────────────────────────
    const before = getMinister(world, human, 'defence');
    check('plant: the AI holds the defence seat', !!before && !before.seatId, before?.name);
    const poolBefore = world.leadership.recruitmentPool.filter((l: any) => l.factionId === human).length;

    const seat = { id: 'seat-probe-1', factionId: human, portfolio: 'defence', persona: 'Brutus' };
    const sync = syncHumanMinisters(world, [seat]);
    const minister = getMinister(world, human, 'defence');
    check('the friend is seated as Minister of Defence', sync.seated.length === 1 && minister?.id === seatLeaderId(seat.id) && minister?.name === 'Brutus');
    check('the leader carries the seat id', minister?.seatId === seat.id);
    check('the displaced AI minister went back to the pool, not to the grave',
        before?.status === 'active' && world.leadership.recruitmentPool.some((l: any) => l.id === before.id) && !world.leadership.leaders.has(before.id));
    check('the world remembers the seat, without a user id', seatsOf(world, human).length === 1 && !('userId' in (seatsOf(world, human)[0] as any)));
    check('loyalty sits above every disloyalty trigger', minister!.loyalty === HUMAN_MINISTER_LOYALTY && minister!.loyalty >= 40);
    check('the coup assessor does not name the human minister as disloyal',
        !assessCoupRisk(world, human).drivers.some(d => d.includes('Brutus')));

    // ── Idempotent, and persona follows the row ─────────────────────────────
    const again = syncHumanMinisters(world, [{ ...seat, persona: 'Marcus Brutus' }]);
    check('a second sync seats nobody twice', again.seated.length === 0 && again.vacated.length === 0 && getMinister(world, human, 'defence')?.name === 'Marcus Brutus');

    // ── The cabinet tick leaves the human alone ─────────────────────────────
    const gov: any = getGovernment(world, human);
    gov.approval = 5; // a government in the gutter: AI ministers sour fast
    const aiEconomy = getMinister(world, human, 'economy')!;
    const aiLoyaltyBefore = aiEconomy.loyalty;
    for (let i = 0; i < 20; i++) tickCabinets(world, DAY);
    const humanAfter = getMinister(world, human, 'defence')!;
    check('twenty bad days do not move the human minister\'s loyalty or corruption',
        humanAfter.loyalty === HUMAN_MINISTER_LOYALTY && (humanAfter.corruption ?? 0) === 0 && humanAfter.seatId === seat.id);
    check('…while an AI colleague soured as before', getMinister(world, human, 'economy')!.loyalty < aiLoyaltyBefore,
        `${aiLoyaltyBefore} → ${getMinister(world, human, 'economy')!.loyalty}`);
    gov.approval = 60;

    // ── Survives the worker's round trip ────────────────────────────────────
    world = deserializeWorld(serializeWorld(world));
    const back = getMinister(world, human, 'defence');
    check('the seated minister survives the JSON round trip', back?.seatId === seat.id && back?.status === 'active');

    // ── Leaving ─────────────────────────────────────────────────────────────
    const gone = syncHumanMinisters(world, []);
    const replacement = getMinister(world, human, 'defence');
    check('a seat that is gone vacates the chair', gone.vacated.length === 1 && world.leadership.leaders.get(seatLeaderId(seat.id))?.status === 'retired');
    check('…and the AI fills it again', !!replacement && !replacement.seatId, replacement?.name);
    check('the pool is no larger than it was (the friend never entered it)', world.leadership.recruitmentPool.filter((l: any) => l.factionId === human).length <= poolBefore + 1);

    // ── A seat on an unknown faction is ignored ─────────────────────────────
    const stray = syncHumanMinisters(world, [{ id: 'seat-x', factionId: 'faction-nowhere', portfolio: 'defence', persona: 'Nobody' }]);
    check('a seat on a faction that does not exist seats nobody', stray.seated.length === 0);

    quiet.restore();
    console.log('\nseat probe\n' + results.join('\n'));
    if (quiet.complaints.size) {
        console.log('\ncomplaints:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`seat probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
