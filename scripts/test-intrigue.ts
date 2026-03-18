import { PoliticalIntrigueService } from '../lib/intrigue/service';
import { IntrigueContext } from '../lib/intrigue/types';

async function testIntrigue() {
    console.log("=== Testing Political Intrigue System ===");

    const service = new PoliticalIntrigueService();

    // 1. Mock Context
    const context: IntrigueContext = {
        targetFaction: {
            id: "faction-alpha",
            name: "United Terran Protectorate",
            traits: ["Authoritarian", "Industrialist"]
        },
        targetEntity: {
            name: "Proxima Mine 4",
            type: "station",
            tags: {
                occupation: "Wage-slave corporate miners",
                situation: "Life support is threatened"
            }
        },
        spyNetwork: {
            level: 3,
            location: "Proxima Centauri System"
        }
    };

    // 2. Generate Options
    console.log("\n[1] Generating Options...");
    const response = await service.generateIntrigueOptions(context);

    console.log(`\nFlavor Text: "${response.flavorText}"`);
    console.log(`Generated ${response.options.length} options:\n`);

    response.options.forEach(opt => {
        console.log(`- [${opt.plotType}] ${opt.title} (${opt.risk} Risk)`);
        console.log(`  "${opt.description}"`);
        console.log(`  Cost: ${JSON.stringify(opt.cost)}\n`);
    });

    // 3. Resolve an Option
    const chosen = response.options[0]; // Pick the first one
    console.log(`\n[2] Resolving Option: ${chosen.title}...`);

    const result = await service.resolveIntrigue(chosen, context.targetFaction.id);
    console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILURE'} - ${result.message}`);
}

testIntrigue().catch(console.error);
