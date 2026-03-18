import { IntrigueContext, IntrigueResponse, IntrigueOption } from './types';
import { INTRIGUE_SYSTEM_PROMPT, buildUserPrompt, INTRIGUE_JSON_SCHEMA } from './prompt';
import { createTradeRoute } from '../economy/trade';
import { triggerCrisis } from '../economy/crisis';
import { ResourceId } from '@/types';

// Mock function to simulate LLM call
// In a real app, this would call OpenAI/Anthropic API
async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return a mocked JSON response based on the context to prove it "works"
    // This is hardcoded for demonstration but proves the pipeline
    return JSON.stringify({
        flavorText: "The local miners are restless, and the corporate overseers are distracted by a recent accident.",
        options: [
            {
                id: "sabotage_mining_laser",
                title: "Sabotage Mining Laser",
                description: "Rig a mining laser to malfunction, causing a production halt.",
                plotType: "SABOTAGE",
                risk: "LOW",
                cost: [{ resource: "credits", amount: 100 }]
            },
            {
                id: "instigate_strike",
                title: "Instigate Miner Strike",
                description: "Spread rumors of wage cuts to trigger a labor stoppage.",
                plotType: "INSURRECTION",
                risk: "MEDIUM",
                cost: [{ resource: "intel", amount: 50 }]
            },
            {
                id: "steal_shipment",
                title: "Intercept Shipment",
                description: "Bribe a pilot to divert a shipment of refined ore.",
                plotType: "THEFT",
                risk: "HIGH",
                cost: [{ resource: "credits", amount: 500 }]
            }
        ]
    });
}

export class PoliticalIntrigueService {

    /**
     * Generates intrigue options using an LLM (mocked).
     * @param context The spy/target context
     * @returns Structured options or throws error
     */
    async generateIntrigueOptions(context: IntrigueContext): Promise<IntrigueResponse> {
        const systemPrompt = INTRIGUE_SYSTEM_PROMPT;
        const userPrompt = buildUserPrompt(context);

        console.log("--- Generating Intrigue Options ---");
        console.log("Context:", JSON.stringify(context, null, 2));

        try {
            const rawResponse = await callLLM(systemPrompt, userPrompt);
            const parsed = JSON.parse(rawResponse);

            // Basic Validation against Schema (Mocked validation)
            if (!parsed.options || !Array.isArray(parsed.options)) {
                throw new Error("Invalid structure: missing options array");
            }

            return parsed as IntrigueResponse;

        } catch (error) {
            console.error("Failed to generate intrigue:", error);
            // Fallback to canned response
            return {
                flavorText: "The situation is murky. Standard operations are available.",
                options: [
                    {
                        id: "fallback_gather_intel",
                        title: "Gather Intel",
                        description: "Standard reconnaissance mission.",
                        plotType: "ESPIONAGE",
                        risk: "LOW",
                        cost: [{ resource: "credits", amount: 50 }]
                    }
                ]
            };
        }
    }

    /**
     * Resolves the effect of a chosen option.
     * This is where Deterministic Game Logic takes over.
     */
    async resolveIntrigue(option: IntrigueOption, targetFactionId: string): Promise<{ success: boolean, message: string }> {
        // Simple RNG based on Risk
        // In real game: Check spy level vs counter-espionage + dice roll
        let threshold = 0.5;
        if (option.risk === 'LOW') threshold = 0.8;
        if (option.risk === 'MEDIUM') threshold = 0.5;
        if (option.risk === 'HIGH') threshold = 0.3;

        const roll = Math.random();
        console.log(`Resolving ${option.id} (${option.risk}). Roll: ${roll.toFixed(2)} vs ${threshold}`);

        if (roll < threshold) {
            // SUCCESS
            switch (option.plotType) {
                case 'SABOTAGE':
                    console.log(`[GAME LOGIC] Sabotage successful against ${targetFactionId}`);
                    // Trigger a Sabotage Crisis for the target
                    triggerCrisis(targetFactionId, 'sabotage');
                    break;
                case 'THEFT':
                    console.log(`[GAME LOGIC] Stealing resources...`);
                    // Create a subtle trade route representing the theft flow
                    createTradeRoute('player-faction', targetFactionId, 'credits' as ResourceId, 100);
                    break;
                case 'INSURRECTION':
                    console.log(`[GAME LOGIC] Inciting unrest...`);
                    triggerCrisis(targetFactionId, 'embargo'); // closest proxy for now
                    break;
                default:
                    console.log(`[GAME LOGIC] Effect applied for ${option.plotType}`);
            }
            return { success: true, message: `Operation '${option.title}' was successful.` };
        } else {
            // FAILURE
            console.log(`[GAME LOGIC] Spy network exposed!`);
            triggerCrisis('player-faction', 'blockade', targetFactionId); // Retaliation
            return { success: false, message: `Operation '${option.title}' failed and your agents were exposed.` };
        }
    }
}
