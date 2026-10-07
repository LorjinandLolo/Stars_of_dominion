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
        // The Counter-intel tab imports counter-intel in the browser. case-board
        // reaches lib/government, which reads files from disk: importing it from
        // there broke the game page's bundle.
        const imports = [...sweep.matchAll(/from '([^']+)'/g)].map(m => m[1]);
        check('counter-intel stays browser-safe (no case-board, no government)',
            !imports.some(i => /case-board|government|politics/.test(i)), imports.join(', '));
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

    // ── Item 12b-2 ───────────────────────────────────────────────────────────
    const mkAgent = (w: any, id: string, owner: string, species: string | null, traits: any[] = ['ghost']) => {
        const a = recruitAgent({ id, name: id, codename: id.toUpperCase(), traitIds: traits, species, recruitmentCost: 0, expiresInDays: 7 }, owner, w.nowSeconds, w);
        return a;
    };
    const civ = (w: any, id: string) => w.economy.factions.get(id)?.civilizationId;

    console.log('\n[10] Hired foreigners leave the wrong face behind');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        const foreigner = mkAgent(w, 'hired', A, civ(w, C));
        const real = Math.random;
        Math.random = () => 0.99; // the hireling is not spotted
        let kase: any;
        try {
            runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.99], o => { o.agentId = foreigner.id; });
            kase = casesOf(w, V)[0];
            const start = w.nowSeconds;
            for (let t = 0; t <= 6 * 24 * 3600; t += 3600) { w.nowSeconds = start + t; tickCases(w, 3600); }
        } finally { Math.random = real; }
        const all = [...kase.clues, ...(kase.pendingClues ?? [])];
        const face = all.find((c: any) => /describe the operative/.test(c.text));
        check('a witness describes the operative', !!face, all.map((c: any) => c.text).join(' | '));
        check('the face points at the foreigner\'s people', face?.pointsAt.includes(C) && !face?.pointsAt.includes(A), face?.text);
        check('and the clue is tagged opportunity', face?.tag === 'opportunity');

        const w2 = freshWorld();
        updateInfiltration(w2, A, V, 95);
        const own = mkAgent(w2, 'own', A, civ(w2, A));
        runOp(w2, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.99], o => { o.agentId = own.id; });
        const face2 = [...casesOf(w2, V)[0].clues, ...(casesOf(w2, V)[0].pendingClues ?? [])].find((c: any) => /describe the operative/.test(c.text));
        check('an operative of our own species points home', !!face2?.pointsAt.includes(A), face2?.text);

        const w3 = freshWorld();
        updateInfiltration(w3, A, V, 95);
        runOp(w3, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.99]);
        const none = [...casesOf(w3, V)[0].clues, ...(casesOf(w3, V)[0].pendingClues ?? [])].some((c: any) => /describe the operative/.test(c.text));
        check('no agent, no face', !none);

        // Seeing through it: a service with good files spots the freelancer.
        const w4 = freshWorld();
        updateInfiltration(w4, A, V, 95);
        getOrCreateFactionIntel(w4, V).counterIntelStrength = 100;
        const hired2 = mkAgent(w4, 'hired2', A, civ(w4, C));
        const real2 = Math.random;
        Math.random = () => 0.01;
        try { runOp(w4, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.01], o => { o.agentId = hired2.id; }); }
        finally { Math.random = real2; }
        const k4: any = casesOf(w4, V)[0];
        const spotted = [...k4.clues, ...(k4.pendingClues ?? [])].find((c: any) => /freelancer/.test(c.text));
        check('good files see through a hired face', !!spotted && spotted.clears?.includes(C), spotted?.text);
        check('the freelancer note points away from the face\'s people', (spotted?.weights?.[C] ?? 0) < 0);

        // A captured hireling says who paid.
        const prisoner = mkAgent(w, 'taken', A, civ(w, C));
        prisoner.status = 'captured'; prisoner.capturedByFactionId = V;
        const says = interrogationClue(prisoner, kase, w);
        check('a captured hireling names who paid them', says.pointsAt[0] === A && /paid for/.test(says.text), says.text);
    }

    console.log('\n[11] Real motives, and who gains');
    {
        const w = freshWorld();
        w.nowSeconds += 60; // after the setup grudges, so it is the latest
        shiftRivalry(w, V, C, 5, 'sanctions_imposed');
        w.economy.factions.get(V).reserves.CREDITS = 900_000;
        w.economy.factions.get(C).reserves.CREDITS = 800_000;
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.99]);
        const k: any = casesOf(w, V)[0];
        const all = [...k.clues, ...(k.pendingClues ?? [])];
        const grudge = all.find((c: any) => /^Grudges on file/.test(c.text));
        check('the motive clue names a real incident', !!grudge && /sanctions between us/.test(grudge.text), grudge?.text);
        check('it is tagged motive', grudge?.tag === 'motive');
        const cui = all.find((c: any) => /^Who gains if we stumble/.test(c.text));
        check('cui bono names the treasury just behind ours', !!cui && cui.pointsAt[0] === C, cui?.text);
        check('every clue carries a tag', all.every((c: any) => !!c.tag), all.filter((c: any) => !c.tag).map((c: any) => c.text).join(' | '));
    }

    console.log('\n[12] The convenient witness');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.1, 0.5], o => { o.falseFlagFactionId = C; });
        const k: any = casesOf(w, V)[0];
        const walkIn = [...k.clues, ...(k.pendingClues ?? [])].find((c: any) => /walk-in/.test(c.text));
        check('a false flag brings a walk-in', !!walkIn && walkIn.pointsAt[0] === C);
        const interval = CLUE_INTERVAL_SECONDS;
        check('and it is due within hours, not the usual wait', k.nextClueAt - k.openedAt <= interval / 4 + 1, `${(k.nextClueAt - k.openedAt) / 3600} h`);
        const honest = freshWorld();
        updateInfiltration(honest, A, V, 95);
        runOp(honest, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.99]);
        const hk: any = casesOf(honest, V)[0];
        check('genuine cases never bring a walk-in', ![...hk.clues, ...(hk.pendingClues ?? [])].some((c: any) => /walk-in/.test(c.text)));
    }

    console.log('\n[13] The mole');
    {
        const w = freshWorld();
        updateInfiltration(w, A, V, 95);
        runOp(w, 'election_interference', [0.05, 0.99, 0.99, 0.99, 0.99]);
        const k: any = casesOf(w, V)[0];
        const mole = mkAgent(w, 'mole', V, civ(w, V), ['compromised']);
        getOrCreateFactionIntel(w, V).counterIntelStrength = 0;
        w.espionage.reports.clear();
        tickCases(w, 3600);
        const leak = [...w.espionage.reports.values()].find((r: any) => r.ownerFactionId === A && r.domain === 'mole');
        check('a mole in the victim\'s service leaks the file to its sponsor', !!leak, `${w.espionage.reports.size} reports`);
        check('the leak says how many findings name the sponsor', !!leak && /naming us/.test(leak.body), leak?.body);
        check('nobody else gets it', ![...w.espionage.reports.values()].some((r: any) => r.domain === 'mole' && r.ownerFactionId !== A));
        const before = w.espionage.reports.size;
        tickCases(w, 3600);
        check('at most one leak a day per file', w.espionage.reports.size === before);
        // Outing.
        getOrCreateFactionIntel(w, V).counterIntelStrength = 100;
        const real = Math.random; Math.random = () => 0;
        try { tickCases(w, 3600); } finally { Math.random = real; }
        check('counter-intelligence outs the mole', mole.compromiseKnown === true);
        const wire = scrubOwnerSecrets({ espionageAgents: [mole] }).espionageAgents[0];
        check('and the owner now sees the trait', wire.traitIds.includes('compromised'));
        k.moleLeakedAt = 0; w.nowSeconds += 2 * 86400;
        const n = w.espionage.reports.size;
        tickCases(w, 3600);
        check('an outed mole stops leaking', w.espionage.reports.size === n);
        const hidden = scrubOwnerSecrets({ espionageAgents: [mkAgent(w, 'quiet', V, civ(w, V), ['compromised'])] }).espionageAgents[0];
        check('an unknown mole stays hidden from the owner', !hidden.traitIds.includes('compromised'));
    }

    console.log('\n[14] Dossiers: what sweeps and sources show');
    {
        const w = freshWorld();
        const home = capitalOf(w, V);
        updateInfiltration(w, A, V, 60);
        w.espionage.intelNetworks.set(`${A}:${home}`, { id: `${A}:${home}`, ownerFactionId: A, systemId: home, strength: 0.9, penetrationLevel: 'deep', agentIds: [], activeUntil: w.nowSeconds + 1e6 });
        const cell = mkAgent(w, 'cell', A, civ(w, A), ['double_agent']);
        cell.status = 'deployed'; cell.deployedToSystemId = home;
        w.espionage.intelNetworks.get(`${A}:${home}`).agentIds.push(cell.id);
        const { applySweep } = await import('../lib/espionage/counter-intel');
        const { OPERATION_CATALOG_BY_ID } = await import('../lib/espionage/operation-catalog');
        const sweepOp: any = { id: 'sweep-x', actorFactionId: V, targetFactionId: V, targetRegionId: home };
        const real = Math.random; Math.random = () => 0; // capture certain
        try { applySweep(sweepOp, OPERATION_CATALOG_BY_ID.get('counterintel_sweep')!, w, 1); } finally { Math.random = real; }
        const vIntel = getOrCreateFactionIntel(w, V);
        check('a sweep records how deep the caught rival still is', typeof vIntel.dossier?.[A]?.revealedInfiltration === 'number', JSON.stringify(vIntel.dossier));
        const p = vIntel.prisoners?.find(x => x.agentId === cell.id);
        check('a prisoner goes on the captor\'s books', !!p);
        check('with their species plain to see', p?.species === civ(w, A));
        check('a Double Agent claims another employer', !!p && p.claimedEmployerId !== A, p?.claimedEmployerId);

        updateInfiltration(w, V, C, 40);
        const { tickDossiers } = await import('../lib/espionage/counter-intel');
        tickDossiers(w);
        check('sources inside a rival show their tradecraft', typeof vIntel.dossier?.[C]?.blackMarket === 'boolean');
        check('no sources, no tradecraft on file', vIntel.dossier?.['faction-covenant']?.blackMarket === undefined);
    }

    console.log('\n[15] Recruiting foreigners');
    {
        const { generateRecruitPool } = await import('../lib/espionage/agent-service');
        const { recruitCostForTraits } = await import('../lib/espionage/agent-types');
        const pool = Array.from({ length: 200 }, (_, i) => generateRecruitPool(A, i, 'civ-elyndra', ['civ-grakkar', 'civ-sarrak'])).flat();
        const foreign = pool.filter(c => c.foreign);
        check('about one candidate in four is foreign', foreign.length > pool.length * 0.15 && foreign.length < pool.length * 0.35, `${foreign.length}/${pool.length}`);
        check('foreigners are of another species', foreign.every(c => c.species && c.species !== 'civ-elyndra'));
        check('and cost half again as much', foreign.every(c => c.recruitmentCost === recruitCostForTraits(c.traitIds, true)) && recruitCostForTraits(['ghost'], true) === 3750);
        check('the worker re-prices by species', /candidate\.species = isKnownSpecies\(candidate\.species\)[\s\S]{0,300}recruitCostForTraits\(candidate\.traitIds, foreign\)/.test(code('scripts/game-loop.ts')));
        const leaf = [...code('lib/espionage/dossier.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
        check('the dossier vocabulary stays browser-safe', leaf.every(i => /ideologies|types/.test(i)), leaf.join(', '));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
