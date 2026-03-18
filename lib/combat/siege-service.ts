import { SiegeState, PlanetaryGarrison } from './ground-combat-types';

export interface SiegeResult {
    updatedSiege: SiegeState;
    updatedGarrison: PlanetaryGarrison;
    isOccupied: boolean; // True if occupation progress hit 100 on this tick
    attackerCasualties: number;
    defenderCasualties: number;
    collateralDamage: number; // Represents damage to planetary infrastructure/economy
}

/**
 * Calculates a single discrete tick of ground combat between an invading force
 * and an entrenched planetary garrison.
 */
export function evaluateSiegeTick(
    siege: SiegeState,
    garrison: PlanetaryGarrison
): SiegeResult {
    let attackerDmg = 0;
    let defenderDmg = 0;
    let infrastructureDamage = 0;

    // Create mutable copies for the tick
    const nextSiege = { ...siege };
    const nextGarrison = { ...garrison };

    // 1. Orbital Phase (If Fleet is active)
    if (siege.bombardmentActive) {
        // Bombardment shreds fortifications but destroys the planet's value
        nextGarrison.fortificationLevel = Math.max(0, nextGarrison.fortificationLevel - 0.5);

        // Massive flat damage to defenders, but causes immense collateral destruction
        const strikeDmg = 100;
        defenderDmg += strikeDmg;
        infrastructureDamage += 50;
    }

    // 2. Supply Phase (Attrition)
    if (nextGarrison.supplyRemaining <= 0) {
        // Starving defenders take continuous passive damage and lose fortification bonuses
        defenderDmg += 25;
        nextGarrison.fortificationLevel = Math.max(0, nextGarrison.fortificationLevel - 0.2);
    } else {
        // Consume 1 supply per tick of active combat
        nextGarrison.supplyRemaining -= 1;
    }

    // 3. Ground Assault Phase
    // Fortifications act as a direct damage multiplier for the defenders
    const defMultiplier = 1.0 + (nextGarrison.fortificationLevel * 0.2); // Level 5 = 2.0x strength

    // Attackers deal 10% of their total strength per tick
    const baseAttackDmg = nextSiege.invadingTroops * 0.1;

    // Defenders deal 10% of their *modified* strength per tick
    const baseDefendDmg = (nextGarrison.troops * defMultiplier) * 0.1;

    attackerDmg += baseDefendDmg;
    defenderDmg += baseAttackDmg;
    infrastructureDamage += (baseAttackDmg * 0.1); // Ground war breaks things

    // Apply casualties
    nextSiege.invadingTroops = Math.max(0, nextSiege.invadingTroops - attackerDmg);
    nextGarrison.troops = Math.max(0, nextGarrison.troops - defenderDmg);

    // 4. Occupation Progress Phase
    // The invaders cannot begin capturing the planet until the military garrison is broken
    let occupied = false;
    if (nextGarrison.troops <= 0) {
        // Pure occupation speed depends on how many troops survived the assault to police the populace
        const occupationSpeed = 5 + (nextSiege.invadingTroops / 100);
        nextSiege.occupationProgress += occupationSpeed;

        if (nextSiege.occupationProgress >= 100) {
            nextSiege.occupationProgress = 100;
            occupied = true;
        }
    } else {
        // If defenders reinforce, occupation progress rolls backwards
        nextSiege.occupationProgress = Math.max(0, nextSiege.occupationProgress - 2);
    }

    return {
        updatedSiege: nextSiege,
        updatedGarrison: nextGarrison,
        isOccupied: occupied,
        attackerCasualties: Math.round(attackerDmg),
        defenderCasualties: Math.round(defenderDmg),
        collateralDamage: Math.round(infrastructureDamage)
    };
}
