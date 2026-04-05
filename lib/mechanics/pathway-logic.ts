/**
 * lib/mechanics/pathway-logic.ts
 * 
 * Defines the progression ladder for dynamic societal evolution.
 * Factions can shift between 4 core pathways (Sovereign, Mercantile, Shadow, Crisis)
 * depending on their economic and political milestones.
 */

export type PathwayId = 'sovereign' | 'mercantile' | 'shadow' | 'crisis';

export interface PathwayRank {
    level: number;
    title: string;
    description: string;
    unlockRequirements: {
        wealthMin?: number;
        infamyMin?: number;
        legitimacyMin?: number;
        militaryScoreMin?: number;
    };
    mechanicsUnlocked: string[];
}

export interface Pathway {
    id: PathwayId;
    name: string;
    ranks: PathwayRank[];
}

export const PATHWAYS: Record<PathwayId, Pathway> = {
    sovereign: {
        id: 'sovereign',
        name: 'The Unified Order',
        ranks: [
            { level: 1, title: 'Protectorate', description: 'Basic governance.', unlockRequirements: { legitimacyMin: 10 }, mechanicsUnlocked: [] },
            { level: 2, title: 'Authority', description: 'Centralized law making.', unlockRequirements: { legitimacyMin: 40 }, mechanicsUnlocked: ['senate_veto'] },
            { level: 3, title: 'Imperial Axis', description: 'Dominant regional power.', unlockRequirements: { legitimacyMin: 70 }, mechanicsUnlocked: ['tax_tribute'] },
            { level: 4, title: 'Galactic Enforcer', description: 'The undisputed arbiter of the galaxy.', unlockRequirements: { legitimacyMin: 95 }, mechanicsUnlocked: ['declare_galactic_law'] }
        ]
    },
    mercantile: {
        id: 'mercantile',
        name: 'The Golden Ledger',
        ranks: [
            { level: 1, title: 'Trade Guild', description: 'A focus on commerce.', unlockRequirements: { wealthMin: 5000 }, mechanicsUnlocked: ['open_trade_routes'] },
            { level: 2, title: 'Sovereign Fund', description: 'Extensive lending power.', unlockRequirements: { wealthMin: 25000 }, mechanicsUnlocked: ['issue_loans'] },
            { level: 3, title: 'Banking Hub', description: 'Predatory financial dominance.', unlockRequirements: { wealthMin: 100000 }, mechanicsUnlocked: ['hire_mercenaries'] },
            { level: 4, title: 'Financial Hegemon', description: 'The absolute center of galactic wealth.', unlockRequirements: { wealthMin: 500000 }, mechanicsUnlocked: ['foreclose_planet'] }
        ]
    },
    shadow: {
        id: 'shadow',
        name: 'The Shadow Veil',
        ranks: [
            { level: 1, title: 'Smugglers', description: 'Covert operations.', unlockRequirements: { infamyMin: 20 }, mechanicsUnlocked: ['black_market_access'] },
            { level: 2, title: 'Privateers', description: 'Sanctioned raiding.', unlockRequirements: { infamyMin: 50 }, mechanicsUnlocked: ['covert_raiding'] },
            { level: 3, title: 'Shadow State', description: 'A hidden empire.', unlockRequirements: { infamyMin: 80 }, mechanicsUnlocked: ['shadow_hub'] },
            { level: 4, title: 'Pirate King', description: 'The undisputed lord of the underworld.', unlockRequirements: { infamyMin: 95 }, mechanicsUnlocked: ['instigate_pirate_surge'] }
        ]
    },
    crisis: {
        id: 'crisis',
        name: 'The Great Pyre',
        ranks: [
            { level: 1, title: 'Zealots', description: 'Aggressive expansionists.', unlockRequirements: { militaryScoreMin: 50 }, mechanicsUnlocked: ['total_war_cassus_belli'] },
            { level: 2, title: 'Raiders', description: 'Plunder over stability.', unlockRequirements: { militaryScoreMin: 80 }, mechanicsUnlocked: ['planetary_bombardment'] },
            { level: 3, title: 'Purge-Legion', description: 'A threat to all life.', unlockRequirements: { militaryScoreMin: 120 }, mechanicsUnlocked: ['scorched_earth_tactics'] },
            { level: 4, title: 'Universal Crisis', description: 'The end-game threat.', unlockRequirements: { militaryScoreMin: 200 }, mechanicsUnlocked: ['xenocide_mandate'] }
        ]
    }
};

/**
 * Evaluates a given faction's metrics against the ladder requirements to see if they can 
 * unlock a new rank or pivot to a new pathway.
 */
export function evaluatePathwayProgression(
    currentPathway: PathwayId, 
    currentRank: number, 
    metrics: { wealth: number; infamy: number; legitimacy: number; militaryScore: number }
): { newPathway?: PathwayId; newRank?: number; unlockedMechanics: string[] } {
    
    let highestEligiblePathway = currentPathway;
    let highestEligibleRank = currentRank;
    const unlockedMechanics: string[] = [];

    // Evaluate all pathways to find highest possible rank (prioritizing current path, but allowing shifts)
    for (const [pathwayId, pathway] of Object.entries(PATHWAYS)) {
        for (const rank of pathway.ranks) {
            let eligible = true;
            if (rank.unlockRequirements.wealthMin && metrics.wealth < rank.unlockRequirements.wealthMin) eligible = false;
            if (rank.unlockRequirements.infamyMin && metrics.infamy < rank.unlockRequirements.infamyMin) eligible = false;
            if (rank.unlockRequirements.legitimacyMin && metrics.legitimacy < rank.unlockRequirements.legitimacyMin) eligible = false;
            if (rank.unlockRequirements.militaryScoreMin && metrics.militaryScore < rank.unlockRequirements.militaryScoreMin) eligible = false;

            if (eligible) {
                // If they are climbing their own ladder, or shifting to a dramatically higher tier in a new ladder
                if (pathwayId === currentPathway && rank.level > highestEligibleRank) {
                    highestEligibleRank = rank.level;
                    unlockedMechanics.push(...rank.mechanicsUnlocked);
                } else if (pathwayId !== currentPathway && rank.level > highestEligibleRank) {
                    highestEligiblePathway = pathwayId as PathwayId;
                    highestEligibleRank = rank.level;
                    unlockedMechanics.push(...rank.mechanicsUnlocked);
                }
            }
        }
    }

    return {
        newPathway: highestEligiblePathway !== currentPathway ? highestEligiblePathway : undefined,
        newRank: highestEligibleRank !== currentRank ? highestEligibleRank : undefined,
        unlockedMechanics
    };
}
