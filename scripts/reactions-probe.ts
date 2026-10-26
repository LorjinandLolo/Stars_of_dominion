// scripts/reactions-probe.ts
// The gazette answers back: does an article turn into the right buttons for
// the right reader, through the public ceiling, and does PRESS_REACT run the
// inner order and remember it?
//
// lib/narrative/reactions.ts (pure) + the PRESS_REACT handler in the worker.
//
// Run:  npx tsx scripts/reactions-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { reactionsFor, type PublicEvent, type ReactionContext } from '../lib/narrative/reactions';
import { getGovernment } from '../lib/government/government-service';
import { getOrCreateRivalry } from '../lib/diplomacy/offer-service';
import { POLITICAL_CAPITAL_COSTS } from '../lib/actions/political-costs';
import { TechEngine } from '../lib/tech/engine';
import { pendingCount, drainBuffer, returnBuffer, resetChronicleBuffer } from '../lib/narrative/chronicle';

/** Peek at the chronicle buffer without losing it. */
function peek(): any[] { const { rows } = drainBuffer(); returnBuffer(rows); return rows; }

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const ev = (type: string, actorIds: string[], targetIds: string[], extra: Partial<PublicEvent> = {}): PublicEvent =>
    ({ id: `e-${type}`, type, day: 1, actorIds, suspectedId: null, targetIds, location: null, facts: {}, ...extra });

function ctxFor(me: string, opts: Partial<ReactionContext> = {}): ReactionContext {
    return { readerFactionId: me, isAtWar: () => false, rivalry: () => 20, exists: () => true, politicalCapital: 100, ...opts };
}

async function main() {
    const A = 'a', B = 'b', C = 'c';
    const labels = (rs: ReturnType<typeof reactionsFor>) => rs.map(r => r.label).join(' | ');

    // ── A war declared ──────────────────────────────────────────────────────
    let rs = reactionsFor([ev('war_declared', [B], [A])], ctxFor(A, { isAtWar: id => id === B }));
    check('the attacked can sue for terms, rally the press, go to the fleet', rs.some(r => r.actionId === 'DIP_OFFER_PEACE') && rs.some(r => r.actionId === 'PRESS_LAUNCH_CAMPAIGN') && rs.some(r => r.openTab === 'military'), labels(rs));
    rs = reactionsFor([ev('war_declared', [B], [C])], ctxFor(A));
    check('a bystander condemns, consoles, or stays out', rs.some(r => r.actionId === 'DIP_IMPOSE_SANCTIONS' && r.payload?.targetFactionId === B) && rs.some(r => r.actionId === 'DIP_SEND_ENVOY' && r.payload?.targetFactionId === C), labels(rs));
    check('never more than three', rs.length <= 3);
    rs = reactionsFor([ev('war_declared', [B], [C])], ctxFor(A, { isAtWar: id => id === B }));
    check('no sanctions on someone you are already at war with', !rs.some(r => r.actionId === 'DIP_IMPOSE_SANCTIONS'), labels(rs));

    // ── A battle lost ───────────────────────────────────────────────────────
    rs = reactionsFor([ev('battle_resolved', [B], [A])], ctxFor(A, { isAtWar: id => id === B }));
    check('the loser blames the admiral', rs.some(r => r.actionId === 'GOV_DISMISS_MINISTER' && r.payload?.portfolio === 'defence'), labels(rs));
    rs = reactionsFor([ev('battle_resolved', [A], [B])], ctxFor(A));
    check('the winner presses on and rallies the press', rs.some(r => r.openTab === 'military') && rs.some(r => r.actionId === 'PRESS_LAUNCH_CAMPAIGN'), labels(rs));

    // ── The public ceiling ──────────────────────────────────────────────────
    rs = reactionsFor([ev('operation_exposed', [], [A], { suspectedId: B })], ctxFor(A));
    check('a suspected hand can be sanctioned, with the warning', rs.some(r => r.actionId === 'DIP_IMPOSE_SANCTIONS' && r.payload?.targetFactionId === B && /may be wrong/.test(r.detail)), labels(rs));
    rs = reactionsFor([ev('operation_exposed', [], [A])], ctxFor(A));
    check('an invisible hand draws no reaction aimed at anyone', !rs.some(r => r.actionId && r.payload?.targetFactionId), labels(rs));
    rs = reactionsFor([ev('operation_exposed', [A], [B])], ctxFor(A));
    check('the exposed actor can deny', rs.some(r => r.id === 'deny'), labels(rs));

    // ── Prices and the purse ────────────────────────────────────────────────
    rs = reactionsFor([ev('war_declared', [B], [C])], ctxFor(A, { politicalCapital: 3 }));
    const sanction = rs.find(r => r.actionId === 'DIP_IMPOSE_SANCTIONS')!;
    const envoy = rs.find(r => r.actionId === 'DIP_SEND_ENVOY')!;
    check('a reaction carries its political price', sanction.pcCost === POLITICAL_CAPITAL_COSTS.DIP_IMPOSE_SANCTIONS && envoy.pcCost === POLITICAL_CAPITAL_COSTS.DIP_SEND_ENVOY);
    check('…and is greyed when the court cannot pay', !!sanction.disabled && !envoy.disabled, sanction.disabled);

    // ── Civil war, breakaway ────────────────────────────────────────────────
    rs = reactionsFor([ev('civil_war_started', [C], [B])], ctxFor(A));
    check('a bystander may recognise the breakaway', rs.some(r => r.actionId === 'DIP_RECOGNIZE_BREAKAWAY' && r.payload?.rebelFactionId === C), labels(rs));
    rs = reactionsFor([ev('civil_war_started', [C], [A])], ctxFor(A, { isAtWar: id => id === C }));
    check('the parent crushes it or sues', rs.some(r => r.id === 'crush') && rs.some(r => r.actionId === 'DIP_OFFER_PEACE'), labels(rs));

    // ── Unknown factions never get a button ─────────────────────────────────
    rs = reactionsFor([ev('war_declared', ['ghost'], [C])], ctxFor(A, { exists: id => id !== 'ghost' }));
    check('a faction the galaxy does not know draws no reaction', !rs.some(r => r.payload?.targetFactionId === 'ghost'), labels(rs));
    check('an empty article has no reactions', reactionsFor([], ctxFor(A)).length === 0);

    // ── PRESS_REACT runs the inner order and remembers it ───────────────────
    seedSimulation('reactions');
    const quiet = quietConsole(line => line.startsWith('[Press]') || line.startsWith('[Order]'));
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const [me, them] = ids;
    world.claimedFactionIds = [me];
    const gov: any = getGovernment(world, me);
    gov.politicalCapital = 50; gov.politicalCapitalCap = 100;
    getOrCreateRivalry(world, me, them);
    // Envoys sit behind a tier-1 diplomacy tech (as the offence probe unlocks it).
    const st = world.tech.get(me) ?? TechEngine.initPlayerState(me);
    st.unlockedTechIds = [...new Set([...(st.unlockedTechIds ?? []), 'dip_t1_5'])];
    world.tech.set(me, st);
    resetChronicleBuffer();
    const chronicleBefore = pendingCount();
    executeOrder(world, 'PRESS_REACT', { articleId: 'art-1', headline: 'Test story', actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: them } }, me);
    const added = peek().slice(chronicleBefore);
    check('the inner order ran and charged its price', gov.politicalCapital === 50 - (POLITICAL_CAPITAL_COSTS.DIP_SEND_ENVOY ?? 0), `${gov.politicalCapital} ${world.economy.factions.get(me).lastOrderError?.reason ?? ''}`);
    check('the chronicle remembers the answer, with the story', added.some((e: any) => e.type === 'press_reaction' && JSON.parse(e.facts).headline === 'Test story' && JSON.parse(e.facts).reaction === 'DIP_SEND_ENVOY'), JSON.stringify(added.map((e: any) => e.type)));
    const before = pendingCount();
    executeOrder(world, 'PRESS_REACT', { articleId: 'art-2', headline: 'x', actionId: 'PRESS_REACT', payload: {} }, me);
    executeOrder(world, 'PRESS_REACT', { articleId: 'art-3', headline: 'x', actionId: 'NOT_A_THING', payload: {} }, me);
    check('a reaction cannot nest or name an unknown order', pendingCount() === before);
    gov.politicalCapital = 0;
    executeOrder(world, 'PRESS_REACT', { articleId: 'art-4', headline: 'x', actionId: 'DIP_IMPOSE_SANCTIONS', payload: { targetFactionId: them } }, me);
    check('a refused inner order leaves nothing in the chronicle', pendingCount() === before, world.economy.factions.get(me).lastOrderError?.reason);
    quiet.restore();

    console.log('\nreactions probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`reactions probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
