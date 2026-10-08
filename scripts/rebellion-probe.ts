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

    // ── 13c ──────────────────────────────────────────────────────────────────
    const MV = await import('../lib/rebellion/movement-service');
    const RA = await import('../lib/ai/rebellion-ai');
    const { resolveLead, pursueLead, leadBlocker, INFORMANT_WINDOW_SECONDS } = await import('../lib/espionage/case-board');
    const { ensureGovernments, getGovernment } = await import('../lib/government/government-service');
    const { ensureGovernors, getGovernor } = await import('../lib/government/governor-service');
    const { tickCivilWar } = await import('../lib/government/civil-war-service');
    const { listBreakaways } = await import('../lib/breakaway/breakaway-rules');
    const { takeBreakaway } = await import('../lib/breakaway/breakaway-service');
    const chronicle = await import('../lib/narrative/chronicle');
    const DAY = 86400;
    const H = 'faction-covenant';
    const K = 'faction-kaerruun';
    const L = 'faction-leopantheri';
    const cellOn = (w: any, owner: string, strength = 30) => {
        const p = worldOf(w, owner);
        oppress(w, owner, p);
        const c = formCell(w, p, grievanceOf(w, p), () => 0.5);
        c.strength = strength;
        return { p, c };
    };
    const intelOf = (w: any, id: string) => getOrCreateFactionIntel(w, id);

    console.log('\n[14] Informants');
    {
        const runInformant = (mode: 'direct' | 'cutout' | 'none') => {
            const { w, p, cell } = setup();
            giveNetwork(w, A, p.systemId);
            if (mode !== 'none') SP.sponsorCell(w, A, cell.id, { cutout: mode === 'cutout' });
            SP.commitAct(w, cell, 'propaganda', SP.activeSponsorshipsOf(w, cell.id));
            const file = cellFile(w, cell.id);
            intelOf(w, V).intelPoints = 500;
            const started = pursueLead(w, V, file.id, 'informant', null);
            const found = resolveLead(w, file, () => 0);
            return { w, p, cell, file, started, found };
        };
        const direct = runInformant('direct');
        check('an informant can be turned on a cell\'s file', direct.started.ok, direct.started.message);
        check('they name the sponsor a cell is paid by directly', !!direct.found && direct.found.pointsAt.includes(A), direct.found?.text);
        check('they name members of their own cell', /names \d+ of its members/.test(direct.found?.text ?? ''));
        check('the cell is marked for the next crackdown', (direct.cell.informedUntilSeconds ?? 0) >= direct.w.nowSeconds + INFORMANT_WINDOW_SECONDS - 1);
        direct.file.pendingClues = []; direct.file.clues.push({ ...direct.found!, arrivedAt: direct.w.nowSeconds });
        const solved = fileAccusation(direct.w, V, direct.file.id, A);
        check('and the file can be solved on it', solved.ok && (solved as any).verdict === 'correct', solved.message);
        const cut = runInformant('cutout');
        check('a cutout keeps the sponsor\'s name from informants too', !!cut.found && cut.found.pointsAt.length === 0 && /go-between/.test(cut.found.text), cut.found?.text);
        const none = runInformant('none');
        check('an unpaid cell\'s informant says nobody pays them', !!none.found && none.found.pointsAt.includes(HOMEGROWN), none.found?.text);
        check('only a cell\'s file has informants', !!leadBlocker(direct.w, { ...direct.file, cellId: null, lead: null, status: 'open' }, 'informant', null));

        // Compartments: one informant gives away one cell.
        const { w } = setup();
        const other = worldOf(w, A);
        oppress(w, A, other);
        const otherCell = formCell(w, other, grievanceOf(w, other), () => 0.5);
        const { cell } = (() => { const c = [...ensureRebellion(w).cells.values()].find((x: any) => x.hostFactionId === V)!; return { cell: c }; })();
        SP.commitAct(w, cell, 'propaganda', []);
        const f = cellFile(w, cell.id);
        f.lead = { kind: 'informant', targetFactionId: null, startedAt: w.nowSeconds, dueAt: w.nowSeconds, cost: 0 };
        resolveLead(w, f, () => 0);
        check('an informant knows their own cell and no other', !otherCell.safeHouse.knownToFactionIds.includes(V) && !otherCell.informedUntilSeconds);

        // An informed crackdown hits harder and always finds the cell.
        const { w: w2, p: p2, cell: c2 } = setup();
        c2.strength = 60;
        c2.safeHouse.knownToFactionIds = [];
        c2.informedUntilSeconds = w2.nowSeconds + DAY;
        crackdown(w2, V, p2.id, () => 0.999);
        check('an informed crackdown finds the cell and hits it harder', c2.safeHouse.knownToFactionIds.includes(V) && c2.strength === 60 - 35 - 15, `${c2.strength}`);
    }

    console.log('\n[15] Prison breaks');
    {
        const { w, p, cell } = setup();
        giveNetwork(w, A, p.systemId);
        const s = (SP.sponsorCell(w, A, cell.id) as any).sponsorship;
        const agent: any = { id: 'probe-agent-wren', codename: 'Wren', ownerFactionId: A, status: 'captured', capturedByFactionId: V, traitIds: [], experience: 0, cover: 50, deployedToSystemId: null, cooldownUntil: null };
        w.espionage.agents.set(agent.id, agent);
        (intelOf(w, V).prisoners ??= []).push({ agentId: agent.id, codename: 'Wren', species: null, claimedEmployerId: A, takenAt: w.nowSeconds, systemId: p.systemId });
        check('a cell knows its sponsor\'s people are held', SP.sponsorPrisoners(w, cell, [s]).includes(agent.id));
        check('a homegrown cell has nobody to break out', SP.sponsorPrisoners(w, cell, []).length === 0);
        drainNotifications();
        SP.commitAct(w, cell, 'prison_break', [s]);
        check('a prison break frees the sponsor\'s agent', agent.status === 'on_cooldown' && !agent.capturedByFactionId);
        check('and takes them off the host\'s books', !(intelOf(w, V).prisoners ?? []).some((x: any) => x.agentId === agent.id));
        check('the sponsor hears of it', drainNotifications().some(n => n.factionId === A && n.title === 'AGENT FREED'));
    }

    console.log('\n[16] Assassination');
    {
        const { w, p, cell } = setup();
        ensureGovernments(w);
        ensureGovernors(w);
        const before = getGovernor(w, p.id);
        check('the world has a governor to lose', !!before);
        chronicle.resetChronicleBuffer();
        SP.commitAct(w, cell, 'assassination', []);
        const after = getGovernor(w, p.id);
        check('the governor is killed', before?.status === 'deceased');
        check('and a successor takes the office', !!after && after.id !== before?.id);
        const rows = chronicle.drainBuffer().rows as any[];
        const row = rows.find(r => r.type === 'rebel_act');
        check('the press has it, as a grave story', !!row && JSON.parse(row.facts).act === 'assassination' && row.importance >= 60);
    }

    console.log('\n[17] A movement comes into the open');
    {
        const w = freshWorld();
        ensureGovernments(w);
        const { p, c } = cellOn(w, H, 60);
        giveNetwork(w, A, p.systemId);
        setCredits(w, A, 1_000_000);
        SP.sponsorCell(w, A, c.id);
        c.formedAtSeconds = w.nowSeconds - 29 * DAY;
        check('a cell under thirty sim days stays hidden', MV.tickMovements(w).rose.length === 0 && !c.crisisId);
        c.formedAtSeconds = w.nowSeconds - 31 * DAY;
        c.strength = 40;
        check('so does a weak one', MV.tickMovements(w).rose.length === 0);
        c.strength = 60;
        const t = MV.tickMovements(w);
        const crisis: any = c.crisisId ? w.secessionCrises.get(c.crisisId) : null;
        check('a movement that survives thirty sim days opens a secession crisis', t.rose.includes(c) && !!crisis && crisis.status === 'open' && crisis.planetIds.includes(p.id));
        check('the crisis carries the cell\'s name', !!crisis && crisis.cellId === c.id && /Rising/.test(crisis.name));
        check('and none of its hidden sponsors', !!crisis && !(crisis.foreignSponsors ?? []).includes(A) && !(crisis.exposedSponsors ?? []).includes(A));
        check('the host now knows the cell', c.safeHouse.knownToFactionIds.includes(H));
        check('the sponsor sees a movement abroad', SP.foreignCellsFor(w, A).some(v => v.id === c.id && v.movement));
        {
            const spare: any = [...w.construction.planets.values()].find((x: any) => !x.ownerId);
            spare.ownerId = H;
            const second = formCell(w, spare, grievanceOf(w, spare), () => 0.5);
            second.strength = 60; second.formedAtSeconds = w.nowSeconds - 31 * DAY;
            MV.tickMovements(w);
            check('an empire faces one rising at a time', !second.crisisId);
            ensureRebellion(w).cells.delete(second.id);
            spare.ownerId = null;
        }

        // Settled: the concessions took its reasons.
        crisis.status = 'settled';
        const s0 = c.strength;
        MV.tickMovements(w);
        check('a settled crisis costs the cell and sends it back into hiding', c.strength === s0 - MV.SETTLED_STRENGTH_LOSS && !c.crisisId);
        c.strength = 60;
        check('and it must wait again before it can rise', MV.tickMovements(w).rose.length === 0);

        // Suppressed: crushed.
        const w2 = freshWorld(); ensureGovernments(w2);
        const { c: c2 } = cellOn(w2, H, 60);
        c2.formedAtSeconds = w2.nowSeconds - 31 * DAY;
        MV.tickMovements(w2);
        (w2.secessionCrises.get(c2.crisisId) as any).status = 'suppressed';
        MV.tickMovements(w2);
        check('a suppressed movement is crushed', c2.status === 'crushed');
    }

    console.log('\n[18] A movement becomes a state, and a person can take it');
    {
        const w = freshWorld();
        ensureGovernments(w);
        const { p, c } = cellOn(w, H, 60);
        giveNetwork(w, A, p.systemId);
        setCredits(w, A, 1_000_000);
        const s = (SP.sponsorCell(w, A, c.id) as any).sponsorship;
        c.formedAtSeconds = w.nowSeconds - 31 * DAY;
        MV.tickMovements(w);
        const crisis: any = w.secessionCrises.get(c.crisisId);
        crisis.status = 'escalated';
        crisis.escalatedAtSeconds = w.nowSeconds - 30 * DAY;
        MV.tickMovements(w);
        check('an escalated movement names a state', !!crisis.rebelFactionId);
        tickCivilWar(w, 6 * 3600);
        check('the region becomes that state', w.economy.factions.has(crisis.rebelFactionId));
        drainNotifications();
        const t = MV.tickMovements(w);
        check('the cell has risen', t.states.includes(c) && c.status === 'risen' && c.breakawayFactionId === crisis.rebelFactionId);
        check('its sponsorship is over', !!s.endedAtSeconds);
        check('and the sponsor is told what it built', drainNotifications().some(n => n.factionId === A && n.title === 'OUR MOVEMENT IS A STATE'));
        check('the state is open to a new player', listBreakaways(w).some((b: any) => b.factionId === crisis.rebelFactionId));
        const taken = takeBreakaway(w, crisis.rebelFactionId, { fromFactionId: null, eliminated: false } as any);
        check('a human can take it as a breakaway', taken.ok, taken.message);

        // Another cell on that world got what it fought for; one under a conqueror fights on.
        const comrade = formCell(w, p, grievanceOf(w, p), () => 0.5);
        comrade.hostFactionId = H;
        comrade.strength = 30;
        tickRebellion(w, () => 0.99);
        check('a cell on a world that seceded stands down', comrade.status === 'dissolved');
        const w4 = freshWorld(); ensureGovernments(w4);
        const { p: p4, c: c4 } = cellOn(w4, H, 30);
        p4.ownerId = K;
        tickRebellion(w4, () => 0.99);
        check('a cell on a conquered world fights the conqueror', c4.status === 'active' && c4.hostFactionId === K);

        // A late joiner's seat: a movement in the open rises for them.
        const w2 = freshWorld(); ensureGovernments(w2);
        const { c: c2 } = cellOn(w2, H, 60);
        c2.formedAtSeconds = w2.nowSeconds - 31 * DAY;
        MV.tickMovements(w2);
        const rose = MV.riseMovementForPlayer(w2, [A, V]);
        check('a late joiner\'s seat raises a movement already in the open', !!rose && c2.status === 'risen' && w2.economy.factions.has(rose.factionId));
        const w3 = freshWorld(); ensureGovernments(w3);
        const { c: c3 } = cellOn(w3, V, 60);
        c3.formedAtSeconds = w3.nowSeconds - 31 * DAY;
        MV.tickMovements(w3);
        check('but never one inside a human\'s empire', MV.riseMovementForPlayer(w3, [A, V]) === null);
        check('the lobby asks for a movement before it invents one', /riseMovementForPlayer\(world, humans\)[\s\S]{0,400}raiseUprising\(/.test(code('lib/breakaway/seat-service.ts')));
        check('the strategic tick runs movements', /tickMovements\(world\)/.test(code('lib/time/tick-processor.ts')));
    }

    console.log('\n[19] AI governments crack down by temperament');
    {
        const run = (host: string, strength: number, opts: { crisis?: boolean; pc?: number; known?: boolean } = {}) => {
            const w = freshWorld();
            ensureGovernments(w);
            const { p, c } = cellOn(w, host, strength);
            if (opts.known !== false) c.safeHouse.knownToFactionIds.push(host);
            if (opts.crisis) c.crisisId = 'probe-crisis';
            const gov: any = getGovernment(w, host);
            if (gov) gov.politicalCapital = opts.pc ?? 50;
            return { w, p, c, did: RA.tickAICrackdowns(w, host) };
        };
        check('the Kaer\'Ruun crack down on any cell they know of', !!run(K, 12).did);
        check('the Leo-pantheri let a small cell be', run(L, 25).did === null);
        check('but crack down once it is a real threat', !!run(L, 70).did);
        check('anyone cracks down on a movement in the open', !!run(L, 12, { crisis: true }).did);
        check('a crackdown needs political capital', run(K, 40, { pc: 0 }).did === null);
        const iron = run(K, 5, { known: false });
        iron.p.unrest = 70;
        const again = RA.tickAICrackdowns(iron.w, K);
        check('an iron fist sweeps a restless world with no known cell', !!iron.did || !!again);
        check('the strategic tick runs AI crackdowns', /tickAICrackdowns\(world, factionId\)/.test(code('lib/time/tick-processor.ts')));
    }

    console.log('\n[20] The press');
    {
        const { w, p, cell } = setup();
        giveNetwork(w, A, p.systemId);
        SP.sponsorCell(w, A, cell.id);
        chronicle.resetChronicleBuffer();
        SP.commitAct(w, cell, 'sabotage', SP.activeSponsorshipsOf(w, cell.id));
        w.nowSeconds += 30 * DAY;
        crackdown(w, V, p.id, () => 0);
        const rows = chronicle.drainBuffer().rows as any[];
        const act = rows.find(r => r.type === 'rebel_act');
        check('a cell\'s act is history', !!act);
        check('with its payer on the record but hidden from the press', !!act && JSON.parse(act.actorIds).includes(A) && act.attribution === 'invisible');
        check('a crackdown is history', rows.some(r => r.type === 'crackdown' && JSON.parse(r.actorIds).includes(V)));
        const { w: w2, cell: c2 } = setup();
        chronicle.resetChronicleBuffer();
        SP.commitAct(w2, c2, 'propaganda', []);
        const own = (chronicle.drainBuffer().rows as any[]).find(r => r.type === 'rebel_act');
        check('an unpaid cell\'s act hides nobody', !!own && own.attribution === 'exposed' && JSON.parse(own.actorIds).length === 0);
        const tpl = code('lib/narrative/prose/template-writer.ts');
        const block = tpl.slice(tpl.indexOf("case 'rebel_act'"), tpl.indexOf("case 'crackdown'"));
        check('the rebel story never names a payer', block.length > 0 && !/\bactor\b/.test(block));
    }

    // ── 13d ──────────────────────────────────────────────────────────────────
    const UG = await import('../lib/rebellion/underground-service');
    const { isUndergroundSeatId, HELD_ACT_COOLDOWN_SECONDS } = await import('../lib/rebellion/rebellion-types');
    const seated = (strength = 60, host = H) => {
        const w = freshWorld();
        ensureGovernments(w);
        const { p, c } = cellOn(w, host, strength);
        c.formedAtSeconds = w.nowSeconds - 31 * DAY;
        const id = UG.seatIdFor(c);
        UG.seatCell(w, c, id, 'Probe Rebel');
        return { w, p, c, id };
    };

    console.log('\n[21] Taking a seat underground');
    {
        const w = freshWorld();
        ensureGovernments(w);
        const weak = cellOn(w, H, 20).c;
        const strong = cellOn(w, K, 50).c;
        const human = cellOn(w, V, 90).c;
        check('the game gives a newcomer the strongest cell in an AI empire', UG.pickCellForSeat(w, [A, V]) === strong);
        check('a human\'s empire only when no AI empire has a cell', UG.pickCellForSeat(w, [A, V, K, H]) === human);
        const id = UG.seatIdFor(strong);
        check('the seat is an underground id', isUndergroundSeatId(id) && id.startsWith('rebel-faction-'));
        const r = UG.seatCell(w, strong, id, 'Probe Rebel');
        check('the cell takes its leader', r.ok && UG.heldCellOf(w, id) === strong, r.message);
        check('a led cell is not offered to the next newcomer', UG.pickCellForSeat(w, [A, V]) === weak);
        check('the seat is not counted among the human empires', !(w.claimedFactionIds ?? []).includes(id));
        check('the leader sees the cell', !!strong.seatView && strong.seatView.name === strong.name && strong.seatView.log.length > 0);

        const empty = freshWorld();
        ensureGovernments(empty);
        const angry = worldOf(empty, L);
        oppress(empty, L, angry);
        const formed = UG.pickCellForSeat(empty, [A, V]);
        check('with no cell anywhere, one forms on an angry AI world', !!formed && formed.status === 'active' && ![A, V].includes(formed.hostFactionId), formed ? `${formed.hostFactionId} ${formed.planetId === angry.id ? '(the oppressed one)' : ''}` : 'none');

        UG.releaseOrphanSeats(w, []);
        check('a seat whose claim is gone frees the cell', !strong.seat && !strong.seatView);
    }

    console.log('\n[22] The leader gives the orders');
    {
        const { w, c, id } = seated(40);
        const before = c.actsCommitted ?? 0;
        const filesBefore = [...ensureCases(w).values()].filter((k: any) => k.cellId === c.id).length;
        const r = UG.orderCellAct(w, id, 'propaganda');
        check('a human holding a cell orders an act and it happens', r.ok && (c.actsCommitted ?? 0) === before + 1, r.message);
        check('the host gets a file on it like any other', [...ensureCases(w).values()].filter((k: any) => k.cellId === c.id).length === filesBefore + 1);
        check('the next strike waits', !UG.orderCellAct(w, id, 'heist').ok);
        w.nowSeconds += HELD_ACT_COOLDOWN_SECONDS + 1;
        check('then the cell may strike again', UG.orderCellAct(w, id, 'heist').ok);
        check('someone who leads no cell gives no orders', !UG.orderCellAct(w, 'rebel-faction-underground-nobody', 'heist').ok);
        check('the governor is out of reach of a weak, unarmed cell', !!UG.actBlocker(w, c, 'assassination'));
        check('there is nobody to break out', !!UG.actBlocker(w, c, 'prison_break'));
        const acted = c.actsCommitted;
        w.nowSeconds += HELD_ACT_COOLDOWN_SECONDS + 1;
        SP.tickCellActs(w, () => 0);
        check('a led cell never strikes on its own', c.actsCommitted === acted);

        {
            const q = seated(20);
            pacify(q.w, H, q.p);
            const loose = formCell(q.w, worldOf(q.w, K), grievanceOf(q.w, worldOf(q.w, K)), () => 0.5);
            pacify(q.w, K, worldOf(q.w, K));
            loose.strength = 20;
            for (let t = 0; t < 40; t++) tickRebellion(q.w, () => 0.99);
            check('a led cell keeps growing on a content world', q.c.status === 'active' && q.c.strength > 20, `${q.c.strength}`);
            check('a cell nobody leads fades there', loose.strength < 20, `${loose.strength}`);
        }

        UG.setLyingLow(w, id, true);
        const cover = c.safeHouse.concealment = 0.3;
        tickRebellion(w, () => 0.99);
        check('lying low rebuilds cover three times as fast', Math.abs(c.safeHouse.concealment - (cover + 0.03)) < 1e-9, `${c.safeHouse.concealment}`);
        check('and closes the strikes in the leader\'s view', c.seatView!.actsOpen.every(a => !a.open));

        giveNetwork(w, A, c.systemId);
        setCredits(w, A, 1_000_000);
        const s: any = (SP.sponsorCell(w, A, c.id, { cutout: true }) as any).sponsorship;
        UG.refreshSeatView(w, c);
        check('a cutout\'s money comes unnamed', c.seatView!.sponsors.some(x => x.sponsorshipId === s.id && x.sponsorName === null));
        check('and the leader hears it arrive', /go-between/.test(c.seatView!.log[0]?.text ?? ''));
        drainNotifications();
        const refused = UG.refuseSponsor(w, id, s.id);
        check('the leader can send a sponsor\'s money back', refused.ok && s.endReason === 'refused');
        check('the sponsor learns only that it was refused', drainNotifications().some(n => n.factionId === A && n.title === 'SPONSORSHIP REFUSED'));
    }

    console.log('\n[23] Declaring');
    {
        const young = seated(60);
        young.c.formedAtSeconds = young.w.nowSeconds - 5 * DAY;
        check('a young movement cannot declare', !UG.declareMovement(young.w, young.id).ok);
        const { w, c, id } = seated(60);
        MV.tickMovements(w);
        check('a led cell does not rise on its own', !c.crisisId);
        const r = UG.declareMovement(w, id);
        const crisis: any = c.crisisId ? w.secessionCrises.get(c.crisisId) : null;
        check('the leader declares and the world rises', r.ok && !!crisis && crisis.status === 'open', r.message);
        check('the crisis is pinned to the leader\'s own claim', crisis?.rebelFactionId === id);
    }

    console.log('\n[24] The host never learns a person leads the cell');
    {
        const { w, c, id } = seated(40);
        UG.orderCellAct(w, id, 'sabotage');
        UG.setLyingLow(w, id, false);
        const hostShard = JSON.parse(extractFactionShard(w, H));
        check('the cell rides the host\'s shard, seat and all, on the server', hostShard.rebelCells.some((x: any) => x.seat?.factionId === id));
        const wire = scrubOwnerSecrets(hostShard);
        const cellOnWire = wire.rebelCells.find((x: any) => x.id === c.id);
        check('the host\'s wire copy has the cell', !!cellOnWire);
        check('but no seat, no view, no leader', !!cellOnWire && !('seat' in cellOnWire) && !('seatView' in cellOnWire) && !('lyingLow' in cellOnWire) && !('nextActAtSeconds' in cellOnWire));
        check('nothing on the host\'s wire names the seat or its holder', !JSON.stringify(wire).includes(id) && !JSON.stringify(wire).includes('Probe Rebel'));
        check('rivals receive no cells at all', !('rebelCells' in projectPublicShard(hostShard, undefined as any)));
        check('the sync roster leaves underground seats out', /isUndergroundSeatId\(claim\.factionId\)\) continue/.test(code('app/api/game/sync/route.ts')));
        check('the lobby roster shows a seat only to its holder', /isUndergroundSeatId\(doc\.factionId\) && !mine\) return/.test(code('app/api/lobby/claim/route.ts')));
        check('the worker keeps seats off the list of human empires', /filter\(id => !isUndergroundSeatId\(id\) \|\| world\.economy\.factions\.has\(id\)\)/.test(code('scripts/game-loop.ts')));
        check('the worker frees cells whose leader let go', /releaseOrphanSeats\(world, ids\)/.test(code('scripts/game-loop.ts')));
    }

    console.log('\n[25] On fission the same account leads the state');
    {
        const { w, c, id } = seated(60);
        UG.declareMovement(w, id);
        const crisis: any = w.secessionCrises.get(c.crisisId);
        check('nobody else can be handed the movement', MV.riseMovementForPlayer(w, [A, V]) === null);
        crisis.status = 'escalated';
        crisis.escalatedAtSeconds = w.nowSeconds - 30 * DAY;
        MV.tickMovements(w);
        tickCivilWar(w, 6 * 3600);
        check('the state is made under the leader\'s claim', w.economy.factions.has(id));
        drainNotifications();
        MV.tickMovements(w);
        check('the cell has risen into it', c.status === 'risen' && c.breakawayFactionId === id);
        check('the same account leads it: it is a human empire now', (w.claimedFactionIds ?? []).includes(id));
        check('the AI never speaks for it', !(await import('../lib/ai/belt-ambush-ai')).isAIRunFaction(w, id));
        check('it is readied like any taken state', drainNotifications().some(n => n.factionId === id && /^YOU LEAD/.test(n.title)));
        check('and the seat is spent', !c.seat);
    }

    console.log('\n[26] The underground page stays browser-safe');
    {
        for (const f of ['components/underground/SeatRouter.tsx', 'components/underground/UndergroundShell.tsx', 'components/lobby/BreakawayPanel.tsx']) {
            const imps = [...code(f).matchAll(/from '([^']+)'/g)].map(m => m[1]);
            check(`${f.split('/').pop()} stays browser-safe`, !imps.some(i => /underground-service|movement-service|sponsor-service|cell-service|case-board|government|politics/.test(i)), imps.filter(i => /lib\//.test(i)).join(', '));
        }
        check('the home page routes through the seat check', /SeatRouter/.test(code('app/(site)/page.tsx')));
    }

    console.log(failures === 0 ? '\nALL GREEN' : `\n${failures} FAILURE(S)`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
