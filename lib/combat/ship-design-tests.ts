// lib/combat/ship-design-tests.ts
// Run: npx tsx lib/combat/ship-design-tests.ts
//
// Covers the registry math, the worker-side design service, the recruit
// resolver's allowlist, and the two engine integrations (case-insensitive
// counter lookup, design-profile modifier).

import {
    DEFAULT_DESIGNS,
    SHIP_COMPONENTS,
    SHIP_HULLS,
    designProfileModifier,
    emptyProfile,
    getHull,
    normalizeComposition,
    summarizeDesign,
    addProfile,
    scaleProfile,
} from './ship-registry';
import { deleteDesign, resolveRecruitSpec, saveDesign } from './ship-design-service';
import { calculateCompositionModifier, calculateDesignModifier } from './combat-engine';
import type { CombatantState } from './combat-types';
import type { ShipDesign } from './ship-types';
import config from './combat-config.json';

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

function expectTrue(condition: boolean, msg?: string) {
    if (!condition) throw new Error(`Expected true. ${msg || ''}`);
}

function expectEq(actual: any, expected: any, msg?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. ${msg || ''}`);
    }
}

function stubWorld(unlocked: string[] = []) {
    const tech = new Map<string, { unlockedTechIds: string[] }>();
    tech.set('f1', { unlockedTechIds: unlocked });
    tech.set('f2', { unlockedTechIds: [] });
    return { shipDesigns: new Map<string, ShipDesign>(), tech, nowSeconds: 1000 };
}

function combatant(composition: Record<string, number>, designProfile?: any): CombatantState {
    return {
        factionId: 'x', role: 'attacker', hp: 100, maxHp: 100, baseForceCount: 100, casualties: 0,
        organization: 50, maxOrganization: 50, screeningEfficiency: 1,
        composition: composition as any, designProfile,
        intelLevel: 'observing', supply: 1, morale: 1, doctrine: 'aggressive', predictionPoints: 0,
    };
}

console.log('\n── Registry ──');

test('every hull mirrors the unit config power and cost', () => {
    const corvette = getHull('corvette')!;
    expectEq(corvette.basePower, 10);
    expectEq(corvette.baseCost, { credits: 800, metals: 300 });
    const battleship = getHull('BATTLESHIP')!; // case-insensitive lookup
    expectEq(battleship.basePower, 90);
    expectEq(battleship.baseBuildTime, 2400);
});

test('standard patterns are valid with NO tech and use no gated module', () => {
    for (const d of DEFAULT_DESIGNS) {
        const s = summarizeDesign(d, new Set());
        expectTrue(s.valid, `${d.name}: ${s.issues.join(' | ')}`);
        expectTrue(s.energyBalance >= 0, `${d.name} energy ${s.energyBalance}`);
        expectTrue(s.power > getHull(d.hullId)!.basePower, `${d.name} should beat a bare hull`);
    }
    expectEq(DEFAULT_DESIGNS.map(d => d.hullId), SHIP_HULLS.map(h => h.id));
});

test('bare hull summary equals config numbers', () => {
    const s = summarizeDesign({ hullId: 'cruiser', name: 'Bare', components: {} }, null);
    expectEq(s.power, 45);
    expectEq(s.cost, { CREDITS: 3600, METALS: 1500 });
    expectEq(s.buildTime, 1200);
    expectEq(s.energyDrawn, 0);
    expectTrue(s.valid);
});

test('modules add power, cost, build time and energy draw', () => {
    const s = summarizeDesign({
        hullId: 'corvette', name: 'Laser Picket',
        components: { w1: 'wpn-pulse-laser', u1: 'util-deflector', c1: 'core-fission' },
    }, null);
    expectEq(s.power, Math.round(10 * (1 + 0.10 + 0.08)));
    expectEq(s.cost, { CREDITS: 800 + 120 + 150 + 100, METALS: 300 + 40 + 60 + 80 });
    expectEq(s.buildTime, 300 + 30 + 30 + 30);
    expectEq(s.energyDrawn, 18);
    expectEq(s.energyProduced, 10 + 40);
    expectEq(s.profile.energy, 1);
    expectEq(s.profile.shield, 1);
});

test('slot type mismatch, unknown slot and unknown module are rejected', () => {
    const bad = summarizeDesign({
        hullId: 'corvette', name: 'Bad',
        components: { w1: 'util-deflector', u9: 'util-plating', c1: 'nope' },
    }, null);
    expectTrue(!bad.valid);
    expectTrue(bad.issues.some(i => i.includes('cannot be fitted')), bad.issues.join(' | '));
    expectTrue(bad.issues.some(i => i.includes('does not exist')), bad.issues.join(' | '));
    expectTrue(bad.issues.some(i => i.includes('Unknown module')), bad.issues.join(' | '));
});

test('energy budget binds on a heavy loadout without a big core', () => {
    const s = summarizeDesign({
        hullId: 'battleship', name: 'Glass Lance',
        components: { w1: 'wpn-spinal-lance', w2: 'wpn-spinal-lance', w3: 'wpn-spinal-lance', w4: 'wpn-spinal-lance', c1: 'core-fission' },
    }, null);
    expectTrue(!s.valid);
    expectTrue(s.energyBalance < 0);
    const ok = summarizeDesign({
        hullId: 'battleship', name: 'Lance',
        components: { w1: 'wpn-spinal-lance', w2: 'wpn-spinal-lance', w3: 'wpn-spinal-lance', w4: 'wpn-spinal-lance', c1: 'core-singularity' },
    }, null);
    expectTrue(ok.valid, ok.issues.join(' | '));
});

test('tech prerequisite locks a module until researched', () => {
    const design = { hullId: 'destroyer' as const, name: 'Rail', components: { w1: 'wpn-gauss-railgun' } };
    const locked = summarizeDesign(design, new Set());
    expectTrue(!locked.valid);
    expectEq(locked.lockedComponentIds, ['wpn-gauss-railgun']);
    const unlocked = summarizeDesign(design, new Set(['mil_t1_5']));
    expectTrue(unlocked.valid, unlocked.issues.join(' | '));
    const untracked = summarizeDesign(design, null);
    expectTrue(untracked.valid, 'null tech set skips the gate');
});

test('every gated module names a tech id that looks real', () => {
    for (const c of SHIP_COMPONENTS) {
        if (!c.techPrerequisite) continue;
        expectTrue(/^(mil|inf|eco|esp|dip)_t\d/.test(c.techPrerequisite), `${c.id}: ${c.techPrerequisite}`);
    }
});

test('normalizeComposition folds case and drops non-positive counts', () => {
    expectEq(normalizeComposition({ CORVETTE: 2, corvette: 1, Destroyer: 3, BATTLESHIP: 0, cruiser: -2 }),
        { corvette: 3, destroyer: 3 });
    expectEq(normalizeComposition(null), {});
});

test('profile add and scale', () => {
    const p = addProfile(emptyProfile(), { energy: 1, shield: 2 }, 3);
    expectEq(p.energy, 3);
    expectEq(p.shield, 6);
    expectEq(scaleProfile(p, 0.5).shield, 3);
});

console.log('\n── Design-profile modifier ──');

test('lasers beat shields, lose to armor; symmetric magnitudes; capped', () => {
    const cap = 0.15;
    const lasers = { energy: 10, kinetic: 0, explosive: 0, shield: 0, armor: 0, evasion: 0 };
    const shielded = { energy: 0, kinetic: 0, explosive: 0, shield: 10, armor: 0, evasion: 0 };
    const armored = { energy: 0, kinetic: 0, explosive: 0, shield: 0, armor: 10, evasion: 0 };
    const vsShield = designProfileModifier(lasers, shielded, 10, cap);
    const vsArmor = designProfileModifier(lasers, armored, 10, cap);
    expectEq(vsShield, cap);
    expectEq(vsArmor, -cap);
    // Nothing without weapons; nothing against nothing.
    expectEq(designProfileModifier(shielded, lasers, 10, cap), 0);
    expectEq(designProfileModifier(lasers, null, 10, cap), 0);
});

test('bare hulls are punished by explosives, half-punished by the rest', () => {
    const missiles = { energy: 0, kinetic: 0, explosive: 4, shield: 0, armor: 0, evasion: 0 };
    const bare = { energy: 0, kinetic: 0, explosive: 0, shield: 0, armor: 0, evasion: 0 };
    expectEq(designProfileModifier(missiles, bare, 5, 0.15), 0.15);
    const guns = { energy: 0, kinetic: 4, explosive: 0, shield: 0, armor: 0, evasion: 0 };
    expectEq(Math.round(designProfileModifier(guns, bare, 5, 0.15) * 1000) / 1000, 0.075);
});

test('mixed fleets land between the extremes', () => {
    const mixed = { energy: 5, kinetic: 5, explosive: 0, shield: 0, armor: 0, evasion: 0 };
    const shielded = { energy: 0, kinetic: 0, explosive: 0, shield: 10, armor: 0, evasion: 0 };
    const m = designProfileModifier(mixed, shielded, 10, 0.15);
    expectTrue(Math.abs(m) < 1e-9, `expected ~0, got ${m}`);
});

console.log('\n── Engine integration ──');

test('composition counters are case-insensitive (player fleets used UPPERCASE)', () => {
    const lower = calculateCompositionModifier({ destroyer: 4 } as any, { corvette: 4 } as any, 'orbital');
    const upper = calculateCompositionModifier({ DESTROYER: 4 } as any, { CORVETTE: 4 } as any, 'orbital');
    expectTrue(lower > 0, 'destroyers should counter corvettes');
    expectEq(upper, lower);
    const ground = calculateCompositionModifier({ ARMOR: 4 } as any, { INFANTRY: 4 } as any, 'ground');
    expectTrue(ground > 0, 'armor should counter infantry even with UPPERCASE keys');
});

test('orbital counter grid covers every buildable hull', () => {
    const grid = config.unitCounters.orbital as Record<string, Record<string, number>>;
    for (const h of SHIP_HULLS) expectTrue(!!grid[h.id], `missing counters for ${h.id}`);
    // Each hull both beats and is beaten by something — no dominant hull.
    for (const h of SHIP_HULLS) {
        const beats = Object.values(grid[h.id]).some(v => v > 0);
        const beatenBy = Object.values(grid).some(row => (row[h.id] ?? 0) > 0);
        expectTrue(beats && beatenBy, `${h.id} beats=${beats} beatenBy=${beatenBy}`);
    }
});

test('calculateDesignModifier is 0 when either side lacks a profile', () => {
    const a = combatant({ corvette: 3 }, { energy: 3, kinetic: 0, explosive: 0, shield: 0, armor: 0, evasion: 0 });
    const b = combatant({ corvette: 3 });
    expectEq(calculateDesignModifier(a, b), 0);
    const c = combatant({ corvette: 3 }, { energy: 0, kinetic: 0, explosive: 0, shield: 3, armor: 0, evasion: 0 });
    expectEq(calculateDesignModifier(a, c), config.constants.maxDesignBonusCap);
});

console.log('\n── Design service ──');

test('save stores an owned, timestamped design and ignores payload factionId', () => {
    const world = stubWorld();
    const r = saveDesign(world, 'f1', {
        factionId: 'f2', name: '  Lancer ', hullId: 'destroyer',
        components: { w1: 'wpn-pulse-laser', w2: 'wpn-autocannon', u1: 'util-plating' },
    }, 1234);
    expectTrue(r.ok, (r as any).reason);
    const d = (r as any).design as ShipDesign;
    expectEq(d.factionId, 'f1');
    expectEq(d.name, 'Lancer');
    expectEq(d.createdAt, 1234);
    expectTrue(world.shipDesigns.has(d.id));
});

test('save rejects tech-locked, over-budget, unnamed and standard ids', () => {
    const world = stubWorld();
    expectTrue(!saveDesign(world, 'f1', { name: 'Rail', hullId: 'destroyer', components: { w1: 'wpn-gauss-railgun' } }, 1).ok);
    expectTrue(saveDesign(stubWorld(['mil_t1_5']), 'f1', { name: 'Rail', hullId: 'destroyer', components: { w1: 'wpn-gauss-railgun' } }, 1).ok);
    expectTrue(!saveDesign(world, 'f1', { name: '', hullId: 'corvette', components: {} }, 1).ok);
    expectTrue(!saveDesign(world, 'f1', { id: 'default-corvette', name: 'Hijack', hullId: 'corvette', components: {} }, 1).ok);
    expectTrue(!saveDesign(world, 'f1', { name: 'Hot', hullId: 'corvette', components: { w1: 'wpn-spinal-lance' } }, 1).ok, 'energy');
});

test('a faction cannot overwrite or delete another faction\'s design', () => {
    const world = stubWorld();
    const mine = saveDesign(world, 'f1', { name: 'Mine', hullId: 'corvette', components: {} }, 1) as any;
    const theft = saveDesign(world, 'f2', { id: mine.design.id, name: 'Stolen', hullId: 'corvette', components: {} }, 2);
    expectTrue(!theft.ok);
    expectEq(world.shipDesigns.get(mine.design.id)!.name, 'Mine');
    expectTrue(!deleteDesign(world, 'f2', mine.design.id).ok);
    expectTrue(deleteDesign(world, 'f1', mine.design.id).ok);
    expectTrue(!world.shipDesigns.has(mine.design.id));
    expectTrue(!deleteDesign(world, 'f1', 'default-corvette').ok);
});

test('registry cap holds', () => {
    const world = stubWorld();
    for (let i = 0; i < 24; i++) {
        expectTrue(saveDesign(world, 'f1', { name: `D${i}`, hullId: 'corvette', components: {} }, i).ok);
    }
    expectTrue(!saveDesign(world, 'f1', { name: 'Overflow', hullId: 'corvette', components: {} }, 99).ok);
    // Updating an existing one still works at the cap.
    const first = Array.from(world.shipDesigns.values())[0];
    expectTrue(saveDesign(world, 'f1', { id: first.id, name: 'Renamed', hullId: 'corvette', components: {} }, 100).ok);
});

console.log('\n── Recruit resolver ──');

test('fleet: a bare hull name builds the standard pattern, priced from the design', () => {
    const r = resolveRecruitSpec(stubWorld(), 'f1', { unitType: 'CORVETTE' }, 'fleet');
    expectTrue(r.ok, (r as any).reason);
    const spec = (r as any).spec;
    expectEq(spec.unitType, 'CORVETTE');
    expectEq(spec.classKey, 'corvette');
    expectEq(spec.designId, 'default-corvette');
    expectEq(spec.unitPower, summarizeDesign(DEFAULT_DESIGNS[0], null).power);
    expectTrue(spec.cost.CREDITS > 800, 'modules cost extra over the bare hull');
});

test('fleet: refuses ground units, unknown strings and foreign designs', () => {
    const world = stubWorld();
    expectTrue(!resolveRecruitSpec(world, 'f1', { unitType: 'INFANTRY' }, 'fleet').ok);
    expectTrue(!resolveRecruitSpec(world, 'f1', { unitType: 'MECH' }, 'fleet').ok);
    expectTrue(!resolveRecruitSpec(world, 'f1', { unitType: '' }, 'fleet').ok);
    const other = saveDesign(world, 'f2', { name: 'Theirs', hullId: 'corvette', components: {} }, 1) as any;
    expectTrue(!resolveRecruitSpec(world, 'f1', { designId: other.design.id }, 'fleet').ok);
    expectTrue(resolveRecruitSpec(world, 'f2', { designId: other.design.id }, 'fleet').ok);
});

test('ground: refuses hulls and unknown types (MECH was free)', () => {
    const world = stubWorld();
    expectTrue(!resolveRecruitSpec(world, 'f1', { unitType: 'MECH' }, 'ground').ok);
    expectTrue(!resolveRecruitSpec(world, 'f1', { unitType: 'CRUISER' }, 'ground').ok);
    const r = resolveRecruitSpec(world, 'f1', { unitType: 'anti_armor' }, 'ground');
    expectTrue(r.ok, (r as any).reason);
    expectEq((r as any).spec.unitType, 'ANTI_ARMOR');
    expectEq((r as any).spec.cost, { CREDITS: 350, METALS: 150 });
});

test('fleet: a saved design that later fails validation cannot be built', () => {
    // A design can only be saved when valid, so simulate corruption directly.
    const world = stubWorld();
    world.shipDesigns.set('d-bad', { id: 'd-bad', factionId: 'f1', name: 'Bad', hullId: 'corvette', components: { w1: 'wpn-spinal-lance' } });
    expectTrue(!resolveRecruitSpec(world, 'f1', { designId: 'd-bad' }, 'fleet').ok);
});

console.log(`\nTests passed: ${passed}`);
if (failed > 0) {
    console.error(`Tests failed: ${failed}`);
    process.exit(1);
}
