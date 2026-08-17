// scripts/leopantheri-probe.ts
// Are the Leo-pantheri mechanics LIVE — and is their honour the ledger the game
// ALREADY keeps, rather than a second one beside it?
//
// Covers the honour standing and its buffs, Refuse First Strike, Honor Lock,
// and the defensive district bonus.
//
//   npx tsx scripts/leopantheri-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, districtTraitsFor, tickFactionTraits } from '../lib/factions/traits-service';
import { ensureGovernments } from '../lib/government/government-service';
import { getGovernmentModifiers } from '../lib/government/modifiers';
import { ReputationService } from '../lib/reputation/reputation-service';
import { getTechModifier } from '../lib/tech/modifiers';
import {
    HONOR_BASELINE,
    HONOR_APPROVAL_SWING,
    HONOR_DEFENCE_SWING,
    UNJUSTIFIED_HONOR_LOSS,
    HONOR_LOCK_LOSS,
    DISHONOURABLE_ACTIONS,
    honorStanding,
    chargeUnjustifiedWar,
    chargeHonorLock,
    isJustifiedAgainst,
    isWarDeclaration,
} from '../lib/factions/leopantheri';
import { grievanceStore } from '../lib/factions/civ-ids';

const LEO = 'faction-leopantheri';
const OTHER = 'faction-sarrak';
const AGGRESSOR = 'faction-kaerruun';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');
/** Comments stripped, so a comment explaining a choice can't satisfy a wiring assertion. */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const world: any = getGameWorldState();
ensureFactionTraits(world);
ensureGovernments(world);
world.nowSeconds = 7_000_000;

const setHonor = (factionId: string, honor: number) => {
    ReputationService.getReputation(world, factionId).scores.honor = honor;
};
const honorOf = (factionId: string) => ReputationService.getReputation(world, factionId).scores.honor;
const clearGrievances = (factionId: string) => {
    const store = grievanceStore(world, factionId);
    if (store) for (const k of Object.keys(store)) delete store[k];
};

// ── 1. What the civ pipeline already delivers ───────────────────────────────
console.log('\n[1] Already-live traits (civ pipeline) — must not be rebuilt');
{
    setHonor(LEO, HONOR_BASELINE);   // isolate the pipeline from the honour swing
    const gov = getGovernmentModifiers(world, LEO) as any;
    check('Cultural Influence is already live (approval)', gov.approval > 0, `got ${gov.approval.toFixed(3)}`);
    check('and legitimacy drift with it', gov.legitimacy_drift > 0, `got ${gov.legitimacy_drift.toFixed(3)}`);
    const research = getTechModifier(world, LEO, 'research_speed');
    check('Unified Theology & Science is already live (research_speed)', research > 1, `got ${research.toFixed(3)}`);
    const manufacturing = getTechModifier(world, LEO, 'eco_manufacturing_mult');
    check('Expensive Units is already live (eco_manufacturing_mult)', manufacturing < 1, `got ${manufacturing.toFixed(3)}`);
    const esp = getTechModifier(world, LEO, 'esp_op_success_add');
    check('half of Honor Lock is already live (esp_op_success_add)', esp < 0, `got ${esp.toFixed(3)}`);

    const leo = code('lib/factions/leopantheri.ts');
    check('the module adds NO second copy of those pipeline modifiers',
        !/eco_manufacturing_mult|esp_op_success_add/.test(leo));
}

// ── 2. Honour is the ledger the game already keeps ──────────────────────────
console.log('\n[2] Honour reads the EXISTING reputation ledger');
{
    // The whole design rests on this: world.reputation has carried an honour
    // axis with twenty-odd writers and a tick decay since it was built, and
    // nothing ever read it. A second score would have been pure duplication.
    setHonor(LEO, 80);
    check('the standing tracks world.reputation, not a private copy',
        Math.abs(honorStanding(world, LEO) - (80 - HONOR_BASELINE) / HONOR_BASELINE) < 1e-9);
    setHonor(LEO, 20);
    check('and follows it downward', honorStanding(world, LEO) < 0, `got ${honorStanding(world, LEO).toFixed(3)}`);
    setHonor(LEO, HONOR_BASELINE);
    check('at the baseline the standing is exactly neutral', honorStanding(world, LEO) === 0);
    check('nobody else has a standing at all', honorStanding(world, OTHER) === 0);

    // The state bag must not shadow the ledger. Asserted behaviourally rather
    // than by regex: poison the cached field and confirm the standing ignores
    // it, which is what "second source of truth" would actually look like.
    setHonor(LEO, 90);
    const st = world.factionTraits.get(LEO)!.leopantheri!;
    st.honorAtLastTick = 5;
    check('a stale cached honour cannot influence the standing',
        Math.abs(honorStanding(world, LEO) - (90 - HONOR_BASELINE) / HONOR_BASELINE) < 1e-9,
        `got ${honorStanding(world, LEO).toFixed(3)} with honorAtLastTick=5`);
    st.honorAtLastTick = 90;
}

// ── 3. The honour buffs reach real consumers ────────────────────────────────
console.log('\n[3] Honour buffs');
{
    setHonor(LEO, HONOR_BASELINE);
    const base = getGovernmentModifiers(world, LEO) as any;

    setHonor(LEO, 100);
    const high = getGovernmentModifiers(world, LEO) as any;
    check('perfect honour raises approval', high.approval > base.approval,
        `${base.approval.toFixed(3)} -> ${high.approval.toFixed(3)}`);
    check('and legitimacy drift', high.legitimacy_drift > base.legitimacy_drift);
    check('and research — equations are sung in temples', high.research_speed > base.research_speed);
    check('the swing is the authored size',
        Math.abs((high.approval - base.approval) - HONOR_APPROVAL_SWING) < 1e-9);

    // An economy has to be able to hurt, or it is just a bonus with extra steps.
    setHonor(LEO, 0);
    const low = getGovernmentModifiers(world, LEO) as any;
    check('ruined honour drives approval BELOW the baseline', low.approval < base.approval,
        `${base.approval.toFixed(3)} -> ${low.approval.toFixed(3)}`);
    check('and costs them their research edge', low.research_speed < base.research_speed);

    // The sixth source must be inert for everyone else.
    const otherBefore = (getGovernmentModifiers(world, OTHER) as any).approval;
    setHonor(OTHER, 100);
    check('another empire is unaffected by its own honour',
        (getGovernmentModifiers(world, OTHER) as any).approval === otherBefore);
    setHonor(LEO, HONOR_BASELINE);

    check('honour is composed into getGovernmentModifiers as a source',
        /getHonorModifiers\(world, factionId\)/.test(code('lib/government/modifiers.ts')));
}

// ── 4. Refuse First Strike ──────────────────────────────────────────────────
console.log('\n[4] Refuse First Strike');
{
    clearGrievances(LEO);
    setHonor(LEO, 70);

    check('unprovoked, an act of war is unjustified', isJustifiedAgainst(world, LEO, AGGRESSOR) === false);
    const before = honorOf(LEO);
    const charged = chargeUnjustifiedWar(world, LEO, AGGRESSOR);
    check('and it costs them honour', charged && honorOf(LEO) < before,
        `${before} -> ${honorOf(LEO)}`);
    check('the loss is the authored size',
        Math.abs((before - honorOf(LEO)) - UNJUSTIFIED_HONOR_LOSS) < 1e-9);
    check('the breach is recorded for the player',
        (world.factionTraits.get(LEO)?.leopantheri?.unjustifiedWars ?? 0) > 0);

    // A grievance makes it righteous — the SHARED store, third consumer.
    grievanceStore(world, LEO)![AGGRESSOR] = { sinceSeconds: world.nowSeconds, kind: 'attacked' };
    check('a grievance makes the same war justified', isJustifiedAgainst(world, LEO, AGGRESSOR) === true);
    const held = honorOf(LEO);
    check('and it costs them nothing', chargeUnjustifiedWar(world, LEO, AGGRESSOR) === false && honorOf(LEO) === held);
    check('but only against THAT faction', isJustifiedAgainst(world, LEO, OTHER) === false);
    clearGrievances(LEO);

    // The assertion that catches gating only the formal declaration: neither
    // invasion nor bombardment calls registerActOfWar, so a faction can conquer
    // a world at escalation 0 without ever declaring.
    check('invasion counts as opening hostilities', isWarDeclaration('MIL_INVASION_PLANET'));
    check('so does bombardment', isWarDeclaration('MIL_BOMBARD_PLANET'));
    check('and the formal declaration', isWarDeclaration('DIP_DECLARE_WAR'));
    check('moving a fleet does not', isWarDeclaration('MIL_MOVE_FLEET') === false);

    const honestBefore = honorOf(OTHER);
    check('another civilization is never charged',
        chargeUnjustifiedWar(world, OTHER, AGGRESSOR) === false && honorOf(OTHER) === honestBefore);
}

// ── 5. Honor Lock ───────────────────────────────────────────────────────────
console.log('\n[5] Honor Lock');
{
    setHonor(LEO, 80);
    const before = honorOf(LEO);
    const verb = chargeHonorLock(world, LEO, 'ESP_SABOTAGE_FACILITY');
    check('sabotage costs them honour', !!verb && honorOf(LEO) === before - HONOR_LOCK_LOSS,
        `${before} -> ${honorOf(LEO)}`);
    check('breaking a sworn treaty is dishonourable', !!DISHONOURABLE_ACTIONS['DIP_BREAK_TREATY']);

    // Watching is not murdering. A philosopher-duelist may still gather intel —
    // listing these explicitly rather than by category is why.
    const watching = honorOf(LEO);
    check('intelligence gathering stays free', chargeHonorLock(world, LEO, 'ESP_LAUNCH_OP') === null);
    check('and costs no honour', honorOf(LEO) === watching);
    check('an ordinary order is untouched', chargeHonorLock(world, LEO, 'MIL_MOVE_FLEET') === null);
    check('another civilization is never charged', chargeHonorLock(world, OTHER, 'ESP_SABOTAGE_FACILITY') === null);

    // A PRICE, not a gate. The distinction from the Buthari is the mechanic:
    // the worker must charge and then carry on executing the order.
    const loop = code('scripts/game-loop.ts');
    check('the worker charges honour without refusing the order',
        /chargeHonorLock\(world, factionId, actionId\);/.test(loop)
        && !/if \(chargeHonorLock[\s\S]{0,80}return;/.test(loop));
    check('and charges only after the order is actually affordable',
        loop.indexOf('chargeOrderCost(world, factionId, actionId)') < loop.indexOf('chargeHonorLock(world, factionId, actionId)'));
}

// ── 6. Defensive honour in the district layer ───────────────────────────────
console.log('\n[6] Winning defensive wars');
{
    const own: any = { ownerId: LEO };
    const theirs: any = { ownerId: OTHER };

    setHonor(LEO, 100);
    check('honoured, they fight harder on their OWN ground',
        districtTraitsFor(world, LEO, 'plains', own).dealt > 1,
        `got ${districtTraitsFor(world, LEO, 'plains', own).dealt.toFixed(3)}`);
    check('the bonus is the authored size',
        Math.abs(districtTraitsFor(world, LEO, 'plains', own).dealt - (1 + HONOR_DEFENCE_SWING)) < 1e-9);
    check('but NOT while invading someone else — this is defence only',
        districtTraitsFor(world, LEO, 'plains', theirs).dealt === 1);

    setHonor(LEO, 0);
    check('dishonoured, they fight WORSE than baseline even at home',
        districtTraitsFor(world, LEO, 'plains', own).dealt < 1,
        `got ${districtTraitsFor(world, LEO, 'plains', own).dealt.toFixed(3)}`);
    setHonor(LEO, HONOR_BASELINE);
    check('at the baseline they are exactly ordinary',
        districtTraitsFor(world, LEO, 'plains', own).dealt === 1);
    check('another civilization gets nothing from the same seam',
        districtTraitsFor(world, OTHER, 'plains', { ownerId: OTHER }).dealt !== 1 + HONOR_DEFENCE_SWING);
}

// ── 7. Persistence and layering ─────────────────────────────────────────────
console.log('\n[7] Persistence and layering');
{
    setHonor(LEO, 77);
    tickFactionTraits(world);
    const round: any = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    check('Leo-pantheri trait state survives a save/load round trip',
        !!round.factionTraits?.get(LEO)?.leopantheri);
    check('and honour itself survives, because it rides the reputation ledger',
        Math.abs((round.reputation?.get(LEO)?.scores?.honor ?? 0) - 77) < 1e-9,
        `got ${round.reputation?.get(LEO)?.scores?.honor}`);

    // government/modifiers.ts imports this module, so it must stay a leaf.
    const imports = [...code('lib/factions/leopantheri.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('leopantheri.ts imports only leaves', imports.every(i =>
        ['../game-world-state', './faction-traits-types', './civ-ids',
         '../reputation/reputation-service', '../tech/history-ledger'].includes(i)),
        imports.join(', '));
    setHonor(LEO, HONOR_BASELINE);
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Leo-pantheri mechanics are live\n`);
process.exit(failures ? 1 : 0);
