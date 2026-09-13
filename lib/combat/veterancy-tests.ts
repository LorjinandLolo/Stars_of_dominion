// lib/combat/veterancy-tests.ts
// npx tsx lib/combat/veterancy-tests.ts

import {
    EXPERIENCE_CAP, EXPERIENCE_PER_BATTLE, EXPERIENCE_FOR_VICTORY,
    experienceMultiplier, gainExperience, blendExperience, veterancyRank,
} from './veterancy';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('\n1. Multiplier');
{
    check('a green fleet fights at 1.0', experienceMultiplier(undefined) === 1 && experienceMultiplier(0) === 1);
    check('experience adds straight on', near(experienceMultiplier(0.1), 1.1));
    check('the cap holds', near(experienceMultiplier(9), 1 + EXPERIENCE_CAP));
    check('garbage reads as green', experienceMultiplier(NaN) === 1);
}

console.log('\n2. Gain');
{
    check('surviving a battle earns the base', near(gainExperience(undefined, false), EXPERIENCE_PER_BATTLE));
    check('winning earns more', near(gainExperience(0, true), EXPERIENCE_PER_BATTLE + EXPERIENCE_FOR_VICTORY));
    check('it caps', near(gainExperience(EXPERIENCE_CAP, true), EXPERIENCE_CAP));
    let xp = 0;
    let battles = 0;
    while (xp < EXPERIENCE_CAP) { xp = gainExperience(xp, true); battles++; if (battles > 100) break; }
    check('an always-winning fleet is elite after a handful of battles', battles > 3 && battles <= 10, `${battles} battles`);
}

console.log('\n3. Blend');
{
    check('green ships dilute a veteran crew by power', near(blendExperience(0.2, 100, 0, 100), 0.1));
    check('merging equals averages', near(blendExperience(0.2, 300, 0.1, 100), 0.175));
    check('an empty fleet takes the incoming crew', near(blendExperience(undefined, 0, 0.12, 50), 0.12));
    check('no power on either side is green', blendExperience(undefined, 0, undefined, 0) === 0);
}

console.log('\n4. Ranks');
{
    check('ranks climb', veterancyRank(0) === 'Green' && veterancyRank(0.02) === 'Regular' && veterancyRank(0.08) === 'Seasoned' && veterancyRank(0.15) === 'Veteran' && veterancyRank(0.25) === 'Elite');
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
