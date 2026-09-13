// lib/combat/engagement-rules-tests.ts
// npx tsx lib/combat/engagement-rules-tests.ts
//
// The rules the sector-combat manager applies around the engine, plus the
// engine fixes that shipped with them (every hull fights, annihilation takes
// a roll) and the yard-driven repair rate.

import type { Fleet } from '../movement/types';
import type { CombatantState } from './combat-types';
import {
    pickRoles,
    latestArrival,
    snapshotForce,
    screeningEfficiencyOf,
    refreshCombatant,
    breakingFleets,
} from './engagement-rules';
import { yardRepairBonus, dockRepairPerCycle, DOCK_REPAIR_PER_CYCLE } from './fleet-repair';
import { initiateCombat, resolveEngagementRound, checkAnnihilation } from './combat-engine';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

function fleet(over: Partial<Fleet> & { id: string; factionId: string }): Fleet {
    return {
        name: over.id,
        currentSystemId: 'sys-1',
        destinationSystemId: null,
        originSystemId: null,
        basePower: 100,
        strength: 1,
        composition: { corvette: 10 },
        doctrine: {
            type: 'Balanced' as any,
            deviationFromPosture: 0,
            preferredLayers: ['hyperlane'],
            retreatThreshold: 0.3,
            logisticsStrain: 0,
            moraleDrift: 0,
            supplyLevel: 1,
        },
        hyperdriveProfile: {} as any,
        isDetectable: true,
        plannedPath: [],
        transitProgress: 0,
        etaSeconds: 0,
        activeLayer: null,
        orders: [],
        ...over,
    } as Fleet;
}

function combatant(role: 'attacker' | 'defender', composition: Record<string, number>, hp = 1000): CombatantState {
    return {
        factionId: role === 'attacker' ? 'A' : 'B',
        role,
        hp,
        maxHp: hp,
        baseForceCount: hp * 10,
        casualties: 0,
        organization: 100,
        maxOrganization: 100,
        screeningEfficiency: screeningEfficiencyOf(composition as any),
        composition: composition as any,
        intelLevel: 'observing',
        supply: 1,
        morale: 1,
        doctrine: 'aggressive',
        predictionPoints: 0,
        selectedStance: 'shock',
    };
}

console.log('\n1. Roles: the later arrival attacks');
{
    const a = [fleet({ id: 'a1', factionId: 'A', arrivedAtSeconds: 100 })];
    const b = [fleet({ id: 'b1', factionId: 'B', arrivedAtSeconds: 500 })];
    check('the fleet that arrived last is the attacker', pickRoles(a, b, null).swapped === true);
    check('the fleet that was already there defends', pickRoles(b, a, null).swapped === false);
    check('a side\'s arrival is its newest fleet', latestArrival([...a, fleet({ id: 'a2', factionId: 'A', arrivedAtSeconds: 900 })]) === 900);
    const oldA = [fleet({ id: 'a1', factionId: 'A' })];
    const oldB = [fleet({ id: 'b1', factionId: 'B' })];
    check('unstamped fleets count as having always been there', pickRoles(oldA, b, null).swapped === true);
    check('an unstamped tie falls to the system owner defending', pickRoles(oldA, oldB, 'A').swapped === true && pickRoles(oldA, oldB, 'B').swapped === false);
    check('an unstamped tie in nobody\'s system keeps A attacking', pickRoles(oldA, oldB, null).swapped === false);
}

console.log('\n2. Force snapshot follows strength');
{
    const half = fleet({ id: 'h', factionId: 'A', strength: 0.5, composition: { corvette: 10, battleship: 2 }, designProfile: { energy: 10, kinetic: 0, explosive: 0, shield: 4, armor: 0, evasion: 0 } as any });
    const snap = snapshotForce([half]);
    check('ship counts scale by strength', near(snap.composition.corvette!, 5) && near(snap.composition.battleship!, 1));
    check('the design signature scales by strength', near(snap.designProfile!.energy, 5) && near(snap.designProfile!.shield, 2));
    check('a dead fleet contributes nothing', Object.keys(snapshotForce([fleet({ id: 'd', factionId: 'A', strength: 0 })]).composition).length === 0);
    check('an empty roster falls back to destroyers by power', near(snapshotForce([fleet({ id: 'e', factionId: 'A', composition: {}, basePower: 450 })]).composition.destroyer!, 3));
    check('legacy UPPERCASE keys are folded', near(snapshotForce([fleet({ id: 'u', factionId: 'A', composition: { CORVETTE: 4 } as any })]).composition.corvette!, 4));
    check('three screens per capital screens fully', screeningEfficiencyOf({ corvette: 3, battleship: 1 }) === 1);
    check('one destroyer for one cruiser screens a third', near(screeningEfficiencyOf({ destroyer: 1, cruiser: 1 }), 1 / 3));
    check('a snapshot carries screening from the scaled roster', near(snap.screeningEfficiency, 1));
}

console.log('\n3. Round refresh keeps air attrition');
{
    const side = combatant('attacker', { corvette: 10, bomber: 2 });
    refreshCombatant(side, [fleet({ id: 'r', factionId: 'A', strength: 0.8, composition: { corvette: 10, bomber: 5 } })]);
    check('hull counts follow current strength', near(side.composition.corvette!, 8));
    check('bombers already shot down stay down', near(side.composition.bomber!, 2));
    const fresh = combatant('attacker', { corvette: 10 });
    refreshCombatant(fresh, [fleet({ id: 'r2', factionId: 'A', strength: 1, composition: { corvette: 4, cruiser: 2 } })]);
    check('a reinforced roster is picked up', near(fresh.composition.cruiser!, 2) && near(fresh.screeningEfficiency, 4 / 6));
}

console.log('\n4. Who breaks');
{
    const shaken = fleet({ id: 's', factionId: 'A', strength: 0.25 });
    const steady = fleet({ id: 't', factionId: 'A', strength: 0.5 });
    const dead = fleet({ id: 'x', factionId: 'A', strength: 0 });
    const noDoctrine = fleet({ id: 'n', factionId: 'A', strength: 0.1, doctrine: undefined as any });
    const out = breakingFleets([shaken, steady, dead, noDoctrine], 'shock');
    check('a fleet under its retreatThreshold breaks', out.some(f => f.id === 's'));
    check('a fleet above it holds', !out.some(f => f.id === 't'));
    check('a dead fleet is not "breaking"', !out.some(f => f.id === 'x'));
    check('no doctrine, no threshold, no rout', !out.some(f => f.id === 'n'));
    const all = breakingFleets([shaken, steady, dead], 'withdraw');
    check('the withdraw stance breaks every living fleet on the side', all.length === 2);
}

console.log('\n5. Every hull fights');
{
    const corvettes = initiateCombat('c', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 },
        combatant('attacker', { corvette: 12 }), combatant('defender', { corvette: 12 }));
    const r1 = resolveEngagementRound(corvettes, { roundNumber: 1, attackerStance: 'shock', defenderStance: 'entrench' });
    check('a corvette wing deals damage (used to be zero)', r1.attackerDamageDealt > 0 && r1.defenderDamageDealt > 0);
    const battleships = initiateCombat('b', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 },
        combatant('attacker', { battleship: 2 }), combatant('defender', { battleship: 2 }));
    const r2 = resolveEngagementRound(battleships, { roundNumber: 1, attackerStance: 'shock', defenderStance: 'entrench' });
    check('a battleship line deals damage (used to be zero)', r2.attackerDamageDealt > 0);
    const fractional = initiateCombat('f', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 },
        combatant('attacker', { corvette: 2.5 }), combatant('defender', { corvette: 2.5 }));
    const r3 = resolveEngagementRound(fractional, { roundNumber: 1, attackerStance: 'shock', defenderStance: 'entrench' });
    check('fractional (strength-scaled) rosters resolve', Number.isFinite(r3.attackerDamageDealt) && r3.attackerDamageDealt > 0);
}

console.log('\n6. Annihilation takes a roll');
{
    const state = initiateCombat('n', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 },
        combatant('attacker', { cruiser: 4 }, 2000), combatant('defender', { cruiser: 4 }, 1000));
    state.attacker.predictionPoints = 3;
    state.defender.morale = 0.1;
    check('a low roll annihilates the broken side', checkAnnihilation(state, () => 0).annihilatedFactionId === 'B');
    check('a high roll spares it', checkAnnihilation(state, () => 0.99).annihilatedFactionId === null);
    state.defender.morale = 0.9;
    check('a side with morale left cannot be annihilated', checkAnnihilation(state, () => 0).annihilatedFactionId === null);
}

console.log('\n7. Repair follows the yard');
{
    const yardPlanet = (id: string, ownerId: string, systemId: string, structureId: string | null, integrity = 100) => ({
        id, ownerId, systemId,
        orbital: structureId ? { slots: [{ slotId: `${id}-orb0`, structureId, state: 'active', integrity }], buildQueue: [] } : undefined,
    });
    const planets = [
        yardPlanet('p1', 'A', 'sys-1', 'spaceyard'),
        yardPlanet('p2', 'A', 'sys-1', 'capital_spaceyard', 50),
        yardPlanet('p3', 'B', 'sys-1', 'capital_spaceyard'),
        yardPlanet('p4', 'A', 'sys-2', 'capital_spaceyard'),
        yardPlanet('p5', 'A', 'sys-1', null),
    ];
    check('the best of the faction\'s yards in the system applies', near(yardRepairBonus(planets, 'A', 'sys-1', 0), 0.035));
    check('a rival\'s yard does not repair you', near(yardRepairBonus(planets, 'B', 'sys-2', 0), 0));
    check('a yard in another system does not reach', near(yardRepairBonus(planets.filter(p => p.id !== 'p2' && p.id !== 'p1'), 'A', 'sys-1', 0), 0));
    check('a damaged yard repairs in proportion to integrity', near(yardRepairBonus([yardPlanet('q', 'A', 'sys-1', 'spaceyard', 50)], 'A', 'sys-1', 0), 0.015));

    const world: any = {
        nowSeconds: 0,
        movement: { systems: new Map([['sys-1', { id: 'sys-1', ownerFactionId: 'A' }], ['sys-9', { id: 'sys-9', ownerFactionId: 'B' }]]), fleets: new Map() },
        construction: { planets: new Map(planets.map(p => [p.id, p])) },
    };
    const docked = fleet({ id: 'd', factionId: 'A', strength: 0.5 });
    check('a docked fleet repairs base plus the yard', near(dockRepairPerCycle(world, docked), DOCK_REPAIR_PER_CYCLE + 0.035));
    check('a fleet in an enemy system does not repair', dockRepairPerCycle(world, fleet({ id: 'e', factionId: 'A', currentSystemId: 'sys-9' })) === 0);
    check('a departing fleet does not repair', dockRepairPerCycle(world, fleet({ id: 'm', factionId: 'A', destinationSystemId: 'sys-9' })) === 0);
    check('a fleet in a friendly system with no yard repairs the base rate', near(dockRepairPerCycle({ ...world, construction: { planets: new Map() } }, docked), DOCK_REPAIR_PER_CYCLE));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
