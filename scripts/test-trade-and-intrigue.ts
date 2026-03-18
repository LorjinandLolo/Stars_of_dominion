
import { createTradeRoute, getActiveRoutes, checkBlockade } from '../lib/economy/trade';
import { PoliticalIntrigueService } from '../lib/intrigue/service';
import { getActiveCrises } from '../lib/economy/crisis';
import { IntrigueContext } from '../lib/intrigue/types';

async function runTest() {
    try {
        console.log("=== STARTING TRADE & INTRIGUE LOGIC TEST ===");

        // --- TEST 1: TRADE ---
        console.log("\n--- TEST 1: TRADE SYSTEM ---");
        const playerFaction = 'faction-player';
        const targetFaction = 'faction-alpha';

        console.log(`1. Creating Trade Route from ${playerFaction} to ${targetFaction}...`);
        const route = createTradeRoute(playerFaction, targetFaction, 'credits', 100);

        const activeRoutes = getActiveRoutes(playerFaction);
        console.log(`Status: Active Routes count = ${activeRoutes.length}`);
        if (activeRoutes.length === 1 && activeRoutes[0].id === route.id) {
            console.log("PASS: Route created and active.");
        } else {
            console.error("FAIL: Route creation failed.");
        }

        console.log("2. Simulating Blockade...");
        // Simulate target sector being hostile
        checkBlockade(route.id, [targetFaction]);
        // Re-fetch to check status
        // Note: getActiveRoutes filters by 'active', so we need to check the object reference or a getAll function if available.
        // However, the object reference `route` should be mutated in memory.
        if (route.status === 'blockaded') {
            console.log("PASS: Route successfully blockaded.");
        } else {
            console.error(`FAIL: Route status is ${route.status}, expected 'blockaded'.`);
        }

        // --- TEST 2: INTRIGUE ---
        console.log("\n--- TEST 2: INTRIGUE SYSTEM ---");
        const service = new PoliticalIntrigueService();
        const context: IntrigueContext = {
            targetFaction: {
                id: targetFaction,
                name: "Alpha Consortium",
                traits: ["Industrialist", "Autocratic"]
            },
            targetEntity: {
                name: "Planet Prime",
                type: "planet",
                tags: {
                    occupation: "Mining Colony",
                    situation: "Labor Unrest"
                }
            },
            spyNetwork: {
                level: 3,
                location: "Underground Tunnels"
            }
        };

        console.log("1. Generating Options...");
        const ops = await service.generateIntrigueOptions(context);
        console.log(`Generated ${ops.options.length} options.`);
        if (ops.options.length > 0) {
            console.log("PASS: Options generated.");
        } else {
            console.error("FAIL: No options generated.");
        }

        // Find a SABOTAGE option (mock usually returns one)
        const sabotageOp = ops.options.find(o => o.plotType === 'SABOTAGE');
        if (sabotageOp) {
            console.log(`2. Executing Sabotage Op: ${sabotageOp.title}...`);

            // Force success by mocking random if possible, or just running enough times?
            // The service logic has a threshold. Sabotage is usually LOW risk in mock? No, probably varied.
            // Let's just run it. If it fails, we check for 'spy network exposed'. If success, checking crisis.
            // For this test, we can try to force it or just observe the output.
            // Actually, looking at service.ts, I can't easily force the RNG without mocking Math.random.
            // Let's Mock Math.random to ensure success for the test.
            const originalRandom = Math.random;
            Math.random = () => 0.1; // Ensure < threshold

            const result = await service.resolveIntrigue(sabotageOp, targetFaction);
            console.log(`Result: ${result.message}`);

            if (result.success) {
                console.log("PASS: Operation reported success.");

                // Check Side Effect: Crisis triggered on target
                const crises = getActiveCrises(targetFaction);
                const sabotageCrisis = crises.find(c => c.type === 'sabotage');

                if (sabotageCrisis) {
                    console.log(`PASS: Crisis '${sabotageCrisis.type}' triggered on target ${targetFaction}.`);
                } else {
                    console.error("FAIL: No crisis triggered on target.");
                }

            } else {
                console.error("FAIL: Operation failed despite forced RNG.");
            }

            // Restore RNG
            Math.random = originalRandom;

        } else {
            console.warn("WARN: No Sabotage option found to test.");
        }

        console.log("\n=== TEST COMPLETE ===");
    } catch (e) {
        console.error("\n!!! CRITICAL TEST FAILURE !!!");
        console.error(e);
        process.exit(1);
    }
}

runTest();
