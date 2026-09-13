// lib/espionage/intel-reports-tests.ts
// npx tsx lib/espionage/intel-reports-tests.ts
//
// A deep enough network reads the rival's shipwright channels: the military
// intercept names their designs. Rival designs are otherwise never sent.

import { getGameWorldState } from '../game-world-state-singleton';
import { generateImmediateReport, describeDesignProfile } from './intel-reports';
import { emptyProfile } from '../combat/ship-registry';

const A = 'faction-sarrak';
const B = 'faction-buthari';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

const world = getGameWorldState();
if (!(world.shipDesigns instanceof Map)) (world as any).shipDesigns = new Map();
if (!world.espionage.factionIntel.get(A)) {
    world.espionage.factionIntel.set(A, { intelPoints: 0, agentCapacity: 3, usedAgentCapacity: 0, counterIntelStrength: 0, surveillanceStrength: 0, propagandaResistance: 0, internalSecurity: 0, infiltrationLevels: {}, regionalCounterIntel: {}, counterIntelBudget: 0 } as any);
}
const intelA: any = world.espionage.factionIntel.get(A)!;
world.shipDesigns!.set('design-b-test', {
    id: 'design-b-test', factionId: B, name: 'Lance Line', hullId: 'battleship',
    components: { w1: 'wpn-pulse-laser', w2: 'wpn-pulse-laser', u1: 'util-deflector', c1: 'core-fission' },
    createdAt: 1, updatedAt: 2,
} as any);

console.log('\n1. Describing a signature');
{
    const p = { ...emptyProfile(), energy: 3, kinetic: 1, shield: 2, armor: 1 };
    check('dominant attack and defense are named', describeDesignProfile(p) === 'energy-heavy, shielded', describeDesignProfile(p));
    check('a bare hull is unarmed', describeDesignProfile(emptyProfile()) === 'unarmed');
    check('missiles and plating read as such', describeDesignProfile({ ...emptyProfile(), explosive: 2, armor: 1 }) === 'missile-heavy, armoured');
}

console.log('\n2. The intercept');
{
    intelA.infiltrationLevels[B] = 5;
    const shallow = generateImmediateReport(A, B, 'military', world);
    check('a recon cell does not see the yards', !!shallow && !shallow.body.includes('Lance Line'), shallow?.body);

    intelA.infiltrationLevels[B] = 50;
    const deep = generateImmediateReport(A, B, 'military', world);
    check('an embedded network names the design', !!deep && deep.body.includes('"Lance Line" (battleship'), deep?.body);
    check('the report is still a military intercept', deep?.domain === 'military' && deep.title === 'Fleet Disposition Intercept');

    world.shipDesigns!.delete('design-b-test');
    const none = generateImmediateReport(A, B, 'military', world);
    check('a rival with no custom designs reads as standard patterns', !!none && none.body.includes('standard patterns'), none?.body);
    intelA.infiltrationLevels[B] = 0;
    for (const r of [shallow, deep, none]) if (r) world.espionage.reports.delete(r.id);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
