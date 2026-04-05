'use server';
/**
 * app/actions/discourse.ts
 * Multiplayer Authoritative Refactor
 */

import { revalidatePath } from 'next/cache';
import { 
  FactionContextSummary, 
  FactionDiscourseRequest, 
  FactionDiscourseResponse,
  DiscourseMessage
} from '@/lib/politics/faction-discourse-types';
import { getGameWorldState } from '@/lib/game-world-state-singleton';
import { getFactionSpeaker } from '@/lib/ai/faction-personalities';
import { generateFactionDiscourse } from '@/lib/ai/faction-ai';
import { getRecentMessages, appendMessage } from '@/lib/ai/discourse-memory';
import { generateNarrativeTone } from '@/lib/politics/narrative-engine';
import { executePlayerAction } from './registry-handler';

/**
 * Aggregates current simulation state into a summary suitable for LLM injection.
 */
export async function getFactionStatusSummary(factionId: string): Promise<FactionContextSummary> {
  const world = getGameWorldState();
  const shared = world.shared;
  
  const empireId = 'player-empire'; 
  const posture = world.movement.empirePostures.get(empireId);
  const bloc = posture?.blocs.find(b => b.id === factionId);
  const speaker = getFactionSpeaker(factionId);

  return {
    empire: {
      name: "Solarian Hegemony",
      rulerName: "Lorian",
      rulerTitle: "Supreme Hegemon",
      government: "Military Autocracy",
      ideology: "Militarist / Centralized",
      narrativeTone: generateNarrativeTone(empireId, world),
      stability: (shared.stability * 100) || 80,
      warExhaustion: shared.warFatigue || 0,
      unrest: 10,
      recentEvents: ["Victory at the Omicron Cluster"]
    },
    faction: {
      id: factionId,
      name: factionId.charAt(0).toUpperCase() + factionId.slice(1) + " Bloc",
      satisfaction: bloc?.satisfaction || 50,
      influence: 25,
      demands: [],
      grievances: []
    },
    speaker,
    conversation: {
      recentMessages: getRecentMessages(factionId)
    }
  };
}

/**
 * Main server action to process a player's political message.
 */
export async function sendDiscourseMessageAction(input: FactionDiscourseRequest): Promise<{
  playerMessage: DiscourseMessage;
  factionMessage: DiscourseMessage;
  response: FactionDiscourseResponse;
}> {
  if (!input.playerMessage.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const context = await getFactionStatusSummary(input.factionId);
  
  const playerMsg: DiscourseMessage = {
    id: `m_p_${Date.now()}`,
    speaker: 'player',
    content: input.playerMessage,
    timestamp: Date.now()
  };

  appendMessage(input.factionId, playerMsg);
  
  const response = await generateFactionDiscourse({
    context,
    playerMessage: input.playerMessage
  });

  const factionMsg: DiscourseMessage = {
    id: `m_f_${Date.now()}`,
    speaker: 'faction',
    content: response.message,
    timestamp: Date.now()
  };

  appendMessage(input.factionId, factionMsg);

  // Authoritative Link: Post the opinion to the game loop so others see the discourse effect
  await executePlayerAction({
    id: `discourse-${Date.now()}`,
    actionId: 'DISCOURSE_POST_OPINION',
    issuerId: input.factionId,
    targetId: input.factionId,
    payload: { content: input.playerMessage, response: response.message },
    timestamp: Math.floor(Date.now() / 1000)
  });

  revalidatePath('/');
  return { playerMessage: playerMsg, factionMessage: factionMsg, response };
}
