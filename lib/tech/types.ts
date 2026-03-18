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

// --- INTERFACES ---

export interface TechEffect {
    type: TechEffectType;
    target: string; // e.g., 'metals_output', 'infantry_attack', 'global_research'
    value: number;
    description?: string;
}

export interface Tech {
    id: string;
    name: string;
    description: string;
    flavorText?: string;
    branch: Domain;
    subBranch?: string; // Grouping (e.g., 'Infantry', 'Industry')
    tier: Tier;
    
    // HoI4 Grid Layout
    position: { x: number; y: number };
    
    researchCost: number; // base hours to research
    prerequisites: string[]; // specific Tech IDs
    mutuallyExclusiveWith?: string[]; // specific Tech IDs
    
    effects: TechEffect[];
    
    tags: string[];
    aiTags: string[];
    
    isRepeatable?: boolean;
    isHidden?: boolean;
}

export interface ResearchSlot {
    slotId: string;
    targetTechId: string | null;
    startTime: number; // Unix seconds
    progressHours: number;
    isBoosted?: boolean;
    boostValue?: number;
}

export interface PlayerTechState {
    factionId: string;
    unlockedTechs: Set<string>;
    
    // Research Slots
    activeSlots: ResearchSlot[];
    maxSlots: number;
    
    // Global modifiers accumulated from techs
    globalModifiers: Record<string, number>;
    
    // HoI4 Doctrine Hard-Locks
    lockedTechs: Set<string>;
}

export interface GameStateContext {
    currentTime: number;
    factionId: string;
    // Contextual factors for AI evaluation
    warThreat: number; // 0-1
    economicStress: number; // 0-1
}
