// tmp/test-ship-design.ts
import { SHIP_HULLS, calculateDesignStats } from '../lib/combat/ship-registry';

async function runTests() {
    console.log("--- STARTING SHIP DESIGN TESTS ---");

    // Test 1: Hull Selection
    const interceptor = SHIP_HULLS.find(h => h.id === 'hull-interceptor')!;
    console.log(`[TEST 1] Hull: ${interceptor.name}, Slots: ${interceptor.slots.length}`);

    // Test 2: Basic Design Calculation
    const basicCompMap = {
        'w1': 'comp-pulse-laser',
        'u1': 'comp-deflector',
        'c1': 'comp-fission-core'
    };
    const basicStats = calculateDesignStats('hull-interceptor', basicCompMap);
    console.log("[TEST 2] Basic Design Stats:", basicStats);
    
    // Validate damage: 50 (base) + 15 (laser) = 65? 
    // Wait, interceptor base damage is 10. 10 + 15 = 25.
    if (basicStats.damage === 25) {
        console.log("✅ Basic Damage Calculation Correct (25)");
    } else {
        console.log("❌ Basic Damage Calculation Mismatch:", basicStats.damage);
    }

    // Test 3: High-End Design Calculation (Railguns + Fusion)
    const heavyCompMap = {
        'w1': 'comp-railgun',
        'u1': 'comp-afterburner',
        'c1': 'comp-fusion-reactor'
    };
    const heavyStats = calculateDesignStats('hull-interceptor', heavyCompMap);
    console.log("[TEST 3] Heavy/Speed Design Stats:", heavyStats);
    
    // Damage: 10 + 30 = 40
    // Speed: 80 + 20 - 5 = 95
    if (heavyStats.damage === 40 && heavyStats.speed === 95) {
         console.log("✅ Heavy Stats Calculation Correct (Damage: 40, Speed: 95)");
    } else {
         console.log("❌ Heavy Stats Calculation Mismatch", heavyStats);
    }

    // Power Balance Check
    // Core (Fission) produces 50. Laser draws 5. Deflector draws 10.
    // Total: 50 - 15 = 35 net (shown as -35 in stats.powerDraw? No, the code adds them)
    // Actually our core production is negative powerDraw.
    // Base interceptor powerDraw: 5
    // Fission Core: -50
    // Pulse Laser: 5
    // Deflector: 10
    // Total: 5 - 50 + 5 + 10 = -30 (Net Production)
    if (basicStats.powerDraw === -30) {
        console.log("✅ Power Balance Calculation Correct (-30 production)");
    } else {
        console.log("❌ Power Balance Calculation Mismatch:", basicStats.powerDraw);
    }

    console.log("--- SHIP DESIGN TESTS COMPLETE ---");
}

runTests().catch(console.error);
