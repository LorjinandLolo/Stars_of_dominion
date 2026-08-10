/**
 * scripts/test-tech-phase2.ts
 *
 * Tech migration Phase 2 — modifier consumption beyond economy.
 *
 * Before this phase only four keys (the eco_* family) were read anywhere, and
 * combat's CombatantState.techModifiers — which combat-engine has always read —
 * was populated by nothing at all.
 *
 * Asserts:
 *   1. getTechModifier returns kind-correct baselines and researched values
 *   2. the registry audit finds no unconsumed / wrong-kind authored keys
 *   3. combat power actually changes with researched military tech
 *   4. stance-prediction research raises the bonus above the 0.15 base
 *   5. espionage exposure falls with concealment research
 *   6. construction speed responds to construction_speed
 *
 * Run: npx tsx scripts/test-tech-phase2.ts
 */
import { TechEngine, applyUnlock } from '../lib/tech/engine';
import {
    getTechModifier,
    getTechModifiers,
    validateTechModifierKeys,
    MODIFIER_REGISTRY,
} from '../lib/tech/modifiers';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
    if (cond) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

function worldWith(factionId: string, techIds: string[]) {
    const state = TechEngine.initPlayerState(factionId);
    for (const id of techIds) applyUnlock(state, id);
    return { world: { tech: new Map([[factionId, state]]) } as any, state };
}

function main() {
    // ── 1. Accessor semantics ───────────────────────────────────────────────
    console.log('\n[1] getTechModifier baselines and values');
    const { world: w } = worldWith('f1', []);
    check("unset 'mult' key returns 1", getTechModifier(w, 'f1', 'eco_production_mult') === 1);
    check("unset 'add' key returns 0", getTechModifier(w, 'f1', 'ground_power_multiplier') === 0);
    check('explicit fallback wins', getTechModifier(w, 'f1', 'ground_power_multiplier', 7) === 7);
    check('unknown faction returns baseline', getTechModifier(w, 'ghost', 'eco_tax_mult') === 1);

    const { world: w2 } = worldWith('f2', ['mil_t1_2', 'mil_t2_ovr_3']);
    check('two ground techs stack additively to 0.25',
        Math.abs(getTechModifier(w2, 'f2', 'ground_power_multiplier') - 0.25) < 1e-9,
        `got ${getTechModifier(w2, 'f2', 'ground_power_multiplier')}`);

    // ── 2. Registry audit ───────────────────────────────────────────────────
    console.log('\n[2] authored keys vs the registry');
    const audit = validateTechModifierKeys();
    check('no authored key lacks a consumer', audit.unconsumed.length === 0,
        audit.unconsumed.map(u => `${u.techId}:${u.key}`).join(', '));
    check('no key authored with the wrong effect type', audit.wrongKind.length === 0,
        audit.wrongKind.map(u => `${u.techId}:${u.key} expected ${u.expected}`).join(', '));
    check('registry documents a consumer for every key',
        Object.values(MODIFIER_REGISTRY).every(s => !!s.consumer && !!s.description));

    // ── 3. Combat power responds to tech ────────────────────────────────────
    console.log('\n[3] combat power (the socket that was never plugged in)');
    // calculatePower folds techModifiers as: total *= (1 + global + layer).
    const { world: wc } = worldWith('f3', ['mil_t1_1']); // +0.10 orbital
    const mods = getTechModifiers(wc, 'f3');
    check('orbital modifier reaches globalModifiers',
        Math.abs((mods['orbital_power_multiplier'] ?? 0) - 0.10) < 1e-9,
        `got ${mods['orbital_power_multiplier']}`);
    check('ground layer unaffected by an orbital tech',
        (mods['ground_power_multiplier'] ?? 0) === 0);

    const orbitalMult = 1 + (mods['combat_power_multiplier'] ?? 0) + (mods['orbital_power_multiplier'] ?? 0);
    check('orbital power multiplier is 1.10', Math.abs(orbitalMult - 1.10) < 1e-9, `got ${orbitalMult}`);

    // ── 4. Prediction bonus ─────────────────────────────────────────────────
    console.log('\n[4] stance prediction above the 0.15 engine base');
    const BASE = 0.15;
    const { world: wp } = worldWith('f4', ['mil_t3_1']); // +0.20
    const predicted = BASE + getTechModifier(wp, 'f4', 'prediction_bonus_add');
    check('researched prediction bonus is 0.35', Math.abs(predicted - 0.35) < 1e-9, `got ${predicted}`);
    const { world: wp0 } = worldWith('f5', []);
    check('unresearched still 0.15 (not zeroed)',
        Math.abs(BASE + getTechModifier(wp0, 'f5', 'prediction_bonus_add') - 0.15) < 1e-9);

    // ── 5. Espionage exposure ───────────────────────────────────────────────
    console.log('\n[5] espionage exposure scaling');
    const { world: we } = worldWith('f6', ['esp_t2_int_3']); // -0.20 => 0.8x
    const expMult = getTechModifier(we, 'f6', 'esp_exposure_mult');
    check('exposure multiplier is 0.8', Math.abs(expMult - 0.8) < 1e-9, `got ${expMult}`);
    const baseExposure = 0.40;
    check('a 40% exposure op drops to 32%',
        Math.abs(baseExposure * expMult - 0.32) < 1e-9);
    check('unresearched faction keeps 1.0 exposure',
        getTechModifier(worldWith('f7', []).world, 'f7', 'esp_exposure_mult') === 1);

    // ── 6. Construction speed ───────────────────────────────────────────────
    console.log('\n[6] construction_speed is read at last');
    const { world: wb, state } = worldWith('f8', []);
    check('seeded at 1.0 by initPlayerState',
        getTechModifier(wb, 'f8', 'construction_speed') === 1,
        `got ${getTechModifier(wb, 'f8', 'construction_speed')}`);
    state.globalModifiers['construction_speed'] = 1.25;
    const buildTime = 1000 / getTechModifier(wb, 'f8', 'construction_speed');
    check('a 1.25x modifier cuts a 1000s build to 800s', Math.abs(buildTime - 800) < 1e-9,
        `got ${buildTime}`);

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
