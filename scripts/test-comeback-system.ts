
import { DefeatDetector } from '../lib/comeback/detector';
import { ComebackManager } from '../lib/comeback/manager';
import { PlayerComebackState } from '../types/comeback';

function runTest() {
    console.log("=== COMEBACK SYSTEM TEST ===");

    // 1. Detection Test
    console.log("\n--- TEST 1: DEFEAT DETECTION ---");
    const history = [
        { timestamp: '2025-01-01T00:00:00Z', fleet_power: 1000, planet_count: 10, net_income: 100, debt: 0 },
        { timestamp: '2025-01-02T00:00:00Z', fleet_power: 1000, planet_count: 10, net_income: 100, debt: 0 },
        // ... time passes, cataclysmic loss
        { timestamp: '2025-02-01T00:00:00Z', fleet_power: 100, planet_count: 4, net_income: 100, debt: 0 }
    ];

    // 1000 -> 100 is 90% loss. Threshold is 80%. Should trigger MILITARY_DEFEAT
    const defeat = DefeatDetector.detect(history);
    console.log("Detailed Defeat:", defeat);

    if (defeat === 'MILITARY_DEFEAT') {
        console.log("PASS: Military Defeat detected.");
    } else {
        console.error(`FAIL: Expected MILITARY_DEFEAT, got ${defeat}`);
    }

    // 2. Path Selection Test
    console.log("\n--- TEST 2: PATH SELECTION ---");
    let state = ComebackManager.initializeState();
    const available = ComebackManager.getAvailablePaths('MILITARY_DEFEAT');
    console.log("Available Paths:", available.map(p => p.id));

    const chosenPath = available[0].id; // GUERRILLA_DOCTRINE
    state = ComebackManager.startPath(state, chosenPath);
    console.log("Active Path:", state.active_path_id);

    if (state.active_path_id === 'GUERRILLA_DOCTRINE') {
        console.log("PASS: Path activated.");
    } else {
        console.error("FAIL: Path activation failed.");
    }

    // Check initial perks
    if (state.unlocked_perks.includes('shadow_strike')) { // Tier 1
        console.log("PASS: Tier 1 perk unlocked automatically.");
    } else {
        console.error("FAIL: Tier 1 perk not unlocked.");
    }

    // 3. Progression Test
    console.log("\n--- TEST 3: XP PROGRESSION ---");
    state = ComebackManager.grantXp(state, 120); // Should unlock Tier 2 (cost 100)
    console.log("XP:", state.adaptation_xp);
    console.log("Perks:", state.unlocked_perks);

    if (state.unlocked_perks.includes('cell_network')) {
        console.log("PASS: Tier 2 perk unlocked via XP.");
    } else {
        console.error("FAIL: Tier 2 perk not unlocked.");
    }
}

runTest();
