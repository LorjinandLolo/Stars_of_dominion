// lib/outposts/outpost-types.ts
// Stars of Dominion — an outpost's state (docs/outposts/README.md). Lives on
// the construction planet as `planet.outpost`; pure data, client-safe.

export type CellTerrain = 'flat' | 'ore' | 'ice' | 'vent' | 'rock' | 'ruin';

export type ModuleId =
    | 'hub' | 'habitat' | 'solar' | 'reactor' | 'geothermal' | 'life_support' | 'hydroponics'
    | 'mine' | 'warehouse' | 'dock' | 'commons' | 'medbay' | 'bunker'
    | 'cell_block' | 'test_lab' | 'sensor_mast' | 'fuel_depot'
    // Military base only (OutpostState.base):
    | 'barracks_module' | 'drydock' | 'battery' | 'command_post';

export type CharterId = 'settlement' | 'mining' | 'prison' | 'research' | 'listening' | 'depot';

export type OutpostTier = 1 | 2 | 3;

export interface OutpostCell {
    terrain: CellTerrain;
    module?: ModuleId;
    /** Shift index at which construction finishes; absent once built. */
    buildDoneShift?: number;
    /** Switched off by the player. */
    off?: boolean;
    /** Out of action until this shift (damage, scram, strike). */
    downUntilShift?: number;
    /** Being cleared (rock) until this shift. */
    clearingUntilShift?: number;
}

export interface CrisisOption {
    id: string;
    label: string;
    /** What it costs or risks, one line. */
    detail: string;
}

export interface OpenCrisis {
    id: string;
    kind: string;
    title: string;
    text: string;
    options: CrisisOption[];
    openedShift: number;
    deadlineShift: number;
    /** Answer taken at the deadline with no governor. */
    fallback: string;
    /** Answer taken at the deadline when the world has a governor. */
    steward: string;
    /** Cell the crisis is about, if any. */
    cell?: number;
}

/** What a colonist is good at, or bad at (lib/outposts/colonists.ts). */
export type ColonistTrait = 'medic' | 'engineer' | 'miner' | 'botanist' | 'veteran' | 'zealot' | 'drunk' | 'scholar';
export type ColonistStatus = 'well' | 'hurt' | 'sick' | 'away';

/** A named colonist. `state.colonists` stays the count the sim balances; the roster names them. */
export interface Colonist {
    id: string;
    name: string;
    trait: ColonistTrait;
    status: ColonistStatus;
    /** Shift the current status began. */
    sinceShift: number;
    arrivedShift: number;
}

/** A grave: who, when, how. */
export interface Grave { name: string; shift: number; how: string }

/**
 * A scar: what an answered crisis left behind (lib/outposts/crises.ts). It
 * changes the odds of the next crisis, opens follow-ups, and is cleared by
 * the answer that mends it, or by time.
 */
export type ScarKind = 'sealed_dome' | 'patched_reactor' | 'sullen_crews' | 'bad_blood' | 'broken_promise' | 'unburied';
export interface Scar {
    kind: ScarKind;
    sinceShift: number;
    untilShift: number;
    cell?: number;
    text: string;
}

/** Timed effects a crisis leaves behind. */
export interface OutpostEffect {
    kind: 'solar_down' | 'air_leak' | 'mines_down' | 'morale' | 'output_boost';
    untilShift: number;
    value: number;
}

export interface OutpostLogEntry {
    shift: number;
    text: string;
    tone: 'good' | 'bad' | 'neutral';
}

export interface OutpostState {
    version: 1;
    tier: OutpostTier;
    charter: CharterId;
    charterSetShift: number;
    /** 25 cells, row-major 5×5. */
    cells: OutpostCell[];
    colonists: number;
    food: number;
    air: number;
    morale: number;
    /** Specialty output waiting in the warehouse, by reserve key (METALS, ...). */
    warehouse: Record<string, number>;
    /** Shift counter and when the next one runs (sim seconds). */
    shift: number;
    nextShiftAt: number;
    crises: OpenCrisis[];
    effects: OutpostEffect[];
    log: OutpostLogEntry[];
    /** Prisoner groups held here (ids into the prisoner ledger). */
    prisonerGroupIds: string[];
    prisonLabour?: boolean;
    /** Earliest shift the next experiment may run. */
    experimentReadyShift: number;
    /** Set when the outpost became a colony: the grid freezes, functions keep running. */
    graduated?: boolean;
    /**
     * Set when the settlement grew into a military base instead of a colony:
     * it keeps its grid, its shifts and its crises, and unlocks the military
     * modules (barracks, drydock, battery, command post).
     */
    base?: boolean;
    /** Garrison troops the base's barracks have drilled so far (capped per barracks). */
    drilled?: number;
    /** Running totals for the panel. */
    stats: { shipped: Record<string, number>; experiments: number; deaths: number; crisesFaced: number };
    /** The people, by name (absent on outposts from before names; ensureRoster fills it). */
    roster?: Colonist[];
    /** Who died here. Newest last, capped. */
    graves?: Grave[];
    /** What past crises left behind. */
    scars?: Scar[];
    /** A crew off the grid (lib/outposts/expeditions.ts). */
    expedition?: { kind: 'ruin' | 'vent' | 'horizon'; crewIds: string[]; leftShift: number; returnShift: number; cell?: number };
}

/** One shift's flows, computed from the grid (outpost-sim.ts). */
export interface OutpostBalance {
    powerMade: number;
    powerUsed: number;
    airMade: number;
    airUsed: number;
    foodMade: number;
    foodUsed: number;
    housing: number;
    workersNeeded: number;
    workersFree: number;
    /** Cells whose module runs this shift. */
    running: number[];
    /** Cells that would run but lack workers or power. */
    idle: Array<{ cell: number; reason: 'workers' | 'power' }>;
    storage: number;
    prisonCapacity: number;
    /** Output per shift by reserve key. */
    output: Record<string, number>;
    moraleTarget: number;
}
