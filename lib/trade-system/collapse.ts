// ===== file: lib/trade-system/collapse.ts =====
import {
    Faction,
    Planet,
    CollapseEvent,
    RegimeOutcome,
    FractureOutcome
} from './types';
import { RNG } from './rng';

/**
 * Evaluates factions for collapse triggers.
 * Returns a list of collapse events that occurred this tick.
 */
export function evaluateCollapse(
    factions: Map<string, Faction>,
    planets: Map<string, Planet>,
    rng: RNG
): CollapseEvent[] {
    const events: CollapseEvent[] = [];

    for (const [id, faction] of factions.entries()) {
        // 1. Check Triggers
        // Condition: Backing Ratio < Policy AND Stability < Critical
        // Simplification: RSI > 90 (Reserve Stress Index) means near collapse
        // And Liquidity < -Debt * 0.1 (Insolvency)

        // Let's use RSI > 80 AND Stability < 30 as a trigger
        const rsi = faction.metrics.reserveStressIndex;
        const stability = faction.stability;

        // Also check if already collapsed/anarchy? (We don't have that state in Faction yet, assume active)

        let collapseChance = 0;
        if (rsi > 80 && stability < 40) collapseChance += 0.1;
        if (rsi > 95) collapseChance += 0.2;
        if (faction.liquidity < -1000) collapseChance += 0.2; // Massive debt

        if (collapseChance > 0 && rng.check(collapseChance)) {
            // COLLAPSE TRIGGERED
            events.push(resolveCollapse(faction, planets, rng));
        }
    }

    return events;
}

function resolveCollapse(
    faction: Faction,
    planets: Map<string, Planet>, // All planets (need filter by owner)
    rng: RNG
): CollapseEvent {
    // A) Structural Outcome
    // Based on drift axes
    // Economic (-100 Planned ... 100 Free)
    // Centralization (0 ... 100)
    // Ideology (-100 Auth ... 100 Lib)

    let outcome = RegimeOutcome.EMERGENCY_DIRECTORATE; // Default fallback

    if (faction.centralization > 70) {
        if (faction.ideology < -20) outcome = RegimeOutcome.EMERGENCY_DIRECTORATE;
        else outcome = RegimeOutcome.RECONSTRUCTION_TECHNOCRACY;
    } else {
        if (faction.economicModel > 50) outcome = RegimeOutcome.MERCHANT_COMMONWEALTH;
        else outcome = RegimeOutcome.FEDERAL_FRAGMENTATION;
    }

    // Anarchy check: if stability extremely low
    if (faction.stability < 10) outcome = RegimeOutcome.PIRATE_ANARCHY;

    // B) Fracture Pattern
    // Identify owned systems
    const ownedSystems: string[] = [];
    for (const [pid, p] of planets.entries()) {
        if (p.ownerFactionId === faction.id) ownedSystems.push(pid);
    }

    const fracturedSystems: { systemId: string; outcome: FractureOutcome }[] = [];
    let capitalLost = false;

    for (const sysId of ownedSystems) {
        const planet = planets.get(sysId)!;

        // Calculate Fracture Risk
        // Factors: Distance from capital, Local stability, Autonomy, Trade Dependency?
        // Let's use simple Autonomy vs Stability check
        // High Autonomy (100) + Low Stability (0) = High Risk

        let risk = (planet.autonomy * 0.5) + (100 - planet.localStability) * 0.5;

        // Capital usually safe?
        if (sysId === faction.capitalSystemId) {
            risk *= 0.2; // Strong capital defense
            // But if Capital Exposure Rating (CER) is high...
            if (faction.metrics.capitalExposureRating > 80) risk += 50;
        }

        // Roll
        // Risk 0-100.
        // Thresholds?
        // < 50: Remain
        // 50-80: Secede (Neutral/Indep)
        // 80-95: Breakaway (New rival)
        // > 95: Pirate Haven

        const roll = rng.nextInt(0, 100);

        // Add drift based on risk
        // If Risk is 80, effective roll is biased
        // Let's just compare roll to Risk thresholds relative to 100?
        // Simpler: if (roll < risk) -> Fracture.

        if (roll < risk) {
            // Fracture happened. Determine type based on severity.
            const severity = risk - roll; // Higher diff = worse outcome

            let fractureType = FractureOutcome.SECEDE;
            if (severity > 30) fractureType = FractureOutcome.BREAKAWAY;
            if (severity > 60) fractureType = FractureOutcome.PIRATE_HAVEN;

            fracturedSystems.push({ systemId: sysId, outcome: fractureType });

            if (sysId === faction.capitalSystemId) {
                capitalLost = true;
            }
        }
    }

    return {
        factionId: faction.id,
        regimeOutcome: outcome,
        fracturedSystems: fracturedSystems,
        newCapitalNeeded: capitalLost,
        immediateEffects: {
            priceShock: 2.0, // Prices double due to chaos
            tradeFreezeDuration: 10 // 10 ticks of no trade
        }
    };
}
