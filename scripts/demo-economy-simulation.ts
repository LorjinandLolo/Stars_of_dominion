import { calculateIncome, applyTimeDelta, EconomyPlanet } from '../lib/economy/calculations';
import { createTradeRoute, getActiveRoutes } from '../lib/economy/trade';
import { triggerCrisis, getActiveCrises } from '../lib/economy/crisis';
import { ResourceId } from '../types';

async function runDemo() {
    console.log("=== 🚀 STAR OF DOM: ECONOMY SIMULATION ===");

    // 1. Setup Initial State
    const factionId = "faction-player";
    let resources: Record<ResourceId, number> = {
        credits: 1000, metals: 500, chemicals: 200, food: 500, happiness: 80
    };

    const planets: EconomyPlanet[] = [
        { $id: "p1", name: "Capital Prime", type: "terran" },    // Balanced
        { $id: "p2", name: "Vulcan Forge", type: "volcanic" },   // High Metal, Low Food
        { $id: "p3", name: "Oceanus", type: "ocean" }            // High Food
    ];

    console.log(`\n[1] INITIAL RESOURCES:`);
    console.log(JSON.stringify(resources, null, 2));

    // 2. Calculate Base Income
    console.log(`\n[2] CALCULATING PASSIVE INCOME...`);
    const rates = calculateIncome(planets);
    console.log("Hourly Rates:", rates);

    // 3. Setup Trade Route
    console.log(`\n[3] ESTABLISHING TRADE...`);
    // Import metals from an ally
    createTradeRoute("ally-planet", "p1", "metals", 50);
    // Export food to an ally (for credits) - simulated as gaining credits
    createTradeRoute("p3", "ally-planet", "credits", 100);

    const activeRoutes = getActiveRoutes("p1").concat(getActiveRoutes("p3"));
    console.log(`Active Routes: ${activeRoutes.length}`);

    // Adjust rates based on Trade
    activeRoutes.forEach(r => {
        // Simplified: If receiving, add to rate
        if (r.target_planet_id === "p1" || r.target_planet_id === "p3") {
            rates[r.resource] = (rates[r.resource] || 0) + r.amount;
        }
    });
    console.log("Adjusted Rates (with Trade):", rates);


    // 4. Trigger Crisis
    console.log(`\n[4] TRIGGERING CRISIS EVENT...`);
    triggerCrisis(factionId, 'embargo', 'enemy-faction');

    // Apply Crisis Effects to Rates
    const crises = getActiveCrises(factionId);
    crises.forEach(c => {
        console.log(`Applying effects of ${c.type}...`);
        c.consequences.forEach(eff => {
            // Crises usually hit stockpiles or happiness directly, 
            // but let's simulate a rate penalty for the demo
            if (rates[eff.resource]) {
                rates[eff.resource] += eff.amount;
            }
        });
    });
    console.log("Final Rates (with Crisis):", rates);


    // 5. Simulate Time Passing (10 Hours)
    console.log(`\n[5] SIMULATING 10 HOURS...`);
    const finalResources = applyTimeDelta(resources, rates, 10, {});

    console.log("\n=== FINAL RESULTS ===");
    console.log("Start vs End:");
    (Object.keys(resources) as ResourceId[]).forEach(res => {
        const diff = Math.floor(finalResources[res] - resources[res]);
        const sign = diff >= 0 ? "+" : "";
        console.log(`${res.padEnd(10)}: ${Math.floor(resources[res])} -> ${Math.floor(finalResources[res])} (${sign}${diff})`);
    });
    console.log("==========================================");
}

runDemo().catch(console.error);
