import { Faction } from '../../types/index';

// --- ENUMS (HoI4 Strategy Grammar) ---

export enum Domain {
    MILITARY = 'Military',
    ECONOMIC = 'Economic',
    DIPLOMATIC = 'Diplomatic',
    CULTURAL = 'Cultural'
}

export enum Tier {
    I = 1,
    II = 2,
    III = 3,
    IV = 4,
    V = 5,
    VI = 6
}

export enum TechEffectType {
    // Unlocks
    UNLOCK_UNIT = 'unlock_unit',
    UNLOCK_BUILDING = 'unlock_building',
    UNLOCK_ACTION = 'unlock_action',
    UNLOCK_POLICY = 'unlock_policy',
    UNLOCK_RESEARCH_SLOT = 'unlock_research_slot',
    UNLOCK_VICTORY_STEP = 'unlock_victory_step',

    // Modifiers
    MODIFIER_PERCENT = 'modifier_percent',
    MODIFIER_FLAT = 'modifier_flat',
    
    // Specific Targets
    RESEARCH_SPEED = 'research_speed',
    UNIT_STAT = 'unit_stat',
    BUILDING_OUTPUT = 'building_output',
    UPKEEP_MODIFIER = 'upkeep_modifier',
    STRATEGIC_BONUS = 'strategic_bonus'
}

export enum Intent {
    AGGRESSION = 'AGGRESSION',
    DECEPTION = 'DECEPTION',
    CONTROL = 'CONTROL',
    SACRIFICE = 'SACRIFICE',
    LEVERAGE = 'LEVERAGE',
    GROWTH = 'GROWTH',
    ASCENSION = 'ASCENSION'
}

export enum Magnitude {
    VERY_LOW = 'VERY_LOW',
    LOW = 'LOW',
    MED = 'MED',
    HIGH = 'HIGH',
    SEVERE = 'SEVERE'
}

export enum PrimaryEffectType {
    STAT_SHIFT = 'STAT_SHIFT',
    EXTERNALITY_WEAPON = 'EXTERNALITY_WEAPON',
    INFORMATION_ASYMMETRY = 'INFORMATION_ASYMMETRY',
    COMMITMENT_TRAP = 'COMMITMENT_TRAP',
    CRISIS_MODIFIER = 'CRISIS_MODIFIER'
}

export enum SecondaryEffectType {
    REVENUE_BOOST = 'REVENUE_BOOST',
    STABILITY_BUFFER = 'STABILITY_BUFFER',
    DIPLOMATIC_LEVERAGE = 'DIPLOMATIC_LEVERAGE',
    HAPPINESS_DRAIN = 'HAPPINESS_DRAIN'
}

export enum VisibilityModifierType {
    OBSCURE_TIER = 'OBSCURE_TIER',
    FALSE_SIGNAL = 'FALSE_SIGNAL',
    HIDDEN_EFFECT = 'HIDDEN_EFFECT',
    FALSIFY_DOMAIN = 'FALSIFY_DOMAIN',
    DELAYED_REVEAL = 'DELAYED_REVEAL'
}

export enum BurnType {
    PERMANENT_PRODUCTION_PENALTY = 'PERMANENT_PRODUCTION_PENALTY',
    TRUST_COLLAPSE = 'TRUST_COLLAPSE',
    RESOURCE_DRAIN = 'RESOURCE_DRAIN'
}

export enum GenerationTag {
    PROCEDURAL = 'PROCEDURAL',
    HISTORICAL = 'HISTORICAL',
    ALIENTECH = 'ALIENTECH'
}

export interface PublicSignal {
    playerId: string;
    domain?: Domain;
    tier: Tier;
    timestamp: number;
    isObscured: boolean;
    isFalsified: boolean;
}

// --- INTERFACES ---

export interface TechEffect {
    type: TechEffectType | PrimaryEffectType | SecondaryEffectType; // Superset for mixed versions
    target?: string; // Made optional for advanced/procedural effects
    value?: number;  // Made optional for advanced/procedural effects
    description?: string;
    modifier?: any; // For crisis modifiers
    magnitude?: Magnitude;
}

export interface Tech {
    id: string;
    name: string;
    description: string;
    flavorText?: string;
    branch?: Domain;
    domain?: Domain;
    subBranch?: string; // Grouping (e.g., 'Infantry', 'Industry')
    tier: Tier;
    
    // HoI4 Grid Layout
    position?: { x: number; y: number };
    
    researchCost: number; // base hours to research
    prerequisites: string[]; // specific Tech IDs
    mutuallyExclusiveWith?: string[]; // specific Tech IDs
    
    effects: TechEffect[];
    
    tags: string[];
    aiTags: string[];
    
    isRepeatable?: boolean;
    isHidden?: boolean;

    // Procedural/Advanced properties
    intent?: Intent;
    primaryEffect?: { type: PrimaryEffectType, magnitude: Magnitude, modifier?: any };
    secondaryEffect?: { type: SecondaryEffectType, magnitude: Magnitude };
    visibilityModifier?: VisibilityModifierType;
    burnCost?: { type: BurnType, description: string };
    generationTags?: string[];
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
