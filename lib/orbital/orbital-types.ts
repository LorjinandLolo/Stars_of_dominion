// lib/orbital/orbital-types.ts
// Phase 3 — Orbital infrastructure. Every developed world has a second layer
// above it: the structures too large, too dangerous, or too dependent on vacuum
// to sit on the surface. An invader has to break this layer before a single
// soldier lands.

import type { BuildingCost, BuildingUpkeep, BuildingEffect } from '../construction/construction-types';

export type OrbitalCategory =
    /** The hub every other structure hangs off. */
    | 'station'
    /** Shipbuilding and repair. */
    | 'shipyard'
    /** Weapons, shields and sensors in orbit. */
    | 'defense'
    /** Storage, routing and fleet staging. */
    | 'logistics'
    /** Vacuum-dependent laboratories. */
    | 'research';

export type OrbitalSlotState = 'empty' | 'under_construction' | 'active' | 'damaged' | 'destroyed';

export interface OrbitalStructureDefinition {
    id: string;
    name: string;
    description: string;
    category: OrbitalCategory;
    tier: number;
    cost: BuildingCost;
    upkeep: BuildingUpkeep;
    buildTimeSeconds: number;
    effects: BuildingEffect[];
    /** Structural hit points. Orbital combat chews through this before landing troops. */
    hullStrength: number;
    /**
     * True when this structure needs an active station in orbit first. A shipyard
     * without a station has nowhere to berth its crews.
     */
    requiresStation: boolean;
    /** Only one may exist in a planet's orbit. */
    uniquePerPlanet?: boolean;
    /** Structure this replaces in place, consuming its slot. */
    upgradesFrom?: string;
    /** Minimum planetary infrastructure to service it from the ground. */
    infrastructureRequired: number;
    techRequired?: string;
    tags: string[];
}

export interface OrbitalSlot {
    slotId: string;
    structureId: string | null;
    state: OrbitalSlotState;
    /** Sim-clock seconds; null unless under construction. */
    completesAt: number | null;
    /** 0–100. Effects scale linearly with it; 0 means destroyed. */
    integrity: number;
}

export interface OrbitalBuildOrder {
    orderId: string;
    structureId: string;
    slotId: string;
    planetId: string;
    startedAtSeconds: number;
    completesAtSeconds: number;
    /** True when this order replaces an existing structure rather than filling an empty slot. */
    isUpgrade: boolean;
    /** Structure that occupied the slot before an upgrade started, for rollback on cancel. */
    replacedStructureId?: string;
}

export interface OrbitalState {
    slots: OrbitalSlot[];
    buildQueue: OrbitalBuildOrder[];
    /**
     * True once the orbital layer has been beaten down far enough that landings
     * are unopposed. Set by orbital combat, cleared as structures are repaired.
     */
    orbitControlLost?: boolean;
}

/**
 * Everything the rest of the game reads off a planet's orbit, recomputed on demand.
 */
export interface OrbitalRatings {
    /** Combined weapons power of active orbital defenses. */
    defensePower: number;
    /** Shield strength soaking bombardment before hulls take damage. */
    shieldStrength: number;
    /** Sensor reach contributed to the movement layer. */
    sensorStrength: number;
    /** 0 = no shipyard. 1–3 gates progressively larger hull classes. */
    shipyardTier: number;
    /** Percentage bonus to ship construction speed. */
    shipProductionBonus: number;
    /** Reserve fleets that can be berthed here. */
    fleetCapacity: number;
    /** Fraction of fleet strength restored per hour while docked. */
    fleetRepairRate: number;
    /** Research added to the planet's output. */
    researchOutput: number;
    /** Haulage contributed to the planetary distribution network. */
    logisticsCapacity: number;
    /** Multiplier on trade throughput for routes touching this planet. */
    tradeEfficiency: number;
    /** Storage capacity contributed per storage class. */
    storageCapacity: Partial<Record<string, number>>;
    /** Warehouse handling contributed to planetary haulage. */
    storageThroughput: number;
    /** Active (non-destroyed) structures in orbit. */
    activeStructures: number;
    /** True while a station is standing — the prerequisite for everything else. */
    hasStation: boolean;
}

// ─── Effect type identifiers ──────────────────────────────────────────────────

export const ORBITAL_DEFENSE_EFFECT = 'orbital_defense_power';
export const ORBITAL_SHIELD_EFFECT = 'orbital_shield_strength';
export const ORBITAL_SENSOR_EFFECT = 'orbital_sensor_strength';
export const SHIPYARD_TIER_EFFECT = 'shipyard_tier';
export const FLEET_CAPACITY_EFFECT = 'fleet_capacity';
export const FLEET_REPAIR_EFFECT = 'fleet_repair_rate';
export const TRADE_EFFICIENCY_EFFECT = 'trade_efficiency';

// ─── Tuning constants ─────────────────────────────────────────────────────────

/** Orbital slots every world starts with. */
export const BASE_ORBITAL_SLOTS = 3;

/**
 * Extra slots unlocked by planetary infrastructure. Orbit is only as buildable
 * as the ground support beneath it.
 */
export const ORBITAL_SLOT_INFRA_THRESHOLDS = [3, 5];

/** Integrity below which a structure is reported as damaged rather than active. */
export const DAMAGED_INTEGRITY_THRESHOLD = 70;

/** Integrity at or below which a structure is destroyed outright. */
export const DESTROYED_INTEGRITY_THRESHOLD = 0;

/** Integrity restored per hour by repairs, once a planet is out of combat. */
export const REPAIR_INTEGRITY_PER_HOUR = 8;

/**
 * Fraction of defense power still needed to contest orbit. Below this share of
 * its intact rating, the layer is considered suppressed and landings proceed.
 */
export const ORBIT_CONTROL_THRESHOLD = 0.25;

/** Ship hull classes gated by shipyard tier. */
export const SHIPYARD_TIER_UNLOCKS: Record<number, string[]> = {
    0: [],
    1: ['corvette', 'frigate', 'sensor_relay', 'exploration_node', 'trade_fleet'],
    2: ['corvette', 'frigate', 'destroyer', 'sensor_relay', 'exploration_node', 'trade_fleet'],
    3: ['corvette', 'frigate', 'destroyer', 'cruiser', 'capital', 'sensor_relay', 'exploration_node', 'trade_fleet'],
};
