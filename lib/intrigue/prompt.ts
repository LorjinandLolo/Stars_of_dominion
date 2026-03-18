import { IntrigueContext } from './types';

export const INTRIGUE_SYSTEM_PROMPT = `
You are a sci-fi political intrigue generator for a strategy game.
Your goal is to generate 3 distinct covert operation options based on the provided context.

RULES:
1. Output MUST be valid JSON.
2. Do NOT calculate game mechanics (e.g., "50% chance of success").
3. Focus on narrative flavor appropriate for the "Occupation" and "Situation" tags provided.
4. Each option must map to one of the allowed PlotTypes: SABOTAGE, THEFT, INSURRECTION, ASSASSINATION, PROPAGANDA, ESPIONAGE.
5. Risk levels depend on the audacity of the plot (LOW/MEDIUM/HIGH).
6. Costs should be abstract resources like 'credits' or 'intel'.

TONE:
- Gritty, realistic, space opera.
- Use the Occupation and Situation to flavor the description.
`;

export const INTRIGUE_JSON_SCHEMA = {
    type: "object",
    properties: {
        flavorText: { type: "string", description: "A brief 1-sentence scene setting based on the target location." },
        options: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Unique short identifier (e.g., 'sabotage_mine')" },
                    title: { type: "string", description: "Short punchy title" },
                    description: { type: "string", description: "One sentence describing the action." },
                    plotType: {
                        type: "string",
                        enum: ["SABOTAGE", "THEFT", "INSURRECTION", "ASSASSINATION", "PROPAGANDA", "ESPIONAGE"]
                    },
                    risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                    cost: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                resource: { type: "string", enum: ["credits", "intel"] },
                                amount: { type: "number" }
                            },
                            required: ["resource", "amount"]
                        }
                    }
                },
                required: ["id", "title", "description", "plotType", "risk", "cost"]
            }
        }
    },
    required: ["flavorText", "options"]
};

export function buildUserPrompt(context: IntrigueContext): string {
    const { targetFaction, targetEntity, spyNetwork } = context;

    let prompt = `Target Faction: ${targetFaction.name} (Traits: ${targetFaction.traits.join(', ')})\n`;

    if (targetEntity) {
        prompt += `Target Location: ${targetEntity.name} (${targetEntity.type})\n`;
        prompt += `Location Tags: Occupation="${targetEntity.tags.occupation}", Situation="${targetEntity.tags.situation}"\n`;
    }

    prompt += `Spy Network Level: ${spyNetwork.level} (Location: ${spyNetwork.location})\n`;
    prompt += `\nGenerate 3 intrigue options.`;

    return prompt;
}
