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

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
