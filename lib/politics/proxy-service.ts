import { ProxyConflict } from './cold-war-types';

/**
 * Calculates how foreign covert funding bolsters a local rebel organization.
 */
export function evaluateProxyFundingImpact(
    conflict: ProxyConflict,
    baseRebellionStrength: number, // The natural strength of the internal dissidents (e.g. 0-100)
    localUnrestAmount: number      // Local systemic instability
): {
    augmentedRebelStrength: number;
    newUnrestAccumulation: number;
} {
    // Sponsors directly multiply the combat efficacy and organization of rebels.
    // Funding 100 provides a massive 50% relative strength boost, plus an absolute floor.
    const fundingMultiplier = 1.0 + (conflict.fundingLevel / 200); // 100 funding -> 1.5x
    const fundingFloor = conflict.fundingLevel * 0.2; // 100 funding -> +20 absolute strength

    let augmentedRebelStrength = (baseRebellionStrength * fundingMultiplier) + fundingFloor;

    // Pouring weapons and dark money into a system severely spikes civilian unrest
    // The more instability there is, the faster the dark money radicalizes the populace
    const volatilityMultiplier = 1.0 + (localUnrestAmount / 100);
    const unrestSpike = (conflict.fundingLevel * 0.15) * volatilityMultiplier;

    return {
        augmentedRebelStrength: Math.round(augmentedRebelStrength),
        newUnrestAccumulation: unrestSpike
    };
}

/**
 * Calculates the percentage chance per tick (or evaluation cycle) that
 * the sponsoring empires will have their covert operation violently exposed,
 * triggering a massive Rivalry spike and Cold War Escalation.
 */
export function calculateBlowbackRisk(
    conflict: ProxyConflict,
    targetSystemSecurity: number // 0-100, representing the target empire's counter-espionage
): number {
    // Base risk is driven completely by how aggressive the funding is.
    // Maximum funding (100) yields a staggering 25% base check risk.
    let baseRisk = conflict.fundingLevel * 0.25;

    // High security dramatically magnifies the risk of intercepting supply lines
    const securityThreat = targetSystemSecurity / 50; // 100 security = 2.0x multiplier
    baseRisk *= Math.max(0.5, securityThreat);

    // If multiple sponsors are involved, leaks are exponentially more likely due to coordination gaps
    if (conflict.sponsorIds.length > 1) {
        baseRisk *= Math.pow(1.5, conflict.sponsorIds.length - 1);
    }

    return Math.min(100, Math.max(0, baseRisk));
}
