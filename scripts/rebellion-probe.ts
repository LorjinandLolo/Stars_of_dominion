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
            /case 'REB_CRACKDOWN':[\s\S]{0,300}crackdownBlocker\([\s\S]{0,400}spendPoliticalCapital\([\s\S]{0,400}crackdown(?:WithPrisoners)?\(/.test(loop));
        check('the strategic tick runs the oppression loop', /tickRebellion\(world\)/.test(code('lib/time/tick-processor.ts')));
        const ui = [...code('components/panels/espionage/InternalSecurity.tsx').matchAll(/from '([^']+)'/g)].map(m => m[1]);
        check('the page section stays browser-safe', !ui.some(i => /cell-service|government|politics|reputation/.test(i)), ui.join(', '));
    }

    // ── 13b ──────────────────────────────────────────────────────────────────
    const SP = await import('../lib/rebellion/sponsor-service');
    const { HOMEGROWN } = await import('../lib/rebellion/rebellion-types');
    const { ensureCases, fileAccusation, leakCase, tickCases } = await import('../lib/espionage/case-board');
    const { getOrCreateFactionIntel } = await import('../lib/espionage/faction-intel');
    const { tickAISponsorship } = await import('../lib/ai/rebellion-ai');
    const { drainNotifications } = await import('../lib/time/notification-hooks');
    const C = 'faction-null-syndicate';
    // A seeded generator: these checks are about rates, and must not flake.
    const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const giveNetwork = (w: any, owner: string, systemId: string) => w.espionage.intelNetworks.set(`${owner}:${systemId}`, { id: `${owner}:${systemId}`, ownerFactionId: owner, systemId, strength: 0.4, penetrationLevel: 'rumor', agentIds: [], activeUntil: w.nowSeconds + 1e6 });
    const setCredits = (w: any, id: string, n: number) => { w.economy.factions.get(id).reserves.CREDITS = n; };
    const cellFile = (w: any, cellId: string) => [...ensureCases(w).values()].find((c: any) => c.cellId === cellId) as any;
    const rivalry = (w: any, a: string, b: string) => (w.rivalries.get(`rivalry-${a}-${b}`) ?? w.rivalries.get(`rivalry-${b}-${a}`))?.rivalryScore ?? 0;
    const setup = () => {
        const w = freshWorld();
        const p = worldOf(w, V);
        oppress(w, V, p);
        const cell = formCell(w, p, grievanceOf(w, p), () => 0.5);
        cell.strength = 30;
        setCredits(w, A, 1_000_000);
        return { w, p, cell };
    };

    console.log('\n[7] Sponsoring a cell abroad');
    {
        const { w, p, cell } = setup();
        check('a service without reach cannot see the cell', !SP.canSeeCell(w, A, cell));
        check('so cannot sponsor it', !SP.sponsorCell(w, A, cell.id).ok);
        giveNetwork(w, A, p.systemId);
        check('a network in the system shows it', SP.foreignCellsFor(w, A).some(c => c.id === cell.id));
        check('the host cannot sponsor rebels against itself', !SP.sponsorCell(w, V, cell.id).ok);
        setCredits(w, A, 10);
        check('a sponsor who cannot pay is refused', !SP.sponsorCell(w, A, cell.id).ok);
        setCredits(w, A, 1_000_000);
        const res = SP.sponsorCell(w, A, cell.id, { armed: true });
        check('a sponsor who can is accepted', res.ok, res.message);
        check('one arrangement per cell per sponsor', !SP.sponsorCell(w, A, cell.id).ok);
        const before = Number(w.economy.factions.get(A).reserves.CREDITS);
        const s0 = cell.strength;
        SP.tickSponsorships(w);
        check('each cycle costs the sponsor', Number(w.economy.factions.get(A).reserves.CREDITS) < before);
        check('and strengthens the cell', cell.strength > s0);
        check('and leaves evidence', (res as any).sponsorship.evidence > 0);
    }

    console.log('\n[8] A sponsored cell strikes, and the host opens a file on it');
    {
        const { w, p, cell } = setup();
        giveNetwork(w, A, p.systemId);
        SP.sponsorCell(w, A, cell.id, { armed: true });
        drainNotifications();
        let actedAt = -1;
        const r = rng(7);
        for (let t = 0; t < 40 && actedAt < 0; t++) {
            w.nowSeconds += 6 * 3600;
            SP.tickSponsorships(w);
            if (SP.tickCellActs(w, r).some(a => a.cell.id === cell.id)) actedAt = t;
        }
        check('it acts within ten sim days', actedAt >= 0, `tick ${actedAt}`);
        const file = cellFile(w, cell.id);
        check('the host has a file on it', !!file);
        check('the file names the cell first', !!file && file.title.toLowerCase().includes(cell.name.toLowerCase()) && /claimed it/.test(file.clues[0]?.text ?? ''), file?.clues?.[0]?.text);
        check('"no foreign hand" is among the possibilities', !!file && file.suspectIds.includes(HOMEGROWN));
        check('the sponsor is hidden in the file', file?.actorFactionId === A);
        check('acting gave the cell away to its host', cell.safeHouse.knownToFactionIds.includes(V));
        check('the host was told', drainNotifications().some(n => n.factionId === V && /^REBEL/.test(n.title)));

        // A heist pays the sponsor.
        const { w: w2, p: p2, cell: c2 } = setup();
        giveNetwork(w2, A, p2.systemId);
        SP.sponsorCell(w2, A, c2.id);
        setCredits(w2, V, 500_000);
        const sponsorBefore = Number(w2.economy.factions.get(A).reserves.CREDITS);
        SP.commitAct(w2, c2, 'heist', SP.activeSponsorshipsOf(w2, c2.id));
        check('a heist takes from the host and pays the sponsor a cut',
            Number(w2.economy.factions.get(V).reserves.CREDITS) < 500_000 && Number(w2.economy.factions.get(A).reserves.CREDITS) > sponsorBefore);
    }

    console.log('\n[9] Prisoners: a cutout keeps the sponsor\'s name out of their mouths');
    {
        const run = (cutout: boolean | null) => {
            const { w, p, cell } = setup();
            giveNetwork(w, A, p.systemId);
            if (cutout !== null) SP.sponsorCell(w, A, cell.id, { cutout });
            SP.commitAct(w, cell, 'propaganda', SP.activeSponsorshipsOf(w, cell.id));
            const file = cellFile(w, cell.id);
            w.nowSeconds += 30 * 86400; // past any crackdown cooldown
            SP.crackdownWithPrisoners(w, V, p.id, () => 0);
            tickCases(w, 60);
            return [...file.clues, ...(file.pendingClues ?? [])].find((c: any) => c.source === 'interrogation');
        };
        const plain = run(false);
        check('a member of a cell paid directly names the sponsor', !!plain && plain.pointsAt.includes(A), plain?.text);
        const cut = run(true);
        check('a member of a cell paid through a cutout cannot', !!cut && cut.pointsAt.length === 0 && /could never name/.test(cut.text), cut?.text);
        const alone = run(null);
        check('a member of an unpaid cell says nobody paid them', !!alone && alone.pointsAt.includes(HOMEGROWN), alone?.text);
    }

    console.log('\n[10] Evidence, exposure, and naming the sponsor');
    {
        const { w, p, cell } = setup();
        giveNetwork(w, A, p.systemId);
        const s = (SP.sponsorCell(w, A, cell.id) as any).sponsorship;
        SP.commitAct(w, cell, 'propaganda', [s]);
        const file = cellFile(w, cell.id);
        const before = rivalry(w, V, A);
        drainNotifications();
        SP.addEvidence(w, s, 1);
        check('enough evidence exposes the sponsor', !!s.exposedAtSeconds && s.attributionState === 'exposed');
        check('the host\'s file gets the documents', (file.pendingClues ?? []).some((c: any) => /prove/.test(c.text) && c.pointsAt.includes(A)));
        check('relations with the host sour', rivalry(w, V, A) > before);
        const notes = drainNotifications();
        check('both sides are told', notes.some(n => n.factionId === V && n.title === 'FOREIGN HAND EXPOSED') && notes.some(n => n.factionId === A && n.title === 'OUR SPONSORSHIP IS EXPOSED'));

        const { w: w2, p: p2, cell: c2 } = setup();
        giveNetwork(w2, A, p2.systemId);
        const s2 = (SP.sponsorCell(w2, A, c2.id, { cutout: true }) as any).sponsorship;
        SP.commitAct(w2, c2, 'propaganda', [s2]);
        const f2 = cellFile(w2, c2.id);
        const res = fileAccusation(w2, V, f2.id, A);
        check('naming the sponsor of a cell exposes them', res.ok && (res as any).verdict === 'correct' && !!s2.exposedAtSeconds, res.message);
        const { w: w3, p: p3, cell: c3 } = setup();
        giveNetwork(w3, A, p3.systemId);
        giveNetwork(w3, C, p3.systemId);
        setCredits(w3, C, 1_000_000);
        const direct = (SP.sponsorCell(w3, A, c3.id) as any).sponsorship;
        const viaCutout = (SP.sponsorCell(w3, C, c3.id, { cutout: true }) as any).sponsorship;
        const d0 = direct.evidence, c0 = viaCutout.evidence;
        SP.tickSponsorships(w3);
        check('a cutout builds evidence at half speed', Math.abs((viaCutout.evidence - c0) * 2 - (direct.evidence - d0)) < 1e-9, `${direct.evidence - d0} vs ${viaCutout.evidence - c0}`);
    }

    console.log('\n[11] Homegrown');
    {
        const { w, cell } = setup();
        SP.commitAct(w, cell, 'propaganda', []);
        const file = cellFile(w, cell.id);
        check('an unpaid cell\'s file has nobody behind it', file?.actorFactionId === HOMEGROWN);
        check('its true motive is the cause itself', file?.trueMotive === 'cause');
        check('leaking a file as "homegrown" is refused', !leakCase(w, V, file.id, HOMEGROWN).ok);
        const res = fileAccusation(w, V, file.id, HOMEGROWN, 'cause');
        check('calling it homegrown is right', res.ok && (res as any).verdict === 'correct', res.message);

        const { w: w2, p: p2, cell: c2 } = setup();
        giveNetwork(w2, A, p2.systemId);
        SP.sponsorCell(w2, A, c2.id);
        SP.commitAct(w2, c2, 'propaganda', SP.activeSponsorshipsOf(w2, c2.id));
        const f2 = cellFile(w2, c2.id);
        const before = rivalry(w2, V, A);
        const r2 = fileAccusation(w2, V, f2.id, HOMEGROWN);
        check('calling a paid cell homegrown is wrong, and insults nobody', r2.ok && (r2 as any).verdict === 'wrong' && rivalry(w2, V, A) === before, r2.message);
    }

    console.log('\n[12] Who holds what');
    {
        const { w, p, cell } = setup();
        giveNetwork(w, A, p.systemId);
        SP.sponsorCell(w, A, cell.id);
        SP.commitAct(w, cell, 'heist', SP.activeSponsorshipsOf(w, cell.id));
        const sponsorShard = JSON.parse(extractFactionShard(w, A));
        const hostShard = JSON.parse(extractFactionShard(w, V));
        check('the sponsorship rides the sponsor\'s shard', sponsorShard.cellSponsorships.length === 1);
        check('and never the host\'s', (hostShard.cellSponsorships ?? []).length === 0);
        check('the sponsor gets a view of the cells it can see', sponsorShard.foreignCellsView.some((c: any) => c.id === cell.id));
        check('the view carries no sponsors', !JSON.stringify(sponsorShard.foreignCellsView).includes('sponsor'));
        check('rivals get none of it', !('foreignCellsView' in projectPublicShard(sponsorShard, undefined as any)) && !('cellSponsorships' in projectPublicShard(sponsorShard, undefined as any)));
        const wireFile = scrubOwnerSecrets(hostShard).espionageCases.find((c: any) => c.cellId === cell.id);
        check('the host\'s file keeps the cell public and the sponsorship hidden', !!wireFile && !('sponsorshipId' in wireFile) && !('actorFactionId' in wireFile));
        const back: any = freshWorld();
        injectFactionShard(back, extractFactionShard(w, A));
        check('a sponsorship survives a restart', (back.rebellion.sponsorships as Map<string, any>).size === 1);
        const vis = [...code('lib/rebellion/visibility.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
        check('the persistence layer\'s view stays browser-safe', vis.every(i => /rebellion-types/.test(i)), vis.join(', '));
        check('save-service never imports the sponsor service', !/sponsor-service/.test(code('lib/persistence/save-service.ts')));
        for (const f of ['components/panels/espionage/ForeignCells.tsx', 'components/panels/espionage/CaseBoardTab.tsx', 'components/panels/espionage/SuspectDossier.tsx', 'components/panels/IntelligencePanel.tsx']) {
            const imps = [...code(f).matchAll(/from '([^']+)'/g)].map(m => m[1]);
            check(`${f.split('/').pop()} stays browser-safe`, !imps.some(i => /sponsor-service|cell-service|case-board|government|politics/.test(i)), imps.filter(i => /lib\//.test(i)).join(', '));
        }
    }

    console.log('\n[13] AI sponsors');
    {
        const { w, p, cell } = setup();
        giveNetwork(w, C, p.systemId);
        setCredits(w, C, 100_000);
        for (const id of [`rivalry-${C}-${V}`, `rivalry-${V}-${C}`]) { const r: any = w.rivalries.get(id); if (r) r.escalationLevel = 6; }
        if (!w.rivalries.get(`rivalry-${C}-${V}`) && !w.rivalries.get(`rivalry-${V}-${C}`)) {
            const { getOrCreateRivalry } = await import('../lib/diplomacy/offer-service');
            const r: any = getOrCreateRivalry(w, C, V, 80); r.escalationLevel = 6;
        }
        const did = tickAISponsorship(w, C, () => 0);
        check('a hostile AI with reach pays the cell', !!did && /sponsor/.test(did), String(did));
        const s: any = SP.activeSponsorshipsOf(w, cell.id).find(x => x.sponsorFactionId === C);
        check('armed, when hostility runs high', !!s?.armed);
        SP.addEvidence(w, s, 1);
        check('an AI caught paying cuts it', /cut/.test(String(tickAISponsorship(w, C, () => 0))) && !!s.endedAtSeconds);

        const buthari = 'faction-buthari';
        giveNetwork(w, buthari, p.systemId);
        setCredits(w, buthari, 100_000);
        check('the Buthari never arm another\'s rebels', tickAISponsorship(w, buthari, () => 0) === null);
        check('the strategic tick runs AI sponsorship', /tickAISponsorship\(world, factionId\)/.test(code('lib/time/tick-processor.ts')));
        void getOrCreateFactionIntel;
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
