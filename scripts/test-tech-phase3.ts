/**
 * scripts/test-tech-phase3.ts
 *
 * Tech migration Phase 3 — UNLOCK_ACTION / UNLOCK_BUILDING, and 3b research slots.
 *
 * UNLOCK_ACTION and UNLOCK_BUILDING effects were pushed onto activeEffects and
 * read by nothing. UNLOCK_RESEARCH_SLOT was never handled at all, so maxSlots
 * stayed 1 for the whole game. Several ids referenced things that did not exist
 * ('mil_plt_1' gating two buildings, 'listening_post' naming none).
 *
 * Asserts:
 *   1. the tech data passes every consistency check
 *   2. order gates open on UNLOCK_ACTION capabilities
 *   3. flag-based and capability-based gates coexist
 *   4. the two permanently unbuildable defence buildings are reachable again
 *   5. UNLOCK_RESEARCH_SLOT grows research capacity and the new slot is usable
 *
 * Run: npx tsx scripts/test-tech-phase3.ts
 */
import { TechEngine, applyUnlock, registry } from '../lib/tech/engine';
import { hasUnlockedAction, actionsForTechIds } from '../lib/tech/flags';
import { checkOrderTechGate, ORDER_TECH_GATES } from '../lib/tech/order-gates';
import { validateTechUnlocks } from '../lib/tech/validation';
import { canBuildOnTile } from '../lib/construction/construction-service';
import { BUILDINGS } from '../data/buildings';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
    if (cond) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

function worldWith(factionId: string, techIds: string[]) {
    const state = TechEngine.initPlayerState(factionId);
    for (const id of techIds) applyUnlock(state, id);
    return { world: { tech: new Map([[factionId, state]]) } as any, state };
}

function main() {
    // ── 1. Data consistency ─────────────────────────────────────────────────
    console.log('\n[1] tech data consistency');
    const issues = validateTechUnlocks();
    check('no dangling unlock or gate references', issues.length === 0,
        issues.map(i => `${i.kind}: ${i.detail}`).join(' | '));

    // ── 2. Capability gates ─────────────────────────────────────────────────
    console.log('\n[2] UNLOCK_ACTION drives order gates');
    const { world: none } = worldWith('f1', []);
    const envoyClosed = checkOrderTechGate(none, 'f1', 'DIP_SEND_ENVOY');
    check('envoy refused without the tech', !envoyClosed.allowed, envoyClosed.reason);
    check('refusal names the tech', /Envoy Deployment/.test(envoyClosed.reason ?? ''));

    const { world: envoy } = worldWith('f2', ['dip_t1_5']);
    check('envoy allowed after research', checkOrderTechGate(envoy, 'f2', 'DIP_SEND_ENVOY').allowed);
    check('hasUnlockedAction sees the capability', hasUnlockedAction(envoy, 'f2', 'deploy_envoy'));
    check('unrelated capability still absent', !hasUnlockedAction(envoy, 'f2', 'sabotage_infrastructure'));

    // One tech opening two orders (both agent orders ride 'deploy_spy').
    const { world: spy } = worldWith('f3', ['esp_t1_5']);
    check('recruit agent allowed', checkOrderTechGate(spy, 'f3', 'ESP_RECRUIT_AGENT').allowed);
    check('assign agent allowed by the same tech', checkOrderTechGate(spy, 'f3', 'ESP_ASSIGN_AGENT').allowed);
    check('sabotage still gated', !checkOrderTechGate(spy, 'f3', 'ESP_SABOTAGE_FACILITY').allowed);

    // ── 3. Both gate kinds ──────────────────────────────────────────────────
    console.log('\n[3] flag gates and capability gates coexist');
    const { world: bomb } = worldWith('f4', ['mil_t1_7']);
    check('flag gate opens', checkOrderTechGate(bomb, 'f4', 'MIL_BOMBARD_PLANET').allowed);
    check('capability gate unaffected by the flag tech',
        !checkOrderTechGate(bomb, 'f4', 'DIP_SEND_ENVOY').allowed);
    check('ungated orders always pass', checkOrderTechGate(none, 'f1', 'MIL_MOVE_FLEET').allowed);
    check('gate table covers both kinds',
        Object.values(ORDER_TECH_GATES).some(g => g.flag) &&
        Object.values(ORDER_TECH_GATES).some(g => g.capability));

    // ── 4. Buildings reachable again ────────────────────────────────────────
    console.log('\n[4] defence buildings unbuildable since forever');
    const tile: any = { tileId: 't1', constructionState: 'empty', districtType: 'any' };
    const planet: any = { ownerId: 'f5', tiles: [tile], infrastructure: {}, buildQueue: [], buildings: [] };

    for (const id of ['orbital_defense_platform', 'shield_generator']) {
        const def = BUILDINGS.find(b => b.id === id)!;
        check(`${id} requires a tech that exists`, !!registry.get(def.techRequired!),
            `techRequired=${def.techRequired}`);
        const wallet = { metals: 1e6, chemicals: 1e6, food: 1e6, manpower: 1e6 };
        const denied = canBuildOnTile(planet, tile, def, wallet, new Set());
        check(`${id} refused without the tech`, !denied.canBuild, denied.reason);
        const ok = canBuildOnTile(planet, tile, def, wallet, new Set([def.techRequired!]));
        check(`${id} passes its tech check with mil_t1_8`,
            ok.canBuild || !/Technology/.test(ok.reason ?? ''), ok.reason);
    }

    // ── 5. Research slot growth ─────────────────────────────────────────────
    console.log('\n[5] UNLOCK_RESEARCH_SLOT (maxSlots was 1 forever)');
    const { state } = worldWith('f6', []);
    check('starts with one slot', state.maxSlots === 1 && state.activeSlots.length === 1,
        `maxSlots=${state.maxSlots} slots=${state.activeSlots.length}`);

    applyUnlock(state, 'inf_t2_spc_2');
    check('maxSlots grows to 2', state.maxSlots === 2, `got ${state.maxSlots}`);
    check('a second slot object exists', state.activeSlots.length === 2);
    check('the new slot is empty and assignable',
        state.activeSlots[1].status === 'empty' && state.activeSlots[1].techId === null);
    check('slot ids are unique',
        new Set(state.activeSlots.map(s => s.slotId)).size === state.activeSlots.length,
        state.activeSlots.map(s => s.slotId).join(', '));

    // Both slots can hold concurrent research.
    let s = TechEngine.assignResearch(state, state.activeSlots[0].slotId, 'eco_t1_1', 0);
    s = TechEngine.assignResearch(s, s.activeSlots[1].slotId, 'mil_t1_1', 0);
    check('two techs research in parallel',
        s.activeSlots[0].techId === 'eco_t1_1' && s.activeSlots[1].techId === 'mil_t1_1');

    check('re-unlocking does not duplicate slots',
        (() => { applyUnlock(state, 'inf_t2_spc_2'); return state.maxSlots === 2 && state.activeSlots.length === 2; })(),
        `maxSlots=${state.maxSlots} slots=${state.activeSlots.length}`);

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
