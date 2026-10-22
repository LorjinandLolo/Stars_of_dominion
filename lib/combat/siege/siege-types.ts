/**
 * lib/combat/ground-combat-types.ts
 * 
 * Advanced Ground Combat & Siege Resolution Models.
 * Transitions from simple HP-based attrition to a multi-layered tactical simulation
 * with unit composition, morale/supply dynamics, and stance-based cycles.
 */

export type GroundUnitType =
  | 'INFANTRY'
  | 'ARMOR'
  | 'ANTI_ARMOR'
  | 'AIRBORNE'
  | 'ARTILLERY'
  | 'SPECIAL_OPS'
  | 'MILITIA'
  /**
   * Infernoid war-titan. A `strength` of 3 means three machines, not three men —
   * every other member of this union counts soldiers.
   *
   * Widening this union is load-bearing in a way the compiler only half covers.
   * Five `Record<GroundUnitType, …>` tables break the build and get fixed. The
   * dangerous ones are the plain arrays that iterate unit types: a type missing
   * from the casualty order in district-battle.ts takes LITERALLY ZERO
   * casualties, silently, forever. Same shape at siege-engine.ts:178 and :203.
   * Every one of those has been updated with this member; check them again
   * before adding a ninth.
   */
  | 'ELDER_INFERNOID';

export type UnitComposition = Record<GroundUnitType, number>;

export type SiegePhase = 'LANDING' | 'ACTIVE_SIEGE' | 'OCCUPATION' | 'RESOLVED';

export type TacticalStanceId = 'AGGRESSIVE_ASSAULT' | 'DEFENSIVE_HOLD' | 'MANEUVER_AMBUSH';

export interface RecruitmentJob {
    id: string;
    factionId: string;
    planetId: string;
    unitType: GroundUnitType;
    count: number;
    startedAt: number;     // Unix seconds
    completesAt: number;   // Unix seconds
    progress: number;      // 0–100
}

export interface PlanetaryDefenseState {
    planetId: string;
    ownerEmpireId: string;
    garrisonTroops: number;
    unitComposition: UnitComposition;
    fortificationLevel: number; // 0-10 summary
    fortificationLayers: {
        orbitalSuppressed: boolean;
        outerDefenses: number; // 0-100
        innerDefenses: number; // 0-100
        commandBunkers: number; // 0-100
    };
    supply: number;
    maxSupply: number;
    morale: number;
    maxMorale: number;
    cohesion: number;
    maxCohesion: number;
    resistance: number; // 0-100 civilian resistance
    stability: number;  // Planet stability
    infrastructureIntegrity: number; // 0-100
    activeDefenderTactic?: TacticalStanceId;
    defenderPrediction?: TacticalStanceId;
    defenderCommandProfile?: string; // Linked leader ID or archetype
    militiaAvailable: boolean;
    occupationProgress: number;
    isUnderSiege: boolean;
    siegeId?: string;
    /** Consecutive cycles the invader has held the orbit over this world. */
    blockadedCycles?: number;
    /** Militia raised from the population during this siege (levy cap). */
    leviedTotal?: number;
}

export interface InvadingForceState {
    siegeId: string;
    attackerEmpireId: string;
    sourceFleetIds: string[];
    totalLandedTroops: number;
    reserveTroops: number;
    unitComposition: UnitComposition;
    supply: number;
    maxSupply: number;
    morale: number;
    maxMorale: number;
    cohesion: number;
    maxCohesion: number;
    orbitalSupportPower: number; // Fleet power in orbit contributing to bombardment
    activeAttackerTactic?: TacticalStanceId;
    attackerPrediction?: TacticalStanceId;
    attackerCommandProfile?: string;
    retreatRequested: boolean;
    reinforcementQueue: { unitType: GroundUnitType; count: number; arrivalTick: number }[];
    occupationControl: number; // Current grip on the planet (0-100)
    devastationCaused: number; // Collateral damage tracker
    /** Consecutive cycles the invader has been without the orbit. */
    cutOffCycles?: number;
}

/**
 * Who holds a surface district during an invasion. The key is the district's
 * sectorIndex (0-63) on the planet's Voronoi board, so the world the player
 * developed in peacetime IS the battlefield.
 */
export type DistrictController = 'attacker' | 'defender';

export interface DistrictWarState {
    /** sectorIndex -> current holder. Absent entries are defender-held. */
    control: Record<number, DistrictController>;
    /** Districts the invasion came down on — the beachhead. */
    landingZones: number[];
    /**
     * Contested districts this cycle: defender-held ground adjacent to the
     * attacker's line, where the fighting is actually happening.
     */
    contested: number[];
    /** Per-district dug-in value 0-100, raised by fortifications/terrain. */
    entrenchment: Record<number, number>;
    /**
     * The pieces on the board. Present once a siege uses positional warfare;
     * absent on legacy sieges, which fall back to the abstract front swing.
     */
    formations?: import('./formations').Formation[];
    /** Standing battle plans — front lines to hold, offensives to launch. */
    plans?: import('./battle-plans').BattlePlan[];
    /**
     * The districts worth holding — capital, chokepoints, defensive and
     * military buildings — with who holds each. Recomputed every cycle by
     * the worker from the surface and the planet's tiles; the client reads
     * it from the snapshot. See strongpoints.ts.
     */
    strongpoints?: import('./strongpoints').Strongpoint[];
    /** Consecutive cycles the attacker has held each strongpoint district (sappers). */
    strongpointHeldCycles?: Record<number, number>;
    /** 0-100 bombardment wear on a shield district; at 100 the generator is ruined. */
    strongpointDamage?: Record<number, number>;
    /** Consecutive cycles the invader has held the capital district (CAPITAL_FALL_CYCLES ends the war). */
    capitalHeldCycles?: number;
    /**
     * Defender supply sources (the capital core, manned strongpoints) by
     * consecutive cycles fully ringed by the invader. At
     * ENCIRCLE_STARVE_CYCLES a source stops feeding anyone (updateSupply).
     */
    sourceEncircled?: Record<number, number>;
    /**
     * The defender has given no orders yet: the worker runs the default
     * defence doctrine (defence-doctrine.ts) every cycle. Cleared by the
     * defending player's first formation or plan order.
     */
    defenderAuto?: boolean;
}

export interface GroundSiegeState {
    siegeId: string;
    planetId: string;
    attackerEmpireId: string;
    defenderEmpireId: string;
    /**
     * A field battle on a world nobody owns (lib/combat/siege/contested-ground.ts):
     * the defender is whoever held the ground first, and winning takes the
     * field, not the planet.
     */
    contested?: boolean;
    phase: SiegePhase;
    tickCount: number;
    cycleCount: number;
    cycleLengthTicks: number; // e.g. 4
    currentFrontage: number;
    maxFrontage: number;
    /** The ground war laid out on the 64-district surface board. */
    districts?: DistrictWarState;
    attackerState: InvadingForceState;
    defenderState: PlanetaryDefenseState;
    /**
     * How each side's stance read went in the LAST resolved cycle. A read is a
     * one-shot guess at the enemy's posture: right, and that side fights
     * above weight for the cycle; wrong, below it; none, neither. Set by the
     * engine when the cycle resolves, consumed by the district battles.
     */
    reads?: Record<'attacker' | 'defender', 'hit' | 'miss' | null>;
    /**
     * Who holds the sky this tick, recomputed by the worker from the fleets
     * actually in the system. Decides supply, landings and bombardment.
     */
    orbit?: import('./orbit-state').OrbitState;
    /**
     * Orbital fire that landed on the board last tick — men killed and
     * districts whose entrenchment was flattened. Zero when nothing is in
     * orbit. Display only; the damage is already applied.
     */
    bombardment?: { killed: number; districts: number; power: number };
    battleLog: Array<{
        cycle: number;
        message: string;
        attackerStance?: TacticalStanceId;
        defenderStance?: TacticalStanceId;
        attackerLosses?: number;
        defenderLosses?: number;
        event?: string;
    }>;
    lastResolvedCycle: number;
    winner?: string;
    endReason?: 'OCCUPATION' | 'ATTACKER_COLLAPSE' | 'RETREAT' | 'DEFENDER_REINFORCED';
}

/**
 * Triggered when Local Systemic Unrest hits 100%, causing a violent breakaway.
 */
export interface SecessionEvent {
    id: string;
    systemId: string;
    originalOwnerId: string;
    newRebelFactionId: string;
    foreignSponsors: string[];
    spawnedGarrisonStrength: number;
}

/**
 * Basic defensive structure for a breakaway faction.
 */
export interface PlanetaryGarrison {
    troops: number;
    fortificationLevel: number;
    supplyRemaining: number;
}
