/**
 * scripts/test-tech-phase4.ts
 *
 * Tech migration Phase 4 — emergent technology.
 *
 * Conduct is a research programme: an empire that has run enough covert work has
 * in practice developed a sabotage doctrine. The History Ledger records what a
 * faction did; EMERGENT_TRIGGERS turn that into revealed (discounted) research.
 *
 * Asserts:
 *   1. ledger counters, gauges and streaks behave
 *   2. triggers fire once at their threshold and record a 50% discount
 *   3. a revealed tech actually researches at half the tick cost
 *   4. the discount deepens at the grant multiple, and reveals stay idempotent
 *   5. reveals are suppressed for already-unlocked and mutex-locked techs
 *   6. gauges recomputed from real world state drive a reveal
 *   7. the ledger survives a serialize/deserialize round trip
 *   8. catalog reveals never remove the normal research path
 *
 * Run: npx tsx scripts/test-tech-phase4.ts
 */
import { TechEngine, applyUnlock, registry, ticksForTech } from '../lib/tech/engine';
import { bumpMetric, getMetric, getLedger, updateStreak, setGauge } from '../lib/tech/history-ledger';
import { EMERGENT_TRIGGERS, REVEAL_DISCOUNT, DEEP_DISCOUNT } from '../lib/tech/emergent-catalog';
import { refreshLedgerGauges, evaluateEmergentTriggers } from '../lib/tech/emergent-service';
import { validateTechUnlocks } from '../lib/tech/validation';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
    if (cond) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

function makeWorld(factionId: string) {
    const state = TechEngine.initPlayerState(factionId);
    const world: any = { tech: new Map([[factionId, state]]), techHistory: new Map() };
    return { world, state };
}

function main() {
    // ── 1. Ledger mechanics ─────────────────────────────────────────────────
    console.log('\n[1] History Ledger');
    const { world: w1 } = makeWorld('f1');
    check('unknown metric reads 0', getMetric(w1, 'f1', 'esp.opsLaunched') === 0);
    bumpMetric(w1, 'f1', 'esp.opsLaunched');
    bumpMetric(w1, 'f1', 'esp.opsLaunched', 3);
    check('counter accumulates to 4', getMetric(w1, 'f1', 'esp.opsLaunched') === 4);
    setGauge(w1, 'f1', 'trade.activeRoutes', 7);
    check('gauge readable by the same accessor', getMetric(w1, 'f1', 'trade.activeRoutes') === 7);
    check('streak advances while held', updateStreak(w1, 'f1', 's', true) === 1 && updateStreak(w1, 'f1', 's', true) === 2);
    check('streak resets when it lapses', updateStreak(w1, 'f1', 's', false) === 0);
    check('ledger auto-creates without techHistory',
        (() => { const bare: any = { tech: new Map() }; bumpMetric(bare, 'x', 'm'); return getMetric(bare, 'x', 'm') === 1; })());

    // ── 2. Trigger fires at threshold ───────────────────────────────────────
    console.log('\n[2] reveal at the threshold');
    const trigger = EMERGENT_TRIGGERS.find(t => t.id === 'sabotage_cells.reveal')!;
    const threshold = trigger.all[0].gte!;
    const { world: w2, state: s2 } = makeWorld('f2');

    bumpMetric(w2, 'f2', 'esp.opsLaunched', threshold - 1);
    check('nothing fires below the threshold', evaluateEmergentTriggers(w2).length === 0);

    bumpMetric(w2, 'f2', 'esp.opsLaunched', 1);
    const fired = evaluateEmergentTriggers(w2);
    check('one reveal at the threshold', fired.length === 1, `got ${fired.length}`);
    check('reveal names the right tech', fired[0]?.techId === trigger.techId);
    check('reveal is not a grant', fired[0]?.granted === false);
    check('discount is 50%', fired[0]?.discount === REVEAL_DISCOUNT);
    check('tech recorded as revealed', (s2.revealedEmergentTechIds ?? []).includes(trigger.techId));
    check('not silently unlocked', !s2.unlockedTechIds.includes(trigger.techId));
    check('trigger recorded as fired', getLedger(w2, 'f2').firedTriggerIds.includes(trigger.id));
    check('re-evaluating fires nothing new', evaluateEmergentTriggers(w2).length === 0);

    // ── 3. The discount is real research time ───────────────────────────────
    console.log('\n[3] crash programme costs half, and skips the chain');
    const def = registry.get(trigger.techId)!;
    const full = ticksForTech(def);
    check('the tech does have prerequisites to waive', def.prerequisites.length > 0,
        def.prerequisites.join(', '));
    check('reveal recorded the waived prerequisites',
        (s2.emergentWaivedPrereqs?.[trigger.techId] ?? []).length === def.prerequisites.length);

    const assigned = TechEngine.assignResearch(s2, 'slot-1', trigger.techId, 0);
    const got = assigned.activeSlots[0].ticksRequired;
    check('full cost is the unrevealed baseline', full === Math.ceil(def.researchCost / 6));
    check('revealed cost is half', got === Math.ceil((def.researchCost * REVEAL_DISCOUNT) / 6),
        `full=${full} revealed=${got}`);
    check('revealed research is strictly faster', got < full, `full=${full} revealed=${got}`);

    // Without the reveal the same tech is still walled behind its chain.
    const { state: sNoReveal } = makeWorld('f3b');
    let blocked = false;
    try { TechEngine.assignResearch(sNoReveal, 'slot-1', trigger.techId, 0); }
    catch (e: any) { blocked = /prerequisite/i.test(String(e?.message)); }
    check('unrevealed tech still needs its prerequisites', blocked);

    // ── 4. Deepening at the grant multiple ──────────────────────────────────
    console.log('\n[4] discount deepens as conduct continues');
    const { world: w4, state: s4 } = makeWorld('f4');
    bumpMetric(w4, 'f4', 'esp.opsLaunched', threshold);
    evaluateEmergentTriggers(w4);
    check('starts at 50%', s4.emergentDiscounts?.[trigger.techId] === REVEAL_DISCOUNT);

    bumpMetric(w4, 'f4', 'esp.opsLaunched', threshold);  // now at 2x
    const deepened = evaluateEmergentTriggers(w4);
    check('a second event fires on deepening', deepened.length === 1, `got ${deepened.length}`);
    check('discount deepens to 25%', s4.emergentDiscounts?.[trigger.techId] === DEEP_DISCOUNT,
        `got ${s4.emergentDiscounts?.[trigger.techId]}`);
    check('catalog tech is still not granted outright', !s4.unlockedTechIds.includes(trigger.techId));
    check('no duplicate entry in revealed list',
        (s4.revealedEmergentTechIds ?? []).filter(id => id === trigger.techId).length === 1);
    check('further evaluation is stable', evaluateEmergentTriggers(w4).length === 0);

    // ── 5. Suppression ──────────────────────────────────────────────────────
    console.log('\n[5] reveals suppressed when meaningless');
    const { world: w5a, state: s5a } = makeWorld('f5a');
    applyUnlock(s5a, trigger.techId);
    bumpMetric(w5a, 'f5a', 'esp.opsLaunched', threshold * 5);
    check('already-researched tech is not revealed', evaluateEmergentTriggers(w5a).length === 0);

    const { world: w5b, state: s5b } = makeWorld('f5b');
    s5b.lockedTechIds.push(trigger.techId);
    bumpMetric(w5b, 'f5b', 'esp.opsLaunched', threshold * 5);
    check('mutex-locked tech is not revealed', evaluateEmergentTriggers(w5b).length === 0);
    check('locked tech never entered the revealed list',
        !(s5b.revealedEmergentTechIds ?? []).includes(trigger.techId));

    // ── 6. Gauges from real world state ─────────────────────────────────────
    console.log('\n[6] gauges recomputed from the world');
    const { world: w6, state: s6 } = makeWorld('f6');
    w6.corporate = {
        factionStates: new Map([['f6', { factionId: 'f6', charteredCompanyIds: ['a', 'b', 'c'] }]]),
    };
    w6.economy = {
        factions: new Map([['f6', {}]]),
        tradeAgreements: new Map([['ag1', { id: 'ag1', aFactionId: 'f6', bFactionId: 'rival' }]]),
        tradeRoutes: new Map([['r1', { id: 'r1', agreementId: 'ag1' }]]),
    };
    refreshLedgerGauges(w6);
    check('charter gauge counts the faction\'s companies', getMetric(w6, 'f6', 'corp.activeCharters') === 3,
        `got ${getMetric(w6, 'f6', 'corp.activeCharters')}`);
    check('route gauge attributes through the agreement', getMetric(w6, 'f6', 'trade.activeRoutes') === 1);
    check('partner count derived', getMetric(w6, 'f6', 'trade.partnerCount') === 1);

    const charterReveal = evaluateEmergentTriggers(w6);
    check('the charter gauge drives a reveal', charterReveal.some(r => r.techId === 'eco_t2_trd_4'),
        charterReveal.map(r => r.techId).join(', '));
    check('reveal recorded on the tech state', (s6.revealedEmergentTechIds ?? []).includes('eco_t2_trd_4'));

    check('gauges tolerate a bare world',
        (() => { try { refreshLedgerGauges({ tech: new Map() }); return true; } catch { return false; } })());

    // ── 7. Persistence ──────────────────────────────────────────────────────
    console.log('\n[7] ledger survives the save round trip');
    const round = deserializeWorld(serializeWorld(w2 as any)) as any;
    check('techHistory is a Map again', round.techHistory instanceof Map);
    check('counters survive', getMetric(round, 'f2', 'esp.opsLaunched') === threshold,
        `got ${getMetric(round, 'f2', 'esp.opsLaunched')}`);
    check('firedTriggerIds survive', round.techHistory.get('f2')?.firedTriggerIds?.includes(trigger.id));
    check('revealed techs survive on the tech state',
        (round.tech.get('f2')?.revealedEmergentTechIds ?? []).includes(trigger.techId));
    check('no reveal re-fires after a reload', evaluateEmergentTriggers(round).length === 0);

    // ── 8. Catalog reveals do not remove the normal path ────────────────────
    console.log('\n[8] a reveal is a bonus, never a gate');
    const { state: s8 } = makeWorld('f8');
    let threw = false;
    // A catalog tech with no prerequisites must stay assignable with no reveal
    // at all — a reveal may only ever add, never gate.
    try { TechEngine.assignResearch(s8, 'slot-1', 'eco_t1_1', 0); } catch { threw = true; }
    check('an unrevealed catalog tech is still researchable', !threw);
    let emgThrew = false;
    try { TechEngine.assignResearch(s8, 'slot-1', 'emg_not_yet_earned', 0); } catch { emgThrew = true; }
    check('a dedicated emg_ tech is refused without a reveal', emgThrew);
    check('data consistency still clean', validateTechUnlocks().length === 0,
        validateTechUnlocks().map(i => i.detail).join(' | '));

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
