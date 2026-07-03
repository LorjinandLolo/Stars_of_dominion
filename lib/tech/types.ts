import { Faction } from '../../types/index';

// --- ENUMS (HoI4 Strategy Grammar) ---

// --- ENUMS (Standardized Schema) ---

export enum TechTreeType {
    ESPIONAGE = 'espionage',
    MILITARY = 'military',
    ECONOMY = 'economy',
    DIPLOMACY = 'diplomacy',
    INFRASTRUCTURE = 'infrastructure'
}

export type Domain = TechTreeType;
export const Domain = TechTreeType;

export enum TechTier {
    FOUNDATION = 0,
    EXPANSION = 1,
    SPECIALIZATION = 2,
    DOMINANCE = 3,
    TRANSFORMATION = 4
}

export type Tier = TechTier;
export const Tier = TechTier;

export enum TechStatus {
    LOCKED = 'locked',
    AVAILABLE = 'available',
    RESEARCHING = 'researching',
    COMPLETE = 'complete',
    PAUSED = 'paused',
    EMPTY = 'empty'
}

export enum TechEffectType {
    // Unlocks
    UNLOCK_UNIT = 'unlock_unit',
    UNLOCK_BUILDING = 'unlock_building',
    UNLOCK_ACTION = 'unlock_action',
    UNLOCK_POLICY = 'unlock_policy',
    UNLOCK_RESEARCH_SLOT = 'unlock_research_slot',

    // Modifiers
    MODIFIER_PERCENT = 'modifier_percent',
    MODIFIER_FLAT = 'modifier_flat',
    
    // Performance Targets
    RESEARCH_SPEED = 'research_speed',
    UNIT_STAT = 'unit_stat',
    BUILDING_OUTPUT = 'building_output',
    UPKEEP_MODIFIER = 'upkeep_modifier'
}

export enum SeasonScoreCategory {
    MILITARY = 'military',
    TERRITORY = 'territory',
    WEALTH = 'wealth',
    TRADE = 'trade',
    PRODUCTION = 'production',
    INFLUENCE = 'influence',
    ALLIANCE = 'alliance',
    DISRUPTION = 'disruption',
    INTEL = 'intel',
    STABILITY = 'stability',
    POPULATION = 'population'
}

export enum PrimaryEffectType {
    NONE = 'none',
    COMBAT = 'combat',
    ECONOMY = 'economy',
    STAT_SHIFT = 'stat_shift',
    EXTERNALITY_WEAPON = 'externality_weapon',
    INFORMATION_ASYMMETRY = 'information_asymmetry',
    COMMITMENT_TRAP = 'commitment_trap',
    CRISIS_MODIFIER = 'crisis_modifier'
}

export enum SecondaryEffectType {
    NONE = 'none',
    SABOTAGE = 'sabotage',
    BOOST = 'boost',
    HAPPINESS_DRAIN = 'happiness_drain'
}

export enum BurnType {
    NONE = 'none',
    INSTANT = 'instant',
    GRADUAL = 'gradual',
    PERMANENT_PRODUCTION_PENALTY = 'permanent_production_penalty'
}

export enum VisibilityModifierType {
    NONE = 'none',
    OBSCURE_TIER = 'obscure_tier',
    FALSIFY_DOMAIN = 'falsify_domain',
    DELAYED_REVEAL = 'delayed_reveal'
}

export enum Magnitude {
    LOW = 'low',
    VERY_LOW = 'very_low',
    MED = 'medium',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical',
    SEVERE = 'severe'
}

export enum Intent {
    AGGRESSION = 'aggression',
    DECEPTION = 'deception',
    CONTROL = 'control',
    LEVERAGE = 'leverage'
}

export type GenerationTag = string;

// --- INTERFACES ---

export interface TechEffect {
    type: TechEffectType | PrimaryEffectType | SecondaryEffectType;
    targetSystem?: string;  // e.g., 'fleets', 'colonies'
    modifierKey?: string;   // e.g., 'attack', 'extraction_rate'
    value?: number;
    duration?: number;      // 0 for permanent
    conditions?: string[];  // e.g., ['at_war']
    description?: string;
    magnitude?: Magnitude;  // Legacy support
    target?: string;        // Legacy support
    burnType?: BurnType;    // Legacy support
    modifier?: any;         // Legacy support
}

export interface Tech {
    id: string;
    name: string;
    tree: TechTreeType;
    tier: TechTier;
    branch?: string; // Internal ID for horizontal path (e.g., 'overwhelming_force')
    description: string;
    effects: TechEffect[];
    prerequisites: string[]; // specific Tech IDs
    researchCost: number; // base hours to research
    seasonScoreTags?: SeasonScoreCategory[];
    mutuallyExclusiveGroup?: string; // group ID for locks (e.g., 'military_t2_path')
    position?: { x: number; y: number };
    unlockFlags?: string[]; // hooks for backend mechanics
    
    // Optional/UI Metadata
    flavorText?: string;
    mechanicalEffect?: string; // Readable explicit effect description
    tags?: string[];
    aiTags?: string[];
    isHidden?: boolean;
    
    // Legacy / Specialized support
    visibilityModifier?: VisibilityModifierType;
    burnCost?: number | { type: BurnType; description: string };
    secondaryEffect?: any;
    primaryEffect?: any;
    intent?: Intent;
    generationTags?: GenerationTag[];
    domain?: Domain;
}

export interface ResearchSlot {
    slotId: string;
    techId: string | null; // Renamed from targetTechId for consistency
    startTime: number;
    progressHours: number;
    ticksCompleted: number;
    ticksRequired: number;
    status: 'researching' | 'complete' | 'paused' | 'empty';
    isBoosted?: boolean;
    boostValue?: number;
}

export interface PlayerTechState {
    factionId: string;
    unlockedTechIds: string[]; // Changed from Set to Array for easier persistence/serialization
    activeEffects: TechEffect[]; // Combined effects for fast lookup
    
    // Research Slots
    activeSlots: ResearchSlot[];
    maxSlots: number;
    
    // Global modifiers accumulated from techs
    globalModifiers: Record<string, number>;
    
    /** Accumulated points spent on research. */
    researchPoints: number;

    // HoI4 Doctrine Hard-Locks

    lockedTechIds: string[];
}

export interface GameStateContext {
    currentTime: number;
    factionId: string;
    // Contextual factors for AI evaluation
    warThreat: number; // 0-1
    economicStress: number; // 0-1
    warIntensity?: Magnitude;
    warIntensityValue?: number; // fallback for numeric logic
}

export interface PublicSignal {
    playerId: string;
    domain: TechTreeType;
    tier: TechTier;
    timestamp: number;
    isObscured: boolean;
    isFalsified: boolean;
}
