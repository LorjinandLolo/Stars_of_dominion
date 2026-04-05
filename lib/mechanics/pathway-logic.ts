/**
 * lib/mechanics/pathway-logic.ts
 * 
 * Logic for the 'Societal Pathway Ladders'.
 * Every faction can climb one of four ladders to reach a specialized end-state.
 */

export type PathwayId = 'golden_ledger' | 'shadow_veil' | 'unified_order' | 'great_pyre';

export interface PathwayRank {
    rank: number;
    title: string;
    description: string;
    requirements: {
        wealth?: number;
        infamy?: number;
        legitimacy?: number;
        militaryScore?: number;
        stabilityMax?: number;
    };
    unlockedModifiers: Record<string, number>;
}

export interface Pathway {
    id: PathwayId;
    name: string;
    ranks: PathwayRank[];
}

export const PATHWAY_LADDERS: Record<PathwayId, Pathway> = {
    golden_ledger: {
        id: 'golden_ledger',
        name: "The Golden Ledger",
        ranks: [
            { 
                rank: 1, title: "Trade Guild", description: "Economic focus starts to shift toward financial mediation.",
                requirements: { wealth: 5000 },
                unlockedModifiers: { trade_efficiency: 0.05 }
            },
            { 
                rank: 2, title: "Sovereign Fund", description: "The state begins leveraging its reserves to influence rivals.",
                requirements: { wealth: 25000, trade_efficiency: 0.15 },
                unlockedModifiers: { diplomatic_leverage_wealth: 0.10 }
            },
            { 
                rank: 3, title: "Banking Hub", description: "Unlocks the ability to issue high-interest predatory loans.",
                requirements: { wealth: 100000, trade_efficiency: 0.30 },
                unlockedModifiers: { loan_interest_bonus: 0.20 }
            },
            { 
                rank: 4, title: "Financial Hegemon", description: "Can seize entire star systems as collateral for unpaid debts.",
                requirements: { wealth: 500000, trade_efficiency: 0.50 },
                unlockedModifiers: { debt_seizure_unlocked: 1.0 }
            }
        ]
    },
    shadow_veil: {
        id: 'shadow_veil',
        name: "The Shadow Veil",
        ranks: [
            { 
                rank: 1, title: "Smugglers", description: "Operating outside the law to avoid taxation.",
                requirements: { infamy: 10 },
                unlockedModifiers: { tax_evasion: 0.10 }
            },
            { 
                rank: 2, title: "Privateers", description: "State-sanctioned raiding of rival trade routes.",
                requirements: { infamy: 30, militaryScore: 50 },
                unlockedModifiers: { raiding_efficiency: 0.20 }
            },
            { 
                rank: 3, title: "Shadow State", description: "Complete transition to a non-sovereign entity; black market focus.",
                requirements: { infamy: 60, stabilityMax: 40 },
                unlockedModifiers: { black_market_access: 1.0 }
            },
            { 
                rank: 4, title: "Pirate King", description: "Unchecked dominion over the galactic underbelly.",
                requirements: { infamy: 100, militaryScore: 200 },
                unlockedModifiers: { piracy_share_bonus: 0.50 }
            }
        ]
    },
    unified_order: {
        id: 'unified_order',
        name: "The Unified Order",
        ranks: [
            { 
                rank: 1, title: "Protectorate", description: "Enforcing local peace through military presence.",
                requirements: { legitimacy: 60 },
                unlockedModifiers: { internal_stability: 0.10 }
            },
            { 
                rank: 2, title: "Authority", description: "Standardizing law and order across multiple sectors.",
                requirements: { legitimacy: 80, militaryScore: 100 },
                unlockedModifiers: { corruption_reduction: 0.20 }
            },
            { 
                rank: 3, title: "Imperial Axis", description: "A centralized powerhouse of administrative control.",
                requirements: { legitimacy: 90, infrastructure: 50 },
                unlockedModifiers: { administrative_capacity: 0.30 }
            },
            { 
                rank: 4, title: "Galactic Enforcer", description: "The definitive law of the stars. Can veto Council resolutions.",
                requirements: { legitimacy: 100, militaryScore: 500 },
                unlockedModifiers: { council_veto_unlocked: 1.0 }
            }
        ]
    },
    great_pyre: {
        id: 'great_pyre',
        name: "The Great Pyre",
        ranks: [
            { 
                rank: 1, title: "Zealots", description: "Ideological purity through sacrifice.",
                requirements: { militaryScore: 50, stabilityMax: 50 },
                unlockedModifiers: { combat_fanaticism: 0.10 }
            },
            { 
                rank: 2, title: "Raiders", description: "Scorched-earth tactics become standard protocol.",
                requirements: { militaryScore: 150, infamy: 40 },
                unlockedModifiers: { planet_pillaging: 0.30 }
            },
            { 
                rank: 3, title: "Purge-Legion", description: "Diplomacy is abandoned in favor of total conquest.",
                requirements: { militaryScore: 400, diplomatic_trust_max: -50 },
                unlockedModifiers: { total_war_bonus: 0.40 }
            },
            { 
                rank: 4, title: "Universal Crisis", description: "The galaxy's survival is secondary to your ascension.",
                requirements: { militaryScore: 1000, infamy: 100 },
                unlockedModifiers: { crisis_strength_bonus: 1.0 }
            }
        ]
    }
};

/**
 * Checks if a faction meets the criteria for the next rank in a pathway.
 */
export function canAdvanceRank(factionId: string, currentRank: number, pathwayId: PathwayId, world: any): boolean {
    const pathway = PATHWAY_LADDERS[pathwayId];
    const nextRank = pathway.ranks.find(r => r.rank === currentRank + 1);
    if (!nextRank) return false;

    const stats = world.factions[factionId].metrics;
    const req = nextRank.requirements;

    if (req.wealth && stats.wealth < req.wealth) return false;
    if (req.infamy && stats.infamy < req.infamy) return false;
    if (req.legitimacy && stats.legitimacy < req.legitimacy) return false;
    if (req.militaryScore && stats.militaryScore < req.militaryScore) return false;
    
    return true;
}
