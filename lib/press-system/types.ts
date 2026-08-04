export enum PressFactionType {
    STATE_MEDIA = 'STATE_MEDIA',
    INDEPENDENT_MEDIA = 'INDEPENDENT_MEDIA',
    PIRATE_PRESS = 'PIRATE_PRESS'
}

export enum StorySource {
    ESPIONAGE_LEAK = 'ESPIONAGE_LEAK', // From spy success
    ECONOMIC_DATA = 'ECONOMIC_DATA', // Shortages, price shocks
    WAR_REPORT = 'WAR_REPORT', // Battle outcome
    RUMOR_MILL = 'RUMOR_MILL' // Randomly generated or planted
}

export enum StoryTruth {
    TRUE = 'TRUE',
    FALSE = 'FALSE',
    UNKNOWN = 'UNKNOWN' // For rumors before verification
}

export enum CrisisChoice {
    SUPPRESS = 'SUPPRESS', // Hide it. Costs trust if failed.
    ADMIT_REFORM = 'ADMIT_REFORM', // Admit. Short term loss, long term trust gain.
    BLAME_FOREIGN = 'BLAME_FOREIGN', // Deflect. Reduced impact if successful, diplomatic penalty.
    IGNORE = 'IGNORE', // Do nothing. Let it burn out (or explode).
    COUNTER_LEAK = 'COUNTER_LEAK', // Attack the source.
    QUARANTINE = 'QUARANTINE', // Local information lockdown.
    JAM_SIGNAL = 'JAM_SIGNAL', // Targeted system-wide blackouts.
    COUNTER_NARRATIVE = 'COUNTER_NARRATIVE', // Active resistance/debunking.
    DENY = 'DENY', // Claim the story is false. Cheap vs weak evidence; credibility collapse vs strong.
    DISTRACT = 'DISTRACT' // Flood the cycle with another story. Relieves pressure, story keeps circulating.
}

export interface PressFactionState {
    id: string; // "FactionID_TYPE" e.g. "Imperium_STATE"
    type: PressFactionType;
    affiliatedEmpireId?: string; // Only for STATE_MEDIA
    credibility: number; // 0-100
    bias: number; // -100 (Anti-Empire) to 100 (Pro-Empire) relative to affiliation or general establishment?
    // Actually, bias is usually target-specific. Let's keep it simple: "Establishment Bias"
    // For Independent: 0. For State: 100. For Pirate: -100.
    cooldowns: Map<string, number>; // StoryID -> ticks until can publish similar?
}

export interface EmpireState {
    id: string;
    publicTrust: number; // 0-100
    informationPressure: number; // 0-100. High = Volatile, Crisis likely.
    activeCrises: Set<string>; // IDs of active MediaCrises
    credibility: number; // 0-100. How much official statements are believed. Burned by exposed denials.
    mediaFreedom: number; // 0-100. Eroded by suppression/jamming; feeds independent-press behavior later.
    narrativeInfluence: number; // 0-100. Reach beyond own borders; budget for foreign campaigns later.
}

export interface PlanetState {
    id: string;
    ownerId: string;
    stability: number; // 0-100
    happiness: number; // 0-100
    fear: number; // 0-100
    radicalization: number; // 0-100
    position: { x: number; y: number }; // For propagation distance
}

export interface Story {
    id: string;
    source: StorySource;
    truth: StoryTruth;
    targetEmpireId: string;
    subject: string; // Description or Event ID
    baseMagnitude: number; // 0-100 impact potential
    evidenceStrength: number; // 0-100. How well-documented the story is; gates DENY.
    tickCreated: number;
    // Metadata for procedural generation
    details?: any;
}

export interface PublishedStory {
    id: string;
    storyId: string;
    publisherId: string;
    tickPublished: number;
    viralFactor: number; // Computed at publish time based on credibility
    originPlanetId: string; // The "Epicenter"
    transmissionMap: Map<string, number>; // PlanetID -> Intensity (0-100)
    jammedSystems: Set<string>; // Systems where spread is blocked
}

export enum InvestigationStage {
    RUMOUR = 'RUMOUR',
    INQUIRY = 'INQUIRY',
    EVIDENCE = 'EVIDENCE',
    PUBLICATION = 'PUBLICATION',
    SCANDAL = 'SCANDAL'
}

/** A journalist-driven dig into an empire: Rumour → Inquiry → Evidence → Publication → Scandal. */
export interface Investigation {
    id: string;
    targetEmpireId: string;
    investigatorId: string; // press faction doing the digging
    subject: string;
    storyId?: string; // triggering story, if one exists
    stage: InvestigationStage;
    progress: number; // 0-100 within the current stage
    evidence: number; // 0-100; grows while digging, jumps on botched cover-ups
    /** Times the government has stonewalled; each attempt is likelier to leak than the last. */
    obstructions?: number;
    startedTick: number;
    updatedTick: number;
    resolved: boolean;
    outcome?: string;
}

export type CrisisReaction = 'AMPLIFY' | 'DEFEND' | 'NEUTRAL';

export interface MediaCrisis {
    id: string;
    storyId: string; // The triggering story
    targetEmpireId: string;
    deadlineTick: number;
    severity: number; // 0-100
    resolved: boolean;
    choiceMade?: CrisisChoice;
    outcome?: string;
    /** Foreign factions' public stances (phase 2 of the crisis mini-game). */
    reactions?: Record<string, CrisisReaction>;
    /** Hidden predictions of the government's response — correct calls pay out on resolve. */
    predictions?: Record<string, CrisisChoice>;
}

export enum CampaignObjective {
    UNDERMINE_TRUST = 'UNDERMINE_TRUST',       // drains the target's publicTrust
    DAMAGE_CREDIBILITY = 'DAMAGE_CREDIBILITY', // drains the target's credibility
    STOKE_UNREST = 'STOKE_UNREST'              // pumps the target's informationPressure
}

/** A covert foreign information campaign running inside a rival empire. */
export interface MediaCampaign {
    id: string;
    attackerId: string;
    targetEmpireId: string;
    objective: CampaignObjective;
    strength: number;  // 0-100; spins up while funded, knocked down by counter-messaging
    exposure: number;  // 0-100; target gets a signal story at 30, tracing becomes viable beyond
    signaled: boolean; // signal story already injected
    discoveredBy?: string; // set once traced — attribution unlocked
    tickStarted: number;
    active: boolean;
    outcome?: string;
}

export interface SimulationState {
    tick: number;
    empires: Map<string, EmpireState>;
    planets: Map<string, PlanetState>;
    pressFactions: Map<string, PressFactionState>;
    activeStories: Map<string, Story>; // Available to be picked up
    publishedStories: PublishedStory[]; // History/Active propagation
    crises: Map<string, MediaCrisis>;
    investigations: Map<string, Investigation>;
    campaigns: Map<string, MediaCampaign>;
    quarantinedPlanets: Set<string>; // Planet IDs under lockdown
    jammedSystems: Set<string>; // System IDs under blackout
    counterNarratives: Map<string, number>; // System ID -> Resistance Strength (0-100)
}
