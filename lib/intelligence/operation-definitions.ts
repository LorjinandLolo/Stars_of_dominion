/**
 * lib/intelligence/operation-definitions.ts
 * Data-driven definitions for all covert operations.
 */

import { IntelligenceOperationDefinition } from './types';

export const OPERATION_DEFINITIONS: IntelligenceOperationDefinition[] = [
  {
    id: "infiltrate_government",
    name: "Infiltrate Government",
    category: "intel_gathering",
    description: "Plant sleepers in bureaucratic layers to reveal internal tensions and policies.",
    targetTypes: ["empire", "faction"],
    intelCost: 20,
    creditsCost: 500,
    durationHoursMin: 24,
    durationHoursMax: 48,
    baseSuccessChance: 0.7,
    baseExposureChance: 0.1,
    risk: "low",
    effects: [
      { type: "reveal_factions", value: 1 },
      { type: "reveal_policies", value: 1 },
      { type: "political_intel_bonus", value: 15 }
    ],
    counterplayTags: ["loyalty_audit", "security_reform"]
  },
  {
    id: "infiltrate_military",
    name: "Infiltrate Military",
    category: "intel_gathering",
    description: "Access encrypted command channels to track fleet movements and readiness.",
    targetTypes: ["empire", "fleet"],
    intelCost: 30,
    creditsCost: 800,
    durationHoursMin: 24,
    durationHoursMax: 72,
    baseSuccessChance: 0.6,
    baseExposureChance: 0.15,
    risk: "medium",
    effects: [
      { type: "reveal_fleets", value: 1 },
      { type: "combat_intel_debuff", value: 0.1 }
    ],
    counterplayTags: ["encryption_upgrade", "command_rotation"]
  },
  {
    id: "sabotage_shipyard",
    name: "Sabotage Shipyard",
    category: "sabotage",
    description: "Disable critical assembly cranes and calibration sensors.",
    targetTypes: ["building", "planet"],
    intelCost: 50,
    creditsCost: 1500,
    durationHoursMin: 12,
    durationHoursMax: 24,
    baseSuccessChance: 0.5,
    baseExposureChance: 0.3,
    risk: "high",
    effects: [
      { type: "disable_building", value: 1, durationSeconds: 43200 }, // 12h
      { type: "repair_cost_penalty", value: 0.2 }
    ],
    counterplayTags: ["hardened_infra", "engineering_corps"]
  },
  {
    id: "sabotage_ammo_plant",
    name: "Sabotage Ammo Plant",
    category: "sabotage",
    description: "Contaminate propellant vats to cause delivery delays and failures.",
    targetTypes: ["building", "planet"],
    intelCost: 40,
    creditsCost: 1200,
    durationHoursMin: 12,
    durationHoursMax: 36,
    baseSuccessChance: 0.55,
    baseExposureChance: 0.25,
    risk: "medium",
    effects: [
      { type: "ammo_shortage", value: 0.3, durationSeconds: 86400 } // 24h
    ],
    counterplayTags: ["hardened_infra"]
  },
  {
    id: "steal_research",
    name: "Technology Theft",
    category: "intel_gathering",
    description: "Siphon data from distributed research clusters.",
    targetTypes: ["empire", "research_project"],
    intelCost: 60,
    creditsCost: 2000,
    durationHoursMin: 48,
    durationHoursMax: 96,
    baseSuccessChance: 0.4,
    baseExposureChance: 0.2,
    risk: "high",
    effects: [
      { type: "research_boost", value: 20 },
      { type: "reveal_tech_path", value: 1 }
    ],
    counterplayTags: ["compartmentalized_research", "scientist_screening"]
  },
  {
    id: "disinformation_fake_fleet",
    name: "Fake Fleet Signature",
    category: "disinformation",
    description: "Ping enemy sensors with fabricated FTL signatures to panic defensive forces.",
    targetTypes: ["system", "empire"],
    intelCost: 25,
    creditsCost: 400,
    durationHoursMin: 4,
    durationHoursMax: 12,
    baseSuccessChance: 0.8,
    baseExposureChance: 0.05,
    risk: "low",
    effects: [
      { type: "fake_fleet_ghost", value: 1, durationSeconds: 21600 }
    ],
    counterplayTags: ["source_verification", "surveillance_scan"]
  },
  {
    id: "incite_rebellion",
    name: "Incite Rebellion",
    category: "political",
    description: "Broadcast radical propaganda and fund local insurgent cells.",
    targetTypes: ["planet", "faction"],
    intelCost: 80,
    creditsCost: 3000,
    durationHoursMin: 72,
    durationHoursMax: 144,
    baseSuccessChance: 0.35,
    baseExposureChance: 0.4,
    risk: "extreme",
    effects: [
      { type: "instability_increase", value: 30 },
      { type: "spawn_rebels", value: 1 }
    ],
    crisisTriggers: [
      { type: "local_insurgency", severity: 0.7, title: "Separatist Uprising", description: "Local cells have taken up arms against the state." }
    ],
    counterplayTags: ["martial_law", "welfare_reform"]
  },
  {
    id: "false_flag_border_raid",
    name: "False Flag Raid",
    category: "military_blackops",
    description: "Attack a border installation using another faction's transponder codes.",
    targetTypes: ["system", "building"],
    intelCost: 70,
    creditsCost: 2500,
    durationHoursMin: 6,
    durationHoursMax: 18,
    baseSuccessChance: 0.5,
    baseExposureChance: 0.5,
    risk: "extreme",
    effects: [
      { type: "diplomatic_tension", value: 40 },
      { type: "framed_faction_penalty", value: 1 }
    ],
    counterplayTags: ["forensic_intel", "intel_sharing"]
  },
  {
    id: "assassinate_governor",
    name: "Assassinate Governor",
    category: "political",
    description: "Eliminate a key administrative leader to cause local paralysis.",
    targetTypes: ["leader", "planet"],
    intelCost: 100,
    creditsCost: 5000,
    durationHoursMin: 48,
    durationHoursMax: 72,
    baseSuccessChance: 0.3,
    baseExposureChance: 0.6,
    risk: "extreme",
    effects: [
      { type: "leader_death", value: 1 },
      { type: "administrative_paralysis", value: 0.5, durationSeconds: 172800 } // 48h
    ],
    counterplayTags: ["bodyguard_network", "decoy_doubles"]
  },
  {
    id: "raid_trade_route",
    name: "Covert Piracy",
    category: "economic",
    description: "Deniable raids on merchant shipping within target claimed space.",
    targetTypes: ["trade_route", "system"],
    intelCost: 30,
    creditsCost: 600,
    durationHoursMin: 8,
    durationHoursMax: 24,
    baseSuccessChance: 0.65,
    baseExposureChance: 0.2,
    risk: "medium",
    effects: [
      { type: "resource_siphon", value: 0.2 },
      { type: "trade_efficiency_debuff", value: 0.15 }
    ],
    counterplayTags: ["escorts", "anti_piracy_patrol"]
  },
  {
    id: "manipulate_market",
    name: "Economic Sabotage",
    category: "economic",
    description: "Manipulate exchange rates and local trade quotas to induce panic.",
    targetTypes: ["empire", "trade_route"],
    intelCost: 50,
    creditsCost: 2000,
    durationHoursMin: 24,
    durationHoursMax: 48,
    baseSuccessChance: 0.5,
    baseExposureChance: 0.1,
    risk: "medium",
    effects: [
      { type: "inflation_spike", value: 0.1 },
      { type: "market_inefficiency", value: 0.25, durationSeconds: 86400 }
    ],
    counterplayTags: ["central_bank_audit", "rationing_protocol"]
  },
  {
    id: "counterintel_sweep",
    name: "Counter-Intel Sweep",
    category: "counter_intelligence",
    description: "Intensive internal auditing to discover and purge foreign assets.",
    targetTypes: ["empire", "system"],
    intelCost: 15,
    creditsCost: 300,
    durationHoursMin: 12,
    durationHoursMax: 24,
    baseSuccessChance: 0.75,
    baseExposureChance: 0.0,
    risk: "low",
    effects: [
      { type: "detect_cells", value: 1 },
      { type: "reduce_foreign_intel", value: 20 }
    ],
    counterplayTags: []
  }
];
