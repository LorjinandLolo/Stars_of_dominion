// scripts/rebellion-probe.ts
// Probe: rebel cells, phase 13a (the oppression loop). Spec Item 13.
//
//   npx tsx scripts/rebellion-probe.ts

import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld, extractFactionShard, injectFactionShard, cleanWorldForSave } from '../lib/persistence/save-service';
import { scrubOwnerSecrets, projectPublicShard } from '../lib/persistence/shard-privacy';
import {
    ensureRebellion, grievanceOf, tickRebellion, crackdown, crackdownBlocker, revealCellsBySweep, knownCellsFor, formCell,
    FORM_THRESHOLD, CRACKDOWN_OPPRESSION, CRACKDOWN_UNREST,
} from '../lib/rebellion/cell-service';
import { ACTION_DEFINITIONS } from '../lib/actions/registry';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');

const V = 'faction-vektori';
const A = 'faction-aurelian';
const SEASON_TICKS = 1260;

function freshWorld(): any {
    const w: any = deserializeWorld(serializeWorld(getGameWorldState()));
    w.claimedFactionIds = [A, V];
    ensureRebellion(w).cells.clear();
    ensureRebellion(w).crackdowns.clear();
    return w;
}
const worldOf = (w: any, owner: string) => [...w.construction.planets.values()].find((p: any) => p.ownerId === owner);
const oppression = (w: any, id: string) => Number(w.reputation?.get?.(id)?.scores?.oppression ?? 0);

/** Make a world miserable: unrest, an unhappy bloc, a government known for oppression. */
function oppress(w: any, owner: string, planet: any) {
    planet.unrest = 85;
    // A fresh world has no blocs until its first political tick; give it one.
    if (!(w.movement.empirePostures instanceof Map)) w.movement.empirePostures = new Map();
    if (!w.movement.empirePostures.get(owner)?.blocs?.length) {
        w.movement.empirePostures.set(owner, { ...(w.movement.empirePostures.get(owner) ?? {}), blocs: [{ id: 'trade', name: 'Merchants', influence: 50, satisfaction: 15, trend: 0 }] });
    }
    const posture = w.movement.empirePostures?.get?.(owner);
    for (const b of posture?.blocs ?? []) b.satisfaction = 15;
    const rep = w.reputation?.get?.(owner);
    if (rep) rep.scores.oppression = 70;
    else w.reputation?.set?.(owner, { factionId: owner, scores: { aggression: 0, reliability: 100, deception: 0, tradeInfluence: 0, oppression: 70, honor: 50 }, derivedTags: [], history: [] });
}
function pacify(w: any, owner: string, planet: any) {
    planet.unrest = 0;
    const posture = w.movement.empirePostures?.get?.(owner);
    for (const b of posture?.blocs ?? []) b.satisfaction = 90;
    const rep = w.reputation?.get?.(owner);
    if (rep) rep.scores.oppression = 0;
}

async function main() {
    console.log('\n[1] Grievance');
    {
        const w = freshWorld();
        const p = worldOf(w, V);
        pacify(w, V, p);
        const calm = grievanceOf(w, p);
        oppress(w, V, p);
        const angry = grievanceOf(w, p);
        check('a content world is below the threshold', calm.score < FORM_THRESHOLD, `${calm.score}`);
        check('an oppressed world is above it', angry.score > FORM_THRESHOLD, `${angry.score}`);
        check('and names the bloc it is angriest about', !!angry.blocName, angry.blocName ?? 'none');
    }

    console.log('\n[2] An oppressed world grows a cell within a season; a prosperous one grows none');
    {
        const w = freshWorld();
        const sad = worldOf(w, V);
        const glad = worldOf(w, A);
        oppress(w, V, sad);
        pacify(w, A, glad);
        let formedAt = -1;
        for (let t = 0; t < SEASON_TICKS; t++) {
            w.nowSeconds += 6 * 3600;
            sad.unrest = 85; glad.unrest = 0; // hold the conditions steady
            const formed = tickRebellion(w);
            if (formedAt < 0 && formed.some(c => c.planetId === sad.id)) formedAt = t;
        }
        const cells = [...ensureRebellion(w).cells.values()];
        check('a cell forms on the oppressed world', formedAt >= 0, `${cells.length} cells`);
        check(`within the season (tick ${formedAt} of ${SEASON_TICKS})`, formedAt >= 0 && formedAt < SEASON_TICKS);
        check('none on the prosperous world', !cells.some(c => c.planetId === glad.id));
        const cell = cells.find(c => c.planetId === sad.id && c.status === 'active');
        check('the cell grows while grievance holds', !!cell && cell.strength > 50, `${cell?.strength}`);
        check('and is compartmented into members', !!cell && cell.members > 3);
        check('its cause is the angry bloc on that world', !!cell && cell.cause.includes(sad.name), cell?.cause);
        check('its hideout is a pirate safe house', cell?.safeHouse.kind === 'safe_house');
        check('cells are not pirate bands', ![...(w.piracy?.organizations?.values?.() ?? [])].some((o: any) => o.id === cell?.id));

        // Prosperity starves it.
        pacify(w, V, sad);
        for (let t = 0; t < 400; t++) { w.nowSeconds += 6 * 3600; sad.unrest = 0; tickRebellion(w); }
        check('a world made content starves its cell to nothing', cell?.status === 'dissolved', cell?.status);
    }

    console.log('\n[3] Crackdowns: they work, and they cost');
    {
        const w = freshWorld();
        const p = worldOf(w, V);
        oppress(w, V, p);
        const g = grievanceOf(w, p);
        const cell = formCell(w, p, g, () => 0.5);
        cell.strength = 60;
        check('the host does not know of it yet', knownCellsFor(w, V).length === 0);
        const opp0 = oppression(w, V);
        const unrest0 = p.unrest;
        const g0 = grievanceOf(w, p).score;
        const res = crackdown(w, V, p.id, () => 0); // certain to find it
        check('a crackdown goes ahead', res.ok, res.message);
        check('it hits the cell hard', cell.strength <= 60 - 35, `${cell.strength}`);
        check('and finds it', knownCellsFor(w, V).some(c => c.id === cell.id));
        check(`oppression rises by ${CRACKDOWN_OPPRESSION}`, oppression(w, V) >= opp0 + CRACKDOWN_OPPRESSION - 1e-9, `${opp0} -> ${oppression(w, V)}`);
        check(`the world's unrest rises by ${CRACKDOWN_UNREST}`, p.unrest === Math.min(100, unrest0 + CRACKDOWN_UNREST));
        check('so grievance, which recruits, goes up', grievanceOf(w, p).score > g0);
        check('a second crackdown waits for the cooldown', !crackdown(w, V, p.id).ok);
        check('and the blocker says why', !!crackdownBlocker(w, V, p.id));
        check('nobody cracks down on someone else\'s world', !!crackdownBlocker(w, A, p.id));

        // An unfound cell takes a glancing blow.
        const w2 = freshWorld();
        const p2 = worldOf(w2, V);
        oppress(w2, V, p2);
        const c2 = formCell(w2, p2, grievanceOf(w2, p2), () => 0.5);
        c2.strength = 40;
        crackdown(w2, V, p2.id, () => 0.99); // fails to find it
        check('a cell the crackdown misses still loses some strength', c2.strength === 40 - 15 && knownCellsFor(w2, V).length === 0, `${c2.strength}`);

        // Crushed.
        const w3 = freshWorld();
        const p3 = worldOf(w3, V);
        const c3 = formCell(w3, p3, grievanceOf(w3, p3), () => 0.5);
        c3.strength = 10;
        crackdown(w3, V, p3.id, () => 0);
        check('a weak cell can be crushed outright', c3.status === 'crushed');
    }

    console.log('\n[4] Sweeps find cells');
    {
        const w = freshWorld();
        const p = worldOf(w, V);
        const cell = formCell(w, p, grievanceOf(w, p), () => 0.5);
        const found = revealCellsBySweep(w, V, p.systemId, 1, () => 0);
        check('a sweep in the cell\'s system can find it', found.some(c => c.id === cell.id));
        check('only the host sweeps its own worlds', revealCellsBySweep(w, A, p.systemId, 1, () => 0).length === 0);
        check('the sweep resolution looks for cells', /revealCellsBySweep\(world, op\.actorFactionId, op\.targetRegionId, mult\)/.test(code('lib/espionage/espionage-service.ts')));
    }

    console.log('\n[5] Who sees what, and what survives a restart');
    {
        const w = freshWorld();
        const p = worldOf(w, V);
        const hidden = formCell(w, p, grievanceOf(w, p), () => 0.5);
        const known = formCell(w, worldOf(w, V), grievanceOf(w, p), () => 0.6);
        known.safeHouse.knownToFactionIds.push(V);
        const shardJson = extractFactionShard(w, V);
        const shard = JSON.parse(shardJson);
        check('the host shard keeps every cell on its worlds', shard.rebelCells.length === 2);
        const wire = scrubOwnerSecrets(shard);
        check('the host sees only the cells it found', wire.rebelCells.length === 1 && wire.rebelCells[0].id === known.id);
        check('a rival sees none of them', !('rebelCells' in projectPublicShard(shard, undefined as any)));
        const snapshot: any = cleanWorldForSave(w);
        check('the shared snapshot carries no cells', (snapshot.rebellion?.cells?.size ?? 0) === 0);
        check('and the live world still has them', ensureRebellion(w).cells.size === 2);
        const back: any = freshWorld();
        injectFactionShard(back, shardJson);
        check('cells survive a restart', ensureRebellion(back).cells.get(hidden.id)?.strength === hidden.strength);
        void known;
    }

    console.log('\n[6] Wiring');
    {
        check('REB_CRACKDOWN is registered', !!(ACTION_DEFINITIONS as any).REB_CRACKDOWN);
        const loop = code('scripts/game-loop.ts');
        check('the worker checks before it charges political capital',
            /case 'REB_CRACKDOWN':[\s\S]{0,300}crackdownBlocker\([\s\S]{0,400}spendPoliticalCapital\([\s\S]{0,400}crackdown\(/.test(loop));
        check('the strategic tick runs the oppression loop', /tickRebellion\(world\)/.test(code('lib/time/tick-processor.ts')));
        const ui = [...code('components/panels/espionage/InternalSecurity.tsx').matchAll(/from '([^']+)'/g)].map(m => m[1]);
        check('the page section stays browser-safe', !ui.some(i => /cell-service|government|politics|reputation/.test(i)), ui.join(', '));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
