export type SanctionType = 'trade_embargo' | 'research_embargo' | 'financial_freeze' | 'shipping_interdiction';

/**
 * Represents a formal geopolitical sanction enacted against another empire or bloc.
 */
export interface SanctionPackage {
    id: string;
    senderId: string;
    targetEmpireId: string;
    type: SanctionType;
    severity: number;           // 1-10 stringency of enforcement
    coordinatingEmpireIds: string[]; // If multiple empires enforce it, effects multiply
    ticksRemaining: number;
}

/**
 * Calculates the exact systemic drain on an empire inflicted by a specific sanction.
 */
export function evaluateSanctionImpact(
    packages: SanctionPackage[],
    targetEmpireTotalTradeBase: number,     // Sum of target's active trade route yields
    targetEmpireTotalResearchBase: number   // Sum of target's tech output
): {
    tradeCapacityPenaltyValue: number;
    researchCapacityPenaltyValue: number;
    unrestSpike: number;
} {
    let tradePenalty = 0;
    let researchPenalty = 0;
    let unrest = 0;

    for (const pkg of packages) {
        // Collateral damage and enforcement stringency multiply via coordination
        // 1 sponsor = 1.0x, 3 sponsors = 1.4x
        const coordinationMultiplier = 1.0 + (pkg.coordinatingEmpireIds.length * 0.2);

        // Severity 10 is maximum pressure
        const intensity = pkg.severity * coordinationMultiplier;

        switch (pkg.type) {
            case 'trade_embargo':
                // Chokes off a percentage of the entire trade base
                // Severity 10 with 3 sponsors (1.6x) drops 48% of global trade base
                const capDrop = intensity * 0.03;
                tradePenalty += targetEmpireTotalTradeBase * capDrop;
                unrest += intensity * 0.5; // Losing trade goods angers citizens
                break;

            case 'research_embargo':
                // Freezes collaborative data sharing and vital computing imports
                const techDrop = intensity * 0.02;
                researchPenalty += targetEmpireTotalResearchBase * techDrop;
                unrest += intensity * 0.1; // Mostly angers the elite, less civilian unrest
                break;

            case 'financial_freeze':
                // Directly freezes liquidity causing massive domestic unrest
                unrest += intensity * 1.5;
                break;

            case 'shipping_interdiction':
                // Physical blockage of lanes severely punishes trade and enrages populace
                const hardDrop = intensity * 0.05;
                tradePenalty += targetEmpireTotalTradeBase * hardDrop;
                unrest += intensity * 2.0;
                break;
        }
    }

    // Ensure we don't accidentally subtract more than 100% of their base value
    return {
        tradeCapacityPenaltyValue: Math.min(tradePenalty, targetEmpireTotalTradeBase * 0.95),
        researchCapacityPenaltyValue: Math.min(researchPenalty, targetEmpireTotalResearchBase * 0.95),
        unrestSpike: unrest
    };
}
