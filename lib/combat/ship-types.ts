// lib/combat/ship-types.ts
//
// Ship design vocabulary. Everything here is shared by the designer UI, the
// recruitment path in the game loop, and the combat engine, so it must stay
// free of server-only imports.
//
// A ShipClassId is BOTH the hull a design is built on and the key the ship
// occupies in a fleet's `composition` (always lowercase — see
// normalizeComposition in ship-registry.ts for why that matters).

export type ShipClassId = 'corvette' | 'destroyer' | 'cruiser' | 'battleship';

export type HullSize = 'S' | 'M' | 'L' | 'XL';

export type SlotType = 'weapon' | 'utility' | 'core';

/** What a weapon module hits with. */
export type DamageType = 'energy' | 'kinetic' | 'explosive';
/** What a utility module protects with. */
export type DefenseType = 'shield' | 'armor' | 'evasion';
export type ProfileKey = DamageType | DefenseType;

/**
 * A design's rock-paper-scissors signature: how much of each damage and
 * defense type it carries, in "module-equivalents". Fleets accumulate the
 * per-ship profile of every ship they commission, and the combat engine
 * compares one side's attack mix against the other side's defense mix.
 */
export type DesignProfile = Record<ProfileKey, number>;

export interface HullSlot {
    id: string;
    type: SlotType;
}

export interface HullDefinition {
    id: ShipClassId;
    name: string;
    size: HullSize;
    description: string;
    slots: HullSlot[];
    /** Built-in reactor output. Modules draw against this plus the fitted core. */
    baseEnergy: number;
    /** Combat power of a bare hull — mirrors data/combat/ground-units.json. */
    basePower: number;
    baseCost: { credits: number; metals: number };
    /** Seconds to lay down a bare hull. */
    baseBuildTime: number;
}

export interface ComponentDefinition {
    id: string;
    name: string;
    type: SlotType;
    description: string;
    /** Fraction of the hull's basePower this module adds (0.10 = +10%). */
    powerMult: number;
    /** Energy drawn (> 0) or produced (< 0). */
    energy: number;
    profile?: Partial<DesignProfile>;
    cost: { credits: number; metals: number };
    /** Seconds added to the hull's build time. */
    buildTime: number;
    /** Tech id that must be unlocked before this module can be fitted. */
    techPrerequisite?: string;
}

export interface ShipDesign {
    id: string;
    /** Owning faction, or '*' for the standard patterns every faction can build. */
    factionId: string;
    name: string;
    hullId: ShipClassId;
    /** slotId -> componentId. Slots missing from the map are empty. */
    components: Record<string, string>;
    isDefault?: boolean;
    createdAt?: number;
    updatedAt?: number;
    /** Client-only: saved locally, not yet echoed back by the worker. */
    pending?: boolean;
}

/** Everything the UI shows and the worker charges, derived from one design. */
export interface DesignSummary {
    hullId: ShipClassId;
    /** Per-ship combat power that lands in fleet.basePower on completion. */
    power: number;
    /** Faction-reserve keys, ready for the worker's charge helper. */
    cost: { CREDITS: number; METALS: number };
    buildTime: number;
    energyProduced: number;
    energyDrawn: number;
    energyBalance: number;
    profile: DesignProfile;
    fitted: number;
    slots: number;
    /** Human-readable reasons the design cannot be built. Empty when valid. */
    issues: string[];
    /** Components whose tech prerequisite the faction has not researched. */
    lockedComponentIds: string[];
    valid: boolean;
}
