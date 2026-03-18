import { TechEngine, registry } from './engine';
import { VisibilityEngine } from './visibility';
import { TechGenerator } from './generator';
import { RaceConstraint, STANDARD_PENALTY } from './race';
import { GameStateContext, Magnitude, Domain, Tier, VisibilityModifierType, BurnType, PrimaryEffectType, SecondaryEffectType } from './types';
import './techData'; // Register static techs

const mockContext: GameStateContext = {
    warIntensity: Magnitude.HIGH, // Should trigger Aggression intent
    allianceDensity: Magnitude.LOW,
    economicStress: Magnitude.LOW
};

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${msg}`);
        process.exit(1);
    } else {
        console.log(`✅ ${msg}`);
    }
}

function runTests() {
    console.log("--- Starting Mean Tech Tree Tests (V2 + Generative) ---");

    // 1. Static Engine Tests (Legacy verification)
    let p1 = TechEngine.initPlayerState('faction_1');
    p1 = TechEngine.chooseTech(p1, 'mil_1_a', mockContext);
    assert(p1.unlockedTechs.has('mil_1_a'), "Static unlock works");

    // 2. GENERATOR TESTS
    console.log("Testing Generator...");

    // Generate 10 techs & check constraints
    for (let i = 0; i < 10; i++) {
        const genTech = TechGenerator.generateTech(Domain.MILITARY, Tier.II, mockContext);

        assert(genTech.domain === Domain.MILITARY, "Generated correct domain");
        assert(genTech.tier === Tier.II, "Generated correct tier");
        assert(!!genTech.primaryEffect, "Has primary effect");

        // Context check: High War Intensity -> Should bias towards Aggression
        // (Intent isn't public, but Primary Effect might reflect it)
        // Aggression usually means STAT_SHIFT or EXTERNALITY_WEAPON in our generator
        if (i === 0) console.log(`Sample Generated Tech: ${genTech.name} [${genTech.intent}]`);
    }

    // 3. RACE CONSTRAINT TESTS
    console.log("Testing Race Constraints...");
    const pacifistConstraint: RaceConstraint = {
        raceId: 'peacekeepers',
        forbiddenPrimary: new Set([PrimaryEffectType.EXTERNALITY_WEAPON]),
        forbiddenSecondary: new Set(),
        forbiddenVisibility: new Set(),
        forbiddenBurn: new Set(),
        penaltyGenerator: () => STANDARD_PENALTY
    };

    // Force generator to make an aggressive tech (by context) then check constraint
    // We loop until we get an Externality weapon, then verify it was penalized
    let penalizedCount = 0;
    for (let i = 0; i < 20; i++) {
        const t = TechGenerator.generateTech(Domain.MILITARY, Tier.II, mockContext, pacifistConstraint);
        if (t.description.includes("CONTRA-INNOVATION")) {
            penalizedCount++;
            assert(t.secondaryEffect?.type === SecondaryEffectType.HAPPINESS_DRAIN, "Applied Penalty correctly");
        }
    }
    console.log(`Penalized ${penalizedCount} violations out of 20 generations.`);

    // 4. TIER IV BURN ENFORCEMENT
    console.log("Testing Generation Tier IV...");
    const t4 = TechGenerator.generateTech(Domain.CULTURAL, Tier.IV, mockContext);
    assert(!!t4.burnCost, "Generated Tier IV has Burn Cost");


    console.log("All Tests Passed!");
}

runTests();
