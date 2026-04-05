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
  | "MIL_ORBIT_PLANET"
  | "MIL_ESTABLISH_GARRISON"
  | "MIL_COMBAT_STANCE"
  | "MIL_COMBAT_DIRECTIVE"
  | "MIL_MOVE_ARMY"
  | "MIL_EMBARK_ARMY"
  | "MIL_DISEMBARK_ARMY"
  | "MIL_ESTABLISH_FORTIFICATION"
  | "MIL_LEAVE_SIEGE"
  | "MIL_SET_GROUND_TACTIC"
  | "MIL_SET_GROUND_PREDICTION"
  // Diplomacy
  | "DIP_DECLARE_WAR"
  | "DIP_OFFER_PEACE"
  | "DIP_PROPOSE_TREATY"
  | "DIP_DEMAND_TRIBUTE"
  | "DIP_SEND_ENVOY"
  | "DIP_TRADE_PACT"
  // Espionage
  | "ESP_ASSIGN_AGENT"
  | "ESP_LAUNCH_OP"
  | "ESP_INFILTRATE_NETWORK"
  | "ESP_SABOTAGE_FACILITY"
  | "ESP_STEAL_TECHNOLOGY"
  | "ESP_INCITE_UNREST"
  // Economic
  | "ECON_UPDATE_POLICY"
  | "ECON_SET_FOCUS"
  | "ECON_ESTABLISH_ROUTE"
  | "ECON_ESTABLISH_COMPANY"
  | "ECON_INVEST_COMPANY"
  | "ECON_LIQUIDATE_COMPANY"
  | "ECON_GRANT_MONOPOLY"
  | "ECON_ISSUE_SHARES"
  | "ECON_COMMAND_PRIVATEERS"
  | "ECON_TAX_COLONIES"
  // Economic / Development
  | "PLANET_CONSTRUCT_BUILDING"
  | "PLANET_UPGRADE_BUILDING"
  | "PLANET_REPAIR_BUILDING"
  | "PLANET_DEMOLISH_BUILDING"
  | "PLANET_RECRUIT_UNITS"
  // Other
  | "TECH_START_RESEARCH"
  | "IDEO_ENACT_POLICY"
  | "INTERNAL_PURGE_FACTION"
  | "LEADER_RECRUIT"
  | "LEADER_ASSIGN"
  | "FACTION_JOIN"
  | "PLANET_CLAIM"
  | "DISCOURSE_POST_OPINION"
  | "DISCOURSE_VOTE_OPINION"
  | "DISCOURSE_CENSOR_OPINION";

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
