/**
 * scripts/test-tech-phase1.ts
 *
 * Tech migration Phase 1 — unlockFlags become consumable.
 *
 * Before this phase the 34 unlockFlags authored across the five trees had zero
 * readers, and three capability gates tested hardcoded tech ids instead — two of
 * which ('dip_sha_1', 'eco_tra_1') exist in no tree at all, so those gates could
 * never open.
 *
 * Asserts:
 *   1. hasTechFlag / techIdsHaveFlag resolve flags off researched techs
 *   2. the flag set is cached but still reflects a later unlock
 *   3. the shadow-economy espionage gate opens on ENABLE_SHADOW_ECONOMY
 *   4. the charter gates open on ENABLE_CORPORATE_CHARTERS
 *   5. flags survive the real research path (assignResearch -> applyUnlock)
 *
 * Run: npx tsx scripts/test-tech-phase1.ts
 */
import { TechEngine, registry, applyUnlock } from '../lib/tech/engine';
import { hasTechFlag, techIdsHaveFlag, getTechFlags } from '../lib/tech/flags';
import { launchOperation } from '../lib/espionage/espionage-service';
import { charterCorporation } from '../lib/economy/corporate/charter-service';
import { foundCompany } from '../lib/economy/corporate/company-service';

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
    if (cond) console.log(`  PASS  ${label}`);
    else { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

const BOMBARD = 'mil_t1_7';   // grants ENABLE_ORBITAL_BOMBARDMENT
const CHARTER = 'eco_t1_2';   // grants ENABLE_CORPORATE_CHARTERS
const BLACKMKT = 'eco_t3_6';  // grants ENABLE_SHADOW_ECONOMY

function main() {
    // ── 1. Flags authored on the techs we gate against ──────────────────────
    console.log('\n[1] flags declared on the granting techs');
    check('mil_t1_7 grants ENABLE_ORBITAL_BOMBARDMENT',
        !!registry.get(BOMBARD)?.unlockFlags?.includes('ENABLE_ORBITAL_BOMBARDMENT'));
    check('eco_t1_2 grants ENABLE_CORPORATE_CHARTERS',
        !!registry.get(CHARTER)?.unlockFlags?.includes('ENABLE_CORPORATE_CHARTERS'));
    check('eco_t3_6 grants ENABLE_SHADOW_ECONOMY',
        !!registry.get(BLACKMKT)?.unlockFlags?.includes('ENABLE_SHADOW_ECONOMY'));

    // ── 2. Resolution and caching ───────────────────────────────────────────
    console.log('\n[2] hasTechFlag resolution and cache coherence');
    const world: any = { tech: new Map() };
    const F = 'flags-faction';
    const state = TechEngine.initPlayerState(F);
    world.tech.set(F, state);

    check('no flags before any research', getTechFlags(world, F).size === 0);
    check('gate closed before research', !hasTechFlag(world, F, 'ENABLE_ORBITAL_BOMBARDMENT'));

    applyUnlock(state, BOMBARD);
    check('gate opens after unlock', hasTechFlag(world, F, 'ENABLE_ORBITAL_BOMBARDMENT'));
    check('unrelated flag stays closed', !hasTechFlag(world, F, 'ENABLE_SHADOW_ECONOMY'));

    // Second unlock must be visible despite the first lookup having been cached.
    applyUnlock(state, BLACKMKT);
    check('cache reflects a later unlock', hasTechFlag(world, F, 'ENABLE_SHADOW_ECONOMY'));
    check('earlier flag still held', hasTechFlag(world, F, 'ENABLE_ORBITAL_BOMBARDMENT'));

    check('techIdsHaveFlag agrees with hasTechFlag',
        techIdsHaveFlag(state.unlockedTechIds, 'ENABLE_SHADOW_ECONOMY'));
    check('unknown faction has no flags', !hasTechFlag(world, 'nobody', 'ENABLE_ORBITAL_BOMBARDMENT'));

    // ── 3. Espionage shadow-economy gate ────────────────────────────────────
    console.log('\n[3] espionage shadowEconomy gate (was permanently shut)');
    const espWorld: any = {
        nowSeconds: 0,
        espionage: { operations: new Map(), regionEscalation: new Map(), agents: new Map() },
    };
    const denied = launchOperation('a', 'b', 'sys-1', 'shadowEconomy', 0.5, 0.3, espWorld, new Set());
    check('refused without the tech', denied.success === false, denied.message);
    const allowed = launchOperation('a', 'b', 'sys-1', 'shadowEconomy', 0.5, 0.3, espWorld,
        new Set([BLACKMKT]));
    check('allowed with Black Market Operations', allowed.success === true, allowed.message);
    const oldGateStillWorks = launchOperation('a', 'b', 'sys-1', 'shadowEconomy', 0.5, 0.3, espWorld,
        new Set(['dip_sha_1']));
    check('the dead id no longer opens the gate', oldGateStillWorks.success === false);

    // ── 4. Charter gates ────────────────────────────────────────────────────
    console.log('\n[4] corporate charter gates');
    const factionState: any = { factionId: 'c', companies: [], portfolio: [] };
    let threw = false;
    try {
        foundCompany('Testco', 'c', 'sys-1', factionState, [], 0, new Set());
    } catch { threw = true; }
    check('foundCompany refused without the tech', threw);

    threw = false;
    try {
        foundCompany('Testco', 'c', 'sys-1', factionState, [], 0, new Set([CHARTER]));
    } catch (e: any) {
        // Any failure here must not be the tech gate.
        threw = /technology/i.test(String(e?.message));
    }
    check('foundCompany passes the tech gate with it', !threw);

    threw = false;
    try {
        charterCorporation({
            baseName: 'Testco', foundingFactionId: 'c', headquartersSystemId: 'sys-1',
            terms: {} as any, foundingCapital: 100_000, nowSeconds: 0,
            unlockedTechIds: new Set(),
        }, factionState);
    } catch (e: any) {
        threw = /technology/i.test(String(e?.message));
    }
    check('charterCorporation refused without the tech', threw);

    threw = false;
    try {
        charterCorporation({
            baseName: 'Testco', foundingFactionId: 'c', headquartersSystemId: 'sys-1',
            terms: {} as any, foundingCapital: 100_000, nowSeconds: 0,
            unlockedTechIds: new Set([CHARTER]),
        }, factionState);
    } catch (e: any) {
        threw = /technology/i.test(String(e?.message));
    }
    check('charterCorporation passes the tech gate with it', !threw);

    // ── 5. Flags via the real research path ─────────────────────────────────
    console.log('\n[5] flags arrive through ordinary research');
    const R = 'research-faction';
    const rWorld: any = { tech: new Map() };
    let rState = TechEngine.initPlayerState(R);
    rState = TechEngine.assignResearch(rState, 'slot-1', BOMBARD, 0);
    rWorld.tech.set(R, rState);
    check('flag absent while still researching', !hasTechFlag(rWorld, R, 'ENABLE_ORBITAL_BOMBARDMENT'));
    applyUnlock(rState, BOMBARD); // what step4_research now calls on completion
    check('flag present once research completes', hasTechFlag(rWorld, R, 'ENABLE_ORBITAL_BOMBARDMENT'));

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main();
