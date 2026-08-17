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
    
    // HOI4 Naval Engine Metrics
    hp: number;
    maxHp: number;
    baseForceCount: number;
    casualties: number;
    organization: number; 
    maxOrganization: number;
    screeningEfficiency: number; // 0 to 1, prevents torpedoes hitting capitals
    
    composition: UnitComposition;
    intelLevel: IntelLevel; // Intel the combatant has ON the enemy
    supply: number; // 0–1
    morale: number; // Global Morale (different from tactical Organization)
    doctrine: EngagementArchetype; // Pre-battle

    // In-combat variables
    predictionPoints: number; // 0-3 (Doctrine, Archetype, Directive)
    currentStance?: CombatStance;
    currentDirective?: PostBattleDirective;
    selectedStance?: CombatStance; // Player's override for next round
    selectedDirective?: PostBattleDirective; // Player's override for post-battle
    selectedPrediction?: CombatStance; // Player's prediction of enemy stance for next round
    orbitalAllocation?: OrbitalAllocation;
    bombardmentMode?: BombardmentMode;
    techModifiers?: Record<string, number>;
    /**
     * Civilization-specific combat traits, applied POST-clamp by the engine.
     *
     * Separate from techModifiers on purpose: everything inside
     * calculateEffectivePower is clamped to ±40%, and a faction whose authored
     * baseModifiers already push it near that ceiling would see further bonuses
     * silently vanish. Traits that are supposed to accumulate over a campaign
     * have to land in the uncapped band alongside stance and momentum.
     */
    traitBonuses?: {
        /** Kaer'Ruun Ritual Brutality — saturating, from lifetime kills. */
        brutality?: number;
        /**
         * Sarrak Divine Serum — SIGNED: positive while dosed, negative during
         * the withdrawal that follows. The first trait here that can be
         * negative, which is why traitMultiplier carries a floor.
         */
        serum?: number;
        /**
         * Gabagoonian Capacola Surge — SIGNED like the serum, and additionally
         * SCALED by the size of the serving eaten. Shares the serum's cycle shape
         * (lib/factions/stimulant.ts) but not its magnitude: a dose is binary,
         * a meal is not.
         */
        capacola?: number;
        /**
         * Nexulan Adaptive Phase-Shields — grows with elapsedRounds, DEFENDER
         * only. Rides the same clock as the Kaer'Ruun engagement ramp and is its
         * deliberate opposite: they grow more lethal over a long fight, these
         * grow more durable. Both may apply in one battle, which is correct.
         */
        phaseShield?: number;
    };
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
    attackerPredictedStance?: CombatStance;
    defenderPredictedStance?: CombatStance;
    attackerAllocation?: OrbitalAllocation;
    defenderAllocation?: OrbitalAllocation; // Typically only one side controls orbit
}

export interface CombatState {
    id: string;
    target: TargetDetails;
    phase: CombatPhase;
    round: number; // 1 to 3
    /**
     * Rounds fought since the engagement began, never reset.
     *
     * `round` cannot serve as a duration: it is set back to 1 when the battle
     * flips from the orbital phase to the ground phase, so it tops out at 3 and
     * starts over. Anything that scales with how long a fight has lasted must
     * read this instead. Optional — older snapshots lack it.
     */
    elapsedRounds?: number;
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
