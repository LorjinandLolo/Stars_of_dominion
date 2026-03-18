import {
    CombatPhase,
    CombatState,
    CombatantState,
    UnitComposition,
    UnitType,
    IntelLevel,
    VisibilityProfile,
    VisibilityLevel,
    PostBattleDirective,
    CombatStance,
    OngoingEngagementRound,
    CombatRoundReport,
    EngagementArchetype,
    TargetDetails
} from './combat-types';
import config from './combat-config.json';

// Utility for applying bounds
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

// ─── 1. Power & RPS Formulas ──────────────────────────────────────────────────

/**
 * Evaluates the Soft RPS grid.
 * Returns a modifier between -0.20 and +0.20 (based on maxRpsBonusCap).
 * Weighted by unit composition sizes.
 */
export function calculateCompositionModifier(
    composition: UnitComposition,
    enemyComposition: UnitComposition,
    layer: 'orbital' | 'ground'
): number {
    const counters = layer === 'orbital' ? config.unitCounters.orbital : config.unitCounters.ground;

    let totalFriends = 0;
    let totalEnemies = 0;
    for (const count of Object.values(composition)) totalFriends += (count || 0);
    for (const count of Object.values(enemyComposition)) totalEnemies += (count || 0);

    if (totalFriends === 0 || totalEnemies === 0) return 0;

    let netBonus = 0;

    // For every friendly unit type, see how it counters every enemy unit type
    for (const [fType, fCount] of Object.entries(composition)) {
        if (!fCount) continue;
        const fWeight = fCount / totalFriends;

        const typeCounters = counters[fType as keyof typeof counters];
        if (!typeCounters) continue;

        for (const [eType, eCount] of Object.entries(enemyComposition)) {
            if (!eCount) continue;
            const eWeight = eCount / totalEnemies;

            // Look up modifier
            const mod = (typeCounters as Record<string, number>)[eType] || 0;
            netBonus += mod * fWeight * eWeight;
        }
    }

    return clamp(netBonus, -config.constants.maxRpsBonusCap, config.constants.maxRpsBonusCap);
}

/**
 * Deterministic Power Resolution: BaseForce x CompositionMod x Terrain x Supply x Morale.
 * Hardware-capped at ±40% variance max.
 */
export function calculateEffectivePower(
    combatant: CombatantState,
    enemy: CombatantState,
    layer: 'orbital' | 'ground',
    terrainMulti: number
): number {
    const compMod = calculateCompositionModifier(combatant.composition, enemy.composition, layer);

    // [INTEGRATION] If we have custom ship designs, we should use their stats here.
    // For now, we scale the power based on a composite "Efficiency" factor derived from the composition.
    // In a full implementation, we'd sum (unitCount * unitEffectivePower).
    
    // Morale curve: Drops off hard below 50%
    const moraleMod = combatant.morale >= 0.5 ? 1.0 : (0.5 + combatant.morale);

    // Supply curve: Drops off below 30%
    const supplyMod = combatant.supply >= 0.3 ? 1.0 : 0.5;

    let totalMultiplier = 1.0 + compMod;
    totalMultiplier *= terrainMulti;
    totalMultiplier *= supplyMod;
    totalMultiplier *= moraleMod;

    // Apply strict ±40% variance cap on the base power
    const maxMulti = 1.0 + config.constants.maxVarianceCap;
    const minMulti = 1.0 - config.constants.maxVarianceCap;

    totalMultiplier = clamp(totalMultiplier, minMulti, maxMulti);

    // Simple Scaling for now: baseForceCount is the "Health/Mass" of the fleet.
    return Math.max(0, combatant.baseForceCount * totalMultiplier);
}

// ─── 2. Initiation ────────────────────────────────────────────────────────────

export function initiateCombat(
    id: string,
    target: TargetDetails,
    attacker: CombatantState,
    defender: CombatantState
): CombatState {
    const totalBaseForce = attacker.baseForceCount + defender.baseForceCount;
    const isSkirmish = totalBaseForce < config.constants.skirmishPowerThreshold;

    return {
        id,
        target,
        phase: 'orbital',
        round: 1,
        momentum: 0,
        territoryControl: 0.5,
        attacker,
        defender,
        isSkirmish,
        annihilationEligible: false,
        resolved: false
    };
}

// ─── 3. Visibility & Intel ───────────────────────────────────────────────────

/**
 * Returns a restricted view of the target's composition based on intel level.
 */
export function generateVisibilityProfile(
    intelLevel: IntelLevel,
    target: CombatantState
): VisibilityProfile {
    const levels: Record<IntelLevel, VisibilityLevel> = {
        blind: 'size_only',
        observing: 'rough_archetype',
        infiltrated: 'percentage_bands',
        deep_penetration: 'precise_ranges'
    };

    const profileLevel = levels[intelLevel];

    // Build visible info progressively based on tier
    let estimatedPower: [number, number] = [0, 0];
    const visibleArchetypes: string[] = [];
    const compositionBands: Partial<Record<UnitType, [number, number]>> = {};

    const base = target.baseForceCount;

    if (profileLevel === 'size_only') {
        // Blind: +/- 50%
        estimatedPower = [base * 0.5, base * 1.5];
    } else if (profileLevel === 'rough_archetype') {
        // Observing: +/- 30%
        estimatedPower = [base * 0.7, base * 1.3];
        // Flag max archetype
        let maxType = '';
        let maxCount = 0;
        for (const [t, c] of Object.entries(target.composition)) {
            if (c > maxCount) { maxCount = c; maxType = t; }
        }
        if (maxType) visibleArchetypes.push(`${maxType}-heavy`);
    } else if (profileLevel === 'percentage_bands') {
        // Infiltrated: +/- 15%
        estimatedPower = [base * 0.85, base * 1.15];
        for (const [t, c] of Object.entries(target.composition)) {
            compositionBands[t as UnitType] = [Math.floor(c * 0.85), Math.ceil(c * 1.15)];
        }
    } else {
        // Deep Penetration: +/- 5%
        estimatedPower = [base * 0.95, base * 1.05];
        for (const [t, c] of Object.entries(target.composition)) {
            compositionBands[t as UnitType] = [Math.floor(c * 0.95), Math.ceil(c * 1.05)];
        }
    }

    return {
        level: profileLevel,
        estimatedBasePower: estimatedPower,
        visibleArchetypes,
        compositionBands: profileLevel === 'percentage_bands' || profileLevel === 'precise_ranges' ? compositionBands : undefined
    };
}

// ─── 4. Stance RPS ────────────────────────────────────────────────────────────

function getStanceModifier(myStance: CombatStance, enemyStance: CombatStance): number {
    const match = config.stanceCounters[myStance]?.[enemyStance as keyof typeof config.stanceCounters[typeof myStance]];
    return match || 0;
}

// ─── 5. Combat Round Resolution ───────────────────────────────────────────────

export function resolveEngagementRound(
    state: CombatState,
    roundInput: OngoingEngagementRound
): CombatRoundReport {
    if (state.resolved) throw new Error("Combat already resolved");

    const aStance = roundInput.attackerStance || state.attacker.selectedStance;
    const dStance = roundInput.defenderStance || state.defender.selectedStance;

    let attackerStanceMod = 0;
    let defenderStanceMod = 0;

    if (aStance && dStance) {
        attackerStanceMod = getStanceModifier(aStance, dStance);
        defenderStanceMod = getStanceModifier(dStance, aStance);
    }

    state.attacker.currentStance = aStance;
    state.defender.currentStance = dStance;

    // Power calculations
    const layer = state.phase;
    let attackerPower = calculateEffectivePower(state.attacker, state.defender, layer, 1.0);
    let defenderPower = calculateEffectivePower(state.defender, state.attacker, layer, state.target.terrainModifier);

    // Apply Stance Mods
    attackerPower *= (1.0 + attackerStanceMod);
    defenderPower *= (1.0 + defenderStanceMod);

    // Apply existing momentum (+ momentum favors attacker, - favors defender)
    if (state.momentum > 0) attackerPower *= (1.0 + (state.momentum * 0.10));
    if (state.momentum < 0) defenderPower *= (1.0 + (Math.abs(state.momentum) * 0.10));

    // Intelligence-based Prediction Simulation
    // Represented probabilistically, granting a small bonus if successful.
    // Deep penetration drops max probability up to 75%
    let attackerPredictionBonus = 0;
    let defenderPredictionBonus = 0;
    const aIntelProb = config.intelPredictionProbabilities[state.attacker.intelLevel].archetypeExact;
    const dIntelProb = config.intelPredictionProbabilities[state.defender.intelLevel].archetypeExact;

    if (Math.random() < aIntelProb) attackerPredictionBonus = 0.05;
    if (Math.random() < dIntelProb) defenderPredictionBonus = 0.05;

    attackerPower *= (1.0 + attackerPredictionBonus);
    defenderPower *= (1.0 + defenderPredictionBonus);

    // Casualties (Damage dealt is purely driven by EffectivePower / 10 for balancing per round)
    const attackDmg = attackerPower * 0.10;
    const defendDmg = defenderPower * 0.10;

    state.attacker.casualties += defendDmg;
    state.defender.casualties += attackDmg;
    state.attacker.baseForceCount = Math.max(0, state.attacker.baseForceCount - defendDmg);
    state.defender.baseForceCount = Math.max(0, state.defender.baseForceCount - attackDmg);

    // Momentum shift logic: Whoever dealt more damage shifts momentum to them
    const dmgDelta = attackDmg - defendDmg;
    const shift = clamp(dmgDelta / (attackerPower + defenderPower || 1), -0.2, 0.2); // Swing cap per round
    state.momentum = clamp(state.momentum + shift, -1, 1);

    const report: CombatRoundReport = {
        round: state.round,
        phase: state.phase,
        attackerDamageDealt: attackDmg,
        defenderDamageDealt: defendDmg,
        momentumShift: shift,
        supplyDecayAttacker: 0,
        supplyDecayDefender: 0,
        attackerPointsGained: 0,
        defenderPointsGained: 0,
        events: []
    };

    if (attackerPredictionBonus > 0) report.events.push("Attacker Intel allowed stance prediction bonus.");
    if (defenderPredictionBonus > 0) report.events.push("Defender Intel allowed stance prediction bonus.");

    // Supply decay
    applySupplyDecay(state, report, roundInput);

    // Apply prediction points (3/3 tracked logically)
    if (attackerPredictionBonus > 0) {
        state.attacker.predictionPoints = Math.min(3, state.attacker.predictionPoints + 1);
        report.attackerPointsGained = 1;
    }
    if (defenderPredictionBonus > 0) {
        state.defender.predictionPoints = Math.min(3, state.defender.predictionPoints + 1);
        report.defenderPointsGained = 1;
    }

    return report;
}

function applySupplyDecay(state: CombatState, report: CombatRoundReport, roundInput: OngoingEngagementRound) {
    let aDecay = config.constants.baseSupplyDecayPerRound;
    let dDecay = config.constants.baseSupplyDecayPerRound;

    // Orbital allocations modify decay
    if (state.phase === 'ground' && state.orbitalWinnerId) {
        // If attacker holds orbit
        if (state.orbitalWinnerId === state.attacker.factionId) {
            dDecay = config.constants.interdictedSupplyDecayPerRound;
            if (roundInput.attackerAllocation === 'interdiction') {
                dDecay += 0.15;
            } else if (roundInput.attackerAllocation === 'defensive_orbit') {
                aDecay -= 0.05; // Reduces attacker strain
            }
        } else {
            // Defender holds orbit
            aDecay = config.constants.interdictedSupplyDecayPerRound;
            if (roundInput.defenderAllocation === 'interdiction') {
                aDecay += 0.15;
            } else if (roundInput.defenderAllocation === 'defensive_orbit') {
                dDecay -= 0.05;
            }
        }
    }

    state.attacker.supply = clamp(state.attacker.supply - aDecay, 0, 1);
    state.defender.supply = clamp(state.defender.supply - dDecay, 0, 1);

    report.supplyDecayAttacker = aDecay;
    report.supplyDecayDefender = dDecay;
}

// ─── 6. Phase/Round Advance ───────────────────────────────────────────────────

export function advanceRound(state: CombatState) {
    if (state.resolved) return;

    if (state.isSkirmish) {
        // Skirmish ends immediately after 1 round.
        state.resolved = true;
        return;
    }

    state.round++;
    if (state.round > 3) {
        if (state.phase === 'orbital') {
            // End of Orbital phase -> Evaluate Orbital Control -> Transition to Ground
            state.phase = 'ground';
            state.round = 1;

            // Whoever dealt more damage/has higher power holds orbit
            // Simple check: compare remaining base force in orbit (assuming all forces committed are orbital)
            if (state.attacker.baseForceCount > state.defender.baseForceCount) {
                state.orbitalWinnerId = state.attacker.factionId;
            } else {
                state.orbitalWinnerId = state.defender.factionId;
            }
        } else if (state.phase === 'ground') {
            // End of Ground phase -> Battle Over
            state.resolved = true;
        }
    }
}

// ─── 7. Annihilation & Post-Battle ────────────────────────────────────────────

export function checkAnnihilation(state: CombatState): { annihilatedFactionId: string | null; reason?: string } {
    if (state.isSkirmish) return { annihilatedFactionId: null, reason: "Skirmishes cannot trigger annihilation." };

    const checkSide = (side: CombatantState, enemy: CombatantState) => {
        if (side.predictionPoints < 3) return false;

        const ratio = (side.baseForceCount || 1) / (enemy.baseForceCount || 1);
        if (ratio < config.constants.annihilationRatioThreshold) return false;

        if (enemy.morale > config.constants.annihilationMoraleThreshold) return false;

        // Randomized 15% attempt
        if (Math.random() <= config.constants.annihilationRandomChance) {
            return true;
        }
        return false;
    };

    if (checkSide(state.attacker, state.defender)) {
        return { annihilatedFactionId: state.defender.factionId };
    }
    if (checkSide(state.defender, state.attacker)) {
        return { annihilatedFactionId: state.attacker.factionId };
    }

    return { annihilatedFactionId: null };
}

export function applyPostBattleDirective(state: CombatState) {
    // Process directives (Consolidate, Exploit, etc.) modifying casualty retention or supply
    const processDirective = (c: CombatantState) => {
        const activeDirective = c.selectedDirective || c.currentDirective;
        switch (activeDirective) {
            case 'consolidate':
                c.supply = clamp(c.supply + 0.15, 0, 1);
                c.morale = clamp(c.morale + 0.10, 0, 1);
                break;
            case 'orderly_retreat':
                // retain casualties
                c.casualties *= 0.8;
                break;
            case 'pillage':
                if (c.role === 'attacker' && state.territoryControl > 0.5) {
                    c.supply = clamp(c.supply + 0.30, 0, 1);
                }
                break;
            case 'pursue':
                // Adds extra casualties to enemy (simulated outside this func by higher layer)
                break;
        }
    };

    processDirective(state.attacker);
    processDirective(state.defender);
}
