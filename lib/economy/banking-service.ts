/**
 * lib/economy/banking-service.ts
 * 
 * Logic for the Intergalactic Banking Clan's financial mechanics.
 * Handles issuing loans, compounding interest, defaults, and mercenary debt-enforcement.
 */

export interface Loan {
    id: string;
    debtorFactionId: string;
    creditorFactionId: string; // usually 'banking_clan'
    principal: number;
    currentBalance: number;
    interestRatePerTick: number;
    issueTick: number;
    status: 'active' | 'defaulted' | 'repaid';
}

export class BankingService {
    activeLoans: Map<string, Loan> = new Map();

    /**
     * Issues a high-interest liquidity injection to a desperate faction.
     */
    issueLoan(debtorId: string, amount: number, tick: number): Loan {
        const loan: Loan = {
            id: `loan-${debtorId}-${Date.now()}`,
            debtorFactionId: debtorId,
            creditorFactionId: 'banking_clan',
            principal: amount,
            currentBalance: amount,
            interestRatePerTick: 0.005, // 0.5% compounding per tick
            issueTick: tick,
            status: 'active'
        };

        this.activeLoans.set(loan.id, loan);
        return loan;
    }

    /**
     * Called during the simulation loop to apply compounding interest.
     */
    calculateInterestDrift(tick: number) {
        for (const loan of this.activeLoans.values()) {
            if (loan.status === 'active') {
                // Apply interest
                const interest = loan.currentBalance * loan.interestRatePerTick;
                loan.currentBalance += interest;
                // In a real loop, we would deduct the interest from debtor's liquidity 
                // and add it to the Banking Clan's liquidity here.
            }
        }
    }

    /**
     * If a faction cannot or will not pay, they can declare default.
     * This provides instant debt-relief but destroys diplomatic trust
     * and triggers mercenary retaliation.
     */
    defaultOnLoan(loanId: string): { success: boolean; events: string[] } {
        const loan = this.activeLoans.get(loanId);
        if (!loan || loan.status !== 'active') return { success: false, events: [] };

        loan.status = 'defaulted';
        
        return {
            success: true,
            events: [
                `Faction ${loan.debtorFactionId} has defaulted on their debt of ${Math.floor(loan.currentBalance)} to the Banking Clan!`,
                `The Banking Clan has declared a Debt Reclamation War.`,
                `Mercenary armadas have been hired to burn the assets of ${loan.debtorFactionId}.`
            ]
        };
    }

    /**
     * Hires an off-the-books mercenary armada for a set cost.
     * Often used by the Banking Clan to enforce defaults.
     */
    hireMercenaries(buyerFactionId: string, systemTargetId: string, payment: number): string {
        // Here we'd link to the tactical simulation to spawn a pirate/merc unit
        return `A mercenary fleet of strength ${payment * 0.1} has been dispatched to ${systemTargetId} on behalf of ${buyerFactionId}.`;
    }
}

export const GlobalBank = new BankingService();
