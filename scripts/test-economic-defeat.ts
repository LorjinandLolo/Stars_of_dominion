
import { checkEconomicHealth, calculateTotalUpkeep } from '../lib/economy/upkeep';
import { EconomyState, ResourceId, Entity } from '../types';

function runTest() {
    console.log("=== ECONOMIC DEFEAT LOGIC TEST ===");

    // 1. Test Upkeep Calculation
    console.log("\n--- TEST 1: UPKEEP CALCULATION ---");
    const entities: Entity[] = [
        { type: 'ship', id: 's1', sectorId: '1', x: 0, y: 0 },
        { type: 'ship', id: 's2', sectorId: '1', x: 0, y: 0 }, // 10 credits each
        { type: 'station', id: 'st1', sectorId: '1', x: 0, y: 0 }, // 70 credits
        { type: 'army', id: 'a1', sectorId: '1', x: 0, y: 0 } // 5 credits
    ];
    // Expected: 20 + 70 + 5 = 95 credits
    const upkeep = calculateTotalUpkeep(entities);
    console.log("Calculated Upkeep:", upkeep);

    if (upkeep.credits === 95) {
        console.log("PASS: Upkeep calculation correct.");
    } else {
        console.error(`FAIL: Expected 95 credits, got ${upkeep.credits}`);
    }

    // 2. Test Solvency (Healthy)
    console.log("\n--- TEST 2: SOLVENCY CHECK (HEALTHY) ---");
    let state: EconomyState = {
        resources: { credits: 1000, metals: 100, chemicals: 100, food: 100, happiness: 100 },
        income_rates: { credits: 100, metals: 10, chemicals: 10, food: 10, happiness: 0 },
        capacities: {},
        last_updated: new Date().toISOString(),
        expenses: { credits: 50, metals: 0, chemicals: 0, food: 0, happiness: 0 },
        economic_health: { stability: 100, deficit_counter: 0, status: 'solvent' }
    };

    let newState = checkEconomicHealth(state);
    if (newState.economic_health.status === 'solvent') {
        console.log("PASS: Status remains solvent.");
    } else {
        console.error(`FAIL: Status became ${newState.economic_health.status}`);
    }

    // 3. Test Struggling (Negative Income, but Reserves > 0)
    console.log("\n--- TEST 3: STRUGGLING CHECK ---");
    state.income_rates.credits = -10; // Negative net income
    newState = checkEconomicHealth(state);
    // Logic: if netCreditIncome < 0 -> struggling
    if (newState.economic_health.status === 'struggling') {
        console.log("PASS: Status updated to struggling due to negative income.");
    } else {
        console.error(`FAIL: Status is ${newState.economic_health.status}`);
    }

    // 4. Test Bankruptcy (Debt < -1000)
    console.log("\n--- TEST 4: BANKRUPTCY CHECK ---");
    state.resources.credits = -1500;
    newState = checkEconomicHealth(state);
    if (newState.economic_health.status === 'bankrupt') {
        console.log("PASS: Status updated to bankrupt.");
        if (newState.economic_health.stability < 100) {
            console.log("PASS: Stability penalty applied.");
        } else {
            console.error("FAIL: No stability penalty applied.");
        }
    } else {
        console.error(`FAIL: Status is ${newState.economic_health.status}`);
    }

    // 5. Test Collapse (Debt < -5000)
    console.log("\n--- TEST 5: COLLAPSE CHECK ---");
    state.resources.credits = -6000;
    newState = checkEconomicHealth(state);
    if (newState.economic_health.status === 'collapsed') {
        console.log("PASS: Status updated to collapsed.");
    } else {
        console.error(`FAIL: Status is ${newState.economic_health.status}`);
    }

    console.log("\n=== TEST COMPLETE ===");
}

runTest();
