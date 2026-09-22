// scripts/biosphere-probe.ts
// npx tsx scripts/biosphere-probe.ts
//
// Biosphere world tags are PERCENTAGES applied to a planet's base rates, not
// flat per-second additions. Base rates are 0.05-0.8/sec, so the old flat add
// made a single tag worth roughly seventy times a planet's entire output.

import config from '../lib/movement/movement-config.json';
import { BIOSPHERE_TRAIT_MODIFIERS, calculateBiosphereModifiers } from '../lib/economy/biosphere-traits';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const baseRates = (config as any).economy.production.baseRates as Record<string, number>;
/** The multiply that planetBaseRates does, isolated. */
const applyPercent = (base: number, percent: number) => Math.max(0, base * (1 + percent / 100));

console.log('\n1. The table is percentages, and the scale makes sense against base rates');
{
    const food = baseRates.food;
    check('food base rate is still sub-1/sec', food > 0 && food < 1, String(food));
    const agri = calculateBiosphereModifiers(['Agriculture World']);
    check('Agriculture World reads as +40 (percent)', agri.food === 40, String(agri.food));
    // The bug: 0.6 + 40 = 40.6/sec, about 68x the planet's whole output.
    check('as a flat add it would have been absurd', (food + 40) / food > 60);
    check('as a percentage it is a real but sane boost', Math.abs(applyPercent(food, 40) - food * 1.4) < 1e-9);
    check('and it never inverts production', applyPercent(food, -300) === 0);
}

console.log('\n2. Seeded role tags actually do something now');
{
    // initialization-service writes these onto the starting kit; nothing in the
    // table matched them, so every seeded world carried tags worth nothing.
    for (const tag of ['homeworld', 'settled_core', 'established_colony', 'sector_capital']) {
        check(`${tag} is in the table`, BIOSPHERE_TRAIT_MODIFIERS[tag] !== undefined);
    }
    const home = calculateBiosphereModifiers(['homeworld', 'settled_core']);
    check('a seeded homeworld stacks its two tags', home.food === 30, String(home.food));
    check('which is a third more food, not seventy times', Math.abs(applyPercent(baseRates.food, home.food ?? 0) / baseRates.food - 1.3) < 1e-9);
    check('role tags stay modest next to specialist worlds', (home.food ?? 0) < (calculateBiosphereModifiers(['Agriculture World']).food ?? 0));
}

console.log('\n3. Tags that cancel out read as no effect');
{
    // The panel hides a modifier of exactly 0; under the old flat reading it
    // compared against 1.0, so a real +1% vanished and every 0 was shown.
    const mixed = calculateBiosphereModifiers(['Agriculture World', 'dead-world']);
    check('opposing tags sum rather than replace', mixed.food === 40 - 30, String(mixed.food));
    check('an untagged world has no modifiers at all', Object.keys(calculateBiosphereModifiers([])).length === 0);
    check('an unknown tag is ignored', Object.keys(calculateBiosphereModifiers(['archetype:continental'])).length === 0);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
