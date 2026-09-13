// lib/combat/fleet-speed-tests.ts
// npx tsx lib/combat/fleet-speed-tests.ts
//
// Lane speed from hull class and design modules, and the design summary's
// speedMult that feeds it.

import { HULL_SPEED_FACTORS, hullSpeedFactor, shipCountOf, blendSpeedBonus, fleetSpeedFactor } from './fleet-speed';
import { summarizeDesign, DEFAULT_DESIGNS } from './ship-registry';
import { findPath } from '../movement/movement-service';
import type { Fleet, MovementWorldState, SystemNode } from '../movement/types';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('\n1. The slowest hull sets the pace');
{
    check('a corvette wing is the fastest', near(hullSpeedFactor({ corvette: 12 }), HULL_SPEED_FACTORS.corvette));
    check('one battleship slows the whole fleet to its pace', near(hullSpeedFactor({ corvette: 12, battleship: 1 }), HULL_SPEED_FACTORS.battleship));
    check('wings do not count', near(hullSpeedFactor({ interceptor: 40 }), 1));
    check('legacy UPPERCASE keys are read', near(hullSpeedFactor({ CRUISER: 2 } as any), HULL_SPEED_FACTORS.cruiser));
    check('an empty roster moves at 1', near(hullSpeedFactor({}), 1) && near(hullSpeedFactor(null), 1));
    check('zero-count entries are ignored', near(hullSpeedFactor({ battleship: 0, corvette: 3 }), HULL_SPEED_FACTORS.corvette));
    check('ship count skips wings', shipCountOf({ corvette: 3, bomber: 12, battleship: 1 }) === 4);
}

console.log('\n2. Design bonus blends by ship');
{
    check('first ships set the bonus', near(blendSpeedBonus(undefined, 0, 0.2, 4), 0.2));
    check('later ships average in', near(blendSpeedBonus(0.2, 4, 0, 4), 0.1));
    check('a fleet with no ships takes the incoming bonus', near(blendSpeedBonus(undefined, 0, undefined, 0), 0));
    check('speed factor = hull pace × (1 + bonus)', near(fleetSpeedFactor({ composition: { corvette: 4 }, designSpeedBonus: 0.2 }), HULL_SPEED_FACTORS.corvette * 1.2));
    check('a legacy fleet without a bonus still gets its hull pace', near(fleetSpeedFactor({ composition: { battleship: 2 } }), HULL_SPEED_FACTORS.battleship));
}

console.log('\n3. Designs carry a speed bonus');
{
    const bare = summarizeDesign({ hullId: 'corvette', name: 'Bare', components: {} } as any, null);
    check('a bare hull has no bonus', bare.speedMult === 0);
    const corvette = DEFAULT_DESIGNS.find(d => d.hullId === 'corvette')!;
    // The standard corvette carries a Deflector in its utility slot (u1); swap it.
    const burner = summarizeDesign({ hullId: 'corvette', name: 'Burner', components: { ...corvette.components, u1: 'util-afterburners' } } as any, null);
    const thruster = summarizeDesign({ hullId: 'corvette', name: 'Nimble', components: { ...corvette.components, u1: 'util-thrusters' } } as any, null);
    check('the standard corvette has no speed bonus', summarizeDesign(corvette, null).speedMult === 0);
    check('Afterburners add 0.20', near(burner.speedMult, 0.20), String(burner.speedMult));
    check('Thrusters add 0.10', near(thruster.speedMult, 0.10), String(thruster.speedMult));
    check('a module in the wrong slot adds nothing', summarizeDesign({ hullId: 'corvette', name: 'Wrong', components: { ...corvette.components, c1: 'util-afterburners' } } as any, null).speedMult === 0);
}

console.log('\n4. Movement reads it');
{
    const sys = (id: string, neighbors: string[]): SystemNode => ({
        id, name: id, x: 0, y: 0, hyperlaneNeighbors: neighbors, ownerFactionId: null, tags: [],
    } as any);
    const world: MovementWorldState = {
        systems: new Map([['A', sys('A', ['B'])], ['B', sys('B', ['A'])]]),
        tradeSegments: new Map(), corridors: new Map(), gates: new Map(), fleets: new Map(),
        armies: new Map(), empirePostures: new Map(), factionVisibility: new Map(), nowSeconds: 0,
    } as any;
    const fleet = (composition: Record<string, number>, designSpeedBonus?: number): Fleet => ({
        id: 'f', factionId: 'x', name: 'f', currentSystemId: 'A', destinationSystemId: null, originSystemId: null,
        basePower: 100, strength: 1, composition, designSpeedBonus,
        doctrine: { type: 'Balanced', deviationFromPosture: 0, preferredLayers: ['hyperlane'], retreatThreshold: 0.3, logisticsStrain: 0, moraleDrift: 0, supplyLevel: 1 },
        hyperdriveProfile: { hyperlane: { speedMultiplier: 1, detectabilityMultiplier: 1, supplyStrainMultiplier: 1 } } as any,
        isDetectable: true, plannedPath: [], transitProgress: 0, etaSeconds: 0, activeLayer: null, orders: [],
    } as any);
    const corvettes = findPath(fleet({ corvette: 6 }), 'B', ['hyperlane'], world);
    const battleships = findPath(fleet({ battleship: 2 }), 'B', ['hyperlane'], world);
    const burners = findPath(fleet({ corvette: 6 }, 0.2), 'B', ['hyperlane'], world);
    check('paths resolve', !!corvettes && !!battleships && !!burners && corvettes.totalSeconds > 0);
    check('a battleship line takes longer than a corvette wing', battleships.totalSeconds > corvettes.totalSeconds, `${battleships.totalSeconds} vs ${corvettes.totalSeconds}`);
    check('the ratio is the hull factors', near(battleships.totalSeconds / corvettes.totalSeconds, HULL_SPEED_FACTORS.corvette / HULL_SPEED_FACTORS.battleship, 1e-6), String(battleships.totalSeconds / corvettes.totalSeconds));
    check('Afterburners on every ship cut the trip by a sixth', near(burners.totalSeconds / corvettes.totalSeconds, 1 / 1.2, 1e-6), String(burners.totalSeconds / corvettes.totalSeconds));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
