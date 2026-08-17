// scripts/sarrak-probe.ts
// Are the Sarrak mechanics LIVE, or just written?
//
// Covers Religious Cohesion, Swamp Juice, Biome Affinity and the Slave Economy,
// plus the cross-faction conquest bug they depend on. The assertions target this
// codebase's actual failure mode — not crashes, but values written where
// something else overwrites them, buffs routed through a clamp that discards
// them, and functions defined and never called.
//
//   npx tsx scripts/sarrak-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, tickFactionTraits } from '../lib/factions/traits-service';
import {
    SERUM_DURATION_SECONDS,
    SERUM_COMBAT_BONUS,
    SERUM_WITHDRAWAL_PENALTY,
    WITHDRAWAL_UNREST,
    SLAVE_BUILD_SPEED,
    DOSES_METRIC,
    CONQUEST_METRIC,
    administerSerum,
    checkSerumGate,
    districtTraitMultiplier,
    getSerumBonus,
    infrastructureSpeedFor,
    isDosed,
    isWithdrawing,
    isSlaveWorld,
    recordConquest,
} from '../lib/factions/sarrak';
import { warFatigueResistance } from '../lib/factions/civ-ids';
import { getMetric } from '../lib/tech/history-ledger';
import { ensureGovernments } from '../lib/government/government-service';
import { ensureCohesion, tickCohesion, distancesFromCapital } from '../lib/government/cohesion-service';
import { traitMultiplier, initiateCombat } from '../lib/combat/combat-engine';
import { upgradeDuration } from '../lib/infrastructure/infrastructure-service';
import type { CombatantState } from '../lib/combat/combat-types';

const SK = 'faction-sarrak';
const OTHER = 'faction-movanites';
const TICK = 6 * 60 * 60;

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const world = getGameWorldState();
ensureFactionTraits(world);
ensureGovernments(world);
ensureCohesion(world);
world.nowSeconds = 5_000_000;

// ── 1. Religious Cohesion ───────────────────────────────────────────────────
console.log('\n[1] Religious Cohesion — war weariness');
{
    check('the Sarrak accrue no war weariness', warFatigueResistance(world, SK) === 0);
    check('everyone else accrues normally', warFatigueResistance(world, OTHER) === 1);

    // The liveness assertion: drive a war and confirm the accumulator diverges.
    world.rivalries.set(`rivalry-${SK}-${OTHER}`, {
        id: `rivalry-${SK}-${OTHER}`, empireAId: SK, empireBId: OTHER, rivalryScore: 100,
        escalationLevel: 7, recentEvents: [],
    } as any);

    const sk: any = world.government.get(SK);
    const other: any = world.government.get(OTHER);
    check('both factions have a government', !!sk && !!other);
    if (sk && other) {
        sk.warFatigue = 50;
        other.warFatigue = 50;
        for (let i = 0; i < 8; i++) tickCohesion(world, TICK);

        check('a warring Sarrak empire sheds war weariness', sk.warFatigue < 50, `got ${sk.warFatigue}`);
        check('their enemy accumulates it', other.warFatigue > 50, `got ${other.warFatigue}`);

        // The property that separates interpolation from a plain multiply: a
        // `* resist` on the accrual branch alone would leave them FROZEN at 50
        // forever. They must actually walk down to zero while still at war.
        for (let i = 0; i < 120; i++) tickCohesion(world, TICK);
        check('the Sarrak reach zero weariness while still at war',
            sk.warFatigue < 1, `got ${sk.warFatigue} — a plain multiply would have frozen it at 50`);
        check('their enemy is exhausted by the same war',
            other.warFatigue > 90, `got ${other.warFatigue}`);
    }
    world.rivalries.delete(`rivalry-${SK}-${OTHER}`);
}

// ── 2. Swamp Juice ──────────────────────────────────────────────────────────
console.log('\n[2] Swamp Juice');
{
    const traits = world.factionTraits!.get(SK)!;
    traits.sarrak = {
        serumEndsAtSeconds: 0, withdrawalEndsAtSeconds: 0, dosesTaken: 0,
        lastResolvedEpisode: -1, slaveWorlds: {}, lastEvaluatedSeconds: 0,
    };
    const t0 = world.nowSeconds;

    check('nobody else may take the serum',
        checkSerumGate(world, OTHER, 'SAR_ADMINISTER_SERUM').allowed === false);
    check('the gate ignores unrelated actions',
        checkSerumGate(world, SK, 'MIL_MOVE_FLEET').allowed === true);
    check('a clean host may be dosed',
        checkSerumGate(world, SK, 'SAR_ADMINISTER_SERUM').allowed === true);

    check('administering succeeds', administerSerum(world, SK) === true);
    check('dosed', isDosed(world, SK));
    check('combat bonus is positive while dosed', near(getSerumBonus(world, SK), SERUM_COMBAT_BONUS));
    check('the dose was counted', getMetric(world as any, SK, DOSES_METRIC) === 1);
    check('re-dosing while hot is refused',
        checkSerumGate(world, SK, 'SAR_ADMINISTER_SERUM').allowed === false);

    // Wear off into withdrawal.
    world.nowSeconds = t0 + SERUM_DURATION_SECONDS + 1;
    check('no longer dosed once it wears off', !isDosed(world, SK));
    check('now withdrawing', isWithdrawing(world, SK));
    check('the bonus turns NEGATIVE in withdrawal',
        near(getSerumBonus(world, SK), -SERUM_WITHDRAWAL_PENALTY), `got ${getSerumBonus(world, SK)}`);
    check('re-dosing during withdrawal is refused',
        checkSerumGate(world, SK, 'SAR_ADMINISTER_SERUM').allowed === false);

    // Withdrawal onset costs stability — once.
    const planet: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === SK);
    check('the Sarrak own a world', !!planet);
    if (planet) {
        planet.stability = 80;
        traits.sarrak!.lastEvaluatedSeconds = world.nowSeconds - TICK;
        tickFactionTraits(world);
        check('withdrawal onset costs stability',
            near(planet.stability, 80 - WITHDRAWAL_UNREST), `got ${planet.stability}`);
        const after = planet.stability;
        tickFactionTraits(world);
        check('and only once per dose', near(planet.stability, after), `${after} -> ${planet.stability}`);
    }

    // Clean again after the crash.
    world.nowSeconds = t0 + SERUM_DURATION_SECONDS * 4;
    check('clean once withdrawal ends', getSerumBonus(world, SK) === 0);
    check('and may be dosed again',
        checkSerumGate(world, SK, 'SAR_ADMINISTER_SERUM').allowed === true);
    check('a non-Sarrak faction never gets a serum bonus', getSerumBonus(world, OTHER) === 0);
}

// ── 3. The negative trait reaches the engine, floored ───────────────────────
console.log('\n[3] The engine applies a SIGNED trait');
{
    const mk = (traitBonuses?: any): CombatantState => ({
        factionId: SK, role: 'attacker', hp: 1000, maxHp: 1000,
        composition: { cruiser: 10 } as any, casualties: 0, morale: 0.5,
        doctrine: 'aggressive', predictionPoints: 0, selectedStance: 'shock',
        techModifiers: {}, traitBonuses,
    } as any);
    const st = initiateCombat('probe', { systemId: 's', terrainModifier: 1, infrastructureIntegrity: 1 } as any,
        mk({ serum: 0.25 }), mk({ serum: -0.15 }));

    check('a dosed combatant hits harder', traitMultiplier(st.attacker, st) > 1);
    check('a withdrawing combatant hits softer', traitMultiplier(st.defender, st) < 1);
    check('a combatant with no traits is unaffected',
        traitMultiplier(mk(undefined), st) === 1.0);
    check('serum alone reaches the engine — the brutality early-return was rewritten',
        traitMultiplier(mk({ serum: -0.15 }), st) < 1);
    // The floor: no trait may halve a combatant.
    check('the band is floored at 0.5',
        traitMultiplier(mk({ serum: -99 }), st) === 0.5, `got ${traitMultiplier(mk({ serum: -99 }), st)}`);
}

// ── 4. Biome Affinity ───────────────────────────────────────────────────────
console.log('\n[4] Biome Affinity');
{
    world.nowSeconds = 9_000_000;   // clean, no serum
    const jungle = districtTraitMultiplier(world, SK, 'jungle');
    const plains = districtTraitMultiplier(world, SK, 'plains');
    const mountains = districtTraitMultiplier(world, SK, 'mountains');
    const neutral = districtTraitMultiplier(world, OTHER, 'jungle');

    check('they hit harder in the wet', jungle.dealt > 1, `got ${jungle.dealt}`);
    check('and WORSE on dry ground — the drawback is the same function',
        plains.dealt < 1, `got ${plains.dealt}`);
    check('neutral terrain is neutral', near(mountains.dealt, 1), `got ${mountains.dealt}`);
    check('no other faction gets terrain affinity', near(neutral.dealt, 1) && near(neutral.taken, 1));
    check('an unknown faction is neutral', near(districtTraitMultiplier(world, undefined, 'jungle').dealt, 1));

    // The serum's melee half rides the same multiplier.
    administerSerum(world, SK);
    const dosedJungle = districtTraitMultiplier(world, SK, 'jungle');
    check('the serum stacks into the district multiplier', dosedJungle.dealt > jungle.dealt);
    check('and reduces casualties taken — the re-scoped "regeneration"',
        dosedJungle.taken < 1, `got ${dosedJungle.taken}`);
    check('multipliers stay bounded', dosedJungle.dealt < 2 && dosedJungle.taken > 0.4);
}

// ── 5. Slave Economy ────────────────────────────────────────────────────────
console.log('\n[5] Slave Economy');
{
    const traits = world.factionTraits!.get(SK)!;
    traits.sarrak!.slaveWorlds = {};

    const victim: any = [...world.construction.planets.values()].find((p: any) => p.ownerId === OTHER);
    check('a rival world exists to take', !!victim);
    if (victim) {
        recordConquest(world, SK, victim.id, OTHER);
        check('the conquest was registered', isSlaveWorld(world, SK, victim.id));
        check('and counted', getMetric(world as any, SK, CONQUEST_METRIC) === 1);

        recordConquest(world, OTHER, victim.id, SK);
        check('a non-Sarrak conqueror registers nothing',
            !world.factionTraits!.get(OTHER)?.sarrak);

        // Infrastructure speed.
        check('a slave world builds faster',
            near(infrastructureSpeedFor(world, SK, victim.id), SLAVE_BUILD_SPEED));
        check('an ordinary world does not',
            near(infrastructureSpeedFor(world, SK, 'planet-not-taken'), 1));
        const base = upgradeDuration('transit' as any, 1, 1);
        const fast = upgradeDuration('transit' as any, 1, SLAVE_BUILD_SPEED);
        check('the multiplier actually shortens the build',
            fast < base && near(fast, base / SLAVE_BUILD_SPEED), `${base} -> ${fast}`);
    }

    // Distance-scaled unrest. THE assertion that catches a flat mechanic.
    const { distances } = distancesFromCapital(world, SK);
    check('the capital resolves and the lane graph is reachable', distances.size > 1,
        `${distances.size} systems reachable — a missing capital would make distance uniformly flat`);

    const far = [...world.construction.planets.values()]
        .map((p: any) => ({ p, hops: distances.get(p.systemId) ?? -1 }))
        .filter(x => x.hops > 2)
        .sort((a, b) => b.hops - a.hops)[0];
    check('at least one world is genuinely distant from Gor\'Zhul', !!far, 'no world more than 2 hops out');

    if (far) {
        far.p.ownerId = SK;
        far.p.unrest = 0;
        traits.sarrak!.slaveWorlds[far.p.id] = { conqueredAtSeconds: world.nowSeconds, previousOwnerId: OTHER };
        traits.sarrak!.lastEvaluatedSeconds = world.nowSeconds - TICK;
        tickFactionTraits(world);
        check(`a distant slave world (${far.hops} hops) gains unrest`,
            far.p.unrest > 0, `got ${far.p.unrest}`);

        // Defiance pressure is the half PopulationService cannot scrub away.
        const rec: any = world.planetCohesion?.get(far.p.id);
        check('defiance pressure advances too', (rec?.defiancePressure ?? 0) > 0,
            `got ${rec?.defiancePressure} — unrest alone is absorbed by population decay`);
    }

    // A lost world stops being ours.
    if (far) {
        far.p.ownerId = OTHER;
        traits.sarrak!.lastEvaluatedSeconds = world.nowSeconds;
        world.nowSeconds += TICK;
        tickFactionTraits(world);
        check('a world that is lost is dropped from the registry',
            !isSlaveWorld(world, SK, far.p.id));
    }
}

// ── 6. Persistence ──────────────────────────────────────────────────────────
console.log('\n[6] Persistence');
{
    const round = deserializeWorld(serializeWorld(world));
    check('sarrak trait state survives a save/load round trip',
        !!round.factionTraits?.get(SK)?.sarrak);
    check('so do the counters', getMetric(round as any, SK, DOSES_METRIC) > 0);
}

// ── 7. Wiring — proves it is CALLED, not merely defined ─────────────────────
console.log('\n[7] Wiring');
{
    const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
    check('the dispatcher runs tickSarrak',
        /case SARRAK_CIV_ID:[\s\S]{0,120}tickSarrak\(world, traits\)/.test(src('lib/factions/traits-service.ts')));
    check('cohesion-service applies the war-fatigue resistance',
        /warFatigueResistance\(world, gov\.factionId\)/.test(src('lib/government/cohesion-service.ts')));
    check('combat-manager populates the serum bonus',
        /serum: getSerumBonus\(world, factionId\)/.test(src('lib/combat/combat-manager.ts')));
    check('combat-manager refreshes it per cycle rather than snapshotting',
        /state\.attacker\.traitBonuses = \{[\s\S]{0,80}getSerumBonus/.test(src('lib/combat/combat-manager.ts')));
    check('the worker gates the serum order',
        /checkSerumGate\(world, factionId, actionId\)/.test(src('scripts/game-loop.ts')));
    check('the worker handles the serum order',
        /case 'SAR_ADMINISTER_SERUM'/.test(src('scripts/game-loop.ts')));
    check('the district battle receives the trait multiplier',
        /resolveDistrictBattle\([\s\S]{0,140}districtTraits\)/.test(src('scripts/game-loop.ts')));
    check('the infrastructure order passes the speed multiplier',
        /canUpgradeTrack\(planet, payload\.trackId, infraSpeed\)/.test(src('scripts/game-loop.ts')));
    check('capture goes through one helper',
        /function capturePlanet\(/.test(src('scripts/game-loop.ts')));

    // SAR_ADMINISTER_SERUM must carry a cost — chargeOrderCost returns true for
    // anything it cannot find, so an unregistered ability is a free one.
    const registry = src('lib/actions/registry.ts');
    check('the serum is registered WITH a cost',
        /SAR_ADMINISTER_SERUM:[\s\S]{0,200}cost: \{[^}]*\d/.test(registry));
}

// ── 8. The conquest bug this depended on ────────────────────────────────────
console.log('\n[8] Conquest moves the economy planet too (cross-faction bug fix)');
{
    const src = fs.readFileSync(path.resolve(process.cwd(), 'scripts/game-loop.ts'), 'utf-8');
    check('capturePlanet reassigns the ECONOMY planet, not just the construction one',
        /economyPlanet\.factionId = attackerId/.test(src));
    const captureBody = src.slice(src.indexOf('function capturePlanet('), src.indexOf('function processSieges('));
    check('and it is the only place ownership moves on capture',
        (src.match(/planet\.ownerId = updatedSiege\.attackerEmpireId/g) ?? []).length === 0,
        'a duplicated capture site was left behind');
    check('capturePlanet still absorbs conquered technology',
        /absorbConqueredTechnology\(/.test(captureBody));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ all four Sarrak mechanics are live\n`);
process.exit(failures ? 1 : 0);
