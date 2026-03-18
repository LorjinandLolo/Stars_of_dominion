
import { VictoryManager } from '../lib/victory/manager';
import { Faction } from '../types/game';

function runTest() {
    console.log("=== VICTORY SYSTEM TEST ===");

    // Mock Factions
    const me: Faction = {
        $id: 'p1', name: 'Terran',
        resources: JSON.stringify({ credits: 2000, _health: { status: 'solvent' } }),
        income_rates: JSON.stringify({ credits: 1000 })
    } as any;

    const rival1: Faction = {
        $id: 'r1', name: 'Martian',
        resources: JSON.stringify({ credits: 100, _health: { status: 'solvent' } }),
        income_rates: JSON.stringify({ credits: 100 })
    } as any;

    const rival2: Faction = {
        $id: 'r2', name: 'Venusian',
        resources: JSON.stringify({ credits: 50, _health: { status: 'solvent' } }),
        income_rates: JSON.stringify({ credits: 50 })
    } as any;

    // 1. Test Economic Hegemony (1000 vs 150 -> >75%)
    console.log("\n--- TEST 1: ECONOMIC HEGEMONY ---");
    // Context needs income_rates of player (passed as object)
    const context = { income_rates: { credits: 1000 } };

    let result = VictoryManager.checkVictory(me, [rival1, rival2], context);
    console.log("Result:", result.status, result.type);

    if (result.status === 'VICTORIOUS' && result.type === 'ECONOMIC_HEGEMONY') {
        console.log("PASS: Economic Hegemony detected.");
    } else {
        console.error("FAIL: Expected Economic Hegemony.");
    }

    // 2. Test Conquest (Rivals Collapsed)
    console.log("\n--- TEST 2: CONQUEST (RIVALS COLLAPSED) ---");
    const collapsedRival1 = { ...rival1, resources: JSON.stringify({ _health: { status: 'collapsed' } }) } as any;
    const collapsedRival2 = { ...rival2, resources: JSON.stringify({ _health: { status: 'collapsed' } }) } as any;

    result = VictoryManager.checkVictory(me, [collapsedRival1, collapsedRival2], context);
    console.log("Result:", result.status, result.type);

    if (result.status === 'VICTORIOUS' && result.type === 'CONQUEST') {
        console.log("PASS: Conquest detected.");
    } else {
        console.error("FAIL: Expected Conquest.");
    }

    // 3. Test Pending (No Victory)
    console.log("\n--- TEST 3: NO VICTORY ---");
    const strongRival = { ...rival1, income_rates: JSON.stringify({ credits: 800 }) } as any; // 1000 vs 850 -> ~54%
    result = VictoryManager.checkVictory(me, [strongRival, rival2], context);
    console.log("Result:", result.status);

    if (result.status === 'PENDING') {
        console.log("PASS: Status is Pending.");
    } else {
        console.error("FAIL: Expected Pending.");
    }
}

runTest();
