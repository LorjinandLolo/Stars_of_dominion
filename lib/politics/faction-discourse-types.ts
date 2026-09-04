// lib/politics/faction-discourse-types.ts

export type LLMProviderType = "ollama" | "gemini" | "template" | "mock";
export type DiscourseGenerationMode = "ollama" | "gemini" | "template" | "mock";

export type DiscourseStance =
  | "supportive"
  | "hostile"
  | "evasive"
  | "demanding"
  | "fearful"
  | "neutral";

export interface FactionSpeakerProfile {
  id: string;
  factionId: string;
  name: string;
  title: string;
  tone: string;
  politicalStyle: string;
  coreValues: string[];
  primaryConcerns: string[];
  verbalTics: string[];
  samplePhrases: string[];
  greetings: string[];
  redLines: string[];
  negotiationStyle: string;
  worldview: string;
  avatarKey?: string;
  /**
   * The civilization this voice belongs to (lib/civilization/data/civilizations.ts).
   * Lets a faction that has no entry of its own — a breakaway state, a rebel
   * junta — borrow the voice of its parent civilization instead of a stranger's.
   * Bloc speakers and the generic envoy pool leave it unset.
   */
  civilizationId?: string;
}

export interface DiscourseMessage {
  id: string;
  speaker: "player" | "faction";
  content: string;
  timestamp: number;
}

export interface FactionContextSummary {
  empire: {
    name: string;
    rulerName?: string;
    rulerTitle?: string;
    government: string;
    ideology: string;
    narrativeTone: string;
    stability: number;
    legitimacy?: number;
    corruption?: number;
    warExhaustion?: number;
    treasuryState?: string;
    unrest?: number;
    recentEvents: string[];
    strategicPressures?: string[];
  };
  faction: {
    id: string;
    name: string;
    /** A bloc inside the player's empire, or a foreign empire on the same channel. */
    kind?: 'bloc' | 'empire';
    ideology?: string;
    satisfaction: number;
    influence: number;
    loyalty?: number;
    radicalization?: number;
    alignment?: string;
    demands: string[];
    grievances: string[];
    recentChanges?: string[];
    relationshipToPlayer?: string;
  };
  speaker: FactionSpeakerProfile;
  conversation: {
    recentMessages: DiscourseMessage[];
    threadSummary?: string;
  };
}

export interface FactionDiscourseRequest {
  factionId: string;
  playerMessage: string;
}

export interface FactionDiscourseResponse {
  message: string;
  speakerName: string;
  factionId: string;
  generationMode: DiscourseGenerationMode;
  stance?: DiscourseStance;
  intensity?: 1 | 2 | 3 | 4 | 5;
  topics?: string[];
  debug?: {
    provider: string;
    model?: string;
    fallbackReason?: string;
    promptCharsApprox?: number;
  };
}
