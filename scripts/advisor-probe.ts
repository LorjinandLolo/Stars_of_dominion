// scripts/advisor-probe.ts
// The veto feed: do a human's advisors propose instead of act, and does an
// answer run the real order?
//
// lib/delegation/advisor-proposals.ts + lib/ai/advisor-desk.ts. A human
// faction is planted into the war AI's own "declare" position (past grace,
// a hated weak neighbour); the desk must PROPOSE the war, never queue it.
// Approve runs DIP_DECLARE_WAR through executeOrder (war lands, political
// capital charged); Decline books a cooldown so the same advice stays quiet;
// Always puts the action on the standing list so the next such advice runs
// through the outbox without asking; an unanswered proposal lapses. The
// battle-group proposal replays through commissionWarfleet as the advisors'
// orders. The AI empire's path (queueAIOrder) is untouched, and the brief
// projection renders the lot.
//
// Run:  npx tsx scripts/advisor-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { drainAIOrders, queueAIOrder } from '../lib/ai/ai-orders';
import { runAdvisorDesk } from '../lib/ai/advisor-desk';
import { WAR, warCandidates, isWarfleetId } from '../lib/ai/war-ai';
import {
    adviseOrder, advisorRecordFor, expireProposals, openProposals, resolveProposal, PROPOSAL_TTL_SECONDS,
} from '../lib/delegation/advisor-proposals';
import { setDelegation, delegationFor } from '../lib/delegation/delegation-service';
import { runDelegatedSystems } from '../lib/delegation/delegation-runner';
import { getOrCreateRivalry, isAtWar, createOffer } from '../lib/diplomacy/offer-service';
import { buildDailyBrief } from '../lib/brief/daily-brief';
import { serializeWorld, deserializeWorld, extractFactionShard, injectFactionShard, cleanWorldForSave } from '../lib/persistence/save-service';
import { getGovernment } from '../lib/government/government-service';
import { POLITICAL_CAPITAL_COSTS } from '../lib/actions/political-costs';
import { CIV_BANKING, CIV_SARRAK } from '../lib/factions/civ-ids';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('advisors');
    const quiet = quietConsole(line => line.startsWith('[Advisors]') || line.startsWith('[AI Orders]') || line.startsWith('[Order]'));
    let world = bootSoakWorld();
    const ids = empireIds(world);
    // A seat with no rite of its own (the Clan, the Sarrak, the never-first-
    // striking Buthari all gate DIP_DECLARE_WAR differently).
    // Among those, one the capital-only map puts within the war AI's reach of
    // a neighbour (most seats sit too far apart at boot to have a candidate).
    const civ = (id: string) => world.economy.factions.get(id)?.civilizationId;
    const plain = ids.filter(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)) && id !== 'faction-buthari');
    const human = plain.includes('faction-movanites') ? 'faction-movanites' : plain[0];
    const [ai, prey] = ids.filter(id => id !== human);
    world.claimedFactionIds = [human];
    const DAY = 86400;
    const drain = () => drainAIOrders(world, executeOrder);

    // ── Plant: the human is in the AI's own "declare" position ──────────────
    // The season's age is counted from the war AI's first sight of the world
    // (no active season in a soak boot): fix that before moving the clock.
    world.aiWar ??= { firstSeenSeconds: world.nowSeconds, factions: {} };
    world.nowSeconds += (WAR.graceDays + 1) * DAY;
    const plantFleet = (owner: string, power: number) => {
        const id = `probe-fleet-${owner}`;
        world.movement.fleets.set(id, { id, name: id, factionId: owner, currentSystemId: world.economy.factions.get(owner).capitalSystemId,
            destinationSystemId: null, plannedPath: [], basePower: power, strength: 1, composition: { destroyer: 6 } });
    };
    plantFleet(human, 4000);
    plantFleet(ai, 4000);
    const hate = (a: string, b: string, score: number) => { (getOrCreateRivalry(world, a, b) as any).rivalryScore = score; };
    // Capital-only starts sit far apart: resent every court, and the war AI's
    // own reach test picks the one close enough to fight.
    for (const id of ids) if (id !== human) hate(human, id, 90);
    hate(ai, prey, 90);
    const gov: any = getGovernment(world, human);
    gov.politicalCapital = 100;
    gov.politicalCapitalCap = 100;
    world.economy.factions.get(human).reserves.CREDITS = 500_000;
    world.economy.factions.get(human).reserves.METALS = 500_000;
    (world.government.get(human) as any).warFatigue = 0;

    const candidates = warCandidates(world, human);
    check('plant: the human has a war candidate by the AI\'s own test', candidates.length > 0, candidates.map(c => `${c.targetId} ${c.motive}`).join(', ') || 'none');
    const target = candidates[0]?.targetId;

    // ── 1. The desk proposes; it never queues for a human ───────────────────
    const outboxBefore = (world.aiOrderOutbox ?? []).length;
    const reports = runAdvisorDesk(world);
    const open = openProposals(world, human);
    const warProposal = open.find(p => p.actionId === 'DIP_DECLARE_WAR');
    check('the desk proposes war to the human', !!warProposal && warProposal.payload.targetFactionId === target,
        reports.map(r => `${r.advice} → ${r.result}`).join('; ') || 'no reports');
    check('nothing was queued to the outbox for the human', (world.aiOrderOutbox ?? []).length === outboxBefore
        && !(world.aiOrderOutbox ?? []).some((o: any) => o.factionId === human));
    check('the war has NOT been declared', !isAtWar(world, human, target));
    check('a second run does not duplicate the proposal', (runAdvisorDesk(world), openProposals(world, human).filter(p => p.actionId === 'DIP_DECLARE_WAR').length === 1));
    const fleetProposal = openProposals(world, human).find(p => p.actionId === 'MIL_BUILD_FLEET');
    check('a battle group is proposed alongside (a war is on the table, no battle group)', !!fleetProposal && fleetProposal.replay === 'warfleet',
        fleetProposal?.detail ?? 'none');

    // ── 2. The proposals survive the worker's round trip and the shard ──────
    world = deserializeWorld(serializeWorld(world));
    check('proposals survive the JSON round trip', openProposals(world, human).length >= 2);
    const shard = extractFactionShard(world, human);
    const shardData = JSON.parse(shard);
    check('the shard carries the advisors\' desk', Array.isArray(shardData.advisors?.proposals) && shardData.advisors.proposals.length >= 2);
    const pub = cleanWorldForSave(world) as any;
    check('the public snapshot does not', !(pub.advisors?.size > 0));
    const fresh = deserializeWorld(serializeWorld(pub));
    injectFactionShard(fresh, shard);
    check('injecting the shard restores it', openProposals(fresh, human).length >= 2);

    // ── 3. The brief asks ───────────────────────────────────────────────────
    const brief = buildDailyBrief({ factionId: human, world, now: new Date() });
    const asked = brief.decisions.filter(d => d.kind === 'advisor');
    check('the brief carries the advisor proposals', asked.length >= 2 && asked.every(d => d.actions.length === 3 && d.actions.every(a => a.actionId === 'ADV_RESOLVE_PROPOSAL')),
        asked.map(d => d.title).join(' | '));
    check('the war proposal says its political price', !!asked.find(d => d.detail.includes(`${POLITICAL_CAPITAL_COSTS.DIP_DECLARE_WAR} political capital`)));

    // ── 4. Decline books a cooldown; the advice stays quiet ─────────────────
    const warP = openProposals(world, human).find(p => p.actionId === 'DIP_DECLARE_WAR')!;
    const declined = resolveProposal(world, human, warP.id, 'decline');
    check('decline removes the proposal without executing', !!declined && !declined.execute && !openProposals(world, human).some(p => p.id === warP.id));
    runAdvisorDesk(world);
    check('declined advice is not repeated', !openProposals(world, human).some(p => p.actionId === 'DIP_DECLARE_WAR'));
    check('the ledger says so', advisorRecordFor(world, human).ledger.some(e => e.outcome === 'declined' && e.actionId === 'DIP_DECLARE_WAR'));
    advisorRecordFor(world, human).declinedUntil = {};

    // ── 5. Approve through the order runs the real order ────────────────────
    runAdvisorDesk(world);
    const warP2 = openProposals(world, human).find(p => p.actionId === 'DIP_DECLARE_WAR')!;
    check('after the cooldown the advice returns', !!warP2);
    const pcBefore = getGovernment(world, human)!.politicalCapital;
    executeOrder(world, 'ADV_RESOLVE_PROPOSAL', { proposalId: warP2.id, decision: 'approve' }, human);
    check('approve declares the war through DIP_DECLARE_WAR', isAtWar(world, human, target));
    check('…and charges the player\'s political capital', getGovernment(world, human)!.politicalCapital === pcBefore - (POLITICAL_CAPITAL_COSTS.DIP_DECLARE_WAR ?? 0),
        `${pcBefore} → ${getGovernment(world, human)!.politicalCapital}`);
    check('an answered proposal cannot be answered twice', (executeOrder(world, 'ADV_RESOLVE_PROPOSAL', { proposalId: warP2.id, decision: 'approve' }, human),
        world.economy.factions.get(human).lastOrderError?.reason?.includes('no longer open')));

    // ── 6. The battle group replays as the advisors' orders ─────────────────
    const fleetsBefore = new Set([...world.movement.fleets.keys()]);
    const fleetP = openProposals(world, human).find(p => p.actionId === 'MIL_BUILD_FLEET')!;
    executeOrder(world, 'ADV_RESOLVE_PROPOSAL', { proposalId: fleetP.id, decision: 'approve' }, human);
    const queuedForHuman = (world.aiOrderOutbox ?? []).filter((o: any) => o.factionId === human);
    check('approving the battle group queues the build as advisor orders', queuedForHuman.length > 0 && queuedForHuman.every((o: any) => o.advisor === true),
        queuedForHuman.map((o: any) => o.actionId).join(', '));
    drain();
    const newWarfleet = [...world.movement.fleets.values()].find((f: any) => f.factionId === human && !fleetsBefore.has(f.id) && isWarfleetId(f.id));
    check('the drain lets the human\'s advisor orders through and the group exists', !!newWarfleet, newWarfleet?.id ?? 'none');

    // ── 7. Always: the next such advice runs without asking ─────────────────
    const rec = advisorRecordFor(world, human);
    const peaceProbe = adviseOrder(world, { system: 'diplomacy', factionId: human, actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: ai }, title: 'Envoy to a neighbour', detail: 'probe' });
    check('new advice is a proposal', peaceProbe === 'proposed');
    const envoyP = openProposals(world, human).find(p => p.actionId === 'DIP_SEND_ENVOY')!;
    const resolvedAlways = resolveProposal(world, human, envoyP.id, 'always');
    check('always puts the action on the standing list', !!resolvedAlways?.execute && rec.autoApprove.includes('DIP_SEND_ENVOY'));
    const again = adviseOrder(world, { system: 'diplomacy', factionId: human, actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: prey }, title: 'Envoy again', detail: 'probe' });
    check('the like now queues straight to the outbox', again === 'queued' && (world.aiOrderOutbox ?? []).some((o: any) => o.factionId === human && o.advisor));
    drain();
    check('…and the ledger records it as done without asking', rec.ledger.some(e => e.outcome === 'ran' && e.actionId === 'DIP_SEND_ENVOY'));

    // ── 8. Unanswered proposals lapse ───────────────────────────────────────
    adviseOrder(world, { system: 'military', factionId: human, actionId: 'DIP_OFFER_PEACE', payload: { targetFactionId: target }, title: 'Peace probe', detail: 'probe' });
    world.nowSeconds += PROPOSAL_TTL_SECONDS + 1;
    const lapsed = expireProposals(world);
    check('a proposal nobody answered lapses and is dropped', lapsed >= 1 && !openProposals(world, human).some(p => p.actionId === 'DIP_OFFER_PEACE')
        && !isAtWar(world, human, target) === false, `${lapsed} lapsed`);
    check('lapsing executes nothing', rec.ledger.filter(e => e.outcome === 'expired').length >= 1 && !(world.aiOrderOutbox ?? []).some((o: any) => o.actionId === 'DIP_OFFER_PEACE'));

    // ── 9. The AI empire's path is untouched ────────────────────────────────
    const aiRes = adviseOrder(world, { system: 'military', factionId: ai, actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: prey }, title: 'x', detail: 'x' });
    check('adviseOrder queues for an AI empire, never proposes', aiRes === 'queued' && !world.advisors?.get(ai));
    check('queueAIOrder still refuses a human', !queueAIOrder(world, { factionId: human, actionId: 'DIP_SEND_ENVOY', payload: { targetFactionId: ai } }));
    drain();

    // ── 10. Delegation: the new desks ───────────────────────────────────────
    const d = delegationFor(world, human);
    check('defaults: Works on, Admiralty and Foreign Office off', d.development === true && d.military === false && d.diplomacy === false);
    setDelegation(world, human, 'diplomacy', true);
    const offer = createOffer(world, target, { toFactionId: human, kind: 'peace_offer' });
    check('plant: a peace offer to the human', offer.success, offer.message);
    world.nowSeconds += 7 * 3600;
    (world.government.get(human) as any).warFatigue = 60; // the court would accept
    const done = runDelegatedSystems(world, 6 * 3600);
    check('a delegated Foreign Office accepts a peace the court would take', done.some(r => r.system === 'diplomacy' && r.action.startsWith('accepted peace')) && !isAtWar(world, human, target),
        done.map(r => `${r.system}: ${r.action}`).join('; ') || 'nothing');
    const queuedBuilds = done.filter(r => r.system === 'development').length;
    check('the Works filled a build queue', queuedBuilds > 0, `${queuedBuilds} queued`);

    quiet.restore();
    console.log('\nadvisor probe\n' + results.join('\n'));
    if (quiet.complaints.size) {
        console.log('\ncomplaints:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    // quietConsole may still hold the console: write past it.
    process.stderr.write(`advisor probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
