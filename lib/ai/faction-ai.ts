// lib/ai/faction-ai.ts

import { FactionContextSummary, FactionDiscourseResponse } from '../politics/faction-discourse-types';
import { safeGenerateFactionReply } from './llm-provider';

/**
 * Builds the system prompt for a faction speaker.
 */
export function buildFactionSystemPrompt(context: FactionContextSummary): string {
  const { empire, faction, speaker } = context;

  return `You are ${speaker.name}, ${speaker.title}, spokesperson for the ${faction.name} inside the empire of ${empire.name}.

You are a political actor, not an assistant. You have interests, fears, demands, and ideological commitments.
Your tone is ${speaker.tone}. Your political style is ${speaker.politicalStyle}.
Your core values are: ${speaker.coreValues.join(', ')}.

RULES:
1. Stay in character at all times.
2. Ground your reply strictly in the provided simulation state.
3. Your faction's satisfaction is ${faction.satisfaction}% and influence is ${faction.influence}%. This should dictate your cooperativeness.
4. Do not invent new facts, events, or outcomes.
5. Do not mention being an AI or assistant.
6. Do not narrate gameplay mechanics.
7. Respond with one concise in-world political reply, target 40 to 120 words.
8. Use your verbal tics occasionally: ${speaker.verbalTics.join(', ')}.`;
}

/**
 * Builds the user prompt containing the current simulation context.
 */
export function buildFactionUserPrompt(context: FactionContextSummary, playerMessage: string): string {
  const { empire, faction, conversation } = context;

  const history = conversation.recentMessages
    .map(m => `${m.speaker === 'player' ? 'Player' : 'Faction'}: ${m.content}`)
    .join('\n');

  return `
Empire State:
- Name: ${empire.name}
- Government: ${empire.government}
- Ideology: ${empire.ideology}
- Narrative tone: ${empire.narrativeTone}
- Stability: ${empire.stability}%
- Legitimacy: ${empire.legitimacy || 'N/A'}
- War exhaustion: ${empire.warExhaustion || 0}%
- Unrest: ${empire.unrest || 0}%
- Recent events:
${empire.recentEvents.map(e => `  - ${e}`).join('\n')}

Faction State (${faction.name}):
- Satisfaction: ${faction.satisfaction}%
- Influence: ${faction.influence}%
- Demands: ${faction.demands.join(', ') || 'None'}
- Grievances: ${faction.grievances.join(', ') || 'None'}

Recent Conversation History:
${history || 'None (Connection established)'}

Player Message:
"${playerMessage}"

Task:
Reply as the faction speaker in-character. Return only the in-world political reply. Avoid meta-commentary.
`;
}

/**
 * Orchestrates the generation of a faction discourse response.
 */
export async function generateFactionDiscourse(input: {
  context: FactionContextSummary;
  playerMessage: string;
}): Promise<FactionDiscourseResponse> {
  const systemPrompt = buildFactionSystemPrompt(input.context);
  const userPrompt = buildFactionUserPrompt(input.context, input.playerMessage);

  const result = await safeGenerateFactionReply({
    systemPrompt,
    userPrompt,
    context: input.context
  });

  // Heuristic stance inference (v1)
  const text = result.text.toLowerCase();
  let stance: FactionDiscourseResponse['stance'] = 'neutral';
  if (text.includes('demand') || text.includes('must') || text.includes('refuse')) stance = 'demanding';
  else if (text.includes('thank') || text.includes('excellent') || text.includes('support')) stance = 'supportive';
  else if (text.includes('danger') || text.includes('fear') || text.includes('worry')) stance = 'fearful';
  else if (text.includes('traitor') || text.includes('enemy') || text.includes('failure')) stance = 'hostile';

  return {
    message: result.text,
    speakerName: input.context.speaker.name,
    factionId: input.context.faction.id,
    generationMode: result.provider,
    stance,
    intensity: Math.min(5, Math.max(1, Math.floor(input.context.faction.satisfaction / 20))) as any, // Simple mapping
    debug: {
      provider: result.provider,
      model: result.model,
      fallbackReason: result.fallbackReason,
      promptCharsApprox: systemPrompt.length + userPrompt.length
    }
  };
}
