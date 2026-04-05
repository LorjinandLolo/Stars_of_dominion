import {
    calculateCompositionModifier,
    calculateEffectivePower,
    initiateCombat,
    resolveEngagementRound,
    generateVisibilityProfile,
    advanceRound,
    checkAnnihilation
} from './combat-engine';
import { CombatantState, TargetDetails } from './combat-types';
import config from './combat-config.json';

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e: any) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${e.message}`);
        failed++;
    }
}

function expect(actual: any, expected: any, msg?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ''}`);
    }
}

function expectTrue(condition: boolean, msg?: string) {
    if (!condition) throw new Error(`Expected true. ${msg || ''}`);
}

function expectFalse(condition: boolean, msg?: string) {
    if (condition) throw new Error(`Expected false. ${msg || ''}`);
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCombatant(role: 'attacker' | 'defender', baseForceCount: number): CombatantState {
    return {
        factionId: role === 'attacker' ? 'factionA' : 'factionB',
        role,
        hp: baseForceCount * 10,
        maxHp: baseForceCount * 10,
        organization: 100,
        maxOrganization: 100,
        screeningEfficiency: 1.0,
        baseForceCount,
        composition: role === 'attacker' ? { cruiser: 10, bomber: 5 } : { interceptor: 10, destroyer: 5 },
        intelLevel: 'blind',
        supply: 1.0,
        morale: 1.0,
        doctrine: 'aggressive',
        casualties: 0,
        predictionPoints: 0
    };
}

const defaultTarget: TargetDetails = { systemId: 'sys1', terrainModifier: 1.0, infrastructureIntegrity: 1.0 };

// ─── 1. Power & RPS Tests ─────────────────────────────────────────────────────

console.log('\n--- Power & RPS ---');

test('calculateCompositionModifier constraints and grid lookup', () => {
    // Attackers: Armor(10). Defenders: Infantry(10).
    // Armor vs Infantry = +0.15 for Armor, -0.15 for Infantry.
    const aComp = { armor: 10 };
    const dComp = { infantry: 10 };

    const aMod = calculateCompositionModifier(aComp, dComp, 'ground');
    const dMod = calculateCompositionModifier(dComp, aComp, 'ground');

    expect(Number(aMod.toFixed(2)), 0.15, 'Armor should get +15% against Infantry');
    expect(Number(dMod.toFixed(2)), -0.15, 'Infantry should get -15% against Armor');
});

test('calculateEffectivePower respects ±40% max variance cap', () => {
    const attacker = makeCombatant('attacker', 1000);
    const defender = makeCombatant('defender', 1000);

    // Give attacker huge bonuses that would exceed 40% if not capped
    attacker.morale = 1.0;
    attacker.supply = 1.0;

    // Simulating terrain and RPS
    const p1 = calculateEffectivePower(attacker, defender, 'ground', 2.0); // Terrain 2x
    expect(p1, 1000 * (1.0 + config.constants.maxVarianceCap), 'Power should cap at maxVarianceCap');

    const p2 = calculateEffectivePower(attacker, defender, 'ground', 0.1); // Terrain 0.1x
    expect(p2, 1000 * (1.0 - config.constants.maxVarianceCap), 'Power should floor at minVarianceCap');
});

// ─── 2. Phase & Structure Tests ───────────────────────────────────────────────

console.log('\n--- Phase Transitions ---');

test('initiateCombat sets up correctly', () => {
    const a = makeCombatant('attacker', 2000);
    const d = makeCombatant('defender', 2000);
    const state = initiateCombat('c1', defaultTarget, a, d);

    expect(state.phase, 'orbital');
    expect(state.round, 1);
    expect(state.isSkirmish, false);
});

test('advanceRound transitions 3 Orbital -> 3 Ground -> Resolved', () => {
    const a = makeCombatant('attacker', 2000);
    const d = makeCombatant('defender', 2000);
    const state = initiateCombat('c1', defaultTarget, a, d);

    advanceRound(state); // R2 Orbital
    expect(state.phase, 'orbital');
    expect(state.round, 2);

    advanceRound(state); // R3 Orbital
    advanceRound(state); // R1 Ground + Orbital Winner decided

    expect(state.phase, 'ground');
    expect(state.round, 1);
    expectTrue(state.orbitalWinnerId !== undefined, 'Orbital winner should be decided');

    advanceRound(state); // R2 Ground
    advanceRound(state); // R3 Ground
    advanceRound(state); // End

    expectTrue(state.resolved, 'Battle should resolve after 3 ground rounds');
});

test('Skirmishes resolve immediately after 1 round', () => {
    const a = makeCombatant('attacker', 100);
    const d = makeCombatant('defender', 100); // Total 200 < threshold
    const state = initiateCombat('c1', defaultTarget, a, d);

    expectTrue(state.isSkirmish, 'Should be skirmish');
    advanceRound(state);
    expectTrue(state.resolved, 'Skirmish should resolve entirely after 1 round advance');
});

// ─── 3. Visibility Profiles ───────────────────────────────────────────────────

console.log('\n--- Visibility & Intel ---');

test('generateVisibilityProfile returns restricted data based on Intel Tier', () => {
    const target = makeCombatant('defender', 1000);
    target.composition = { armor: 700, infantry: 300 };

    const blind = generateVisibilityProfile('blind', target);
    expect(blind.level, 'size_only');
    expect(blind.estimatedBasePower, [500, 1500]);
    expect(blind.compositionBands, undefined);

    const observing = generateVisibilityProfile('observing', target);
    expect(observing.level, 'rough_archetype');
    expect(observing.estimatedBasePower, [700, 1300]);
    expectTrue(observing.visibleArchetypes.includes('armor-heavy'));

    const deep = generateVisibilityProfile('deep_penetration', target);
    expect(deep.level, 'precise_ranges');
    expect(deep.estimatedBasePower, [950, 1050]);
    expect(deep.compositionBands?.armor, [665, 735]); // +/- 5% of 700
});

// ─── 4. Annihilation System ───────────────────────────────────────────────────

console.log('\n--- Annihilation ---');

test('checkAnnihilation requires 3/3 Prediction Points and Ratio', () => {
    const a = makeCombatant('attacker', 5000);
    const d = makeCombatant('defender', 1000); // Ratio > 1.25
    const state = initiateCombat('c1', defaultTarget, a, d);

    state.defender.morale = 0.20; // < 0.30 threshold

    // No prediction points -> False
    let res = checkAnnihilation(state);
    expect(res.annihilatedFactionId, null);

    // 3/3 Prediction Points -> Random chance rolls
    state.attacker.predictionPoints = 3;

    // Force random to always succeed for this test by mocking Math.random
    const prevRandom = Math.random;
    Math.random = () => 0.01;

    res = checkAnnihilation(state);
    expect(res.annihilatedFactionId, 'factionB', 'Defender should be annihilated');

    Math.random = prevRandom; // Restore
});

// ─── 5. Engagement Round Resolution ───────────────────────────────────────────

console.log('\n--- Combat Round Resolution ---');

test('resolveEngagementRound applies damage, shifts momentum, decays supply', () => {
    const a = makeCombatant('attacker', 2000);
    const d = makeCombatant('defender', 2000);
    const state = initiateCombat('c1', defaultTarget, a, d);

    const report = resolveEngagementRound(state, {
        roundNumber: 1,
        attackerStance: 'blitz',
        defenderStance: 'entrench'
    });

    expectTrue(report.attackerDamageDealt > 0, 'Attacker should deal damage');
    expectTrue(report.defenderDamageDealt > 0, 'Defender should deal damage');
    expectTrue(report.supplyDecayAttacker > 0, 'Attacker supply should decay');
    expectTrue(state.momentum !== 0, 'Momentum should shift');
});

// ─── Output ───────────────────────────────────────────────────────────────────

console.log(`\nTests passed: ${passed}`);
if (failed > 0) {
    console.error(`Tests failed: ${failed}`);
    process.exit(1);
}
