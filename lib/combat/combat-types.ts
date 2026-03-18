// lib/combat/combat-types.ts
// Combat Engine State & Type Definitions

export type CombatPhase = 'orbital' | 'ground';

export type OrbitalAllocation = 'bombardment' | 'interdiction' | 'defensive_orbit';
export type BombardmentMode = 'precision' | 'indiscriminate';

export type EngagementArchetype = 'aggressive' | 'defensive' | 'trickster';

export type PostBattleDirective = 'consolidate' | 'exploit' | 'pillage' | 'pursue' | 'orderly_retreat';

export type IntelLevel = 'blind' | 'observing' | 'infiltrated' | 'deep_penetration';

export type CombatStance = 'blitz' | 'entrench' | 'shock' | 'feint' | 'sabotage' | 'withdraw';

// ─── Unit Definitions ─────────────────────────────────────────────────────────

export type OrbitalUnitType = 'interceptor' | 'destroyer' | 'cruiser' | 'bomber' | 'carrier';
export type GroundUnitType = 'infantry' | 'armor' | 'anti_armor' | 'airborne' | 'artillery' | 'special_ops';

export type UnitType = OrbitalUnitType | GroundUnitType;

export type UnitComposition = Partial<Record<UnitType, number>>;

// ─── Intel & Visibility ───────────────────────────────────────────────────────

export type VisibilityLevel = 'size_only' | 'rough_archetype' | 'percentage_bands' | 'precise_ranges';

export interface VisibilityProfile {
    level: VisibilityLevel;
    estimatedBasePower: [number, number]; // [min, max]
    visibleArchetypes: string[]; // e.g., ["Armor-heavy"]
    compositionBands?: Partial<Record<UnitType, [number, number]>>; // Percentage or rough count bounds
}

// ─── Combat Entities ──────────────────────────────────────────────────────────

export interface TargetDetails {
    systemId: string;
    planetId?: string;
    terrainModifier: number;
    infrastructureIntegrity: number;
}

export interface CombatantState {
    factionId: string;
    role: 'attacker' | 'defender';
    baseForceCount: number;
    composition: UnitComposition;
    intelLevel: IntelLevel; // Intel the combatant has ON the enemy
    supply: number; // 0–1
    morale: number; // 0–1
    doctrine: EngagementArchetype; // Pre-battle

    // In-combat variables
    casualties: number;
    predictionPoints: number; // 0-3 (Doctrine, Archetype, Directive)
    currentStance?: CombatStance;
    currentDirective?: PostBattleDirective;
    selectedStance?: CombatStance; // Player's override for next round
    selectedDirective?: PostBattleDirective; // Player's override for post-battle
    orbitalAllocation?: OrbitalAllocation;
    bombardmentMode?: BombardmentMode;
}

// ─── Recruitment & Logistics ──────────────────────────────────────────────────

export interface RecruitmentJob {
    id: string;
    factionId: string;
    systemId: string;
    unitType: UnitType;
    count: number;
    supplyCost: number;
    completesAt: string; // ISO timestamp
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface OngoingEngagementRound {
    roundNumber: number; // 1 to 3
    attackerStance?: CombatStance;
    defenderStance?: CombatStance;
    attackerAllocation?: OrbitalAllocation;
    defenderAllocation?: OrbitalAllocation; // Typically only one side controls orbit
}

export interface CombatState {
    id: string;
    target: TargetDetails;
    phase: CombatPhase;
    round: number; // 1 to 3
    momentum: number; // -1 to 1 (negative = defender advantage, positive = attacker)
    territoryControl: number; // 0–1, ground phase only
    orbitalWinnerId?: string;
    attacker: CombatantState;
    defender: CombatantState;
    isSkirmish: boolean;
    annihilationEligible: boolean;
    resolved: boolean;
}

// ─── Narrative / Report ───────────────────────────────────────────────────────

export interface CombatRoundReport {
    round: number;
    phase: CombatPhase;
    attackerDamageDealt: number;
    defenderDamageDealt: number;
    momentumShift: number;
    supplyDecayAttacker: number;
    supplyDecayDefender: number;
    attackerPointsGained: number;
    defenderPointsGained: number;
    events: string[]; // Narrative event logs (e.g. "Attacker predicted defensive archetype")
}
