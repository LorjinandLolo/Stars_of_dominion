// lib/narrative/prose/prose-types.ts — the contract between the narrator and
// whatever writes its prose.
//
// Deliberately NOT the `generateFactionReply` interface in lib/ai: that one is
// shaped for a faction answering a player in dialogue, and takes a
// FactionContextSummary. A newspaper article is a different job with different
// inputs, so it gets its own narrow interface. Both sit on the same providers
// underneath once phase 3 wires an LLM in.

import type { ChronicleAttribution, ChronicleEventType } from '../chronicle-types';
import type { EventMemory } from '../memory-service';
import type { Stance } from '../press-voices';

/** One chronicle row, decoded, as the prose layer sees it. */
export interface NarratableEvent {
    id: string;
    tick: number;
    day: number;
    type: ChronicleEventType;
    importance: number;
    /**
     * Who really acted. Present here because the narrator process needs it for
     * grouping and bookkeeping; the prose layer must consult `visibleActors`
     * instead when deciding what to print.
     */
    actorIds: string[];
    actorNames: string[];
    targetIds: string[];
    targetNames: string[];
    location: string | null;
    facts: Record<string, string | number | boolean | null>;
    attribution: ChronicleAttribution;
}

/**
 * A group of events that become one article. Single-event groups are the norm;
 * multi-event groups come from a shared `coalesceKey` (five bombardment orders
 * on one planet are one story, not five).
 */
export interface NarrationRequest {
    events: NarratableEvent[];
    /** Highest-importance event in the group; the article's subject. */
    lead: NarratableEvent;
    /**
     * Names the article may print as responsible. Empty when the act is
     * unattributed — the prose must then describe an effect with no author.
     * Derived from `attribution`, never from `actorNames` directly.
     */
    visibleActors: string[];
    /** True when the galaxy is guessing rather than knowing. */
    speculative: boolean;
    day: number;
    /**
     * What the chronicle remembers that bears on this story: an existing feud,
     * prior coverage of the same actors or place, whether this is the first of
     * its kind. Supplied by the narrator; empty when there is no history yet.
     *
     * This is how a war becomes "the latest round of an old quarrel" without
     * anyone holding the last two hundred hours in memory.
     */
    memory: EventMemory;
    /**
     * Which outlet is running this and what line it takes. State media flatters
     * its own empire, the pirate press assumes the worst of everyone, and a
     * low-credibility outlet asserts more than it can prove.
     */
    stance: Stance;
    /**
     * For an obituary: what the empire did while this leader held office,
     * already phrased. Empty for every other kind of story.
     */
    career?: string[];
}

export interface NarrationResult {
    headline: string;
    /** The article body. One or two short paragraphs. */
    body: string;
    /** Short summary for the gazette front page. */
    lede: string;
    /** Editorial register: 'grave' | 'triumphal' | 'wry' | 'neutral' | 'alarmed'. */
    tone: string;
    /** Which writer produced this — 'template' until phase 3. */
    provider: string;
}

export interface ProseWriter {
    write(request: NarrationRequest): Promise<NarrationResult>;
}
