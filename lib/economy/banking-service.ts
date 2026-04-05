/**
 * lib/economy/banking-service.ts
 * 
 * Predatory Lending & Mercenary Enforcement logic.
 * Managed by the Intergalactic Banking Clan.
 */

import { HERO_ACTIONS } from '../mechanics/hero-actions';

export interface Loan {
    id: string;
    factionId: string;
    principal: number;
    interestAccrued: number;
    interestRate: number; // e.g. 0.05 per 100 ticks
    ticksSinceIssuance: number;
    status: 'active' | 'defaulted' | 'paid';
}

export const BANKING_CONFIG = {
    BASE_INTEREST_RATE: 0.02, // 2% per 100 ticks
    CRISIS_MULTIPLIER: 2.5, // Interest spikes during galactic tension
    MAX_LOAN_MULTIPLIER: 10, // Max loan based on yearly income
    RECLAMATION_THRESHOLD: 50000, // Defaulters over this amount get Mercenary Armadas sent
};

export const activeLoans: Map<string, Loan> = new Map();

/**
 * Issuing a loan to a faction.
 */
export function requestLoan(factionId: string, amount: number, world: any): Loan {
    const loan: Loan = {
        id: `loan-${factionId}-${Date.now()}`,
        factionId,
        principal: amount,
        interestAccrued: 0,
        interestRate: BANKING_CONFIG.BASE_INTEREST_RATE,
        ticksSinceIssuance: 0,
        status: 'active'
    };
    
    // Update faction liquidity
    world.factions[factionId].metrics.wealth += amount;
    activeLoans.set(loan.id, loan);
    
    return loan;
}

/**
 * Calculating predatory interest drift.
 */
export function processInterestDrift(world: any) {
    const tension = world.politics.galacticTension || 1.0;
    
    activeLoans.forEach((loan, id) => {
        if (loan.status !== 'active') return;
        
        // Increase interest rate if the galaxy is unstable
        const currentRate = loan.interestRate * (1 + (tension * 0.1));
        const compoundingInterest = (loan.principal + loan.interestAccrued) * currentRate;
        
        loan.interestAccrued += compoundingInterest;
        loan.ticksSinceIssuance += 100;

        // Auto-check for insolvency
        if (loan.interestAccrued > loan.principal * 3) {
            triggerDefaultWarning(loan.factionId);
        }
    });
}

/**
 * Defaulting on debt - triggers immediate War with IBC Mercenaries.
 */
export function defaultOnDebt(factionId: string, world: any) {
    const totalDebt = Array.from(activeLoans.values())
        .filter(l => l.factionId === factionId && l.status === 'active')
        .reduce((sum, l) => sum + (l.principal + l.interestAccrued), 0);

    // 1. Set status to 'Pariah'
    world.factions[factionId].diplomacy.status = 'CREDIT_PARIAH';

    // 2. Hire Mercenaries for the IBC to reclaim debt
    if (totalDebt > BANKING_CONFIG.RECLAMATION_THRESHOLD) {
        spawnMercenaryArmada('banking_clan', factionId, 'RECLAMATION_STRIKE', world);
    }
}

/**
 * Spawns NPC Mercenary fleets to attack a target.
 */
export function spawnMercenaryArmada(hiringFaction: string, targetFaction: string, contractType: string, world: any) {
    // Mock logic to spawn AI fleets belonging to the 'Hiring Faction' 
    // effectively using their wealth to automate their defense/offense.
    console.log(`[BANKING CLAN] Mercenary Armada deployed for ${hiringFaction} against ${targetFaction}: ${contractType}`);
    
    // Add to 'Crisis Events' list for UI tracking
    world.crises.push({
        id: `merc-${Date.now()}`,
        type: 'mercenary_invasion',
        origin: hiringFaction,
        target: targetFaction,
        intensity: world.factions[hiringFaction].metrics.wealth / 1000,
        severity: 'existential'
    });
}
