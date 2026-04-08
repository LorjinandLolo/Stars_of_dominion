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
  | 'MILITIA';

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
}

export interface GroundSiegeState {
    siegeId: string;
    planetId: string;
    attackerEmpireId: string;
    defenderEmpireId: string;
    phase: SiegePhase;
    tickCount: number;
    cycleCount: number;
    cycleLengthTicks: number; // e.g. 4
    currentFrontage: number;
    maxFrontage: number;
    attackerState: InvadingForceState;
    defenderState: PlanetaryDefenseState;
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
