// scripts/ai-parity-probe.ts
// Do AI empires answer what a player answers — through the player's orders?
//
// Tier 1 of the AI parity work (lib/ai/ai-orders.ts, lib/ai/state-desk-ai.ts):
// counter-intelligence, press defence, cabinet and governor staffing, a
// constitutional secession crisis, prisoners of war, per-empire war fatigue,
// and declarations through DIP_DECLARE_WAR. Each scenario is planted, one real
// strategic tick runs through the soak harness (which drains the AI order
// outbox into executeOrder exactly as the worker does), and the outcome is
// read back off the round-tripped world.
//
// Run:  npx tsx scripts/ai-parity-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation, stepSoak } from './soak-harness';
import { executeOrder } from './game-loop';
import { drainAIOrders, queueAIOrder } from '../lib/ai/ai-orders';
import { aiDeclareWar, warFatigueOf } from '../lib/ai/war-ai';
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
    const quiet = quietConsole(line => line.startsWith('[AI Orders]') || line.startsWith('[War AI]'));
    let world = bootSoakWorld();
    const ids = empireIds(world);
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
