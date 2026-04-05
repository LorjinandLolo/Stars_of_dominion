/**
 * lib/actions/registry.ts
 * 
 * Central registry for all player-facing actions.
 * Contains schemas for validation, cost calculation, and UI rendering.
 */

import { ActionSchema, PlayerActionId } from './types';

export const ACTION_DEFINITIONS: Record<PlayerActionId, ActionSchema> = {
  // --- Military Actions ---
  MIL_MOVE_FLEET: {
    id: "MIL_MOVE_FLEET",
    category: "military",
    params: { fleetId: "id", destinationId: "id" },
    cost: {}
  },
  MIL_BUILD_FLEET: {
    id: "MIL_BUILD_FLEET",
    category: "military",
    params: { planetId: "id", systemId: "id" },
    cost: { credits: 1000, metals: 500 }
  },
  MIL_ATTACK_FLEET: {
    id: "MIL_ATTACK_FLEET",
    category: "military",
    params: { attackerFleetId: "id", defenderFleetId: "id" },
    cost: { ammo: 10, manpower: 5 }
  },
  MIL_BOMBARD_PLANET: {
    id: "MIL_BOMBARD_PLANET",
    category: "military",
    params: { fleetId: "id", targetId: "id" },
    cost: { ammo: 50 }
  },
  MIL_INVASION_PLANET: {
    id: "MIL_INVASION_PLANET",
    category: "military",
    params: { fleetId: "id", targetId: "id" },
    cost: { ammo: 100, manpower: 500 }
  },
  MIL_ORBIT_PLANET: {
    id: "MIL_ORBIT_PLANET",
    category: "military",
    params: { fleetId: "id", planetId: "id" },
    cost: {}
  },
  MIL_ESTABLISH_GARRISON: {
    id: "MIL_ESTABLISH_GARRISON",
    category: "military",
    params: { targetId: "id", unitCount: "number" },
    cost: { credits: 200, manpower: 100 }
  },
  MIL_COMBAT_STANCE: {
    id: "MIL_COMBAT_STANCE",
    category: "military",
    params: { combatId: "id", stance: "string" },
    cost: {}
  },
  MIL_COMBAT_DIRECTIVE: {
    id: "MIL_COMBAT_DIRECTIVE",
    category: "military",
    params: { combatId: "id", directive: "string" },
    cost: {}
  },
  MIL_MOVE_ARMY: {
    id: "MIL_MOVE_ARMY",
    category: "military",
    params: { armyId: "id", targetPlanetId: "id" },
    cost: { manpower: 10 }
  },
  MIL_EMBARK_ARMY: {
    id: "MIL_EMBARK_ARMY",
    category: "military",
    params: { armyId: "id", fleetId: "id" },
    cost: { credits: 50 }
  },
  MIL_DISEMBARK_ARMY: {
    id: "MIL_DISEMBARK_ARMY",
    category: "military",
    params: { armyId: "id", planetId: "id" },
    cost: { credits: 50 }
  },
  MIL_ESTABLISH_FORTIFICATION: {
    id: "MIL_ESTABLISH_FORTIFICATION",
    category: "military",
    params: { planetId: "id" },
    cost: { metals: 100, manpower: 200 }
  },

  // --- Diplomacy Actions ---
  DIP_DECLARE_WAR: {
    id: "DIP_DECLARE_WAR",
    category: "diplomatic",
    params: { targetFactionId: "id" },
    cost: { influence: 50 }
  },
  DIP_OFFER_PEACE: {
    id: "DIP_OFFER_PEACE",
    category: "diplomatic",
    params: { targetFactionId: "id" },
    cost: { influence: 20 }
  },
  DIP_PROPOSE_TREATY: {
    id: "DIP_PROPOSE_TREATY",
    category: "diplomatic",
    params: { targetFactionId: "id", treatyType: "string" },
    cost: { influence: 30 }
  },
  DIP_DEMAND_TRIBUTE: {
    id: "DIP_DEMAND_TRIBUTE",
    category: "diplomatic",
    params: { targetFactionId: "id", amount: "number" },
    cost: { influence: 40 }
  },
  DIP_SEND_ENVOY: {
    id: "DIP_SEND_ENVOY",
    category: "diplomatic",
    params: { targetFactionId: "id" },
    cost: { credits: 100, influence: 10 }
  },
  DIP_TRADE_PACT: {
    id: "DIP_TRADE_PACT",
    category: "diplomatic",
    params: { targetFactionId: "id", resource: "string", volume: "number" },
    cost: { influence: 15 }
  },

  // --- Espionage Actions ---
  ESP_ASSIGN_AGENT: {
    id: "ESP_ASSIGN_AGENT",
    category: "espionage",
    params: { agentId: "id", systemId: "id", domain: "string" },
    cost: { credits: 100 }
  },
  ESP_LAUNCH_OP: {
    id: "ESP_LAUNCH_OP",
    category: "espionage",
    params: { targetFactionId: "id", targetRegionId: "id", domain: "string", investment: "number" },
    cost: { credits: 500, intel: 50 }
  },
  ESP_INFILTRATE_NETWORK: {
    id: "ESP_INFILTRATE_NETWORK",
    category: "espionage",
    params: { targetId: "id" },
    cost: { intel: 50, credits: 500 }
  },
  ESP_SABOTAGE_FACILITY: {
    id: "ESP_SABOTAGE_FACILITY",
    category: "espionage",
    params: { targetBuildingId: "id" },
    cost: { intel: 100, credits: 1000 }
  },
  ESP_STEAL_TECHNOLOGY: {
    id: "ESP_STEAL_TECHNOLOGY",
    category: "espionage",
    params: { targetFactionId: "id" },
    cost: { intel: 200 }
  },
  ESP_INCITE_UNREST: {
    id: "ESP_INCITE_UNREST",
    category: "espionage",
    params: { targetPlanetId: "id" },
    cost: { intel: 150, credits: 800 }
  },

  // --- Economic Actions ---
  ECON_UPDATE_POLICY: {
    id: "ECON_UPDATE_POLICY",
    category: "economic",
    params: { factionId: "id" },
    cost: { influence: 50 }
  },
  ECON_SET_FOCUS: {
    id: "ECON_SET_FOCUS",
    category: "economic",
    params: { resource: "string" },
    cost: { influence: 10 }
  },
  ECON_ESTABLISH_ROUTE: {
    id: "ECON_ESTABLISH_ROUTE",
    category: "economic",
    params: { targetFactionId: "id", resource: "string", amount: "number" },
    cost: { credits: 200 }
  },
  ECON_ESTABLISH_COMPANY: {
    id: "ECON_ESTABLISH_COMPANY",
    category: "economic",
    params: { name: "string", sector: "string", planetId: "id" },
    cost: { credits: 5000, influence: 100 }
  },
  ECON_INVEST_COMPANY: {
    id: "ECON_INVEST_COMPANY",
    category: "economic",
    params: { companyId: "id", amount: "number" },
    cost: { credits: 1000 }
  },
  ECON_LIQUIDATE_COMPANY: {
    id: "ECON_LIQUIDATE_COMPANY",
    category: "economic",
    params: { companyId: "id" },
    cost: { influence: 50 }
  },
  ECON_GRANT_MONOPOLY: {
    id: "ECON_GRANT_MONOPOLY",
    category: "economic",
    params: { companyId: "id", resource: "string", systemId: "id" },
    cost: { influence: 100 }
  },
  ECON_ISSUE_SHARES: {
    id: "ECON_ISSUE_SHARES",
    category: "economic",
    params: { companyId: "id", shareCount: "number" },
    cost: {}
  },
  ECON_COMMAND_PRIVATEERS: {
    id: "ECON_COMMAND_PRIVATEERS",
    category: "economic",
    params: { companyId: "id" },
    cost: { credits: 1000 }
  },
  ECON_TAX_COLONIES: {
    id: "ECON_TAX_COLONIES",
    category: "economic",
    params: { companyId: "id" },
    cost: {}
  },

  // --- Economic / Development Actions ---
  PLANET_CONSTRUCT_BUILDING: {
    id: "PLANET_CONSTRUCT_BUILDING",
    category: "economic",
    params: { planetId: "id", buildingType: "string" },
    cost: {}
  },
  PLANET_UPGRADE_BUILDING: {
    id: "PLANET_UPGRADE_BUILDING",
    category: "economic",
    params: { buildingId: "id" },
    cost: {}
  },
  PLANET_REPAIR_BUILDING: {
    id: "PLANET_REPAIR_BUILDING",
    category: "economic",
    params: { buildingId: "id" },
    cost: {}
  },
  PLANET_DEMOLISH_BUILDING: {
    id: "PLANET_DEMOLISH_BUILDING",
    category: "economic",
    params: { buildingId: "id" },
    cost: {}
  },
  PLANET_RECRUIT_UNITS: {
    id: "PLANET_RECRUIT_UNITS",
    category: "economic",
    params: { planetId: "id", unitType: "string", count: "number" },
    cost: {}
  },

  // --- Other Actions ---
  TECH_START_RESEARCH: {
    id: "TECH_START_RESEARCH",
    category: "research",
    params: { techId: "id" },
    cost: {}
  },
  IDEO_ENACT_POLICY: {
    id: "IDEO_ENACT_POLICY",
    category: "internal",
    params: { policyId: "id" },
    cost: { influence: 50 }
  },
  INTERNAL_PURGE_FACTION: {
    id: "INTERNAL_PURGE_FACTION",
    category: "internal",
    params: { targetFactionId: "id" },
    cost: { influence: 100 }
  },
  LEADER_RECRUIT: {
    id: "LEADER_RECRUIT",
    category: "internal",
    params: { leaderId: "id" },
    cost: { credits: 500 }
  },
  LEADER_ASSIGN: {
    id: "LEADER_ASSIGN",
    category: "internal",
    params: { leaderId: "id", assignmentId: "id" },
    cost: {}
  },
  FACTION_JOIN: {
    id: "FACTION_JOIN",
    category: "internal",
    params: { name: "string" },
    cost: {}
  },
  PLANET_CLAIM: {
    id: "PLANET_CLAIM",
    category: "economic",
    params: { planetId: "id" },
    cost: { credits: 1000 }
  },
  DISCOURSE_POST_OPINION: {
    id: "DISCOURSE_POST_OPINION",
    category: "cultural",
    params: { content: "string", topic: "string" },
    cost: { influence: 20 }
  },
  DISCOURSE_VOTE_OPINION: {
    id: "DISCOURSE_VOTE_OPINION",
    category: "cultural",
    params: { opinionId: "id", support: "boolean" },
    cost: { influence: 5 }
  },
  DISCOURSE_CENSOR_OPINION: {
    id: "DISCOURSE_CENSOR_OPINION",
    category: "cultural",
    params: { opinionId: "id" },
    cost: { influence: 50 }
  }
};
