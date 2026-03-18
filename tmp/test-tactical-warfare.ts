import { resolveEngagementRound, initiateCombat } from '../lib/combat/combat-engine';
import { CombatState, CombatantState, TargetDetails, OngoingEngagementRound } from '../lib/combat/combat-types';

async function testTacticalWarfare() {
    console.log("--- TACTICAL WARFARE VERIFICATION ---");

    const target: TargetDetails = {
        systemId: 'sys-test',
        terrainModifier: 1.0,
        infrastructureIntegrity: 1.0
    };

    const attacker: CombatantState = {
        factionId: 'faction-a',
        role: 'attacker',
        baseForceCount: 1000,
        composition: { cruiser: 10 },
        intelLevel: 'deep_penetration',
        supply: 1.0,
        morale: 1.0,
        doctrine: 'aggressive',
        casualties: 0,
        predictionPoints: 0,
        selectedStance: 'blitz' // Pre-selected stance
    };

    const defender: CombatantState = {
        factionId: 'faction-b',
        role: 'defender',
        baseForceCount: 1000,
        composition: { destroyer: 15 },
        intelLevel: 'deep_penetration',
        supply: 1.0,
        morale: 1.0,
        doctrine: 'defensive',
        casualties: 0,
        predictionPoints: 0,
        selectedStance: 'entrench' // Pre-selected stance
    };

    const combatState = initiateCombat('combat-test', target, attacker, defender);

    console.log(`Initial State: Attacker Stance: ${combatState.attacker.selectedStance}, Defender Stance: ${combatState.defender.selectedStance}`);

    // Round 1: Default selected stances
    const round1Input: OngoingEngagementRound = { roundNumber: 1 };
    const report1 = resolveEngagementRound(combatState, round1Input);

    console.log(`Round 1: Attacker Stance: ${combatState.attacker.currentStance}, Defender Stance: ${combatState.defender.currentStance}`);
    console.log(`Round 1 Dmg: A: ${report1.attackerDamageDealt.toFixed(2)}, D: ${report1.defenderDamageDealt.toFixed(2)}`);

    // Round 2: Change stances
    combatState.attacker.selectedStance = 'feint';
    combatState.defender.selectedStance = 'shock';
    
    console.log(`Round 2 Stance Selection: Attacker: ${combatState.attacker.selectedStance}, Defender: ${combatState.defender.selectedStance}`);

    const round2Input: OngoingEngagementRound = { roundNumber: 2 };
    const report2 = resolveEngagementRound(combatState, round2Input);

    console.log(`Round 2: Attacker Stance: ${combatState.attacker.currentStance}, Defender Stance: ${combatState.defender.currentStance}`);
    console.log(`Round 2 Dmg: A: ${report2.attackerDamageDealt.toFixed(2)}, D: ${report2.defenderDamageDealt.toFixed(2)}`);

    // Verify momentum shift
    console.log(`Final Momentum: ${combatState.momentum.toFixed(2)}`);
    console.log(`Final Attacker Forces: ${combatState.attacker.baseForceCount.toFixed(2)}`);
    console.log(`Final Defender Forces: ${combatState.defender.baseForceCount.toFixed(2)}`);

    if (combatState.attacker.currentStance === 'feint' && combatState.defender.currentStance === 'shock') {
        console.log("SUCCESS: Tactical overrides correctly applied in simulation.");
    } else {
        console.log("FAILURE: Tactical overrides mismatch.");
    }
}

testTacticalWarfare().catch(console.error);
