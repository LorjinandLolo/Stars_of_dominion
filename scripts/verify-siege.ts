import { GroundSiegeEngine } from '../lib/combat/siege/siege-engine';
import { GroundSiegeState } from '../lib/combat/siege/siege-types';
import * as fs from 'fs';
import * as path from 'path';

// Mock the JSON loads since internal imports in GroundSiegeEngine use those
// We'll just run it as a script

const mockSiege: any = {
    siegeId: 'test-siege',
    planetId: 'planet-1',
    attackerEmpireId: 'empire-a',
    defenderEmpireId: 'empire-b',
    phase: 'ACTIVE_SIEGE',
    tickCount: 0,
    cycleCount: 0,
    cycleLengthTicks: 4,
    currentFrontage: 500,
    maxFrontage: 1000,
    attackerState: {
        siegeId: 'test-siege',
        attackerEmpireId: 'empire-a',
        sourceFleetIds: [],
        totalLandedTroops: 1000,
        reserveTroops: 0,
        unitComposition: { INFANTRY: 800, ARMOR: 200, ANTI_ARMOR: 0, AIRBORNE: 0, ARTILLERY: 0, SPECIAL_OPS: 0, MILITIA: 0 },
        supply: 1000,
        maxSupply: 1000,
        morale: 100,
        maxMorale: 100,
        cohesion: 100,
        maxCohesion: 100,
        orbitalSupportPower: 0,
        activeAttackerTactic: 'AGGRESSIVE_ASSAULT',
        attackerPrediction: 'DEFENSIVE_HOLD',
        retreatRequested: false,
        reinforcementQueue: [],
        occupationControl: 0,
        devastationCaused: 0
    },
    defenderState: {
        planetId: 'planet-1',
        ownerEmpireId: 'empire-b',
        garrisonTroops: 1000,
        unitComposition: { INFANTRY: 800, MILITIA: 200, ARMOR: 0, ANTI_ARMOR: 0, AIRBORNE: 0, ARTILLERY: 0, SPECIAL_OPS: 0 },
        fortificationLevel: 2,
        fortificationLayers: { orbitalSuppressed: false, outerDefenses: 100, innerDefenses: 100, commandBunkers: 100 },
        supply: 1000,
        maxSupply: 1000,
        morale: 100,
        maxMorale: 100,
        cohesion: 100,
        maxCohesion: 100,
        resistance: 0,
        stability: 80,
        infrastructureIntegrity: 100,
        activeDefenderTactic: 'DEFENSIVE_HOLD',
        defenderPrediction: 'MANEUVER_AMBUSH',
        militiaAvailable: true,
        occupationProgress: 0,
        isUnderSiege: true
    },
    battleLog: [],
    lastResolvedCycle: 0
};

console.log("--- STARTING AUTHORITATIVE SIEGE VERIFICATION ---");
try {
    for (let i = 1; i <= 4; i++) {
        GroundSiegeEngine.resolveTick(mockSiege);
        console.log(`Tick ${i}: Attacker Supply: ${mockSiege.attackerState.supply.toFixed(1)}, Defender Supply: ${mockSiege.defenderState.supply.toFixed(1)}`);
    }

    console.log("\n--- AFTER CYCLE 1 RESOLUTION ---");
    const lastLog = mockSiege.battleLog[mockSiege.battleLog.length - 1];
    console.log(`Message: ${lastLog.message}`);
    console.log(`Attacker Stance: ${lastLog.attackerStance}`);
    console.log(`Defender Stance: ${lastLog.defenderStance}`);
    console.log(`Attacker Losses: ${lastLog.attackerLosses}`);
    console.log(`Defender Losses: ${lastLog.defenderLosses}`);
    
    if (lastLog.defenderLosses > lastLog.attackerLosses) {
        console.log("\n[VERIFIED] Attacker correctly dealt more damage due to successful stance prediction!");
    } else {
        console.log("\n[FAILED] Damage weighting did not favor the predictor.");
    }

    // Verify Bombardment
    console.log("\n--- TESTING BOMBARDMENT MODE ---");
    mockSiege.attackerState.orbitalSupportPower = 200;
    const initialInfra = mockSiege.defenderState.infrastructureIntegrity;
    GroundSiegeEngine.resolveTick(mockSiege);
    console.log(`Infra Integrity: ${initialInfra} -> ${mockSiege.defenderState.infrastructureIntegrity.toFixed(2)}`);
    if (mockSiege.defenderState.infrastructureIntegrity < initialInfra) {
        console.log("[VERIFIED] Bombardment caused infrastructure devastation.");
    }

} catch (err) {
    console.error("Verification failed with error:", err);
    process.exit(1);
}
