/**
 * lib/combat/siege-service.ts
 * 
 * Authoritative Ground Siege & Combat Engine.
 * Resolves per-tick logistics and per-cycle tactical engagements.
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
    GroundSiegeState, 
    GroundUnitType, 
    UnitComposition, 
    TacticalStanceId
} from './siege-types';
import { bombardFormations } from './district-battle';
import { SIEGE_CYCLE_TICKS, bombardTickScale } from './siege-pacing';

/**
 * Shield wear per point of (tick-scaled) fleet power per tick. The tick scale
 * makes a cycle's wear pacing-independent: wear per cycle = 4 × power × this.
 * Tuned so 400 power ruins a generator in ~24 cycles (two real hours):
 * 4 × 400 × 0.0026 ≈ 4.2 per cycle.
 */
const SHIELD_WEAR_PER_POWER = 0.0026;

// Data paths - Adjusted for runtime resolution
const DATA_DIR = path.resolve(process.cwd(), 'data/combat');
const UNITS_PATH = path.join(DATA_DIR, 'ground-units.json');
const TACTICS_PATH = path.join(DATA_DIR, 'ground-tactics.json');

// Helper to load config safely
function loadConfig(filePath: string) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`[SiegeService] Failed to load config from ${filePath}`, e);
        return {};
    }
}

const unitsConfig = loadConfig(UNITS_PATH);
const tacticsConfig = loadConfig(TACTICS_PATH);

/** Defender morale shed per point of orbital support, per tick. */
const BOMBARD_MORALE_PER_POWER = 0.002;

/** A siege fought on the district board, by pieces, rather than by pools. */
export const isPositional = (siege: GroundSiegeState): boolean =>
    Array.isArray(siege.districts?.formations) && siege.districts!.formations!.length > 0;

export class GroundSiegeEngine {

    /**
     * Resolves a single game tick (e.g. 5 seconds).
     * Handles passive attrition, supply drain, and bombardment.
     */
    static resolveTick(siege: GroundSiegeState): GroundSiegeState {
        // Increment tick counter
        siege.tickCount++;

        // Guard against cycleLengthTicks === 0: `x % 0` is NaN, and `NaN === 0` is always
        // false, so the siege would drain supply forever but never resolve a cycle.
        const cycleLen = siege.cycleLengthTicks > 0 ? siege.cycleLengthTicks : SIEGE_CYCLE_TICKS;
        const cycleDue = siege.tickCount % cycleLen === 0;

        // ── Positional sieges: the board is the truth ─────────────────────
        // Once there are pieces on the district board, the army pools below
        // are a DISPLAY of the formations, rewritten from them every cycle by
        // the worker. Everything this engine used to do to those pools —
        // supply drain, starvation attrition, bombardment casualties, the
        // abstract cycle's damage and its morale collapse — was overwritten
        // before anyone saw it, which is how orbital support became a number
        // that did nothing and morale became a number that was always zero.
        // So for a positional siege the engine does only what the board cannot
        // do for itself: count cycles, reveal stances, score the reads, and
        // put orbital fire on the formations.
        if (isPositional(siege)) {
            if (siege.attackerState.orbitalSupportPower > 0) {
                this.bombardBoard(siege);
            } else {
                siege.bombardment = undefined;
                // Under a shield nothing reaches the ground — but the shield
                // itself is taking the fire, and it does not last forever.
                if (siege.orbit?.shieldUp && siege.orbit.holder === 'attacker') this.wearShield(siege);
            }
            if (cycleDue) this.resolvePositionalCycle(siege);
            return siege;
        }

        // ── Legacy abstract sieges ────────────────────────────────────────
        // 1. Supply Drain
        this.applySupplyDrain(siege.attackerState);
        this.applySupplyDrain(siege.defenderState);

        // 2. Passive Attrition (if out of supply)
        if (siege.attackerState.supply <= 0) this.applyAttrition(siege.attackerState, 0.01);
        if (siege.defenderState.supply <= 0) this.applyAttrition(siege.defenderState, 0.02);

        // 3. Orbital Bombardment
        if (siege.attackerState.orbitalSupportPower > 0) {
            this.resolveBombardment(siege);
        }

        // 4. Resolve Cycle (every N ticks - User choice: 4)
        if (cycleDue) {
            this.resolveCycle(siege);
        }

        return siege;
    }

    /**
     * Orbital fire on a positional siege lands on the pieces, not the pool.
     * The forward districts are the defender's front (`war.contested`, kept
     * current by the worker) — the ground that touches the invasion.
     */
    private static bombardBoard(siege: GroundSiegeState) {
        const war = siege.districts!;
        const rawPower = siege.attackerState.orbitalSupportPower;
        // Per-tick constants were tuned at a 4-tick cycle; scale so a cycle's
        // worth of fire is the same whatever the pacing.
        const power = rawPower * bombardTickScale(siege.cycleLengthTicks);
        const hit = bombardFormations(war, war.formations!, power, war.contested ?? []);
        const killed = Object.values(hit.losses).reduce((s, n) => s + (n ?? 0), 0);
        siege.bombardment = { killed, districts: hit.districts.length, power: Math.round(rawPower) };
        // The pool must follow the pieces here too. The worker seeds any
        // surplus in the pool as fresh arrivals at the next cycle, so a kill
        // left only on the board would come back as a phantom recruit.
        const defender = siege.defenderState;
        for (const [type, n] of Object.entries(hit.losses) as Array<[GroundUnitType, number]>) {
            defender.unitComposition[type] = Math.max(0, (defender.unitComposition[type] ?? 0) - n);
        }
        defender.garrisonTroops = Math.max(0, defender.garrisonTroops - killed);
        // Collateral: the city under the guns, and the people in it.
        defender.infrastructureIntegrity = Math.max(0, defender.infrastructureIntegrity - power * 0.01);
        siege.attackerState.devastationCaused += power * 0.01;
        defender.morale = Math.max(0, defender.morale - power * BOMBARD_MORALE_PER_POWER);
    }

    /**
     * A planetary shield under an invader's guns. Nothing lands on the men
     * beneath it, but the generator takes the whole weight of the fleet:
     * `strongpointDamage` climbs toward 100, at which point the worker (which
     * owns the planet's tiles) ruins the building and the shield drops. At
     * 400 fleet power that is roughly two real hours — the defender's real
     * answer is a relief fleet, not a repair crew.
     */
    private static wearShield(siege: GroundSiegeState) {
        const war = siege.districts!;
        const shields = (war.strongpoints ?? []).filter(p => p.kind === 'shield' && p.active && p.holder === 'defender');
        if (!shields.length) return;
        const power = (siege.orbit?.attackerPower ?? 0) * bombardTickScale(siege.cycleLengthTicks);
        if (power <= 0) return;
        const damage = war.strongpointDamage ?? (war.strongpointDamage = {});
        for (const s of shields) {
            damage[s.sectorIndex] = Math.min(100, (damage[s.sectorIndex] ?? 0) + power * SHIELD_WEAR_PER_POWER);
        }
    }

    /**
     * A positional cycle: reveal the stances, score the reads, log it. The
     * fighting itself happens district by district in the worker, which
     * reads `siege.reads` for the multipliers.
     *
     * Stances PERSIST — a commander who ordered an assault is still assaulting
     * next cycle until told otherwise. Reads are one-shot: a guess is spent
     * the moment it is scored.
     */
    private static resolvePositionalCycle(siege: GroundSiegeState) {
        siege.cycleCount++;
        const attacker = siege.attackerState;
        const defender = siege.defenderState;
        const aStance: TacticalStanceId = attacker.activeAttackerTactic || 'DEFENSIVE_HOLD';
        const dStance: TacticalStanceId = defender.activeDefenderTactic || 'DEFENSIVE_HOLD';

        const score = (guess: TacticalStanceId | undefined, actual: TacticalStanceId): 'hit' | 'miss' | null =>
            !guess ? null : guess === actual ? 'hit' : 'miss';
        siege.reads = {
            attacker: score(attacker.attackerPrediction, dStance),
            defender: score(defender.defenderPrediction, aStance),
        };
        if (siege.reads.attacker === 'hit') {
            siege.battleLog.push({ cycle: siege.cycleCount, message: 'CRITICAL READ: Attacker predicted enemy stance!', event: 'BREAKTHROUGH' });
        }
        if (siege.reads.defender === 'hit') {
            siege.battleLog.push({ cycle: siege.cycleCount, message: 'CRITICAL READ: Defender predicted enemy stance!', event: 'AMBUSH' });
        }
        siege.battleLog.push({
            cycle: siege.cycleCount,
            message: `Cycle ${siege.cycleCount}. Stances: A(${aStance}) vs D(${dStance})`,
            attackerStance: aStance,
            defenderStance: dStance,
        });

        attacker.attackerPrediction = undefined;
        defender.defenderPrediction = undefined;
        siege.lastResolvedCycle = siege.cycleCount;
    }

    /** Strength multiplier a side earns from its stance read this cycle. */
    static readMultiplier(read: 'hit' | 'miss' | null | undefined): number {
        if (read === 'hit') return tacticsConfig.PREDICTION_SUCCESS?.damageDealt || 1.3;
        if (read === 'miss') return tacticsConfig.PREDICTION_FAILURE?.damageDealt || 0.85;
        return 1;
    }

    private static applySupplyDrain(state: any) {
        let totalDrain = 0;
        for (const [unit, count] of Object.entries(state.unitComposition as UnitComposition)) {
            const config = unitsConfig[unit as GroundUnitType];
            if (config) totalDrain += count * (config.supplyConsumption || 0.5) * 0.1; 
        }
        state.supply = Math.max(0, state.supply - totalDrain);
    }

    private static applyAttrition(state: any, rate: number) {
        for (const unit in state.unitComposition) {
            const loss = Math.ceil(state.unitComposition[unit as GroundUnitType] * rate);
            state.unitComposition[unit as GroundUnitType] -= loss;
            if (state.totalLandedTroops !== undefined) state.totalLandedTroops = Math.max(0, state.totalLandedTroops - loss);
            if (state.garrisonTroops !== undefined) state.garrisonTroops = Math.max(0, state.garrisonTroops - loss);
        }
        state.morale = Math.max(0, state.morale - 1);
    }

    /**
     * Resolves a tactical combat cycle (every 4 ticks).
     * Resolves Stances vs Stances + Predictions.
     */
    private static resolveCycle(siege: GroundSiegeState) {
        siege.cycleCount++;

        const attacker = siege.attackerState;
        const defender = siege.defenderState;

        // 1. Reveal Selections (Default to Defensive Hold if none selected)
        const aStance = attacker.activeAttackerTactic || 'DEFENSIVE_HOLD';
        const dStance = defender.activeDefenderTactic || 'DEFENSIVE_HOLD';
        const aPredict = attacker.attackerPrediction;
        const dPredict = defender.defenderPrediction;

        // 2. Base Strengths (Frontage limited)
        const aStr = this.calculateEffectiveStrength(attacker, siege.maxFrontage);
        const dStr = this.calculateEffectiveStrength(defender, siege.maxFrontage);

        // 3. Modifiers (RPS & Prediction)
        let aMod = 1.0;
        let dMod = 1.0;

        // RPS Logic (e.g. Aggressive beats Defensive)
        if (tacticsConfig[aStance]?.beats === dStance) {
            aMod += (tacticsConfig.RPS_COUNTER_BONUS || 0.15);
        }
        if (tacticsConfig[dStance]?.beats === aStance) {
            dMod += (tacticsConfig.RPS_COUNTER_BONUS || 0.15);
        }

        // Prediction Logic (Attacker on Defender)
        if (aPredict === dStance) {
            aMod *= (tacticsConfig.PREDICTION_SUCCESS?.damageDealt || 1.3);
            dMod *= (tacticsConfig.PREDICTION_SUCCESS?.damageTaken || 0.8);
            siege.battleLog.push({ cycle: siege.cycleCount, message: "CRITICAL READ: Attacker predicted enemy stance!", event: "BREAKTHROUGH" });
        } else if (aPredict) {
            aMod *= (tacticsConfig.PREDICTION_FAILURE?.damageDealt || 0.85);
            dMod *= (tacticsConfig.PREDICTION_FAILURE?.damageTaken || 1.15);
        }

        // Prediction Logic (Defender on Attacker)
        if (dPredict === aStance) {
            dMod *= (tacticsConfig.PREDICTION_SUCCESS?.damageDealt || 1.3);
            aMod *= (tacticsConfig.PREDICTION_SUCCESS?.damageTaken || 0.8);
            siege.battleLog.push({ cycle: siege.cycleCount, message: "CRITICAL READ: Defender predicted enemy stance!", event: "AMBUSH" });
        }

        // 4. Resolve Damage
        const aDamage = aStr * aMod * (tacticsConfig[aStance]?.modifiers?.damageDealt || 1.0);
        const dDamage = dStr * dMod * (tacticsConfig[dStance]?.modifiers?.damageDealt || 1.0);

        // Morale BEFORE the losses land: how close to breaking each side was
        // when it took the hit is what decides how many surrender.
        const attackerMoraleAtImpact = attacker.morale;
        const defenderMoraleAtImpact = defender.morale;

        const attackerLossesByType = this.applyDamage(attacker, dDamage);
        const defenderLossesByType = this.applyDamage(defender, aDamage);

        // 5. Final Log Entry — per-type losses ride along so the caller can
        // work out who was taken alive (see lib/combat/siege/prisoners).
        siege.battleLog.push({
            cycle: siege.cycleCount,
            message: `Cycle ${siege.cycleCount} Resolved. Stances: A(${aStance}) vs D(${dStance})`,
            attackerStance: aStance,
            defenderStance: dStance,
            attackerLosses: Math.round(dDamage),
            defenderLosses: Math.round(aDamage),
            attackerLossesByType,
            defenderLossesByType,
            attackerMoraleAtImpact,
            defenderMoraleAtImpact,
        } as any);

        // 6. Reset selections for next cycle
        attacker.activeAttackerTactic = undefined;
        attacker.attackerPrediction = undefined;
        defender.activeDefenderTactic = undefined;
        defender.defenderPrediction = undefined;
        
        siege.lastResolvedCycle = siege.cycleCount;
    }

    private static calculateEffectiveStrength(state: any, frontage: number): number {
        let strength = 0;
        let deployed = 0;
        
        // Priority: Armor/Infantry on frontline
        const types: GroundUnitType[] = ['ELDER_INFERNOID', 'ARMOR', 'INFANTRY', 'ANTI_ARMOR', 'AIRBORNE', 'ARTILLERY', 'SPECIAL_OPS', 'MILITIA'];
        
        for (const type of types) {
            const count = state.unitComposition[type] || 0;
            const toDeploy = Math.min(count, frontage - deployed);
            if (toDeploy > 0) {
                const config = unitsConfig[type];
                if (config) {
                    strength += toDeploy * config.baseStrength;
                    deployed += toDeploy;
                }
            }
        }
        
        // Morale & Cohesion scaling (0.5 to 1.5x)
        const moraleMod = 0.5 + (state.morale / (state.maxMorale || 100));
        const cohesionMod = 0.5 + (state.cohesion / (state.maxCohesion || 100));
        
        return strength * moraleMod * cohesionMod;
    }

    /** Applies damage and reports what was lost, per unit type. */
    private static applyDamage(state: any, damage: number): Partial<Record<GroundUnitType, number>> {
        let remainingDamage = damage;
        const losses: Partial<Record<GroundUnitType, number>> = {};
        // Elders last, for the same reason as district-battle.ts: a type missing
        // from this array takes literally zero casualties, silently.
        const types: GroundUnitType[] = ['MILITIA', 'INFANTRY', 'AIRBORNE', 'ANTI_ARMOR', 'ARMOR', 'ARTILLERY', 'SPECIAL_OPS', 'ELDER_INFERNOID'];

        for (const type of types) {
            const count = state.unitComposition[type] || 0;
            if (count > 0 && remainingDamage > 0) {
                const unitBaseStr = unitsConfig[type]?.baseStrength || 1.0;
                const lost = Math.min(count, Math.ceil(remainingDamage / unitBaseStr));
                state.unitComposition[type] -= lost;
                remainingDamage -= lost * unitBaseStr;
                if (lost > 0) losses[type] = lost;

                if (state.totalLandedTroops !== undefined) state.totalLandedTroops = Math.max(0, state.totalLandedTroops - lost);
                if (state.garrisonTroops !== undefined) state.garrisonTroops = Math.max(0, state.garrisonTroops - lost);
            }
        }

        state.morale = Math.max(0, state.morale - (damage * 0.1));
        state.cohesion = Math.max(0, state.cohesion - 0.05);
        return losses;
    }

    private static resolveBombardment(siege: GroundSiegeState) {
        const power = siege.attackerState.orbitalSupportPower;
        const defender = siege.defenderState;

        // 1. Shred Fortifications layers sequentially
        if (defender.fortificationLayers.outerDefenses > 0) {
            defender.fortificationLayers.outerDefenses = Math.max(0, defender.fortificationLayers.outerDefenses - (power * 0.05));
        } else if (defender.fortificationLayers.innerDefenses > 0) {
            defender.fortificationLayers.innerDefenses = Math.max(0, defender.fortificationLayers.innerDefenses - (power * 0.03));
        }

        // 2. Collateral Damage to infra
        defender.infrastructureIntegrity = Math.max(0, defender.infrastructureIntegrity - (power * 0.01));
        siege.attackerState.devastationCaused += (power * 0.01);

        // 3. Suppress Morale
        defender.morale = Math.max(0, defender.morale - (power * 0.02));
        
        // 4. Minor Troop Damage (collateral hits on civilian centers/militia)
        this.applyDamage(defender, power * 0.05);
    }
}
