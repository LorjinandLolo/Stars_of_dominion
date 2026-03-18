/**
 * lib/actions/types.ts
 * 
 * Formalizes all player-facing action types following the user specification.
 * This provides a unified schema for backend commands and UI actions.
 */

export type ResourceType =
  | "food"
  | "happiness"
  | "metals"
  | "chemicals"
  | "construction"
  | "research"
  | "ammo"
  | "manpower"
  | "credits"
  | "influence"
  | "intel";

export type TechCategory =
  | "military"
  | "economic"
  | "diplomatic"
  | "cultural"
  | "enlightenment"
  | "government"
  | "espionage"
  | "trade";

export type UnitDomain = "orbital" | "ground" | "civilian" | "covert";

export type UnitType =
  | "infantry" | "tanks" | "anti_tank" | "airborne" | "special_ops"
  | "fighter" | "bomber" | "corvette" | "frigate" | "destroyer"
  | "cruiser" | "battleship" | "carrier" | "dreadnought"
  | "colony_ship" | "science_vessel" | "trade_ship";

export type ActionCategory =
  | "military" | "diplomatic" | "espionage" | "economic" | "cultural"
  | "internal" | "crisis" | "research";

export type PlayerActionId =
  // Military
  | "MIL_MOVE_FLEET"
  | "MIL_BUILD_FLEET"
  | "MIL_ATTACK_FLEET"
  | "MIL_BOMBARD_PLANET"
  | "MIL_INVASION_PLANET"
  | "MIL_ESTABLISH_GARRISON"
  // Diplomacy
  | "DIP_DECLARE_WAR"
  | "DIP_OFFER_PEACE"
  | "DIP_PROPOSE_TREATY"
  | "DIP_DEMAND_TRIBUTE"
  | "DIP_SEND_ENVOY"
  // Espionage
  | "ESP_ASSIGN_AGENT"
  | "ESP_INFILTRATE_NETWORK"
  | "ESP_SABOTAGE_FACILITY"
  | "ESP_STEAL_TECHNOLOGY"
  | "ESP_INCITE_UNREST"
  // Economic / Development
  | "PLANET_CONSTRUCT_BUILDING"
  | "PLANET_UPGRADE_BUILDING"
  | "PLANET_REPAIR_BUILDING"
  | "PLANET_DEMOLISH_BUILDING"
  | "PLANET_RECRUIT_UNITS"
  // Other
  | "TECH_START_RESEARCH"
  | "IDEO_ENACT_POLICY"
  | "INTERNAL_PURGE_FACTION";

export interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface ActionSchema {
  id: PlayerActionId;
  category: ActionCategory;
  params: Record<string, "string" | "number" | "boolean" | "id">;
  cost: Partial<Record<ResourceType, number>>;
  requirements?: {
    techIds?: string[];
    buildingTypes?: string[];
    intelLevel?: number;
  };
}

export interface PlayerAction {
  id: string; // instance ID
  actionId: PlayerActionId;
  issuerId: string; // faction ID
  targetId?: string; // system, planet, fleet, or faction ID
  payload: Record<string, any>;
  timestamp: number;
}
