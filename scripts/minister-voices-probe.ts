// scripts/minister-voices-probe.ts
// Do the ministers talk like themselves? The register picked from the
// minister's numbers (and a plot), the sheet's coverage, the cabinet debate
// card, the advisor desk's proposal detail and the brief's ledger line.
//
// Run:  npx tsx scripts/minister-voices-probe.ts

import { bootSoakWorld, empireIds, quietConsole, seedSimulation } from './soak-harness';
import { CABINET_PORTFOLIOS } from '../lib/government/types';
import { MINISTER_LINES, ministerLine, ministerSays, registerOf, seedOf, type Hook, type Register } from '../lib/government/minister-voices';
import { ensureCabinets, generateCabinetAdvice, getMinister } from '../lib/government/cabinet-service';
import { getGovernment } from '../lib/government/government-service';
import { runAdvisorDesk } from '../lib/ai/advisor-desk';
import { openProposals, resolveProposal, advisorRecordFor } from '../lib/delegation/advisor-proposals';
import { collectAdvisorLedger } from '../lib/brief/daily-brief';
import { getOrCreateRivalry } from '../lib/diplomacy/offer-service';
import { WAR, warCandidates } from '../lib/ai/war-ai';
import { CIV_BANKING, CIV_SARRAK } from '../lib/factions/civ-ids';

let failures = 0;
const results: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
    if (!ok) failures++;
    results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const REGISTERS: Register[] = ['loyal', 'cooling', 'brutus', 'venal'];

async function main() {
    // ── Register from the numbers ───────────────────────────────────────────
    check('loyal at 60', registerOf({ name: 'x', loyalty: 60 }) === 'loyal');
    check('cooling at 59', registerOf({ name: 'x', loyalty: 59 }) === 'cooling');
    check('brutus at 34', registerOf({ name: 'x', loyalty: 34 }) === 'brutus');
    check('venal at corruption 50 whatever the loyalty', registerOf({ name: 'x', loyalty: 90, corruption: 50 }) === 'venal');
    check('a plotter is Brutus whatever the number', registerOf({ name: 'x', loyalty: 90 }, true) === 'brutus');
    check('no minister reads as loyal', registerOf(undefined) === 'loyal');

    // ── The sheet ───────────────────────────────────────────────────────────
    const must: Hook[] = ['appointed', 'dismissed', 'approved', 'declined', 'lapsed', 'morning'];
    for (const p of CABINET_PORTFOLIOS) {
        const missing = must.filter(h => !MINISTER_LINES[p][h]?.loyal?.length);
        check(`${p} has every answer hook`, missing.length === 0, missing.join(', '));
        const bad: string[] = [];
        for (const [hook, lines] of Object.entries(MINISTER_LINES[p])) {
            for (const r of REGISTERS) for (const line of lines[r] ?? []) {
                if (/\{(?!target\}|world\}|portfolio\})/.test(line)) bad.push(`${hook}/${r}: unknown placeholder`);
                if (line.length < 12) bad.push(`${hook}/${r}: too short`);
            }
        }
        check(`${p} lines are well formed`, bad.length === 0, bad.slice(0, 3).join('; '));
    }
    const total = CABINET_PORTFOLIOS.reduce((n, p) => n + Object.values(MINISTER_LINES[p]).reduce((m, l) => m + REGISTERS.reduce((k, r) => k + (l[r]?.length ?? 0), 0), 0), 0);
    check('the wired sheet is substantial', total >= 200, `${total} lines`);

    // ── Picking ─────────────────────────────────────────────────────────────
    check('placeholders are filled', ministerLine('defence', 'war_proposal', 'loyal', { target: 'Vektori' }, 0).includes('Vektori'));
    check('a missing placeholder reads as a word, not braces', !ministerLine('defence', 'war_proposal', 'loyal', {}, 0).includes('{'));
    check('a register with no line falls back to loyal', ministerLine('economy', 'strike', 'venal', {}, 0) === ministerLine('economy', 'strike', 'loyal', {}, 0));
    check('a hook the office has no line for is silent', ministerLine('science', 'siege_defending', 'loyal', {}, 0) === '');
    check('the same seed gives the same line', ministerLine('defence', 'war_proposal', 'loyal', {}, 7) === ministerLine('defence', 'war_proposal', 'loyal', {}, 7));
    check('different seeds rotate', new Set([0, 1, 2, 3].map(s => ministerLine('defence', 'war_proposal', 'loyal', {}, s))).size > 1);
    check('ministerSays quotes with the name', /^ Harrow: “.+”$/.test(ministerSays({ name: 'Harrow', loyalty: 80 }, 'defence', 'idle_peace')));
    check('seedOf is stable', seedOf('a', 1) === seedOf('a', 1) && seedOf('a', 1) !== seedOf('a', 2));

    // ── The cabinet debate card ─────────────────────────────────────────────
    seedSimulation('minister-voices');
    const quiet = quietConsole(line => line.startsWith('[Advisors]') || line.startsWith('[AI Orders]') || line.startsWith('[Order]') || line.startsWith('[Cabinet]'));
    const world: any = bootSoakWorld();
    const ids = empireIds(world);
    const civ = (id: string) => world.economy.factions.get(id)?.civilizationId;
    const plain = ids.filter(id => ![CIV_BANKING, CIV_SARRAK].includes(civ(id)) && id !== 'faction-buthari');
    const human = plain.includes('faction-movanites') ? 'faction-movanites' : plain[0];
    world.claimedFactionIds = [human];
    ensureCabinets(world);
    const defence: any = getMinister(world, human, 'defence');
    const economy: any = getMinister(world, human, 'economy');
    check('plant: the human has a cabinet', !!defence && !!economy);
    defence.loyalty = 80; defence.corruption = 0;
    economy.loyalty = 80; economy.corruption = 70;
    world.economy.factions.get(human).reserves.CREDITS = 500_000;
    let advice = generateCabinetAdvice(world, human);
    const card = (p: string) => advice.find(a => a.portfolio === p)!;
    check('a loyal admiral at peace speaks a loyal idle line', card('defence').register === 'loyal' && MINISTER_LINES.defence.idle_peace!.loyal!.includes(card('defence').advice), card('defence').advice);
    check('a corrupt treasurer is venal on the card', card('economy').register === 'venal' && (MINISTER_LINES.economy.routine!.venal!.includes(card('economy').advice) || MINISTER_LINES.economy.overextended!.venal!.includes(card('economy').advice)), card('economy').advice);
    defence.loyalty = 20;
    advice = generateCabinetAdvice(world, human);
    check('an admiral at loyalty 20 talks like Brutus', card('defence').register === 'brutus' && MINISTER_LINES.defence.idle_peace!.brutus!.includes(card('defence').advice), card('defence').advice);
    defence.loyalty = 80;
    world.plots = new Map([['p1', { id: 'p1', factionId: human, plotterLeaderId: defence.id, status: 'preparing', recruits: {} }]]);
    advice = generateCabinetAdvice(world, human);
    check('a plotting admiral talks like Brutus whatever the number', card('defence').register === 'brutus', card('defence').register);
    world.plots = new Map();
    world.economy.factions.get(human).reserves.CREDITS = 100;
    economy.corruption = 0;
    advice = generateCabinetAdvice(world, human);
    check('an empty reserve is the Treasury\'s subject', MINISTER_LINES.economy.reserves_low!.loyal!.includes(card('economy').advice), card('economy').advice);
    world.economy.factions.get(human).reserves.CREDITS = 500_000;
    const stable = generateCabinetAdvice(world, human).map(a => a.advice).join('|');
    check('the card does not flicker between syncs', stable === generateCabinetAdvice(world, human).map(a => a.advice).join('|'));

    // ── The advisor desk's proposal detail ──────────────────────────────────
    const [ai, prey] = ids.filter(id => id !== human);
    const DAY = 86400;
    world.aiWar ??= { firstSeenSeconds: world.nowSeconds, factions: {} };
    world.nowSeconds += (WAR.graceDays + 1) * DAY;
    const plantFleet = (owner: string, power: number) => {
        const id = `probe-fleet-${owner}`;
        world.movement.fleets.set(id, { id, name: id, factionId: owner, currentSystemId: world.economy.factions.get(owner).capitalSystemId,
            destinationSystemId: null, plannedPath: [], basePower: power, strength: 1, composition: { destroyer: 6 } });
    };
    plantFleet(human, 4000); plantFleet(ai, 4000);
    for (const id of ids) if (id !== human) (getOrCreateRivalry(world, human, id) as any).rivalryScore = 90;
    (getOrCreateRivalry(world, ai, prey) as any).rivalryScore = 90;
    const gov: any = getGovernment(world, human);
    gov.politicalCapital = 100; gov.politicalCapitalCap = 100; gov.warFatigue = 0;
    world.economy.factions.get(human).reserves.METALS = 500_000;
    const candidate = warCandidates(world, human)[0];
    check('plant: a war candidate', !!candidate);
    if (candidate) {
        defence.loyalty = 45; defence.corruption = 0;
        runAdvisorDesk(world);
        const warP = openProposals(world, human).find(p => p.actionId === 'DIP_DECLARE_WAR');
        check('the war proposal opens with the admiral, in the cooling register', !!warP && warP.detail.startsWith(`${defence.name}: “`) && MINISTER_LINES.defence.war_proposal!.cooling!.some(l => l.split('{target}').every(part => warP.detail.includes(part))), warP?.detail.slice(0, 120));
        check('…and still carries the plain detail and the price', !!warP && /political capital/.test(warP.detail));
        const fleetP = openProposals(world, human).find(p => p.actionId === 'MIL_BUILD_FLEET');
        check('the battle group proposal has the admiral\'s line too', !!fleetP && fleetP.detail.startsWith(`${defence.name}: “`), fleetP?.detail.slice(0, 100));

        // ── The brief's ledger ────────────────────────────────────────────
        if (warP) {
            resolveProposal(world, human, warP.id, 'decline');
            const now = new Date();
            const lines = collectAdvisorLedger({ factionId: human, world, now }, new Date(now.getTime() - 86_400_000), now);
            const declined = lines.find(l => l.outcome === 'declined');
            check('the ledger line carries the admiral\'s answer to a decline', !!declined && declined.text.includes('you declined.') && declined.text.includes(`${defence.name}: “`) && MINISTER_LINES.defence.declined!.cooling!.some(l => declined.text.includes(l)), declined?.text);
            check('…and the ledger entry itself is unchanged', advisorRecordFor(world, human).ledger.some(e => e.outcome === 'declined' && !e.title.includes('“')));
        }
    }
    quiet.restore();

    console.log('\nminister voices probe\n' + results.join('\n'));
    console.log(failures ? `\n${failures} FAILED` : '\nall ok');
    process.exit(failures ? 1 : 0);
}

main().catch(e => {
    process.stderr.write(`minister voices probe crashed: ${e?.stack ?? e}\n`);
    if (results.length) process.stderr.write(results.join('\n') + '\n');
    process.exit(1);
});
