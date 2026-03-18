import { simulateTradeFlows } from '../lib/trade-system/trade';
import { 
    TradeAgreement, 
    TradeRoute, 
    PolicyState, 
    Resource, 
    PolicyRule 
} from '../lib/trade-system/types';
import { RNG } from '../lib/trade-system/rng';

async function testEconomyPolicy() {
    console.log("=== Testing Economic Policy Interactions ===");
    
    const rng = new RNG(12345);
    const systemOwners = new Map<string, string>([
        ['sys-source', 'faction-producer'],
        ['sys-transit', 'faction-transit'],
        ['sys-dest', 'faction-consumer']
    ]);

    const agreements = new Map<string, TradeAgreement>();
    agreements.set('ag-1', {
        id: 'ag-1',
        aFactionId: 'faction-producer',
        bFactionId: 'faction-consumer',
        resource: 'HEW' as Resource,
        volumePerHour: 100,
        startTick: 0,
        endTick: 1000,
        priceFormula: 'market'
    });

    const route: TradeRoute = {
        id: 'ag-1',
        agreementId: 'ag-1',
        path: ['sys-source', 'sys-transit', 'sys-dest'],
        theatreId: 'theatre-1',
        exposureScore: 0,
        piracyRisk: 0, 
        blockadeRisk: 0,
        deepSpaceRisk: 0,
        escortLevel: 0,
        routePriority: 1
    };

    const policies = new Map<string, PolicyState>();
    
    // Default policies
    const createPolicy = (): PolicyState => ({
        tariffsByResource: new Map(),
        subsidiesByResource: new Map(),
        sanctions: new Set(),
        embargoes: [],
        chokepointRules: new Map(),
        productionFocus: null
    });

    const producerPolicy = createPolicy();
    const transitPolicy = createPolicy();
    const consumerPolicy = createPolicy();

    policies.set('faction-producer', producerPolicy);
    policies.set('faction-transit', transitPolicy);
    policies.set('faction-consumer', consumerPolicy);

    // TEST 1: Transit Tariff
    transitPolicy.chokepointRules.set('sys-transit', { rule: PolicyRule.TAX, taxRate: 0.1 });
    
    let result = simulateTradeFlows([route], agreements, policies, new Map(), new Map(), systemOwners, rng);
    console.log("Test 1 (Transit Tariff):");
    console.log(`- Transit Revenue: ${result.tariffRevenue.get('faction-transit')} (Expected ~100)`);

    // TEST 2: Import Tariff
    consumerPolicy.tariffsByResource.set('HEW' as Resource, 0.2);
    result = simulateTradeFlows([route], agreements, policies, new Map(), new Map(), systemOwners, rng);
    console.log("Test 2 (Import Tariff):");
    console.log(`- Consumer Import Revenue: ${result.tariffRevenue.get('faction-consumer')} (Expected ~200)`);

    // TEST 3: Subsidies
    producerPolicy.subsidiesByResource.set('HEW' as Resource, 5); // 5 credits per unit
    result = simulateTradeFlows([route], agreements, policies, new Map(), new Map(), systemOwners, rng);
    console.log("Test 3 (Subsidies):");
    console.log(`- Producer Subsidy Cost: ${result.subsidyCost.get('faction-producer')} (Expected ~500)`);

    console.log("\n=== Policy Tests Completed ===");
}

testEconomyPolicy();
