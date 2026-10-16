// lib/outposts/outpost-catalog.ts
// Stars of Dominion — outpost modules, charters and growth tiers
// (docs/outposts/README.md). Pure and client-safe.

import type { CellTerrain, CharterId, ModuleId, OutpostTier } from './outpost-types';
import { SIM_SECONDS_PER_REAL_SECOND } from '../time/time-config';

/** One shift: 5 real minutes. */
export const SHIFT_SIM_SECONDS = 5 * 60 * SIM_SECONDS_PER_REAL_SECOND;
export const GRID_SIZE = 5;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
/** Colonists per unit of air and of food each shift. */
export const COLONISTS_PER_UNIT = 4;
export const AIR_RESERVE_MAX = 12;
export const START_COLONISTS = 3;
export const START_FOOD = 12;
export const MAX_OPEN_CRISES = 2;
export const CRISIS_DEADLINE_SHIFTS = 2;
export const LOG_KEEP = 30;
/** Rock is cleared before anything stands on it. */
export const CLEAR_ROCK_COST: Record<string, number> = { METALS: 200 };
export const CLEAR_ROCK_SHIFTS = 1;
/** Food bought from the empire. Twice the price without a dock. */
export const SUPPLY_DROP = { food: 15, cost: { CREDITS: 250 } as Record<string, number> };
/** Charter function bonus, and how long a charter must stand before it changes. */
export const CHARTER_BONUS = 1.5;
export const CHARTER_LOCK_SHIFTS = 4;
/** Test lab: share of the current project's cost one experiment adds, and accident odds. */
export const EXPERIMENT_SHARE = 0.05;
export const EXPERIMENT_MIN_HOURS = 1;
export const EXPERIMENT_COOLDOWN_SHIFTS = 2;
export const EXPERIMENT_ACCIDENT_CHANCE = 0.12;
/** Prisoners as test subjects: gain multiplier and the share who die. */
export const SUBJECT_GAIN = 2;
export const SUBJECT_DEATH_SHARE = 0.1;
/** Prison labour: metals per prisoner per shift into the warehouse. */
export const PRISON_LABOUR_METALS = 0.5;
/** Fuel depot: strength repaired per shift for own fleets parked in the system. */
export const DEPOT_REPAIR_PER_SHIFT = 0.02;

export interface ModuleDef {
    id: ModuleId;
    name: string;
    blurb: string;
    cost: Record<string, number>;
    buildShifts: number;
    workers: number;
    /** Positive makes power, negative draws it. */
    power: number;
    air?: number;
    food?: number;
    housing?: number;
    storage?: number;
    prison?: number;
    /** Terrain it can stand on; default flat only. */
    terrain?: CellTerrain[];
    minTier?: OutpostTier;
    /** Staffing order: lower runs first when workers or power are short. */
    priority: number;
    /** Not buildable (the hub comes with the outpost). */
    fixed?: boolean;
    /** Only a military base can build it. */
    baseOnly?: boolean;
}

const FLAT: CellTerrain[] = ['flat'];

export const MODULES: Record<ModuleId, ModuleDef> = {
    hub: { id: 'hub', name: 'Landing Hub', blurb: 'Where it all started: bunks, a small reactor and a scrubber.', cost: {}, buildShifts: 0, workers: 0, power: 2, air: 2, housing: 4, priority: 0, fixed: true },
    life_support: { id: 'life_support', name: 'Life Support', blurb: 'Scrubbers and oxygen crackers. +1 air beside ice.', cost: { CREDITS: 500, METALS: 250 }, buildShifts: 1, workers: 1, power: -1, air: 4, priority: 1 },
    solar: { id: 'solar', name: 'Solar Array', blurb: 'Cheap power. Storms choke it.', cost: { CREDITS: 300, METALS: 150 }, buildShifts: 1, workers: 0, power: 3, terrain: ['flat', 'ice'], priority: 2 },
    geothermal: { id: 'geothermal', name: 'Geothermal Tap', blurb: 'Steady power from a vent.', cost: { CREDITS: 600, METALS: 300 }, buildShifts: 1, workers: 1, power: 5, terrain: ['vent'], priority: 2 },
    reactor: { id: 'reactor', name: 'Fission Reactor', blurb: 'A lot of power, and a lot that can go wrong.', cost: { CREDITS: 1200, METALS: 600 }, buildShifts: 2, workers: 1, power: 7, priority: 2, minTier: 2 },
    hydroponics: { id: 'hydroponics', name: 'Hydroponics', blurb: 'Food, and a little air.', cost: { CREDITS: 400, METALS: 200 }, buildShifts: 1, workers: 1, power: -1, food: 3, air: 1, priority: 3 },
    habitat: { id: 'habitat', name: 'Habitat Dome', blurb: 'Room for four more colonists. Stands on flat ground, ore or ice.', cost: { CREDITS: 400, METALS: 200 }, buildShifts: 1, workers: 0, power: -1, housing: 4, terrain: ['flat', 'ore', 'ice'], priority: 4 },
    medbay: { id: 'medbay', name: 'Medbay', blurb: 'Sickness is milder; one more arrival a shift when there is room.', cost: { CREDITS: 700, METALS: 300 }, buildShifts: 1, workers: 1, power: -1, priority: 5 },
    commons: { id: 'commons', name: 'Commons', blurb: 'Canteen, chapel and bar. Morale.', cost: { CREDITS: 500, METALS: 200 }, buildShifts: 1, workers: 1, power: -1, priority: 6 },
    mine: { id: 'mine', name: 'Extractor', blurb: 'Digs what the ground holds: ore, ice or vent gas. Needs a warehouse.', cost: { CREDITS: 600, METALS: 300 }, buildShifts: 1, workers: 2, power: -1, terrain: ['ore', 'ice', 'vent'], priority: 7 },
    warehouse: { id: 'warehouse', name: 'Warehouse', blurb: 'Holds output until the cycle’s shipment to your reserves.', cost: { CREDITS: 500, METALS: 400 }, buildShifts: 1, workers: 0, power: 0, storage: 400, priority: 8 },
    dock: { id: 'dock', name: 'Landing Dock', blurb: 'Supply drops at half price, faster arrivals, and prisoner transports.', cost: { CREDITS: 800, METALS: 400 }, buildShifts: 1, workers: 1, power: -1, priority: 8 },
    bunker: { id: 'bunker', name: 'Bunker', blurb: 'Shelter. Meteors and raiders find nothing to hit.', cost: { CREDITS: 800, METALS: 700 }, buildShifts: 1, workers: 0, power: 0, terrain: ['flat', 'rock'], priority: 9 },
    cell_block: { id: 'cell_block', name: 'Cell Block', blurb: 'Holds 40 prisoners. Needs wardens.', cost: { CREDITS: 900, METALS: 600 }, buildShifts: 2, workers: 2, power: -1, prison: 40, priority: 10 },
    test_lab: { id: 'test_lab', name: 'Test Lab', blurb: 'Experiments that push your current research, at a risk.', cost: { CREDITS: 1500, METALS: 500 }, buildShifts: 2, workers: 2, power: -2, terrain: ['flat', 'ruin'], priority: 11 },
    sensor_mast: { id: 'sensor_mast', name: 'Sensor Mast', blurb: 'Shows fleets in this system and one jump out.', cost: { CREDITS: 700, METALS: 300 }, buildShifts: 1, workers: 1, power: -1, priority: 12 },
    fuel_depot: { id: 'fuel_depot', name: 'Fuel Depot', blurb: 'Your fleets parked here resupply and slowly repair.', cost: { CREDITS: 900, METALS: 500 }, buildShifts: 1, workers: 1, power: 0, priority: 13 },
    barracks_module: { id: 'barracks_module', name: 'Barracks', blurb: `Drills a garrison: +${5} infantry a shift, up to ${150} per barracks. Not while besieged.`, cost: { CREDITS: 1200, METALS: 800 }, buildShifts: 2, workers: 3, power: -1, priority: 14, baseOnly: true },
    drydock: { id: 'drydock', name: 'Drydock', blurb: 'Lays down warships here: one drydock builds corvettes and destroyers, two build cruisers.', cost: { CREDITS: 2500, METALS: 1500 }, buildShifts: 3, workers: 3, power: -2, priority: 15, baseOnly: true },
    battery: { id: 'battery', name: 'Defence Battery', blurb: 'Guns dug into the rock: the defenders dig in deeper (+3 fortification each).', cost: { CREDITS: 1500, METALS: 1200 }, buildShifts: 2, workers: 2, power: -1, terrain: ['flat', 'rock'], priority: 16, baseOnly: true },
    command_post: { id: 'command_post', name: 'Command Post', blurb: 'Sees two jumps out and steadies the crew (+5 morale).', cost: { CREDITS: 1800, METALS: 700 }, buildShifts: 2, workers: 2, power: -1, priority: 17, baseOnly: true },
};

export const BUILDABLE_MODULES: ModuleId[] = (Object.keys(MODULES) as ModuleId[]).filter(id => !MODULES[id].fixed);

export function terrainOk(id: ModuleId, terrain: CellTerrain): boolean {
    return (MODULES[id].terrain ?? FLAT).includes(terrain);
}

/** What an extractor yields per shift on each terrain, by reserve key. */
export function mineYield(terrain: CellTerrain, rareWorld: boolean): Record<string, number> {
    if (terrain === 'ore') return rareWorld ? { METALS: 30, RARES: 6 } : { METALS: 40 };
    if (terrain === 'ice') return { CHEMICALS: 30 };
    if (terrain === 'vent') return { ENERGY: 40 };
    return {};
}

export interface CharterDef {
    id: CharterId;
    name: string;
    blurb: string;
    /** The module whose function the charter boosts. */
    boosts?: ModuleId;
}

export const CHARTERS: Record<CharterId, CharterDef> = {
    settlement: { id: 'settlement', name: 'Settlement', blurb: 'Grow. Colonists arrive faster and morale runs higher.' },
    mining: { id: 'mining', name: 'Mining Concern', blurb: 'Extractors yield half again as much.', boosts: 'mine' },
    prison: { id: 'prison', name: 'Penal Colony', blurb: 'Cell blocks hold half again as many; prison labour yields more.', boosts: 'cell_block' },
    research: { id: 'research', name: 'Proving Ground', blurb: 'Experiments gain half again as much.', boosts: 'test_lab' },
    listening: { id: 'listening', name: 'Listening Post', blurb: 'Sensor masts see two jumps out.', boosts: 'sensor_mast' },
    depot: { id: 'depot', name: 'Fleet Depot', blurb: 'Fuel depots repair twice as fast.', boosts: 'fuel_depot' },
};

export const CHARTER_IDS = Object.keys(CHARTERS) as CharterId[];

export interface TierDef {
    tier: OutpostTier;
    name: string;
    /** Requirements to advance FROM this tier. */
    next?: { colonists: number; morale: number; modules: ModuleId[]; cost: Record<string, number> };
}

export const TIERS: Record<OutpostTier, TierDef> = {
    1: { tier: 1, name: 'Outpost', next: { colonists: 10, morale: 50, modules: ['habitat', 'life_support', 'hydroponics'], cost: { CREDITS: 3000 } } },
    2: { tier: 2, name: 'Settlement', next: { colonists: 30, morale: 60, modules: ['dock', 'warehouse'], cost: { CREDITS: 10000 } } },
    3: { tier: 3, name: 'Colony' },
};

/**
 * The other way out of a settlement: a military base. Keeps the grid and the
 * shifts, unlocks the military modules. Checked against tier 2 like the colony.
 */
export const BASE_REQUIREMENTS = { colonists: 15, morale: 50, modules: ['bunker', 'dock'] as ModuleId[], cost: { CREDITS: 8000 } as Record<string, number> };
/** Garrison drilled per barracks per shift, and the most one barracks keeps. */
export const BARRACKS_TROOPS_PER_SHIFT = 5;
export const BARRACKS_TROOP_CAP = 150;
/** Fortification from being a base, and from each battery (fortificationLevelFor). */
export const BASE_FORTIFICATION = 2;
export const BATTERY_FORTIFICATION = 3;
/** Shipyard tier from drydocks: one is tier 1, two or more tier 2. */
export function drydockYardTier(drydocks: number): number {
    return drydocks >= 2 ? 2 : drydocks >= 1 ? 1 : 0;
}

/** What to call where an outpost stands. */
export function tierName(state: { tier: OutpostTier; base?: boolean; graduated?: boolean }): string {
    if (state.base) return 'Military Base';
    if (state.graduated) return 'Colony';
    return TIERS[state.tier].name;
}


/** Cells open at a tier: the centre 3×3 at tier 1, all 25 after. */
export function cellOpen(index: number, tier: OutpostTier): boolean {
    if (tier >= 2) return true;
    const r = Math.floor(index / GRID_SIZE), c = index % GRID_SIZE;
    return r >= 1 && r <= 3 && c >= 1 && c <= 3;
}

export const CENTER_CELL = 12;

export function neighborsOf(index: number): number[] {
    const r = Math.floor(index / GRID_SIZE), c = index % GRID_SIZE;
    const out: number[] = [];
    if (r > 0) out.push(index - GRID_SIZE);
    if (r < GRID_SIZE - 1) out.push(index + GRID_SIZE);
    if (c > 0) out.push(index - 1);
    if (c < GRID_SIZE - 1) out.push(index + 1);
    return out;
}
