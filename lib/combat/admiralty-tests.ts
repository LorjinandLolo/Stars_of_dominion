// lib/combat/admiralty-tests.ts
// npx tsx lib/combat/admiralty-tests.ts

import {
    commandingAdmiral, admiralPowerBonus, admiralBattleXp,
    ADMIRAL_POWER_PER_LEVEL, ADMIRAL_POWER_CAP, ADMIRAL_XP_PER_BATTLE, ADMIRAL_XP_FOR_VICTORY,
} from './admiralty';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

const leaders = new Map([
    ['adm-1', { id: 'adm-1', role: 'Admiral', status: 'active', level: 2 }],
    ['adm-5', { id: 'adm-5', role: 'Admiral', status: 'active', level: 5 }],
    ['gov-1', { id: 'gov-1', role: 'Governor', status: 'active', level: 9 }],
    ['adm-x', { id: 'adm-x', role: 'Admiral', status: 'dead', level: 9 }],
]);

console.log('\n1. Who commands');
{
    check('no leader, no admiral', commandingAdmiral([{ leaderId: undefined }], leaders) === null);
    check('an unknown id is ignored', commandingAdmiral([{ leaderId: 'ghost' }], leaders) === null);
    check('a governor does not command a fleet', commandingAdmiral([{ leaderId: 'gov-1' }], leaders) === null);
    check('a dead admiral does not either', commandingAdmiral([{ leaderId: 'adm-x' }], leaders) === null);
    check('the senior admiral commands the side', commandingAdmiral([{ leaderId: 'adm-1' }, { leaderId: 'adm-5' }], leaders)?.id === 'adm-5');
    check('no leader map, no admiral', commandingAdmiral([{ leaderId: 'adm-5' }], null) === null);
}

console.log('\n2. Power and XP');
{
    check('no admiral adds nothing', admiralPowerBonus(null) === 0);
    check('two percent per level', near(admiralPowerBonus(leaders.get('adm-1')!), 2 * ADMIRAL_POWER_PER_LEVEL));
    check('capped at ten percent', near(admiralPowerBonus({ id: 'x', role: 'Admiral', status: 'active', level: 40 }), ADMIRAL_POWER_CAP));
    check('a battle pays base XP', admiralBattleXp(false) === ADMIRAL_XP_PER_BATTLE);
    check('a win pays more', admiralBattleXp(true) === ADMIRAL_XP_PER_BATTLE + ADMIRAL_XP_FOR_VICTORY);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
