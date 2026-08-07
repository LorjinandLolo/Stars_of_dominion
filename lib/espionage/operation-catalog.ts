/**
 * lib/espionage/operation-catalog.ts
 * Unified data-driven catalog of covert operations for Pillar 6 — Espionage.
 *
 * Consolidation Phase 1: this catalog is the single source of truth for
 * operation definitions, absorbed from lib/intelligence/operation-definitions.ts.
 * Categories are authoritative; the legacy 3-value OperationDomain is a derived
 * grouping (see domainForCategory) kept for agent traits and config bridging
 * until the domain-based resolution path is retired.
 */

import type { OperationDomain } from './espionage-types';

// ─── Definition types ─────────────────────────────────────────────────────────

export type OperationCategory =
  | "intel_gathering"
  | "sabotage"
  | "political"
  | "disinformation"
  | "economic"
  | "military_blackops"
  | "counter_intelligence";

export type OperationRisk = "low" | "medium" | "high" | "extreme";

export type TargetType =
  | "empire"
  | "system"
  | "planet"
  | "fleet"
  | "leader"
  | "faction"
  | "trade_route"
  | "building"
  | "research_project"
  | "alliance";

export interface OperationEffect {
  type: string;
  value: number;
  targetProperty?: string;
  durationSeconds?: number;
}

export interface OperationCrisisTrigger {
  type: string;
  severity: number;
  title: string;
  description: string;
}

export interface OperationCondition {
  type: string;
  threshold: number;
  comparison: "min" | "max" | "equal";
}

export interface OperationDefinition {
  id: string;
  name: string;
  category: OperationCategory;
  description: string;
  targetTypes: TargetType[];
  intelCost: number;
  creditsCost: number;
  durationHoursMin: number;
  durationHoursMax: number;
  baseSuccessChance: number;
  baseExposureChance: number;
  risk: OperationRisk;
  requiredTech?: string[];
  requiredAssets?: string[];
  requiredConditions?: OperationCondition[];
  effects: OperationEffect[];
  counterplayTags: string[];
  crisisTriggers?: OperationCrisisTrigger[];
}

// ─── Category → legacy domain bridge ──────────────────────────────────────────

/**
 * Map a category onto the legacy 3-value OperationDomain so existing
 * agent-trait bonuses and domain config keep working during consolidation.
 */
export function domainForCategory(category: OperationCategory): OperationDomain {
  switch (category) {
    case "sabotage":
    case "military_blackops":
      return "infrastructureSabotage";
    case "economic":
      return "shadowEconomy";
    case "intel_gathering":
    case "political":
    case "disinformation":
    case "counter_intelligence":
      return "politicalSubversion";
  }
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const OPERATION_CATALOG: OperationDefinition[] = [
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
  // ── Government-facing political warfare (Government Phase 5) ──────────────
  {
    id: "election_interference",
    name: "Election Interference",
    category: "political",
    description: "Fund opposition media, forge rolls and buy precincts ahead of a rival's vote.",
    targetTypes: ["empire", "faction"],
    intelCost: 60,
    creditsCost: 3000,
    durationHoursMin: 36,
    durationHoursMax: 72,
    baseSuccessChance: 0.5,
    baseExposureChance: 0.35,
    risk: "high",
    effects: [
      { type: "election_swing", value: 30 },
      { type: "approval_damage", value: 6 }
    ],
    counterplayTags: ["electoral_oversight", "counter_disinformation"]
  },
  {
    id: "blackmail_minister",
    name: "Blackmail a Minister",
    category: "political",
    description: "Acquire compromising material on a cabinet member and put them on a leash.",
    targetTypes: ["empire", "leader"],
    intelCost: 50,
    creditsCost: 2000,
    durationHoursMin: 24,
    durationHoursMax: 48,
    baseSuccessChance: 0.55,
    baseExposureChance: 0.3,
    risk: "high",
    effects: [
      { type: "minister_compromise", value: 30 }
    ],
    counterplayTags: ["loyalty_audit", "bodyguard_network"]
  },
  {
    id: "fund_coup",
    name: "Fund a Coup",
    category: "political",
    description: "Move money and guarantees to disaffected officers in a rival's general staff.",
    targetTypes: ["empire", "faction"],
    intelCost: 120,
    creditsCost: 8000,
    durationHoursMin: 48,
    durationHoursMax: 96,
    baseSuccessChance: 0.35,
    baseExposureChance: 0.55,
    risk: "extreme",
    effects: [
      { type: "coup_pressure", value: 25 },
      { type: "minister_compromise", value: 15 }
    ],
    counterplayTags: ["loyalty_audit", "officer_purge"]
  },
  {
    id: "assassinate_head_of_state",
    name: "Assassinate the Head of State",
    category: "political",
    description: "Remove a rival's leader outright. Nothing about this stays deniable for long.",
    targetTypes: ["empire", "leader"],
    intelCost: 200,
    creditsCost: 15000,
    durationHoursMin: 72,
    durationHoursMax: 120,
    baseSuccessChance: 0.2,
    baseExposureChance: 0.75,
    risk: "extreme",
    effects: [
      { type: "head_of_state_assassination", value: 1 },
      { type: "approval_damage", value: 10 }
    ],
    counterplayTags: ["bodyguard_network", "decoy_doubles", "counter_intelligence_sweep"]
  },
  // ── Exploiting a rival's collapse (Government Phase 6.5) ──────────────────
  {
    id: "fund_separatists",
    name: "Fund Separatists",
    category: "political",
    description: "Money and organisers for a rival's independence movement. Their frontier problem becomes their war.",
    targetTypes: ["empire", "system"],
    intelCost: 70,
    creditsCost: 5000,
    durationHoursMin: 36,
    durationHoursMax: 72,
    baseSuccessChance: 0.5,
    baseExposureChance: 0.4,
    risk: "high",
    effects: [
      { type: "separatist_funding", value: 12 }
    ],
    counterplayTags: ["loyalty_audit", "counter_disinformation", "border_security"]
  },
  {
    id: "smuggle_weapons",
    name: "Smuggle Weapons",
    category: "military_blackops",
    description: "Arm a region already in revolt. Turns a political crisis into one the garrison cannot simply walk into.",
    targetTypes: ["empire", "system"],
    intelCost: 90,
    creditsCost: 9000,
    durationHoursMin: 48,
    durationHoursMax: 96,
    baseSuccessChance: 0.45,
    baseExposureChance: 0.5,
    risk: "extreme",
    effects: [
      { type: "rebel_armament", value: 20 }
    ],
    counterplayTags: ["border_security", "anti_piracy_patrol", "counterintel_sweep"]
  },
  {
    id: "bribe_governor",
    name: "Bribe a Governor",
    category: "political",
    description: "Put a rival's planetary governor on a retainer. Cheaper than a fleet, and it works while you sleep.",
    targetTypes: ["empire", "planet", "leader"],
    intelCost: 45,
    creditsCost: 3500,
    durationHoursMin: 24,
    durationHoursMax: 48,
    baseSuccessChance: 0.55,
    baseExposureChance: 0.3,
    risk: "high",
    effects: [
      { type: "governor_corruption", value: 25 }
    ],
    counterplayTags: ["loyalty_audit", "forensic_intel"]
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

/** Fast lookup by definition id. */
export const OPERATION_CATALOG_BY_ID: ReadonlyMap<string, OperationDefinition> =
  new Map(OPERATION_CATALOG.map(def => [def.id, def]));
