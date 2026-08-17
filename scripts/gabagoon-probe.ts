// scripts/gabagoon-probe.ts
// Are the Gabagoonian mechanics LIVE — does the surge actually reach the combat
// band, and does the crash actually hurt?
//
// Covers Capacola Surge (including the scaling the Sarrak serum does not have),
// the post-surge crash, the waddle, and the Galactic Vendetta.
//
//   npx tsx scripts/gabagoon-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, districtTraitsFor, tickFactionTraits } from '../lib/factions/traits-service';
import { getTechModifier } from '../lib/tech/modifiers';
import { traitMultiplier } from '../lib/combat/combat-engine';
import { terrainCostForCiv } from '../lib/factions/terrain-affinity';
import { stimulantPhase, doseWindows } from '../lib/factions/stimulant';
import {
    CAPACOLA_KEY,
    SURGE_FULL_SERVING,
    SURGE_MIN_SERVING,
    SURGE_COMBAT_BONUS,
    CRASH_COMBAT_PENALTY,
    CRASH_TAKEN_PENALTY,
    WADDLE_COST_MULTIPLIER,
    SURGE_DURATION_SECONDS,
    CRASH_DURATION_SECONDS,
    capacolaSurge,
    getSurgeBonus,
    isSurgingNow,
    isCrashed,
    surgeIntensity,
    declareVendetta,
    gabagoonState,
} from '../lib/factions/gabagoon';
import { CIV_GABAGOON, grievanceStore, grievanceHolders } from '../lib/factions/civ-ids';
import { recordGrievance } from '../lib/factions/buthari';

const GAB = 'faction-gabagoonians';
const OTHER = 'faction-sarrak';
const OFFENDER = 'faction-kaerruun';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const world: any = getGameWorldState();
ensureFactionTraits(world);
world.nowSeconds = 7_000_000;

const reservesOf = (id: string) => world.economy.factions.get(id).reserves;
const clearCycle = (id: string) => {
    const st = gabagoonState(world, id);
    if (st) { st.surgeEndsAtSeconds = 0; st.crashEndsAtSeconds = 0; st.surgeIntensity = 0; }
};
const stubCombatant = (factionId: string) => ({ factionId, traitBonuses: { capacola: getSurgeBonus(world, factionId) } } as any);
const stubState = { elapsedRounds: 0 } as any;

// ── 1. What the civ pipeline already delivers ───────────────────────────────
console.log('\n[1] Already-live traits (civ pipeline) — must not be rebuilt');
{
    const prod = getTechModifier(world, GAB, 'eco_production_mult');
    check('their protein-rich economy is already live', prod > 1, `got ${prod.toFixed(3)}`);
    // Additive key, base 0 — asserting > 1 would demand +100% from a working
    // pipeline. Same trap as pop_growth and orbital_power_multiplier.
    const combat = getTechModifier(world, GAB, 'combat_power_multiplier');
    check('their baseline brawling is already live', combat > 0, `got ${combat.toFixed(3)}`);
    const orbital = getTechModifier(world, GAB, 'orbital_power_multiplier');
    check('their poor fleets are already live', orbital < 0, `got ${orbital.toFixed(3)}`);

    const gab = code('lib/factions/gabagoon.ts');
    check('the module adds NO second copy of those pipeline modifiers',
        !/eco_production_mult|orbital_power_multiplier|combat_power_multiplier/.test(gab));
}

// ── 2. Capacola is a real supply line ───────────────────────────────────────
console.log('\n[2] Capacola is a real resource, not flavour');
{
    clearCycle(GAB);
    const reserves = reservesOf(GAB);
    check('the Gabagoonians actually hold CAPACOLA', (reserves[CAPACOLA_KEY] ?? 0) > 0,
        `got ${reserves[CAPACOLA_KEY]}`);

    const before = reserves[CAPACOLA_KEY];
    const res = capacolaSurge(world, GAB, SURGE_FULL_SERVING);
    check('eating spends it from the reserve', res.ok && reserves[CAPACOLA_KEY] === before - res.consumed!,
        `${before} -> ${reserves[CAPACOLA_KEY]}`);
    check('and the serving is recorded', (gabagoonState(world, GAB)?.capacolaConsumed ?? 0) > 0);

    // "Falls apart without a capacola supply line" — an empty pantry is a real
    // failure state, which is only possible because the resource is real.
    clearCycle(GAB);
    const saved = reserves[CAPACOLA_KEY];
    reserves[CAPACOLA_KEY] = 0;
    const starved = capacolaSurge(world, GAB, SURGE_FULL_SERVING);
    check('an empty pantry refuses the surge', starved.ok === false && !!starved.reason);
    check('and nothing happens', isSurgingNow(world, GAB) === false);
    reserves[CAPACOLA_KEY] = saved;

    check('no other civilization can surge', capacolaSurge(world, OTHER, 500).ok === false);
}

// ── 3. The surge scales with the serving ────────────────────────────────────
console.log('\n[3] The surge SCALES — the half the Sarrak serum does not have');
{
    clearCycle(GAB);
    reservesOf(GAB)[CAPACOLA_KEY] = 10_000;

    capacolaSurge(world, GAB, SURGE_FULL_SERVING);
    const bigBonus = getSurgeBonus(world, GAB);
    const bigIntensity = surgeIntensity(world, GAB);
    check('a full serving surges at full intensity', Math.abs(bigIntensity - 1) < 1e-9);
    check('and reaches the combat band',
        Math.abs(bigBonus - SURGE_COMBAT_BONUS) < 1e-9, `got ${bigBonus.toFixed(3)}`);

    clearCycle(GAB);
    capacolaSurge(world, GAB, SURGE_MIN_SERVING);
    const smallBonus = getSurgeBonus(world, GAB);
    check('a small helping surges less', smallBonus > 0 && smallBonus < bigBonus,
        `${smallBonus.toFixed(3)} vs ${bigBonus.toFixed(3)}`);

    // Saturating: past a full serving there is nowhere left to put it.
    clearCycle(GAB);
    capacolaSurge(world, GAB, SURGE_FULL_SERVING * 5);
    check('eating far more buys nothing extra',
        Math.abs(getSurgeBonus(world, GAB) - SURGE_COMBAT_BONUS) < 1e-9,
        `got ${getSurgeBonus(world, GAB).toFixed(3)}`);

    // THE assertion that separates live from decoration: the bonus must reach
    // the engine's post-clamp band, not merely be computed.
    clearCycle(GAB);
    capacolaSurge(world, GAB, SURGE_FULL_SERVING);
    const surging = traitMultiplier(stubCombatant(GAB), stubState);
    check('the surge reaches traitMultiplier in the engine', surging > 1, `got ${surging.toFixed(3)}`);
    check('and a neutral faction is exactly 1.0',
        traitMultiplier(stubCombatant(OTHER), stubState) === 1.0);
}

// ── 4. The crash ────────────────────────────────────────────────────────────
console.log('\n[4] The crash');
{
    clearCycle(GAB);
    reservesOf(GAB)[CAPACOLA_KEY] = 10_000;
    capacolaSurge(world, GAB, SURGE_FULL_SERVING);
    const surgedAt = world.nowSeconds;

    // Re-dosing must not dodge the crash, or the mechanic is a free button.
    check('they cannot re-dose mid-surge', capacolaSurge(world, GAB, 500).ok === false);

    world.nowSeconds = surgedAt + SURGE_DURATION_SECONDS + 1;
    check('the surge lapses', isSurgingNow(world, GAB) === false);
    check('and the crash begins', isCrashed(world, GAB) === true);
    check('they cannot eat their way out of the crash either',
        capacolaSurge(world, GAB, 500).ok === false);
    check('the crash is a NEGATIVE combat modifier',
        Math.abs(getSurgeBonus(world, GAB) + CRASH_COMBAT_PENALTY) < 1e-9,
        `got ${getSurgeBonus(world, GAB).toFixed(3)}`);
    check('and it reaches the engine as a penalty',
        traitMultiplier(stubCombatant(GAB), stubState) < 1,
        `got ${traitMultiplier(stubCombatant(GAB), stubState).toFixed(3)}`);
    check('their defence drops too — "lowered defense"',
        Math.abs(districtTraitsFor(world, GAB, 'plains').taken - (1 + CRASH_TAKEN_PENALTY)) < 1e-9);

    world.nowSeconds = surgedAt + SURGE_DURATION_SECONDS + CRASH_DURATION_SECONDS + 1;
    check('the crash ends', isCrashed(world, GAB) === false);
    check('and they are ordinary again', getSurgeBonus(world, GAB) === 0);
    tickFactionTraits(world);
    check('the tick clears the stale intensity', gabagoonState(world, GAB)!.surgeIntensity === 0);
    check('so they can eat again', capacolaSurge(world, GAB, 500).ok === true);
    clearCycle(GAB);
    world.nowSeconds = 7_000_000;
}

// ── 5. The shared stimulant cycle ───────────────────────────────────────────
console.log('\n[5] The cycle is shared with the Sarrak serum, the magnitude is not');
{
    check('the phase helper reports surging inside the active window',
        stimulantPhase(100, 200, 300) === 'surging');
    check('crashing between the two', stimulantPhase(250, 200, 300) === 'crashing');
    check('and clear afterwards', stimulantPhase(400, 200, 300) === 'clear');
    const w = doseWindows(1000, 100, 50);
    check('the crash always follows the surge — it can never be dodged',
        w.crashUntilSeconds > w.activeUntilSeconds);

    // The Sarrak must still work through the promoted helper.
    check('sarrak.ts uses the shared cycle rather than its own comparisons',
        /isSurging\(|isCrashing\(/.test(code('lib/factions/sarrak.ts')));
    check('and keeps its own persisted field names — no state migration',
        /serumEndsAtSeconds/.test(code('lib/factions/sarrak.ts')));
    check('the shared helper models the cycle ONLY, never the magnitude',
        !/intensity|magnitude/i.test(code('lib/factions/stimulant.ts')));
}

// ── 6. The waddle ───────────────────────────────────────────────────────────
console.log('\n[6] Slow baseline movement');
{
    const waddle = terrainCostForCiv(CIV_GABAGOON);
    check('the Gabagoonians get a terrain-cost override', !!waddle);
    check('and it is a PENALTY, not a bonus', waddle!('plains', 1) > 1,
        `got ${waddle!('plains', 1)}`);
    check('applied flat across terrain',
        Math.abs(waddle!('plains', 1) - WADDLE_COST_MULTIPLIER) < 1e-9
        && Math.abs(waddle!('mountains', 2.2) - 2.2 * WADDLE_COST_MULTIPLIER) < 1e-9);

    // The dispatcher must still serve the earlier two.
    check('Infernoid heat immunity still routes', terrainCostForCiv('civ-infernoid')?.('volcanic', 2) === 1);
    check('Movanite swarm speed still routes', (terrainCostForCiv('civ-movanite')?.('plains', 1) ?? 1) < 1);
    check('and an ordinary civilization still gets undefined',
        terrainCostForCiv('civ-elyndra') === undefined);

    // The parity rule this module exists to enforce. factionTraits is NOT synced
    // to the client, so a phase-aware movement cost would show the player moves
    // during a crash that the worker then refuses.
    check('the waddle does not read live phase — the client cannot know it',
        !/isCrashed|isSurgingNow/.test(code('lib/factions/terrain-affinity.ts')));
}

// ── 7. Galactic Vendetta ────────────────────────────────────────────────────
console.log('\n[7] Galactic Vendetta');
{
    const store = grievanceStore(world, GAB)!;
    for (const k of Object.keys(store)) delete store[k];

    check('unprovoked, they hold no grudge', grievanceHolders(world, GAB).length === 0);
    const declared = declareVendetta(world, GAB, OFFENDER);
    recordGrievance(world, GAB, OFFENDER, 'rite_violated');
    check('touching the broadcast declares a vendetta', declared === true);
    check('and it lands in the SHARED grievance store — its fourth consumer',
        grievanceHolders(world, GAB).includes(OFFENDER));
    check('the vendetta is counted', (gabagoonState(world, GAB)?.vendettas ?? 0) > 0);
    check('no other civilization declares one', declareVendetta(world, OTHER, OFFENDER) === false);
    check('and they do not feud with themselves', declareVendetta(world, GAB, GAB) === false);

    // Wired at the one order that plants a narrative in someone else's audience.
    const loop = code('scripts/game-loop.ts');
    check('the vendetta fires from PRESS_SEED_STORY',
        /case 'PRESS_SEED_STORY'[\s\S]{0,1400}declareVendetta\(world, victimId, factionId\)/.test(loop));
    check('and records a grievance so retaliation is actually unlocked',
        /declareVendetta\(world, victimId, factionId\)\)\s*\{[\s\S]{0,200}recordGrievance/.test(loop));
    check('seeding into your OWN space is not an insult',
        /victimId !== factionId/.test(loop));

    // THE guard this probe earned. Five civilizations read grievanceHolders for
    // five different reasons, and recordGrievance is the single writer they all
    // depend on. Its guard listed only two, so the Leo-pantheri honour price and
    // the Rhimetal deliberation both read a store nothing ever wrote to —
    // perfectly wired, permanently inert. This fails if a sixth reader is added
    // without being made able to RECEIVE one.
    for (const [id, why] of [
        ['faction-buthari', 'gate their retaliation'],
        ['faction-movanites', 'lift their gridlock'],
        ['faction-leopantheri', 'judge a war justified'],
        ['faction-rhimetals', 'skip deliberation'],
        ['faction-gabagoonians', 'declare a vendetta'],
    ] as const) {
        const s = grievanceStore(world, id)!;
        for (const k of Object.keys(s)) delete s[k];
        recordGrievance(world, id, OFFENDER, 'attacked');
        check(`${id} can actually RECEIVE a grievance — they read them to ${why}`,
            grievanceHolders(world, id).includes(OFFENDER));
        for (const k of Object.keys(s)) delete s[k];
    }
}

// ── 8. Persistence and layering ─────────────────────────────────────────────
console.log('\n[8] Persistence and layering');
{
    reservesOf(GAB)[CAPACOLA_KEY] = 5000;
    clearCycle(GAB);
    capacolaSurge(world, GAB, SURGE_FULL_SERVING);
    const round: any = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    check('Gabagoonian trait state survives a save/load round trip', !!gabagoonState(round, GAB));
    check('and the surge is still running after the reload — timestamps, not counters',
        isSurgingNow(round, GAB) === true);
    clearCycle(GAB);

    const imports = [...code('lib/factions/gabagoon.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('gabagoon.ts imports only leaves', imports.every(i =>
        ['../game-world-state', './faction-traits-types', './civ-ids', './stimulant', '../tech/history-ledger'].includes(i)),
        imports.join(', '));
    const st = [...code('lib/factions/stimulant.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('stimulant.ts imports nothing at all — two factions depend on it', st.length === 0, st.join(', '));

    check('the surge order is registered, so it is not silently dropped',
        /GAB_CAPACOLA_SURGE/.test(code('lib/actions/registry.ts'))
        && /GAB_CAPACOLA_SURGE/.test(code('lib/actions/types.ts')));
    check('and the engine sums the new trait band',
        /capacola/.test(code('lib/combat/combat-engine.ts')));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Gabagoonian mechanics are live\n`);
process.exit(failures ? 1 : 0);
