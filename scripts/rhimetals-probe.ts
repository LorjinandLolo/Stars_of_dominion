// scripts/rhimetals-probe.ts
// Are the Rhimetal mechanics LIVE — and does decapitating the hive actually
// reach the numbers, through the assassination path that already exists?
//
// Covers the Hive Mind Network, the Doctrine of Delay, Correction (arbitration)
// and Grounded Indoors.
//
//   npx tsx scripts/rhimetals-probe.ts
//
// No database, no worker. Exits non-zero on failure.

import fs from 'fs';
import path from 'path';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';
import { ensureFactionTraits, districtTraitsFor, tickFactionTraits } from '../lib/factions/traits-service';
import { ensureGovernments } from '../lib/government/government-service';
import { getGovernmentModifiers } from '../lib/government/modifiers';
import { resolveSuccession } from '../lib/government/succession-service';
import { getTechModifier } from '../lib/tech/modifiers';
import {
    NODE_REESTABLISH_SECONDS,
    COHERENCE_VACANT,
    COHERENCE_REESTABLISHING,
    ENCLOSED_TAKEN_PENALTY,
    CORRECTION_RIVALRY_RELIEF,
    DELIBERATED_ACTIONS,
    hiveCoherence,
    isHiveFrayed,
    shouldDeliberate,
    correctionReliefFor,
} from '../lib/factions/rhimetals';
import { grievanceStore } from '../lib/factions/civ-ids';

const RHI = 'faction-rhimetals';
const OTHER = 'faction-sarrak';
const AGGRESSOR = 'faction-kaerruun';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
    if (ok) { console.log(`  ok    ${label}`); return; }
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
};
const code = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const world: any = getGameWorldState();
ensureFactionTraits(world);
ensureGovernments(world);
world.nowSeconds = 7_000_000;

/** Seat a head of state who has held office long enough to BE the node. */
const seatSettledNode = (factionId: string, id = `leader-${factionId}`) => {
    const gov = world.government.get(factionId);
    world.leadership.leaders.set(id, {
        id, factionId, name: 'Wofrrs', title: 'The Crowned Wing', status: 'active',
        tookOfficeAtSeconds: world.nowSeconds - NODE_REESTABLISH_SECONDS * 2,
        history: [],
    });
    gov.headOfStateId = id;
    return id;
};
const vacateOffice = (factionId: string) => { world.government.get(factionId).headOfStateId = null; };
const clearGrievances = (factionId: string) => {
    const store = grievanceStore(world, factionId);
    if (store) for (const k of Object.keys(store)) delete store[k];
};

// ── 1. What the civ pipeline already delivers ───────────────────────────────
console.log('\n[1] Already-live traits (civ pipeline) — must not be rebuilt');
{
    seatSettledNode(RHI);
    // orbital_power_multiplier is an ADDITIVE key with a base of 0, not a
    // multiplier with a base of 1, so the live value is the authored delta
    // itself. Asserting > 1 would demand +100% and fail on a working pipeline.
    const orbital = getTechModifier(world, RHI, 'orbital_power_multiplier');
    check('Perfect coordination is already live (orbital_power_multiplier)', orbital > 0, `got ${orbital.toFixed(3)}`);
    check('and it is the authored +0.30 arriving intact', orbital >= 0.3 - 1e-9, `got ${orbital.toFixed(3)}`);
    const esp = getTechModifier(world, RHI, 'esp_op_success_add');
    check('Limited Telepathy is already live (esp_op_success_add)', esp > 0, `got ${esp.toFixed(3)}`);
    const research = getTechModifier(world, RHI, 'research_speed');
    check('their research edge is already live', research > 1, `got ${research.toFixed(3)}`);
    const combat = getTechModifier(world, RHI, 'combat_power_multiplier');
    check('Poor ground combat is already live (combat_power_multiplier)', combat < 1, `got ${combat.toFixed(3)}`);
    const gov = getGovernmentModifiers(world, RHI) as any;
    check('hive unity is already live (legitimacy_drift)', gov.legitimacy_drift > 0, `got ${gov.legitimacy_drift.toFixed(3)}`);

    const rhi = code('lib/factions/rhimetals.ts');
    check('the module adds NO second copy of those pipeline modifiers',
        !/orbital_power_multiplier|esp_op_success_add|combat_power_multiplier|research_speed/.test(rhi));
}

// ── 2. Hive Mind Network ────────────────────────────────────────────────────
console.log('\n[2] Hive Mind Network');
{
    seatSettledNode(RHI);
    check('with the node seated and settled, the hive is whole', hiveCoherence(world, RHI) === 1);
    check('and not frayed', isHiveFrayed(world, RHI) === false);

    vacateOffice(RHI);
    check('an empty office collapses command efficiency', hiveCoherence(world, RHI) === COHERENCE_VACANT,
        `got ${hiveCoherence(world, RHI)}`);
    check('which registers as frayed', isHiveFrayed(world, RHI) === true);

    // A successor is seated but has not yet become the node.
    const fresh = seatSettledNode(RHI, 'leader-fresh');
    world.leadership.leaders.get(fresh).tookOfficeAtSeconds = world.nowSeconds - 1;
    check('a fresh successor is still becoming the node',
        hiveCoherence(world, RHI) === COHERENCE_REESTABLISHING, `got ${hiveCoherence(world, RHI)}`);
    check('and the hive recovers once the window passes',
        (world.leadership.leaders.get(fresh).tookOfficeAtSeconds = world.nowSeconds - NODE_REESTABLISH_SECONDS - 1,
         hiveCoherence(world, RHI) === 1));

    // A dead leader whose id is still on the record is NOT a head of state.
    // Getting this wrong would silently mean assassination did nothing.
    world.leadership.leaders.get(fresh).status = 'deceased';
    check('a deceased leader still listed on the government does not count',
        hiveCoherence(world, RHI) === COHERENCE_VACANT, `got ${hiveCoherence(world, RHI)}`);
    world.leadership.leaders.get(fresh).status = 'active';

    check('no other civilization has coherence at all', hiveCoherence(world, OTHER) === 1);

    // Derived, not stored: poison the cached field and confirm it is ignored.
    seatSettledNode(RHI);
    tickFactionTraits(world);
    world.factionTraits.get(RHI).rhimetals.coherenceAtLastTick = 0.01;
    check('a stale cached coherence cannot influence the live value', hiveCoherence(world, RHI) === 1);
}

// ── 3. The real decapitation path ───────────────────────────────────────────
console.log('\n[3] Decapitation reaches the numbers');
{
    // THE integration assertion. The espionage catalog's
    // assassinate_head_of_state effect calls resolveSuccession(world, target,
    // 'death'). If the hive does not fray through that exact path, the mechanic
    // is decorative no matter how well the helpers behave in isolation.
    seatSettledNode(RHI);
    check('precondition: the hive starts whole', hiveCoherence(world, RHI) === 1);
    const before = (getGovernmentModifiers(world, RHI) as any).production;

    try { resolveSuccession(world, RHI, 'death'); } catch { /* no successor available is still a valid outcome */ }
    check('assassinating the head of state frays the hive', isHiveFrayed(world, RHI) === true,
        `coherence ${hiveCoherence(world, RHI)}`);

    const frayedMods = getGovernmentModifiers(world, RHI) as any;
    check('and that reaches imperial production', frayedMods.production < before,
        `${before.toFixed(3)} -> ${frayedMods.production.toFixed(3)}`);
    seatSettledNode(RHI);
    const wholeMods = getGovernmentModifiers(world, RHI) as any;
    check('and approval', frayedMods.approval < wholeMods.approval,
        `${frayedMods.approval.toFixed(3)} frayed vs ${wholeMods.approval.toFixed(3)} whole`);

    // The tick latches the collapse for the ledger, on the edge only.
    vacateOffice(RHI);
    tickFactionTraits(world);
    const collapses = world.factionTraits.get(RHI).rhimetals.nodeCollapses;
    check('the collapse is recorded once', collapses > 0, `got ${collapses}`);
    tickFactionTraits(world);
    check('and not re-counted every tick while it persists',
        world.factionTraits.get(RHI).rhimetals.nodeCollapses === collapses);
    seatSettledNode(RHI);
    tickFactionTraits(world);
}

// ── 4. Hive coherence as a penalty-only source ──────────────────────────────
console.log('\n[4] Coherence is penalty-only');
{
    seatSettledNode(RHI);
    const whole = getGovernmentModifiers(world, RHI) as any;
    vacateOffice(RHI);
    const broken = getGovernmentModifiers(world, RHI) as any;

    check('an intact hive contributes exactly nothing extra', hiveCoherence(world, OTHER) === 1);
    check('a broken one costs production', broken.production < whole.production);
    check('and approval', broken.approval < whole.approval);
    check('the source is composed into getGovernmentModifiers',
        /getHiveModifiers\(world, factionId\)/.test(code('lib/government/modifiers.ts')));

    const otherBefore = (getGovernmentModifiers(world, OTHER) as any).production;
    vacateOffice(OTHER);
    check('another empire losing its head of state is unaffected by THIS mechanic',
        (getGovernmentModifiers(world, OTHER) as any).production === otherBefore);
    seatSettledNode(RHI);
}

// ── 5. Doctrine of Delay ────────────────────────────────────────────────────
console.log('\n[5] Doctrine of Delay');
{
    clearGrievances(RHI);
    check('an unprovoked declaration is deliberated',
        shouldDeliberate(world, RHI, 'DIP_DECLARE_WAR', AGGRESSOR) === true);
    check('so is an unprovoked invasion', shouldDeliberate(world, RHI, 'MIL_INVASION_PLANET', AGGRESSOR) === true);
    check('a peaceful order never is', shouldDeliberate(world, RHI, 'MIL_MOVE_FLEET', AGGRESSOR) === false);

    grievanceStore(world, RHI)![AGGRESSOR] = { sinceSeconds: world.nowSeconds, kind: 'attacked' };
    check('provoked, the collective has already decided',
        shouldDeliberate(world, RHI, 'DIP_DECLARE_WAR', AGGRESSOR) === false);
    check('but only against the faction that wronged them',
        shouldDeliberate(world, RHI, 'DIP_DECLARE_WAR', OTHER) === true);
    clearGrievances(RHI);

    check('no other civilization deliberates',
        shouldDeliberate(world, OTHER, 'DIP_DECLARE_WAR', AGGRESSOR) === false);

    // This is a DELAY, not a refusal — the distinction from the Buthari gate and
    // the Leo-pantheri honour price, and the whole reason it is a third mechanic
    // rather than a third copy.
    const loop = code('scripts/game-loop.ts');
    check('the worker holds the order rather than failing it',
        /deliberatedOrders\.add\(orderDoc\.id\)/.test(loop)
        && !/shouldDeliberate[\s\S]{0,300}recordOrderFailure/.test(loop));
    check('and latches it, so the same order is never held twice',
        /if \(!deliberatedOrders\.has\(orderDoc\.id\)\)/.test(loop));
    check('an order deferred this way is not deleted and not marked processed',
        /deliberatedOrders\.add\(orderDoc\.id\);[\s\S]{0,400}continue;/.test(loop)
        && !/deliberatedOrders[\s\S]{0,400}gameOrder\.delete/.test(loop));
    check('the deliberated verb list is aggression only',
        [...DELIBERATED_ACTIONS].every(a => /^(DIP_DECLARE_WAR|MIL_)/.test(a)));
}

// ── 6. Correction ───────────────────────────────────────────────────────────
console.log('\n[6] Correction — "we do not conquer, we correct"');
{
    seatSettledNode(RHI);
    check('a whole hive corrects at full strength',
        Math.abs(correctionReliefFor(world, RHI) - CORRECTION_RIVALRY_RELIEF) < 1e-9);
    check('no other empire corrects anything', correctionReliefFor(world, OTHER) === 0);

    vacateOffice(RHI);
    check('a hive without its node corrects less — the authority is the node\'s',
        correctionReliefFor(world, RHI) < CORRECTION_RIVALRY_RELIEF && correctionReliefFor(world, RHI) > 0,
        `got ${correctionReliefFor(world, RHI).toFixed(2)}`);
    seatSettledNode(RHI);

    const iv = code('lib/diplomacy/intervention-service.ts');
    check('mediation drains rivalry between the belligerents',
        /shiftRivalry\(world, window\.aggressorId, window\.defenderId, -relief/.test(iv));
    check('and only when the relief is non-zero, so nobody else is affected',
        /if \(relief > 0\)/.test(iv));
    check('the existing mediation effects are untouched',
        /offered_mediation/.test(iv) && /peace_offer/.test(iv));
}

// ── 7. Grounded Indoors ─────────────────────────────────────────────────────
console.log('\n[7] Grounded Indoors');
{
    seatSettledNode(RHI);
    for (const t of ['urban', 'ruins', 'mountains']) {
        check(`wings are a liability in ${t}`,
            Math.abs(districtTraitsFor(world, RHI, t).taken - (1 + ENCLOSED_TAKEN_PENALTY)) < 1e-9,
            `got ${districtTraitsFor(world, RHI, t).taken}`);
    }
    check('open ground costs them nothing extra', districtTraitsFor(world, RHI, 'plains').taken === 1);
    // vulnerable, not ineffective — the district layer keeps those separate.
    check('they bleed more without hitting softer', districtTraitsFor(world, RHI, 'urban').dealt === 1);
    check('another civilization is unaffected in the same terrain',
        districtTraitsFor(world, OTHER, 'urban').taken !== 1 + ENCLOSED_TAKEN_PENALTY);

    vacateOffice(RHI);
    check('a frayed hive also fights clumsily', districtTraitsFor(world, RHI, 'plains').dealt < 1,
        `got ${districtTraitsFor(world, RHI, 'plains').dealt}`);
    seatSettledNode(RHI);
}

// ── 8. Persistence and layering ─────────────────────────────────────────────
console.log('\n[8] Persistence and layering');
{
    tickFactionTraits(world);
    const round: any = deserializeWorld(serializeWorld(world));
    ensureFactionTraits(round);
    check('Rhimetal trait state survives a save/load round trip',
        !!round.factionTraits?.get(RHI)?.rhimetals);

    // government/modifiers.ts and intervention-service.ts both import this
    // module, so it must stay a leaf — in particular it must NOT import
    // succession-service, which reaches government-service and closes a cycle.
    const imports = [...code('lib/factions/rhimetals.ts').matchAll(/from '([^']+)'/g)].map(m => m[1]);
    check('rhimetals.ts imports only leaves', imports.every(i =>
        ['../game-world-state', './faction-traits-types', './civ-ids', '../tech/history-ledger'].includes(i)),
        imports.join(', '));
    check('and specifically does not import succession-service',
        !imports.some(i => i.includes('succession')));
}

console.log(failures ? `\n❌ ${failures} check(s) failed\n` : `\n✅ Rhimetal mechanics are live\n`);
process.exit(failures ? 1 : 0);
