import { SecessionEvent, PlanetaryGarrison } from './siege/siege-types';

/**
 * Checks a system's current Unrest level. If it exceeds the critical threshold (default 100),
 * a violent secession is formally triggered, creating a rebel breakaway faction.
 */
export function evaluateSecessionRisk(
    systemId: string,
    currentOwnerId: string,
    unrestLevel: number,
    baseRebelSentiment: number, // Intrinsic desire for freedom (0-100)
    covertForeignFundingTotal: number // Sum of all active proxy funding
): SecessionEvent | null {
    // A system will not secede unless unrest boils over the absolute limit
    if (unrestLevel < 100) return null;

    // Even at 100 unrest, an exhausted or cowardly populace might just strike instead of rebel.
    // Sentiment determines the actual conversion to physical warfare.
    // If sentiment + funding > 50, war breaks out.
    if ((baseRebelSentiment + covertForeignFundingTotal) < 50) return null;

    return {
        id: `secess-${systemId}-${Math.floor(Date.now() / 1000)}`,
        systemId,
        originalOwnerId: currentOwnerId,
        newRebelFactionId: `rebel-faction-${systemId}`,
        foreignSponsors: [], // Populated later by the ProxyService tracking
        spawnedGarrisonStrength: 0
    };
}

/**
 * Initializes the defensive planetary garrison of a newly spawned rebel faction.
 * The strength is massively bolstered if the revolt was secretly funded by Cold War rivals.
 */
export function spawnRebelGarrison(
    event: SecessionEvent,
    basePopulation: number, // Drives base militia HP
    fundingLevel: number    // The amount of dark money/weapons funneled in
): PlanetaryGarrison {
    // 1 base population yields ~5 raw militia troops
    let generatedTroops = basePopulation * 5;

    // Foreign proxy funding acts as a direct multiplier to military hardware density
    // For every 10 points of funding, troops get a 10% combat-efficacy multiplier
    const fundingMultiplier = 1.0 + ((fundingLevel / 10) * 0.1);

    // Fortifications start low for rebels (they are disorganized)
    // But proxy funding can buy mercenary engineers and shield generators.
    let fortLevel = 1;
    if (fundingLevel > 50) fortLevel = 3;
    if (fundingLevel > 90) fortLevel = 5;

    // Supply dictates how long they can withstand an orbital blockade before attrition hits
    let totalSupplies = 10; // Base 10 ticks
    totalSupplies += Math.floor(fundingLevel / 5);

    return {
        troops: Math.round(generatedTroops * fundingMultiplier),
        fortificationLevel: fortLevel,
        supplyRemaining: totalSupplies
    };
}
