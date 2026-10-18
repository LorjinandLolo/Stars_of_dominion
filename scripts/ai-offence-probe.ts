// scripts/ai-offence-probe.ts
// Does an AI court use the offensive toolkit a player has — through the
// player's own orders? (Tier 3 of the AI parity work, lib/ai/offence-ai.ts.)
//
// Each scenario is planted on a booted soak world, the one desk is run with
// its chance gates forced open (Math.random → 0), and the AI order outbox is
// drained through the REAL executeOrder. The check reads the effect the
// handler left on the world, not the order the AI queued.
//
// Run:  npx tsx scripts/ai-offence-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { executeOrder } from './game-loop';
import { drainAIOrders } from '../lib/ai/ai-orders';
import {
    runPressOffence, runDiplomaticOffence, runPirateOffence, runBankingClan,
    runUniqueRites, runAgentRoster, runCorporateLevers, runOffenceDesk,
} from '../lib/ai/offence-ai';
import { ensureDiplomacyState, getOrCreateRivalry, registerActOfWar, isAtWar } from '../lib/diplomacy/offer-service';
import { ensurePressState } from '../lib/press-system/integration';
import { ensurePiracyState } from '../lib/piracy/organization-service';
import { bankingState } from '../lib/factions/banking-clan';
import { CIV_BANKING, CIV_SARRAK } from '../lib/factions/civ-ids';
import { foundOrganization } from '../lib/piracy/organization-service';
import { TechEngine } from '../lib/tech/engine';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
function skip(label: string, why: string): void { results.push(`  skip  ${label} — ${why}`); }

async function main() {
    seedSimulation('offence');
    const quiet = quietConsole(line => line.startsWith('[AI Orders]'));
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const civ = (id: string) => world.economy.factions.get(id)?.civilizationId;
    // A seat with no rite of its own, so the Clan and the Sarrak stay AI.
    const human = ids.find(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)))!;
    world.claimedFactionIds = [human];
    const ais = ids.filter(id => id !== human);
    // Every court has the tier-1 research a player needs for envoys and spies
    // (dip_t1_5, esp_t1_5 — no prerequisites; the AI's research reaches them early).
    for (const id of ais) {
        const st = world.tech.get(id) ?? TechEngine.initPlayerState(id);
        st.unlockedTechIds = [...new Set([...(st.unlockedTechIds ?? []), 'dip_t1_5', 'esp_t1_5'])];
        world.tech.set(id, st);
    }
    // The soak boot has no warships and no pirate bands; plant what a scenario needs.
    const capitalOf = (id: string) => world.economy.factions.get(id)?.capitalSystemId;
    const plantFleet = (owner: string, systemId: string, power: number) => {
        const id = `probe-fleet-${owner}-${world.movement.fleets.size}`;
        world.movement.fleets.set(id, { id, name: id, factionId: owner, currentSystemId: systemId, destinationSystemId: null,
            plannedPath: [], basePower: power, strength: 1, composition: { destroyer: 4 } });
        return id;
    };
    const realRandom = Math.random;
    const run = (fn: () => string[]) => { Math.random = () => 0; try { return fn(); } finally { Math.random = realRandom; } };
    const drain = () => drainAIOrders(world, executeOrder);
    const setCredits = (id: string, n: number) => { world.economy.factions.get(id).reserves.CREDITS = n; };
    const hate = (a: string, b: string, score: number, escalation = 0) => {
        const r: any = getOrCreateRivalry(world, a, b);
        r.rivalryScore = score; r.escalationLevel = escalation;
    };
    // Keep a pair apart from every other scenario.
    const plain = ais.filter(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)));
    const [a, b, c, d, e] = plain;

    // ── Press: a campaign against a hated rival, and a stance on its crisis ──
    const press = ensurePressState(world);
    hate(a, b, 75);
    (press.empires.get(a) as any).narrativeInfluence = 60;
    press.crises.set('crisis-probe', { id: 'crisis-probe', storyId: 's', targetEmpireId: b, deadlineTick: press.tick + 10, severity: 50, resolved: false } as any);
    run(() => runPressOffence(world, a));
    drain();
    const camp = [...press.campaigns.values()].find(x => x.attackerId === a && x.targetEmpireId === b && x.active);
    check('AI launches a press campaign on a hated rival (PRESS_LAUNCH_CAMPAIGN)', !!camp, camp?.objective ?? 'none');
    check('AI amplifies a rival\'s media crisis (PRESS_CRISIS_REACT)', press.crises.get('crisis-probe')?.reactions?.[a] === 'AMPLIFY');
    check('it keeps influence back for its own defence', Number((press.empires.get(a) as any).narrativeInfluence) >= 10,
        `${Number((press.empires.get(a) as any).narrativeInfluence)} left`);

    // ── Diplomacy: envoy, show of force, tribute ─────────────────────────────
    hate(c, d, 45, 1);
    setCredits(c, 50000);
    (world.government.get(c) as any).politicalCapital = 100;
    // `c` outguns `d` by far.
    plantFleet(c, capitalOf(c), 2000);
    plantFleet(d, capitalOf(d), 100);
    const envoyBefore = getOrCreateRivalry(world, c, d).rivalryScore;
    run(() => runDiplomaticOffence(world, c));
    drain();
    const dip = ensureDiplomacyState(world);
    check('AI sends an envoy to cool a quarrel (DIP_SEND_ENVOY)', getOrCreateRivalry(world, c, d).rivalryScore < envoyBefore,
        `${envoyBefore} → ${getOrCreateRivalry(world, c, d).rivalryScore}`);
    const gambit = [...dip.gambits.values()].find(g => g.initiatorId === c && g.targetId === d);
    check('AI presses a weaker rival with a gambit (DIP_LAUNCH_GAMBIT)', !!gambit, gambit?.kind ?? 'none');
    const tribute = [...dip.offers.values()].find(o => o.kind === 'tribute_demand' && o.fromFactionId === c && o.toFactionId === d);
    check('AI demands tribute from a much weaker rival (DIP_DEMAND_TRIBUTE)', !!tribute);

    // ── Pirates: a letter of marque in war ───────────────────────────────────
    foundOrganization(world, capitalOf(b), []);
    const bands = [...ensurePiracyState(world).organizations.values()].filter((o: any) => !o.dissolvedAtSeconds && !o.playerFactionId);
    if (bands.length === 0) skip('AI commissions privateers in war', 'no pirate band in this world');
    else {
        registerActOfWar(world, e, b);
        hate(e, b, 100, 7);
        setCredits(e, 60000);
        run(() => runPirateOffence(world, e));
        drain();
        const marque = [...ensurePiracyState(world).sponsorships.values()].find(s => s.sponsorFactionId === e && s.targetFactionId === b && !s.covert);
        check('AI commissions privateers against an enemy (PIR_ISSUE_MARQUE)', !!marque, marque?.organizationId ?? `at war ${isAtWar(world, e, b)}`);
    }

    // ── Banking Clan lends to the poor ───────────────────────────────────────
    const clan = ais.find(id => civ(id) === CIV_BANKING);
    if (!clan) skip('Banking Clan lends', 'Clan is human-claimed or absent');
    else {
        setCredits(clan, 200000);
        const poor = ids.find(id => id !== clan && id !== human)!;
        setCredits(poor, 1000);
        hate(clan, poor, 20);
        run(() => runBankingClan(world, clan));
        drain();
        const loans: any[] = Object.values(bankingState(world, clan)?.loans ?? {});
        check('Banking Clan writes a sovereign loan (BNK_ISSUE_LOAN)', loans.some(l => l.borrowerFactionId === poor), `${loans.length} loan(s)`);
    }

    // ── Sarrak rite in battle ────────────────────────────────────────────────
    const sarrak = ais.find(id => civ(id) === CIV_SARRAK);
    if (!sarrak) skip('Sarrak administer the serum in battle', 'Sarrak are human-claimed or absent');
    else {
        const foe = ais.find(id => id !== sarrak)!;
        registerActOfWar(world, sarrak, foe);
        plantFleet(sarrak, capitalOf(sarrak), 500);
        plantFleet(foe, capitalOf(sarrak), 500);
        {
            run(() => runUniqueRites(world, sarrak));
            drain();
            const st = world.factionTraits?.get(sarrak)?.sarrak;
            check('Sarrak administer the Divine Serum when engaged (SAR_ADMINISTER_SERUM)', (st?.dosesTaken ?? 0) > 0, `${st?.dosesTaken ?? 0} dose(s)`);
        }
    }

    // ── Agents: hire, then deploy ────────────────────────────────────────────
    setCredits(a, 80000);
    const agentsOf = () => [...world.espionage.agents.values()].filter((x: any) => x.ownerFactionId === a);
    const before = agentsOf().length;
    run(() => runAgentRoster(world, a));
    drain();
    check('AI recruits an agent (ESP_RECRUIT_AGENT)', agentsOf().length === before + 1, `${before} → ${agentsOf().length}`);
    run(() => runAgentRoster(world, a));
    drain();
    const bCapital = world.economy.factions.get(b)?.capitalSystemId;
    check('AI puts an agent to work in its rival\'s capital (ESP_ASSIGN_AGENT)',
        agentsOf().some((x: any) => x.status === 'deployed' && x.deployedToSystemId === bCapital), String(bCapital));

    // ── Companies ────────────────────────────────────────────────────────────
    const out = run(() => runCorporateLevers(world, a));
    drain();
    results.push(`  info  corporate levers this turn: ${out.length ? out.join('; ') : 'nothing needed'}`);

    // ── Human seats are never touched; a survival court does not pick fights ─
    const humanOut = run(() => runOffenceDesk(world, human, 'normal'));
    check('the desk queues nothing for a human seat', (world.aiOrderOutbox ?? []).length === 0, humanOut.join('; '));
    world.aiOrderOutbox = [];
    hate(d, c, 90);
    (press.empires.get(d) as any).narrativeInfluence = 80;
    const survival = run(() => runOffenceDesk(world, d, 'survival'));
    check('a court in survival launches no press campaign', !survival.some(s => s.includes('campaign')), survival.join('; ') || 'nothing');
    world.aiOrderOutbox = [];

    quiet.restore();
    console.log('\nAI offence probe');
    for (const r of results) console.log(r);
    if (quiet.complaints.size) {
        console.log('\nErrors raised during the run:');
        for (const [line, n] of quiet.complaints) console.log(`  ${n}× ${line}`);
    }
    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
    process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
