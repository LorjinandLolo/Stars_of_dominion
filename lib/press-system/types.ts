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
    COUNTER_NARRATIVE = 'COUNTER_NARRATIVE' // Active resistance/debunking.
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

export interface MediaCrisis {
    id: string;
    storyId: string; // The triggering story
    targetEmpireId: string;
    deadlineTick: number;
    severity: number; // 0-100
    resolved: boolean;
    choiceMade?: CrisisChoice;
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
    quarantinedPlanets: Set<string>; // Planet IDs under lockdown
    jammedSystems: Set<string>; // System IDs under blackout
    counterNarratives: Map<string, number>; // System ID -> Resistance Strength (0-100)
}
