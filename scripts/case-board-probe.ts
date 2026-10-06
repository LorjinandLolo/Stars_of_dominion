// scripts/case-board-probe.ts
// Probe: the case board, worker side (spec item 12a).
//
//   npx tsx scripts/case-board-probe.ts
//
// Runs on a copy of the init world. Dice are forced where an outcome matters.

import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld, extractFactionShard, injectFactionShard } from '../lib/persistence/save-service';
import { scrubOwnerSecrets } from '../lib/persistence/shard-privacy';
import { launchCatalogOperation, tickOperations } from '../lib/espionage/espionage-service';
import { getOrCreateFactionIntel, updateInfiltration } from '../lib/espionage/faction-intel';
import { recruitAgent } from '../lib/espionage/agent-service';
import {
    chooseSuspect, ensureCases, fileAccusation, leakCase, tickCases, interrogationClue,
    CLUE_INTERVAL_SECONDS, CASE_COLD_AFTER_SECONDS, FALSE_ACCUSATION_RIVALRY_JUMP,
} from '../lib/espionage/case-board';
import { drainBuffer, resetChronicleBuffer } from '../lib/narrative/chronicle';
import { drainNotifications } from '../lib/time/notification-hooks';
import { ACTION_DEFINITIONS } from '../lib/actions/registry';
import { shiftRivalry } from '../lib/diplomacy/offer-service';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');

const A = 'faction-aurelian';   // sponsor
const V = 'faction-vektori';    // victim (a player)
const C = 'faction-null-syndicate'; // an innocent

function freshWorld(): any {
    const world: any = deserializeWorld(serializeWorld(getGameWorldState()));
    world.claimedFactionIds = [A, V, C];
    world.espionage.operations.clear();
    ensureCases(world).clear();
    world.espionage.attributionRecords.length = 0;
    // A played galaxy has grudges; a fresh one has none. Give it two.
    shiftRivalry(world, V, C, 40, 'probe');
    shiftRivalry(world, V, A, 20, 'probe');
    return world;
}
const capitalOf = (w: any, id: string): string =>
    w.economy.factions.get(id)?.capitalSystemId
    ?? [...w.construction.planets.values()].find((p: any) => p.ownerId === id)?.systemId;
const rivalry = (w: any, a: string, b: string) =>
    (w.rivalries.get(`rivalry-${a}-${b}`) ?? w.rivalries.get(`rivalry-${b}-${a}`))?.rivalryScore ?? 0;
const casesOf = (w: any, id: string) => [...ensureCases(w).values()].filter((c: any) => c.ownerFactionId === id);

/** Run one operation to resolution with the dice pinned. */
function runOp(w: any, opId: string, dice: number[], setup?: (op: any) => void): any {
    const intel = getOrCreateFactionIntel(w, A);
    intel.intelPoints = 1000;
    w.economy.factions.get(A).reserves.CREDITS = 1_000_000;
    const res = launchCatalogOperation(A, V, capitalOf(w, V), opId, w);
    if (!res.success) throw new Error(res.message);
    const op: any = res.operation;
    setup?.(op);
    const real = Math.random;
    let i = 0;
    Math.random = () => dice[Math.min(i++, dice.length - 1)];
    try {
        w.nowSeconds = Date.parse(op.completesAt) / 1000 + 1;
        tickOperations(w, 60);
    } finally {
        Math.random = real;
    }
    return op;
}

async function main() {
    console.log('\n[1] Suspicion can land on the wrong empire');
    {
        const w = freshWorld();
        const op: any = { actorFactionId: A, targetFactionId: V };
        check('usually the sponsor', chooseSuspect(op, w, () => 0.1) === A);
        const other = chooseSuspect(op, w, () => 0.99);
        check('sometimes someone else', other !== A && other !== V, other);
        check('a false flag mostly takes', chooseSuspect({ ...op, falseFlagFactionId: C }, w, () => 0.1) === C);
        check('the chronicle prints the suspect, not the sponsor',
            /suspected:\$\{suspectId\}/.test(code('lib/espionage/espionage-service.ts')));
    }

    console.log('\n[2] A case opens when the sponsor was not caught');
    {
        const w = freshWorld();
        // Political op: give A a Shadow Government in V so the gate opens.
        updateInfiltration(w, A, V, 95);
        resetChronicleBuffer();
        // Dice: success roll low, exposure roll high (not caught), suspect roll high (blame elsewhere).
        const op = runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.5]);
        check('the operation was not exposed', op.attributionState !== 'exposed', op.attributionState);
        const kase: any = casesOf(w, V)[0];
        check('the victim has a case', !!kase);
        check('the sponsor has none', casesOf(w, A).length === 0);
        check('the case does not name its sponsor in public fields',
            !JSON.stringify({ t: kase?.title, s: kase?.summary, id: kase?.id }).includes(A));
        check('the sponsor is a suspect', kase?.suspectIds.includes(A));
        check('so is an innocent', kase?.suspectIds.includes(C));

        // Clues over two sim days at default counter-intelligence.
        const start = w.nowSeconds;
        const fleets = [...w.movement.fleets.values()];
        void fleets;
        for (let t = 0; t <= 2 * 24 * 3600; t += 3600) { w.nowSeconds = start + t; tickCases(w); }
        check('at least three clues within two sim days', (kase?.clues.length ?? 0) >= 3, `${kase?.clues.length}`);
        check('every clue names who it points at', kase.clues.every((c: any) => Array.isArray(c.pointsAt)));
        check('a method clue lists who could field a Shadow Government',
            kase.clues.some((c: any) => c.source === 'method' && c.pointsAt.includes(A)));

        // What reaches the player.
        const shardJson = extractFactionShard(w, V);
        const shard = JSON.parse(shardJson);
        const wire = scrubOwnerSecrets(shard).espionageCases[0];
        check('the shard keeps the truth (its only copy)', shard.espionageCases[0].actorFactionId === A);
        check('the wire drops the sponsor', !('actorFactionId' in wire) && !('operationId' in wire));
        check('the wire drops pending clues and clue weights',
            !('pendingClues' in wire) && wire.clues.every((c: any) => !('weights' in c)));

        // Round trip.
        const back: any = freshWorld();
        injectFactionShard(back, shardJson);
        check('a case survives a save and reload', ensureCases(back).get(kase.id)?.actorFactionId === A);
    }

    console.log('\n[3] No case when there is nothing to investigate');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        const caught = runOp(w, 'election_interference', [0.05, 0.0]);
        check('a caught operation is exposed', caught.attributionState === 'exposed');
        check('and opens no case', casesOf(w, V).length === 0);

        const w2 = freshWorld();
        const quietFail = runOp(w2, 'infiltrate_government', [0.99, 0.99]);
        const noticed = quietFail.attributionState !== 'invisible';
        check('a failure nobody noticed opens no case', noticed || casesOf(w2, V).length === 0, quietFail.attributionState);

        const w3 = freshWorld();
        w3.claimedFactionIds = [A];
        updateInfiltration(w3, A, V, 95);
        runOp(w3, 'election_interference', [0.05, 0.99, 0.99]);
        check('an AI victim gets no case (yet: 12c)', casesOf(w3, V).length === 0);
    }

    console.log('\n[4] A false flag misleads');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        const op = runOp(w, 'election_interference', [0.05, 0.99, 0.1, 0.5], o => { o.falseFlagFactionId = C; });
        const kase: any = casesOf(w, V)[0];
        check('the case opened', !!kase, op.attributionState);
        const start = w.nowSeconds;
        for (let t = 0; t <= 5 * 24 * 3600; t += 3600) { w.nowSeconds = start + t; tickCases(w); }
        const atFlag = kase.clues.filter((c: any) => c.pointsAt.includes(C)).length;
        check('most clues point at the empire it was dressed as', atFlag * 2 > kase.clues.length, `${atFlag}/${kase.clues.length}`);
        check('the planted clues carry no real weight', kase.clues.filter((c: any) => c.pointsAt.includes(C)).every((c: any) => (c.weights?.[C] ?? 0) <= 0));
    }

    console.log('\n[5] Accusing the right empire');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        const op = runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.5]);
        const kase: any = casesOf(w, V)[0];
        const posture = w.movement.empirePostures?.get?.(V);
        const debatesBefore = (posture?.openQuestions ?? []).length;
        const intelBefore = getOrCreateFactionIntel(w, V).intelPoints;
        const rivalryBefore = rivalry(w, V, A);
        resetChronicleBuffer();
        drainNotifications();
        const res = fileAccusation(w, V, kase.id, A);
        check('the accusation holds', res.ok && (res as any).verdict === 'correct', res.message);
        check('the operation is exposed after the fact', w.espionage.operations.get(op.id)?.attributionState === 'exposed');
        check('the chronicle records it, exposed',
            drainBuffer().rows.some(r => r.type === 'scandal_confirmed' && r.attribution === 'exposed'));
        const debatesAfter = (w.movement.empirePostures?.get?.(V)?.openQuestions ?? []).length;
        check('the victim\'s chamber takes it up', !posture?.blocs?.length || debatesAfter > debatesBefore, `${debatesBefore} -> ${debatesAfter}`);
        check('relations with the sponsor sour', rivalry(w, V, A) > rivalryBefore);
        check('the victim\'s service is rewarded', getOrCreateFactionIntel(w, V).intelPoints > intelBefore);
        check('the sponsor is told', drainNotifications().some(n => n.factionId === A && n.title === 'OUR OPERATION IS EXPOSED'));
        check('the case is closed with its verdict', kase.status === 'accused' && kase.verdict === 'correct');
        check('a closed case takes no second accusation', !fileAccusation(w, V, kase.id, A).ok);
    }

    console.log('\n[6] Accusing the wrong empire');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.5]);
        const kase: any = casesOf(w, V)[0];
        const before = rivalry(w, V, C);
        getOrCreateFactionIntel(w, A).infiltrationLevels[V] = 50; // below the cap, so a rise shows
        const actorHold = 50;
        drainNotifications();
        const res = fileAccusation(w, V, kase.id, C);
        check('the accusation fails', res.ok && (res as any).verdict === 'wrong', res.message);
        check('the innocent is insulted', rivalry(w, V, C) >= Math.min(100, before + FALSE_ACCUSATION_RIVALRY_JUMP), `${before} -> ${rivalry(w, V, C)}`);
        check('the real sponsor\'s hold tightens', (getOrCreateFactionIntel(w, A).infiltrationLevels[V] ?? 0) > actorHold);
        check('the innocent is told', drainNotifications().some(n => n.factionId === C && n.title === 'FALSELY ACCUSED'));
        check('the verdict does not name the real sponsor', !res.message.includes('Aurelian'));
        check('accusing a non-suspect is refused', !fileAccusation(w, V, 'nope', C).ok);
    }

    console.log('\n[7] Leaking instead');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.5]);
        const kase: any = casesOf(w, V)[0];
        const before = rivalry(w, V, C);
        resetChronicleBuffer();
        const res = leakCase(w, V, kase.id, C);
        check('the leak goes out', res.ok);
        check('as a suspicion the press can print', drainBuffer().rows.some(r => r.type === 'investigation_published' && r.attribution === `suspected:${C}`));
        check('with no diplomatic weight', rivalry(w, V, C) === before);
        check('and the case is closed', kase.status === 'leaked');
    }

    console.log('\n[8] Prisoners talk');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.5]);
        const kase: any = casesOf(w, V)[0];
        const mk = (id: string, owner: string, traits: any[]) => {
            const a = recruitAgent({ id, name: id, codename: id.toUpperCase(), traitIds: traits, recruitmentCost: 0, expiresInDays: 7 }, owner, w.nowSeconds, w);
            a.status = 'captured'; a.capturedByFactionId = V;
            return a;
        };
        const honest = interrogationClue(mk('honest', A, ['ghost']), kase, w);
        check('an honest prisoner of the sponsor names them', honest.pointsAt[0] === A && (honest.weights?.[A] ?? 0) > 0, honest.text);
        const liar = interrogationClue(mk('liar', A, ['double_agent']), kase, w, () => 0);
        check('a Double Agent of the sponsor blames someone else', liar.pointsAt[0] !== A && (liar.weights?.[liar.pointsAt[0]] ?? 0) === 0, liar.text);
        const bystander = interrogationClue(mk('bystander', C, ['ghost']), kase, w);
        check('an honest bystander clears their own service', bystander.pointsAt[0] === C && (bystander.weights?.[C] ?? 0) < 0, bystander.text);

        const pendingBefore = kase.clues.length;
        w.nowSeconds = kase.nextClueAt + 1;
        tickCases(w);
        check('prisoners held by the victim are questioned on the case', kase.interrogatedAgentIds.length === 3 && kase.clues.length > pendingBefore);
        check('each only once', (tickCases(w), kase.interrogatedAgentIds.length === 3));

        const sweep = code('lib/espionage/counter-intel.ts');
        check('sweeps take prisoners from the networks they break', /captureAgents\(world, self, network\.agentIds/.test(sweep));
    }

    console.log('\n[9] Cases go cold, and the orders exist');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.5]);
        const kase: any = casesOf(w, V)[0];
        w.nowSeconds = kase.openedAt + CASE_COLD_AFTER_SECONDS + 1;
        tickCases(w);
        check('an untouched case goes cold', kase.status === 'cold');
        check('accusing on a cold case is refused', !fileAccusation(w, V, kase.id, A).ok);
        check('clue pace is set', CLUE_INTERVAL_SECONDS === 12 * 3600);
        check('ESP_FILE_ACCUSATION is registered', !!(ACTION_DEFINITIONS as any).ESP_FILE_ACCUSATION);
        check('ESP_LEAK_CASE is registered', !!(ACTION_DEFINITIONS as any).ESP_LEAK_CASE);
        check('the worker handles both',
            /case 'ESP_FILE_ACCUSATION':\s*case 'ESP_LEAK_CASE':[\s\S]{0,600}fileAccusation\(/.test(code('scripts/game-loop.ts')));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
