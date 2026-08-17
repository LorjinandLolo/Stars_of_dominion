// scripts/kaerruun-probe.ts
// Are the Kaer'Ruun mechanics LIVE, or just written?
//
// Covers all four: Bloodmoon Ceasefire, Ritual Brutality, Fear Aura and
// Mercenary Contracts. The assertions are chosen against this codebase's actual
// failure mode, which is never a crash: it is a system that looks implemented and
// is never called, or a value that lands where the engine clamps or overwrites it.
//
//   npx tsx scripts/kaerruun-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, tickFactionTraits } from '../lib/factions/traits-service';
import {
    BLOODMOON_CYCLE_SECONDS,
    BLOODMOON_CEASEFIRE_SECONDS,
    BLOODMOON_UNREST,
    BRUTALITY_MAX,
    TROPHY_METRIC,
    isInBloodmoonCeasefire,
    checkCeasefireGate,
    getBrutalityBonus,
    recordTrophyKill,
    shouldRoutFromFear,
    activeContracts,
    FEAR_ROUT_BASE_CHANCE,
    FEAR_ROUT_TROPHY_BONUS,
} from '../lib/factions/kaerruun';
import { getMetric } from '../lib/tech/history-ledger';
import { calculateEffectivePower, initiateCombat, advanceRound, traitMultiplier } from '../lib/combat/combat-engine';
import type { CombatantState } from '../lib/combat/combat-types';
import { tickCohesion } from '../lib/government/cohesion-service';
import { ensureGovernments } from '../lib/government/government-service';
import { processSectorCombats } from '../lib/combat/combat-manager';
import { createOffer, respondToOffer, registerActOfWar } from '../lib/diplomacy/offer-service';
import { wouldAccept } from '../lib/ai/diplomatic-ai-service';

const KR = 'faction-kaerruun';
const OTHER = 'faction-sarrak';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const world = getGameWorldState();
ensureFactionTraits(world);

// ── 1. The window is derived from the clock, not counted ────────────────────
console.log('\n[1] Bloodmoon window');
{
    for (const k of [0, 977]) {
        const base = k * BLOODMOON_CYCLE_SECONDS;
        world.nowSeconds = base;
        check(`cycle ${k}: open at onset`, isInBloodmoonCeasefire(world, KR));
        world.nowSeconds = base + BLOODMOON_CEASEFIRE_SECONDS - 1;
        check(`cycle ${k}: still open one second before it lifts`, isInBloodmoonCeasefire(world, KR));
        world.nowSeconds = base + BLOODMOON_CEASEFIRE_SECONDS + 1;
        check(`cycle ${k}: shut after it lifts`, !isInBloodmoonCeasefire(world, KR));
    }
    // Faction scoping — nobody else observes the rite.
    world.nowSeconds = 0;
    check('another faction is never in a Bloodmoon', !isInBloodmoonCeasefire(world, OTHER));
}

// ── 2. The order gate ───────────────────────────────────────────────────────
console.log('\n[2] Order gate');
{
    world.nowSeconds = 0;
    check('blocks MIL_ATTACK_FLEET in-window',
        checkCeasefireGate(world, KR, 'MIL_ATTACK_FLEET').allowed === false);
    check('blocks ESP_SABOTAGE_FACILITY in-window',
        checkCeasefireGate(world, KR, 'ESP_SABOTAGE_FACILITY').allowed === false);
    check('does NOT block moving a fleet — a rite is not a grounding',
        checkCeasefireGate(world, KR, 'MIL_MOVE_FLEET').allowed === true);
    check('does NOT block another faction in the same second',
        checkCeasefireGate(world, OTHER, 'MIL_ATTACK_FLEET').allowed === true);

    world.nowSeconds = BLOODMOON_CEASEFIRE_SECONDS + 1;
    check('allows MIL_ATTACK_FLEET once it lifts',
        checkCeasefireGate(world, KR, 'MIL_ATTACK_FLEET').allowed === true);

    const reason = (world.nowSeconds = 0, checkCeasefireGate(world, KR, 'MIL_ATTACK_FLEET').reason ?? '');
    check('refusal carries a player-readable reason', /Bloodmoon/.test(reason), reason);
}

// ── 3. Violation actually moves the numbers ─────────────────────────────────
console.log('\n[3] Violation is live (the assertion that catches a dead write)');
{
    // A Kaer'Ruun world, and a war.
    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === KR);
    check('Kaer\'Ruun own at least one world', !!planet);
    if (planet) {
        planet.stability = 80;
        world.rivalries.set(`rivalry-${KR}-${OTHER}`, {
            id: `rivalry-${KR}-${OTHER}`, aFactionId: KR, bFactionId: OTHER,
            escalationLevel: 7, recentEvents: [],
        } as any);

        const traits = world.factionTraits!.get(KR)!;
        traits.kaerruun = { lastResolvedCycle: -1, inViolation: false, lastEvaluatedSeconds: 0, violations: 0, observed: 0, contracts: {} };

        world.nowSeconds = 40 * BLOODMOON_CYCLE_SECONDS;   // an onset
        tickFactionTraits(world);

        check('planet stability dropped by exactly the penalty',
            near(planet.stability, 80 - BLOODMOON_UNREST), `got ${planet.stability}`);
        check('violation was latched', traits.kaerruun!.inViolation === true);
        check('violation counted', traits.kaerruun!.violations === 1);

        // The write must SURVIVE cohesion, which recomputes gov.stability wholesale.
        ensureGovernments(world);
        const gov: any = world.government.get(KR);
        if (gov) {
            gov.stability = 100;
            tickCohesion(world, 6 * 60 * 60);
            check('gov.stability reflects the wounded world after tickCohesion',
                gov.stability < 100, `got ${gov.stability}`);
        } else {
            check('government exists for Kaer\'Ruun', false, 'no government record');
        }

        // Idempotent within a cycle.
        const before = planet.stability;
        tickFactionTraits(world);
        check('a second tick in the same cycle does not re-punish',
            near(planet.stability, before), `${before} -> ${planet.stability}`);

        // Observed cleanly when not at war.
        world.rivalries.delete(`rivalry-${KR}-${OTHER}`);
        // Step forward one tick at a time into the next cycle — a jump of a whole
        // cycle would (correctly) trip the clock-jump guard and skip the onset.
        traits.kaerruun!.lastEvaluatedSeconds = 41 * BLOODMOON_CYCLE_SECONDS - 6 * 60 * 60;
        world.nowSeconds = 41 * BLOODMOON_CYCLE_SECONDS;
        const s2 = planet.stability;
        tickFactionTraits(world);
        check('a clean cycle costs nothing', near(planet.stability, s2), `got ${planet.stability}`);
        check('clean cycle counted as observed', traits.kaerruun!.observed >= 1);
    }
}

// ── 4. Clock jumps must not fire or skip an onset ───────────────────────────
console.log('\n[4] Clock-jump guard');
{
    const traits = world.factionTraits!.get(KR)!;
    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === KR);
    world.rivalries.set(`rivalry-${KR}-${OTHER}`, {
        id: `rivalry-${KR}-${OTHER}`, aFactionId: KR, bFactionId: OTHER,
        escalationLevel: 7, recentEvents: [],
    } as any);
    planet.stability = 80;

    world.nowSeconds = 500 * BLOODMOON_CYCLE_SECONDS;    // huge forward jump
    tickFactionTraits(world);
    check('a large forward jump resynchronises without punishing',
        near(planet.stability, 80), `got ${planet.stability}`);

    world.nowSeconds = 10 * BLOODMOON_CYCLE_SECONDS;     // backward jump
    tickFactionTraits(world);
    check('a backward jump resynchronises without punishing',
        near(planet.stability, 80), `got ${planet.stability}`);
    world.rivalries.delete(`rivalry-${KR}-${OTHER}`);
}

// ── 5. Trophies persist ─────────────────────────────────────────────────────
console.log('\n[5] Ritual Brutality — the counter');
{
    const before = getMetric(world as any, KR, TROPHY_METRIC);
    recordTrophyKill(world, KR);
    check('a kill is recorded', getMetric(world as any, KR, TROPHY_METRIC) === before + 1);

    recordTrophyKill(world, OTHER);
    check('a non-Kaer\'Ruun kill is NOT recorded as a trophy',
        getMetric(world as any, OTHER, TROPHY_METRIC) === 0);

    const round = deserializeWorld(serializeWorld(world));
    check('trophies survive a save/load round trip',
        getMetric(round as any, KR, TROPHY_METRIC) === before + 1,
        `got ${getMetric(round as any, KR, TROPHY_METRIC)}`);
    check('factionTraits survive a save/load round trip',
        round.factionTraits instanceof Map && !!round.factionTraits.get(KR)?.kaerruun);
}

// ── 6. The bonus saturates and is faction-scoped ────────────────────────────
console.log('\n[6] Ritual Brutality — the curve');
{
    const ledger: any = world.techHistory!.get(KR)!;
    ledger.counters[TROPHY_METRIC] = 0;
    check('no kills, no bonus', getBrutalityBonus(world, KR) === 0);

    ledger.counters[TROPHY_METRIC] = 40;
    const at40 = getBrutalityBonus(world, KR);
    ledger.counters[TROPHY_METRIC] = 100_000;
    const atHuge = getBrutalityBonus(world, KR);

    check('bonus grows with kills', at40 > 0 && atHuge > at40, `${at40} -> ${atHuge}`);
    check('bonus saturates below the ceiling', atHuge < BRUTALITY_MAX + 1e-9, `got ${atHuge}`);
    check('100k kills is not a runaway', atHuge < BRUTALITY_MAX * 1.001);
    check('a non-Kaer\'Ruun faction gets nothing', getBrutalityBonus(world, OTHER) === 0);
    ledger.counters[TROPHY_METRIC] = 40;
}

// ── 7. The clamp — WHY the bonus is applied post-clamp ──────────────────────
console.log('\n[7] The ±40% clamp this design exists to dodge');
{
    const mk = (mods: Record<string, number>, traits?: any): CombatantState => ({
        factionId: KR, role: 'attacker', hp: 1000, maxHp: 1000,
        composition: { cruiser: 10 } as any, casualties: 0, morale: 0.5,
        doctrine: 'aggressive', predictionPoints: 0, selectedStance: 'shock',
        techModifiers: mods, traitBonuses: traits,
    } as any);

    const plain = calculateEffectivePower(mk({}), mk({}), 'orbital', 1.0);
    const huge = calculateEffectivePower(mk({ combat_power_multiplier: 5 }), mk({}), 'orbital', 1.0);
    check('techModifiers saturate at the ±40% ceiling',
        near(huge, 1000 * 1.4, 1e-6), `got ${huge} (plain ${plain})`);
    const huger = calculateEffectivePower(mk({ combat_power_multiplier: 50 }), mk({}), 'orbital', 1.0);
    check('+5000% buys exactly the same as +500% — this is why traits go post-clamp',
        near(huge, huger, 1e-6), `${huge} vs ${huger}`);

    // The trait path, by contrast, is not clamped.
    const state = initiateCombat('probe', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 } as any,
        mk({}, { brutality: 0.3 }), mk({}));
    check('traitMultiplier applies the bonus', traitMultiplier(state.attacker, state) > 1.0);
    check('a combatant with no traits is unaffected', traitMultiplier(state.defender, state) === 1.0);
}

// ── 8. The duration ramp reads the counter that does not reset ──────────────
console.log('\n[8] Engagement ramp');
{
    const mk = (traits?: any): CombatantState => ({
        factionId: KR, role: 'attacker', hp: 100000, maxHp: 100000,
        composition: { cruiser: 10 } as any, casualties: 0, morale: 0.5,
        doctrine: 'aggressive', predictionPoints: 0, selectedStance: 'shock',
        techModifiers: {}, traitBonuses: traits,
    } as any);

    const state = initiateCombat('probe2', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 } as any,
        mk({ brutality: 0.1 }), mk());
    check('elapsedRounds starts at 0', state.elapsedRounds === 0);

    const seenRounds: number[] = [];
    for (let i = 0; i < 6; i++) { advanceRound(state); seenRounds.push(state.round); }
    check('elapsedRounds counted every round', state.elapsedRounds === 6, `got ${state.elapsedRounds}`);
    check('state.round DID reset mid-battle — proving we read the right field',
        seenRounds.some((r, i) => i > 0 && r < seenRounds[i - 1]), seenRounds.join(','));

    const early = initiateCombat('probe3', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 } as any,
        mk({ brutality: 0.1 }), mk());
    const lateMult = traitMultiplier(state.attacker, state);
    const earlyMult = traitMultiplier(early.attacker, early);
    check('a long engagement hits harder than a fresh one', lateMult > earlyMult, `${earlyMult} -> ${lateMult}`);
}

// ── 8b. Fear Aura ───────────────────────────────────────────────────────────
console.log('\n[8b] Fear Aura');
{
    const SYS = [...world.movement.systems.keys()][40];
    const mkFleet = (id: string, factionId: string, power: number): any => ({
        id, factionId, currentSystemId: SYS, destinationSystemId: null,
        originSystemId: [...world.movement.systems.keys()][41],
        basePower: power, strength: 1, composition: { cruiser: 5 },
        doctrine: { moraleDrift: 0 }, path: [], layer: 'hyperlane',
        // Pathing reads these; a fleet without them cannot be routed.
        hyperdriveProfile: { hyperlane: 1, gate: 1, deepspace: 2, wormhole: 1 },
        orders: [],
        isDetectable: true,
    });

    const setup = (predatorId: string, preyId: string, preyPower: number) => {
        world.movement.fleets.clear();
        world.activeCombats.clear();
        world.movement.fleets.set('f-pred', mkFleet('f-pred', predatorId, 1000));
        world.movement.fleets.set('f-prey', mkFleet('f-prey', preyId, preyPower));
        world.rivalries.set(`rivalry-${predatorId}-${preyId}`, {
            id: `rivalry-${predatorId}-${preyId}`, aFactionId: predatorId, bFactionId: preyId,
            escalationLevel: 7, recentEvents: [],
        } as any);
        world.nowSeconds = 99 * BLOODMOON_CYCLE_SECONDS + BLOODMOON_CEASEFIRE_SECONDS + 1; // not in a rite
    };

    // ── The predicate itself, with the roll controlled ──────────────────────
    (world.techHistory!.get(KR)! as any).counters[TROPHY_METRIC] = 100_000; // maximum dread
    const always = { next: () => 0 };      // every roll passes
    const never = { next: () => 0.999 };   // every roll fails
    check('a much weaker enemy qualifies',
        shouldRoutFromFear(world, KR, 1000, OTHER, 100, 'c', always) === true);
    check('a comparable enemy never qualifies, however lucky the roll',
        shouldRoutFromFear(world, KR, 1000, OTHER, 900, 'c', always) === false);
    check('the roll can still save a weak fleet',
        shouldRoutFromFear(world, KR, 1000, OTHER, 100, 'c', never) === false);
    check('a non-Kaer\'Ruun predator has no aura',
        shouldRoutFromFear(world, OTHER, 1000, 'faction-buthari', 100, 'c', always) === false);
    check('Kaer\'Ruun do not flee Kaer\'Ruun',
        shouldRoutFromFear(world, KR, 1000, KR, 100, 'c', always) === false);

    // Dread scales with trophies: a fresh host is less frightening.
    (world.techHistory!.get(KR)! as any).counters[TROPHY_METRIC] = 0;
    const midRoll = { next: () => (FEAR_ROUT_BASE_CHANCE + FEAR_ROUT_TROPHY_BONUS) * 0.9 };
    check('an unblooded host frightens less', shouldRoutFromFear(world, KR, 1000, OTHER, 100, 'c', midRoll) === false);
    (world.techHistory!.get(KR)! as any).counters[TROPHY_METRIC] = 100_000;
    check('a blooded host frightens more', shouldRoutFromFear(world, KR, 1000, OTHER, 100, 'c', midRoll) === true);

    // ── The integration, across many seeds ──────────────────────────────────
    // The roll is seeded from the pairing and a quantized clock, so any single
    // setup is deterministic. Sweep hour buckets rather than trusting one seed.
    let routs = 0, engagements = 0;
    let movedSomewhere = false;
    for (let hour = 0; hour < 24; hour++) {
        setup(KR, OTHER, 50);
        world.nowSeconds += hour * 3600;
        processSectorCombats(world);
        const f: any = world.movement.fleets.get('f-prey');
        if (world.activeCombats.size === 0) { routs++; if (f?.destinationSystemId) movedSomewhere = true; }
        else engagements++;
    }
    check('the aura fires across seeds', routs > 0, `${routs}/24 routed`);
    check('the aura is not a blanket suppressor', engagements > 0, `${engagements}/24 fought`);
    check('a routed fleet is PHYSICALLY moved — otherwise it re-rolls every 5s', movedSomewhere);
    console.log(`  (routed ${routs}/24, fought ${engagements}/24)`);

    // Re-running must not re-roll a fleet that is already leaving.
    setup(KR, OTHER, 50);
    const f0: any = world.movement.fleets.get('f-prey');
    f0.routedUntilSeconds = world.nowSeconds + 3600;
    processSectorCombats(world);
    check('a fleet already running is not engaged', world.activeCombats.size === 0);

    // A near-equal fleet stands and fights.
    setup(KR, OTHER, 900);
    processSectorCombats(world);
    check('a comparable fleet does NOT rout — this is not a blanket combat suppressor',
        world.activeCombats.size > 0, `combats=${world.activeCombats.size}`);

    // Two non-Kaer'Ruun factions: no aura at all.
    setup(OTHER, 'faction-buthari', 50);
    processSectorCombats(world);
    check('no aura between two other factions',
        world.activeCombats.size > 0, `combats=${world.activeCombats.size}`);

    world.movement.fleets.clear();
    world.activeCombats.clear();
    (world.techHistory!.get(KR)! as any).counters[TROPHY_METRIC] = 40;
}

// ── 8c. Mercenary contracts ─────────────────────────────────────────────────
console.log('\n[8c] Mercenary contracts');
{
    const EMPLOYER = 'faction-movanites';
    const term = 30 * 6 * 60 * 60;
    const RETAINER = 250;

    const reset = () => {
        world.nowSeconds = 200 * BLOODMOON_CYCLE_SECONDS + BLOODMOON_CEASEFIRE_SECONDS + 1;
        world.diplomacy.offers.clear();
        world.diplomacy.cooldowns.clear();
        world.rivalries.clear();
        world.factionTraits!.get(KR)!.kaerruun!.contracts = {};
        (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS = 100_000;
        (world.economy.factions.get(KR)!.reserves as any).CREDITS = 0;
    };
    const terms = { resourceKey: 'CREDITS', retainerPerTick: RETAINER, termSeconds: term };

    // Only the Kaer'Ruun sell themselves.
    reset();
    check('a non-mercenary civilization cannot offer a contract',
        createOffer(world, EMPLOYER, { kind: 'mercenary_contract', toFactionId: KR, contractTerms: terms }).success === false);
    const made = createOffer(world, KR, { kind: 'mercenary_contract', toFactionId: EMPLOYER, contractTerms: terms });
    check('the Kaer\'Ruun can', made.success === true, made.message);

    // Accepting creates a live contract.
    const offer = [...world.diplomacy.offers.values()].find(o => o.kind === 'mercenary_contract')!;
    check('the offer exists', !!offer);
    respondToOffer(world, EMPLOYER, offer.id, 'accept');
    const live = activeContracts(world, KR);
    check('accepting creates an active contract', live.length === 1, `got ${live.length}`);
    check('the reserve key was normalised to UPPERCASE', live[0]?.resourceKey === 'CREDITS');

    // THE payout assertion — this is the whole reason the mechanic can be trusted.
    const empBefore = (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS;
    const krBefore = (world.economy.factions.get(KR)!.reserves as any).CREDITS;
    tickFactionTraits(world);
    const empAfter = (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS;
    const krAfter = (world.economy.factions.get(KR)!.reserves as any).CREDITS;
    check('the employer paid exactly the retainer', near(empBefore - empAfter, RETAINER), `${empBefore} -> ${empAfter}`);
    check('the contractor received exactly the retainer', near(krAfter - krBefore, RETAINER), `${krBefore} -> ${krAfter}`);
    check('paidToDate tracks it', activeContracts(world, KR)[0]?.paidToDate === RETAINER);

    // The regression guard against becoming world.tributes.
    check('no lowercase "credits" key was created on the employer',
        (world.economy.factions.get(EMPLOYER)!.reserves as any)['credits'] === undefined);
    check('no lowercase "credits" key was created on the contractor',
        (world.economy.factions.get(KR)!.reserves as any)['credits'] === undefined);

    // Default rather than accrue debt.
    (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS = 1;
    tickFactionTraits(world);
    const defaulted = Object.values(world.factionTraits!.get(KR)!.kaerruun!.contracts)[0];
    check('an employer who cannot pay defaults', defaulted?.status === 'defaulted', defaulted?.status);
    check('no negative balance is left behind',
        (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS >= 0);

    // Expiry.
    reset();
    createOffer(world, KR, { kind: 'mercenary_contract', toFactionId: EMPLOYER, contractTerms: terms });
    const o2 = [...world.diplomacy.offers.values()].find(o => o.kind === 'mercenary_contract' && o.status === 'pending')!;
    respondToOffer(world, EMPLOYER, o2.id, 'accept');
    world.nowSeconds += term + 1;
    const beforeExpiry = (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS;
    world.factionTraits!.get(KR)!.kaerruun!.lastEvaluatedSeconds = world.nowSeconds;
    tickFactionTraits(world);
    const expired = Object.values(world.factionTraits!.get(KR)!.kaerruun!.contracts)[0];
    check('a contract past its term expires', expired?.status === 'expired', expired?.status);
    check('an expired contract pays nothing further',
        (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS === beforeExpiry);

    // War voids it.
    reset();
    createOffer(world, KR, { kind: 'mercenary_contract', toFactionId: EMPLOYER, contractTerms: terms });
    const o3 = [...world.diplomacy.offers.values()].find(o => o.kind === 'mercenary_contract' && o.status === 'pending')!;
    respondToOffer(world, EMPLOYER, o3.id, 'accept');
    registerActOfWar(world, KR, EMPLOYER);
    const voided = Object.values(world.factionTraits!.get(KR)!.kaerruun!.contracts)[0];
    check('going to war voids the retainer', voided?.status === 'voided', voided?.status);

    // The AI must not silently refuse forever — an unhandled kind falls to
    // `default: return false`, which is indistinguishable from a considered no.
    reset();
    (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS = 10_000_000;
    createOffer(world, KR, { kind: 'mercenary_contract', toFactionId: EMPLOYER, contractTerms: terms });
    const o4 = [...world.diplomacy.offers.values()].find(o => o.kind === 'mercenary_contract' && o.status === 'pending')!;

    const fatigueBefore = world.shared.warFatigue;
    world.shared.warFatigue = 0;
    check('a safe, unthreatened AI declines — the case is judged, not blanket-accepted',
        wouldAccept(world, o4) === false);

    world.shared.warFatigue = 40;   // a real threat
    check('a threatened AI that can afford it accepts',
        wouldAccept(world, o4) === true, 'still refused — the switch may be hitting default:false');

    (world.economy.factions.get(EMPLOYER)!.reserves as any).CREDITS = 10;
    check('a threatened AI that cannot afford it still declines',
        wouldAccept(world, o4) === false);
    world.shared.warFatigue = fatigueBefore;

    // Contracts survive a save.
    const round = deserializeWorld(serializeWorld(world));
    check('contracts survive a save/load round trip',
        !!round.factionTraits?.get(KR)?.kaerruun?.contracts);

    reset();
}

// ── 9. The gate is actually called ──────────────────────────────────────────
console.log('\n[9] Wiring (the cheapest guard against a gate nobody calls)');
{
    const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
    check('game-loop executeOrder calls checkCeasefireGate',
        /checkCeasefireGate\(world, factionId, actionId\)/.test(src('scripts/game-loop.ts')));
    check('game-loop bootstraps faction traits',
        /ensureFactionTraits\(world\)/.test(src('scripts/game-loop.ts')));
    check('the tick runs tickFactionTraits',
        /tickFactionTraits\(world\)/.test(src('lib/time/tick-processor.ts')));
    check('combat-manager records trophy kills',
        /recordTrophyKill\(world, killer\)/.test(src('lib/combat/combat-manager.ts')));
    check('combat-manager populates traitBonuses',
        /brutality: getBrutalityBonus\(world, factionId\)/.test(src('lib/combat/combat-manager.ts')));
    check('combat-manager applies the Fear Aura',
        /applyFearAura\(world, combatId/.test(src('lib/combat/combat-manager.ts')));
    check('the worker registers DIP_OFFER_CONTRACT',
        /case 'DIP_OFFER_CONTRACT'/.test(src('scripts/game-loop.ts')));
    check('the engine applies traits post-clamp',
        /traitMultiplier\(state\.attacker, state\)/.test(src('lib/combat/combat-engine.ts')));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ all four Kaer'Ruun mechanics are live\n`);
process.exit(failures ? 1 : 0);
