// scripts/fallen-probe.ts
// Probe: Item 14a, the fallen go into hiding.
//
//   npx tsx scripts/fallen-probe.ts

import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld, extractFactionShard } from '../lib/persistence/save-service';
import { scrubOwnerSecrets, projectPublicShard } from '../lib/persistence/shard-privacy';
import { ensureRebellion } from '../lib/rebellion/cell-service';
import { LOST_WORLD_MEMORY_SECONDS, rememberedLossesOf, tickLostWorlds } from '../lib/conquest/lost-worlds';
import { attachExile, exileCellAt, generateCrew, pickHideout, CREW_MIN, CREW_MAX, EXILE_START_STRENGTH } from '../lib/rebellion/exile-service';
import { seatCell, seatIdFor, declareMovement } from '../lib/rebellion/underground-service';
import { tickMovements } from '../lib/rebellion/movement-service';
import { tickCivilWar } from '../lib/government/civil-war-service';
import { ensureGovernments } from '../lib/government/government-service';
import { ensureGovernors } from '../lib/government/governor-service';
import { comebackOf } from '../lib/comeback/comeback-service';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
const DAY = 86400;
const F = 'faction-leopantheri';   // the empire that falls
const K = 'faction-kaerruun';      // the conqueror

function freshWorld(): any {
    const w: any = deserializeWorld(serializeWorld(getGameWorldState()));
    w.claimedFactionIds = ['faction-aurelian', 'faction-vektori'];
    ensureRebellion(w).cells.clear();
    w.lostWorlds = undefined;
    return w;
}
const hex = (a: any, b: any) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/**
 * Give F a small empire: its capital plus `n` more worlds at increasing
 * distance, all inhabited, then let K take every one of them.
 */
function empireThenConquest(w: any, n = 3) {
    const capitalPlanet: any = [...w.construction.planets.values()].find((p: any) => p.ownerId === F);
    const capSys = w.movement.systems.get(capitalPlanet.systemId);
    const others = [...w.construction.planets.values()]
        .filter((p: any) => !p.ownerId && p.systemId !== capitalPlanet.systemId && w.movement.systems.get(p.systemId))
        .sort((a: any, b: any) => hex(capSys, w.movement.systems.get(a.systemId)) - hex(capSys, w.movement.systems.get(b.systemId)));
    const step = Math.max(1, Math.floor(others.length / (n + 1)));
    const worlds = [capitalPlanet, ...Array.from({ length: n }, (_, i) => others[(i + 1) * step])];
    for (const p of worlds) { p.ownerId = F; p.population = Math.max(5, Number(p.population ?? 0)); }
    tickLostWorlds(w); // baseline
    w.nowSeconds += 6 * 3600;
    for (const p of worlds) p.ownerId = K;
    tickLostWorlds(w);
    return { worlds, capitalPlanet, capSys };
}

async function main() {
    console.log('\n[1] The ledger of lost worlds');
    {
        const w = freshWorld();
        const p: any = [...w.construction.planets.values()].find((x: any) => x.ownerId === F);
        check('the first look only takes a baseline', tickLostWorlds(w).length === 0);
        p.ownerId = K;
        w.nowSeconds += 3600;
        const rec = tickLostWorlds(w);
        check('a world changing hands is recorded: who lost it, to whom, when', rec.length === 1 && rec[0].lostBy === F && rec[0].takenBy === K && rec[0].lostAtSeconds === w.nowSeconds);
        check('the empire that lost it remembers it', rememberedLossesOf(w, F).some(r => r.planetId === p.id));
        p.ownerId = F;
        tickLostWorlds(w);
        check('a world won back is no longer a loss', !rememberedLossesOf(w, F).some(r => r.planetId === p.id));
        p.ownerId = K; tickLostWorlds(w);
        w.nowSeconds += LOST_WORLD_MEMORY_SECONDS - 60;
        tickLostWorlds(w);
        check('it is remembered for a while', rememberedLossesOf(w, F).some(r => r.planetId === p.id));
        w.nowSeconds += 120;
        tickLostWorlds(w);
        check('then it simply belongs to its conqueror', !rememberedLossesOf(w, F).some(r => r.planetId === p.id));
        const q: any = [...w.construction.planets.values()].find((x: any) => x.ownerId === 'faction-vektori');
        q.ownerId = null;
        check('a world abandoned is not a conquest', tickLostWorlds(w).length === 0);
        check('the strategic tick keeps the ledger before anyone\'s fall is diagnosed', (() => {
            const src = code('lib/time/tick-processor.ts');
            const step = src.indexOf('function step20_titlesAndSeasons');
            return step > 0 && src.indexOf('tickLostWorlds(world)', step) > step && src.indexOf('tickLostWorlds(world)', step) < src.indexOf('DefeatManager.checkDefeatConditions', step);
        })());
    }

    console.log('\n[2] Where the fallen hide');
    {
        const w = freshWorld();
        const { worlds, capitalPlanet, capSys } = empireThenConquest(w, 3);
        const far = Math.max(...worlds.filter((p: any) => p.systemId !== capitalPlanet.systemId).map((p: any) => hex(capSys, w.movement.systems.get(p.systemId))));
        const h = pickHideout(w, F);
        check('a hideout is found among the lost worlds', !!h && worlds.some((p: any) => p.id === h.planet.id));
        check('never the old capital while another world remembers them', !!h && h.planet.systemId !== capitalPlanet.systemId);
        check('the one farthest from the old capital', !!h && hex(capSys, w.movement.systems.get(h.planet.systemId)) === far, h?.reason);
        h!.planet.population = 0;
        const next = pickHideout(w, F);
        check('only an inhabited world will hide them', !!next && next.planet.id !== h!.planet.id);

        const w2 = freshWorld();
        const cap: any = [...w2.construction.planets.values()].find((x: any) => x.ownerId === F);
        cap.population = 10;
        tickLostWorlds(w2); w2.nowSeconds += 3600; cap.ownerId = K; tickLostWorlds(w2);
        check('the old capital when it was all they had', pickHideout(w2, F)?.planet.id === cap.id);
        w2.nowSeconds += LOST_WORLD_MEMORY_SECONDS + 1; tickLostWorlds(w2);
        check('nowhere, once every loss has faded', pickHideout(w2, F) === null);
    }

    console.log('\n[3] Who comes with you');
    {
        const w = freshWorld();
        ensureGovernments(w);
        ensureGovernors(w);
        const ctx = { worldName: 'Kessa', conquerorName: 'the Kaer\'Ruun', empireName: 'the Leo-pantheri' };
        const leadersBefore = [...w.leadership.leaders.values()].filter((l: any) => l.factionId === F && l.status === 'active').length;
        const crew = generateCrew(w, F, 'seed-a', ctx);
        check(`four to six people (${crew.length})`, crew.length >= CREW_MIN && crew.length <= CREW_MAX);
        check('each a different role', new Set(crew.map(c => c.role)).size === crew.length);
        const fromLeaders = crew.filter(c => c.fromLeaderId);
        check('the empire\'s own surviving leaders come first', leadersBefore > 0 && fromLeaders.length > 0, `${leadersBefore} leaders`);
        check('everyone is of some people', crew.every(c => typeof c.species === 'string' && c.species.length > 0));
        check('and are missing from its leadership now', fromLeaders.every(c => w.leadership.leaders.get(c.fromLeaderId!)?.status === 'missing'));
        check('everyone has unfinished business, in words', crew.every(c => c.thread.length > 10 && !c.thread.includes('{')));
        check('everyone is alive and free', crew.every(c => c.status === 'free'));
        const again = generateCrew(freshWorld(), F, 'seed-a', ctx);
        check('the same seed gives the same people', JSON.stringify(again.map(c => [c.role, c.thread])) === JSON.stringify(generateCrew(freshWorld(), F, 'seed-a', ctx).map(c => [c.role, c.thread])));
    }

    console.log('\n[4] Into hiding');
    {
        const w = freshWorld();
        ensureGovernments(w);
        empireThenConquest(w, 3);
        const h = pickHideout(w, F)!;
        const cell = exileCellAt(w, h, F);
        const id = seatIdFor(cell);
        const exile = attachExile(w, cell, h, F, id);
        const r = seatCell(w, cell, id, 'Fallen Probe');
        check('the fallen leader holds a seat on the hideout world', r.ok && cell.planetId === h.planet.id && cell.seat?.factionId === id, r.message);
        check('the cell fights for the old empire', /restoration of/.test(cell.cause) && cell.hostFactionId === K);
        check('it starts with a government\'s following, well hidden', cell.strength >= EXILE_START_STRENGTH && cell.safeHouse.concealment >= 0.8);
        check('the leader sees who came with them', !!cell.seatView?.exile && cell.seatView.exile.crew.length === exile.crew.length);
        check('the seat is not among the human empires', !(w.claimedFactionIds ?? []).includes(id));

        const hostShard = JSON.parse(extractFactionShard(w, K));
        const wire = JSON.stringify(scrubOwnerSecrets(hostShard));
        check('the conqueror\'s wire carries no exile, no crew, no seat', !wire.includes('"exile"') && exile.crew.every(c => !wire.includes(c.name)) && !wire.includes(id));
        check('rivals receive no cells at all', !('rebelCells' in projectPublicShard(hostShard, undefined as any)));

        // If the movement wins, the comeback perks arrive with the state.
        cell.formedAtSeconds = w.nowSeconds - 31 * DAY;
        cell.strength = 60;
        const d = declareMovement(w, id);
        check('the exiles can declare like any led movement', d.ok, d.message);
        const crisis: any = w.secessionCrises.get(cell.crisisId!);
        crisis.status = 'escalated';
        crisis.escalatedAtSeconds = w.nowSeconds - 30 * DAY;
        tickMovements(w);
        tickCivilWar(w, 6 * 3600);
        tickMovements(w);
        check('the restored state is theirs', w.economy.factions.has(id) && (w.claimedFactionIds ?? []).includes(id));
        check('and carries the comeback their defeat earned', !!comebackOf(w, id));
    }

    console.log('\n[5] The roads after a fall');
    {
        const seat = code('lib/breakaway/seat-service.ts');
        check('hiding is a lobby request the worker carries out', /if \(payload\.hiding\) return goIntoHiding\(/.test(seat));
        check('only a fallen empire\'s leader may hide', /Only the leader of a fallen empire can go into hiding/.test(seat) && /canHide: verdict\.eligible && verdict\.reason === 'eliminated'/.test(seat));
        check('the lobby offers it', /go-into-hiding/.test(code('components/lobby/BreakawayPanel.tsx')));
        check('the defeat screen points to it', /Go into hiding/.test(code('components/defeat/DefeatOverlay.tsx')));
        for (const f of ['lib/conquest/lost-worlds.ts', 'components/underground/UndergroundShell.tsx', 'components/lobby/BreakawayPanel.tsx']) {
            const imps = [...code(f).matchAll(/from '([^']+)'/g)].map(m => m[1]);
            check(`${f.split('/').pop()} stays browser-safe`, !imps.some(i => /exile-service|underground-service|movement-service|sponsor-service|cell-service|case-board|government|politics/.test(i)), imps.join(', '));
        }
    }

    // ── 14b: jobs ────────────────────────────────────────────────────────────
    const JS = await import('../lib/fallen/job-service');
    const { JOBS, JOB_BY_ID, checkChance, oddsWord } = await import('../lib/fallen/jobs');
    const { commitAct } = await import('../lib/rebellion/sponsor-service');
    const { ensureCases } = await import('../lib/espionage/case-board');
    const UG = await import('../lib/rebellion/underground-service');
    /** A fallen leader in hiding, ready for a job. Deterministic for the same world. */
    const hidden = () => {
        const w = freshWorld();
        ensureGovernments(w);
        empireThenConquest(w, 3);
        const h = pickHideout(w, F)!;
        const cell: any = exileCellAt(w, h, F, () => 0.5);
        const id = seatIdFor(cell);
        attachExile(w, cell, h, F, id);
        seatCell(w, cell, id, 'Fallen Probe');
        cell.strength = 40;
        cell.nextActAtSeconds = 0;
        const host = cell.hostFactionId;
        w.economy.factions.get(host).reserves.CREDITS = 400_000;
        return { w, cell, id, host };
    };
    const credits = (w: any, id: string) => Number(w.economy.factions.get(id).reserves.CREDITS);
    /** A seed whose rolls at these steps all fall below (or, with `fail`, above) the given chance. */
    const seedWhere = (steps: number[], test: (roll: number) => boolean) => {
        for (let i = 0; i < 20000; i++) { const s = `probe-${i}`; if (steps.every(k => test(JS.rollFor(s, k)))) return s; }
        throw new Error('no seed');
    };
    const play = (w: any, cell: any, choices: string[]) => choices.map(c => JS.chooseInJob(w, cell, c));

    console.log('\n[6] Jobs: the same seed plays the same way');
    {
        const runOnce = () => {
            const { w, cell } = hidden();
            const crew = cell.exile.crew.slice(0, 3).map((c: any) => c.id);
            JS.startJob(w, cell, 'payroll', crew);
            cell.job.seed = 'fixed-seed';
            play(w, cell, ['pass', 'crack', 'quiet', 'talk', 'run']);
            return { story: cell.job.story.join('\n'), status: cell.job.status };
        };
        const a = runOnce(), b = runOnce();
        check('the same seed and choices give the same story', a.story === b.story && a.status === b.status && a.story.length > 0, a.status);
        check('and the job ends', a.status !== 'running');
    }

    console.log('\n[7] Jobs: the page cannot write the outcome');
    {
        const { w, cell, id } = hidden();
        check('no job, no choice', !JS.chooseInJob(w, cell, 'pass').ok);
        JS.startJob(w, cell, 'payroll', [cell.exile.crew[0].id]);
        check('a choice from another scene is refused', !JS.chooseInJob(w, cell, 'crack').ok);
        check('a made-up choice is refused', !JS.chooseInJob(w, cell, 'success').ok && cell.job.step === 0);
        check('the worker reads only the choice id', /orderJobChoice\(world, factionId, payload\?\.choiceId\)/.test(code('scripts/game-loop.ts')));
        check('someone who leads no cell plays no job', !UG.orderJobChoice(w, 'rebel-faction-underground-nobody', 'pass').ok);
        check('the leader\'s order reaches the job', UG.orderJobChoice(w, id, 'pass').ok && cell.job.step === 1);
    }

    console.log('\n[8] Jobs: a job that works is the act, exactly');
    {
        // Every check passes: the best skill is high, cover is deep, and the seed rolls low.
        const prime = (cell: any) => { for (const c of cell.exile.crew) for (const k of Object.keys(c.skills)) c.skills[k] = 5; cell.safeHouse.concealment = 0.95; };
        const jobWorld = hidden();
        prime(jobWorld.cell);
        const before = credits(jobWorld.w, jobWorld.host);
        const filesBefore = [...ensureCases(jobWorld.w).values()].filter((k: any) => k.cellId === jobWorld.cell.id).length;
        const bondsBefore = jobWorld.cell.exile.crew.slice(0, 3).map((c: any) => c.bond);
        JS.startJob(jobWorld.w, jobWorld.cell, 'payroll', jobWorld.cell.exile.crew.slice(0, 3).map((c: any) => c.id));
        jobWorld.cell.job.seed = seedWhere([0, 1, 2], r => r < 0.9);
        play(jobWorld.w, jobWorld.cell, ['pass', 'crack', 'quiet']);
        check('the job worked', jobWorld.cell.job.status === 'success', jobWorld.cell.job.story.join(' / '));
        const jobTook = before - credits(jobWorld.w, jobWorld.host);

        const actWorld = hidden();
        prime(actWorld.cell);
        const before2 = credits(actWorld.w, actWorld.host);
        commitAct(actWorld.w, actWorld.cell, 'heist', []);
        const actTook = before2 - credits(actWorld.w, actWorld.host);
        check('it took from the conqueror exactly what a heist takes', jobTook > 0 && jobTook === actTook, `${jobTook} vs ${actTook}`);
        check('it counts as one act', jobWorld.cell.actsCommitted === actWorld.cell.actsCommitted);
        check('and the conqueror has a file on it', [...ensureCases(jobWorld.w).values()].filter((k: any) => k.cellId === jobWorld.cell.id).length === filesBefore + 1);
        check('the crew on it grew closer', jobWorld.cell.exile.crew.slice(0, 3).every((c: any, i: number) => c.bond >= Math.min(100, bondsBefore[i] + JS.BOND_PER_SUCCESS)));
        check('the next job waits', !!JS.jobBlocker(jobWorld.w, jobWorld.cell, JOB_BY_ID.payroll));
    }

    console.log('\n[9] Jobs: a job that fails takes nothing and costs us');
    {
        const { w, cell, host } = hidden();
        const before = credits(w, host), cover = cell.safeHouse.concealment, strength = cell.strength;
        JS.startJob(w, cell, 'payroll', [cell.exile.crew[0].id]);
        cell.job.seed = seedWhere([1], r => r > 0.96);
        play(w, cell, ['pass', 'crack', 'run']);
        check('it failed', cell.job.status === 'failure', cell.job.story.join(' / '));
        check('nothing was taken', credits(w, host) === before);
        check('it cost cover and strength', cell.safeHouse.concealment < cover && cell.strength < strength);
    }

    console.log('\n[10] Jobs: who may go, and when');
    {
        const { w, cell } = hidden();
        const ids = cell.exile.crew.map((c: any) => c.id);
        check('a job takes no more than it can', !JS.startJob(w, cell, 'broadcast', ids.slice(0, 3)).ok);
        cell.exile.crew[0].status = 'wounded';
        check('only someone free can go', !JS.startJob(w, cell, 'payroll', [ids[0]]).ok);
        check('nobody from outside the crew', !JS.startJob(w, cell, 'payroll', ['companion-stranger']).ok);
        check('a job can start', JS.startJob(w, cell, 'payroll', [ids[1]]).ok);
        check('one job at a time', !JS.startJob(w, cell, 'broadcast', [ids[2]]).ok);
        const plain = (() => { const x = hidden(); x.cell.exile = null; return x; })();
        check('a cell without a crew takes no jobs', !!JS.jobBlocker(plain.w, plain.cell, JOB_BY_ID.payroll));
        check('every job lands as a cell act', JOBS.every(j => ['heist', 'prison_break', 'propaganda', 'sabotage', 'assassination', 'hijack'].includes(j.act)));
        check('every choice leads somewhere real', JOBS.every(j => Object.values(j.scenes).every(s => s.choices.every(c =>
            [c.success, c.failure].filter(Boolean).every((st: any) => ['success', 'partial', 'failure'].includes(st.next) || !!j.scenes[st.next])))));
    }

    console.log('\n[11] Jobs: odds are words, and the conqueror sees none of it');
    {
        const bands = ['long odds', 'against us', 'a coin toss', 'good odds', 'near certain'];
        const idx = Array.from({ length: 101 }, (_, i) => bands.indexOf(oddsWord(i / 100)));
        check('the words climb with the chance', idx.every((v, i) => v >= 0 && (i === 0 || v >= idx[i - 1])));
        check('the easiest check with the best crew reads near certain', oddsWord(checkChance('easy', 5, 0.95)) === 'near certain');
        const { w, cell, host } = hidden();
        JS.startJob(w, cell, 'payroll', [cell.exile.crew[0].id]);
        UG.refreshSeatView(w, cell);
        const view = JSON.stringify(cell.seatView!.job);
        check('the leader sees choices with odds words', cell.seatView!.job!.choices.some((c: any) => !!c.odds && bands.includes(c.odds)));
        check('and never a number', !/\d\s*%/.test(view) && !/0\.\d/.test(view));
        cell.safeHouse.knownToFactionIds.push(host); // found: so the cell itself is on the wire
        const wire = scrubOwnerSecrets(JSON.parse(extractFactionShard(w, host)));
        const onWire = wire.rebelCells.find((c: any) => c.id === cell.id);
        check('the conqueror\'s wire carries no job', !!onWire && !('job' in onWire) && !('jobsRun' in onWire));
        check('jobs are registered and handled', /REB_JOB_START/.test(code('lib/actions/registry.ts')) && /case 'REB_JOB_CHOOSE'/.test(code('scripts/game-loop.ts')));
        for (const f of ['lib/fallen/jobs.ts', 'components/underground/UndergroundShell.tsx']) {
            const imps = [...code(f).matchAll(/from '([^']+)'/g)].map(m => m[1]);
            check(`${f.split('/').pop()} stays browser-safe`, !imps.some(i => /job-service|exile-service|underground-service|sponsor-service|cell-service|case-board|government|politics/.test(i)), imps.join(', '));
        }
    }

    // ── 14c: planning, heists and hijacks ───────────────────────────────────
    const J = await import('../lib/fallen/jobs');
    const { ensurePiracyState } = await import('../lib/piracy/organization-service').catch(() => ({ ensurePiracyState: null as any }));
    /** A squadron of the conqueror resting in the hideout's system. */
    const addFleet = (w: any, cell: any, composition: Record<string, number> = { corvette: 2, frigate: 1 }, extra: any = {}) => {
        const id = `fleet-probe-${Object.keys(w.movement.fleets).length}-${Math.floor(Math.random() * 1e6)}`;
        w.movement.fleets.set(id, { id, factionId: cell.hostFactionId, name: 'Third Picket', currentSystemId: cell.systemId, destinationSystemId: null, composition: { ...composition }, basePower: 200, strength: 1, orders: [], plannedPath: [], ...extra });
        return w.movement.fleets.get(id);
    };
    const shipsIn = (f: any) => Object.values(f.composition).reduce((n: number, v: any) => n + Number(v), 0);
    const primeCrew = (cell: any) => { for (const c of cell.exile.crew) for (const k of Object.keys(c.skills)) c.skills[k] = 5; cell.safeHouse.concealment = 0.95; };

    console.log('\n[12] Targets from the real galaxy');
    {
        const { w, cell } = hidden();
        const near = addFleet(w, cell);
        addFleet(w, cell, { corvette: 2 }, { destinationSystemId: 'elsewhere' });
        addFleet(w, cell, { corvette: 1 });
        const far = [...w.movement.systems.values()].find((s: any) => s.id !== cell.systemId && !(w.movement.systems.get(cell.systemId).hyperlaneNeighbors ?? []).includes(s.id));
        addFleet(w, cell, { corvette: 3 }, { currentSystemId: far.id });
        const fleets = JS.targetsFor(w, cell, J.JOB_BY_ID.cutter);
        check('a resting squadron in reach is a target', fleets.some(t => t.id === near.id));
        check('one under way, one too small, one too far are not', fleets.length === 1, fleets.map(t => t.label).join(' | '));
        const worlds = JS.targetsFor(w, cell, J.JOB_BY_ID.vault);
        check('the conqueror\'s worlds in reach are targets', worlds.length > 0 && worlds.every(t => w.construction.planets.get(t.id)?.ownerId === cell.hostFactionId));
        check('a broadcast needs no target', JS.targetsFor(w, cell, J.JOB_BY_ID.broadcast).length === 0 && !JS.jobBlocker(w, cell, J.JOB_BY_ID.broadcast));
    }

    console.log('\n[13] The plan: watches, gear, parts and approach');
    {
        const { w, cell } = hidden();
        const fleet = addFleet(w, cell);
        const crew = cell.exile.crew.map((c: any) => c.id);
        check('a target out of reach is refused', !JS.setPlan(w, cell, { jobId: 'cutter', targetId: 'fleet-nowhere', crewIds: [crew[0]] }).ok);
        check('too many people are refused', !JS.setPlan(w, cell, { jobId: 'cutter', targetId: fleet.id, crewIds: crew.slice(0, 4) }).ok);
        check('a big job needs a plan', !JS.startJob(w, cell, 'cutter', [crew[0]]).ok);
        const set = JS.setPlan(w, cell, { jobId: 'cutter', targetId: fleet.id, approach: 'inside', crewIds: crew.slice(0, 3), roles: { tech: crew[1], talk: crew[0], piloting: 'stranger' } });
        check('a plan is set', set.ok && cell.plan?.targetId === fleet.id, set.message);
        check('parts go only to people on the job', cell.plan!.roles.tech === crew[1] && !cell.plan!.roles.piloting);
        check('an inside man needs a watch first', !JS.startJob(w, cell, 'cutter', []).ok);
        const cover = cell.safeHouse.concealment;
        check('someone goes to watch', JS.startRecon(w, cell, crew[3] ?? crew[2]).ok && cell.safeHouse.concealment < cover);
        check('one watch at a time', !JS.startRecon(w, cell, crew[0]).ok);
        check('no job while the watcher is out', !JS.startJob(w, cell, 'cutter', []).ok);
        w.nowSeconds += J.RECON_SECONDS - 60;
        check('the watch takes its time', JS.tickRecon(w, cell) === null && cell.plan!.recon === 0);
        w.nowSeconds += 120;
        check('then the watcher reports', !!JS.tickRecon(w, cell) && cell.plan!.recon === 1);
        cell.treasury = 100;
        check('gear costs the movement\'s own money', !JS.buyGear(w, cell, 'slicer').ok);
        cell.treasury = 5000;
        const full = JS.gearPrice(w, cell, 'slicer');
        check('gear is bought', JS.buyGear(w, cell, 'slicer').ok && cell.treasury === 5000 - full.price && cell.plan!.gear.includes('slicer'));
        check('changing the crew keeps the watch and the gear on the same target', JS.setPlan(w, cell, { jobId: 'cutter', targetId: fleet.id, approach: 'inside', crewIds: crew.slice(0, 2), roles: { talk: crew[0] } }).ok && cell.plan!.recon === 1 && cell.plan!.gear.includes('slicer'));
        const piracy: any = (w as any).piracy;
        if (piracy?.blackMarkets instanceof Map) {
            piracy.blackMarkets.set('probe-market', { id: 'probe-market', systemId: cell.systemId });
            check('a black market in the system sells cheaper', JS.gearPrice(w, cell, 'skiff').price === Math.round(800 * J.BLACK_MARKET_DISCOUNT) && JS.gearPrice(w, cell, 'skiff').blackMarket);
        }
        check('a plan makes the odds better', J.planBonus('tech', { approach: 'inside', recon: 2, gear: ['slicer'], hasRole: true }) > 0.2
            && J.planBonus('violence', { approach: 'quiet' }) < 0);
        check('the vault needs two watches', JS.setPlan(w, cell, { jobId: 'vault', targetId: JS.targetsFor(w, cell, J.JOB_BY_ID.vault)[0].id, crewIds: [crew[0]] }).ok && !JS.startJob(w, cell, 'vault', []).ok);
    }

    console.log('\n[14] The vault: a planned heist takes from the target\'s owner, many times over');
    {
        const run = (direct: boolean) => {
            const x = hidden();
            primeCrew(x.cell);
            const before = credits(x.w, x.host);
            if (direct) { commitAct(x.w, x.cell, 'heist', []); return { took: before - credits(x.w, x.host), x }; }
            const target = JS.targetsFor(x.w, x.cell, J.JOB_BY_ID.vault)[0];
            const crew = x.cell.exile.crew.slice(0, 4).map((c: any) => c.id);
            JS.setPlan(x.w, x.cell, { jobId: 'vault', targetId: target.id, approach: 'quiet', crewIds: crew });
            x.cell.plan.recon = 2;
            const started = JS.startJob(x.w, x.cell, 'vault', []);
            if (!started.ok) throw new Error(started.message);
            x.cell.job.seed = seedWhere([0, 1, 2], r => r < 0.9);
            play(x.w, x.cell, ['march', 'lock', 'lift']);
            return { took: before - credits(x.w, x.host), x };
        };
        const vault = run(false), heist = run(true);
        check('the vault job worked', vault.x.cell.job.status === 'success', vault.x.cell.job.story.join(' / '));
        check('it took from the target world\'s owner', vault.took > 0);
        check(`six times what a raid takes (${vault.took} vs ${heist.took})`, Math.abs(vault.took - heist.took * 6) <= 6);
        check('the plan is spent', !vault.x.cell.plan);
    }

    console.log('\n[15] The cutter: a hijacked ship leaves their fleet for our dock');
    {
        const { w, cell, host } = hidden();
        primeCrew(cell);
        const fleet = addFleet(w, cell, { frigate: 1, corvette: 2 });
        const crew = cell.exile.crew.slice(0, 3).map((c: any) => c.id);
        JS.setPlan(w, cell, { jobId: 'cutter', targetId: fleet.id, approach: 'quiet', crewIds: crew });
        JS.startJob(w, cell, 'cutter', []);
        cell.job.seed = seedWhere([0, 1, 2], r => r < 0.9);
        const files = [...ensureCases(w).values()].filter((k: any) => k.cellId === cell.id).length;
        play(w, cell, ['slip', 'override', 'run']);
        check('the hijacking worked', cell.job.status === 'success', cell.job.story.join(' / '));
        check('a ship left the conqueror\'s fleet', shipsIn(fleet) === 2);
        check('the smallest, as the quietest to take', fleet.composition.corvette === 1 && fleet.composition.frigate === 1);
        check('and lies in our hidden dock', cell.exile.dock?.length === 1 && cell.exile.dock[0].shipClass === 'corvette' && cell.exile.dock[0].takenFromFactionId === host);
        check('the conqueror has a file on it', [...ensureCases(w).values()].filter((k: any) => k.cellId === cell.id).length === files + 1);

        const gone = hidden();
        primeCrew(gone.cell);
        const f2 = addFleet(gone.w, gone.cell, { corvette: 2 });
        JS.setPlan(gone.w, gone.cell, { jobId: 'cutter', targetId: f2.id, approach: 'quiet', crewIds: [gone.cell.exile.crew[0].id] });
        JS.startJob(gone.w, gone.cell, 'cutter', []);
        gone.cell.job.seed = seedWhere([0, 1, 2], r => r < 0.9);
        f2.composition = { corvette: 1 };
        play(gone.w, gone.cell, ['slip', 'override', 'run']);
        check('a ship that is no longer there cannot be taken', gone.cell.job.status === 'failure' && !(gone.cell.exile.dock?.length));

        // The movement wins: the dock sails as the new state's squadron.
        cell.formedAtSeconds = w.nowSeconds - 31 * DAY;
        cell.strength = 60;
        cell.nextActAtSeconds = 0;
        UG.declareMovement(w, cell.seat.factionId);
        const crisis: any = w.secessionCrises.get(cell.crisisId);
        crisis.status = 'escalated';
        crisis.escalatedAtSeconds = w.nowSeconds - 30 * DAY;
        const state = cell.seat.factionId;
        tickMovements(w); tickCivilWar(w, 6 * 3600); tickMovements(w);
        const docked: any = [...w.movement.fleets.values()].find((f: any) => f.factionId === state && f.name === 'The Hidden Dock');
        check('the hidden dock sails for the state the movement won', !!docked && docked.composition.corvette === 1);
    }

    console.log('\n[16] What a job leaves behind goes on the conqueror\'s file');
    {
        const { w, cell, host } = hidden();
        primeCrew(cell);
        cell.treasury = 5000;
        const fleet = addFleet(w, cell);
        const crew = cell.exile.crew.slice(0, 3).map((c: any) => c.id);
        JS.setPlan(w, cell, { jobId: 'cutter', targetId: fleet.id, approach: 'loud', crewIds: crew, roles: { violence: crew[0] } });
        JS.buyGear(w, cell, 'weapons');
        JS.startJob(w, cell, 'cutter', []);
        // Force the storm to go wrong: a witness. The rest goes right.
        cell.job.seed = (() => { for (let i = 0; i < 20000; i++) { const s = `t-${i}`; if (JS.rollFor(s, 0) > 0.96 && JS.rollFor(s, 1) < 0.9 && JS.rollFor(s, 2) < 0.9) return s; } throw new Error('seed'); })();
        play(w, cell, ['storm', 'override', 'run']);
        check('the loud job still worked', cell.job.status === 'success' || cell.job.status === 'partial', cell.job.status);
        const file: any = [...ensureCases(w).values()].find((k: any) => k.cellId === cell.id);
        const texts = [...(file?.clues ?? []), ...(file?.pendingClues ?? [])].map((c: any) => c.text);
        check('the cameras saw it', texts.some(t => /Security cameras/.test(t)));
        check('a witness describes one of us', texts.some(t => /Witnesses at .* describe/.test(t)));
        check('a weapon was left behind', texts.some(t => /weapon was left behind/.test(t)));
        check('and someone heard the old empire named', texts.some(t => /as if it still stood/.test(t)));
        const wire = scrubOwnerSecrets(JSON.parse(extractFactionShard(w, host)));
        const onWire = wire.rebelCells.find((c: any) => c.id === cell.id);
        check('the conqueror sees the clues but never the plan', !!file && !!onWire && !('plan' in onWire) && !('job' in onWire));
        check('planning orders are registered and handled', ['REB_JOB_PLAN', 'REB_JOB_RECON', 'REB_JOB_GEAR'].every(a => code('lib/actions/registry.ts').includes(a) && code('scripts/game-loop.ts').includes(`case '${a}'`)));
        check('watches report on the strategic tick', /tickRecon\(world, c\)/.test(code('lib/rebellion/underground-service.ts')));
        void ensurePiracyState;
    }

    // ── 14d: the crew lives and dies ────────────────────────────────────────
    const CS = await import('../lib/fallen/crew-service');
    const chronicle = await import('../lib/narrative/chronicle');
    /** A seed whose rolls pass (true) or fail (false) step by step. */
    const seedPath = (pattern: boolean[]) => {
        for (let i = 0; i < 50000; i++) {
            const s = `path-${i}`;
            if (pattern.every((pass, k) => pass ? JS.rollFor(s, k) < 0.9 : JS.rollFor(s, k) > 0.96)) return s;
        }
        throw new Error('no seed for ' + pattern.join(','));
    };
    const byId = (cell: any, id: string) => cell.exile.crew.find((c: any) => c.id === id);

    console.log('\n[17] The dead stay dead');
    {
        const { w, cell } = hidden();
        primeCrew(cell);
        const target = JS.targetsFor(w, cell, J.JOB_BY_ID.vault)[0];
        const crew = cell.exile.crew.slice(0, 4).map((c: any) => c.id);
        const holder = crew[2];
        JS.setPlan(w, cell, { jobId: 'vault', targetId: target.id, approach: 'quiet', crewIds: crew, roles: { violence: holder } });
        cell.plan.recon = 2;
        JS.startJob(w, cell, 'vault', []);
        cell.job.seed = seedPath([true, false, false]);
        chronicle.resetChronicleBuffer();
        play(w, cell, ['march', 'lock']);
        UG.refreshSeatView(w, cell);
        const hold = cell.seatView.job.choices.find((c: any) => c.id === 'hold');
        check('a sacrifice says what it may cost before it is chosen', !!hold?.risk && hold.risk.includes(byId(cell, holder).name), hold?.risk);
        play(w, cell, ['hold']);
        const dead = byId(cell, holder);
        check('whoever held the stairs is dead', dead.status === 'dead' && !!dead.diedAtSeconds);
        check('and remembered', cell.exile.memorial?.some((m: any) => m.name === dead.name && m.epitaph.length > 10));
        check('the press reports a rebel killed, not who', (chronicle.drainBuffer().rows as any[]).some(r => r.type === 'rebel_killed' && !r.facts.includes(dead.name)));
        for (let t = 0; t < 50; t++) { w.nowSeconds += 6 * 3600; CS.tickCrew(w, cell, () => 0.5); }
        CS.rescueCaptured(w, cell);
        check('time, healing and prison breaks do not bring them back', dead.status === 'dead');
        cell.nextActAtSeconds = 0;
        check('the dead go on no job', !JS.setPlan(w, cell, { jobId: 'broadcast', crewIds: [holder] }).ok);
        UG.refreshSeatView(w, cell);
        check('the leader sees them gone', cell.seatView.exile.crew.find((c: any) => c.id === holder)?.status === 'dead');
    }

    console.log('\n[18] Taken: a prisoner of the conqueror, who may talk');
    {
        const { w, cell, host } = hidden();
        commitAct(w, cell, 'propaganda', []); // the conqueror already has a file on the cell
        cell.nextActAtSeconds = 0;
        const talker = cell.exile.crew[0].id;
        JS.startJob(w, cell, 'payroll', [talker]);
        cell.job.seed = seedPath([true, false, false]);
        play(w, cell, ['pass', 'crack', 'talk']);
        const taken = byId(cell, talker);
        check('the one who talked to the sergeant is taken', taken.status === 'captured', cell.job.story.join(' / '));
        const prisoners = w.espionage.factionIntel.get(host)?.prisoners ?? [];
        const rec = prisoners.find((p: any) => p.agentId === talker);
        check('and is among the conqueror\'s prisoners', !!rec && rec.codename === taken.name);
        check('saying they serve the old empire', rec?.claimedEmployerId === F);
        check('the conqueror now knows the cell exists', cell.safeHouse.knownToFactionIds.includes(host));
        CS.tickCrew(w, cell, () => 0.99);
        check('a prisoner may hold out', !taken.broke);
        const cover = cell.safeHouse.concealment;
        CS.tickCrew(w, cell, () => 0);
        const file: any = [...ensureCases(w).values()].find((k: any) => k.cellId === cell.id && k.status === 'open');
        const testimony = (file?.pendingClues ?? []).find((c: any) => c.source === 'interrogation');
        check('or break', taken.broke === true);
        check('and their testimony names the cell', !!testimony && testimony.text.includes(cell.name) && testimony.text.includes(taken.name), testimony?.text);
        check('the next crackdown knows where to look', (cell.informedUntilSeconds ?? 0) > w.nowSeconds && cell.safeHouse.concealment < cover);
        const before = cell.seatView ? 1 : 0; void before;

        // A prison break brings them home.
        cell.nextActAtSeconds = 0;
        const crew = cell.exile.crew.filter((c: any) => c.status === 'free').slice(0, 2).map((c: any) => c.id);
        JS.startJob(w, cell, 'detention', crew);
        cell.job.seed = seedPath([true, true]);
        play(w, cell, ['papers', 'all']);
        check('the detention job worked', cell.job.status === 'success', cell.job.story.join(' / '));
        check('the prisoner is home, hurt', taken.status === 'wounded');
        check('and off the conqueror\'s books', !(w.espionage.factionIntel.get(host)?.prisoners ?? []).some((p: any) => p.agentId === talker));
        check('the story says so', cell.job.story.some((s: string) => s.includes(taken.name) && /home/.test(s)));
    }

    console.log('\n[19] Wounds');
    {
        const { w, cell } = hidden();
        const c = cell.exile.crew[0];
        CS.woundCompanion(w, c);
        check('the wounded go on no job', !JS.setPlan(w, cell, { jobId: 'broadcast', crewIds: [c.id] }).ok);
        w.nowSeconds += CS.WOUND_SECONDS - 60;
        CS.tickCrew(w, cell, () => 0.5);
        check('wounds take their time', c.status === 'wounded');
        w.nowSeconds += 120;
        CS.tickCrew(w, cell, () => 0.5);
        check('then heal', c.status === 'free');
    }

    console.log('\n[20] Unfinished business');
    {
        const { w, cell } = hidden();
        primeCrew(cell);
        const c = cell.exile.crew[0];
        c.threadId = 'sister'; c.threadResolved = false;
        const bond = c.bond, loyalty = c.loyalty;
        JS.startJob(w, cell, 'detention', [c.id]);
        cell.job.seed = seedPath([true, true]);
        play(w, cell, ['papers', 'all']);
        check('the right job settles a companion\'s thread', c.threadResolved === true && cell.job.story.some((s: string) => s.includes(c.name) && /sister/.test(s)));
        check('and binds them closer', c.bond >= Math.min(100, bond + CS.THREAD_BOND) && c.loyalty > loyalty);
        const forger = cell.exile.crew[1];
        forger.threadId = 'identity'; forger.identityUsed = false;
        check('a forged identity is good for one walk-in', CS.crewCheckModifier([forger], 'infiltration', true) === CS.IDENTITY_BONUS && CS.crewCheckModifier([forger], 'infiltration', true) === 0);
    }

    console.log('\n[21] Betrayal');
    {
        const { w, cell, host } = hidden();
        const c = cell.exile.crew[0];
        c.loyalty = 10;
        cell.safeHouse.knownToFactionIds = cell.safeHouse.knownToFactionIds.filter((id: string) => id !== host);
        CS.tickCrew(w, cell, () => 0);
        check('loyalty that runs out may turn', c.turned === true);
        check('the conqueror\'s handler knows where the cell is', cell.safeHouse.knownToFactionIds.includes(host) && (cell.informedUntilSeconds ?? 0) > w.nowSeconds);
        UG.refreshSeatView(w, cell);
        check('the leader cannot see who turned', !JSON.stringify(cell.seatView).includes('"turned"'));
        check('a traitor on a job makes every check worse', CS.crewCheckModifier([c], 'tech', false) === -CS.TRAITOR_PENALTY);
        const lines = CS.crewAfterJob(w, cell, { crewIds: [c.id], jobId: 'payroll' } as any, 'failure', () => 0);
        check('and may be found out, and gone', c.status === 'gone' && lines.some(l => l.includes(c.name)));
        check('the conqueror\'s wire never carries the crew', !JSON.stringify(scrubOwnerSecrets(JSON.parse(extractFactionShard(w, host)))).includes(c.name));
    }

    console.log('\n[22] Loyalty moves with what happens');
    {
        const { w, cell } = hidden();
        const c = cell.exile.crew[0];
        const l0 = c.loyalty;
        CS.crewAfterJob(w, cell, { crewIds: [c.id], jobId: 'broadcast' } as any, 'failure', () => 0.99);
        check('a failed job costs loyalty', c.loyalty === Math.max(0, l0 - 5));
        CS.crewAfterJob(w, cell, { crewIds: [c.id], jobId: 'broadcast' } as any, 'success', () => 0.99);
        check('a job that works earns some back', c.loyalty === Math.max(0, l0 - 5) + 3);
        const other = cell.exile.crew[1];
        const lo = other.loyalty, bo = other.bond;
        CS.killCompanion(w, cell, cell.exile.crew[2], 'Killed covering the escape.');
        check('a death costs the others some nerve and binds them closer', other.loyalty === Math.max(0, lo - 4) && other.bond === Math.min(100, bo + 2));
        check('the crew service stays out of the browser', !/crew-service/.test(code('components/underground/UndergroundShell.tsx')));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
