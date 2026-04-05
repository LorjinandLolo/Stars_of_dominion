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

export class GroundSiegeEngine {

    /**
     * Resolves a single game tick (e.g. 5 seconds).
     * Handles passive attrition, supply drain, and bombardment.
     */
    static resolveTick(siege: GroundSiegeState): GroundSiegeState {
        // Increment tick counter
        siege.tickCount++;

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
        if (siege.tickCount % siege.cycleLengthTicks === 0) {
            this.resolveCycle(siege);
        }

        return siege;
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

        this.applyDamage(attacker, dDamage);
        this.applyDamage(defender, aDamage);

        // 5. Final Log Entry
        siege.battleLog.push({
            cycle: siege.cycleCount,
            message: `Cycle ${siege.cycleCount} Resolved. Stances: A(${aStance}) vs D(${dStance})`,
            attackerStance: aStance,
            defenderStance: dStance,
            attackerLosses: Math.round(dDamage),
            defenderLosses: Math.round(aDamage)
        });

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
        const types: GroundUnitType[] = ['ARMOR', 'INFANTRY', 'ANTI_ARMOR', 'AIRBORNE', 'ARTILLERY', 'SPECIAL_OPS', 'MILITIA'];
        
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

    private static applyDamage(state: any, damage: number) {
        let remainingDamage = damage;
        const types: GroundUnitType[] = ['MILITIA', 'INFANTRY', 'AIRBORNE', 'ANTI_ARMOR', 'ARMOR', 'ARTILLERY', 'SPECIAL_OPS'];
        
        for (const type of types) {
            const count = state.unitComposition[type] || 0;
            if (count > 0) {
                const unitBaseStr = unitsConfig[type]?.baseStrength || 1.0;
                const lost = Math.min(count, Math.ceil(remainingDamage / unitBaseStr));
                state.unitComposition[type] -= lost;
                remainingDamage -= lost * unitBaseStr;
                
                if (state.totalLandedTroops !== undefined) state.totalLandedTroops = Math.max(0, state.totalLandedTroops - lost);
                if (state.garrisonTroops !== undefined) state.garrisonTroops = Math.max(0, state.garrisonTroops - lost);
            }
        }
        
        state.morale = Math.max(0, state.morale - (damage * 0.1));
        state.cohesion = Math.max(0, state.cohesion - 0.05);
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
