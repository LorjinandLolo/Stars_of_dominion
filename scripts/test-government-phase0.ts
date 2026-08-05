// scripts/test-government-phase0.ts
// Smoke test for Government & Leadership Phase 0 (foundation).
// Run: npx tsx scripts/test-government-phase0.ts

import assert from 'assert';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { ensureEmpirePostures } from '../lib/politics/posture-bootstrap';
import { initRegistries, blocRegistry } from '../lib/politics/registry';
import { tickBlocDrift } from '../lib/politics/politics-service';
import { computeActionSupport } from '../lib/politics/support-service';
import {
    ensureGovernments,
    tickGovernments,
    getGovernment,
    recomputeApproval,
    spendPoliticalCapital,
    getFactionStability,
} from '../lib/government/government-service';
import { serializeWorld, deserializeWorld } from '../lib/persistence/save-service';

const TICK = 6 * 60 * 60;

function main() {
    initRegistries();
    const blocDefs = blocRegistry.getAll();
    console.log(`[1] bloc registry: ${blocDefs.length} definitions — ${blocDefs.map(b => b.id).join(', ')}`);
    assert.ok(blocDefs.length >= 9, 'expected at least 9 bloc definitions');

    const world = getGameWorldState();
    ensureEmpirePostures(world);
    ensureGovernments(world);

    const factionIds = [...world.economy.factions.keys()];
    assert.ok(factionIds.length > 0, 'no economy factions to test against');
    const factionId = factionIds[0];

    // ── Bloc roster ──────────────────────────────────────────────────────────
    const posture = world.movement.empirePostures.get(factionId)!;
    const influenceTotal = posture.blocs.reduce((s, b) => s + b.influence, 0);
    console.log(`[2] ${factionId}: ${posture.blocs.length} blocs, influence total ${influenceTotal.toFixed(1)}`);
    assert.strictEqual(posture.blocs.length, blocDefs.length, 'posture missing bloc definitions');
    assert.ok(Math.abs(influenceTotal - 100) < 0.01, 'seeded influence must sum to 100');

    // ── Migration: an old 4-bloc posture gains the new interest groups ───────
    posture.blocs = posture.blocs.filter(b => ['military', 'trade', 'frontier', 'science'].includes(b.id));
    posture.blocs.find(b => b.id === 'military')!.satisfaction = 12; // must survive migration
    ensureEmpirePostures(world);
    const migrated = world.movement.empirePostures.get(factionId)!;
    const migratedTotal = migrated.blocs.reduce((s, b) => s + b.influence, 0);
    console.log(`[3] after migration: ${migrated.blocs.length} blocs, influence total ${migratedTotal.toFixed(1)}, military satisfaction ${migrated.blocs.find(b => b.id === 'military')!.satisfaction}`);
    assert.strictEqual(migrated.blocs.length, blocDefs.length, 'migration did not add missing blocs');
    assert.ok(Math.abs(migratedTotal - 100) < 0.01, 'influence must renormalize to 100');
    assert.strictEqual(migrated.blocs.find(b => b.id === 'military')!.satisfaction, 12, 'migration clobbered existing satisfaction');

    // ── Generic drift moves the new blocs ────────────────────────────────────
    const workers = migrated.blocs.find(b => b.id === 'workers')!;
    assert.ok(workers.ideologyAffinity, 'bloc definition data not copied onto the bloc');
    world.shared.commodityAccess = 0.2;   // shortages
    world.shared.warFatigue = 80;          // and a long war
    const before = workers.satisfaction;
    tickBlocDrift(factionId, world, TICK * 4);
    console.log(`[4] workers satisfaction under scarcity + war fatigue: ${before} -> ${workers.satisfaction.toFixed(2)}`);
    assert.ok(workers.satisfaction < before, 'workers should sour under scarcity and war fatigue');

    // ── Support meter accounts for the new blocs ─────────────────────────────
    const support = computeActionSupport(migrated.blocs, 'declare_war', {
        warFatigue: world.shared.warFatigue,
        rivalryScore: 20,
        publicTrust: 60,
    });
    console.log(`[5] declare_war support: ${support.total}% (${support.band}) across ${support.blocs.length} blocs`);
    assert.strictEqual(support.blocs.length, migrated.blocs.length, 'support meter dropped blocs');

    // ── Government state ─────────────────────────────────────────────────────
    const gov = getGovernment(world, factionId)!;
    assert.ok(gov, 'government not seeded');
    console.log(`[6] ${gov.institutionName}: approval ${gov.approval.toFixed(1)}, legitimacy ${gov.legitimacy}, PC ${gov.politicalCapital}, senate ${gov.senatePower}/exec ${gov.executivePower}`);
    assert.strictEqual(gov.politicalCapital, 0, 'political capital should start empty');

    tickGovernments(world, TICK * 4); // one in-game day
    console.log(`[7] after 1 day: approval ${gov.approval.toFixed(1)}, legitimacy ${gov.legitimacy.toFixed(1)}, PC ${gov.politicalCapital.toFixed(2)}, stability mirror ${gov.stability.toFixed(1)}`);
    assert.ok(gov.politicalCapital > 0, 'political capital did not accrue');
    assert.strictEqual(gov.approval, recomputeApproval(world, factionId), 'approval not derived from live state');
    assert.strictEqual(getFactionStability(world, factionId), gov.stability, 'stability helper disagrees with the mirror');

    // ── Spending ─────────────────────────────────────────────────────────────
    const pool = gov.politicalCapital;
    assert.strictEqual(spendPoliticalCapital(world, factionId, pool + 10, 'unaffordable'), false, 'overspend should be refused');
    assert.strictEqual(gov.politicalCapital, pool, 'refused spend must not deduct');
    assert.strictEqual(spendPoliticalCapital(world, factionId, pool, 'affordable'), true, 'affordable spend refused');
    console.log(`[8] spend gating ok — PC now ${gov.politicalCapital.toFixed(2)}, ${gov.history.length} history entries`);

    // ── Persistence round-trip ───────────────────────────────────────────────
    const restored = deserializeWorld(serializeWorld(world));
    const restoredGov = getGovernment(restored, factionId);
    assert.ok(restoredGov, 'government lost in snapshot round-trip');
    assert.strictEqual(restoredGov!.institutionName, gov.institutionName, 'government fields lost in round-trip');
    const restoredBlocs = restored.movement.empirePostures.get(factionId)!.blocs;
    assert.strictEqual(restoredBlocs.length, blocDefs.length, 'blocs lost in round-trip');
    assert.ok(restoredBlocs.find(b => b.id === 'workers')!.signals, 'bloc signal data lost in round-trip');
    console.log('[9] snapshot round-trip ok');

    // ── Backfill: a pre-Phase-0 snapshot has no government map at all ────────
    const legacy: any = JSON.parse(serializeWorld(world));
    delete legacy.government;
    const backfilled = deserializeWorld(JSON.stringify(legacy));
    assert.ok(backfilled.government instanceof Map, 'backfill did not restore the government map');
    assert.strictEqual(backfilled.government.size, 0, 'backfilled map should start empty');
    ensureGovernments(backfilled);
    assert.ok(getGovernment(backfilled, factionId), 'ensureGovernments did not reseed after backfill');
    console.log('[10] pre-Phase-0 snapshot backfill ok');

    console.log('\nPASS — Government Phase 0 foundation live.');
}

main();
