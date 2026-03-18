// app/actions/discourse.ts

'use server';

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

/**
 * Aggregates current simulation state into a summary suitable for LLM injection.
 */
export async function getFactionStatusSummary(factionId: string): Promise<FactionContextSummary> {
  const world = getGameWorldState();
  const shared = world.shared;
  
  // Here we assume factionId refers to an internal bloc in our context, 
  // though the spec might use it for empire-level factions too.
  // We'll primarily focus on the player's own empire (e.g. 'player-empire') 
  // and its internal blocs for this discourse system.
  const empireId = 'player-empire'; // Fallback / default for v1
  const posture = world.movement.empirePostures.get(empireId);
  const bloc = posture?.blocs.find(b => b.id === factionId);

  const speaker = getFactionSpeaker(factionId);

  return {
    empire: {
      name: "Solarian Hegemony", // TODO: Fetch from actual empire record
      rulerName: "Lorian",
      rulerTitle: "Supreme Hegemon",
      government: "Military Autocracy", // TODO: Dynamic from governmentRegistry
      ideology: "Militarist / Centralized", // TODO: From ideology-service
      narrativeTone: generateNarrativeTone(empireId, world),
      stability: shared.standardStability || 80,
      warExhaustion: shared.warFatigue || 0,
      unrest: 10, // Mock for now
      recentEvents: [
        "Victory at the Omicron Cluster",
        "Recent commodity shortage in the Outer Rim",
        "Successful integration of the Delta sector"
      ]
    },
    faction: {
      id: factionId,
      name: factionId.charAt(0).toUpperCase() + factionId.slice(1) + " Bloc",
      satisfaction: bloc?.satisfaction || 50,
      influence: 25, // Mock for now
      demands: moodBasedDemands(factionId, bloc?.satisfaction || 50),
      grievances: moodBasedGrievances(factionId, bloc?.satisfaction || 50)
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

  // Add player message to history before generating
  appendMessage(input.factionId, playerMsg);
  
  // Refresh context with updated history
  context.conversation.recentMessages = getRecentMessages(input.factionId);

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

  // Add faction response to history
  appendMessage(input.factionId, factionMsg);

  return {
    playerMessage: playerMsg,
    factionMessage: factionMsg,
    response
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function moodBasedDemands(id: string, satisfaction: number): string[] {
  if (satisfaction > 60) return [];
  if (id === 'military') return ["Increased naval budget", "Modernized hull plating"];
  if (id === 'trade') return ["Abolition of Rim-tariffs", "Privateer letters of marque"];
  return ["Improved welfare subsidies"];
}

function moodBasedGrievances(id: string, satisfaction: number): string[] {
  if (satisfaction > 70) return [];
  if (id === 'military') return ["Excessive war fatigue is demoralizing the troops"];
  if (id === 'trade') return ["Corporate dividends are at a 5-year low"];
  return ["The central council ignores the fringe worlds"];
}
