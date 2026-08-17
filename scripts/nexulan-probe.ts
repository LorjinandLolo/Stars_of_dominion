// scripts/nexulan-probe.ts
// Are the Nexulan mechanics LIVE — and does starving the cores actually reach
// the numbers the Convergence is best at?
//
// Covers Core Starvation, Pre-Cognitive Algorithms, Adaptive Phase-Shields and
// Condescension.
//
//   npx tsx scripts/nexulan-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, tickFactionTraits } from '../lib/factions/traits-service';
import { ensureGovernments } from '../lib/government/government-service';
import { getGovernmentModifiers } from '../lib/government/modifiers';
import { getTechModifier } from '../lib/tech/modifiers';
import { traitMultiplier } from '../lib/combat/combat-engine';
import { wouldAccept } from '../lib/ai/diplomatic-ai-service';
import {
    CORE_BIOMASS_FLOOR,
    BIOMASS_KEY,
    PRECOGNITION_BONUS_ADD,
    PHASE_SHIELD_PER_ROUND,
    PHASE_SHIELD_MAX,
    CONDESCENSION_THRESHOLD_SHIFT,
    starvation,
    isStarving,
    biomassOf,
    precognitionBonus,
    phaseShieldBonus,
    condescensionPenalty,
    nexulanState,
} from '../lib/factions/nexulan';

const NEX = 'nexulan_convergence';
const OTHER = 'faction-sarrak';
const PARTNER = 'faction-leopantheri';

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
ensureGovernments(world);
world.nowSeconds = 7_000_000;

const setBiomass = (id: string, n: number) => { world.economy.factions.get(id).reserves[BIOMASS_KEY] = n; };
const FED = CORE_BIOMASS_FLOOR * 4;

// ── 1. What the civ pipeline already delivers ───────────────────────────────
console.log('\n[1] Already-live traits (civ pipeline) — must not be rebuilt');
{
    setBiomass(NEX, FED);
    const research = getTechModifier(world, NEX, 'research_speed');
    check('they calculate rather than discover (research_speed)', research > 1, `got ${research.toFixed(3)}`);
    const build = getTechModifier(world, NEX, 'construction_speed');
    check('Molecular Assembly is ALREADY DONE (construction_speed)', build > 1, `got ${build.toFixed(3)}`);
    const food = getTechModifier(world, NEX, 'eco_production_mult');
    check('and their biomass problem is authored, not invented', food < 1, `got ${food.toFixed(3)}`);

    const nex = code('lib/factions/nexulan.ts');
    check('the module adds NO second copy of those pipeline modifiers',
        !/construction_speed|eco_production_mult|orbital_power_multiplier/.test(nex));
}

// ── 2. Core Starvation ──────────────────────────────────────────────────────
console.log('\n[2] Core Starvation');
{
    setBiomass(NEX, FED);
    check('a fed Convergence is not starving', isStarving(world, NEX) === false);
    check('and starvation reads exactly zero', starvation(world, NEX) === 0);
    const fedMods = getGovernmentModifiers(world, NEX) as any;

    // Graded, so the player watches it coming rather than falling off a cliff.
    setBiomass(NEX, CORE_BIOMASS_FLOOR / 2);
    const half = starvation(world, NEX);
    setBiomass(NEX, 0);
    const empty = starvation(world, NEX);
    check('starvation is graded, not binary', half > 0 && empty > half, `${half.toFixed(2)} -> ${empty.toFixed(2)}`);
    check('an empty pantry is total', Math.abs(empty - 1) < 1e-9);

    const starvedMods = getGovernmentModifiers(world, NEX) as any;
    check('starving costs them production', starvedMods.production < fedMods.production,
        `${fedMods.production.toFixed(3)} -> ${starvedMods.production.toFixed(3)}`);
    check('and approval', starvedMods.approval < fedMods.approval);
    // The one that makes it bite: the cores ARE the laboratory.
    check('and the research they are best at', starvedMods.research_speed < fedMods.research_speed,
        `${fedMods.research_speed.toFixed(3)} -> ${starvedMods.research_speed.toFixed(3)}`);

    // Penalty-only, so a fed Convergence double-counts nothing.
    setBiomass(NEX, FED);
    check('a fed Convergence contributes nothing extra', starvation(world, NEX) === 0);
    check('the source is composed into getGovernmentModifiers',
        /getStarvationModifiers\(world, factionId\)/.test(code('lib/government/modifiers.ts')));

    // Nobody else starves for want of biomass.
    const otherBefore = (getGovernmentModifiers(world, OTHER) as any).production;
    world.economy.factions.get(OTHER).reserves[BIOMASS_KEY] = 0;
    check('another empire with no food is unaffected by THIS mechanic',
        (getGovernmentModifiers(world, OTHER) as any).production === otherBefore);
    check('and reads no starvation at all', starvation(world, OTHER) === 0);

    // The tick latches it for the ledger.
    setBiomass(NEX, 0);
    tickFactionTraits(world);
    check('the famine is recorded', (nexulanState(world, NEX)?.starvationTicks ?? 0) > 0);
    check('and the biomass trend is captured', nexulanState(world, NEX)!.biomassAtLastTick === 0);
    setBiomass(NEX, FED);
    tickFactionTraits(world);
    check('feeding them clears the flag', nexulanState(world, NEX)!.starving === false);
}

// ── 3. Pre-Cognitive Algorithms ─────────────────────────────────────────────
console.log('\n[3] Pre-Cognitive Algorithms');
{
    check('the Nexulans read a stance far better than anyone',
        Math.abs(precognitionBonus(world, NEX) - PRECOGNITION_BONUS_ADD) < 1e-9);
    check('nobody else gets it', precognitionBonus(world, OTHER) === 0);

    // The engine already ran this whole mechanic — the point is that it COMPOSES
    // with the existing base and tech contribution rather than overwriting it.
    // Overwriting is the documented trap: prediction_bonus_multiplier is an
    // ABSOLUTE with a 0.15 default, so a civilization writing its own value
    // would silently discard whatever tech had already earned.
    const mgr = code('lib/combat/combat-manager.ts');
    check('it composes additively onto BASE_PREDICTION_BONUS + prediction_bonus_add',
        /BASE_PREDICTION_BONUS[\s\S]{0,160}prediction_bonus_add[\s\S]{0,160}precognitionBonus\(world, factionId\)/.test(mgr));
    check('and does not overwrite the multiplier',
        !/prediction_bonus_multiplier:\s*precognitionBonus/.test(mgr));

    // The consumer is real: the engine compares the prediction to the actual
    // stance and multiplies power by (1 + multiplier).
    const eng = code('lib/combat/combat-engine.ts');
    check('the engine actually consumes the multiplier',
        /prediction_bonus_multiplier/.test(eng) && /aPred === dStance/.test(eng));
}

// ── 4. Adaptive Phase-Shields ───────────────────────────────────────────────
console.log('\n[4] Adaptive Phase-Shields');
{
    check('at the opening exchange they have learned nothing',
        phaseShieldBonus(world, NEX, 0, true) === 0);
    const r2 = phaseShieldBonus(world, NEX, 2, true);
    const r4 = phaseShieldBonus(world, NEX, 4, true);
    check('the shields learn as the battle runs', r4 > r2 && r2 > 0, `${r2.toFixed(3)} -> ${r4.toFixed(3)}`);
    check('the rate is the authored one', Math.abs(r2 - 2 * PHASE_SHIELD_PER_ROUND) < 1e-9);
    check('and it saturates', phaseShieldBonus(world, NEX, 999, true) === PHASE_SHIELD_MAX);

    // Defender-only. A shield that learns incoming fire cannot help the side
    // that chose the engagement, and symmetry would make it a flat combat bonus.
    check('an ATTACKING Convergence learns nothing', phaseShieldBonus(world, NEX, 6, false) === 0);
    check('and no other civilization has shields', phaseShieldBonus(world, OTHER, 6, true) === 0);

    // It must reach the engine's post-clamp band, or it is decoration.
    const shielded: any = { factionId: NEX, traitBonuses: { phaseShield: phaseShieldBonus(world, NEX, 4, true) } };
    const bare: any = { factionId: OTHER, traitBonuses: {} };
    check('the shield reaches traitMultiplier',
        traitMultiplier(shielded, { elapsedRounds: 4 } as any) > 1,
        `got ${traitMultiplier(shielded, { elapsedRounds: 4 } as any).toFixed(3)}`);
    check('a neutral combatant is exactly 1.0', traitMultiplier(bare, { elapsedRounds: 4 } as any) === 1.0);

    // The shared clock, stated plainly: the Kaer'Ruun ramp rides elapsedRounds
    // too, and grows LETHALITY where this grows DURABILITY. Both may apply.
    check('it is recomputed per round, not snapshotted at engagement creation',
        /phaseShield: phaseShieldBonus\(world, state\.(attacker|defender)\.factionId, elapsed/.test(code('lib/combat/combat-manager.ts')));
    check('and is deliberately NOT seeded at creation, where side and rounds are unknown',
        !/traitBonuses: \{[\s\S]{0,220}phaseShield/.test(code('lib/combat/combat-manager.ts')));
}

// ── 5. Condescension ────────────────────────────────────────────────────────
console.log('\n[5] Condescension');
{
    check('the Convergence pays a diplomatic surcharge',
        condescensionPenalty(world, NEX) === CONDESCENSION_THRESHOLD_SHIFT);
    check('nobody else does', condescensionPenalty(world, OTHER) === 0);

    // It must cost THEM, not their counterpart — charged against the proposer.
    const ai = code('lib/ai/diplomatic-ai-service.ts');
    check('it is charged against the PROPOSER, not the recipient',
        /condescensionPenalty\(world, them\)/.test(ai));

    // And it must actually change an answer somewhere, or it is a number nobody
    // reads. A trade pact at tension just under the threshold flips to a refusal.
    const mkOffer = (from: string) => ({
        id: 'probe-offer', kind: 'trade_pact', fromFactionId: from, toFactionId: PARTNER,
        status: 'pending',
    } as any);
    const riv = world.rivalries;
    // Rows are keyed `rivalry-A-B` and written in BOTH directions by
    // setRivalryScore, which is module-private — so the probe seeds them the
    // same way rather than guessing a single key.
    const TENSION = 45;
    const seeded: string[] = [];
    const seed = (a: string, b: string) => {
        for (const id of [`rivalry-${a}-${b}`, `rivalry-${b}-${a}`]) {
            if (!riv.has(id)) seeded.push(id);
            riv.set(id, { id, factionA: a, factionB: b, rivalryScore: TENSION, escalationLevel: 3, detenteActive: false, recentEvents: [] } as any);
        }
    };
    seed(PARTNER, NEX);
    seed(PARTNER, OTHER);

    // TENSION sits inside the ordinary trade-pact threshold and outside it once
    // condescension is added — true for either posture the partner may hold
    // (50 normally, 65 if Mercantile), since 45 < both and 65 < neither.
    const nexAnswer = wouldAccept(world, mkOffer(NEX));
    const otherAnswer = wouldAccept(world, mkOffer(OTHER));
    check('at identical tension, an ordinary empire is accepted', otherAnswer === true);
    check('and the Convergence is refused — the contempt is the cost',
        nexAnswer === false, `nexulan ${nexAnswer}, control ${otherAnswer}`);
    for (const id of seeded) riv.delete(id);
}

// ── 6. Persistence and layering ─────────────────────────────────────────────
console.log('\n[6] Persistence and layering');
{
    setBiomass(NEX, FED);
    tickFactionTraits(world);
    const round: any = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    check('Nexulan trait state survives a save/load round trip', !!nexulanState(round, NEX));
    check('and starvation re-derives from the reloaded reserve, not a cached copy',
        starvation(round, NEX) === 0 && biomassOf(round, NEX) > 0);

    // government/modifiers.ts, combat-manager.ts and the diplomatic AI all
    // import this module, so it must stay a leaf.
    const imports = [...code('lib/factions/nexulan.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('nexulan.ts imports only leaves', imports.every(i =>
        ['../game-world-state', './faction-traits-types', './civ-ids', '../tech/history-ledger'].includes(i)),
        imports.join(', '));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Nexulan mechanics are live\n`);
process.exit(failures ? 1 : 0);
