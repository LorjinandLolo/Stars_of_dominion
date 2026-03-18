// lib/ai/discourse-memory.ts

import { DiscourseMessage } from '../politics/faction-discourse-types';

const MAX_HISTORY = Number(process.env.DISCOURSE_MAX_HISTORY || 8);

// In-memory store for development. 
// In production, this would be backed by Appwrite or a Redis-like cache.
const discourseThreads: Map<string, DiscourseMessage[]> = new Map();

/**
 * Gets the recent message history for a specific faction thread.
 */
export function getRecentMessages(factionId: string, max: number = MAX_HISTORY): DiscourseMessage[] {
  const current = discourseThreads.get(factionId) || [];
  return current.slice(-max);
}

/**
 * Appends a new message to the faction's discourse thread.
 */
export function appendMessage(factionId: string, message: DiscourseMessage): void {
  const current = discourseThreads.get(factionId) || [];
  current.push(message);
  
  // Truncate to avoid unbounded growth
  if (current.length > MAX_HISTORY * 2) {
    discourseThreads.set(factionId, current.slice(-MAX_HISTORY));
  } else {
    discourseThreads.set(factionId, current);
  }
}

/**
 * Clears the history for a specific faction.
 */
export function clearHistory(factionId: string): void {
  discourseThreads.delete(factionId);
}

/**
 * Placeholder for future summarization logic.
 * Currently returns a simple string indicating the conversation state.
 */
export function summarizeThreadIfNeeded(factionId: string): string | undefined {
  const messages = discourseThreads.get(factionId) || [];
  if (messages.length === 0) return undefined;
  
  // Basic heuristic: summarize if there are more than 4 exchanges
  if (messages.length > 8) {
    const lastSummary = "A complex political exchange regarding imperial policy and faction concerns.";
    return lastSummary;
  }
  
  return undefined;
}
