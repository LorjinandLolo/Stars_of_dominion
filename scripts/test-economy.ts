import { calculateIncome, applyTimeDelta, EconomyPlanet } from '../lib/economy/calculations';
import { ResourceId } from '../types';

console.log('--- Testing Economy Logic ---');

// 1. Mock Planets
const planets: EconomyPlanet[] = [
    { $id: 'p1', name: 'Alpha Prime', type: 'terran' },
    { $id: 'p2', name: 'Beta Mine', type: 'volcanic' },
    { $id: 'p3', name: 'Gamma Farm', type: 'ocean' }
];

// 2. Calculate Income
console.log('Calculating Income...');
const rates = calculateIncome(planets);
console.log('Income Rates:', rates);

// Expected:
// Terran: food 20, happiness 5, metals 10, credits 50
// Volcanic: metals 40, chemicals 20, happiness -5, credits 20
// Ocean: food 30, happiness 10, chemicals 10, credits 40
// Total: 
// Food: 20 + 0 + 30 = 50
// Metals: 10 + 40 + 0 = 50
// Chemicals: 0 + 20 + 10 = 30
// Credits: 50 + 20 + 40 = 110
// Happiness: 5 - 5 + 10 = 10

const expectedRates = { food: 50, metals: 50, chemicals: 30, credits: 110, happiness: 10 };
let pass = true;
(Object.keys(expectedRates) as ResourceId[]).forEach(res => {
    if (rates[res] !== expectedRates[res]) {
        console.error(`Mismatch for ${res}: Expected ${expectedRates[res]}, got ${rates[res]}`);
        pass = false;
    }
});

if (pass) console.log('✅ Income Calculation Passed');

// 3. Apply Time Delta
console.log('\nSimulating 2 Hours passing...');
const startResources: Record<ResourceId, number> = { metals: 100, chemicals: 50, food: 100, happiness: 50, credits: 1000 };
const elapsedHours = 2;

const endResources = applyTimeDelta(startResources, rates, elapsedHours, {});
console.log('Start:', startResources);
console.log('End:', endResources);

// Expected:
// Metals: 100 + (50 * 2) = 200
// Chemicals: 50 + (30 * 2) = 110
// Food: 100 + (50 * 2) = 200
// Credits: 1000 + (110 * 2) = 1220
// Happiness: 50 + (10 * 2) = 70

const expectedEnd = { metals: 200, chemicals: 110, food: 200, credits: 1220, happiness: 70 };
(Object.keys(expectedEnd) as ResourceId[]).forEach(res => {
    if (Math.abs(endResources[res] - expectedEnd[res]) > 0.1) { // Float tolerance
        console.error(`Mismatch for ${res}: Expected ${expectedEnd[res]}, got ${endResources[res]}`);
        pass = false;
    }
});

if (pass) console.log('✅ Time Delta Logic Passed');

// 4. Test Happiness Cap
console.log('\nTesting Happiness Cap (Max 100)...');
const happyStart = { ...startResources, happiness: 90 };
const happyEnd = applyTimeDelta(happyStart, rates, 2, {}); // Should be 90 + 20 = 110 -> Cap 100
if (happyEnd.happiness === 100) {
    console.log('✅ Happiness Capped at 100');
} else {
    console.error(`❌ Happiness Cap Failed. Got ${happyEnd.happiness}`);
}
