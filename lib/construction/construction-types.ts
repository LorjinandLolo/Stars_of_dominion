/**
 * lib/construction/construction-types.ts
 * Planetary Construction System - Core Models
 */

import { ResourceId } from '../../types/index';

export type PlanetType = 
  | "standard" 
  | "industrial" 
  | "agricultural" 
  | "fortress" 
  | "research" 
  | "moon" 
  | "megaplanet"
  | "capital"
  | "hive"

  | "prison"
  | "resort"
  | "tomb"
  | "ocean"
  | "arctic"
  | "desert";

export type DistrictType = "industrial" | "research" | "military" | "civilian" | "agricultural" | "any";
export type ConstructionState = "empty" | "under_construction" | "active" | "ruined";
export type BuildingCategory = "resource" | "industrial" | "military" | "research" | "society" | "defense" | "space";
export type BuildingType = string;

export type ShipType = "trade_fleet" | "corvette" | "frigate" | "destroyer" | "sensor_relay" | "exploration_node";

export interface SpaceBuildOrder {
  orderId: string;
  shipType: ShipType;
  planetId: string;
  systemId: string;
  startedAtSeconds: number;
  completesAtSeconds: number;
  cost: BuildingCost;
}

export interface BuildingEffect {
  type: string;
  value: number;
  target?: string;
}

export interface BuildingCost {
  metals: number;
  chemicals: number;
  food: number;
  manpower: number;
  credits: number; // Added for UI
  energy?: number;
  rares?: number; // Added for UI
}

export interface BuildingUpkeep {
  metals?: number;
  chemicals?: number;
  food?: number;
  manpower?: number;
  energy?: number;
}

export interface BuildingDefinition {
  id: string;
  name: string;
  description: string; // Added for UI
  category: BuildingCategory;
  tier: number;
  allowedDistricts: DistrictType[];
  infrastructureRequired: number;
  cost: BuildingCost;
  upkeep: BuildingUpkeep;
  buildTimeSeconds: number;
  effects: BuildingEffect[];
  tags: string[];
  uniquePerPlanet?: boolean;
  uniquePerEmpire?: boolean;
  tagRequirements?: string[];
  techRequired?: string;
}

export interface PlanetTile {
  tileId: string;
  districtType: DistrictType;
  buildingId: string | null;
  constructionState: ConstructionState;
  constructionCompleteAt: number | null; // Unix timestamp in seconds
}

export interface BuildOrder {
  orderId: string;
  buildingId: string;
  tileId: string;
  planetId: string; // Added for UI filtering
  startedAtSeconds: number;
  completesAtSeconds: number; // Changed to match UI
}

export interface Modifier {
  id: string;
  source: string;
  type: string;
  value: number;
  target?: string;
  expiresAt?: number;
}

export interface Planet {
  id: string;
  name: string;
  ownerId: string;
  systemId: string;
  planetType: PlanetType;
  infrastructureLevel: number; // 1 to 5
  stability: number; // 0 to 100
  happiness: number; // 0 to 100
  specialization: string | null;
  maxTiles: number;
  tiles: PlanetTile[];
  buildQueue: BuildOrder[];
  activeModifiers: Modifier[];
  tags: string[];
}

export interface PlanetStats {
  metalsOutput: number;
  chemicalsOutput: number;
  foodOutput: number;
  energyOutput: number;
  manpowerOutput: number;
  researchOutput: number;
  stability: number;
  happiness: number;
  defenseStrength: number;
  espionageResistance: number;
  constructionSpeedModifier: number;
  shipProductionModifier: number;
  troopRecruitmentModifier: number;
}

export interface PlacedBuilding {
  id: string;
  buildingId: string;
  type: string; // Alias for buildingId to satisfy UI
  tileId: string;
  planetId: string; // Added for UI filtering
  status: 'operational' | 'ruined' | 'under_construction'; // Map ConstructionState to UI expectations
}

export type ConstructionOrder = BuildOrder;

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_INFRASTRUCTURE_LEVEL = 5;

export interface ConstructionWorldState {
    /** All planets in the simulation. */
    planets: Map<string, Planet>;
    /** Active space construction orders. */
    spaceBuildQueue: SpaceBuildOrder[];
    /** Current game timestamp (Unix seconds). */
    nowSeconds: number;
}
