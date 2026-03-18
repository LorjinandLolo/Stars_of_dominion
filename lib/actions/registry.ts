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
    params: {
      fleetId: "id",
      destinationId: "id"
    },
    cost: {} // Movement cost is time, not immediate credits
  },
  MIL_BUILD_FLEET: {
    id: "MIL_BUILD_FLEET",
    category: "military",
    params: {
      planetId: "id",
      systemId: "id",
      factionId: "id"
    },
    cost: { credits: 1000, metals: 500 }
  },
  MIL_ATTACK_FLEET: {
    id: "MIL_ATTACK_FLEET",
    category: "military",
    params: {
      attackerId: "id",
      targetId: "id"
    },
    cost: { ammo: 10, manpower: 5 }
  },
  MIL_BOMBARD_PLANET: {
    id: "MIL_BOMBARD_PLANET",
    category: "military",
    params: {
      fleetId: "id",
      targetId: "id"
    },
    cost: { ammo: 50 }
  },
  MIL_INVASION_PLANET: {
    id: "MIL_INVASION_PLANET",
    category: "military",
    params: {
      fleetId: "id",
      targetId: "id"
    },
    cost: { ammo: 100, manpower: 500 }
  },
  MIL_ESTABLISH_GARRISON: {
    id: "MIL_ESTABLISH_GARRISON",
    category: "military",
    params: {
      targetId: "id",
      unitCount: "number"
    },
    cost: { credits: 200, manpower: 100 }
  },

  // --- Diplomacy Actions ---
  DIP_DECLARE_WAR: {
    id: "DIP_DECLARE_WAR",
    category: "diplomatic",
    params: {
      targetFactionId: "id"
    },
    cost: { influence: 50 }
  },
  DIP_OFFER_PEACE: {
    id: "DIP_OFFER_PEACE",
    category: "diplomatic",
    params: {
      targetFactionId: "id"
    },
    cost: { influence: 20 }
  },
  DIP_PROPOSE_TREATY: {
    id: "DIP_PROPOSE_TREATY",
    category: "diplomatic",
    params: {
      targetFactionId: "id",
      treatyType: "string"
    },
    cost: { influence: 30 }
  },
  DIP_DEMAND_TRIBUTE: {
    id: "DIP_DEMAND_TRIBUTE",
    category: "diplomatic",
    params: {
      targetFactionId: "id",
      amount: "number"
    },
    cost: { influence: 40 }
  },
  DIP_SEND_ENVOY: {
    id: "DIP_SEND_ENVOY",
    category: "diplomatic",
    params: {
      targetFactionId: "id"
    },
    cost: { credits: 100, influence: 10 }
  },

  // --- Espionage Actions ---
  ESP_ASSIGN_AGENT: {
    id: "ESP_ASSIGN_AGENT",
    category: "espionage",
    params: {
      agentId: "id",
      targetId: "id"
    },
    cost: { intel: 10 }
  },
  ESP_INFILTRATE_NETWORK: {
    id: "ESP_INFILTRATE_NETWORK",
    category: "espionage",
    params: {
      targetId: "id"
    },
    cost: { intel: 50, credits: 500 }
  },
  ESP_SABOTAGE_FACILITY: {
    id: "ESP_SABOTAGE_FACILITY",
    category: "espionage",
    params: {
      targetBuildingId: "id"
    },
    cost: { intel: 100, credits: 1000 }
  },
  ESP_STEAL_TECHNOLOGY: {
    id: "ESP_STEAL_TECHNOLOGY",
    category: "espionage",
    params: {
      targetFactionId: "id"
    },
    cost: { intel: 200 }
  },
  ESP_INCITE_UNREST: {
    id: "ESP_INCITE_UNREST",
    category: "espionage",
    params: {
      targetPlanetId: "id"
    },
    cost: { intel: 150, credits: 800 }
  },

  // --- Economic / Development Actions ---
  PLANET_CONSTRUCT_BUILDING: {
    id: "PLANET_CONSTRUCT_BUILDING",
    category: "economic",
    params: {
      planetId: "id",
      buildingType: "string"
    },
    cost: {} // Cost is calculated dynamically from BUILDING_DEFS
  },
  PLANET_UPGRADE_BUILDING: {
    id: "PLANET_UPGRADE_BUILDING",
    category: "economic",
    params: {
      buildingId: "id"
    },
    cost: {}
  },
  PLANET_REPAIR_BUILDING: {
    id: "PLANET_REPAIR_BUILDING",
    category: "economic",
    params: {
      buildingId: "id"
    },
    cost: {}
  },
  PLANET_DEMOLISH_BUILDING: {
    id: "PLANET_DEMOLISH_BUILDING",
    category: "economic",
    params: {
      buildingId: "id"
    },
    cost: {}
  },
  PLANET_RECRUIT_UNITS: {
    id: "PLANET_RECRUIT_UNITS",
    category: "economic",
    params: {
      planetId: "id",
      unitType: "string",
      count: "number"
    },
    cost: {}
  },

  // --- Other Actions ---
  TECH_START_RESEARCH: {
    id: "TECH_START_RESEARCH",
    category: "research",
    params: {
      techId: "id"
    },
    cost: { research: 100 }
  },
  IDEO_ENACT_POLICY: {
    id: "IDEO_ENACT_POLICY",
    category: "internal",
    params: {
      policyId: "id"
    },
    cost: { influence: 100 }
  },
  INTERNAL_PURGE_FACTION: {
    id: "INTERNAL_PURGE_FACTION",
    category: "internal",
    params: {
      subFactionId: "id"
    },
    cost: { credits: 2000, manpower: 50, happiness: -20 }
  }
};
