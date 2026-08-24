// scripts/debate-probe.ts
// Does the political arena actually close the loop the design asks for?
//   event → question opens → blocs position → leader resolves or stalls →
//   satisfaction AND INFLUENCE shift → future support rolls change.
//
//   npx tsx scripts/debate-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { ensureGovernments } from '../lib/government/government-service';
import { computeActionSupport } from '../lib/politics/support-service';
import { DEBATE_CATALOG, forecastResolutions, debateTitle } from '../lib/politics/debate-types';
import {
    openDebate, resolveDebate, tickDebates, openQuestionsOf,
} from '../lib/politics/debate-service';
import { registerActOfWar, breakTreaty } from '../lib/diplomacy/offer-service';
import { pendingCount, resetChronicleBuffer } from '../lib/narrative/chronicle';

const US = 'faction-leopantheri';
const AGGRESSOR = 'faction-kaerruun';
const TICK = 6 * 60 * 60;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

const world: any = getGameWorldState();
ensureEmpirePostures(world);
ensureGovernments(world);
world.nowSeconds = 9_000_000;
// The player claims US; every other empire is AI.
world.claimedFactionIds = [US];

const posture = () => world.movement.empirePostures.get(US);
const gov = () => world.government.get(US);
const blocsByld = () => Object.fromEntries(posture().blocs.map((b: any) => [b.id, b]));

// ── 1. Events open questions ────────────────────────────────────────────────
console.log('\n[1] The galaxy puts questions on the table');
{
    check('the chamber starts empty', openQuestionsOf(world, US).length === 0);

    // A real act of war, through the real path.
    registerActOfWar(world, AGGRESSOR, US);
    const open = openQuestionsOf(world, US);
    check('being attacked convenes the chamber', open.length === 1, `got ${open.length}`);
    check('the question knows who did it', open[0]?.aggressorFactionId === AGGRESSOR);
    check('and names them in the headline', /Kaer|kaerruun/i.test(debateTitle(open[0] as any)));

    // Idempotent per aggressor — a war is one debate, not one per skirmish.
    registerActOfWar(world, AGGRESSOR, US);
    check('the same war does not open a second identical debate',
        openQuestionsOf(world, US).length === 1);

    // A faction with no political machinery never gets questions.
    const before = openQuestionsOf(world, 'faction-nonexistent').length;
    openDebate(world, 'faction-nonexistent', 'war_declared_on_us', {});
    check('a faction without politics has nobody to argue', before === 0
        && openQuestionsOf(world, 'faction-nonexistent').length === 0);
}

// ── 2. Blocs position through the one shared engine ─────────────────────────
console.log('\n[2] The blocs take sides');
{
    const q: any = openQuestionsOf(world, US)[0];
    const forecasts = forecastResolutions(q, posture().blocs, { warFatigue: 0, rivalryScore: 20, publicTrust: 60 });
    check('every resolution gets a forecast', forecasts.length === DEBATE_CATALOG.war_declared_on_us.resolutions.length);

    const mobilization = forecasts.find(f => f.resolutionId === 'total_mobilization')!;
    const military = mobilization.blocs.find(b => b.id === 'military');
    const trade = mobilization.blocs.find(b => b.id === 'trade');
    check('the generals demand mobilization', (military?.stance ?? 0) > 0.5);
    check('the merchants oppose it', (trade?.stance ?? 0) < 0);
    check('forecasts are influence-weighted totals', mobilization.total >= 0 && mobilization.total <= 100);
}

// ── 3. Resolution: mood, POWER, treasury, record ────────────────────────────
console.log('\n[3] The leader chooses, and it costs');
{
    const q: any = openQuestionsOf(world, US)[0];
    const before = blocsByld();
    const militarySatBefore = before.military.satisfaction;
    const tradeSatBefore = before.trade.satisfaction;
    const militaryInfBefore = before.military.influence;
    const tradeInfBefore = before.trade.influence;
    const pcBefore = gov().politicalCapital = 50;
    const legitimacyBefore = gov().legitimacy;
    resetChronicleBuffer();

    const res = resolveDebate(world, US, q.id, 'total_mobilization');
    check('the resolution goes through', res.ok === true, res.reason ?? '');
    check('the question leaves the table', openQuestionsOf(world, US).length === 0);

    const after = blocsByld();
    check('the winners warm', after.military.satisfaction > militarySatBefore);
    check('the overridden sour', after.trade.satisfaction < tradeSatBefore);

    // THE ARC'S POINT. influence has been consumed by computeActionSupport
    // since the day it was written and nothing ever changed it. Now it moves.
    check('the winning bloc grows LOUDER', after.military.influence > militaryInfBefore,
        `${militaryInfBefore.toFixed(1)} -> ${after.military.influence.toFixed(1)}`);
    check('the losing bloc loses standing', after.trade.influence < tradeInfBefore,
        `${tradeInfBefore.toFixed(1)} -> ${after.trade.influence.toFixed(1)}`);
    const totalInfluence = posture().blocs.reduce((s: number, b: any) => s + b.influence, 0);
    check('influence stays a 100-share', Math.abs(totalInfluence - 100) < 0.01, `sums ${totalInfluence.toFixed(2)}`);

    check('political capital was spent', gov().politicalCapital < pcBefore);
    check('legitimacy moved by the authored delta',
        gov().legitimacy === Math.min(100, legitimacyBefore + 2), `${legitimacyBefore} -> ${gov().legitimacy}`);
    check('the chronicle recorded the vote — the gazette can cover politics now',
        pendingCount() > 0);

    // And the shifted influence reaches FUTURE support rolls — the loop closes.
    const supportNow = computeActionSupport(posture().blocs, 'declare_war', { warFatigue: 0, rivalryScore: 80 });
    const rebalanced = posture().blocs.map((b: any) => ({ ...b, influence: b.id === 'military' ? militaryInfBefore : b.influence }));
    const supportOld = computeActionSupport(rebalanced, 'declare_war', { warFatigue: 0, rivalryScore: 80 });
    check('a louder military bloc genuinely changes the next war vote',
        supportNow.total !== supportOld.total, `${supportOld.total}% -> ${supportNow.total}%`);
}

// ── 4. Refusals ─────────────────────────────────────────────────────────────
console.log('\n[4] Refusals reach the player with a reason');
{
    registerActOfWar(world, 'faction-sarrak', US);
    const q: any = openQuestionsOf(world, US)[0];
    check('precondition: a question is open', !!q);

    gov().politicalCapital = 0;
    const broke = resolveDebate(world, US, q.id, 'total_mobilization');
    check('an empty treasury refuses, with the price named',
        broke.ok === false && /political capital/i.test(broke.reason ?? ''), broke.reason);
    gov().politicalCapital = 50;

    check('an unknown resolution is refused', resolveDebate(world, US, q.id, 'nonsense').ok === false);
    check('an unknown question is refused', resolveDebate(world, US, 'debate-nope', 'total_mobilization').ok === false);
    resolveDebate(world, US, q.id, 'measured_response');
}

// ── 5. Stalling: fester and the IGNORED deadline ────────────────────────────
console.log('\n[5] Doing nothing is a choice with a price');
{
    registerActOfWar(world, 'faction-movanites', US);
    const q: any = openQuestionsOf(world, US)[0];
    const spec = DEBATE_CATALOG[q.kind as keyof typeof DEBATE_CATALOG];
    const militarySatBefore = blocsByld().military.satisfaction;

    // Fester: the invested blocs agitate while the question sits.
    world.nowSeconds += TICK;
    tickDebates(world);
    check('the question survives an ordinary tick', openQuestionsOf(world, US).length === 1);
    check('but the invested blocs bleed while it sits',
        blocsByld().military.satisfaction < militarySatBefore,
        `${militarySatBefore.toFixed(1)} -> ${blocsByld().military.satisfaction.toFixed(1)}`);

    // The deadline: the chamber remembers being ignored.
    const legitimacyBefore = gov().legitimacy;
    const militaryInfBefore = blocsByld().military.influence;
    world.nowSeconds = q.deadlineAtSeconds + 1;
    tickDebates(world);
    check('at the deadline the question resolves itself as IGNORED',
        openQuestionsOf(world, US).length === 0);
    check('ignoring it costs legitimacy', gov().legitimacy < legitimacyBefore,
        `${legitimacyBefore} -> ${gov().legitimacy}`);
    check('and the loudest ignored bloc RECRUITS on the grievance',
        blocsByld().military.influence > militaryInfBefore,
        `${militaryInfBefore.toFixed(1)} -> ${blocsByld().military.influence.toFixed(1)}`);
    void spec;
}

// ── 6. AI empires answer their questions ────────────────────────────────────
console.log('\n[6] AI governments are not paralysed');
{
    // A FRESH pair — registerActOfWar fires its consequences once per war, and
    // US/AGGRESSOR have been at war since section 1.
    const AI_DEFENDER = 'faction-gabagoonians';
    registerActOfWar(world, US, AI_DEFENDER);
    check('the AI defender got a question', openQuestionsOf(world, AI_DEFENDER).length === 1);
    const gk = world.government.get(AI_DEFENDER);
    if (gk) gk.politicalCapital = 50;

    world.nowSeconds += TICK + 1;
    tickDebates(world);
    check('one tick later the AI has answered by consensus',
        openQuestionsOf(world, AI_DEFENDER).length === 0);
}

// ── 7. Treaty and espionage triggers, persistence, layering ─────────────────
console.log('\n[7] The other doors into the chamber, and the plumbing');
{
    // Treaty broken on us — through the real breakTreaty path.
    world.treaties.set('t-probe', {
        id: 't-probe', type: 'trade_pact', status: 'active',
        signatories: ['faction-sarrak', US], signedAt: world.nowSeconds,
    } as any);
    breakTreaty(world, 'faction-sarrak', 't-probe');
    check('a torn-up accord convenes the chamber',
        openQuestionsOf(world, US).some(q => q.kind === 'treaty_broken_on_us'));

    check('the espionage trigger is wired at the exposure site',
        /attributionState === 'exposed'[\s\S]{0,600}openDebate\(world, op\.targetFactionId, 'espionage_exposed_on_us'/
            .test(code('lib/espionage/espionage-service.ts')));
    check('the conquest trigger is wired inside capturePlanet',
        /recordConquest\(world, attackerId, planet\.id, previousOwnerId\);[\s\S]{0,700}openDebate\(world, previousOwnerId, 'territory_lost'/
            .test(code('scripts/game-loop.ts')));

    // Persistence: questions ride the posture through a full round trip.
    const round: any = deserializeWorld(serializeWorld(world));
    ensureEmpirePostures(round);
    check('open questions survive a save/load round trip',
        openQuestionsOf(round, US).some(q => q.kind === 'treaty_broken_on_us'));
    check('a pre-arena snapshot is back-filled, not crashed',
        Array.isArray((round.movement.empirePostures.get('faction-vektori') as any)?.openQuestions));

    // The tick step sits before tickGovernments so shifts land the same tick.
    const tp = code('lib/time/tick-processor.ts');
    check('tickDebates runs on the strategic tick, before tickGovernments',
        tp.indexOf('tickDebates(world)') > -1 && tp.indexOf('tickDebates(world)') < tp.indexOf('tickGovernments(world'));

    // Layering: the catalog is pure, and the client resolves forecasts through
    // the same engine — no private copy of the math anywhere.
    const dt = code('lib/politics/debate-types.ts');
    check('debate-types imports only the pure support engine',
        [...dt.matchAll(/from '([^']+)'/g)].every(m => m[1] === './support-service'));
    check('useGameSync precomputes forecasts through the shared engine',
        /forecastResolutions\(q, \(playerPosture as any\)\.blocs/.test(code('hooks/useGameSync.ts')));
    check('the panel renders forecasts and never recomputes them',
        !/forecastResolutions|computeSupportFromStances/.test(code('components/panels/GovernmentPanel.tsx')));
    check('the order is registered, so it cannot be silently dropped',
        /GOV_RESOLVE_DEBATE/.test(code('lib/actions/registry.ts')) && /GOV_RESOLVE_DEBATE/.test(code('lib/actions/types.ts')));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ The political arena is live\n`);
process.exit(failures ? 1 : 0);
