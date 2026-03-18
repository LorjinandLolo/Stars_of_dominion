import { 
    commandPrivateers, 
    collectCorporateTax, 
    issueNewShares 
} from '../lib/economy/corporate/company-service';
import { 
    CharteredCompany, 
    CharterPower, 
    FactionCorporateState 
} from '../lib/economy/corporate/company-types';

async function runTest() {
    console.log("--- Starting Corporate Interaction Test ---");

    const mockCompany: CharteredCompany = {
        id: 'test-company',
        charter: {
            baseName: 'Test',
            fullName: 'Test Charter Company',
            powers: [CharterPower.PARAMILITARY, CharterPower.GOVERNANCE]
        },
        foundingFactionId: 'faction-aurelian',
        headquartersSystemId: 'hq-1',
        foundedAt: Date.now() / 1000,
        treasury: 10000,
        sharesOutstanding: 1000000,
        sharePrice: 10,
        shareholders: { 'faction-aurelian': 1000000 },
        dividendsPaidTotal: 0,
        pendingProfit: 0,
        monopolyRights: {},
        infrastructureOwned: [],
        corporateColonies: ['hq-1'],
        privateFleetSize: 10,
        activeTradeRouteIds: [],
        autonomyLevel: 10,
        corruptionIndex: 0,
        charterRevocationPending: false
    };

    const mockEvents: any[] = [];
    const mockFactionState: FactionCorporateState = {
        factionId: 'faction-aurelian',
        companySharesOwned: { 'test-company': 1000000 },
        charteredCompanyIds: ['test-company'],
        totalDividendsReceived: 0
    };

    const now = Date.now() / 1000;

    // 1. Test Command Privateers
    console.log("Testing Command Privateers...");
    commandPrivateers(mockCompany, mockEvents, now);
    console.log(`- Treasury: ${mockCompany.treasury} (Expected: 5000)`);
    console.log(`- Fleet Size: ${mockCompany.privateFleetSize} (Expected: 20)`);
    console.log(`- Autonomy: ${mockCompany.autonomyLevel} (Expected: 15)`);

    // 2. Test Collect Corporate Tax
    console.log("\nTesting Collect Corporate Tax...");
    const tax = collectCorporateTax(mockCompany, mockFactionState, mockEvents, now);
    console.log(`- Tax Collected: ${tax} (Expected: 1250)`);
    console.log(`- Treasury: ${mockCompany.treasury} (Expected: 3750)`);
    console.log(`- Faction Dividends: ${mockFactionState.totalDividendsReceived} (Expected: 1250)`);
    console.log(`- Corruption: ${mockCompany.corruptionIndex} (Expected: 10)`);
    console.log(`- Autonomy: ${mockCompany.autonomyLevel} (Expected: 17)`);

    // 3. Test Issue Equities
    console.log("\nTesting Issue Equities...");
    issueNewShares(mockCompany, 10000, 'faction-aurelian', 10, mockFactionState, mockEvents, now);
    console.log(`- Shares Outstanding: ${mockCompany.sharesOutstanding} (Expected: 1010000)`);
    console.log(`- Treasury: ${mockCompany.treasury} (Expected: 103750)`);

    console.log("\n--- Test Complete ---");
}

runTest().catch(console.error);
