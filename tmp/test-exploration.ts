// tmp/test-exploration.ts
import { surveySystemAction } from '../app/actions/exploration';

async function runTests() {
    console.log("--- STARTING EXPLORATION TESTS ---");

    // Test 1: Survey Action
    const systemId = 'alpha-5b34961e18bb6fd14903'; // Aglate (unsurveyed in mock)
    const res = await surveySystemAction(systemId);
    
    console.log("[TEST 1] Survey Response:", res);
    
    if (res.success && res.isSurveyed) {
        console.log("✅ Survey Action Successful");
        if (res.anomaly) {
            console.log(`✨ Discovery! Found: ${res.anomaly.name}`);
            console.log(`   Bonus: ${JSON.stringify(res.anomaly.bonus)}`);
        } else {
            console.log("No anomalies found in this sector.");
        }
    } else {
        console.log("❌ Survey Action Failed");
    }

    console.log("--- EXPLORATION TESTS COMPLETE ---");
}

runTests().catch(console.error);
