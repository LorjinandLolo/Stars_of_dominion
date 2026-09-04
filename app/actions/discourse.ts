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
import { getFactionSpeaker, humaniseFactionId, isBlocId } from '@/lib/ai/faction-personalities';
import { generateFactionDiscourse } from '@/lib/ai/faction-ai';
import { getRecentMessages, appendMessage } from '@/lib/ai/discourse-memory';
import { generateNarrativeTone } from '@/lib/politics/narrative-engine';
import { resolveCallerFaction } from '@/lib/multiplayer/caller-faction';
import { executePlayerAction } from './registry-handler';

/**
 * Aggregates current simulation state into a summary suitable for LLM injection.
 *
 * Two kinds of counterpart share this channel. A BLOC is an interest group
 * inside the caller's own empire (data/blocs, seeded into every posture):
 * named "<id> Bloc", satisfaction read off the caller's posture. Anything
 * else is a foreign EMPIRE — seeded, breakaway or rebel — and must never be
 * called a bloc or framed as living inside the caller's empire.
 */
export async function getFactionStatusSummary(factionId: string): Promise<FactionContextSummary> {
  const world = getGameWorldState();
  const shared = world.shared;

  // Postures are keyed by faction id, never by the legacy 'player-empire'
  // key, so the caller's own posture is the one that carries their blocs.
  const { factionId: callerId } = await resolveCallerFaction();
  const empireId = callerId ?? 'player-empire';
  const posture = world.movement.empirePostures.get(empireId);
  const bloc = posture?.blocs.find(b => b.id === factionId);
  const seededBloc = !bloc && [...world.movement.empirePostures.values()].some(p => p.blocs.some(b => b.id === factionId));
  const isBloc = isBlocId(factionId) || !!bloc || seededBloc;

  // An empire carries an economy Faction whose name is "<empire> / <human
  // player>" ("Sarrak / Sil"); the envoy answers to the half before the slash.
  const econ = isBloc ? undefined : world.economy?.factions?.get?.(factionId);
  // Every authored civilization voice is that civilization's sitting ruler.
  // A rebel or breakaway that still shares its civilization with a living
  // parent must not be voiced by the ruler it is fighting; only a true
  // successor state (parent gone) inherits the voice. Otherwise: generic envoy.
  const civId = econ?.civilizationId;
  const parentAlive = !!civId && [...(world.economy?.factions?.values?.() ?? [])]
    .some(f => f.id !== factionId && f.civilizationId === civId);
  const speaker = getFactionSpeaker(factionId, parentAlive ? undefined : civId);

  let name: string;
  let satisfaction = bloc?.satisfaction ?? 50;
  if (econ) {
    name = econ.name.split(' / ')[0].trim() || econ.name;
    // Foreign empires have no bloc satisfaction. The closest thing the world
    // already tracks is the rivalry between the caller and them, so read it
    // inverted (no rivalry = content). Rivalries are stored in both directions;
    // an anonymous caller or an untracked pair stays neutral at 50.
    const rivalry = callerId
      ? world.rivalries?.get(`rivalry-${callerId}-${factionId}`) ?? world.rivalries?.get(`rivalry-${factionId}-${callerId}`)
      : undefined;
    if (rivalry) satisfaction = Math.max(0, Math.min(100, 100 - rivalry.rivalryScore));
  } else if (isBloc) {
    name = factionId.charAt(0).toUpperCase() + factionId.slice(1).replace(/_/g, ' ') + ' Bloc';
  } else {
    // Known to neither table: an id from a world this process has not loaded.
    // Read it as a name ("Sarrak Breakaway") rather than calling it a bloc.
    name = humaniseFactionId(factionId);
  }

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
      name,
      kind: isBloc ? 'bloc' : 'empire',
      satisfaction,
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
