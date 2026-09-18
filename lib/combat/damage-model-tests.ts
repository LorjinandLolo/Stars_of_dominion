// lib/combat/damage-model-tests.ts
// npx tsx lib/combat/damage-model-tests.ts
//
// Power-vs-power damage at the engine level: the formula, torpedoes, bombers,
// forts, momentum, organization, the fleet-action layer, and the pacing table
// the round fraction was chosen for. Math.random is pinned so the engine's
// intel-prediction roll never fires.

import { initiateCombat, resolveEngagementRound, advanceRound } from './combat-engine';
import type { CombatantState, CombatState } from './combat-types';
import { fleetMass, massOf, screenPowerShare, screeningEfficiencyOf, syncPool } from './engagement-rules';
import config from './combat-config.json';

Math.random = () => 0.99;
const C = config.constants;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

function side(role: 'attacker' | 'defender', composition: Record<string, number>, hp: number, extra: Partial<CombatantState> = {}): CombatantState {
    return {
        factionId: role === 'attacker' ? 'A' : 'B', role, hp, maxHp: hp,
        baseForceCount: hp / C.hpPerPower, casualties: 0,
        organization: 100, maxOrganization: 100,
        screeningEfficiency: screeningEfficiencyOf(composition as any),
        composition: composition as any,
        intelLevel: 'blind', supply: 1, morale: 1, doctrine: 'aggressive',
        predictionPoints: 0, selectedStance: 'shock',
        ...extra,
    };
}
function fight(a: CombatantState, d: CombatantState, fleetAction = true): CombatState {
    return initiateCombat('t', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1, fleetAction }, a, d);
}
const round = (s: CombatState) => resolveEngagementRound(s, { roundNumber: s.round, attackerStance: 'shock', defenderStance: 'shock' });

console.log('\n1. Damage is a fraction of effective mass');
{
    const s = fight(side('attacker', { cruiser: 10 }, 1000), side('defender', { cruiser: 10 }, 1000));
    const r = round(s);
    check('equal sides deal roundDamageFraction of their pool', near(r.attackerDamageDealt, 1000 * C.roundDamageFraction) && near(r.defenderDamageDealt, 1000 * C.roundDamageFraction), `${r.attackerDamageDealt}/${r.defenderDamageDealt}`);
    check('an even exchange moves momentum nowhere', s.momentum === 0 && r.momentumShift === 0);
    check('organization falls with the share of the force lost', near(s.defender.organization, 100 - 100 * C.organizationDamageScale * 0.08), String(s.defender.organization));

    const big = fight(side('attacker', { cruiser: 10 }, 2000), side('defender', { cruiser: 10 }, 1000));
    const rb = round(big);
    check('twice the mass, twice the damage', near(rb.attackerDamageDealt, 160) && near(rb.defenderDamageDealt, 80));
    check('out-damaging 2:1 swings momentum by a third of the scale', near(rb.momentumShift, C.momentumSwingScale * (160 - 80) / 240), String(rb.momentumShift));
    check('the multiplier is reported', near(rb.attackerMultiplier ?? 0, 1) && near(rb.defenderMultiplier ?? 0, 1));
}

console.log('\n2. Ship count no longer decides damage');
{
    // Same mass: sixty corvettes or five battleships. The old table gave the
    // swarm 360 raw attack and the battle line 50.
    const swarm = fight(side('attacker', { corvette: 60 }, 7200), side('defender', { cruiser: 10 }, 7200));
    const line = fight(side('attacker', { battleship: 5 }, 7200), side('defender', { cruiser: 10 }, 7200));
    const rs = round(swarm);
    const rl = round(line);
    const ratio = rs.attackerDamageDealt / rl.attackerDamageDealt;
    check('a swarm and a battle line of equal mass hit within the RPS band of each other', ratio > 0.6 && ratio < 1.6, String(ratio));
}

console.log('\n3. Torpedoes reward unscreened capitals');
{
    check('screen share is by hull weight', near(screenPowerShare({ corvette: 12, battleship: 1 } as any), 120 / 210), String(screenPowerShare({ corvette: 12, battleship: 1 } as any)));
    check('a carrier weighs as a cruiser and wings weigh nothing', near(screenPowerShare({ destroyer: 2, carrier: 1, bomber: 40 } as any), 44 / 89));
    check('an empty or wings-only roster has no screens', screenPowerShare({} as any) === 0 && screenPowerShare({ interceptor: 9 } as any) === 0);

    const open = fight(side('attacker', { corvette: 12 }, 1440), side('defender', { battleship: 1 }, 1420));
    const ro = round(open);
    check('full bonus against a capital with no screens', near(ro.attackerTorpedoFactor ?? 0, 1 + C.torpedoBonus), String(ro.attackerTorpedoFactor));
    const covered = fight(side('attacker', { corvette: 12 }, 1440), side('defender', { battleship: 1, destroyer: 3 }, 1420));
    const rc = round(covered);
    check('none against a fully screened one', near(rc.attackerTorpedoFactor ?? 0, 1));
    const noCapitals = fight(side('attacker', { corvette: 12 }, 1440), side('defender', { corvette: 12 }, 1440));
    check('none when the enemy has no capitals at all', near(round(noCapitals).attackerTorpedoFactor ?? 0, 1));
}

console.log('\n4. Air');
{
    const s = fight(side('attacker', { cruiser: 10, bomber: 5 }, 1000), side('defender', { cruiser: 10 }, 1000));
    const r = round(s);
    check('bombers that get through strike the pool', near(r.attackerAirDamage ?? 0, 5 * C.bomberStrikeDamage * (r.attackerMultiplier ?? 0)) && (r.attackerAirDamage ?? 0) > 0, String(r.attackerAirDamage));
    const cap = fight(side('attacker', { cruiser: 10, bomber: 5 }, 1000), side('defender', { cruiser: 10, interceptor: 5 }, 1000));
    const rc = round(cap);
    check('interceptors shoot them down first', (rc.attackerAirDamage ?? 1) === 0 && cap.attacker.composition.bomber === 0);
    const wings = fight(side('attacker', { interceptor: 2 }, 1000), side('defender', { cruiser: 10 }, 1000));
    check('a wings-only raider still fights with its rated power (it used to deal zero)', round(wings).attackerDamageDealt > 0);
}

console.log('\n5. Orbital defenses fire from the pool');
{
    const fort = { defensePower: 185, shieldStrength: 0, planetIds: ['p'] };
    const s = fight(side('attacker', { cruiser: 6 }, 6000), side('defender', { corvette: 3 }, 3000 + 1850, { fortification: fort }));
    const r = round(s);
    const expected = C.roundDamageFraction * (r.defenderMultiplier ?? 0) * (3000 * (r.defenderTorpedoFactor ?? 1) + 1850 * C.fortificationFirepowerRatio);
    check('ships and fort both contribute, the fort at its own ratio', near(r.defenderDamageDealt, expected), `${r.defenderDamageDealt} vs ${expected}`);
    const bare = fight(side('attacker', { cruiser: 6 }, 6000), side('defender', { corvette: 3 }, 3000));
    check('a fortified defender out-shoots the same fleet alone', r.defenderDamageDealt > round(bare).defenderDamageDealt);
}

console.log('\n6. A fleet action is orbital for all six rounds');
{
    const mk = (fleetAction: boolean) => {
        const s = fight(side('attacker', { corvette: 10 }, 1000), side('defender', { destroyer: 10 }, 1000), fleetAction);
        s.phase = 'ground';
        return round(s);
    };
    const fleetRound = mk(true);
    const groundRound = mk(false);
    check('the counter grid still bites in the late rounds', !near(fleetRound.attackerMultiplier ?? 1, 1), String(fleetRound.attackerMultiplier));
    check('it used to fall silent (ships match nothing in the ground table)', near(groundRound.attackerMultiplier ?? 0, 1), String(groundRound.attackerMultiplier));
}

console.log('\n7. Pool helpers');
{
    check('fleet mass is power × strength × veterancy × hpPerPower', near(fleetMass({ basePower: 100, strength: 0.5, experience: 0.25 }), 100 * 0.5 * 1.25 * C.hpPerPower));
    check('strength is clamped', near(fleetMass({ basePower: 100, strength: 7, experience: 0 }), 1000) && fleetMass({ basePower: 100, strength: -1, experience: 0 }) === 0);
    const s = side('defender', { cruiser: 1 }, 0, { fortification: { defensePower: 50, shieldStrength: 0, planetIds: [] } });
    const f1: any = { id: 'f1', basePower: 100, strength: 1 };
    syncPool(s, [f1]);
    check('syncPool: hp and maxHp are fleets plus fort', near(s.hp, 1000 + 500) && near(s.maxHp, 1500));
    f1.strength = 0.5;
    s.fortification = { defensePower: 25, shieldStrength: 0, planetIds: [] };
    syncPool(s, [f1]);
    check('losses lower hp, never maxHp', near(s.hp, 500 + 250) && near(s.maxHp, 1500), `${s.hp}/${s.maxHp}`);
    syncPool(s, [f1, { id: 'f2', basePower: 40, strength: 1 } as any]);
    check('a reinforcement raises both', near(s.hp, 750 + 400) && near(s.maxHp, 1900));
    check('massOf sums', near(massOf([{ basePower: 10, strength: 1 }, { basePower: 20, strength: 0.5 }] as any), 200));
}

console.log('\n8. Pacing (roundDamageFraction ' + C.roundDamageFraction + ', neutral stances, six rounds a battle)');
{
    // Engine-only war: pools fight battle after battle until a side falls to
    // its rout threshold. No cap or floor here; that is the manager's job.
    const war = (a0: number, b0: number, threshold = 0.3) => {
        let a = a0, b = b0, rounds = 0;
        while (rounds < 200) {
            const s = fight(side('attacker', { cruiser: 10 }, a), side('defender', { cruiser: 10 }, b));
            for (let i = 0; i < 6; i++) {
                round(s); advanceRound(s); rounds++;
                a = s.attacker.hp; b = s.defender.hp;
                if (a / a0 <= threshold || b / b0 <= threshold) return { rounds, a: a / a0, b: b / b0 };
            }
        }
        return { rounds, a: a / a0, b: b / b0 };
    };
    const battle1 = (() => { const s = fight(side('attacker', { cruiser: 10 }, 1000), side('defender', { cruiser: 10 }, 1000)); for (let i = 0; i < 6; i++) { round(s); advanceRound(s); } return s.attacker.hp / 1000; })();
    check('equals keep about 0.6 after one battle', near(battle1, Math.pow(1 - C.roundDamageFraction, 6), 1e-9) && battle1 > 0.55 && battle1 < 0.66, String(battle1));
    const equal = war(1000, 1000);
    check('equals need a third battle to break each other', equal.rounds > 12 && equal.rounds <= 18, JSON.stringify(equal));
    const two = war(2000, 1000);
    check('2:1 is over inside one battle and the winner keeps over 0.8', two.rounds <= 6 && two.a > 0.8, JSON.stringify(two));
    const five = war(5000, 1000);
    check('5:1 is over in two rounds', five.rounds <= 2 && five.a > 0.95, JSON.stringify(five));
    const close = war(1250, 1000);
    check('1.25:1 takes a second battle', close.rounds > 6 && close.rounds <= 12 && close.a > 0.55, JSON.stringify(close));
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
