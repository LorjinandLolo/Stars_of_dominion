// lib/civilization/types.ts

export type SpeciesType = 'Biological' | 'Hive' | 'Machine' | 'Energy' | 'Fungal';

export interface ModifierBundle {
  [key: string]: number; // Stat key to numeric bonus (multiplier or flat)
}

export interface AIBehaviorProfile {
  aggression: number; // 0-100
  deception: number; // 0-100
  tradeFocus: number; // 0-100
  expansionFocus: number; // 0-100
  techFocus: number; // 0-100
  loyaltyFocus: number; // 0-100
  riskTolerance: number; // 0-100
}

export interface CivilizationDefinition {
  id: string;
  name: string;
  shortDescription: string;
  lore: string;
  speciesType: SpeciesType;
  visualTheme: string;
  playstyleTags: string[];
  
  // Base stats and bonuses
  baseModifiers: ModifierBundle;
  
  // Starting state
  startingStateEffects: {
    startingResources: Record<string, number>;
    startingTechs: string[];
    startingUnits: string[];
    startingBuildings: string[];
    startingPopulationBias: string; // e.g., 'primary_only' or 'diverse'
  };
  
  // Biases for AI/Player guidance
  doctrineBiases: {
    military: string[];
    economic: string[];
    intelligence: string[];
    social: string[];
  };
  
  // Unique identifiers for other registries
  uniqueUnitIds: string[];
  uniqueBuildingIds: string[];
  uniqueActionIds: string[];
  
  eventTags: string[];
  aiBehaviorProfile: AIBehaviorProfile;
  weaknesses: string[];
  preferredVictories: ('Conquest' | 'Economic' | 'Diplomacy' | 'Enlightenment')[];
}

export interface IdeologyDefinition {
  id: string;
  name: string;
  description: string;
  modifiers: ModifierBundle;
  policyAccess: string[];
  doctrineBiases: string[];
  incompatibleCivilizations?: string[];
}
