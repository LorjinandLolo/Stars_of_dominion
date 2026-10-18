// scripts/ai-parity-probe.ts
// Do AI empires answer what a player answers — through the player's orders?
//
// Tier 1 of the AI parity work (lib/ai/ai-orders.ts, lib/ai/state-desk-ai.ts):
// counter-intelligence, press defence, cabinet and governor staffing, a
// constitutional secession crisis, prisoners of war, per-empire war fatigue,
// and declarations through DIP_DECLARE_WAR. Tier 2: battle groups and belt
// pickets built through MIL_BUILD_FLEET + MIL_RECRUIT_FORMATION_UNIT (price,
// yard gate, build timer), never conjured. Each scenario is planted, one real
// strategic tick runs through the soak harness (which drains the AI order
// outbox into executeOrder exactly as the worker does), and the outcome is
// read back off the round-tripped world.
//
// Run:  npx tsx scripts/ai-parity-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { executeOrder } from './game-loop';
import { drainAIOrders, queueAIOrder } from '../lib/ai/ai-orders';
import { aiDeclareWar, aiWarTurn, isWarfleetId, warFatigueOf, warfleetQuote } from '../lib/ai/war-ai';
import { beltAmbushTurn } from '../lib/ai/belt-ambush-ai';
import { RecruitmentService } from '../lib/combat/recruitment-service';
import { minYardTierFor, systemYardFor } from '../lib/combat/shipyard-gate';
import { wouldAccept } from '../lib/ai/diplomatic-ai-service';
import { isAtWar } from '../lib/diplomacy/offer-service';
import { ensurePressState } from '../lib/press-system/integration';
import { ensureLedger } from '../lib/combat/siege/prisoners';
import { getGovernor } from '../lib/government/governor-service';
import { getMinister } from '../lib/government/cabinet-service';
import { getLedger } from '../lib/tech/history-ledger';
import { DEED_WARS_DECLARED_ON_US } from '../lib/tech/deed-metrics';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
    seedSimulation('parity');
    const quiet = quietConsole(line => line.startsWith('[AI Orders]') || line.startsWith('[War AI]') || line.startsWith('[AI Fleets]') || line.startsWith('[Belt AI]'));
    let world = bootSoakWorld();
    const ids = empireIds(world);
    const fleetsAtBoot = new Set([...world.movement.fleets.keys()]);
    // Every fleet a recruitment job has targeted, read after each drain.
    const targets = new Set<string>();
    const jobTargets = (w: any) => { for (const j of w.combat?.recruitmentJobs ?? []) if (j.targetFormationId) targets.add(j.targetFormationId); };
    const human = ids[0];
    const [ai, ai2, ai3] = ids.slice(1);
    world.claimedFactionIds = [human];
    const now = () => world.nowSeconds;

    // ── Plant ────────────────────────────────────────────────────────────────
    // Press: a human smear campaign on `ai` that has signalled.
    const press = ensurePressState(world);
    press.campaigns.set('camp-probe', {
        id: 'camp-probe', attackerId: human, targetEmpireId: ai, objective: 'credibility' as any,
        strength: 80, exposure: 32, signaled: true, tickStarted: 0, active: true,
    });
    const aiPress: any = press.empires.get(ai);
    if (aiPress) aiPress.narrativeInfluence = 40;

    // Cabinet: `ai` loses its Economy minister to a resignation.
    const gov: any = world.government.get(ai);
    gov.politicalCapital = 100;
    const outgoing = gov.cabinet.economy;
    gov.cabinet.economy = null;
    if (outgoing) world.leadership.leaders.get(outgoing).portfolio = undefined;

    // Governor: `ai` takes a world nobody governs.
    const prize: any = [...world.construction.planets.values()].find((p: any) => !p.ownerId || p.ownerId === 'faction-neutral');
    prize.ownerId = ai;
    prize.governorId = undefined;

    // Secession: `ai2` faces a region asking only for constitutional things.
    const gov2: any = world.government.get(ai2);
    gov2.politicalCapital = 100;
    const region: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === ai2);
    world.secessionCrises.set('crisis-probe', {
        id: 'crisis-probe', factionId: ai2, name: 'Probe Autonomy Crisis',
        planetIds: [region.id], systemIds: [region.systemId],
        openedAtSeconds: now() - 2 * 86400, deadlineSeconds: now() + 5 * 86400,
        independenceSupport: 55, governorLoyalty: 50, militaryLoyalty: 40,
        demands: ['autonomy', 'local_parliament'], granted: [], causes: ['probe'], status: 'open',
    });

    // Prisoners: `ai3` holds human soldiers taken two days ago, at peace.
    const ledger = ensureLedger(world.combat ?? (world.combat = { recruitmentJobs: [] }));
    const holding: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === ai3);
    ledger.groups.push({
        id: 'pow-probe', ownerEmpireId: human, captorEmpireId: ai3, planetId: holding.id, planetName: holding.name,
        unitType: 'INFANTRY', count: 40, capturedAtSeconds: now() - 2 * 86400,
    });
    const creditsBefore = Number(world.economy.factions.get(ai3).reserves.CREDITS ?? 0);

    const ciBefore = Number(world.espionage.factionIntel.get(ai)?.counterIntelBudget ?? 0);

    // ── One strategic tick ───────────────────────────────────────────────────
    ({ world } = await stepSoak(world, 1));
    jobTargets(world);

    // ── Read back ────────────────────────────────────────────────────────────
    const aiCi = world.espionage.factionIntel.get(ai);
    check('AI counter-intel budget raised from zero', ciBefore === 0 && (aiCi?.counterIntelBudget ?? 0) > 0,
        `${ciBefore} → ${aiCi?.counterIntelBudget}, ${Object.keys(aiCi?.regionalCounterIntel ?? {}).length} system(s) covered`);
    check('the human\'s counter-intel is left alone', (world.espionage.factionIntel.get(human)?.counterIntelBudget ?? 0) === 0);
    const everyAiCovered = ids.filter(id => id !== human).every(id => (world.espionage.factionIntel.get(id)?.counterIntelBudget ?? 0) > 0);
    check('every AI empire runs counter-intel', everyAiCovered);

    const camp: any = ensurePressState(world).campaigns.get('camp-probe');
    check('AI answers a signalled human campaign', camp.strength < 80 || !camp.active,
        `strength ${camp.strength}, exposure ${camp.exposure}, active ${camp.active}`);

    check('AI refills a vacated cabinet seat', !!getMinister(world, ai, 'economy'),
        getMinister(world, ai, 'economy')?.name ?? 'still empty');
    const gvn = getGovernor(world, prize.id);
    check('AI appoints a governor the planet knows about', !!gvn && gvn.assignmentId === prize.id, gvn?.name ?? 'none');

    const crisis: any = world.secessionCrises.get('crisis-probe');
    check('AI ruler answers a constitutional-only secession crisis', crisis.granted.length > 0 || crisis.status !== 'open',
        `granted [${crisis.granted.join(', ')}], status ${crisis.status}`);

    const pow: any = ensureLedger(world.combat).groups.find((g: any) => g.id === 'pow-probe');
    const creditsAfter = Number(world.economy.factions.get(ai3).reserves.CREDITS ?? 0);
    check('AI decides the fate of prisoners it holds', pow?.resolved === 'ransom', `resolved ${pow?.resolved}, credits ${Math.round(creditsBefore)} → ${Math.round(creditsAfter)}`);

    // ── War fatigue is per empire ────────────────────────────────────────────
    world.shared.warFatigue = 80;
    (world.government.get(ai) as any).warFatigue = 5;
    (world.government.get(ai2) as any).warFatigue = 90;
    check('war fatigue reads the empire\'s own government', warFatigueOf(world, ai) === 5 && warFatigueOf(world, ai2) === 90);
    const offer = (to: string) => ({ id: 'x', kind: 'peace_offer', fromFactionId: human, toFactionId: to, status: 'pending', createdAtSeconds: 0 } as any);
    // ai is not tired: its answer falls to the power/war-aim tests, never to the galaxy's fatigue.
    const freshAccepts = wouldAccept(world, offer(ai));
    const tiredAccepts = wouldAccept(world, offer(ai2));
    check('a war-weary court accepts peace', tiredAccepts);
    check('a fresh court is not forced to by galaxy-wide fatigue', !freshAccepts || warFatigueOf(world, ai) < 40,
        `fresh accepts=${freshAccepts}`);
    world.shared.warFatigue = 0;

    // ── Declaring war goes through the order ─────────────────────────────────
    const target = ids.filter(id => id !== ai && id !== human && !isAtWar(world, ai, id))[0];
    check('a human faction cannot be ordered by the AI', !queueAIOrder(world, { factionId: human, actionId: 'DIP_DECLARE_WAR', payload: { targetFactionId: ai } }));
    const onUsBefore = getLedger(world, target).counters[DEED_WARS_DECLARED_ON_US] ?? 0;
    const queued = aiDeclareWar(world, ai, target, 'grievance');
    check('declaration is queued, not applied', queued && !isAtWar(world, ai, target));
    drainAIOrders(world, executeOrder);
    const rec = (world as any).aiWar?.factions?.[ai];
    check('the handler declared it and the war AI booked it', isAtWar(world, ai, target) && rec?.declared?.[target] === world.nowSeconds);
    const onUsAfter = getLedger(world, target).counters[DEED_WARS_DECLARED_ON_US] ?? 0;
    check('the victim\'s deed ledger counts it (DIP_DECLARE_WAR handler)', onUsAfter === onUsBefore + 1, `${onUsBefore} → ${onUsAfter}`);

    // ── Battle groups are built through the player's orders ──────────────────
    // At war now, `ai` arms. Nothing may appear until the order runs; the
    // order makes an empty shell plus recruitment jobs (MIL_BUILD_FLEET +
    // MIL_RECRUIT_FORMATION_UNIT), and the hulls arrive on the jobs' timers.
    const reserves: Record<string, number> = world.economy.factions.get(ai).reserves;
    for (const k of ['CREDITS', 'METALS', 'MATERIEL']) if (reserves[k] !== undefined) reserves[k] = Math.max(reserves[k], 200000);
    const fleetsBefore = new Set([...world.movement.fleets.keys()]);
    const turn = aiWarTurn(world, ai);
    const wfId = turn.commissioned;
    check('the war AI orders a battle group rather than conjuring one', !!wfId && !world.movement.fleets.has(wfId)
        && [...world.movement.fleets.keys()].every(id => fleetsBefore.has(id)), wfId ?? 'nothing ordered');
    const paid = { ...reserves };
    drainAIOrders(world, executeOrder);
    jobTargets(world);
    const wf: any = wfId ? world.movement.fleets.get(wfId) : undefined;
    const wfJobs: any[] = (world.combat?.recruitmentJobs ?? []).filter((j: any) => j.targetFormationId === wfId);
    const planned: Record<string, number> = {};
    for (const j of wfJobs) planned[j.classKey] = (planned[j.classKey] ?? 0) + j.count;
    check('MIL_BUILD_FLEET made the shell under the war AI\'s id, empty, with its hulls on recruitment jobs',
        !!wf && isWarfleetId(wf.id) && Object.values(wf.composition ?? {}).every((n: any) => !n) && wfJobs.length > 0,
        `${wfJobs.length} job(s): ${Object.entries(planned).map(([c, n]) => `${n} ${c}`).join(', ')}`);
    check('no shell is left under the handler\'s timestamp id', ![...world.movement.fleets.values()].some((f: any) => f.factionId === ai && /-\d{10,}$/.test(f.id)));
    const quote = warfleetQuote(planned);
    check('it paid the player\'s price (shell + per-hull)', Math.round(paid.CREDITS - reserves.CREDITS) === Math.round(quote.cost.CREDITS)
        && Math.round(paid.METALS - reserves.METALS) === Math.round(quote.cost.METALS),
        `credits ${Math.round(paid.CREDITS - reserves.CREDITS)} vs ${quote.cost.CREDITS}, metals ${Math.round(paid.METALS - reserves.METALS)} vs ${quote.cost.METALS}`);
    check('the yard rule held: every hull fits the capital yard', Object.keys(planned).every(c => minYardTierFor(c)
        <= systemYardFor(world.construction.planets.values(), ai, world.economy.factions.get(ai).capitalSystemId, world.nowSeconds).tier));

    // Muster long over: a ready battle group would sail now. This one waits for its hulls.
    rec.declared[target] = world.nowSeconds - 10 * 86400;
    const turn2 = aiWarTurn(world, ai);
    const still: any = world.movement.fleets.get(wfId!);
    check('a battle group on the slip stays home and no second one is ordered', !still?.destinationSystemId && !turn2.commissioned,
        `destination ${still?.destinationSystemId ?? 'none'}, ordered ${turn2.commissioned ?? 'none'}`);
    drainAIOrders(world, executeOrder);
    jobTargets(world);
    const longest = Math.max(0, ...wfJobs.map((j: any) => j.completesAt - world.nowSeconds));
    world.nowSeconds += longest + 1;
    RecruitmentService.tick(world);
    const built: any = world.movement.fleets.get(wfId!);
    const sameShips = Object.entries(planned).every(([c, n]) => (built?.composition?.[c] ?? 0) === n);
    check('the hulls arrive when the jobs complete, at the quoted rating', sameShips && Math.round(built.basePower) === Math.round(quote.power),
        `after ${Math.round(longest)}s: ${JSON.stringify(built?.composition)}, power ${built?.basePower} vs ${quote.power}`);

    // Pickets: same road, when the belt AI has a trap to man.
    const pickBefore = new Set([...world.movement.fleets.keys()]);
    const belt = beltAmbushTurn(world as any, ai);
    if (belt.commissioned) {
        check('the belt AI orders its picket rather than conjuring one', !world.movement.fleets.has(belt.commissioned)
            && [...world.movement.fleets.keys()].every(id => pickBefore.has(id)), belt.commissioned);
        drainAIOrders(world, executeOrder);
        jobTargets(world);
        check('the picket is a shell with recruitment jobs', world.movement.fleets.has(belt.commissioned) && targets.has(belt.commissioned));
    }

    // The whole run: every warship fleet an AI gained came off a recruitment job.
    const conjured = [...world.movement.fleets.values()].filter((f: any) => !fleetsAtBoot.has(f.id) && ids.includes(f.factionId)
        && f.factionId !== human && (isWarfleetId(f.id) || /-trap-\d+$/.test(f.id)) && !targets.has(f.id));
    check('no AI warfleet or picket appeared without a recruitment job', conjured.length === 0, conjured.map((f: any) => f.id).join(', '));

    quiet.restore();
    console.log('\nAI parity probe');
    for (const r of results) console.log(r);
    if (quiet.complaints.size) {
        console.log('\nErrors raised during the run:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
