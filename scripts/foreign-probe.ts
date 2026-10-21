// scripts/foreign-probe.ts
// Palpatine: a sitting ruler in another court. Does the persona hold, fall
// the right ways, and does a court that falls to them become a puppet?
//
// lib/government/foreign-ministers.ts + lib/ai/puppet-ai.ts. The ruler of A
// holds the defence seat in B as "Sheev". Nothing in B's shard or the
// snapshot says so. A loyal servant who names the plotter sometimes exposes
// them; war between A and B exposes them at once; exposure is a casus belli
// for B and a legitimacy wound for A. A puppet joins its patron's wars
// through the AI order outbox and pays tribute.
//
// Run:  npx tsx scripts/foreign-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { drainAIOrders } from '../lib/ai/ai-orders';
import { syncHumanMinisters } from '../lib/government/human-ministers';
import { startPlot, soundOut } from '../lib/government/plots';
import { exposeSeat, installPuppet, tickForeignMinisters, patronOf, EXPOSURE_LEGITIMACY } from '../lib/government/foreign-ministers';
import { tickPuppets } from '../lib/ai/puppet-ai';
import { getMinister } from '../lib/government/cabinet-service';
import { getGovernment } from '../lib/government/government-service';
import { registerActOfWar, isAtWar, getOrCreateRivalry } from '../lib/diplomacy/offer-service';
import { extractFactionShard, cleanWorldForSave, serializeWorld } from '../lib/persistence/save-service';
import { drainNotifications } from '../lib/time/notification-hooks';
import { WAR } from '../lib/ai/war-ai';

let failures = 0;
const results: string[] = [];
function dice(...rolls: number[]): () => number { let i = 0; return () => rolls[Math.min(i++, rolls.length - 1)]; }
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('foreign');
    const quiet = quietConsole(line => line.startsWith('[Seats]') || line.startsWith('[Puppet]') || line.startsWith('[AI Orders]'));
    const world: any = bootSoakWorld();
    world.coupCrises = new Map(); world.plots = new Map(); world.puppets = new Map();
    const ids = empireIds(world);
    const [A, B, C] = ids;
    world.claimedFactionIds = [A, B];
    world.aiWar ??= { firstSeenSeconds: world.nowSeconds, factions: {} };

    // The ruler of A sits in B's cabinet as Sheev.
    const sheev = { id: 'seat-sheev', factionId: B, portfolio: 'defence', persona: 'Sheev' };
    syncHumanMinisters(world, [sheev]);
    world.seatAllegiances = new Map([[sheev.id, A]]);

    // ── The persona holds ───────────────────────────────────────────────────
    const shardB = JSON.parse(extractFactionShard(world, B));
    check('B\'s shard says who holds the seat, not whom they serve', !JSON.stringify(shardB).includes('seatAllegiances') && !JSON.stringify(shardB).includes(`"${A}"`.replace(/"/g, '') + '" as') );
    const pub: any = cleanWorldForSave(world);
    check('the snapshot carries no allegiances', pub.seatAllegiances === undefined && !serializeWorld(pub).includes('seatAllegiances'));
    check('the seat record is not exposed', !world.seats.find((s: any) => s.id === sheev.id)?.exposed);
    check('tick: peace keeps the persona', tickForeignMinisters(world).length === 0);

    // ── A loyal servant can blow it ─────────────────────────────────────────
    const govB: any = getGovernment(world, B);
    const govA: any = getGovernment(world, A);
    startPlot(world, B, sheev.id, 'coup');
    const economy = getMinister(world, B, 'economy')!;
    economy.loyalty = 95; economy.corruption = 0; economy.ambitionDrive = 10;
    const legA = govA.legitimacy;
    const rivBefore = (getOrCreateRivalry(world, B, A) as any).rivalryScore ?? 20;
    // no join, reports, names the plotter, and knows whom they serve
    soundOut(world, B, sheev.id, economy.id, dice(0.9, 0.1, 0.1, 0.1));
    const seatRec = world.seats.find((s: any) => s.id === sheev.id);
    check('a naming report can expose the persona', seatRec?.exposed === true && seatRec?.exposedAs === A, JSON.stringify(seatRec));
    check('the worker is told to persist it', Array.isArray(world.seatExposures) && world.seatExposures.includes(sheev.id));
    check('exposure is a casus belli for the court', ((getOrCreateRivalry(world, B, A) as any).rivalryScore ?? 0) >= rivBefore + 30);
    check('…and a wound at home', govA.legitimacy === legA - EXPOSURE_LEGITIMACY);
    const notesB = drainNotifications(B) as any[];
    const notesA = drainNotifications(A) as any[];
    check('both courts are told', notesB.some(n => n.title === 'YOUR MINISTER IS A FOREIGN RULER') && notesA.some(n => n.title === 'YOUR SEAT ABROAD IS BLOWN'));
    check('exposing twice does nothing', !exposeSeat(world, B, sheev.id, 'case'));

    // ── War is the tripwire ─────────────────────────────────────────────────
    const vader = { id: 'seat-vader', factionId: C, portfolio: 'foreign', persona: 'Vader' };
    world.claimedFactionIds = [A, B, C];
    syncHumanMinisters(world, [sheev, vader]);
    world.seatAllegiances.set(vader.id, A);
    registerActOfWar(world, A, C);
    check('plant: A and C at war', isAtWar(world, A, C));
    const tripped = tickForeignMinisters(world);
    check('war between the court and the true empire dissolves the persona', tripped.length === 1 && world.seats.find((s: any) => s.id === vader.id)?.exposed === true, tripped[0]);

    // ── A puppet ────────────────────────────────────────────────────────────
    world.claimedFactionIds = [A]; // B fell: AI-run again, under the persona
    installPuppet(world, B, A, 'Sheev');
    check('B is A\'s puppet', patronOf(world, B) === A);
    const pubAfter: any = cleanWorldForSave(world);
    check('the puppet record is public', pubAfter.puppets?.get?.(B)?.patronFactionId === A);
    // A's war with C becomes B's — once B can pay the declaration's price.
    world.nowSeconds += (WAR.graceDays + 1) * 86400;
    govB.politicalCapital = 0;
    check('a puppet that cannot pay the price waits', tickPuppets(world)[0]?.joinedWarsOn.length === 0);
    govB.politicalCapital = 100; govB.politicalCapitalCap = 100;
    const creditsB = world.economy.factions.get(B).reserves.CREDITS = 100_000;
    const creditsA = Number(world.economy.factions.get(A).reserves.CREDITS ?? 0);
    const turns = tickPuppets(world);
    drainAIOrders(world, executeOrder);
    check('the puppet joins its patron\'s war', turns[0]?.joinedWarsOn.includes(C) && isAtWar(world, B, C), JSON.stringify(turns[0]));
    check('…and pays tribute', turns[0]?.tribute === Math.floor(creditsB * 0.01) && Number(world.economy.factions.get(A).reserves.CREDITS) === creditsA + turns[0].tribute);
    check('it never turns on the patron', !isAtWar(world, B, A));

    quiet.restore();
    console.log('\nforeign probe\n' + results.join('\n'));
    if (quiet.complaints.size) {
        console.log('\ncomplaints:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`foreign probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
